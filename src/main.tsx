import NextApp from "./next";
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Receipt = {
  kind: string;
  title: string;
  amount?: string;
  asset?: string;
  transactionHash?: string;
  status: string;
  at?: string | number;
  detail?: string;
};
type Check = { name: string; status: string; detail?: string };
type AppState = {
  status: string;
  updatedAt?: string;
  error?: string;
  writable?: boolean;
  mode?: string;
  onchain?: { state: number; balanceWei?: string };
  network?: { name: string; chainId: number };
  campaign?: {
    id: string;
    title?: string;
    postId: string;
    authorId: string;
    campaignCode: string;
    creator: string;
    brand: string;
    payoutWei: string;
    postedAfter: number;
    postedBefore: number;
    claimDeadline: number;
  };
  deployment?: { address: string; transactionHash?: string };
  snapshot?: {
    postId: string;
    authorId: string;
    text: string;
    createdAt: string;
    requestHash: string;
    timestamp: string;
    signature: string;
    airnode: string;
    verified: boolean;
    sourceUrl?: string;
  };
  mandate?: {
    id: string;
    status: string;
    apiPerCallUnits: string;
    apiTotalUnits: string;
    apiSpentUnits: string;
    apiReservedUnits?: string;
    maxActions: number;
    actionsUsed: number;
    gasCapWei: string;
    gasTotalCapWei?: string;
    gasSpentWei?: string;
    expiresAt: number;
    recipient: string;
    asset: string;
  };
  rawEnvelope?: {
    data: string;
    timestamp: string;
    signature: string;
    airnode: string;
    requestHash: string;
  };
  receipts?: Receipt[];
  events?: {
    id?: string;
    title: string;
    detail?: string;
    status: string;
    at?: string | number;
  }[];
  checks?: Check[];
  tamper?: {
    results: Check[];
    recorded?: boolean;
    contract?: string;
    checkedAt?: string;
  };
};

const statusNames: Record<string, string> = {
  draft: "Ready to fund",
  "funding-failed": "Funding failed",
  "funding-pending": "Funding pending",
  active: "Agreement funded",
  "data-payment-pending": "Buying snapshot",
  checking: "Checking the post",
  "submission-pending": "Payout pending",
  paid: "Creator paid",
  "source-unavailable": "Source unavailable",
  rejected: "Proof rejected",
  "budget-exhausted": "Budget exhausted",
  expired: "Mandate expired",
  refunded: "Brand refunded",
  confirmed: "Confirmed",
  pass: "Passed",
  PASS: "Passed",
  fail: "Failed",
  FAIL: "Failed",
  blocked: "Blocked",
  BLOCKED: "Blocked",
  pending: "Pending",
  PENDING: "Pending",
};
const label = (value?: string) =>
  value ? statusNames[value] || value.replaceAll("-", " ") : "Not started";
const compact = (value?: string, n = 6) =>
  value ? `${value.slice(0, n + 2)}…${value.slice(-n)}` : "—";
const explorer = (hash: string, address = false) =>
  `https://sepolia.basescan.org/${address ? "address" : "tx"}/${hash}`;
