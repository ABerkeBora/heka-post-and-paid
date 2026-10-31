# Contract and source provenance

`PostAndPaidEscrow` is one agreement, funded at deployment with native Base Sepolia test ETH. Its original funder, creator beneficiary, payout, source signer, post and author identifiers, required text, publication window, claim deadline, and maximum signature age have no setters. API3 aUSD data charges are a separate payment and do not enter this escrow.

The exact `POST /` request is derived on-chain from the numeric string post ID:

```json
{"operation":"tweetsByIds","parameters":{"tweet_ids":"<postId>"},"responseProjection":{"authorId":"/tweets/0/author/id","createdAt":"/tweets/0/createdAt","postId":"/tweets/0/id","text":"/tweets/0/text"}}
```

`submitResponse(uint256 timestamp, bytes data, bytes signature)` accepts the original signed data bytes. Anyone may call it; the sender cannot redirect the payout. The contract verifies the pinned signer and request, a non-future signature made after funding and within the pinned age, exact post/author IDs, a case-sensitive campaign substring, and the source publication timestamp. It marks the agreement paid before transferring its fixed payout. Reverting recipients roll the entire action back. An unpaid agreement can be refunded to the original brand with `refund()` after its deadline. It cannot be paid or refunded twice.

The publication parser accepts complete ISO timestamps with timezone or the classic 30-character X date format, for example `Fri Oct 30 12:34:56 +0000 2026`. It validates the calendar date through the official starter's `IsoTimestamp`. A timestamp from the source records publication, while the envelope timestamp records the Airnode signing time. Neither proves continuous publication. No upstream observation timestamp is invented.

The constructor takes one tuple in this order:

```text
Config(address creator, address airnode, string postId, string authorId,
       string campaignCode, uint64 postedAfter, uint64 postedBefore,
       uint64 claimDeadline, uint64 maxResponseAge)
```

The transaction value is the creator fee; `brand` is its sender. `state()` returns `0` (Active), `1` (Paid), or `2` (Refunded). `CreatorPaid` records the beneficiary, amount, snapshot timestamp and original data hash. Deployment emits `AgreementFunded` with the exact request hash.

## Pinned dependencies

- `AirnodeV2Attestation.sol`, `ProjectedJson.sol` and `IsoTimestamp.sol`: [official API3 starter](https://github.com/api3dao/airnodehub-hackathon-starter/tree/52933ae1fb9371446a927338473466c3d320e19a), commit `52933ae1fb9371446a927338473466c3d320e19a`, MIT license preserved as `STARTER_LICENSE`.
- `vendor/oz`: only the required dependency closure from OpenZeppelin Contracts v5.7.0, commit `cab19933c33c2ad1d4c7a84864a3601dddfd16f3`. License preserved.
- `vendor/solady`: only the required dependency closure from Solady v0.1.26, commit `acd959aa4bd04720d640bf4e6a5c71037510cc4b`. License preserved.
- `foundry.toml`: Solidity 0.8.37, Cancun EVM, optimizer enabled. All contract sources live in this repository; no shared checkout is required.

Run `forge test -vv`. The contract suite uses synthetic signed envelopes and a fixed test clock to isolate each security check. These tests are not a substitute for the separately recorded live Airnode signature, x402 receipt, deployment and creator payout evidence. The suite checks the four sponsor tamper classes, replay, all payout predicates, funding/deadline limits, refund access, reentrancy and transfer-failure rollback.
