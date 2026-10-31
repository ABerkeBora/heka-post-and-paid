# Post and Paid V2 — API3 rule gate

- Track remains only API3 — Any API in your contract.
- Start check:31 October2026 04:31 Europe/Berlin, before V2 code. Correct API3 tab selected in the browser, About/submission/judging/examples expanded; general submission reread. Requirements unchanged from V1.
- Official sources: https://hackathon.tum-blockchain.com/prizes#api3 ; https://hackathon.tum-blockchain.com/prizes#how-to-submit ; https://github.com/api3dao/airnodehub-hackathon-starter ; https://api3dao.github.io/airnodehub-hackathon/docs/ . Pinned V1 starter/library provenance remains contracts/README.md.
- Mandatory technical obligations: essential signed data, deployed expected-signer/exact-request/relevant-time verification, signed values driving payout, replay protection; four tamper classes; judge-submitted proof path. V2 must preserve these checks. Existing V1 evidence stays at the baseline; new V2 evidence is under evidence/v2/.
- New consent obligation is the user's product brief, not a new sponsor rule. Wallet consent alone is not social ownership. Source data must match exact post/author/challenge/nonce/beneficiary.
- Creator pilot completion boundary: no controlled X account/new human-published post is supplied. Working intake/challenge, real test-wallet consent signatures, isolated source/contract tests and one morning publishing step may complete this engineering goal. A real new creator intake/funding/payout remains PENDING until that source exists. Fixtures do not become live sponsor evidence.
- General obligations unchanged: public source/run README,<=150-second video, Devfolio description/entry, deadline31 October15:00 Europe/Berlin, one entry per team. No submission/hosting is authorized here.
- Final recheck and requirement/evidence status: PENDING.

## Final gate —31 October2026 04:55 Europe/Berlin

Correct API3 tab selected and all four panels expanded; general submission tab reread. No change found. Browser record: [rules-recheck.json](evidence/v2/rules-recheck.json). The required live positive/new-pilot items below remain separate from this goal's explicit engineering completion boundary.

### Mandatory qualification and required technical evidence

| Requirement | Implementation | V2 status and actual evidence |
| --- | --- | --- |
| AirnodeHub essential to core workflow | Factory blocks escrow creation without exact signed intake; child blocks payout without signed data | **PASS for essential design/test; live positive PENDING** — contracts/PostAndPaidConsentFactory.sol,81 tests in evidence/v2/contract-tests.txt; real missing-challenge revert in evidence/v2/missing-challenge.json |
| Deployed verifier checks expected signer, exact request and timing | Immutable factory/verifier, unchanged V1 child, derived tweetsByIds projection | **PASS deployment/guards; valid new-post submission PENDING** — evidence/v2/deployment.json, deployment-verification.json, wallet-consent.json and contract-tests.txt |
| Signed values drive meaningful action with duplicate protection | Pinned author/post/challenge allow creation; fixed creator single payout; consent hash, nonce and agreement ID consumed only on successful funding | **PENDING live V2 action** — fixture positive/replay tests PASS; no new creator escrow/payout claimed. V1 real action retained in evidence/live-flow.json |
| Valid timely response followed by four real tamper rejections | V1 child retained, new intake verifier also covers all four classes | **PENDING live V2 positive/four-case sequence** —56 V2 fixture tests PASS. V1 actual positive and four real reverts remain in evidence/live-flow.json and evidence/tamper.json |
| Judges can submit own response | Existing Submit proof UI and documented submit-proof --check-only --contract; new factory verifyIntake ABI | **PASS** — README.md, contracts/v2/README.md, scripts/submit-proof.ts; active funded child required for fresh positive action |

### Mandatory submission items

| Item | Status and evidence |
| --- | --- |
| Contract address and network | **PASS** — factory0x55f8b95e4ab02550b9758e23187fc366b91f910e, Base Sepolia84532; evidence/v2/deployment.json |
| Public source and setup/run README | **PASS** — same ABerkeBora public repository, codex/next branch, README.md; V1 tag preserved |
| At most150-second video, including valid action and four tamper failures | **PENDING** — SUBMISSION.md has V1 outline; MORNING_HANDOFF_V2.md has V2 addition. No video recorded |
| Detailed Devfolio description, data reliance/forgery risk/missing source needs | **PENDING actual entry** — SUBMISSION.md and MORNING_HANDOFF_V2.md contain drafts; no entry submitted |
| Submit before31 October15:00 Europe/Berlin; one entry/team | **PENDING user submission/selection** — final official rules recheck. Separate project repositories do not authorize multiple team entries |

### User product acceptance (separate from official sponsor rules)

| Item | Status and evidence |
| --- | --- |
| Full creator EOA consent, recovery, domain and replay protection | **PASS** — actual test-wallet/deployed read calls in wallet-consent.json; external signature UI in browser-consent-verification.json;26 TS and56 V2 contract tests |
| Exact author/post/nonce/beneficiary challenge | **PASS negative and contract tests; real positive PENDING** — missing-challenge.json includes paid actual source and actual revert; no child/collateral/payout created |
| Initial bounded delegation buys data and triggers payout | **PENDING live V2 pilot** — existing V1 actual agent evidence retained; V2 scoped executor/state/mandate implementation and fixture payout tests |
| V1 isolation, restart/duplicate protections, build/browser | **PASS** — v1-regression.json,59 TS tests,81 contract tests, build.txt, browser-qa.json and screenshots |

Optional examples and judging preferences do not add other sponsor tracks. Repeated cycles are a judging preference; this narrow V2 implements one bounded agreement at a time. No independent upstream observation timestamp is available in this listing; publication time and envelope time are checked separately, and source-cache risk is disclosed. No controlled creator X account/new human post has been provided. Smallest remaining external action: creator publishes the generated exact challenge and supplies its post ID; the normal wallet/intake/fund/agent steps then produce the missing live V2 evidence. Video/Devfolio still require user preparation.
