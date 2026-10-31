import React, { useCallback, useEffect, useState } from "react";
import "./styles.css";
import "./next.css";

type Check = { name: string; status: string; detail?: string };
type Receipt = {
  kind: string;
  title: string;
  amount?: string;
  asset?: string;
  transactionHash?: string;
  status: string;
  at?: string;
  detail?: string;
};
type Campaign = {
  agreementId: string;
  nonce: string;
  brand: string;
  creator: string;
  authorId: string;
  postId: string;
  requiredText: string;
  asset: string;
  feeWei: string;
  postedAfter: number;
  postedBefore: number;
  claimDeadline: number;
  consentDeadline: number;
  maxResponseAge: number;
};
type TypedData = {
  domain: {
    name?: string;
    version?: string;
    chainId?: number | string;
    verifyingContract?: string;
  };
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
};
type NextState = {
  status: string;
  updatedAt?: string;
  error?: string;
  writable?: boolean;
  network?: { name: string; chainId: number };
  brand?: string;
  creator?: string;
  factory?: { address: string; transactionHash?: string };
  campaign?: Campaign;
  challenge?: string;
  typedData?: TypedData;
  consent?: {
    verified: boolean;
    signature?: string;
    termsHash?: string;
    recovered?: string;
    at?: string;
    error?: string;
  };
  intake?: {
    verified: boolean;
    error?: string;
    envelope?: {
      data: string;
      timestamp: string;
      airnode: string;
      requestHash: string;
      signature: string;
    };
    checks?: Check[];
    purchased?: boolean;
  };
  deployment?: { address: string; transactionHash?: string };
  mandate?: {
    status?: string;
    apiSpentUnits?: string;
    apiPerCallUnits?: string;
    apiTotalUnits?: string;
    apiReservedUnits?: string;
    gasSpentWei?: string;
    gasCapWei?: string;
    expiresAt?: number;
    actionsUsed?: number;
    maxActions?: number;
  };
  limits?: {
    intakeFeeUnits: string;
    agentFeeUnits: string;
    apiTotalCapUnits: string;
    gasCapWei?: string;
    gasTotalCapWei?: string;
  };
  receipts?: Receipt[];
  events?: {
    id?: string;
    title: string;
    detail?: string;
    status?: string;
    at?: string;
  }[];
  pilot?: { status: string; detail?: string };
  checks?: Check[];
};
type WalletProvider = {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
};
const names: Record<string, string> = {
  empty: "Awaiting creator",
  draft: "Challenge ready",
  "awaiting-post": "Awaiting post",
  "post-pinned": "Post pinned",
  "awaiting-consent": "Awaiting consent",
  "consent-verified": "Consent verified",
  "intake-pending": "Buying post evidence",
  "intake-verified": "Intake verified",
  "intake-rejected": "Post not accepted",
  "funding-pending": "Funding pending",
  "funding-retry": "Funding needs reconciliation",
  funded: "Agreement funded",
  active: "Agreement funded",
  "data-payment-pending": "Buying snapshot",
  checking: "Checking proof",
  "submission-pending": "Payout pending",
  paid: "Creator paid",
  refunded: "Brand refunded",
  rejected: "Rejected",
  "source-unavailable": "Source unavailable",
  pending: "Pending",
  pass: "Passed",
  PASS: "Passed",
  fail: "Failed",
  FAIL: "Failed",
  confirmed: "Confirmed",
  completed: "Completed",
  verified: "Verified",
};
const label = (value?: string) =>
  value ? names[value] || value.replaceAll("-", " ") : "Not started";
const short = (value?: string, length = 6) =>
  value ? `${value.slice(0, length + 2)}…${value.slice(-length)}` : "—";
const explorer = (value: string, address = false) =>
  `https://sepolia.basescan.org/${address ? "address" : "tx"}/${value}`;
function amount(value?: string, decimals = 18, max = 8) {
  if (value === undefined) return "—";
  try {
    const n = BigInt(value);
    const s = (n < 0n ? -n : n).toString().padStart(decimals + 1, "0");
    const fraction = s.slice(-decimals).slice(0, max).replace(/0+$/, "");
    return `${n < 0n ? "-" : ""}${s.slice(0, -decimals) || "0"}${fraction ? `.${fraction}` : ""}`;
  } catch {
    return "—";
  }
}
function when(value?: number | string, date = false) {
  if (!value) return "—";
  const parsed =
    typeof value === "number" || /^\d+$/.test(String(value))
      ? new Date(Number(value) * 1000)
      : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    ...(date ? { day: "2-digit", month: "short", year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}
function statusTone(status?: string) {
  if (
    [
      "paid",
      "verified",
      "confirmed",
      "pass",
      "PASS",
      "consent-verified",
      "intake-verified",
    ].includes(status || "")
  )
    return "good";
  if (
    [
      "rejected",
      "intake-rejected",
      "fail",
      "FAIL",
      "source-unavailable",
    ].includes(status || "")
  )
    return "bad";
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
    <span className={`badge ${statusTone(status)}`}>
      {children || label(status)}
    </span>
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
      className="v2-address mono"
      href={explorer(value, true)}
      target="_blank"
      rel="noreferrer"
      title={value}
    >
      {short(value)}
      <Arrow diagonal />
    </a>
  ) : (
    <span className="muted">—</span>
  );
}
function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="v2-checks">
      {checks.map((check, i) => (
        <li key={`${check.name}-${i}`}>
          <div>
            <strong>{check.name}</strong>
            {check.detail && <span title={check.detail}>{check.detail}</span>}
          </div>
          <Badge status={check.status} />
        </li>
      ))}
    </ul>
  );
}

