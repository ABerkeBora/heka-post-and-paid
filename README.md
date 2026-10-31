# Post and Paid

A brand funds one post agreement. A bounded procurement agent buys a signed snapshot of the agreed X post, validates it, and submits it to a contract that pays the fixed creator beneficiary. One initial delegation covers the data purchase and eligible payout.

Built for **API3 — Any API in your contract** at the TUM Blockchain & AI Hackathon. Runs locally at **http://127.0.0.1:3106** on **Base Sepolia, chain 84532**. No hosted service or mainnet funds are required.

The included scenario uses historical public [post 20](https://x.com/i/status/20), author ID `12`, and the substring `twttr`. It is an actual paid source lookup, not a commissioned advertisement or a claim that its author owns our isolated creator test wallet.

## Recorded working flow

| Evidence | Link |
| --- | --- |
| Funded agreement | [Contract](https://sepolia.basescan.org/address/0xffb396146f2443210b93ecb98c122e6a52484117) · [deployment transaction](https://sepolia.basescan.org/tx/0xf8ac5ed8e7461927543433d6b316a1442b044ff2a251b53601cf9d558057fda9) |
| Agent bought the projected snapshot for **0.01 aUSD** | [Data payment](https://sepolia.basescan.org/tx/0x07d721e18281e1bcf81a415a77c6628bd9e528a7d4bc9210c2261a683a5921d2) |
| Agent submitted proof; creator received **0.00001 test ETH** | [Payout transaction](https://sepolia.basescan.org/tx/0x602a028d9159e4a4ac6943046c20e31484a04329ddf4c2e6e4876e379e993dbd) |
| Four real rejected transactions, preserved collateral, then deadline refund | [Tamper evidence](evidence/tamper.json) |
| Fresh-process duplicate action blocked, balances unchanged | [Restart evidence](evidence/restart-duplicate.json) |

The first run’s original envelope, proposal, mandate, receipts and beneficiary balance delta are in [its immutable run record](evidence/runs/agreement-1b0bda02.json). [live-flow.json](evidence/live-flow.json) records the latest successful run. A separate unprojected source preflight cost **0.01 aUSD**; every fresh procurement flow costs another **0.01 aUSD**. The API fee, creator fee, deployment gas and rejected-transaction gas are separate costs.

## Install and run

Use Node.js **22.18 or newer**, npm, [Foundry](https://getfoundry.sh/), and a local [Ollama](https://ollama.com/) runtime with `qwen3:4b` available. Keep the app bound to localhost. The model receives a small read-only planning context, never keys or arbitrary transaction authority.

```sh
git clone https://github.com/ABerkeBora/heka-post-and-paid.git
cd heka-post-and-paid
npm ci
forge build
cp .env.example .env
npm run wallets:init
```

`wallets:init` creates three distinct test roles in ignored `.local/test-wallets.json` with mode `0600`; it refuses to overwrite existing keys. It prints only the addresses. Never publish this file, `.env`, `.local/`, or raw signed transaction/payment authorizations. Configure `TEST_WALLETS_FILE` in `.env` if using a different isolated file with the documented schema.

Fund only these **Base Sepolia test addresses**:

| Role | Purpose | Required test assets |
| --- | --- | --- |
| `deployer` | Agent transaction sender and API payer | Base Sepolia ETH for submissions/tests; at least 0.01 aUSD per procurement, plus 0.01 for the source preflight |
| `buyer` | Brand funds the agreement | Base Sepolia ETH for deployment, creator fee and optional rejection harness |
| `counterparty` | Fixed creator test beneficiary | Receives the creator fee; no outgoing transaction is needed |

Obtain aUSD from the [official hackathon faucet](https://api3dao.github.io/airnodehub-hackathon/faucet/). Its token is `0xbeA34973e5f67F18F656A2C6070C64326C791808`, with six decimals. Minting requires test ETH; the x402 facilitator pays the gas for the subsequent aUSD service transfer. A small isolated test allocation such as 0.001 test ETH per sending role is sufficient for the recorded small scenario at the recorded fee levels; the executor checks current quotes before sending.

```sh
npm run dev
```

Open **http://127.0.0.1:3106**. For a production build:

```sh
npm run build
npm start
```

Stop the development server before starting production on the same port. `BASE_SEPOLIA_RPC_URL`, `OLLAMA_BASE_URL` and `OLLAMA_MODEL` are configurable in `.env`. The application checks the RPC chain before sending; it supports this test network only. A fresh clone without wallet configuration opens the recorded evidence with payment controls unavailable. After configuring roles, choose **New agreement** to start a writable cycle. Published evidence can be inspected without private wallets.

## Run a fresh agreement

1. If the current agreement is already paid or refunded, choose **New agreement**. Previous chain receipts and local agreement archives are preserved.
2. Choose **Fund agreement**. The brand deploys and funds a single immutable escrow. The post, author, substring, publication window, signer, creator and fee are fixed.
3. Choose **Start procurement agent** once. This accepts the bounded mandate. The local model proposes an allowed action; deterministic code validates the proposal and payment challenge. The agent purchases the signed snapshot, checks the proof, and submits it without a second payment click.
4. Open **Payment trail** to inspect the separate data and creator receipts. **Open evidence** exports the current public record.

The default creator fee is `10000000000000` wei (**0.00001 test ETH**). Main agreements accept a response no older than **300 seconds**, signed after funding and no later than the current chain clock. Their claim deadline is 24 hours after preparation. An unpaid agreement can be returned to the original brand with **Refund brand** after that deadline.

Each mandate allows one snapshot: `10000` aUSD units per call and total, fixed service recipient and asset, one allowed action, expiry after at most 30 minutes, a `50000000000000` wei transaction gas preflight cap and `100000000000000` wei total gas budget. API and gas budgets are enforced by the local executor. The contract enforces its immutable payout conditions, beneficiary and one-time settlement. These are different enforcement boundaries.

Base fees include L2 execution, L1 data and any operator fee. The executor checks the signed execution maximum plus buffered current L1/operator estimates; it does **not** claim an on-chain total-fee ceiling. Confirmed fees are reconciled from receipts. A rejected delivery may still have spent its API fee or transaction gas.

## Reproduce the rejection evidence

From a fresh draft, the CLI scenario prepares a separate funded rejection harness **before** buying the snapshot. Do not first run the UI agent for that draft.

```sh
npm run preflight
npm run scenario
npm run tamper
```

`preflight` obtains a real unprojected response for the different-request case. Its durable intent prevents a fresh charge when rerun locally. `scenario` funds the main agreement and a small harness, then runs the complete agent flow. The harness uses the same contract bytecode and source rules, with a **30-second** freshness limit and **180-second** deadline so tests can finish quickly. It holds `1000000000` wei separately from the creator fee.

Run `tamper` while that harness is active. If stale-response checking is pending, rerun after the original snapshot exceeds 30 seconds and before the 180-second deadline. The timestamp is never edited to manufacture staleness. The script broadcasts four deliberately reverting transactions: edited data, a real response to a different request, wrong signer, and the original stale response. It compares escrow state and collateral before/after. It also checks an over-budget payment policy rejection and duplicate payout rejection. These transactions consume real test gas.

After the harness deadline:

```sh
npm run tamper -- --refund-guard
npm run test:restart
npm run reconcile
```

The refund returns its unpaid collateral to the original brand. **Check proof protections** returns the recorded actual test results once the harness has settled; it does not broadcast replacement tests. The published run's four revert receipts are in [tamper.json](evidence/tamper.json); rerunning an expired or settled contract cannot recreate its original active state. Prepare a new agreement for another live cycle. Do not delete `.local/` to retry an uncertain payment: it contains the intent, authorization and receipt reconciliation records that prevent double spending.

## Judge-supplied proofs

The UI's **Submit proof** form accepts a complete signed Airnode envelope. Preserve `data` as the original string; parsing and rewriting it changes the signed bytes. Normal delegated submission requires an active initial mandate and still runs the deployed contract's verifier.

The CLI can inspect a response against a chosen deployed agreement without trusting the app's off-chain validator:

```sh
npm run submit-proof -- response.json --check-only --contract 0xYOUR_ACTIVE_AGREEMENT
```

Use `--check-only` for a gas-free `eth_call`; this check requires no wallet configuration or private key. Custom contract addresses are accepted only in check-only mode. Submit through the UI/current active agreement with:

```sh
npm run submit-proof -- response.json
```

The JSON may be the envelope itself or `{ "envelope": ... }`. An already-paid contract rejects another proof, including its original valid response. A positive fresh-proof test therefore needs an active funded agreement and a current response to its exact request. The recorded successful payout is proof of the original positive case; old envelopes are not expected to pass current freshness checks. Any EVM client can independently call the permissionless `submitResponse(uint256,bytes,bytes)` function described in [contracts/README.md](contracts/README.md).

## Verify and inspect

```sh
npm test
npm run test:contracts
npm run build
```

The preserved V1 contract suite has 25 passing tests covering oracle tampering, request construction, payout predicates, replay, expiry/refund, reentrancy and failed-transfer rollback. Its synthetic signer fixtures are explicitly separate from the live source and transaction evidence. Browser captures are stored in [evidence/screenshots](evidence/screenshots); final check results and outstanding work are in [MORNING_HANDOFF.md](MORNING_HANDOFF.md).

`server/payment.ts` persists one EIP-3009 authorization per intent and reconciles its settlement before retrying. `server/chain.ts` stores exact signed transactions before broadcast and retries the same hash/nonce. Process locking serializes economic actions. No automatic top-up occurs.

## Trust and limits

- API3 authenticates the exact response from the pinned Airnode, not the independent truth of X or TwitterAPI.io. Upstream caching, errors or unavailability remain source risks. A missing projection or HTTP error is not signed evidence of absence. The selected listing exposes publication time, not an independent upstream observation timestamp; the envelope freshness check cannot establish that the upstream cache is fresh.
- The contract derives one fixed `tweetsByIds` request and four-field projection from its pinned post ID. It checks signer, request binding, envelope age, post/author IDs, required substring and publication window before paying. The model cannot alter these rules.
- Author account ID to beneficiary wallet association is supplied by the brand. This version does not verify social-account ownership or creator consent. The included historical post is a transparent technical test case.
- One signed snapshot does not prove continuous publication, campaign quality, engagement, legal compliance or a genuine advertising relationship. Source publication time and Airnode signature time serve different purposes.
- The local executor controls isolated test keys. Its mandate is not a general smart-wallet/session-key system, and its API/gas budgets are not on-chain allowances. Keys never enter model context or public evidence.

Official sources: [API3 track and general submission rules](https://hackathon.tum-blockchain.com/prizes#api3), [API3 starter](https://github.com/api3dao/airnodehub-hackathon-starter), [TwitterAPI listing](https://airnodehub.api3.org/explore/twitterapi). See [TRACK_REQUIREMENTS.md](TRACK_REQUIREMENTS.md) for requirement-by-evidence status and [SUBMISSION.md](SUBMISSION.md) for the presentation and submission draft. A video recording and Devfolio submission are still outstanding; this repository does not claim that all competition submission requirements are complete.

## V2: creator consent and new-post intake

The working V1 remains at [http://127.0.0.1:3106/](http://127.0.0.1:3106/). Its source baseline is commit `3dac6e4a397c9719c8e05c6639550a0260ce040d`, preserved by the immutable [`v1-baseline`](https://github.com/ABerkeBora/heka-post-and-paid/tree/v1-baseline) tag. V2 is published on [`codex/next`](https://github.com/ABerkeBora/heka-post-and-paid/tree/codex/next) and reviewed separately at [http://127.0.0.1:3106/next](http://127.0.0.1:3106/next). It keeps the same creator-studio identity.

V1 pins a brand-supplied author-to-beneficiary association. V2 adds creator EOA consent over the full campaign terms, followed by a signed social-post check that must contain the exact unique nonce and beneficiary challenge. A wallet signature by itself is not presented as X account ownership.

V2 uses `/api/next/`, ignored `.local/v2/` state/intents/mandates, a separate test executor and a separate creator-consent factory. It does not consume V1 escrows, pending jobs or saved receipts. The small setup allocation to the isolated executor is infrastructure funding, not a customer payment or a completed creator pilot. Unchanged x402 authorization/receipt reconciliation and durable transaction logic are shared with explicit V2 storage/signer callbacks.

```sh
npm run next:prepare
npm run next:deploy
npm run next:consent-test
npm run next:negative
```

These V2 setup/check commands prepare isolated test roles, deploy the ready factory, test actual test-wallet signatures and exercise a historical-post negative case. Their evidence belongs under `evidence/v2/`. They do not publish a post or impersonate a creator. The deployed factory is [0x55f8b95e4ab02550b9758e23187fc366b91f910e](https://sepolia.basescan.org/address/0x55f8b95e4ab02550b9758e23187fc366b91f910e) on Base Sepolia. Its [deployment](evidence/v2/deployment.json), [real test-wallet consent checks](evidence/v2/wallet-consent.json), [real paid missing-challenge rejection](evidence/v2/missing-challenge.json) and [browser verification](evidence/v2/browser-qa.json) are separate from a human creator pilot. Do not rerun setup/negative scripts as an ordinary morning startup: they are reproducible test scenarios and can consume test gas/API fees.

The normal creator flow is:

1. Create a campaign challenge for the creator beneficiary and X author ID.
2. The creator publishes the exact challenge from their own account and supplies that post ID. No social posting or OAuth session is performed by this application.
3. The creator reads and signs the complete EIP-712 terms in their own EVM wallet, or pastes an externally produced EOA signature over the same typed data. The message binds domain/version/chain/factory, agreement ID, brand, beneficiary, author/post IDs, nonce, native fee, exact text condition and all timing rules.
4. Verify the published post intake. Its Airnode signature, fixed request/projection, post/author IDs, time and exact challenge are checked. A mismatch cannot create a funded agreement; a successfully purchased but rejected snapshot can still cost its disclosed API fee.
5. The brand funds those exact consented terms. The factory checks consent and intake on-chain, consumes consent/nonce/agreement ID once, and creates a separate immutable V1 payout escrow.
6. Start the bounded procurement agent once. It obtains a fresh post-funding snapshot and submits the eligible payout without another payout click. The executor deliberately makes this separate purchase. The unchanged child checks `timestamp >= fundedAt`: it rejects an older-second intake, but a same-second intake could also pass on-chain. A strictly new envelope is an application policy, not an on-chain guarantee.

The canonical social fragment is `[pap2:<64 lowercase nonce hex characters>:<lowercase 0x beneficiary>]`. The factory derives it; callers cannot replace it with an arbitrary substring. Creator consent recovery, expiry, domain/chain binding and replay are enforced by the factory. Source intake verification is on-chain in its immutable verifier. API/gas mandates remain local-executor limits, with the same Base fee-preflight caveat described for V1. A complete positive V2 cycle buys two snapshots: one intake and one post-funding payout proof, each capped at `10000` aUSD units, with a combined API cap of `20000` units (0.02 aUSD). Creator collateral remains the separate `10000000000000` wei fee.

Because the factory creates the unchanged V1 child, the child's `brand()` is the factory. Its original signed brand is recorded in the factory registry. After the deadline the UI refunds through the factory, which can forward only that child's pinned collateral to that original brand. There is no administrator redirection or general withdrawal path. Contract details and trust boundaries are in [contracts/v2/README.md](contracts/v2/README.md).

The V2 contract suite adds **56 passing tests** to the preserved **25 V1 tests**. It includes an independently generated viem EIP-712 hash vector, actual test-key signatures, all consent-field/domain/chain mutations, consent replay, exact social binding, the four oracle tamper classes, older-second payout rejection and refund safety. Synthetic oracle fixtures are explicitly separated from live source evidence.

**A real new-creator pilot and V2 payout remain PENDING until a human supplies a newly published matching post.** Historical post 20 is a negative source case; it is never presented as new creator consent. Without that external input, the authorized engineering completion boundary is the working challenge/intake, real test-wallet signature checks, isolated source/contract tests and the single morning creator action described in [MORNING_HANDOFF_V2.md](MORNING_HANDOFF_V2.md). This does not make V2 fully live-qualified for the API3 track.

V2 verification completed with **59 TypeScript tests,81 contract tests and a production build**. Browser evidence covers desktop/tablet/phone, including a real test EOA signature accepted through the external-signature form. An EIP-1193 extension popup was not exercised. The current `/next` screen is ready for actual creator input; isolated historical-post test scenarios are archived. Today’s presentation recommendation is **V1**, because its real payout and four real rejection receipts are complete; V2 adds the stronger consent flow while its new creator pilot remains pending. See [REVIEW_SUMMARY.json](REVIEW_SUMMARY.json) for the concise comparison.
