import { writeFileSync } from "node:fs";
import { paidSnapshot, type Mandate } from "../server/payment";
import {
  AIRNODE,
  AUSD,
  API_RECIPIENT,
  now,
  wallets,
  publicClient,
} from "../server/config";
import { deriveRequestHash, verifySignedResponse } from "../server/airnode";
import { exclusive } from "../server/store";
const w = wallets();
const mandate: Mandate = {
  id: "source-preflight",
  status: "active",
  apiPerCallUnits: "10000",
  apiTotalUnits: "10000",
  apiSpentUnits: "0",
  maxActions: 1,
  actionsUsed: 0,
  gasCapWei: "0",
  gasTotalCapWei: "0",
  gasSpentWei: "0",
  expiresAt: now() + 600,
  recipient: API_RECIPIENT,
  asset: AUSD,
  network: "eip155:84532",
  beneficiary: w.counterparty.account.address,
  contract: "source preflight only",
};
await exclusive(async () => {
  const request = { operation: "tweetsByIds", parameters: { tweet_ids: "20" } };
  console.log(
    "Base Sepolia:",
    await publicClient.getChainId(),
    "; isolated payer:",
    w.deployer.account.address,
  );
  const result = await paidSnapshot(
    "source-preflight-post20-v1",
    request,
    mandate,
  );
  await verifySignedResponse(
    result.envelope,
    AIRNODE,
    deriveRequestHash(request),
  );
  writeFileSync(
    "evidence/source-preflight.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        request,
        expectedSigner: AIRNODE,
        envelope: result.envelope,
        settlement: result.settlement,
      },
      null,
      2,
    ),
  );
  const data = JSON.parse(result.envelope.data);
  console.log(
    JSON.stringify(
      {
        verified: true,
        settlement: result.settlement,
        tweets: data.tweets?.map((t: any) => ({
          id: t.id,
          authorId: t.author?.id,
          text: t.text,
          createdAt: t.createdAt,
        })),
      },
      null,
      2,
    ),
  );
});
