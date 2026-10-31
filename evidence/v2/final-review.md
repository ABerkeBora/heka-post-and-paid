# V2 final engineering review

Checked: 2026-10-31T04:57:18.823832+01:00. Scope: read-only review of the new factory/intake verifier, `server/next`, added scripts, shared payment/chain diffs, and public V2 evidence. Only this review and `server/next/consent.test.ts` were written by this reviewer. No wallet files were read and no transactions were signed or submitted.

## Result

No unresolved high-risk fund-redirection, consent-replay or version-isolation defect was found in the reviewed source. Earlier findings were corrected before this final pass:

- The exported wallet JSON now includes the complete explicit EIP712Domain type.
- Off-chain consent expiry rejects the exact deadline boundary, matching the factory.
- Existing funding/payout receipt recovery now updates durable status and confirmed fees.
- A live unresolved EIP-3009 authorization blocks replacement; consumed authorizations are reconciled before archive.
- A verified data receipt is recorded into spend/receipt history even if a process stopped before the application recorded the returned result.

## Checks and boundaries

| Area | Review result |
| --- | --- |
| Creator consent | All14 terms fields, domain name/version/chain/factory bind the actual secp256k1 signature. Factory verifies the fixed creator, expiry, brand/value and canonical challenge before funding. |
| Social intake | Expected Airnode, exact fixed request/projection, post/author IDs, exact114-byte nonce/beneficiary fragment, envelope time and publication window are checked before child creation. |
| Replay/funding | Consent digest, creator nonce and agreement ID are consumed atomically with child creation. Invalid intake does not consume consent. Backend freezes terms after accepted consent and freezes signed/pending native transactions. |
| Payout/refund | V1 child remains unchanged. Creator cannot be redirected; one settlement remains enforced. Factory refund requires the original brand, forwards only that child's exact fee and rolls back if forwarding fails. |
| Version isolation | V2 API, `.local/v2` state/intents/mandates/locks and independent executor are distinct. Shared helper optional runtime overrides payer/actor, storage and every save callback. Default V1 paths remain unchanged. Allocation script holds V1+V2 locks and stops on a pending source nonce. |
| Durable transaction binding | V2 retries compare stored raw transaction chain/to/data/value and executor. API intents bind request body and mandate ID, reuse exact authorizations and verify token transfer/nonce receipt. |
| Public evidence | Structural scan of 9 V2 JSON artifacts found no privateKey, recovery phrase, paymentHeader, raw serialized transaction or authorization journal fields. Public creator-consent and Airnode signatures are retained as proof; they are distinct from payment authorization headers. The owner's final actual-key-value scan remains a separate publication check. |

## Tests executed by this reviewer

`npx tsx --test server/next/consent.test.ts`: **26/26 PASS**. Tests use ephemeral test-only EOAs and real secp256k1 signing/recovery. They cover canonical challenge formatting, every signed terms field, four domain changes, a wrong key, malformed signature, exact expiry, time policy and explicit wallet JSON domain serialization. No source fixture is counted as a real creator pilot.

The factory's Foundry tests, V1 regression manifest and live deployment/source-rejection artifacts were reviewed from the recorded evidence; this reviewer did not resubmit their transactions or mutate V1 state.

## Live evidence versus tests

- `deployment.json`: actual deployed Base Sepolia factory/verifier infrastructure, without a funded creator child.
- `wallet-consent.json`: actual isolated test-wallet consent verified against the deployed factory; not consent from a controlled human X account.
- `browser-wallet-signature.json`: real isolated test EOA signature for the browser paste/verification flow. An external EIP1193 wallet popup was not established by this evidence.
- `missing-challenge.json`: actual fresh signed response for historical post20, intentionally rejected for missing the campaign challenge; data fee and revert gas are disclosed, while child/nonce/collateral/payout remain protected.
- Contract positive/source tamper tests use explicitly separated synthetic oracle signatures. They demonstrate code paths, not a live V2 creator delivery.

**Real new creator post, valid source-bound creator intake and creator payout remain PENDING.** The authorized no-account engineering completion boundary is working intake/challenge, wallet signatures, isolated source/contract tests and the single morning creator publishing step. No social post, third-party message, hosted deployment or competition submission was performed by this reviewer.
