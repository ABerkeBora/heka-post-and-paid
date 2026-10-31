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

The contract suite has 25 passing tests covering oracle tampering, request construction, payout predicates, replay, expiry/refund, reentrancy and failed-transfer rollback. Its synthetic signer fixtures are explicitly separate from the live source and transaction evidence. Browser captures are stored in [evidence/screenshots](evidence/screenshots); final check results and outstanding work are in [MORNING_HANDOFF.md](MORNING_HANDOFF.md).

`server/payment.ts` persists one EIP-3009 authorization per intent and reconciles its settlement before retrying. `server/chain.ts` stores exact signed transactions before broadcast and retries the same hash/nonce. Process locking serializes economic actions. No automatic top-up occurs.

## Trust and limits

- API3 authenticates the exact response from the pinned Airnode, not the independent truth of X or TwitterAPI.io. Upstream caching, errors or unavailability remain source risks. A missing projection or HTTP error is not signed evidence of absence. The selected listing exposes publication time, not an independent upstream observation timestamp; the envelope freshness check cannot establish that the upstream cache is fresh.
- The contract derives one fixed `tweetsByIds` request and four-field projection from its pinned post ID. It checks signer, request binding, envelope age, post/author IDs, required substring and publication window before paying. The model cannot alter these rules.
- Author account ID to beneficiary wallet association is supplied by the brand. This version does not verify social-account ownership or creator consent. The included historical post is a transparent technical test case.
- One signed snapshot does not prove continuous publication, campaign quality, engagement, legal compliance or a genuine advertising relationship. Source publication time and Airnode signature time serve different purposes.
- The local executor controls isolated test keys. Its mandate is not a general smart-wallet/session-key system, and its API/gas budgets are not on-chain allowances. Keys never enter model context or public evidence.

Official sources: [API3 track and general submission rules](https://hackathon.tum-blockchain.com/prizes#api3), [API3 starter](https://github.com/api3dao/airnodehub-hackathon-starter), [TwitterAPI listing](https://airnodehub.api3.org/explore/twitterapi). See [TRACK_REQUIREMENTS.md](TRACK_REQUIREMENTS.md) for requirement-by-evidence status and [SUBMISSION.md](SUBMISSION.md) for the presentation and submission draft. A video recording and Devfolio submission are still outstanding; this repository does not claim that all competition submission requirements are complete.
