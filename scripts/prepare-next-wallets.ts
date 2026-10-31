import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData, parseAbi } from "viem";
import { wallets, publicClient, AUSD } from "../server/config";
import { exclusive, readJson, writeJson } from "../server/store";
import { sendDurable } from "../server/chain";
import { V2_LOCAL, exclusiveNext } from "../server/next/store";
import { V2_WALLETS, nextWallets } from "../server/next/config";
await exclusive(() =>
  exclusiveNext(async () => {
    if (!existsSync(V2_WALLETS)) {
      const roles = Object.fromEntries(
        ["executor", "creatorTest"].map((name) => {
          const privateKey = generatePrivateKey();
          return [
            name,
            { address: privateKeyToAccount(privateKey).address, privateKey },
          ];
        }),
      );
      writeFileSync(
        V2_WALLETS,
        JSON.stringify(
          {
            testOnly: true,
            chainId: 84532,
            project: "post-and-paid-v2",
            roles,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    }
    if (process.argv.includes("--generate-only")) {
      console.log(
        JSON.stringify({
          executor: nextWallets().executor.account.address,
          creatorTest: nextWallets().creatorTest.account.address,
        }),
      );
      return;
    }
    const source = wallets().deployer,
      target = nextWallets().executor;
    const [latest, pending] = await Promise.all([
      publicClient.getTransactionCount({
        address: source.account.address,
        blockTag: "latest",
      }),
      publicClient.getTransactionCount({
        address: source.account.address,
        blockTag: "pending",
      }),
    ]);
    if (latest !== pending)
      throw new Error(
        "V1 source wallet has a pending nonce; allocation stopped.",
      );
    const path = resolve(V2_LOCAL, "allocation.json");
    const state: any = readJson(path) || { transactions: {} };
    const save = (s: any) => writeJson(path, s);
    const runtime = { actor: source, save };
    await sendDurable(
      state,
      "v2-gas-allocation",
      "deployer",
      { to: target.account.address, value: 300000000000000n, data: "0x" },
      50000000000000n,
      false,
      runtime,
    );
    const abi = parseAbi([
      "function transfer(address to,uint256 amount) returns(bool)",
    ]);
    await sendDurable(
      state,
      "v2-api-allocation",
      "deployer",
      {
        to: AUSD,
        data: encodeFunctionData({
          abi,
          functionName: "transfer",
          args: [target.account.address, 100000n],
        }),
      },
      50000000000000n,
      false,
      runtime,
    );
    const evidence = {
      at: new Date().toISOString(),
      network: "Base Sepolia84532",
      source: source.account.address,
      executor: target.account.address,
      creatorTest: nextWallets().creatorTest.account.address,
      gasAllocationWei: "300000000000000",
      apiAllocationUnits: "100000",
      transactions: Object.fromEntries(
        Object.entries(state.transactions).map(([key, r]: [string, any]) => [
          key,
          { hash: r.hash, status: r.status, gasCostWei: r.gasCostWei },
        ]),
      ),
    };
    writeJson("evidence/v2/isolated-wallets.json", evidence);
    console.log(JSON.stringify(evidence, null, 2));
  }),
);
