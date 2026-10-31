import { nextCurrent, nextPublic } from "../server/next/app";
import { nextWallets, nextFactoryAbi } from "../server/next/config";
import {
  typedConsent,
  consentHash,
  recoverConsent,
  asContractTerms,
} from "../server/next/consent";
import { publicClient } from "../server/config";
import { writeJson } from "../server/store";
const s = nextCurrent(),
  w = nextWallets(),
  factory = nextPublic().factory.address;
if (
  s.campaign?.creator !== w.creatorTest.account.address ||
  s.campaign.postId !== "20" ||
  s.campaign.authorId !== "12" ||
  s.consent?.verified
)
  throw new Error(
    "Only the explicit unconsented historical-post test scenario can be signed by this test helper.",
  );
const typedData = typedConsent(s.campaign, factory);
const signature = await w.creatorTest.account.signTypedData(typedData as any);
const result = await recoverConsent(
  s.campaign,
  factory,
  signature,
  w.executor.account.address,
);
const onchain = await publicClient.readContract({
  address: factory,
  abi: nextFactoryAbi(),
  functionName: "verifyConsent",
  args: [asContractTerms(s.campaign), signature],
});
if (onchain !== result.termsHash)
  throw new Error("Factory consent digest differs.");
writeJson("evidence/v2/browser-wallet-signature.json", {
  at: new Date().toISOString(),
  kind: "Isolated test-wallet signature for browser form QA; no human X-owner consent or pilot claimed.",
  typedData,
  signature,
  termsHash: consentHash(s.campaign, factory),
  recovered: result.recovered,
  onchainDigest: onchain,
  funding: false,
  payout: false,
});
console.log(
  JSON.stringify(
    { signature, termsHash: result.termsHash, creator: result.recovered },
    null,
    2,
  ),
);
