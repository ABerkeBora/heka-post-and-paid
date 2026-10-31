import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

// Optional environment file, never required for public read-only evidence mode.
try {
  process.loadEnvFile(resolve(".env"));
} catch {}
export const RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
export const AIRNODE_URL = "https://airnode-twitterapi.fly.dev/";
export const AIRNODE = "0x7B02Fd3324D2dC362f65a9c01e59EC5fDb4E1CCB" as const;
export const AUSD = "0xbeA34973e5f67F18F656A2C6070C64326C791808" as const;
export const API_RECIPIENT =
  "0x1505FD562AC2Fb4307B85BC6c672FfeafB4d57A7" as const;
export const CHAIN = baseSepolia;
export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(RPC_URL, { timeout: 20000, retryCount: 2 }),
});
export const now = () => Math.floor(Date.now() / 1000);
export const iso = () => new Date().toISOString();
export function wallets() {
  const path =
    process.env.TEST_WALLETS_FILE || resolve(".local/test-wallets.json");
  let data: any;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(
      "Configure a valid isolated Base Sepolia test wallet file.",
    );
  }
  if (
    data.testOnly !== true ||
    data.chainId !== 84532 ||
    data.project !== "post-and-paid"
  )
    throw new Error(
      "Only isolated Post and Paid Base Sepolia test wallets are allowed.",
    );
  const roles = ["deployer", "buyer", "counterparty"] as const;
  const result = Object.fromEntries(
    roles.map((role) => {
      const account = privateKeyToAccount(data.roles[role].privateKey as Hex);
      if (
        account.address.toLowerCase() !== data.roles[role].address.toLowerCase()
      )
        throw new Error("Wallet address does not match role.");
      return [
        role,
        {
          account,
          client: createWalletClient({
            account,
            chain: CHAIN,
            transport: http(RPC_URL, { timeout: 20000, retryCount: 0 }),
          }),
        },
      ];
    }),
  ) as unknown as Record<
    (typeof roles)[number],
    {
      account: ReturnType<typeof privateKeyToAccount>;
      client: ReturnType<typeof createWalletClient>;
    }
  >;
  if (new Set(roles.map((r) => result[r].account.address)).size !== 3)
    throw new Error("Test roles must be distinct.");
  return result;
}
