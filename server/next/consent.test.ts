import test from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress, serializeTypedData, type Hex } from "viem";
import {
  challengeFor,
  consentHash,
  typedConsent,
  recoverConsent,
  assertTerms,
  ZERO_ADDRESS,
  type CreatorTerms,
} from "./consent";

// Actual secp256k1 signing with ephemeral test-only keys. No source observation,
// creator pilot, private wallet file or transaction is implied by these tests.
const creator = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const factory = "0x1111111111111111111111111111111111111111" as const;
const otherFactory = "0x3333333333333333333333333333333333333333" as const;
const brand = "0x2222222222222222222222222222222222222222" as const;
const at = 1_793_420_000;
const nonce = `0x${"ab".repeat(32)}` as Hex;
function terms(): CreatorTerms {
  return {
    agreementId: `0x${"01".repeat(32)}`,
    brand,
    creator: creator.address,
    authorId: "123456789",
    postId: "987654321",
    nonce,
    asset: ZERO_ADDRESS,
    feeWei: "10000000000000",
    requiredText: challengeFor(nonce, creator.address),
    postedAfter: at - 60,
    postedBefore: at + 3600,
    claimDeadline: at + 7200,
    consentDeadline: at + 3600,
    maxResponseAge: 300,
  };
}
async function sign(t = terms()) {
  return creator.signTypedData(typedConsent(t, factory) as any);
}

test("canonical social challenge binds the complete lowercase nonce and beneficiary", () => {
  const challenge = challengeFor(`0x${"AB".repeat(32)}`, creator.address);
  assert.equal(challenge.length, 114);
  assert.match(challenge, /^\[pap2:[0-9a-f]{64}:0x[0-9a-f]{40}\]$/);
  assert.equal(challenge, terms().requiredText);
  assert.notEqual(challenge, challengeFor(nonce, other.address));
});

test("actual typed-data signature recovers the fixed creator and exact terms hash", async () => {
  const t = terms();
  const signature = await sign(t);
  const result = await recoverConsent(t, factory, signature, brand, at);
  assert.equal(result.recovered.toLowerCase(), creator.address.toLowerCase());
  assert.equal(result.termsHash, consentHash(t, factory));
  assert.equal(signature.length, 132);
  assert.equal(
    JSON.parse(JSON.stringify(typedConsent(t, factory))).message.feeWei,
    t.feeWei,
  );
});

const changedFields: [string, (t: CreatorTerms) => CreatorTerms][] = [
  ["agreement ID", (t) => ({ ...t, agreementId: `0x${"02".repeat(32)}` })],
  ["brand", (t) => ({ ...t, brand: otherFactory })],
  ["creator beneficiary", (t) => ({ ...t, creator: other.address })],
  ["X author", (t) => ({ ...t, authorId: "123456788" })],
  ["post", (t) => ({ ...t, postId: "987654320" })],
  ["nonce", (t) => ({ ...t, nonce: `0x${"ac".repeat(32)}` })],
  ["asset", (t) => ({ ...t, asset: otherFactory })],
  ["fee", (t) => ({ ...t, feeWei: "10000000000001" })],
  ["required challenge", (t) => ({ ...t, requiredText: t.requiredText + "x" })],
  ["publication start", (t) => ({ ...t, postedAfter: t.postedAfter - 1 })],
  ["publication end", (t) => ({ ...t, postedBefore: t.postedBefore + 1 })],
  ["claim deadline", (t) => ({ ...t, claimDeadline: t.claimDeadline + 1 })],
  ["consent expiry", (t) => ({ ...t, consentDeadline: t.consentDeadline + 1 })],
  ["response age", (t) => ({ ...t, maxResponseAge: 299 })],
];
for (const [name, mutate] of changedFields) {
  test(`the creator signature cryptographically binds ${name}`, async () => {
    const t = terms(),
      changed = mutate(t),
      signature = await sign(t);
    assert.notEqual(consentHash(changed, factory), consentHash(t, factory));
    const recovered = await recoverTypedDataAddress({
      ...typedConsent(changed, factory),
      signature,
    } as any);
    assert.notEqual(recovered.toLowerCase(), creator.address.toLowerCase());
    await assert.rejects(
      recoverConsent(changed, factory, signature, brand, at),
    );
  });
}

for (const [name, domain] of [
  ["name", { name: "Another product" }],
  ["version", { version: "1" }],
  ["chain", { chainId: 1 }],
  ["factory", { verifyingContract: otherFactory }],
] as const) {
  test(`a consent signed for another domain ${name} is rejected`, async () => {
    const t = terms(),
      typed = typedConsent(t, factory);
    const signature = await creator.signTypedData({
      ...typed,
      domain: { ...typed.domain, ...domain },
    } as any);
    await assert.rejects(
      recoverConsent(t, factory, signature, brand, at),
      /fixed creator/,
    );
  });
}

test("another real test key cannot sign for the creator beneficiary", async () => {
  const t = terms();
  const signature = await other.signTypedData(typedConsent(t, factory) as any);
  await assert.rejects(
    recoverConsent(t, factory, signature, brand, at),
    /fixed creator/,
  );
});

test("consent expires at the deadline boundary, matching the deployed factory", async () => {
  const t = terms(),
    signature = await sign(t);
  await recoverConsent(t, factory, signature, brand, t.consentDeadline - 1);
  await assert.rejects(
    recoverConsent(t, factory, signature, brand, t.consentDeadline),
    /expired/,
  );
  await assert.rejects(
    recoverConsent(t, factory, signature, brand, t.consentDeadline + 1),
    /expired/,
  );
});

test("expired claim deadline cannot authorize intake even with a valid signature", async () => {
  const t = terms(),
    signature = await sign(t);
  await assert.rejects(
    recoverConsent(t, factory, signature, brand, t.claimDeadline),
    /expired/,
  );
});

test("malformed and compact signatures are not accepted as 65-byte EOA consent", async () => {
  await assert.rejects(
    recoverConsent(terms(), factory, "0x12", brand, at),
    /65-byte/,
  );
  await assert.rejects(
    recoverConsent(terms(), factory, `0x${"00".repeat(64)}`, brand, at),
    /65-byte/,
  );
});

test("the publication and response-age policy is validated independently of signing", () => {
  assert.throws(
    () => assertTerms({ ...terms(), postedAfter: at + 4000 }, brand, at),
    /time policy/,
  );
  assert.throws(
    () => assertTerms({ ...terms(), postedBefore: at + 8000 }, brand, at),
    /time policy/,
  );
  assert.throws(
    () => assertTerms({ ...terms(), maxResponseAge: 0 }, brand, at),
    /time policy/,
  );
});

test("wallet JSON includes a complete explicit EIP712Domain", () => {
  const typed = typedConsent(terms(), factory);
  assert.deepEqual((typed.types as any).EIP712Domain, [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ]);
  const payload = JSON.parse(serializeTypedData(typed as any));
  assert.equal(payload.domain.name, "Post and Paid");
  assert.equal(payload.domain.version, "2");
  assert.equal(Number(payload.domain.chainId), 84532);
  assert.equal(payload.domain.verifyingContract, factory);
});
