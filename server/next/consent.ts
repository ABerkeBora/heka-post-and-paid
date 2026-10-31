import {
  getAddress,
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { now } from "../config";
export const CONSENT_TYPES = {
  CreatorConsent: [
    { name: "agreementId", type: "bytes32" },
    { name: "brand", type: "address" },
    { name: "creator", type: "address" },
    { name: "authorId", type: "string" },
    { name: "postId", type: "string" },
    { name: "nonce", type: "bytes32" },
    { name: "asset", type: "address" },
    { name: "feeWei", type: "uint256" },
    { name: "requiredText", type: "string" },
    { name: "postedAfter", type: "uint64" },
    { name: "postedBefore", type: "uint64" },
    { name: "claimDeadline", type: "uint64" },
    { name: "consentDeadline", type: "uint64" },
    { name: "maxResponseAge", type: "uint64" },
  ],
} as const;
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;
export interface CreatorTerms {
  agreementId: Hex;
  brand: Address;
  creator: Address;
  authorId: string;
  postId: string;
  nonce: Hex;
  asset: Address;
  feeWei: string;
  requiredText: string;
  postedAfter: number;
  postedBefore: number;
  claimDeadline: number;
  consentDeadline: number;
  maxResponseAge: number;
}
export function challengeFor(nonce: Hex, creator: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce))
    throw new Error("Invalid campaign nonce.");
  return `[pap2:${nonce.slice(2).toLowerCase()}:${getAddress(creator).toLowerCase()}]`;
}
export function numericSocialId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,23}$/.test(value))
    throw new Error("Use a numeric X account or post ID.");
  return value;
}
export function typedConsent(terms: CreatorTerms, factory: Address) {
  return {
    domain: {
      name: "Post and Paid",
      version: "2",
      chainId: 84532,
      verifyingContract: factory,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...CONSENT_TYPES,
    },
    primaryType: "CreatorConsent" as const,
    message: terms,
  };
}
export function consentHash(terms: CreatorTerms, factory: Address) {
  return hashTypedData(typedConsent(terms, factory) as any);
}
export function assertTerms(terms: CreatorTerms, brand: string, at = now()) {
  if (terms.brand.toLowerCase() !== getAddress(brand).toLowerCase())
    throw new Error("Wrong brand in consent.");
  if (
    getAddress(terms.creator) === getAddress(terms.brand) ||
    terms.creator === ZERO_ADDRESS
  )
    throw new Error("Creator and brand must be distinct.");
  numericSocialId(terms.authorId);
  numericSocialId(terms.postId);
  if (terms.asset !== ZERO_ADDRESS || terms.feeWei !== "10000000000000")
    throw new Error("Only the fixed native test ETH creator fee is allowed.");
  if (terms.requiredText !== challengeFor(terms.nonce, terms.creator))
    throw new Error(
      "The exact campaign challenge is not bound to this beneficiary.",
    );
  if (at >= terms.consentDeadline || at >= terms.claimDeadline)
    throw new Error("Creator consent expired.");
  if (
    terms.postedAfter > terms.postedBefore ||
    terms.postedBefore > terms.claimDeadline ||
    terms.maxResponseAge !== 300
  )
    throw new Error("Invalid agreement time policy.");
}
export async function recoverConsent(
  terms: CreatorTerms,
  factory: Address,
  signature: Hex,
  brand: string,
  at = now(),
) {
  assertTerms(terms, brand, at);
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature))
    throw new Error("Use a 65-byte EOA typed-data signature.");
  const recovered = await recoverTypedDataAddress({
    ...typedConsent(terms, factory),
    signature,
  } as any);
  if (recovered.toLowerCase() !== terms.creator.toLowerCase())
    throw new Error("Consent was not signed by the fixed creator beneficiary.");
  return { termsHash: consentHash(terms, factory), recovered };
}
export function asContractTerms(t: CreatorTerms) {
  return {
    ...t,
    feeWei: BigInt(t.feeWei),
    postedAfter: BigInt(t.postedAfter),
    postedBefore: BigInt(t.postedBefore),
    claimDeadline: BigInt(t.claimDeadline),
    consentDeadline: BigInt(t.consentDeadline),
    maxResponseAge: BigInt(t.maxResponseAge),
  };
}
