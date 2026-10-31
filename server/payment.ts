import { ExactEvmScheme } from "@x402/evm";
import {
  decodePaymentResponseHeader,
  wrapFetchWithPaymentFromConfig,
} from "@x402/fetch";
import { decodeEventLog, parseAbi } from "viem";
import { resolve } from "node:path";
import {
  AIRNODE_URL,
  AUSD,
  API_RECIPIENT,
  publicClient,
  now,
  iso,
  wallets,
} from "./config";
import { readJson, writeJson, LOCAL } from "./store";
import type { AirnodeV2Request, SignedResponse } from "./airnode";

export interface Mandate {
  id: string;
  status: string;
  apiPerCallUnits: string;
  apiTotalUnits: string;
  apiSpentUnits: string;
  apiReservedUnits?: string;
  maxActions: number;
  actionsUsed: number;
  gasCapWei: string;
  gasTotalCapWei: string;
  gasSpentWei: string;
  expiresAt: number;
  recipient: string;
  asset: string;
  network: string;
  beneficiary: string;
  contract: string;
}
export function validatePayment(m: Mandate, requirement: any) {
  if (now() >= m.expiresAt || m.status !== "active")
    throw new Error("Mandate expired or inactive.");
  if (m.actionsUsed >= m.maxActions)
    throw new Error("Maximum procurement actions reached.");
  if (requirement.network !== "eip155:84532" || m.network !== "eip155:84532")
    throw new Error("Network is outside mandate.");
  if (
    requirement.asset.toLowerCase() !== AUSD.toLowerCase() ||
    m.asset.toLowerCase() !== AUSD.toLowerCase()
  )
    throw new Error("Asset is outside mandate.");
  if (
    requirement.payTo.toLowerCase() !== API_RECIPIENT.toLowerCase() ||
    m.recipient.toLowerCase() !== API_RECIPIENT.toLowerCase()
  )
    throw new Error("Recipient is outside mandate.");
  const amount = BigInt(requirement.amount);
  if (
    amount <= 0n ||
    amount > BigInt(m.apiPerCallUnits) ||
    BigInt(m.apiSpentUnits) + BigInt(m.apiReservedUnits || "0") + amount >
      BigInt(m.apiTotalUnits)
  )
    throw new Error("API price exceeds mandate budget.");
}
export function assertReusableIntent(
  intent: any,
  mandate: Mandate,
  nowSeconds = now(),
) {
  if (intent.response !== undefined) {
    if (
      intent.httpStatus !== 200 ||
      intent.settlement?.success !== true ||
      !intent.verifiedReceipt
    )
      throw new Error("Cached response has no verified successful settlement.");
    const envelope = JSON.parse(intent.response);
    if (
      typeof envelope.data !== "string" ||
      typeof envelope.signature !== "string" ||
      typeof envelope.requestHash !== "string" ||
      typeof envelope.timestamp !== "string"
    )
      throw new Error("Cached response is not a signed envelope.");
    return;
  }
  if (nowSeconds >= mandate.expiresAt || mandate.status !== "active")
    throw new Error("Mandate expired; no authorization replay allowed.");
}
const transferAbi = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
export function verifyTransferReceipt(
  receipt: any,
  payer: string,
  amount: bigint | string,
) {
  if (receipt.status !== "success")
    throw new Error("Data payment transaction was not successful.");
  const found = receipt.logs.some((log: any) => {
    if (log.address.toLowerCase() !== AUSD.toLowerCase()) return false;
    try {
      const parsed = decodeEventLog({
        abi: transferAbi,
        data: log.data,
        topics: log.topics,
      });
      return (
        parsed.args.from.toLowerCase() === payer.toLowerCase() &&
        parsed.args.to.toLowerCase() === API_RECIPIENT.toLowerCase() &&
        parsed.args.value === BigInt(amount)
      );
    } catch {
      return false;
    }
  });
  if (!found)
    throw new Error(
      "Payment receipt has no exact aUSD transfer to the allowed service recipient.",
    );
  return true;
}
const authorizationAbi = parseAbi([
  "function authorizationState(address authorizer,bytes32 nonce) view returns(bool)",
  "event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)",
]);
export async function paidSnapshot(
  intentId: string,
  request: AirnodeV2Request,
  mandate: Mandate,
): Promise<{ envelope: SignedResponse; settlement: any; intent: any }> {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(intentId) ||
    !/^[a-zA-Z0-9_-]+$/.test(mandate.id)
  )
    throw new Error("Invalid intent or mandate ID");
  const path = resolve(LOCAL, "intents", intentId + ".json"),
    ledgerPath = resolve(LOCAL, "mandates", mandate.id + ".json");
  let intent: any = readJson(path);
  const body = JSON.stringify(request),
    payer = wallets().deployer.account;
  const ledger: any = readJson(ledgerPath) || {
    reservedUnits: "0",
    spentUnits: "0",
    actions: 0,
    intents: {},
  };
  const record = (patch: any) => {
    Object.assign(intent, patch);
    writeJson(path, intent);
  };
  async function verifySettlement(settlement: any) {
    if (
      !settlement?.success ||
      settlement.network !== "eip155:84532" ||
      !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)
    )
      throw new Error("No successful x402 settlement receipt.");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: settlement.transaction,
      confirmations: 1,
      timeout: 90000,
    });
    verifyTransferReceipt(receipt, payer.address, intent.amountUnits);
    if (intent.authorization) {
      const nonce = intent.authorization.nonce;
      const used = receipt.logs.some((log) => {
        if (log.address.toLowerCase() !== AUSD.toLowerCase()) return false;
        try {
          const decoded = decodeEventLog({
            abi: authorizationAbi,
            data: log.data,
            topics: log.topics,
          });
          return (
            decoded.eventName === "AuthorizationUsed" &&
            decoded.args.authorizer.toLowerCase() ===
              payer.address.toLowerCase() &&
            decoded.args.nonce === nonce
          );
        } catch {
          return false;
        }
      });
      if (!used)
        throw new Error(
          "Payment transaction does not consume this intent authorization.",
        );
    }
    record({
      verifiedReceipt: {
        transactionHash: receipt.transactionHash,
        blockNumber: String(receipt.blockNumber),
        status: receipt.status,
      },
    });
    if (!ledger.intents[intentId]?.settled) {
      const reserved = BigInt(ledger.intents[intentId]?.amount || "0");
      ledger.reservedUnits = String(BigInt(ledger.reservedUnits) - reserved);
      ledger.spentUnits = String(
        BigInt(ledger.spentUnits) + BigInt(intent.amountUnits),
      );
      ledger.intents[intentId] = { amount: intent.amountUnits, settled: true };
      writeJson(ledgerPath, ledger);
    }
  }
  if (intent?.requestBody && intent.requestBody !== body)
    throw new Error("Intent already bound to another request.");
  if (intent?.response !== undefined) {
    // Earlier journal versions are reconciled before cached data can be accepted.
    if (!intent.verifiedReceipt && intent.settlement?.success)
      await verifySettlement(intent.settlement);
    assertReusableIntent(intent, mandate);
    return {
      envelope: JSON.parse(intent.response),
      settlement: intent.settlement,
      intent,
    };
  }
  if (!intent) {
    validatePayment(
      {
        ...mandate,
        apiSpentUnits: ledger.spentUnits,
        apiReservedUnits: ledger.reservedUnits,
        actionsUsed: ledger.actions,
      },
      {
        network: "eip155:84532",
        asset: AUSD,
        payTo: API_RECIPIENT,
        amount: mandate.apiPerCallUnits,
      },
    );
    intent = {
      id: intentId,
      mandateId: mandate.id,
      createdAt: iso(),
      status: "reserved",
      requestBody: body,
      startBlock: String(await publicClient.getBlockNumber()),
      amountUnits: "0",
    };
    writeJson(path, intent);
  }
  async function persistResponse(response: Response) {
    const header = response.headers.get("PAYMENT-RESPONSE");
    const settlement = header ? decodePaymentResponseHeader(header) : undefined;
    if (settlement)
      record({
        settlement,
        status: settlement.success ? "settled" : "settlement-failed",
      });
    const raw = await response.text();
    record({ response: raw, httpStatus: response.status, finishedAt: iso() });
    if (settlement?.success) await verifySettlement(settlement);
    if (!response.ok)
      throw new Error(
        `Airnode returned HTTP ${response.status}; ${settlement?.success ? "data fee was spent" : "payment outcome must be reconciled"}. ${raw.slice(0, 160)}`,
      );
    assertReusableIntent(intent, mandate);
    return { envelope: JSON.parse(raw), settlement, intent };
  }
  if (intent.paymentHeader) {
    const auth = intent.authorization;
    if (!auth)
      throw new Error(
        "Unresolved authorization; no second authorization will be created.",
      );
    const used = await publicClient.readContract({
      address: AUSD,
      abi: authorizationAbi,
      functionName: "authorizationState",
      args: [payer.address, auth.nonce],
    });
    if (used) {
      const latest = await publicClient.getBlockNumber();
      let transaction;
      // Bounded reconciliation windows for providers that cap eth_getLogs ranges.
      for (
        let from = BigInt(intent.startBlock), n = 0;
        from <= latest && n < 24;
        from += 2000n, n++
      ) {
        const to = from + 1999n < latest ? from + 1999n : latest;
        const logs = await publicClient.getLogs({
          address: AUSD,
          event: authorizationAbi[1],
          args: { authorizer: payer.address, nonce: auth.nonce },
          fromBlock: from,
          toBlock: to,
        });
        if (logs[0]) {
          transaction = logs[0].transactionHash;
          break;
        }
      }
      if (transaction)
        await verifySettlement({
          success: true,
          network: "eip155:84532",
          transaction,
        });
      record({
        status: "settled-without-result",
        reconciledTransaction: transaction,
      });
      throw new Error(
        "Payment was consumed on-chain but the response was lost. No second payment will be authorized for this intent.",
      );
    }
    assertReusableIntent(intent, mandate);
    if (now() >= Number(auth.validBefore))
      throw new Error(
        "Unresolved authorization expired unused. No automatic new charge.",
      );
    return persistResponse(
      await fetch(AIRNODE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-SIGNATURE": intent.paymentHeader,
        },
        body,
        signal: AbortSignal.timeout(60000),
      }),
    );
  }
  assertReusableIntent(intent, mandate);
  const durableFetch: typeof fetch = async (input, init) => {
    const req = new Request(input, init),
      payment = req.headers.get("PAYMENT-SIGNATURE");
    if (payment) {
      if (intent.paymentHeader && intent.paymentHeader !== payment)
        throw new Error("Duplicate payment authorization blocked.");
      const payload = JSON.parse(Buffer.from(payment, "base64").toString());
      const auth = payload.payload?.authorization;
      if (
        !auth ||
        Number(auth.validBefore) > mandate.expiresAt ||
        now() >= mandate.expiresAt
      )
        throw new Error("Authorization extends beyond mandate expiry.");
      record({
        paymentHeader: payment,
        authorization: auth,
        status: "authorization-persisted",
        amountUnits: payload.accepted?.amount || intent.amountUnits,
      });
    }
    return fetch(req, { signal: AbortSignal.timeout(60000) });
  };
  const payingFetch = wrapFetchWithPaymentFromConfig(durableFetch, {
    schemes: [{ network: "eip155:84532", client: new ExactEvmScheme(payer) }],
    spendControls: {
      maxAmountPerPayment: "$0.01",
      allowedAssets: [
        {
          network: "eip155:84532",
          asset: AUSD,
          maxAmountPerPayment: mandate.apiPerCallUnits,
        },
      ],
    },
    policies: [
      (_v, requirements) =>
        requirements.filter((r) => {
          try {
            if (ledger.intents[intentId]) {
              if (ledger.intents[intentId].amount !== r.amount)
                throw new Error("Reserved price changed");
              validatePayment(
                {
                  ...mandate,
                  apiSpentUnits: ledger.spentUnits,
                  apiReservedUnits: String(
                    BigInt(ledger.reservedUnits) - BigInt(r.amount),
                  ),
                  actionsUsed: ledger.actions - 1,
                },
                r,
              );
            } else
              validatePayment(
                {
                  ...mandate,
                  apiSpentUnits: ledger.spentUnits,
                  apiReservedUnits: ledger.reservedUnits,
                  actionsUsed: ledger.actions,
                },
                r,
              );
            if (!ledger.intents[intentId]) {
              ledger.reservedUnits = String(
                BigInt(ledger.reservedUnits) + BigInt(r.amount),
              );
              ledger.actions++;
              ledger.intents[intentId] = { amount: r.amount, settled: false };
              writeJson(ledgerPath, ledger);
            }
            record({ challenge: r, amountUnits: r.amount });
            return true;
          } catch {
            return false;
          }
        }),
    ],
  });
  return persistResponse(
    await payingFetch(AIRNODE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}
