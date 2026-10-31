import { getAddress } from "viem";
import { nextWallets, nextFactoryAbi } from "../server/next/config";
import {
  newNextCampaign,
  pinNextPost,
  nextCurrent,
  nextPublic,
  acceptNextConsent,
} from "../server/next/app";
import {
  typedConsent,
  asContractTerms,
  recoverConsent,
  consentHash,
  type CreatorTerms,
} from "../server/next/consent";
import { publicClient, now } from "../server/config";
import { writeJson } from "../server/store";
const w = nextWallets();
await newNextCampaign({
  creator: w.creatorTest.account.address,
  authorId: "12",
});
await pinNextPost("20");
const state = nextCurrent(),
  factory = nextPublic().factory.address;
const terms = state.campaign as CreatorTerms;
const signature = await w.creatorTest.account.signTypedData(
  typedConsent(terms, factory) as any,
);
const result = await recoverConsent(
  terms,
  factory,
  signature,
  w.executor.account.address,
);
const onchain = await publicClient.readContract({
  address: factory,
  abi: nextFactoryAbi(),
  functionName: "verifyConsent",
  args: [asContractTerms(terms), signature],
});
if (result.termsHash !== onchain)
  throw new Error("On-chain creator consent digest mismatch.");
const beforeNonce = await publicClient.readContract({
  address: factory,
  abi: nextFactoryAbi(),
  functionName: "usedNonce",
  args: [terms.creator, terms.nonce],
});
const cases: any[] = [];
const variants: Record<string, Partial<CreatorTerms>> = {
  post: { postId: "21" },
  author: { authorId: "13" },
  beneficiary: {
    creator: getAddress("0x0000000000000000000000000000000000000123"),
  },
  fee: { feeWei: "10000000000001" },
  nonce: { nonce: ("0x" + "a".repeat(64)) as any },
  text: { requiredText: terms.requiredText.replace("pap2", "pap3") },
};
for (const [name, patch] of Object.entries(variants)) {
  let rejected = false;
  try {
    await publicClient.readContract({
      address: factory,
      abi: nextFactoryAbi(),
      functionName: "verifyConsent",
      args: [asContractTerms({ ...terms, ...patch }), signature],
    });
  } catch {
    rejected = true;
  }
  if (!rejected)
    throw new Error("Changed " + name + " accepted original signature.");
  cases.push({
    name: "Changed " + name,
    rejected,
    transactionSubmitted: false,
  });
}
for (const [name, patch] of Object.entries({
  domain: { name: "Another product" },
  version: { version: "1" },
  chain: { chainId: 1 },
  factory: {
    verifyingContract: getAddress("0x0000000000000000000000000000000000000123"),
  },
})) {
  const d = typedConsent(terms, factory);
  const badSig = await w.creatorTest.account.signTypedData({
    ...d,
    domain: { ...d.domain, ...patch },
  } as any);
  let rejected = false;
  try {
    await publicClient.readContract({
      address: factory,
      abi: nextFactoryAbi(),
      functionName: "verifyConsent",
      args: [asContractTerms(terms), badSig],
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Wrong " + name + " accepted.");
  cases.push({ name: "Wrong " + name, rejected, transactionSubmitted: false });
}
const expired = { ...terms, consentDeadline: now() - 30 };
const expiredSignature = await w.creatorTest.account.signTypedData(
  typedConsent(expired, factory) as any,
);
let expiredRejected = false;
try {
  await publicClient.readContract({
    address: factory,
    abi: nextFactoryAbi(),
    functionName: "verifyConsent",
    args: [asContractTerms(expired), expiredSignature],
  });
} catch {
  expiredRejected = true;
}
if (!expiredRejected) throw new Error("Expired consent accepted.");
cases.push({
  name: "Expired consent",
  rejected: true,
  transactionSubmitted: false,
});
await acceptNextConsent(signature);
let replay = false;
try {
  await acceptNextConsent(signature);
} catch {
  replay = true;
}
if (!replay) throw new Error("Application consent replay was not blocked.");
cases.push({
  name: "Consent re-submission",
  rejected: true,
  transactionSubmitted: false,
});
let changedPostBlocked = false;
try {
  await pinNextPost("21");
} catch {
  changedPostBlocked = true;
}
if (!changedPostBlocked)
  throw new Error("Post changed after accepted consent.");
const s = nextCurrent();
if (s.deployment || Object.keys(s.transactions).length)
  throw new Error("Consent validation unexpectedly funded an agreement.");
writeJson("evidence/v2/wallet-consent.json", {
  at: new Date().toISOString(),
  kind: "real isolated test-wallet signature, not human X-owner pilot",
  factory,
  creator: terms.creator,
  brand: terms.brand,
  terms,
  typedData: typedConsent(terms, factory),
  signature,
  termsHash: consentHash(terms, factory),
  recovered: result.recovered,
  onchainDigest: onchain,
  nonceConsumed: beforeNonce,
  changedPostBlocked,
  cases,
  pilot: "PENDING",
  fundingTransactions: 0,
  payoutTransactions: 0,
});
console.log(
  JSON.stringify(
    {
      verified: true,
      factory,
      creator: terms.creator,
      termsHash: result.termsHash,
      negativeCases: cases.length,
      pilot: "PENDING",
      fundingTransactions: 0,
    },
    null,
    2,
  ),
);
