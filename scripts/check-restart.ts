import { publicClient, AUSD, wallets } from "../server/config";
import { paidSnapshot } from "../server/payment";
import { requestFor, current, startAgent } from "../server/app";
import { parseAbi } from "viem";
import { writeJson } from "../server/store";
const w = wallets(),
  abi = parseAbi(["function balanceOf(address) view returns(uint256)"]);
const balances = async () => ({
  apiPayerUnits: String(
    await publicClient.readContract({
      address: AUSD,
      abi,
      functionName: "balanceOf",
      args: [w.deployer.account.address],
    }),
  ),
  creatorWei: String(
    await publicClient.getBalance({ address: w.counterparty.account.address }),
  ),
  escrowWei: String(
    await publicClient.getBalance({ address: current().deployment.address }),
  ),
});
const before = await balances();
let blocked = false,
  error = "";
try {
  await startAgent();
} catch (e: any) {
  blocked = true;
  error = e.shortMessage || e.message;
}
if (!/already settled|duplicate/.test(error))
  throw new Error("Action was blocked for an unexpected reason: " + error);
const state = current();
const cached = await paidSnapshot(
  state.intentId,
  requestFor(state.campaign.postId),
  state.mandate,
);
if (
  cached.settlement.transaction !==
  state.receipts.find((r: any) => r.kind === "data").transactionHash
)
  throw new Error("Cached intent changed payment receipt.");
const after = await balances();
if (!blocked || JSON.stringify(before) !== JSON.stringify(after))
  throw new Error("Duplicate/restart protection failed.");
writeJson("evidence/restart-duplicate.json", {
  at: new Date().toISOString(),
  campaignId: current().campaign.id,
  freshProcess: true,
  blocked,
  error,
  before,
  after,
});
console.log(
  "Fresh-process duplicate action blocked; API payer, creator and escrow balances unchanged.",
);
