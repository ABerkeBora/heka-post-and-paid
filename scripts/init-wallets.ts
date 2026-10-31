import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const path = ".local/test-wallets.json";
if (existsSync(path))
  throw new Error("Wallet file already exists; refusing to replace keys.");
mkdirSync(".local", { recursive: true, mode: 0o700 });
const roles = Object.fromEntries(
  ["deployer", "buyer", "counterparty"].map((role) => {
    const privateKey = generatePrivateKey();
    return [
      role,
      { address: privateKeyToAccount(privateKey).address, privateKey },
    ];
  }),
);
writeFileSync(
  path,
  JSON.stringify(
    { testOnly: true, chainId: 84532, project: "post-and-paid", roles },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    {
      network: "Base Sepolia 84532",
      roles: Object.fromEntries(
        Object.entries(roles).map(([role, v]) => [role, v.address]),
      ),
      next: "Fund these test addresses; never send mainnet assets.",
    },
    null,
    2,
  ),
);
