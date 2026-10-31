import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { publicClient } from "../server/config";
import { escrowAbi } from "../server/chain";
import { writeJson } from "../server/store";
const baseline = JSON.parse(
  readFileSync(".local/v1-baseline-manifest.json", "utf8"),
);
const mismatch: string[] = [];
for (const [path, hash] of Object.entries(baseline.files)) {
  if (
    !existsSync(path) ||
    createHash("sha256").update(readFileSync(path)).digest("hex") !== hash
  )
    mismatch.push(path);
}
const oldFiles = execFileSync(
  "git",
  [
    "ls-tree",
    "-r",
    "--name-only",
    "v1-baseline",
    "evidence/",
    "contracts/PostAndPaidEscrow.sol",
    "contracts/AirnodeV2Attestation.sol",
    "contracts/ProjectedJson.sol",
    "contracts/TwitterTimestamp.sol",
    "contracts/IsoTimestamp.sol",
    "test/PostAndPaidEscrow.t.sol",
  ],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
for (const path of oldFiles) {
  const old = execFileSync("git", ["show", "v1-baseline:" + path]);
  if (!readFileSync(path).equals(old)) mismatch.push(path);
}
const state = JSON.parse(readFileSync(".local/state.json", "utf8"));
const api = await fetch("http://127.0.0.1:3106/api/state").then((r) =>
  r.json(),
);
const status = await publicClient.readContract({
  address: state.deployment.address,
  abi: escrowAbi,
  functionName: "state",
});
if (
  api.status !== "paid" ||
  api.deployment.address !== state.deployment.address ||
  status !== 1
)
  throw new Error("V1 read-only regression failed.");
for (const [path, hash] of Object.entries(baseline.files)) {
  if (createHash("sha256").update(readFileSync(path)).digest("hex") !== hash)
    mismatch.push(path);
}
if (mismatch.length)
  throw new Error(
    "V1 baseline files changed: " + [...new Set(mismatch)].join(","),
  );
writeJson("evidence/v2/v1-regression.json", {
  at: new Date().toISOString(),
  baselineCommit: baseline.commit,
  tag: "v1-baseline",
  runtimeFilesPreserved: Object.keys(baseline.files).length,
  sourceAndEvidenceFilesPreserved: oldFiles.length,
  changedFiles: [],
  apiStatus: api.status,
  contract: state.deployment.address,
  onchainState: Number(status),
  passed: true,
});
console.log(
  "V1 data/intent/receipt, original source/evidence bytes and paid on-chain state preserved.",
);