function time(value?: string | number, withDate = false) {
  if (!value) return "—";
  const date =
    typeof value === "number"
      ? new Date(value * 1000)
      : /^\d+$/.test(value)
        ? new Date(Number(value) * 1000)
        : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    ...(withDate ? { day: "2-digit", month: "short", year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
function units(
  value: string | number | undefined,
  decimals: number,
  max = decimals,
) {
  if (value === undefined || value === null) return "—";
  try {
    const negative = BigInt(value) < 0n;
    const input = (negative ? -BigInt(value) : BigInt(value))
      .toString()
      .padStart(decimals + 1, "0");
    const whole = input.slice(0, -decimals) || "0";
    const fraction = input.slice(-decimals).slice(0, max).replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
  } catch {
    return String(value);
  }
}
function tone(status?: string) {
  if (["paid", "confirmed", "pass", "PASS", "verified"].includes(status || ""))
    return "good";
  if (
    [
      "rejected",
      "FAIL",
      "fail",
      "source-unavailable",
      "budget-exhausted",
      "blocked",
      "BLOCKED",
    ].includes(status || "")
  )
    return "bad";
  if (
    [
      "pending",
      "PENDING",
      "funding-pending",
      "data-payment-pending",
      "checking",
      "submission-pending",
      "active",
    ].includes(status || "")
  )
    return "working";
  return "neutral";
}
function Badge({
  status,
  children,
}: {
  status?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={`badge ${tone(status)}`}>{children || label(status)}</span>
  );
}
function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={diagonal ? "M5 15 15 5M5 5h10v10" : "M4 10h12m-5-5 5 5-5 5"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Mark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 30 30"
      width="30"
      height="30"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 23V6h9a6 6 0 0 1 0 12H8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="m15 23 4 4 8-10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Address({ value }: { value?: string }) {
  return value ? (
    <a
      className="mono address"
      href={explorer(value, true)}
      target="_blank"
      rel="noreferrer"
      title={value}
    >
      {compact(value)}
      <Arrow diagonal />
    </a>
  ) : (
    <span className="muted">—</span>
  );
}
function ReceiptRows({ receipts }: { receipts: Receipt[] }) {
  if (!receipts.length)
    return (
      <p className="empty-row">
        The payment trail will appear after the agreement is funded.
      </p>
    );
  return (
    <div className="receipt-list">
      {receipts.map((receipt, i) => (
        <div className="receipt-row" key={`${receipt.kind}-${i}`}>
          <div
            className={`receipt-node ${tone(receipt.status)}`}
            aria-hidden="true"
          >
            {receipt.status === "confirmed" ? (
              <svg viewBox="0 0 16 16" width="12" height="12">
                <path
                  d="m3 8 3 3 7-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
              </svg>
            ) : (
              <span />
            )}
          </div>
          <div className="receipt-description">
            <strong>{receipt.title}</strong>
            <span>
              {receipt.detail ||
                (receipt.kind === "data"
                  ? "Brand API budget → TwitterAPI"
                  : receipt.kind === "payout"
                    ? "Escrow → fixed creator wallet"
                    : receipt.kind === "funding"
                      ? "Brand → agreement escrow"
                      : "Agent → agreement contract")}
            </span>
          </div>
          <div className="receipt-result">
            <strong className="num">
              {receipt.amount !== undefined
                ? `${units(receipt.amount, receipt.asset === "aUSD" ? 6 : 18, receipt.asset === "aUSD" ? 2 : 8)} ${receipt.asset === "testETH" ? "ETH" : receipt.asset || ""}`
                : label(receipt.status)}
            </strong>
            {receipt.transactionHash ? (
              <a
                href={explorer(receipt.transactionHash)}
                target="_blank"
                rel="noreferrer"
              >
                {compact(receipt.transactionHash, 4)}
                <Arrow diagonal />
              </a>
            ) : (
              <span className="muted">
                {receipt.at ? time(receipt.at) : label(receipt.status)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [view, setView] = useState<"agreement" | "trail">("agreement");
  const [proof, setProof] = useState("");
  const [proofOpen, setProofOpen] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not read the agreement.");
      setState(await response.json());
      setLoadError("");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not reach the local service.",
      );
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [refresh]);
  async function action(name: string, path: string, body: object = {}) {
    setBusy(name);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || result.error)
        throw new Error(result.error || "The action could not be completed.");
      setNotice({
        message:
          result.message ||
          (name === "tamper"
            ? "Proof protection results are available below."
            : name === "proof"
              ? "Response submitted. The payment trail shows its result."
              : "Request accepted. The payment trail will update as receipts confirm."),
        error: false,
      });
      await refresh();
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : "The action could not be completed.",
        error: true,
      });
      await refresh();
    } finally {
      setBusy("");
    }
  }
  const campaign = state?.campaign;
  const snapshot =
    state?.snapshot ||
    (() => {
      try {
        return state?.rawEnvelope
          ? ({
              ...state.rawEnvelope,
              ...JSON.parse(state.rawEnvelope.data),
              verified: false,
            } as NonNullable<AppState["snapshot"]>)
          : undefined;
      } catch {
        return undefined;
      }
    })();
  const mandate = state?.mandate;
  const receipts = state?.receipts || [];
  const isPaid = state?.status === "paid";
  const isPending = [
    "funding-pending",
    "data-payment-pending",
    "checking",
    "submission-pending",
  ].includes(state?.status || "");
  const deployed = Boolean(state?.deployment?.address);
  const canFund =
    state?.writable !== false &&
    Boolean(campaign) &&
    !deployed &&
    !isPending &&
    state?.status !== "funding-failed";
  const deadlinePassed =
    Boolean(campaign) &&
    Math.floor(Date.now() / 1000) > (campaign?.claimDeadline || Infinity);
  const canRefund =
    state?.writable !== false &&
    deployed &&
    !isPaid &&
    state?.status !== "refunded" &&
    !isPending &&
    deadlinePassed &&
    (state?.onchain?.state === undefined || state.onchain.state === 0);
  const canStart =
    !deadlinePassed &&
    state?.writable !== false &&
    deployed &&
    !isPaid &&
    !isPending &&
    !["expired", "refunded", "budget-exhausted"].includes(state?.status || "");
  const checks = state?.checks || [];
  const verifiedChecks = checks.filter((check) =>
    ["PASS", "pass", "confirmed", "verified"].includes(check.status),
  ).length;
  const outcome = isPaid
    ? "The post passed. The creator is paid."
    : state?.status === "refunded"
      ? "The deadline passed. The brand recovered its escrow."
      : state?.status === "active"
        ? "Funds are locked. The agent can check the post."
        : state?.status === "draft"
          ? "One post. One fee. Agreed before the agent acts."
          : state?.status === "source-unavailable"
            ? "The source is unavailable. Creator funds remain protected."
            : state?.status === "rejected"
              ? "This proof did not pass. Creator funds remain protected."
              : isPending
                ? "The agent is working within the agreed limits."
                : "The agreement and its evidence stay together.";
  let apiRatio = 0;
  let apiReservedRatio = 0;
  let hasApiReserved = false;
  try {
    apiRatio =
      mandate && BigInt(mandate.apiTotalUnits) > 0n
        ? Math.min(
            100,
            Number(
              (BigInt(mandate.apiSpentUnits) * 10000n) /
                BigInt(mandate.apiTotalUnits),
            ) / 100,
          )
        : 0;
    if (mandate) {
      hasApiReserved = BigInt(mandate.apiReservedUnits || "0") > 0n;
      if (BigInt(mandate.apiTotalUnits) > 0n)
        apiReservedRatio = Math.min(
          100 - apiRatio,
          Number(
            (BigInt(mandate.apiReservedUnits || "0") * 10000n) /
              BigInt(mandate.apiTotalUnits),
          ) / 100,
        );
    }
  } catch {
    /* Invalid or absent budgets have no fill. */
  }
  const pendingText =
    busy === "refund"
      ? "Refunding brand…"
      : busy === "fund"
        ? "Funding agreement…"
        : busy === "agent"
          ? "Starting agent…"
          : isPending
            ? `${label(state?.status)}…`
            : "";
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a className="wordmark" href="/" aria-label="Post and Paid home">
            <Mark />
            <span>
              Post <span className="wordmark-and">and</span> Paid
            </span>
          </a>
          <div className="header-scope">
            <span className="scope-line" />
            <span>Creator agreements</span>
            <span className="network">
              {state?.network?.name || "Base Sepolia"}{" "}
              <span className="network-dot" /> Test network
            </span>
          </div>
        </div>
      </header>
      <main className="workspace" data-ui>
        <div className="page-heading">
          <div>
            <div className="breadcrumb">
              Agreements <span>/</span> {campaign?.id || "Single post"}
            </div>
            <h1>{campaign?.title || "Single-post agreement"}</h1>
            <p>
              {state ? outcome : "Loading the agreement and its payment trail…"}
            </p>
          </div>
          <div className="heading-status">
            <div className="heading-actions">
              <Badge status={state?.status} />
              {["paid", "refunded", "funding-failed"].includes(
                state?.status || "",
              ) && (
                <button
                  className="secondary-button"
                  disabled={Boolean(busy) || state?.writable === false}
                  onClick={() => void action("new", "/api/agreement/new")}
                >
                  {busy === "new" ? "Preparing…" : "New agreement"}
                </button>
              )}
            </div>
            <span>
              {state?.updatedAt
                ? `Updated ${time(state.updatedAt)}`
                : "Local workspace"}
              <button
                className="icon-button"
                onClick={() => void refresh()}
                aria-label="Refresh agreement"
                title="Refresh agreement"
              >
                <svg viewBox="0 0 20 20" width="15" height="15" fill="none">
                  <path
                    d="M15.7 7A6 6 0 1 0 16 12M16 3v4h-4"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </span>
          </div>
        </div>
        {state?.mode === "recorded-evidence" && (
          <div className="recorded-notice" role="note">
            <strong>Recorded chain evidence</strong>
            <span>
              This read-only view shows the captured agreement and receipts.
              Configure isolated test roles to run a fresh agreement.
            </span>
          </div>
        )}
        {loadError && (
          <div className="inline-alert" role="alert">
            <span>
              {loadError}{" "}
              {state
                ? "The last known values remain below."
                : "Check that the local server is running."}
            </span>
            <button className="text-button" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        {notice && (
          <div
            className={`inline-alert ${notice.error ? "alert-error" : ""}`}
            role="status"
          >
            <span>{notice.message}</span>
            <button
              className="icon-button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}
        {state?.error && (
          <div className="inline-alert alert-error" role="alert">
            <span>{state.error}</span>
          </div>
        )}
        <div className="view-tabs" role="tablist" aria-label="Agreement views">
          <button
            role="tab"
            aria-selected={view === "agreement"}
            onClick={() => setView("agreement")}
          >
            Agreement
          </button>
          <button
            role="tab"
            aria-selected={view === "trail"}
            onClick={() => setView("trail")}
          >
            Payment trail <span>{receipts.length}</span>
          </button>
        </div>
        {view === "agreement" ? (
          <>
            <div className="agreement-grid">
              <div className="source-column">
                <section
                  className="panel post-panel"
                  aria-labelledby="post-heading"
                >
                  <div className="section-header">
                    <h2 id="post-heading">The post</h2>
                    {snapshot ? (
                      <Badge
                        status={
                          snapshot.verified
                            ? "verified"
                            : state?.status === "rejected"
                              ? "rejected"
                              : "pending"
                        }
                      >
                        {snapshot.verified
                          ? "Signed snapshot"
                          : state?.status === "rejected"
                            ? "Unaccepted snapshot"
                            : "Awaiting verification"}
                      </Badge>
                    ) : (
                      <span className="section-meta">Awaiting snapshot</span>
                    )}
                  </div>
                  <div className="post-identity">
                    <div className="account-mark" aria-hidden="true">
                      X
                    </div>
                    <div>
                      <strong>
                        {snapshot?.authorId || campaign?.authorId
                          ? `Account ${snapshot?.authorId || campaign?.authorId}`
                          : "Pinned creator account"}
                      </strong>
                      <span>
                        Post{" "}
                        <span className="mono">
                          {snapshot?.postId || campaign?.postId || "—"}
                        </span>
                      </span>
                    </div>
                    {campaign?.postId && (
                      <a
                        className="external-link"
                        href={
                          snapshot?.sourceUrl ||
                          `https://x.com/i/status/${campaign.postId}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open original post"
                      >
                        <Arrow diagonal />
                      </a>
                    )}
                  </div>
                  {snapshot?.text ? (
                    <blockquote>{snapshot.text}</blockquote>
                  ) : (
                    <div className="post-empty">
                      <span className="post-empty-line" />
                      <p>The agent has not purchased a snapshot yet.</p>
                      <span>
                        It will fetch only the post pinned to this agreement.
                      </span>
                    </div>
                  )}
                  <div className="post-footer">
                    <span>
                      {snapshot?.createdAt
                        ? time(snapshot.createdAt, true)
                        : "Published time not received"}
                    </span>
                    <span>
                      {snapshot?.timestamp
                        ? `Signed ${time(snapshot.timestamp)}`
                        : "TwitterAPI via AirnodeHub"}
                    </span>
                  </div>
                  <div className="snapshot-scope">
                    A snapshot proves what the source returned at one check. It
                    does not prove continuous publication or campaign quality.
                  </div>
                </section>
                <section
                  className="panel checks-panel"
                  aria-labelledby="checks-heading"
                >
                  <div className="section-header">
                    <h2 id="checks-heading">Acceptance rules</h2>
                    <span className="section-meta">
                      {checks.length
                        ? `${verifiedChecks} of ${checks.length} passed`
                        : "Pinned before funding"}
                    </span>
                  </div>
                  {checks.length ? (
                    <ul className="check-list">
                      {checks.map((check, i) => (
                        <li key={`${check.name}-${i}`}>
                          <span
                            className={`check-indicator ${tone(check.status)}`}
                            aria-hidden="true"
                          >
                            {["PASS", "pass", "confirmed", "verified"].includes(
                              check.status,
                            ) ? (
                              <svg
                                viewBox="0 0 16 16"
                                width="13"
                                height="13"
                                fill="none"
                              >
                                <path
                                  d="m3 8 3 3 7-7"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : ["FAIL", "fail", "rejected"].includes(
                                check.status,
                              ) ? (
                              "×"
                            ) : (
                              "·"
                            )}
                          </span>
                          <span>
                            <strong>{check.name}</strong>
                            {check.detail && (
                              <small title={check.detail}>
                                {/^0x[0-9a-fA-F]{40,}$/.test(check.detail)
                                  ? compact(check.detail, 9)
                                  : check.detail}
                              </small>
                            )}
                          </span>
                          <Badge status={check.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <dl className="rule-list">
                      <div>
                        <dt>Post and account</dt>
                        <dd>
                          <span className="mono">
                            {campaign?.postId || "—"}
                          </span>{" "}
                          by{" "}
                          <span className="mono">
                            {campaign?.authorId || "—"}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>Required text</dt>
                        <dd>
                          {campaign?.campaignCode ? (
                            <span className="code-word">
                              {campaign.campaignCode}
                            </span>
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Publication window</dt>
                        <dd>
                          {campaign
                            ? `${time(campaign.postedAfter, true)} – ${time(campaign.postedBefore, true)}`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Proof policy</dt>
                        <dd>Expected signer, exact request, timely response</dd>
                      </div>
                    </dl>
                  )}
                </section>
              </div>
              <div className="agreement-column">
                <section
                  className={`panel agreement-panel ${isPaid ? "paid-agreement" : ""}`}
                  aria-labelledby="fee-heading"
                >
                  <div className="section-header">
                    <h2 id="fee-heading">Creator fee</h2>
                    {isPaid ? (
                      <button
                        className="text-button"
                        onClick={() => setView("trail")}
                      >
                        View payment trail
                        <Arrow />
                      </button>
                    ) : (
                      <span className="section-meta">Fixed at funding</span>
                    )}
                  </div>
                  <div
                    className={`fee-value num ${isPaid ? "paid-value" : ""}`}
                  >
                    {units(campaign?.payoutWei, 18, 8)} <span>ETH</span>
                  </div>
                  <div className="fee-caption">
                    {isPaid
                      ? "Released once to the agreed creator"
                      : state?.status === "refunded"
                        ? "Returned to the brand"
                        : deployed
                          ? "Held in the agreement escrow"
                          : "To be locked in the agreement escrow"}
                  </div>
                  <dl className="agreement-parties">
                    <div>
                      <dt>Brand</dt>
                      <dd>
                        <Address value={campaign?.brand} />
                      </dd>
                    </div>
                    <div>
                      <dt>Creator receives</dt>
                      <dd>
                        <Address value={campaign?.creator} />
                      </dd>
                    </div>
                    <div>
                      <dt>Claim deadline</dt>
                      <dd className="num">
                        {time(campaign?.claimDeadline, true)}{" "}
                        <span className="muted">CET</span>
                      </dd>
                    </div>
                  </dl>
                  {!isPaid && (
                    <div className="agreement-action">
                      <button
                        className="primary-button"
                        disabled={
                          Boolean(busy) || isPending || (!canFund && !canStart)
                        }
                        onClick={() =>
                          void action(
                            canFund ? "fund" : "agent",
                            canFund ? "/api/fund" : "/api/agent/start",
                          )
                        }
                      >
                        {pendingText ||
                          (canFund
                            ? "Fund agreement"
                            : canStart
                              ? "Start procurement agent"
                              : state?.writable === false
                                ? "Test wallet unavailable"
                                : deadlinePassed && state?.status !== "refunded"
                                  ? "Agreement deadline passed"
                                  : label(state?.status))}
                        {!busy && !isPending && <Arrow />}
                      </button>
                      <p>
                        {state?.writable === false
                          ? "Local test roles are not configured. See the setup instructions."
                          : canFund
                            ? "The beneficiary and delivery rules cannot change after funding."
                            : canStart
                              ? "One delegation covers the snapshot purchase and eligible payout."
                              : isPaid
                                ? "The escrow can pay this agreement only once."
                                : state?.status === "refunded"
                                  ? "The creator fee was returned after the claim deadline."
                                  : deadlinePassed
                                    ? "The claim deadline has passed. The brand can recover the unpaid fee."
                                    : "The receipt must confirm before another action can begin."}
                      </p>
                      {canRefund && (
                        <button
                          className="secondary-button refund-button"
                          disabled={Boolean(busy)}
                          onClick={() => void action("refund", "/api/refund")}
                        >
                          {busy === "refund"
                            ? "Refunding brand…"
                            : "Refund brand"}
                          <Arrow />
                        </button>
                      )}
                    </div>
                  )}
                </section>
                <section
                  className="panel mandate-panel"
                  aria-labelledby="mandate-heading"
                >
                  <div className="section-header">
                    <h2 id="mandate-heading">Agent mandate</h2>
                    <Badge status={mandate?.status}>
                      {mandate
                        ? mandate.status === "awaiting-authorization"
                          ? "Awaiting authorization"
                          : label(mandate.status)
                        : "Not authorized"}
                    </Badge>
                  </div>
                  <div className="budget-title">
                    <span>Data budget used</span>
                    <strong className="num">
                      {mandate ? units(mandate.apiSpentUnits, 6, 2) : "0"}{" "}
                      <span>
                        / {mandate ? units(mandate.apiTotalUnits, 6, 2) : "—"}{" "}
                        aUSD
                      </span>
                    </strong>
                  </div>
                  <div
                    className="budget-track"
                    role="progressbar"
                    aria-label="Data budget spent and reserved"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={apiRatio + apiReservedRatio}
                  >
                    <span style={{ width: `${apiRatio}%` }} />
                    <span
                      className="reserved-segment"
                      style={{ width: `${apiReservedRatio}%` }}
                    />
                  </div>
                  {hasApiReserved && (
                    <p className="reserved-note">
                      <span className="num">
                        {units(mandate?.apiReservedUnits, 6, 6)} aUSD
                      </span>{" "}
                      reserved for an unresolved authorization. Not confirmed
                      spent.
                    </p>
                  )}
                  <dl className="mandate-limits">
                    <div>
                      <dt>Per snapshot</dt>
                      <dd className="num">
                        {units(mandate?.apiPerCallUnits, 6, 2)} aUSD
                      </dd>
                    </div>
                    <div>
                      <dt>Authorized checks</dt>
                      <dd className="num">
                        {mandate
                          ? `${mandate.actionsUsed} / ${mandate.maxActions}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt title="The executor checks a transaction estimate before submission; final chain fees are reconciled separately.">
                        Gas preflight cap
                      </dt>
                      <dd className="num">
                        {units(mandate?.gasCapWei, 18, 8)} ETH
                      </dd>
                    </div>
                    <div>
                      <dt title="Confirmed L2 execution, L1 data and operator fees, reconciled from the actual receipt.">
                        Gas paid
                      </dt>
                      <dd
                        className="num"
                        title={
                          mandate?.gasSpentWei !== undefined
                            ? `${mandate.gasSpentWei} wei (exact)`
                            : "Gas receipt not reconciled"
                        }
                      >
                        {units(mandate?.gasSpentWei, 18, 12)} ETH
                      </dd>
                    </div>
                    <div>
                      <dt>Expires</dt>
                      <dd className="num">
                        {mandate?.status === "awaiting-authorization"
                          ? "30 minutes from start"
                          : `${time(mandate?.expiresAt)} CET`}
                      </dd>
                    </div>
                  </dl>
                  <p className="mandate-note">
                    Only this post and fixed recipients. No automatic top-ups.
                  </p>
                  <details className="mandate-scope">
                    <summary>How the limits are enforced</summary>
                    <p>
                      The API budget and action limit are enforced by this local
                      executor. The gas preflight checks the signed L2 maximum
                      plus buffered L1 and operator quotes; L1 prices can change
                      before inclusion. The contract fixes the creator and fee,
                      verifies the proof and permits one payout. Gas paid
                      includes L2 execution, L1 data and operator fees after
                      receipt reconciliation. Total gas preflight budget:{" "}
                      {units(mandate?.gasTotalCapWei, 18, 8)} ETH. Data seller:{" "}
                      <Address value={mandate?.recipient} />. Rejected delivery
                      can still incur an API charge or transaction fees.
                    </p>
                  </details>
                </section>
              </div>
            </div>
            <section
              className="panel trail-preview"
              aria-labelledby="trail-heading"
            >
              <div className="section-header">
                <h2 id="trail-heading">Payment trail</h2>
                <button
                  className="text-button"
                  onClick={() => setView("trail")}
                >
                  View evidence
                  <Arrow />
                </button>
              </div>
              <ReceiptRows receipts={receipts.slice(-3)} />
            </section>
          </>
        ) : (
          <div className="trail-grid">
            <section
              className="panel full-trail"
              aria-labelledby="all-trail-heading"
            >
              <div className="section-header">
                <h2 id="all-trail-heading">Payments and receipts</h2>
                <a
                  className="text-button"
                  href="/api/evidence"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open evidence
                  <Arrow diagonal />
                </a>
              </div>
              <ReceiptRows receipts={receipts} />
              {(state?.events || []).length > 0 && (
                <div className="event-section">
                  <h3>Agent activity</h3>
                  <ul className="event-list">
                    {state?.events?.map((event, i) => (
                      <li key={event.id || i}>
                        <div>
                          <strong>{event.title}</strong>
                          {event.detail && <span>{event.detail}</span>}
                        </div>
                        <span className="event-time num">{time(event.at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            <section className="panel proof-details">
              <div className="section-header">
                <h2>Signed evidence</h2>
              </div>
              <dl className="evidence-values">
                <div>
                  <dt>Contract</dt>
                  <dd>
                    <Address value={state?.deployment?.address} />
                  </dd>
                </div>
                <div>
                  <dt>Airnode signer</dt>
                  <dd>
                    <Address value={snapshot?.airnode} />
                  </dd>
                </div>
                <div>
                  <dt>Request hash</dt>
                  <dd className="mono wrap-value">
                    {snapshot?.requestHash || "—"}
                  </dd>
                </div>
                <div>
                  <dt>Signed at</dt>
                  <dd>
                    {time(snapshot?.timestamp, true)} {snapshot ? "CET" : ""}
                  </dd>
                </div>
                <div>
                  <dt>Signature</dt>
                  <dd className="mono wrap-value">
                    {snapshot?.signature
                      ? compact(snapshot.signature, 12)
                      : "—"}
                  </dd>
                </div>
              </dl>
              <p className="muted evidence-note">
                The contract authenticates the source response. It inherits the
                accuracy and availability risks of X, TwitterAPI and the
                Airnode.
              </p>
            </section>
          </div>
        )}
        <section
          className="verification-section"
          aria-labelledby="verification-heading"
        >
          <div className="section-header">
            <div>
              <h2 id="verification-heading">Proof verification</h2>
              <p>Test a response against the same fixed agreement rules.</p>
            </div>
            <div className="verification-actions">
              <button
                className="secondary-button"
                onClick={() => setProofOpen(!proofOpen)}
                aria-expanded={proofOpen}
              >
                {proofOpen ? "Close proof form" : "Submit proof"}
              </button>
              <button
                className="secondary-button"
                disabled={
                  Boolean(busy) || !deployed || state?.writable === false
                }
                onClick={() => void action("tamper", "/api/tamper")}
              >
                {busy === "tamper"
                  ? "Checking protections…"
                  : "Check proof protections"}
              </button>
            </div>
          </div>
          {proofOpen && (
            <form
              className="proof-form"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const response = JSON.parse(proof);
                  void action("proof", "/api/proof", { response });
                } catch {
                  setNotice({
                    message:
                      "The response must be valid JSON. Paste the full signed envelope.",
                    error: true,
                  });
                }
              }}
            >
              <label htmlFor="proof-json">Signed Airnode response</label>
              <textarea
                id="proof-json"
                value={proof}
                onChange={(event) => setProof(event.target.value)}
                placeholder={
                  '{ "airnode": "0x…", "requestHash": "0x…", "timestamp": "…", "data": "…", "signature": "0x…" }'
                }
                rows={6}
                required
                spellCheck={false}
              />
              {notice?.error && (
                <p className="form-error" role="alert">
                  {notice.message}
                </p>
              )}
              <div>
                <p>
                  Keep the signed data string byte for byte. An invalid response
                  cannot release the creator fee.
                </p>
                <button
                  className="primary-button"
                  disabled={
                    Boolean(busy) ||
                    !deployed ||
                    state?.writable === false ||
                    !proof.trim()
                  }
                >
                  {busy === "proof" ? "Submitting…" : "Verify and submit"}
                  <Arrow />
                </button>
              </div>
            </form>
          )}
          {state?.tamper?.recorded &&
            (state.tamper.results || []).length > 0 && (
              <p className="section-meta" style={{ marginTop: 18 }}>
                Recorded rejection checks · {time(state.tamper.checkedAt, true)}{" "}
                CET · <Address value={state.tamper.contract} />
              </p>
            )}
          {(state?.tamper?.results || []).length > 0 && (
            <div className="tamper-results">
              {state?.tamper?.results.map((check, i) => (
                <div className="tamper-result" key={`${check.name}-${i}`}>
                  <span>{check.name}</span>
                  <Badge status={check.status} />
                  {check.detail && (
                    <small title={check.detail}>
                      {/^0x[0-9a-fA-F]{40,}$/.test(check.detail)
                        ? compact(check.detail, 9)
                        : check.detail}
                    </small>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        <footer className="workspace-footer">
          <p>
            Historical public post · test agreement · no commissioned
            advertising relationship
          </p>
          <span>Creator fee, API charge and gas are separate costs.</span>
        </footer>
      </main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname === "/next" ||
    window.location.pathname.startsWith("/next/") ? (
      <NextApp />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
