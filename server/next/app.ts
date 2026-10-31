import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import {
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  toHex,
  type Hex,
  parseAbi,
  decodeErrorResult,
} from "viem";
import {
  AIRNODE,
  AUSD,
  API_RECIPIENT,
  publicClient,
  now,
  iso,
} from "../config";
import { readJson, writeJson } from "../store";
import { paidSnapshot, verifyTransferReceipt, type Mandate } from "../payment";
import {
  sendDurable,
  chainState,
  proofData,
  escrowAbi,
  receiptFeeBreakdown,
} from "../chain";
import {
  deriveRequestHash,
  verifySignedResponse,
  type SignedResponse,
} from "../airnode";
import { requestFor } from "../app";
import { nextWallets, factoryArtifact, nextFactoryAbi } from "./config";
import { V2_LOCAL, loadNext, saveNext, logNext, exclusiveNext } from "./store";
import {
  challengeFor,
  numericSocialId,
  typedConsent,
  recoverConsent,
  asContractTerms,
  ZERO_ADDRESS,
  type CreatorTerms,
} from "./consent";
export const INFRA = resolve(V2_LOCAL, "infrastructure.json");
export const LIMITS = {
  intakeFeeUnits: "10000",
  agentFeeUnits: "10000",
  apiTotalCapUnits: "20000",
  gasCapWei: "50000000000000",
  gasTotalCapWei: "100000000000000",
};
const pilot = () => ({
  status: "pending",
  detail:
    "A creator must publish this campaign challenge from their own X account. No new creator pilot or payout has been completed.",
});
export function nextCurrent(): any {
  let state = loadNext();
  if (!state) {
    state = {
      status: "empty",
      network: { name: "Base Sepolia", chainId: 84532 },
      receipts: [],
      events: [],
      transactions: {},
      pilot: pilot(),
    };
    saveNext(state);
  }
  return state;
}
function infrastructure() {
  return readJson<any>(INFRA);
}
function factory() {
  const f = infrastructure()?.factory;
  if (!f) throw new Error("Deploy the isolated creator-consent factory first.");
  return f;
}
function runtime(state: any) {
  return { actor: nextWallets().executor, save: saveNext };
}
export function nextPublic() {
  const s = structuredClone(nextCurrent());
  delete s.transactions;
  s.factory = infrastructure()?.factory;
  s.limits = LIMITS;
  s.writable = false;
  try {
    s.brand = nextWallets().executor.account.address;
    s.writable = !!s.factory;
  } catch {}
  if (s.campaign && s.factory && s.campaign.postId)
    s.typedData = typedConsent(s.campaign, s.factory.address);
  return s;
}
function checkNoPending(state: any) {
  if (
    Object.values(state.transactions || {}).some((t: any) =>
      ["signed", "pending"].includes(t.status),
    )
  )
    throw new Error(
      "Reconcile the signed V2 transaction before editing this agreement.",
    );
}
function mustBeCampaign(state: any): CreatorTerms {
  if (!state.campaign) throw new Error("Create a campaign challenge first.");
  return state.campaign;
}
function mustBeUnfunded(state: any) {
  checkNoPending(state);
  if (state.deployment) throw new Error("This funded agreement is immutable.");
}
function receipt(state: any, entry: any) {
  if (
    !state.receipts.some(
      (r: any) =>
        r.transactionHash === entry.transactionHash && r.kind === entry.kind,
    )
  )
    state.receipts.push({ ...entry, at: iso() });
  saveNext(state);
}
export async function deployNextFactory() {
  return exclusiveNext(async () => {
    const infra: any = infrastructure() || { transactions: {} };
    if (infra.factory) return infra.factory;
    const a = factoryArtifact();
    const data = encodeDeployData({
      abi: a.abi,
      bytecode: a.bytecode.object,
      args: [AIRNODE],
    });
    const { record, receipt: r } = await sendDurable(
      infra,
      "creator-consent-factory-v2",
      "deployer",
      { data },
      200000000000000n,
      false,
      { actor: nextWallets().executor, save: (s: any) => writeJson(INFRA, s) },
    );
    const address = r.contractAddress || record.contractAddress;
    const verifier = await publicClient.readContract({
      address,
      abi: a.abi,
      functionName: "intakeVerifier",
    });
    infra.factory = {
      address,
      verifier,
      transactionHash: record.hash,
      blockNumber: record.blockNumber,
      gasCostWei: record.gasCostWei,
    };
    writeJson(INFRA, infra);
    writeJson("evidence/v2/deployment.json", {
      at: iso(),
      network: "Base Sepolia84532",
      factory: infra.factory,
      airnode: AIRNODE,
      creatorPilot: "PENDING",
      collateralFunded: false,
    });
    return infra.factory;
  });
}
export async function newNextCampaign(input: {
  creator: string;
  authorId: string;
}) {
  return exclusiveNext(async () => {
    factory();
    const old = nextCurrent();
    await reconcileNextReservations(old);
    checkNoPending(old);
    if (old.deployment && (await chainState(old.deployment.address)) === 0)
      throw new Error("The current creator agreement still holds collateral.");
    const creator = getAddress(input.creator),
      brand = nextWallets().executor.account.address;
    numericSocialId(input.authorId);
    if (creator === brand || creator === ZERO_ADDRESS)
      throw new Error("Use a separate creator beneficiary wallet.");
    if (old.campaign)
      writeJson(
        resolve(
          V2_LOCAL,
          "archive",
          old.campaign.agreementId.slice(2) + ".json",
        ),
        old,
      );
    const agreementId = toHex(randomBytes(32)),
      nonce = toHex(randomBytes(32));
    const t = now();
    const terms: CreatorTerms = {
      agreementId,
      brand,
      creator,
      authorId: input.authorId,
      postId: "",
      nonce,
      asset: ZERO_ADDRESS,
      feeWei: "10000000000000",
      requiredText: challengeFor(nonce, creator),
      postedAfter: t - 60,
      postedBefore: t + 7 * 3600,
      claimDeadline: t + 8 * 3600,
      consentDeadline: t + 7 * 3600 + 1800,
      maxResponseAge: 300,
    };
    const state = {
      status: "awaiting-post",
      network: { name: "Base Sepolia", chainId: 84532 },
      campaign: terms,
      challenge: terms.requiredText,
      receipts: [],
      events: [],
      transactions: {},
      pilot: pilot(),
    };
    logNext(
      state,
      "Campaign challenge created",
      "Creator must publish the exact nonce and beneficiary fragment before pinning the post.",
    );
    return nextPublic();
  });
}
export async function pinNextPost(postId: string) {
  return exclusiveNext(async () => {
    const s = nextCurrent();
    mustBeUnfunded(s);
    const t = mustBeCampaign(s);
    if (s.consent?.verified)
      throw new Error(
        "Accepted consent freezes the post and terms. Create a new campaign to change them.",
      );
    t.postId = numericSocialId(postId);
    s.status = "awaiting-consent";
    s.error = undefined;
    logNext(
      s,
      "Post pinned",
      `Post${postId}; creator must sign the complete unchanged terms.`,
    );
    return nextPublic();
  });
}
async function checkedConsent(s: any) {
  const t = mustBeCampaign(s);
  if (!s.consent?.verified)
    throw new Error(
      "Creator wallet consent is required before data procurement.",
    );
  const f = factory();
  const recovered = await recoverConsent(
    t,
    f.address,
    s.consent.signature,
    nextWallets().executor.account.address,
  );
  if (recovered.termsHash !== s.consent.termsHash)
    throw new Error("Consent terms changed.");
  return recovered;
}
export async function acceptNextConsent(signature: Hex) {
  return exclusiveNext(async () => {
    const s = nextCurrent();
    mustBeUnfunded(s);
    if (s.consent?.verified)
      throw new Error(
        "Consent replay blocked; this agreement already has its signed terms.",
      );
    const t = mustBeCampaign(s),
      f = factory();
    try {
      const result = await recoverConsent(
        t,
        f.address,
        signature,
        nextWallets().executor.account.address,
      );
      const digest = await publicClient.readContract({
        address: f.address,
        abi: nextFactoryAbi(),
        functionName: "verifyConsent",
        args: [asContractTerms(t), signature],
      });
      if (digest !== result.termsHash)
        throw new Error("Contract and wallet terms digests disagree.");
      s.consent = {
        verified: true,
        ...result,
        signature,
        at: iso(),
        verification:
          "EOA signature recovery plus deployed factory verifyConsent; nonce is consumed only when funding succeeds.",
      };
      s.status = "consent-verified";
      s.error = undefined;
      logNext(
        s,
        "Creator consent verified",
        "The beneficiary signed the complete pinned terms. Wallet consent alone does not prove the X account connection.",
      );
      return nextPublic();
    } catch (e: any) {
      logNext(s, "Consent rejected", e.shortMessage || e.message, "rejected");
      throw e;
    }
  });
}
function mandate(s: any, purpose: "intake" | "agent"): Mandate {
  const used = BigInt(
    s.receipts
      .filter((r: any) => r.kind === "data")
      .reduce((sum: bigint, r: any) => sum + BigInt(r.amount), 0n),
  );
  if (used + 10000n > BigInt(LIMITS.apiTotalCapUnits))
    throw new Error("Campaign data budget exhausted. No automatic top-up.");
  return {
    id: `v2-${s.campaign.agreementId.slice(2)}-${purpose}`,
    status: "active",
    apiPerCallUnits: "10000",
    apiTotalUnits: "10000",
    apiSpentUnits: "0",
    maxActions: 1,
    actionsUsed: 0,
    gasCapWei: LIMITS.gasCapWei,
    gasTotalCapWei: LIMITS.gasTotalCapWei,
    gasSpentWei: "0",
    expiresAt: Math.min(
      now() + 900,
      purpose === "intake"
        ? s.campaign.consentDeadline
        : s.campaign.claimDeadline,
    ),
    recipient: API_RECIPIENT,
    asset: AUSD,
    network: "eip155:84532",
    beneficiary: s.campaign.creator,
    contract: purpose === "intake" ? factory().address : s.deployment.address,
  };
}
function sourceShape(e: any) {
  if (
    !e ||
    typeof e.data !== "string" ||
    Buffer.byteLength(e.data) > 4000 ||
    !/^\d{1,12}$/.test(e.timestamp) ||
    !/^0x[0-9a-fA-F]{130}$/.test(e.signature)
  )
    throw new Error("Malformed signed source envelope.");
}
export async function verifyNextSource(s: any, envelope: SignedResponse) {
  const t = mustBeCampaign(s);
  sourceShape(envelope);
  await verifySignedResponse(
    envelope,
    AIRNODE,
    deriveRequestHash(requestFor(t.postId)),
  );
  const result = await publicClient.readContract({
    address: factory().address,
    abi: nextFactoryAbi(),
    functionName: "verifyIntake",
    args: [
      asContractTerms(t),
      BigInt(envelope.timestamp),
      toHex(envelope.data),
      envelope.signature,
    ],
  });
  return { dataHash: result, data: JSON.parse(envelope.data) };
}
export function nextRejectionName(error: any): string | undefined {
  for (
    let cursor = error, depth = 0;
    cursor && depth < 12;
    cursor = cursor.cause, depth++
  ) {
    if (cursor.data?.errorName) return cursor.data.errorName;
    const data =
      typeof cursor.data === "string" ? cursor.data : cursor.data?.data;
    if (typeof data === "string" && data.startsWith("0x"))
      try {
        return decodeErrorResult({ abi: nextFactoryAbi(), data: data as Hex })
          .errorName;
      } catch {}
  }
  return undefined;
}
function recordData(s: any, purpose: string, result: any) {
  const m = purpose === "intake" ? s.intakeMandate : s.mandate;
  m.apiSpentUnits = result.intent.amountUnits;
  m.actionsUsed = 1;
  m.apiReservedUnits = "0";
  if (purpose === "intake") m.status = "completed";
  receipt(s, {
    kind: "data",
    title:
      purpose === "intake"
        ? "Agent bought the intake snapshot"
        : "Agent bought the payout snapshot",
    amount: m.apiSpentUnits,
    asset: "aUSD",
    transactionHash: result.settlement.transaction,
    status: "confirmed",
    detail: "External data fee is spent independently of escrow eligibility.",
  });
}
function recordUncertain(s: any, purpose: string, intentId: string) {
  const intent = readJson<any>(
    resolve(V2_LOCAL, "intents", intentId + ".json"),
  );
  const m = purpose === "intake" ? s.intakeMandate : s.mandate;
  if (intent?.paymentHeader && m) {
    m.actionsUsed = 1;
    m.apiSpentUnits = intent.verifiedReceipt ? intent.amountUnits : "0";
    m.apiReservedUnits = intent.verifiedReceipt ? "0" : intent.amountUnits;
    if (intent.verifiedReceipt)
      receipt(s, {
        kind: "data",
        title: "Data fee confirmed",
        amount: intent.amountUnits,
        asset: "aUSD",
        transactionHash: intent.verifiedReceipt.transactionHash,
        status: "confirmed",
        detail:
          "A confirmed external charge does not authorize invalid or missing post evidence.",
      });
  }
  saveNext(s);
}
export async function checkNextIntake() {
  return exclusiveNext(async () => {
    const s = nextCurrent();
    mustBeUnfunded(s);
    await checkedConsent(s);
    const intentId = `v2-${s.campaign.agreementId.slice(2)}-intake`;
    s.intakeMandate ||= mandate(s, "intake");
    s.status = "intake-pending";
    s.error = undefined;
    saveNext(s);
    try {
      const result = await paidSnapshot(
        intentId,
        requestFor(s.campaign.postId),
        s.intakeMandate,
        { localDir: V2_LOCAL, payer: nextWallets().executor.account },
      );
      recordData(s, "intake", result);
      s.intake = {
        verified: false,
        purchased: true,
        envelope: result.envelope,
      };
      saveNext(s);
      const valid = await verifyNextSource(s, result.envelope);
      s.intake = {
        ...s.intake,
        verified: true,
        dataHash: valid.dataHash,
        checks: [
          { name: "Trusted signer and exact request", status: "pass" },
          { name: "Post and author pinned", status: "pass" },
          { name: "Exact nonce and beneficiary challenge", status: "pass" },
          { name: "Publication window and fresh signature", status: "pass" },
        ],
      };
      s.status = "intake-verified";
      logNext(
        s,
        "Social intake verified",
        "The signed post contains the exact campaign challenge. The brand may now fund these consented terms.",
      );
      writeJson("evidence/v2/latest-intake.json", nextEvidence(s));
      return nextPublic();
    } catch (e: any) {
      recordUncertain(s, "intake", intentId);
      const rejectionName = nextRejectionName(e);
      const explanation =
        rejectionName === "MissingChallenge"
          ? "The post does not include the exact campaign nonce and beneficiary challenge."
          : rejectionName === "StaleResponse"
            ? "The signed snapshot is too old for intake."
            : "The published post could not be verified against the agreed conditions.";
      s.intake = {
        ...s.intake,
        verified: false,
        rejectionName,
        verifierError: e.shortMessage || e.message,
        error:
          explanation +
          " No agreement was funded." +
          (s.receipts.some((r: any) => r.kind === "data")
            ? " The confirmed data fee remains spent."
            : ""),
      };
      s.status = "intake-rejected";
      s.error = s.intake.error;
      logNext(
        s,
        "Post intake rejected",
        "No agreement was funded. A successfully purchased external snapshot remains charged.",
        "rejected",
      );
      writeJson("evidence/v2/latest-intake.json", nextEvidence(s));
      throw e;
    }
  });
}
async function agreementOnChain(s: any) {
  return (await publicClient.readContract({
    address: factory().address,
    abi: nextFactoryAbi(),
    functionName: "agreements",
    args: [s.campaign.agreementId],
  })) as readonly [Hex, Hex, Hex, bigint, Hex];
}
export async function fundNextAgreement() {
  return exclusiveNext(async () => {
    const s = nextCurrent();
    mustBeCampaign(s);
    const f = factory();
    const existing = await agreementOnChain(s);
    if (existing[0] !== ZERO_ADDRESS) {
      if (
        existing[4] !== s.consent?.termsHash ||
        existing[2].toLowerCase() !== s.campaign.creator.toLowerCase()
      )
        throw new Error("On-chain agreement does not match this consent.");
      const key = `fund-${s.consent.termsHash.slice(2)}`,
        record = s.transactions?.[key];
      if (!record)
        throw new Error(
          "Funded agreement exists; recover its original receipt before any new action.",
        );
      const r = await publicClient.getTransactionReceipt({ hash: record.hash });
      if (r.status !== "success")
        throw new Error("Funding receipt not successful.");
      record.status = r.status;
      Object.assign(record, await receiptFeeBreakdown(r));
      s.deployment = { address: existing[0], transactionHash: record.hash };
      s.status = "funded";
      receipt(s, {
        kind: "funding",
        title: "Brand funded the consented agreement",
        amount: s.campaign.feeWei,
        asset: "testETH",
        transactionHash: record.hash,
        status: "confirmed",
      });
      return nextPublic();
    }
    await checkedConsent(s);
    if (!s.intake?.verified)
      throw new Error(
        "A valid challenge-bound social intake is required before funding.",
      );
    await verifyNextSource(s, s.intake.envelope);
    const data = encodeFunctionData({
      abi: nextFactoryAbi(),
      functionName: "fundAgreement",
      args: [
        asContractTerms(s.campaign),
        s.consent.signature,
        BigInt(s.intake.envelope.timestamp),
        toHex(s.intake.envelope.data),
        s.intake.envelope.signature,
      ],
    });
    const key = `fund-${s.consent.termsHash.slice(2)}`;
    s.status = "funding-pending";
    s.error = undefined;
    saveNext(s);
    try {
      const { record } = await sendDurable(
        s,
        key,
        "deployer",
        { to: f.address, data, value: BigInt(s.campaign.feeWei) },
        BigInt(LIMITS.gasCapWei),
        false,
        runtime(s),
      );
      const a = await agreementOnChain(s);
      if (a[0] === ZERO_ADDRESS || a[4] !== s.consent.termsHash)
        throw new Error("Funding mapping did not bind the approved consent.");
      s.deployment = { address: a[0], transactionHash: record.hash };
      s.status = "funded";
      receipt(s, {
        kind: "funding",
        title: "Brand funded the consented agreement",
        amount: s.campaign.feeWei,
        asset: "testETH",
        transactionHash: record.hash,
        status: "confirmed",
        detail:
          "Factory verified creator consent and signed intake before deploying the fixed-beneficiary escrow.",
      });
      logNext(
        s,
        "Consented agreement funded",
        "A new post-funding snapshot is required for the one-time payout.",
      );
      return nextPublic();
    } catch (e: any) {
      s.status = "funding-retry";
      s.error = e.shortMessage || e.message;
      saveNext(s);
      throw e;
    }
  });
}
export async function runNextAgent() {
  return exclusiveNext(async () => {
    const s = nextCurrent();
    if (!s.deployment) throw new Error("Fund the consented agreement first.");
    const settled = await chainState(s.deployment.address);
    const payoutKey = s.consent?.termsHash
      ? `payout-${s.consent.termsHash.slice(2)}`
      : "";
    if (settled === 1 && s.transactions[payoutKey]) {
      const tx = s.transactions[payoutKey];
      const r = await publicClient.getTransactionReceipt({ hash: tx.hash });
      const hadReceipt = s.receipts.some(
        (entry: any) => entry.kind === "payout",
      );
      if (r.status === "success") {
        tx.status = "success";
        Object.assign(tx, await receiptFeeBreakdown(r));
        s.status = "paid";
        s.mandate.status = "completed";
        s.mandate.gasSpentWei = tx.gasCostWei;
        s.pilot = {
          status: "completed",
          detail: "Creator payout reconciled from the confirmed chain receipt.",
        };
        receipt(s, {
          kind: "payout",
          title: "Creator received the consented fee",
          amount: s.campaign.feeWei,
          asset: "testETH",
          transactionHash: tx.hash,
          status: "confirmed",
        });
        if (!hadReceipt) return nextPublic();
      }
    }
    if (settled !== 0)
      throw new Error(
        "Already settled; duplicate V2 procurement/payout blocked.",
      );
    const t = mustBeCampaign(s);
    if (now() >= t.claimDeadline) throw new Error("Agreement deadline passed.");
    s.mandate ||= mandate(s, "agent");
    if (now() >= s.mandate.expiresAt) throw new Error("Agent mandate expired.");
    const intentId = `v2-${t.agreementId.slice(2)}-payout`;
    s.status = "data-payment-pending";
    s.error = undefined;
    saveNext(s);
    try {
      const result = await paidSnapshot(
        intentId,
        requestFor(t.postId),
        s.mandate,
        { localDir: V2_LOCAL, payer: nextWallets().executor.account },
      );
      recordData(s, "agent", result);
      s.status = "checking";
      s.payoutEnvelope = result.envelope;
      saveNext(s);
      await verifyNextSource(s, result.envelope);
      const data = proofData(result.envelope);
      await publicClient.call({ to: s.deployment.address, data });
      s.status = "submission-pending";
      saveNext(s);
      const { record } = await sendDurable(
        s,
        `payout-${s.consent.termsHash.slice(2)}`,
        "deployer",
        { to: s.deployment.address, data },
        BigInt(s.mandate.gasCapWei),
        false,
        runtime(s),
      );
      s.mandate.status = "completed";
      s.mandate.gasSpentWei = record.gasCostWei;
      s.status = "paid";
      s.pilot = {
        status: "completed",
        detail:
          "A source-bound creator consent intake led to confirmed payout.",
      };
      receipt(s, {
        kind: "payout",
        title: "Creator received the consented fee",
        amount: t.feeWei,
        asset: "testETH",
        transactionHash: record.hash,
        status: "confirmed",
      });
      logNext(
        s,
        "Creator paid",
        "The agent submitted the fresh post-funding snapshot and the original escrow paid its fixed creator.",
      );
      writeJson("evidence/v2/latest-flow.json", nextEvidence(s));
      return nextPublic();
    } catch (e: any) {
      recordUncertain(s, "agent", intentId);
      const paidTx = s.transactions?.[`payout-${s.consent.termsHash.slice(2)}`];
      if (paidTx?.gasAccountingComplete)
        s.mandate.gasSpentWei = paidTx.gasCostWei;
      s.status = "rejected";
      s.error = e.shortMessage || e.message;
      logNext(s, "Agent stopped", s.error, "rejected");
      throw e;
    }
  });
}
export async function refundNextAgreement() {
  return exclusiveNext(async () => {
    const s = nextCurrent();
    if (!s.deployment) throw new Error("No V2 agreement is funded.");
    const data = encodeFunctionData({
      abi: nextFactoryAbi(),
      functionName: "refundAgreement",
      args: [s.campaign.agreementId],
    });
    const { record } = await sendDurable(
      s,
      `refund-${s.consent.termsHash.slice(2)}`,
      "deployer",
      { to: factory().address, data },
      50000000000000n,
      false,
      runtime(s),
    );
    s.status = "refunded";
    receipt(s, {
      kind: "refund",
      title: "Unpaid fee returned to the original brand",
      amount: s.campaign.feeWei,
      asset: "testETH",
      transactionHash: record.hash,
      status: "confirmed",
    });
    return nextPublic();
  });
}
export function nextEvidence(s = nextCurrent()) {
  const copy = structuredClone(s);
  copy.factory = infrastructure()?.factory;
  copy.limits = LIMITS;
  copy.transactions = Object.fromEntries(
    Object.entries(s.transactions || {}).map(([id, r]: [string, any]) => [
      id,
      {
        hash: r.hash,
        status: r.status,
        gasCostWei: r.gasCostWei,
        executionFeeWei: r.executionFeeWei,
        l1FeeWei: r.l1FeeWei,
        operatorFeeWei: r.operatorFeeWei,
      },
    ]),
  );
  return copy;
}

