import { readFileSync } from "node:fs";
import {
  encodeDeployData,
  encodeFunctionData,
  getContractAddress,
  keccak256,
  type Hex,
  parseAbi,
  parseTransaction,
  serializeTransaction,
  toHex,
} from "viem";
import { publicClient, wallets, iso } from "./config";
import { save } from "./store";
export const artifact = () =>
  JSON.parse(
    readFileSync("out/PostAndPaidEscrow.sol/PostAndPaidEscrow.json", "utf8"),
  );
export const escrowAbi = parseAbi([
  "function state() view returns(uint8)",
  "function requestHash() view returns(bytes32)",
  "function fundedAt() view returns(uint256)",
  "function payout() view returns(uint256)",
  "function submitResponse(uint256 timestamp,bytes data,bytes signature)",
  "function refund()",
  "event CreatorPaid(address indexed creator,uint256 amount,uint256 snapshotTimestamp,bytes32 dataHash)",
  "event AgreementFunded(address indexed brand,address indexed creator,uint256 amount,bytes32 requestHash)",
]);
export async function chainState(address: Hex) {
  return Number(
    await publicClient.readContract({
      address,
      abi: escrowAbi,
      functionName: "state",
    }),
  );
}
const GAS_ORACLE = "0x420000000000000000000000000000000000000F" as const;
const gasOracleAbi = parseAbi([
  "function getL1Fee(bytes transaction) view returns(uint256)",
  "function getL1FeeUpperBound(uint256 unsignedTxSize) view returns(uint256)",
  "function getOperatorFee(uint256 gasUsed) view returns(uint256)",
]);
const feeScope =
  "Application preflight budget: signed L2 execution maximum plus twice the current L1 data and operator fee quotes. L1/operator pricing can change before inclusion; this is not an on-chain total-fee cap.";
