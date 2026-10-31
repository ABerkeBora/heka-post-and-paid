# V1 baseline

- Working V1 source commit: `3dac6e4a397c9719c8e05c6639550a0260ce040d`. V1 was actually completed at 31 October2026 04:10 Europe/Berlin; `get_goal` on this next-goal turn returned null (no active goal), so no V1 goal was interrupted or relabeled.
- Immutable tag: `v1-baseline`, pinned to the working source commit above.
- V1 route: http://127.0.0.1:3106/ ; production start: `npm start` after `npm ci`, `forge build`, `npm run build`.
- Public repo: https://github.com/ABerkeBora/heka-post-and-paid ; V1 branch `codex/build`.
- V1 contracts: first `0xffb396146f2443210b93ecb98c122e6a52484117`, browser run `0x7d4f7f937cc3e2f3e39c87418d2c51355100a240`, rejection harness `0x6521a71146897ddb6f6f7ea98c095914a03fc8f0` (deadline-refunded). Base Sepolia84532.
- Real evidence stays in `evidence/live-flow.json`, `evidence/runs/`, `evidence/tamper.json`, `evidence/deployment-check.json`, `evidence/restart-duplicate.json`, `evidence/screenshots/`.
- Existing runtime data is preserved in ignored `.local/state.json`, `.local/intents/`, `.local/mandates/`, `.local/archive/`. A local SHA256 preservation manifest is `.local/v1-baseline-manifest.json`; it contains no keys. Nothing is reset or replayed for V2.
- V1 test wallet configuration remains unchanged. V2 will use `.local/v2/`, `/api/next/` and its own isolated executor key/nonce. No V1 receipt or pending intent becomes a V2 job.
- V1 tests:25 contract and33 payment tests; production/browser QA and actual source/payout/tamper receipts recorded. Video recording and competition entry remain outside this completed build and pending in MORNING_HANDOFF.md.
