import { resolve } from "node:path";
import { encodeFunctionData, toHex, parseAbi } from "viem";
import {
  checkNextIntake,
  nextCurrent,
  nextPublic,
  nextEvidence,
  nextRejectionName,
} from "../server/next/app";
import {
  factoryArtifact,
  nextFactoryAbi,
  nextWallets,
} from "../server/next/config";
import { asContractTerms } from "../server/next/consent";
import { publicClient, AUSD } from "../server/config";
import { readJson, writeJson } from "../server/store";
import { sendDurable } from "../server/chain";
import { V2_LOCAL, exclusiveNext, logNext } from "../server/next/store";
let sourceRejected = false,
  sourceError = "",
  rejectionName: string | undefined;
try {
  await checkNextIntake();
} catch (e: any) {
  sourceRejected = true;
  sourceError = e.shortMessage || e.message;
  rejectionName = nextRejectionName(e);
}
const s = nextCurrent();
if (
  !sourceRejected ||
  rejectionName !== "MissingChallenge" ||
  !s.intake?.purchased ||
  !s.intake.envelope ||
  s.intake.verified ||
  s.deployment
)
  throw new Error(
    "Expected paid actual source with invalid challenge and no funding.",
  );
await exclusiveNext(async () => {
  const f = nextPublic().factory.address;
  const t = s.campaign,
    e = s.intake.envelope,
    w = nextWallets();
  const readProtected = async () => ({
    agreement: await publicClient.readContract({
      address: f,
      abi: nextFactoryAbi(),
      functionName: "agreements",
      args: [t.agreementId],
    }),
    nonceUsed: await publicClient.readContract({
      address: f,
      abi: nextFactoryAbi(),
      functionName: "usedNonce",
      args: [t.creator, t.nonce],
    }),
    factoryBalanceWei: String(await publicClient.getBalance({ address: f })),
    creatorBalanceWei: String(
      await publicClient.getBalance({ address: t.creator }),
    ),
  });
  const before = await readProtected();
  const data = encodeFunctionData({
    abi: factoryArtifact().abi,
    functionName: "fundAgreement",
    args: [
      asContractTerms(t),
      s.consent.signature,
      BigInt(e.timestamp),
      toHex(e.data),
      e.signature,
    ],
  });
  let rejected = false;
  try {
    await publicClient.call({
      account: w.executor.account.address,
      to: f,
      data,
      value: BigInt(t.feeWei),
    });
  } catch {
    rejected = true;
  }
  if (!rejected)
    throw new Error("Invalid challenge unexpectedly funded in simulation.");
  const path = resolve(V2_LOCAL, "tests", "missing-challenge-transaction.json");
  const txState: any = readJson(path) || { transactions: {} };
  const { record, r } = await sendDurable(
    txState,
    `missing-challenge-${s.consent.termsHash.slice(2)}`,
    "deployer",
    { to: f, data, value: BigInt(t.feeWei), gas: 1500000n },
    50000000000000n,
    true,
    { actor: w.executor, save: (v: any) => writeJson(path, v) },
  ).then((x) => ({ record: x.record, r: x.receipt }));
  const after = await readProtected();
  const stringify = (v: any) =>
    JSON.stringify(v, (_, value) =>
      typeof value === "bigint" ? String(value) : value,
    );
  if (
    r.status !== "reverted" ||
    stringify(before) !== stringify(after) ||
    after.nonceUsed
  )
    throw new Error("Rejected intake changed protected on-chain state.");
  const tokenAbi = parseAbi([
    "function balanceOf(address) view returns(uint256)",
  ]);
  const balance = await publicClient.readContract({
    address: AUSD,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [w.executor.account.address],
  });
  const result = {
    at: new Date().toISOString(),
    kind: "Real fresh Airnode response for historical post20 is an intentional negative input, not a new creator pilot.",
    factory: f,
    agreementId: t.agreementId,
    creator: t.creator,
    termsHash: s.consent.termsHash,
    sourceRejected,
    sourceError,
    rejectionName,
    envelope: e,
    confirmedDataReceipt: s.receipts.find((x: any) => x.kind === "data"),
    rejectedFundingTransaction: record.hash,
    revertGasWei: record.gasCostWei,
    executionFeeWei: record.executionFeeWei,
    l1FeeWei: record.l1FeeWei,
    operatorFeeWei: record.operatorFeeWei,
    before,
    after,
    remainingTestAusdUnits: String(balance),
    newEscrowFunded: false,
    creatorPayout: false,
    pilot: "PENDING",
  };
  writeJson(
    "evidence/v2/missing-challenge.json",
    JSON.parse(stringify(result)),
  );
  logNext(
    s,
    "On-chain missing-challenge rejection verified",
    "Intentional historical-post test: no child escrow, consumed consent or payout; external data fee and revert gas remain spent.",
    "rejected",
  );
  writeJson("evidence/v2/latest-intake.json", nextEvidence(s));
  console.log(
    stringify({
      sourceRejected,
      transactionHash: record.hash,
      dataFeeUnits: "10000",
      revertGasWei: record.gasCostWei,
      protectedStateUnchanged: true,
      pilot: "PENDING",
    }),
  );
});
