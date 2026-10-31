import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type Hex, toHex } from "viem";
import {
  AIRNODE,
  AUSD,
  API_RECIPIENT,
  publicClient,
  wallets,
  now,
  iso,
} from "./config";
import {
  load,
  save,
  event,
  exclusive,
  writeJson,
  readJson,
  LOCAL,
} from "./store";
import {
  deriveRequestHash,
  verifySignedResponse,
  type SignedResponse,
} from "./airnode";
import { paidSnapshot, type Mandate } from "./payment";
import {
  sendDurable,
  deploymentData,
  proofData,
  chainState,
  escrowAbi,
  receiptFeeBreakdown,
} from "./chain";

export const requestFor = (postId: string) => ({
  operation: "tweetsByIds",
  parameters: { tweet_ids: postId },
  responseProjection: {
    authorId: "/tweets/0/author/id",
    createdAt: "/tweets/0/createdAt",
    postId: "/tweets/0/id",
    text: "/tweets/0/text",
  },
});
function initialState() {
  let brand = "",
    creator = "";
  try {
    const w = wallets();
    brand = w.buyer.account.address;
    creator = w.counterparty.account.address;
  } catch {}
  return {
    status: "draft",
    updatedAt: iso(),
    network: { name: "Base Sepolia", chainId: 84532 },
    campaign: {
      id: "agreement-" + randomUUID().slice(0, 8),
      title: "A post, with proof of delivery",
      postId: "20",
      authorId: "12",
      campaignCode: "twttr",
      creator,
      brand,
      airnode: AIRNODE,
      payoutWei: "10000000000000",
      postedAfter: 1142971200,
      postedBefore: 1142974800,
      claimDeadline: now() + 86400,
      maxResponseAge: 300,
    },
    receipts: [],
    events: [],
    checks: [],
    transactions: {},
    disclosure:
      "Historical public post used for a test agreement. The beneficiary is an isolated creator test wallet; this is not a commissioned advertisement.",
  };
}
export function current() {
  let state = load();
  if (!state) {
    state = initialState();
    if (!state.campaign.brand) {
      const recorded = readJson<any>(resolve("evidence/live-flow.json"));
      if (recorded) {
        state = {
          ...recorded,
          status: "paid",
          mode: "recorded-evidence",
          transactions: {},
        };
      }
    }
    save(state);
  }
  if (state.status === "draft" && !state.deployment) {
    try {
      const w = wallets();
      if (
        state.campaign.brand !== w.buyer.account.address ||
        state.campaign.creator !== w.counterparty.account.address
      ) {
        state.campaign.brand = w.buyer.account.address;
        state.campaign.creator = w.counterparty.account.address;
        delete state.mode;
        save(state);
      }
    } catch {}
  }
  return state;
}
export function publicState() {
  const state = structuredClone(current());
  delete state.transactions;
  if (!state.mandate && state.mandateDraft) state.mandate = state.mandateDraft;
  state.writable = !!(() => {
    try {
      wallets();
      return true;
    } catch {
      return false;
    }
  })();
  return state;
}
export async function refresh() {
  const state = structuredClone(current());
  if (state.deployment) {
    const onchain = await chainState(state.deployment.address);
    if (onchain === 1) state.status = "paid";
    else if (onchain === 2) state.status = "refunded";
    state.onchain = {
      state: onchain,
      balanceWei: String(
        await publicClient.getBalance({ address: state.deployment.address }),
      ),
    };
  }
  delete state.transactions;
  state.writable = publicState().writable;
  return state;
}
function addReceipt(state: any, receipt: any) {
  const existing = state.receipts.find(
    (r: any) =>
      r.kind === receipt.kind && r.transactionHash === receipt.transactionHash,
  );
  if (!existing) state.receipts.push({ ...receipt, at: iso() });
  save(state);
}
export async function fundAgreement() {
  return exclusive(async () => {
    const state = current();
    if (state.deployment) {
      await refresh();
      return publicState();
    }
    if (
      !["draft", "funding-pending"].includes(state.status) &&
      !state.transactions.funding
    )
      throw new Error("Agreement is already being funded.");
    if (
      !state.campaign.creator ||
      state.campaign.creator === state.campaign.brand
    )
      throw new Error("Configure distinct brand and creator test roles.");
    if (now() >= state.campaign.claimDeadline)
      throw new Error("Agreement deadline expired. Prepare a fresh agreement.");
    state.status = "funding-pending";
    state.error = undefined;
    save(state);
    try {
      const { record, receipt } = await sendDurable(
        state,
        "funding",
        "buyer",
        {
          data: deploymentData(state.campaign),
          value: BigInt(state.campaign.payoutWei),
        },
        100000000000000n,
      );
      state.deployment = {
        address: receipt.contractAddress || record.contractAddress,
        transactionHash: record.hash,
        blockNumber: record.blockNumber,
      };
      const expectedHash = deriveRequestHash(requestFor(state.campaign.postId));
      const storedHash = await publicClient.readContract({
        address: state.deployment.address,
        abi: escrowAbi,
        functionName: "requestHash",
      });
      if (storedHash !== expectedHash)
        throw new Error(
          "Deployed request does not match the approved source recipe.",
        );
      state.campaign.requestHash = storedHash;
      state.mandateDraft = {
        ...newMandate(state),
        status: "awaiting-authorization",
      };
      state.status = "active";
      addReceipt(state, {
        kind: "funding",
        title: "Brand funded the agreement",
        amount: state.campaign.payoutWei,
        asset: "testETH",
        transactionHash: record.hash,
        status: "confirmed",
        detail: "Fixed creator fee locked in an immutable agreement.",
      });
      event(
        state,
        "Agreement funded",
        "The creator, fee, post, source and time rules are now fixed.",
      );
      return publicState();
    } catch (e: any) {
      state.status =
        state.transactions?.funding?.status === "reverted"
          ? "funding-failed"
          : "draft";
      state.error = e.shortMessage || e.message;
      save(state);
      throw e;
    }
  });
}
export function newMandate(state: any): Mandate {
  return {
    id: state.campaign.id + "-mandate",
    status: "active",
    apiPerCallUnits: "10000",
    apiTotalUnits: "10000",
    apiSpentUnits: "0",
    maxActions: 1,
    actionsUsed: 0,
    gasCapWei: "50000000000000",
    gasTotalCapWei: "100000000000000",
    gasSpentWei: "0",
    expiresAt: Math.min(now() + 1800, state.campaign.claimDeadline),
    recipient: API_RECIPIENT,
    asset: AUSD,
    network: "eip155:84532",
    beneficiary: state.campaign.creator,
    contract: state.deployment.address,
  };
}
async function propose(state: any) {
  const started = Date.now();
  const response = await fetch(
    (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434") + "/api/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "qwen3:4b",
        stream: false,
        think: false,
        format: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["purchase_snapshot", "wait"] },
            reason: { type: "string", maxLength: 160 },
          },
          required: ["action", "reason"],
          additionalProperties: false,
        },
        options: { temperature: 0, num_predict: 100, num_ctx: 1024 },
        prompt: `You are a bounded procurement agent. Choose purchase_snapshot when a funded creator agreement has an available API budget; otherwise wait. No destinations or transactions are chosen by you. Funded agreement: ${state.campaign.id}. Post ID: ${state.campaign.postId}. Only permitted tool: tweetsByIds. Remaining API units: ${BigInt(state.mandate.apiTotalUnits) - BigInt(state.mandate.apiSpentUnits)}. Return brief JSON.`,
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      "Local planning model unavailable; no data purchase started.",
    );
  const result = await response.json();
  let proposal;
  try {
    proposal = JSON.parse(result.response);
  } catch {
    throw new Error(
      "Model returned invalid structured proposal; no payment started.",
    );
  }
  if (
    !["purchase_snapshot", "wait"].includes(proposal.action) ||
    typeof proposal.reason !== "string"
  )
    throw new Error("Model proposal failed validation.");
  state.proposal = {
    action: proposal.action,
    reason: proposal.reason.slice(0, 160),
    model: process.env.OLLAMA_MODEL || "qwen3:4b",
    durationMs: Date.now() - started,
    at: iso(),
  };
  save(state);
  if (proposal.action !== "purchase_snapshot")
    throw new Error("Agent chose to wait. No API fee spent.");
  event(state, "Agent selected the post snapshot", state.proposal.reason);
}
export async function validateProof(state: any, envelope: SignedResponse) {
  if (
    !envelope ||
    typeof envelope.data !== "string" ||
    Buffer.byteLength(envelope.data) > 4000 ||
    typeof envelope.signature !== "string" ||
    !/^0x[0-9a-fA-F]{130}$/.test(envelope.signature) ||
    !/^\d{1,12}$/.test(envelope.timestamp)
  )
    throw new Error("Malformed or oversized response envelope.");
  const expected = deriveRequestHash(requestFor(state.campaign.postId));
  await verifySignedResponse(envelope, AIRNODE, expected);
  const block = await publicClient.getBlock();
  const timestamp = Number(envelope.timestamp);
  if (timestamp > Number(block.timestamp))
    throw new Error(
      "Snapshot is ahead of the current chain clock. Try again after the next block.",
    );
  if (Number(block.timestamp) - timestamp > state.campaign.maxResponseAge)
    throw new Error("Snapshot is too old; escrow remains protected.");
  const data = JSON.parse(envelope.data);
  if (data.postId !== state.campaign.postId) throw new Error("Wrong post ID.");
  if (data.authorId !== state.campaign.authorId)
    throw new Error("Wrong author ID.");
  if (
    typeof data.text !== "string" ||
    !data.text.includes(state.campaign.campaignCode)
  )
    throw new Error("Campaign code missing.");
  const created = Math.floor(Date.parse(data.createdAt) / 1000);
  if (
    !Number.isFinite(created) ||
    created < state.campaign.postedAfter ||
    created > state.campaign.postedBefore ||
    created > timestamp
  )
    throw new Error("Post was created outside the agreed time window.");
  // Final decision remains in the deployed contract; this preflight does not replace it.
  await publicClient.call({
    account: wallets().deployer.account.address,
    to: state.deployment.address,
    data: proofData(envelope),
  });
  return data;
}
async function settle(state: any, envelope: SignedResponse) {
  const data = await validateProof(state, envelope);
  event(
    state,
    "Validator approved the exact proof",
    "Pinned signer, request, post, author, campaign code and timing checks passed in the deployed contract.",
  );
  state.checks = [
    { name: "Trusted source signature", status: "pass", detail: AIRNODE },
    {
      name: "Exact post request",
      status: "pass",
      detail: state.campaign.requestHash,
    },
    {
      name: "Post and author identity",
      status: "pass",
      detail: `Post ${data.postId} · author ${data.authorId}`,
    },
    {
      name: "Campaign code",
      status: "pass",
      detail: state.campaign.campaignCode,
    },
    {
      name: "Creation window and fresh snapshot",
      status: "pass",
      detail: data.createdAt,
    },
  ];
  state.snapshot = {
    ...envelope,
    ...data,
    airnode: AIRNODE,
    verified: true,
    sourceUrl: "https://x.com/i/status/" + data.postId,
  };
  state.status = "submission-pending";
  save(state);
  const m = state.mandate;
  if (now() >= m.expiresAt)
    throw new Error("Mandate expired before submission.");
  if (
    m.contract !== state.deployment.address ||
    m.beneficiary !== state.campaign.creator
  )
    throw new Error("Mandate recipient or contract changed.");
  const remaining = BigInt(m.gasTotalCapWei) - BigInt(m.gasSpentWei);
  const cap = remaining < BigInt(m.gasCapWei) ? remaining : BigInt(m.gasCapWei);
  const creatorBefore = await publicClient.getBalance({
    address: state.campaign.creator,
  });
  const { record, receipt } = await sendDurable(
    state,
    "payout",
    "deployer",
    { to: state.deployment.address, data: proofData(envelope) },
    cap,
  );
  m.gasSpentWei = String(BigInt(record.gasCostWei));
  const creatorAfter = await publicClient.getBalance({
    address: state.campaign.creator,
  });
  state.status = "paid";
  m.status = "completed";
  addReceipt(state, {
    kind: "payout",
    title: "Creator received the agreed fee",
    amount: state.campaign.payoutWei,
    asset: "testETH",
    transactionHash: record.hash,
    status: "confirmed",
    detail:
      "Agent submitted the signed snapshot; the contract paid the fixed beneficiary.",
  });
  state.payoutEvidence = {
    creatorBeforeWei: String(creatorBefore),
    creatorAfterWei: String(creatorAfter),
    deltaWei: String(creatorAfter - creatorBefore),
    blockNumber: String(receipt.blockNumber),
    transactionHash: record.hash,
  };
  event(
    state,
    "Creator paid",
    "Signed delivery matched the pinned agreement. This agreement cannot pay again.",
  );
  writeJson(resolve("evidence", "live-flow.json"), exportEvidence(state));
  writeJson(
    resolve("evidence", "runs", state.campaign.id + ".json"),
    exportEvidence(state),
  );
  return publicState();
}
export function exportEvidence(state: any) {
  return {
    recordedAt: iso(),
    network: state.network,
    campaign: state.campaign,
    deployment: state.deployment,
    mandate: state.mandate,
    proposal: state.proposal,
    snapshot: state.snapshot,
    receipts: state.receipts,
    payoutEvidence: state.payoutEvidence,
    checks: state.checks,
    events: state.events,
    transactionCosts: Object.fromEntries(
      Object.entries(state.transactions || {}).map(([id, r]: [string, any]) => [
        id,
        {
          transactionHash: r.hash,
          status: r.status,
          executionFeeWei: r.executionFeeWei,
          l1FeeWei: r.l1FeeWei,
          operatorFeeWei: r.operatorFeeWei,
          gasCostWei: r.gasCostWei,
          gasScope: r.gasScope,
          gasAccountingComplete: r.gasAccountingComplete,
        },
      ]),
    ),
  };
}
export async function startAgent() {
  return exclusive(async () => {
    const state = current();
    if (!state.deployment) throw new Error("Fund the agreement first.");
    if (
      (await chainState(state.deployment.address)) === 1 &&
      state.transactions?.payout
    ) {
      const hadReceipt = state.receipts.some((r: any) => r.kind === "payout");
      const transaction = state.transactions.payout;
      const receipt = await publicClient.getTransactionReceipt({
        hash: transaction.hash,
      });
      if (receipt.status === "success") {
        state.status = "paid";
        state.mandate.status = "completed";
        const fees = await receiptFeeBreakdown(receipt);
        Object.assign(transaction, fees);
        state.mandate.gasSpentWei = fees.gasCostWei;
        addReceipt(state, {
          kind: "payout",
          title: "Creator received the agreed fee",
          amount: state.campaign.payoutWei,
          asset: "testETH",
          transactionHash: transaction.hash,
          status: "confirmed",
          detail:
            "Reconciled from the durable intent and confirmed chain receipt.",
        });
        save(state);
        writeJson(resolve("evidence", "live-flow.json"), exportEvidence(state));
        if (!hadReceipt) return publicState();
      }
    }
    if ((await chainState(state.deployment.address)) !== 0) {
      event(
        state,
        "Duplicate intent blocked",
        "The agreement is already settled. No data charge or payout was attempted.",
        "rejected",
      );
      throw new Error(
        "Agreement already settled; duplicate agent action blocked.",
      );
    }
    if (!state.mandate) {
      state.mandate = state.mandateDraft
        ? {
            ...state.mandateDraft,
            status: "active",
            expiresAt: Math.min(now() + 1800, state.campaign.claimDeadline),
          }
        : newMandate(state);
      state.intentId = state.campaign.id + "-snapshot-1";
      event(
        state,
        "Procurement mandate accepted",
        "One snapshot, up to 0.01 aUSD, with fixed service recipient and creator beneficiary.",
      );
    }
    const m = state.mandate;
    if (now() >= m.expiresAt) throw new Error("Mandate expired.");
    state.error = undefined;
    save(state);
    try {
      const existing = readJson<any>(
        resolve(LOCAL, "intents", state.intentId + ".json"),
      );
      if (
        !existing?.paymentHeader &&
        state.proposal?.action !== "purchase_snapshot"
      )
        await propose(state);
      state.status = "data-payment-pending";
      save(state);
      const result = await paidSnapshot(
        state.intentId,
        requestFor(state.campaign.postId),
        m,
      );
      m.apiSpentUnits = result.intent.amountUnits;
      m.actionsUsed = 1;
      addReceipt(state, {
        kind: "data",
        title: "Agent bought the signed snapshot",
        amount: m.apiSpentUnits,
        asset: "aUSD",
        transactionHash: result.settlement.transaction,
        status: "confirmed",
        detail:
          "Paid TwitterAPI snapshot. This fee is separate from the creator fee.",
      });
      state.status = "checking";
      state.rawEnvelope = result.envelope;
      save(state);
      event(
        state,
        "Signed snapshot received",
        "The paid response is stored under the same intent before verification.",
      );
      return await settle(state, result.envelope);
    } catch (e: any) {
      const intent = readJson<any>(
        resolve(LOCAL, "intents", state.intentId + ".json"),
      );
      if (intent?.paymentHeader) {
        m.actionsUsed = 1;
        m.apiReservedUnits = intent.amountUnits;
        m.apiSpentUnits = intent.verifiedReceipt
          ? intent.amountUnits
          : m.apiSpentUnits;
        m.apiReservedUnits = intent.verifiedReceipt ? "0" : intent.amountUnits;
        if (intent.verifiedReceipt)
          addReceipt(state, {
            kind: "data",
            title: "Data fee confirmed; result unavailable",
            amount: intent.amountUnits,
            asset: "aUSD",
            transactionHash: intent.verifiedReceipt.transactionHash,
            status: "confirmed",
            detail:
              "The external data charge was spent. No creator payout follows missing or invalid evidence.",
          });
      }
      if (state.transactions?.payout?.gasAccountingComplete)
        m.gasSpentWei = state.transactions.payout.gasCostWei;
      state.status = state.receipts.some((r: any) => r.kind === "data")
        ? "rejected"
        : "source-unavailable";
      state.error = e.shortMessage || e.message;
      event(state, "Agent stopped", state.error, "rejected");
      throw e;
    }
  });
}
export async function submitProof(envelope: SignedResponse) {
  return exclusive(async () => {
    const state = current();
    if (!state.deployment) throw new Error("No funded agreement.");
    if (!state.mandate)
      throw new Error("Start the initial mandate before delegated submission.");
    try {
      return await settle(state, envelope);
    } catch (e: any) {
      event(state, "Proof rejected", e.shortMessage || e.message, "rejected");
      throw e;
    }
  });
}
export async function freshAgreement() {
  return exclusive(async () => {
    const old = current();
    if (old.deployment && (await chainState(old.deployment.address)) === 0)
      throw new Error(
        "The current agreement still holds collateral. Resolve it or refund after its deadline first.",
      );
    writeJson(resolve(LOCAL, "archive", old.campaign.id + ".json"), old);
    const state = initialState();
    save(state);
    return publicState();
  });
}

export async function refundAgreement() {
  return exclusive(async () => {
    const state = current();
    if (!state.deployment) throw new Error("No funded agreement.");
    if (now() <= state.campaign.claimDeadline)
      throw new Error("Refund opens after the agreement deadline.");
    const { encodeFunctionData } = await import("viem");
    const data = encodeFunctionData({ abi: escrowAbi, functionName: "refund" });
    const { record } = await sendDurable(
      state,
      "refund",
      "buyer",
      { to: state.deployment.address, data },
      100000000000000n,
    );
    state.status = "refunded";
    addReceipt(state, {
      kind: "refund",
      title: "Unpaid collateral returned to the brand",
      amount: state.campaign.payoutWei,
      asset: "testETH",
      transactionHash: record.hash,
      status: "confirmed",
    });
    return publicState();
  });
}