async function reconcileNextReservations(s: any) {
  if (!s.campaign) return;
  const abi = parseAbi([
    "function authorizationState(address authorizer,bytes32 nonce) view returns(bool)",
    "event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)",
  ]);
  for (const purpose of ["intake", "payout"]) {
    const id = `v2-${s.campaign.agreementId.slice(2)}-${purpose}`;
    const path = resolve(V2_LOCAL, "intents", id + ".json");
    const intent = readJson<any>(path);
    const m = purpose === "intake" ? s.intakeMandate : s.mandate;
    if (!intent?.paymentHeader) {
      if (m?.apiReservedUnits && BigInt(m.apiReservedUnits) > 0n)
        throw new Error(
          "Unresolved V2 data reservation must be inspected before a new campaign.",
        );
      continue;
    }
    if (intent.verifiedReceipt) {
      if (m) {
        m.apiReservedUnits = "0";
        m.apiSpentUnits = intent.amountUnits;
        m.actionsUsed = 1;
        if (purpose === "intake") m.status = "completed";
      }
      const ledgerPath = resolve(
        V2_LOCAL,
        "mandates",
        intent.mandateId + ".json",
      );
      const ledger = readJson<any>(ledgerPath);
      if (ledger?.intents[id] && !ledger.intents[id].settled) {
        ledger.reservedUnits = String(
          BigInt(ledger.reservedUnits) - BigInt(ledger.intents[id].amount),
        );
        ledger.spentUnits = String(
          BigInt(ledger.spentUnits) + BigInt(intent.amountUnits),
        );
        ledger.intents[id].settled = true;
        writeJson(ledgerPath, ledger);
      }
      receipt(s, {
        kind: "data",
        title: "Data charge reconciled before archive",
        amount: intent.amountUnits,
        asset: "aUSD",
        transactionHash: intent.verifiedReceipt.transactionHash,
        status: "confirmed",
        detail:
          "The original confirmed data charge is preserved; no second payment is authorized.",
      });
      continue;
    }
    const auth = intent.authorization;
    if (!auth)
      throw new Error(
        "Unresolved signed data authorization must be reconciled first.",
      );
    const account = nextWallets().executor.account.address;
    const used = await publicClient.readContract({
      address: AUSD,
      abi,
      functionName: "authorizationState",
      args: [account, auth.nonce],
    });
    if (!used) {
      const block = await publicClient.getBlock();
      if (Number(block.timestamp) < Number(auth.validBefore))
        throw new Error(
          "An unresolved data authorization is still valid. No new campaign until it settles or expires.",
        );
      intent.status = "expired-unused";
      if (m) {
        m.apiReservedUnits = "0";
        m.status = "expired";
      }
      writeJson(path, intent);
      continue;
    }
    const latest = await publicClient.getBlockNumber();
    let txHash: Hex | undefined;
    for (
      let from = BigInt(intent.startBlock), n = 0;
      from <= latest && n < 24;
      from += 2000n, n++
    ) {
      const end = from + 1999n < latest ? from + 1999n : latest;
      const logs = await publicClient.getLogs({
        address: AUSD,
        event: abi[1],
        args: { authorizer: account, nonce: auth.nonce },
        fromBlock: from,
        toBlock: end,
      });
      if (logs[0]) {
        txHash = logs[0].transactionHash!;
        break;
      }
    }
    if (!txHash)
      throw new Error(
        "The used data authorization receipt could not be located. Replacement is blocked.",
      );
    const r = await publicClient.getTransactionReceipt({ hash: txHash });
    verifyTransferReceipt(r, account, intent.amountUnits);
    intent.verifiedReceipt = {
      transactionHash: txHash,
      blockNumber: String(r.blockNumber),
      status: r.status,
    };
    intent.status = "settled-without-result";
    writeJson(path, intent);
    const ledgerPath = resolve(
      V2_LOCAL,
      "mandates",
      intent.mandateId + ".json",
    );
    const ledger = readJson<any>(ledgerPath);
    if (ledger?.intents[id] && !ledger.intents[id].settled) {
      ledger.reservedUnits = String(
        BigInt(ledger.reservedUnits) - BigInt(ledger.intents[id].amount),
      );
      ledger.spentUnits = String(
        BigInt(ledger.spentUnits) + BigInt(intent.amountUnits),
      );
      ledger.intents[id].settled = true;
      writeJson(ledgerPath, ledger);
    }
    if (m) {
      m.apiSpentUnits = intent.amountUnits;
      m.apiReservedUnits = "0";
      m.status = "completed";
    }
    receipt(s, {
      kind: "data",
      title: "Existing data charge reconciled",
      amount: intent.amountUnits,
      asset: "aUSD",
      transactionHash: txHash,
      status: "confirmed",
      detail:
        "No second payment was authorized; missing result still cannot release collateral.",
    });
  }
  saveNext(s);
}
