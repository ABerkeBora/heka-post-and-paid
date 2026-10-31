import { readFileSync, readdirSync } from "node:fs";
import { decodeEventLog, keccak256, toHex } from "viem";
import { publicClient } from "../server/config";
import { artifact, escrowAbi } from "../server/chain";
import { deriveRequestHash, verifySignedResponse } from "../server/airnode";
import { requestFor } from "../server/app";
import { writeJson } from "../server/store";
const a = artifact();
const files = readdirSync("evidence/runs").filter((x) => x.endsWith(".json"));
const results = [];
for (const file of files) {
  const run = JSON.parse(readFileSync("evidence/runs/" + file, "utf8"));
  const [tx, code, receipt, requestHash] = await Promise.all([
    publicClient.getTransaction({ hash: run.deployment.transactionHash }),
    publicClient.getCode({ address: run.deployment.address }),
    publicClient.getTransactionReceipt({
      hash: run.payoutEvidence.transactionHash,
    }),
    publicClient.readContract({
      address: run.deployment.address,
      abi: escrowAbi,
      functionName: "requestHash",
    }),
  ]);
  if (
    !tx.input.startsWith(a.bytecode.object) ||
    !code ||
    code === "0x" ||
    receipt.status !== "success"
  )
    throw new Error("Deployment or receipt does not match published contract.");
  const expected = deriveRequestHash(requestFor(run.campaign.postId));
  if (requestHash !== expected)
    throw new Error("Stored request hash does not match recipe.");
  await verifySignedResponse(run.snapshot, run.campaign.airnode, expected);
  const paid = receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== run.deployment.address.toLowerCase())
      return false;
    try {
      const e = decodeEventLog({
        abi: escrowAbi,
        data: log.data,
        topics: log.topics,
      });
      return (
        e.eventName === "CreatorPaid" &&
        e.args.creator.toLowerCase() === run.campaign.creator.toLowerCase() &&
        e.args.amount === BigInt(run.campaign.payoutWei) &&
        e.args.dataHash === keccak256(toHex(run.snapshot.data))
      );
    } catch {
      return false;
    }
  });
  if (!paid)
    throw new Error(
      "Confirmed receipt has no exact CreatorPaid event bound to this signed data.",
    );
  results.push({
    campaignId: run.campaign.id,
    contract: run.deployment.address,
    deploymentTransaction: tx.hash,
    payoutTransaction: receipt.transactionHash,
    initBytecodeMatches: true,
    expectedRequestHash: expected,
    airnodeSignatureVerified: true,
    creatorPaidEventVerified: true,
    payoutWei: run.campaign.payoutWei,
    passed: true,
  });
}
writeJson("evidence/deployment-check.json", {
  at: new Date().toISOString(),
  chainId: await publicClient.getChainId(),
  runs: results,
});
console.log(JSON.stringify(results, null, 2));
