import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN, RPC_URL } from "../config";
import { V2_LOCAL } from "./store";
export const V2_WALLETS = resolve(V2_LOCAL, "wallets.json");
export function nextWallets() {
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(V2_WALLETS, "utf8"));
  } catch {
    throw new Error("V2 isolated test executor is not configured.");
  }
  if (
    raw.testOnly !== true ||
    raw.chainId !== 84532 ||
    raw.project !== "post-and-paid-v2"
  )
    throw new Error("Wrong V2 wallet scope.");
  const role = (name: "executor" | "creatorTest") => {
    const record = raw.roles[name];
    const account = privateKeyToAccount(record.privateKey as Hex);
    if (account.address.toLowerCase() !== record.address.toLowerCase())
      throw new Error("V2 role address mismatch.");
    return {
      account,
      client: createWalletClient({
        account,
        chain: CHAIN,
        transport: http(RPC_URL, { timeout: 20000, retryCount: 0 }),
      }),
    };
  };
  return { executor: role("executor"), creatorTest: role("creatorTest") };
}
export const factoryArtifact = () =>
  JSON.parse(
    readFileSync(
      "out/PostAndPaidConsentFactory.sol/PostAndPaidConsentFactory.json",
      "utf8",
    ),
  );
export const nextFactoryAbi = () => [
  ...factoryArtifact().abi,
  ...JSON.parse(
    readFileSync(
      "out/PostAndPaidConsentFactory.sol/PostAndPaidIntakeVerifier.json",
      "utf8",
    ),
  ).abi.filter((item: any) => item.type === "error"),
];
