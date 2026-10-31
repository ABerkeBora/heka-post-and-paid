# Creator consent and signed intake

`PostAndPaidConsentFactory` adds a narrow entry gate in front of the existing V1 escrow. V1 Solidity sources, parser/verifier libraries, compiler settings and payout behavior are unchanged.

The factory constructor takes the expected Airnode signer and deploys one immutable `PostAndPaidIntakeVerifier`. The separate helper keeps the factory's runtime below the EIP-170 limit while the factory retains the existing V1 child's creation code. No address, source, verifier or payout policy has an administrative setter.

## Two independent signatures

The creator signs an EIP-712 `CreatorConsent`. Its domain is `name="Post and Paid"`, `version="2"`, `chainId=84532`, and `verifyingContract=<factory>`. All fourteen terms are hashed: agreement ID, brand, creator beneficiary, author and post IDs, nonce, native asset, fee, exact challenge, publication window, claim deadline, consent expiry and response age. The contract recovers the beneficiary directly from that digest; it does not accept a caller-supplied terms hash. This is ECDSA consent, not an ERC-1271 implementation.

The Airnode independently signs the exact response to the fixed `tweetsByIds` operation, one numeric post ID and V1's four-field projection. Before funding, the immutable verifier checks source signature, derived request hash, non-future/fresh envelope, post/author IDs, publication time and exact challenge text.

The canonical challenge is:

```text
[pap2:<nonce as 64 lowercase hex characters without 0x>:<beneficiary as lowercase 0x address>]
```

It is 114 bytes. The factory derives it from the signed nonce and beneficiary; an arbitrary required-text field is rejected. A wallet signature alone does not establish control of an X account. The source-attested matching post provides the social binding; X/TwitterAPI.io/Airnode accuracy and cache behavior remain trust assumptions. No continuous-publication or advertising-quality guarantee follows.

## Funding and settlement

`fundAgreement(Terms, creatorSignature, timestamp, data, airnodeSignature)` is callable only by the signed brand and requires the exact signed native test-ETH fee. Both signatures and all intake checks run before any child deployment or collateral commitment. Consent hash, creator nonce and agreement ID each prevent replay. Failed intake leaves all three unused, so a later valid proof can still fund the intended agreement.

The funded child is the unchanged `PostAndPaidEscrow`. The application deliberately purchases another snapshot after funding before calling permissionless `submitResponse`. The child checks `timestamp >= fundedAt`, so an intake from an older second is rejected. Because timestamps have second granularity, a same-second intake can also pass the unchanged child: strict new-envelope separation is an executor policy, not a cryptographic on-chain guarantee. The child fixes the creator and pays once, with its existing replay, timing and predicate checks.

Because the factory deploys the V1 child, the child's `brand()` is the factory. The original signed brand is immutable in `agreements(agreementId)`. After the deadline, only that original brand can call `refundAgreement(agreementId)`. The factory calls the child's original refund and forwards exactly the pinned fee atomically to the original brand. It never forwards its whole balance, offers no administrator withdrawal, and accepts ordinary native receipts only from its registered children. A rejecting recipient rolls the entire refund back; child state prevents refund reentrancy and double withdrawal.

## Verification

Run `forge test --match-contract PostAndPaidConsentFactoryTest -vv` for 56 V2 checks. They cover independent viem EIP-712 hash agreement, actual test-key consent signatures, every consent field, foreign domain/version/chain/factory, expiry and replay, exact social challenge, all four oracle tamper classes, missing fields, publication/envelope timing, isolated child payout, and refund rollback/reentrancy/forced-funds behavior. Oracle envelopes in this suite are explicitly synthetic fixtures. They are not live creator-pilot or AirnodeHub evidence.

Run `forge test` for V1 and V2 together. The complete suite has 81 tests. Real new-post pilot evidence, if not supplied, must remain PENDING in the application handoff.

References: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-170](https://eips.ethereum.org/EIPS/eip-170), and [the pinned API3 starter provenance](../README.md).