export default function NextApp() {
  const [state, setState] = useState<NextState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [creator, setCreator] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [postId, setPostId] = useState("");
  const [signature, setSignature] = useState("");
  const [connected, setConnected] = useState("");
  const [editPost, setEditPost] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [view, setView] = useState<"intake" | "trail">("intake");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/next/state", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not read creator intake.");
      setState(await response.json());
      setLoadError("");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not reach the local workspace.",
      );
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    setPostId(state?.campaign?.postId || "");
  }, [state?.campaign?.agreementId, state?.campaign?.postId]);
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
        throw new Error(result.error || "This step could not be completed.");
      await refresh();
      setNotice({
        text: result.message || "The intake record was updated.",
        error: false,
      });
      return true;
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "This step could not be completed.",
        error: true,
      });
      await refresh();
      return false;
    } finally {
      setBusy("");
    }
  }
  async function copy(text: string, name: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ text: `${name} copied.`, error: false });
    } catch {
      setNotice({
        text: "Clipboard access is unavailable. Select the text and copy it manually.",
        error: true,
      });
    }
  }
  const provider = () =>
    (window as unknown as { ethereum?: WalletProvider }).ethereum;
  async function connectWallet() {
    const wallet = provider();
    if (!wallet) {
      setNotice({
        text: "No browser wallet was found. You can sign the typed data externally and paste its signature below.",
        error: true,
      });
      return;
    }
    setBusy("wallet");
    setNotice(null);
    try {
      const accounts = (await wallet.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts?.[0])
        throw new Error("The wallet did not return an account.");
      const chain = await wallet.request({ method: "eth_chainId" });
      if (Number.parseInt(String(chain), 16) !== 84532)
        throw new Error(
          "Switch your wallet to Base Sepolia (84532), then connect again.",
        );
      setConnected(accounts[0]);
      if (!state?.campaign) setCreator(accounts[0]);
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "Wallet connection was declined.",
        error: true,
      });
    } finally {
      setBusy("");
    }
  }
  async function signTerms() {
    const wallet = provider(),
      campaign = state?.campaign,
      typedData = state?.typedData;
    if (!wallet || !campaign || !typedData) {
      setNotice({
        text: "Connect a browser wallet and pin the post before signing. External signatures can also be pasted below.",
        error: true,
      });
      return;
    }
    const domain = typedData.domain;
    if (
      domain.name !== "Post and Paid" ||
      domain.version !== "2" ||
      Number(domain.chainId) !== 84532 ||
      !state?.factory?.address ||
      domain.verifyingContract?.toLowerCase() !==
        state.factory.address.toLowerCase()
    ) {
      setNotice({
        text: "The consent domain does not match this intake verifier. No signature was requested.",
        error: true,
      });
      return;
    }
    setBusy("sign");
    setNotice(null);
    try {
      const accounts = (await wallet.request({
        method: "eth_requestAccounts",
      })) as string[];
      const account = accounts?.[0];
      if (!account || account.toLowerCase() !== campaign.creator.toLowerCase())
        throw new Error(
          "Choose the creator beneficiary account in your wallet. Another account cannot accept these terms.",
        );
      const chain = await wallet.request({ method: "eth_chainId" });
      if (Number.parseInt(String(chain), 16) !== 84532)
        throw new Error(
          "Switch your wallet to Base Sepolia (84532) before signing.",
        );
      const signed = await wallet.request({
        method: "eth_signTypedData_v4",
        params: [account, JSON.stringify(typedData)],
      });
      if (typeof signed !== "string" || !signed.startsWith("0x"))
        throw new Error("The wallet did not return a signature.");
      setConnected(account);
      setSignature(signed);
      const okay = await action("consent", "/api/next/consent", {
        signature: signed,
      });
      if (!okay) return;
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "The signature request was declined.",
        error: true,
      });
    } finally {
      setBusy("");
    }
  }
  const campaign = state?.campaign;
  const consent = state?.consent;
  const intake = state?.intake;
  const challenge = state?.challenge || campaign?.requiredText || "";
  const receipts = state?.receipts || [];
  const deployed = Boolean(state?.deployment?.address);
  const paid = state?.status === "paid";
  const refunded = state?.status === "refunded";
  const fundingRetry = state?.status === "funding-retry";
  const deadlinePassed = Boolean(
    campaign?.claimDeadline &&
      Math.floor(Date.now() / 1000) >= campaign.claimDeadline,
  );
  const canRefund = deployed && !paid && !refunded && deadlinePassed;
  const canReplaceCampaign =
    (!deployed &&
      !["funding-pending", "funding-retry"].includes(state?.status || "")) ||
    paid ||
    refunded;
  const pending = [
    "intake-pending",
    "funding-pending",
    "data-payment-pending",
    "checking",
    "submission-pending",
  ].includes(state?.status || "");
  const locked = Boolean(busy) || pending;
  const canWrite = Boolean(state) && state?.writable !== false;
  const consentExpired = Boolean(
    campaign?.consentDeadline &&
      Math.floor(Date.now() / 1000) >= campaign.consentDeadline,
  );
  const hasPost = Boolean(campaign?.postId);
  const phase = !campaign
    ? 0
    : !hasPost
      ? 1
      : !consent?.verified
        ? 2
        : !intake?.verified
          ? 3
          : !deployed
            ? 4
            : paid || refunded
              ? 6
              : 5;
  const headline = paid
    ? "The accepted post is paid."
    : refunded
      ? "The unpaid fee was returned to the brand. The creator was not paid."
      : fundingRetry
        ? "Funding needs reconciliation. Resume the recorded attempt."
        : deployed && deadlinePassed
          ? "The claim deadline passed. The brand can recover the unpaid fee."
          : deployed
            ? "The agreement is funded. The agent can finish the check."
            : intake?.verified
              ? "The signed post matches. The brand can fund the agreement."
              : consent?.verified
                ? "Wallet consent is valid. The post still needs source verification."
                : hasPost
                  ? "The post is pinned. The creator can review and sign."
                  : campaign
                    ? "The challenge is ready for the creator’s own post."
                    : "Create the challenge before the creator posts.";
  const typedJSON = state?.typedData
    ? JSON.stringify(state.typedData, null, 2)
    : "";
  let sourceText = "";
  let sourceCreatedAt = "";
  try {
    if (intake?.envelope?.data) {
      const source = JSON.parse(intake.envelope.data);
      sourceText = typeof source.text === "string" ? source.text : "";
      sourceCreatedAt =
        typeof source.createdAt === "string" ? source.createdAt : "";
    }
  } catch {
    /* Unparseable evidence is not presented as an accepted post. */
  }

  return (
    <div className="v2-root">
      <header className="v2-header">
        <div className="v2-header-inner">
          <a
            className="wordmark"
            href="/"
            aria-label="Post and Paid original agreement"
          >
            <Mark />
            <span>
              Post <span className="wordmark-and">and</span> Paid
            </span>
          </a>
          <span className="v2-header-scope">Creator intake</span>
          <div className="v2-header-links">
            <a href="/">
              Original agreement
              <Arrow />
            </a>
            <span>{state?.network?.name || "Base Sepolia"} · Test network</span>
          </div>
        </div>
      </header>
      <main className="v2-workspace" data-ui>
        <div className="v2-heading">
          <div>
            <div className="v2-breadcrumb">
              Creator agreements <span>/</span>{" "}
              {campaign ? short(campaign.agreementId, 7) : "New intake"}
            </div>
            <h1>Creator intake</h1>
            <p>{state ? headline : "Loading the creator agreement…"}</p>
          </div>
          <div className="v2-heading-meta">
            <Badge status={state?.status} />
            <button
              className="v2-text"
              onClick={() => void refresh()}
              aria-label="Refresh creator intake"
            >
              {state?.updatedAt
                ? `Updated ${when(state.updatedAt)}`
                : "Refresh"}
              <svg
                viewBox="0 0 20 20"
                width="14"
                height="14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M15.7 7A6 6 0 1 0 16 12M16 3v4h-4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        {loadError && (
          <div className="v2-alert" role="alert">
            <span>
              {loadError}{" "}
              {state
                ? "Last known values remain below."
                : "Check that the local server is running."}
            </span>
            <button className="v2-text" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        {notice && (
          <div
            className={`v2-alert ${notice.error ? "v2-alert-error" : ""}`}
            role="status"
          >
            <span>{notice.text}</span>
            <button
              className="v2-dismiss"
              aria-label="Dismiss message"
              onClick={() => setNotice(null)}
            >
              ×
            </button>
          </div>
        )}
        {state?.error && state.error !== notice?.text && (
          <div className="v2-alert v2-alert-error" role="alert">
            {state.error}
          </div>
        )}
        {state?.pilot?.status === "pending" && (
          <div className="v2-pilot">
            <span className="v2-pilot-dot" />
            <p>
              <strong>Creator post pending.</strong>{" "}
              {state.pilot.detail ||
                "The creator publishes the copied challenge from their own X account, then provides its post ID. No new creator payout is claimed yet."}
            </p>
          </div>
        )}
        <div
          className="v2-tabs"
          role="tablist"
          aria-label="Creator intake views"
        >
          <button
            role="tab"
            aria-selected={view === "intake"}
            onClick={() => setView("intake")}
          >
            Intake
          </button>
          <button
            role="tab"
            aria-selected={view === "trail"}
            onClick={() => setView("trail")}
          >
            Payment trail <span>{receipts.length}</span>
          </button>
        </div>
        {view === "intake" ? (
          <div className="v2-grid">
            <div className="v2-main-column">
              {(!campaign || (showDraft && canReplaceCampaign)) && (
                <section className="v2-panel" aria-labelledby="v2-create-title">
                  <div className="v2-panel-heading">
                    <h2 id="v2-create-title">Creator and account</h2>
                    {campaign && (
                      <button
                        className="v2-text"
                        onClick={() => setShowDraft(false)}
                      >
                        Keep current intake
                      </button>
                    )}
                  </div>
                  <p className="v2-description">
                    The beneficiary wallet and numeric X account will be part of
                    the creator’s signed terms.
                  </p>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void action("campaign", "/api/next/campaign", {
                        creator: creator.trim(),
                        authorId: authorId.trim(),
                      }).then((ok) => {
                        if (ok) {
                          setShowDraft(false);
                          setPostId("");
                          setSignature("");
                          setConnected("");
                        }
                      });
                    }}
                  >
                    <div className="v2-field">
                      <label htmlFor="v2-creator">
                        Creator beneficiary wallet
                      </label>
                      <input
                        id="v2-creator"
                        value={creator}
                        onChange={(event) => setCreator(event.target.value)}
                        placeholder="0x…"
                        autoComplete="off"
                        spellCheck={false}
                        required
                        pattern="0x[0-9a-fA-F]{40}"
                      />
                      <span>
                        The wallet that accepts the agreement and receives its
                        fee.
                      </span>
                    </div>
                    <div className="v2-field">
                      <label htmlFor="v2-author">X author ID</label>
                      <input
                        id="v2-author"
                        value={authorId}
                        onChange={(event) => setAuthorId(event.target.value)}
                        placeholder="Numeric account ID"
                        inputMode="numeric"
                        autoComplete="off"
                        required
                        pattern="[1-9][0-9]*"
                      />
                      <span>Use the numeric account ID, not the @handle.</span>
                    </div>
                    <div className="v2-form-actions">
                      <button
                        className="v2-primary"
                        disabled={locked || !canWrite}
                      >
                        {busy === "campaign"
                          ? "Creating challenge…"
                          : "Create campaign challenge"}
                        <Arrow />
                      </button>
                      <button
                        type="button"
                        className="v2-secondary"
                        onClick={() => void connectWallet()}
                        disabled={locked}
                      >
                        {connected ? "Reconnect wallet" : "Use my wallet"}
                      </button>
                    </div>
                    {connected && (
                      <p className="v2-field-note">
                        Connected <Address value={connected} />
                      </p>
                    )}
                    {state?.writable === false && (
                      <p className="v2-field-note">
                        An isolated test executor is unavailable. See the local
                        setup instructions.
                      </p>
                    )}
                  </form>
                </section>
              )}
              {campaign && (!showDraft || !canReplaceCampaign) && (
                <>
                  <section
                    className="v2-panel v2-challenge-panel"
                    aria-labelledby="v2-challenge-title"
                  >
                    <div className="v2-panel-heading">
                      <h2 id="v2-challenge-title">The campaign challenge</h2>
                      <button
                        className="v2-text"
                        disabled={!challenge}
                        onClick={() => void copy(challenge, "Challenge")}
                      >
                        Copy challenge
                        <svg
                          viewBox="0 0 20 20"
                          width="15"
                          height="15"
                          fill="none"
                          aria-hidden="true"
                        >
                          <rect
                            x="7"
                            y="7"
                            width="9"
                            height="10"
                            rx="1.5"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          />
                          <path
                            d="M12 7V3H3v10h4"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <p className="v2-description">
                      Include this complete line in a post from the agreed X
                      account. Keep the nonce and wallet address unchanged.
                    </p>
                    <div
                      className="v2-challenge"
                      tabIndex={0}
                      aria-label="Campaign challenge"
                    >
                      {challenge || "Challenge not generated"}
                    </div>
                    <div className="v2-challenge-foot">
                      <span>
                        Creator <Address value={campaign.creator} />
                      </span>
                      <span>
                        Account{" "}
                        <span className="mono">{campaign.authorId}</span>
                      </span>
                    </div>
                    {(!hasPost || editPost) && !consent?.verified ? (
                      <form
                        className="v2-post-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void action("post", "/api/next/post", {
                            postId: postId.trim(),
                          }).then((ok) => {
                            if (ok) {
                              setEditPost(false);
                              setSignature("");
                            }
                          });
                        }}
                      >
                        <div className="v2-field">
                          <label htmlFor="v2-post">Published post ID</label>
                          <div className="v2-joined">
                            <input
                              id="v2-post"
                              value={postId}
                              onChange={(event) =>
                                setPostId(event.target.value)
                              }
                              inputMode="numeric"
                              placeholder="Post ID containing this challenge"
                              required
                              pattern="[1-9][0-9]*"
                              autoComplete="off"
                            />
                            <button
                              className="v2-secondary"
                              disabled={locked || !canWrite}
                            >
                              {busy === "post" ? "Pinning…" : "Pin post"}
                            </button>
                          </div>
                          <span>
                            Pin the post before signing. Once accepted, changed
                            terms require a new campaign.
                          </span>
                        </div>
                      </form>
                    ) : (
                      <div className="v2-pinned">
                        <div>
                          <span className="v2-small-label">Pinned post</span>
                          <a
                            className="mono"
                            href={`https://x.com/i/status/${campaign.postId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {campaign.postId}
                            <Arrow diagonal />
                          </a>
                        </div>
                        {!deployed && !consent?.verified && (
                          <button
                            className="v2-text"
                            disabled={locked}
                            onClick={() => setEditPost(true)}
                          >
                            Change post
                          </button>
                        )}
                      </div>
                    )}
                    {hasPost && consent?.verified && !deployed && (
                      <p className="v2-field-note">
                        Signed terms are fixed; start a different campaign to
                        change them.
                      </p>
                    )}
                  </section>
                  {hasPost && (
                    <section
                      className="v2-panel"
                      aria-labelledby="v2-consent-title"
                    >
                      <div className="v2-panel-heading">
                        <h2 id="v2-consent-title">Creator’s wallet consent</h2>
                        {consent?.verified ? (
                          <Badge status="verified">Signature verified</Badge>
                        ) : (
                          <span className="v2-meta">Signs the exact terms</span>
                        )}
                      </div>
                      {consent?.verified ? (
                        <div className="v2-consent-result">
                          <p>
                            The signature recovers to the fixed beneficiary.
                          </p>
                          <Address
                            value={consent.recovered || campaign.creator}
                          />
                          {consent.termsHash && (
                            <div className="v2-hash">
                              <span>Terms hash</span>
                              <code title={consent.termsHash}>
                                {consent.termsHash}
                              </code>
                            </div>
                          )}
                          <p className="v2-field-note">
                            Wallet consent alone does not prove control of the X
                            account. The source check must match the challenge
                            in its post.
                          </p>
                        </div>
                      ) : (
                        <>
                          <p className="v2-description">
                            Review the fee, post and deadlines beside this form.
                            Your signature accepts these terms; it does not send
                            a transaction.
                          </p>
                          <div className="v2-form-actions">
                            <button
                              className="v2-primary"
                              disabled={
                                locked ||
                                !canWrite ||
                                !state?.typedData ||
                                consentExpired
                              }
                              onClick={() => void signTerms()}
                            >
                              {busy === "sign" || busy === "consent"
                                ? "Checking consent…"
                                : "Sign these terms"}
                              <Arrow />
                            </button>
                            <button
                              className="v2-secondary"
                              disabled={locked}
                              onClick={() => void connectWallet()}
                            >
                              {connected ? "Change wallet" : "Connect wallet"}
                            </button>
                          </div>
                          {connected && (
                            <p className="v2-field-note">
                              Connected <Address value={connected} />
                            </p>
                          )}
                          {consentExpired && (
                            <p className="v2-error">
                              These consent terms have expired. Create a fresh
                              campaign challenge.
                            </p>
                          )}
                          <details className="v2-external">
                            <summary>
                              Use a signature from another wallet
                            </summary>
                            <p>
                              Copy the typed data, sign it with the beneficiary
                              account, then paste the returned signature. Never
                              paste a private key or recovery phrase.
                            </p>
                            <button
                              className="v2-text"
                              disabled={!typedJSON}
                              onClick={() => void copy(typedJSON, "Typed data")}
                            >
                              Copy typed data JSON
                              <Arrow />
                            </button>
                            <details className="v2-raw">
                              <summary>Read typed data</summary>
                              <pre>
                                {typedJSON ||
                                  "Pin a post and wait for the verifier before signing."}
                              </pre>
                            </details>
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                void action("consent", "/api/next/consent", {
                                  signature: signature.trim(),
                                });
                              }}
                            >
                              <div className="v2-field">
                                <label htmlFor="v2-signature">
                                  Creator signature
                                </label>
                                <textarea
                                  id="v2-signature"
                                  value={signature}
                                  onChange={(event) =>
                                    setSignature(event.target.value)
                                  }
                                  placeholder="0x…"
                                  spellCheck={false}
                                  rows={3}
                                  required
                                />
                              </div>
                              <button
                                className="v2-secondary"
                                disabled={
                                  locked ||
                                  !canWrite ||
                                  !signature.trim() ||
                                  consentExpired
                                }
                              >
                                {busy === "consent"
                                  ? "Verifying…"
                                  : "Verify creator signature"}
                              </button>
                            </form>
                          </details>
                          {notice?.error && (
                            <p className="v2-error" role="alert">
                              {notice.text}
                            </p>
                          )}
                        </>
                      )}
                    </section>
                  )}
                  {consent?.verified && (
                    <section
                      className="v2-panel"
                      aria-labelledby="v2-intake-title"
                    >
                      <div className="v2-panel-heading">
                        <h2 id="v2-intake-title">Verify the published post</h2>
                        {intake?.verified && (
                          <Badge status="verified">Intake verified</Badge>
                        )}
                      </div>
                      {sourceText && (
                        <>
                          <blockquote className="v2-source-text">
                            {sourceText}
                          </blockquote>
                          <div className="v2-challenge-foot v2-source-times">
                            <span>
                              Published {when(sourceCreatedAt, true)} CET
                            </span>
                            <span>
                              Source signed{" "}
                              {when(intake?.envelope?.timestamp, true)} CET
                            </span>
                          </div>
                        </>
                      )}
                      <p className="v2-description">
                        The signed source response must match the pinned post,
                        author and the complete challenge. A signature from the
                        wallet is not enough.
                      </p>
                      {intake?.checks?.length || state?.checks?.length ? (
                        <CheckList
                          checks={intake?.checks || state?.checks || []}
                        />
                      ) : (
                        <div className="v2-source-empty">
                          <span>No accepted post evidence yet.</span>
                          <span>
                            The creator fee stays unfunded until intake passes.
                          </span>
                        </div>
                      )}
                      {intake?.error && (
                        <p className="v2-error" role="alert">
                          {intake.error}
                        </p>
                      )}
                      {!intake?.verified && (
                        <div className="v2-step-action">
                          <button
                            className="v2-primary"
                            disabled={
                              locked ||
                              !canWrite ||
                              consentExpired ||
                              Boolean(intake?.purchased)
                            }
                            onClick={() =>
                              void action("intake", "/api/next/intake")
                            }
                          >
                            {busy === "intake" ||
                            state?.status === "intake-pending"
                              ? "Buying and checking…"
                              : intake?.purchased
                                ? "Check recorded"
                                : "Verify published post"}
                            <Arrow />
                          </button>
                          <p>
                            {intake?.purchased ? (
                              "This check is recorded. Start a new campaign for different terms."
                            ) : (
                              <>
                                Data purchase cap:{" "}
                                <strong className="num">
                                  {state?.limits
                                    ? amount(state.limits.intakeFeeUnits, 6, 2)
                                    : "0.01"}{" "}
                                  test aUSD
                                </strong>
                                . This external fee can be spent even when the
                                post is rejected.
                              </>
                            )}
                          </p>
                        </div>
                      )}
                    </section>
                  )}
                  {intake?.verified && (
                    <section
                      className="v2-panel"
                      aria-labelledby="v2-execution-title"
                    >
                      <div className="v2-panel-heading">
                        <h2 id="v2-execution-title">
                          {paid
                            ? "Creator payment"
                            : refunded
                              ? "Agreement refunded"
                              : "Fund and delegate"}
                        </h2>
                        {deployed && (
                          <Address value={state?.deployment?.address} />
                        )}
                      </div>
                      <p className="v2-description">
                        {paid
                          ? "The accepted proof triggered the fixed creator payment. The agreement cannot pay twice."
                          : refunded
                            ? "The unpaid fee returned to the fixed brand after the deadline. No creator payment was made."
                            : fundingRetry
                              ? "Funding is not confirmed. Resume the recorded attempt before starting another campaign."
                              : deployed && deadlinePassed
                                ? "The payout window has closed. The brand can recover the unpaid fee."
                                : deployed
                                  ? "One delegation buys a fresh snapshot and submits the eligible proof for the fixed creator payout."
                                  : "Intake passed. Funding fixes these terms in a separate agreement."}
                      </p>
                      {!paid && !refunded && (
                        <div className="v2-step-action">
                          <button
                            className="v2-primary"
                            disabled={
                              locked ||
                              !canWrite ||
                              (deployed && deadlinePassed)
                            }
                            onClick={() =>
                              void action(
                                deployed ? "agent" : "fund",
                                deployed
                                  ? "/api/next/agent/start"
                                  : "/api/next/fund",
                              )
                            }
                          >
                            {busy === "fund" ||
                            state?.status === "funding-pending"
                              ? "Funding…"
                              : busy === "agent" || pending
                                ? "Agent working…"
                                : deployed && deadlinePassed
                                  ? "Claim deadline passed"
                                  : deployed
                                    ? "Start procurement agent"
                                    : fundingRetry
                                      ? "Resume funding"
                                      : "Fund agreement"}
                            <Arrow />
                          </button>
                          {deployed && !deadlinePassed && (
                            <p>
                              One snapshot, up to{" "}
                              <strong className="num">
                                {state?.limits
                                  ? amount(state.limits.agentFeeUnits, 6, 2)
                                  : "0.01"}{" "}
                                test aUSD
                              </strong>
                              , then the approved payout. No automatic top-ups.
                            </p>
                          )}
                        </div>
                      )}
                      {canRefund && (
                        <div className="v2-step-action">
                          <button
                            className="v2-secondary"
                            disabled={locked || !canWrite}
                            onClick={() =>
                              void action("refund", "/api/next/refund")
                            }
                          >
                            {busy === "refund" ? "Refunding…" : "Refund brand"}
                            <Arrow />
                          </button>
                          <p>
                            The unpaid creator fee returns to the fixed brand.
                            Data fees and gas remain separate.
                          </p>
                        </div>
                      )}
                      {(paid || refunded) && (
                        <button
                          className="v2-text"
                          onClick={() => setView("trail")}
                        >
                          View payment trail
                          <Arrow />
                        </button>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
            <aside className="v2-side-column">
              <section
                className="v2-panel v2-terms"
                aria-labelledby="v2-terms-title"
              >
                <div className="v2-panel-heading">
                  <h2 id="v2-terms-title">The exact agreement</h2>
                  <span className="v2-meta">Native test ETH</span>
                </div>
                <div className="v2-fee num">
                  {amount(campaign?.feeWei)}
                  <span>ETH</span>
                </div>
                <p className="v2-fee-caption">
                  {paid
                    ? "Paid to the accepted beneficiary"
                    : refunded
                      ? "Returned to the brand"
                      : deployed
                        ? "Locked for the fixed creator"
                        : "Creator fee, separate from data and gas"}
                </p>
                <dl>
                  <div>
                    <dt>Brand</dt>
                    <dd>
                      <Address value={campaign?.brand || state?.brand} />
                    </dd>
                  </div>
                  <div>
                    <dt>Creator receives</dt>
                    <dd>
                      <Address value={campaign?.creator} />
                    </dd>
                  </div>
                  <div>
                    <dt>X author ID</dt>
                    <dd className="mono">{campaign?.authorId || "—"}</dd>
                  </div>
                  <div>
                    <dt>Post ID</dt>
                    <dd className="mono">{campaign?.postId || "Not pinned"}</dd>
                  </div>
                  <div>
                    <dt>Publication opens</dt>
                    <dd className="num">{when(campaign?.postedAfter, true)}</dd>
                  </div>
                  <div>
                    <dt>Publication closes</dt>
                    <dd className="num">
                      {when(campaign?.postedBefore, true)}
                    </dd>
                  </div>
                  <div>
                    <dt>Consent expires</dt>
                    <dd className="num">
                      {when(campaign?.consentDeadline, true)}
                    </dd>
                  </div>
                  <div>
                    <dt>Claim deadline</dt>
                    <dd className="num">
                      {when(campaign?.claimDeadline, true)}
                    </dd>
                  </div>
                  <div>
                    <dt>Response age limit</dt>
                    <dd className="num">
                      {campaign ? `${campaign.maxResponseAge} seconds` : "—"}
                    </dd>
                  </div>
                </dl>
                <details className="v2-policy">
                  <summary>What the signature binds</summary>
                  <p>
                    Domain and version, Base Sepolia chain ID, verifier
                    contract, agreement ID, brand, beneficiary, author, post,
                    nonce, native fee, challenge, publication window and
                    deadlines.
                  </p>
                  {campaign && (
                    <div className="v2-hash">
                      <span>Agreement ID</span>
                      <code>{campaign.agreementId}</code>
                      <span>Nonce</span>
                      <code>{campaign.nonce}</code>
                    </div>
                  )}
                  <p>
                    A changed field needs a new signature. Reused or expired
                    consent cannot fund another agreement.
                  </p>
                </details>
                {campaign && (
                  <button
                    className="v2-text v2-new-campaign"
                    disabled={locked || !canWrite || !canReplaceCampaign}
                    onClick={() => setShowDraft(true)}
                  >
                    Start a different campaign
                    <Arrow />
                  </button>
                )}
                {campaign && !canReplaceCampaign && (
                  <p className="v2-field-note">
                    {fundingRetry
                      ? "Resume the recorded funding intent before starting another campaign."
                      : "Resolve this funded agreement by payout or by refund after its deadline before starting another campaign."}
                  </p>
                )}
              </section>
              <section
                className="v2-panel v2-progress"
                aria-labelledby="v2-progress-title"
              >
                <h2 id="v2-progress-title">
                  {refunded ? "Agreement closed" : "Before the creator is paid"}
                </h2>
                <ol>
                  {[
                    "Create the challenge",
                    "Pin the creator’s post",
                    "Accept terms by wallet",
                    "Verify signed post intake",
                    "Fund the agreement",
                    refunded
                      ? "Refund the unpaid creator fee"
                      : "Delegate purchase and payout",
                  ].map((text, index) => (
                    <li
                      key={text}
                      className={
                        phase > index
                          ? "v2-step-done"
                          : phase === index
                            ? "v2-step-current"
                            : ""
                      }
                    >
                      <span className="v2-step-marker">
                        {phase > index ? (
                          <svg
                            viewBox="0 0 16 16"
                            width="12"
                            height="12"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="m3 8 3 3 7-7"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ol>
                <p>
                  Source signatures authenticate a snapshot. They do not prove
                  continuous publication or campaign quality.
                </p>
              </section>
            </aside>
          </div>
        ) : (
          <div className="v2-trail-grid">
            <section className="v2-panel">
              <div className="v2-panel-heading">
                <h2>Payments and receipts</h2>
                <a
                  className="v2-text"
                  href="/api/next/evidence"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open evidence
                  <Arrow diagonal />
                </a>
              </div>
              {receipts.length ? (
                <div className="v2-receipts">
                  {receipts.map((receipt, index) => (
                    <div
                      className="v2-receipt"
                      key={`${receipt.kind}-${index}`}
                    >
                      <div>
                        <strong>{receipt.title}</strong>
                        <span>{receipt.detail || label(receipt.status)}</span>
                      </div>
                      <div className="v2-receipt-value">
                        <strong className="num">
                          {receipt.amount !== undefined
                            ? `${amount(receipt.amount, receipt.asset === "aUSD" ? 6 : 18, receipt.asset === "aUSD" ? 6 : 12)} ${receipt.asset === "aUSD" ? "aUSD" : "ETH"}`
                            : label(receipt.status)}
                        </strong>
                        {receipt.transactionHash && (
                          <a
                            className="mono"
                            href={explorer(receipt.transactionHash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {short(receipt.transactionHash, 4)}
                            <Arrow diagonal />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="v2-source-empty">
                  <span>No data charge or creator payment is recorded.</span>
                  <span>
                    Receipt confirmations will appear here after an authorized
                    action.
                  </span>
                </div>
              )}
              {Boolean(state?.events?.length) && (
                <div className="v2-events">
                  <h3>Intake activity</h3>
                  <ul>
                    {state?.events?.map((event, index) => (
                      <li key={event.id || index}>
                        <div>
                          <strong>{event.title}</strong>
                          {event.detail && <span>{event.detail}</span>}
                        </div>
                        <time className="num">{when(event.at)}</time>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            <section className="v2-panel">
              <div className="v2-panel-heading">
                <h2>Consent and source evidence</h2>
              </div>
              <dl className="v2-evidence">
                <div>
                  <dt>Verifier</dt>
                  <dd>
                    <Address value={state?.factory?.address} />
                  </dd>
                </div>
                <div>
                  <dt>Recovered beneficiary</dt>
                  <dd>
                    <Address value={consent?.recovered} />
                  </dd>
                </div>
                <div>
                  <dt>Terms hash</dt>
                  <dd className="mono">{consent?.termsHash || "—"}</dd>
                </div>
                <div>
                  <dt>Expected request</dt>
                  <dd className="mono">
                    {intake?.envelope?.requestHash || "—"}
                  </dd>
                </div>
                <div>
                  <dt>Source signed at</dt>
                  <dd>{when(intake?.envelope?.timestamp, true)}</dd>
                </div>
              </dl>
              <p className="v2-description v2-evidence-note">
                The wallet accepts the terms. The independently signed post must
                carry the exact nonce and beneficiary to bind that wallet to
                this post.
              </p>
            </section>
          </div>
        )}
        <footer className="v2-footer">
          <p>
            The creator publishes their own post. This application does not
            post, log in to X, or claim a social-account ownership check from a
            wallet signature alone.
          </p>
          <a href="/">
            Open the preserved original agreement
            <Arrow />
          </a>
        </footer>
      </main>
    </div>
  );
}