function quantity(value: unknown): bigint | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    return undefined;
  }
}
// GasPriceOracle expects unsigned transaction bytes and accounts for the signature itself.
// Official OP specification: https://specs.optimism.io/protocol/fjord/predeploys.html
async function estimatedFees(transaction: any, cap: bigint) {
  const unsigned = { ...transaction };
  delete unsigned.r;
  delete unsigned.s;
  delete unsigned.v;
  delete unsigned.yParity;
  const serialized = serializeTransaction(unsigned as any);
  const gas = BigInt(transaction.gas || 0),
    price = BigInt(transaction.maxFeePerGas ?? transaction.gasPrice ?? 0);
  if (gas <= 0n || price <= 0n || cap <= 0n)
    throw new Error(
      "A positive gas limit, fee quote and mandate budget are required.",
    );
  const [l1Result, upperResult, operatorResult] = await Promise.allSettled([
    publicClient.readContract({
      address: GAS_ORACLE,
      abi: gasOracleAbi,
      functionName: "getL1Fee",
      args: [serialized],
    }),
    publicClient.readContract({
      address: GAS_ORACLE,
      abi: gasOracleAbi,
      functionName: "getL1FeeUpperBound",
      args: [BigInt((serialized.length - 2) / 2)],
    }),
    publicClient.readContract({
      address: GAS_ORACLE,
      abi: gasOracleAbi,
      functionName: "getOperatorFee",
      args: [gas],
    }),
  ]);
  if (l1Result.status !== "fulfilled")
    throw new Error(
      "Cannot quote the Base L1 data fee; transaction was not broadcast.",
    );
  if (operatorResult.status !== "fulfilled")
    throw new Error(
      "Cannot quote the Base operator fee; transaction was not broadcast.",
    );
  const l1Quote = l1Result.value,
    operatorQuote = operatorResult.value;
  const l1Upper =
    upperResult.status === "fulfilled" && upperResult.value > l1Quote
      ? upperResult.value
      : l1Quote;
  const executionMax = gas * price,
    l1Buffered = l1Upper * 2n,
    operatorBuffered = operatorQuote * 2n;
  const total = executionMax + l1Buffered + operatorBuffered;
  if (total > cap)
    throw new Error(
      "Transaction execution plus buffered L1/operator fees exceed the mandate gas budget.",
    );
  return {
    executionMaxFeeWei: String(executionMax),
    l1FeeEstimateWei: String(l1Quote),
    l1FeeUpperBoundWei: String(l1Upper),
    l1FeeBufferedWei: String(l1Buffered),
    operatorFeeEstimateWei: String(operatorQuote),
    operatorFeeBufferedWei: String(operatorBuffered),
    estimatedTotalFeeWei: String(total),
    maxGasWei: String(total),
    gasCapWei: String(cap),
    gasScope: feeScope,
    feeQuoteAt: iso(),
  };
}
// Reads the unformatted OP receipt so newer operator-fee fields are not discarded by a formatter.
// Nonzero operator parameters are described in the Isthmus receipt specification:
// https://specs.optimism.io/protocol/isthmus/exec-engine.html#receipts
export async function receiptFeeBreakdown(receipt: any) {
  const raw: any = await publicClient.request({
    method: "eth_getTransactionReceipt",
    params: [receipt.transactionHash],
  });
  if (!raw)
    throw new Error(
      "Confirmed transaction receipt is unavailable for gas reconciliation.",
    );
  const execution = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
  const l1 = quantity(raw.l1Fee ?? receipt.l1Fee);
  if (l1 === undefined)
    throw new Error(
      "Base receipt omits its L1 data fee; total gas accounting remains unresolved. Do not rebroadcast.",
    );
  let operator = quantity(raw.operatorFee),
    operatorSource = "receipt";
  if (operator === undefined) {
    const scalar = quantity(raw.operatorFeeScalar),
      constant = quantity(raw.operatorFeeConstant);
    if ((scalar ?? 0n) === 0n && (constant ?? 0n) === 0n) {
      operator = 0n;
      operatorSource = "receipt-zero-parameters";
    } else {
      // The historical oracle handles both Isthmus and Jovian formulas at this block.
      operator = await publicClient.readContract({
        address: GAS_ORACLE,
        abi: gasOracleAbi,
        functionName: "getOperatorFee",
        args: [BigInt(receipt.gasUsed)],
        blockNumber: BigInt(receipt.blockNumber),
      });
      operatorSource = "oracle-at-receipt-block";
    }
  }
  return {
    executionFeeWei: String(execution),
    l1FeeWei: String(l1),
    operatorFeeWei: String(operator),
    operatorFeeSource: operatorSource,
    gasCostWei: String(execution + l1 + operator),
    gasAccountingComplete: true,
  };
}
// Sign and durably store the exact transaction before broadcasting. A restart reuses its hash/nonce.
export async function sendDurable(
  state: any,
  key: string,
  role: "deployer" | "buyer",
  tx: { to?: Hex; data: Hex; value?: bigint; gas?: bigint },
  gasLimitWei: bigint,
  allowRevert = false,
) {
  state.transactions ||= {};
  let record = state.transactions[key];
  const actor = wallets()[role];
  if (!record) {
    if ((await publicClient.getChainId()) !== 84532)
      throw new Error("Wrong RPC network");
    const prepared = await actor.client.prepareTransactionRequest({
      ...tx,
      account: actor.account,
      chain: publicClient.chain,
    });
    const fees = await estimatedFees(prepared, gasLimitWei);
    const raw = await actor.account.signTransaction(prepared as any);
    record = {
      hash: keccak256(raw),
      raw,
      status: "signed",
      nonce: prepared.nonce,
      ...fees,
      createdAt: iso(),
    };
    if (!tx.to)
      record.contractAddress = getContractAddress({
        from: actor.account.address,
        nonce: BigInt(prepared.nonce!),
      });
    state.transactions[key] = record;
    save(state);
  }
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: record.hash });
  } catch {}
  if (!receipt) {
    if ((await publicClient.getChainId()) !== 84532)
      throw new Error("Wrong RPC network");
    // Refresh external fee quotes for pending or restarted intents; never re-sign the transaction.
    Object.assign(
      record,
      await estimatedFees(parseTransaction(record.raw), gasLimitWei),
    );
    save(state);
    try {
      await publicClient.sendRawTransaction({
        serializedTransaction: record.raw,
      });
    } catch (error: any) {
      if (
        !/already known|nonce too low|already imported/.test(
          error.shortMessage || error.message,
        )
      )
        throw error;
    }
    record.status = "pending";
    save(state);
    receipt = await publicClient.waitForTransactionReceipt({
      hash: record.hash,
      confirmations: 1,
      timeout: 90000,
    });
  }
  record.status = receipt.status;
  record.blockNumber = String(receipt.blockNumber);
  record.gasUsed = String(receipt.gasUsed);
  record.effectiveGasPrice = String(receipt.effectiveGasPrice);
  save(state);
  try {
    Object.assign(record, await receiptFeeBreakdown(receipt));
    delete record.gasAccountingError;
  } catch (error: any) {
    record.gasAccountingComplete = false;
    record.executionFeeWei = String(
      receipt.gasUsed * receipt.effectiveGasPrice,
    );
    record.gasAccountingError = error.message;
    save(state);
    throw error;
  }
  // Actual fees are reconciled even for intentionally rejected test transactions.
  record.gasBudgetExceeded =
    BigInt(record.gasCostWei) > BigInt(record.gasCapWei || gasLimitWei);
  save(state);
  if (receipt.status !== "success" && !allowRevert)
    throw new Error(`Transaction reverted: ${record.hash}`);
  return { record, receipt };
}
export function deploymentData(campaign: any) {
  const a = artifact();
  return encodeDeployData({
    abi: a.abi,
    bytecode: a.bytecode.object as Hex,
    args: [
      {
        creator: campaign.creator,
        airnode: campaign.airnode,
        postId: campaign.postId,
        authorId: campaign.authorId,
        campaignCode: campaign.campaignCode,
        postedAfter: BigInt(campaign.postedAfter),
        postedBefore: BigInt(campaign.postedBefore),
        claimDeadline: BigInt(campaign.claimDeadline),
        maxResponseAge: BigInt(campaign.maxResponseAge),
      },
    ],
  });
}
export function proofData(envelope: any) {
  return encodeFunctionData({
    abi: escrowAbi,
    functionName: "submitResponse",
    args: [
      BigInt(envelope.timestamp),
      toHex(envelope.data),
      envelope.signature,
    ],
  });
}
