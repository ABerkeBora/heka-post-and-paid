import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
const projectRoot = process.cwd();
const folder = resolve(".local/readonly-check");
mkdirSync(resolve(folder, "evidence"), { recursive: true });
copyFileSync(
  resolve("evidence/live-flow.json"),
  resolve(folder, "evidence/live-flow.json"),
);
process.chdir(folder);
process.env.TEST_WALLETS_FILE = resolve(".local/no-wallets.json");
const { publicState } = await import("../server/app");
const { writeJson } = await import("../server/store");
const state = publicState();
if (
  state.writable !== false ||
  state.mode !== "recorded-evidence" ||
  state.status !== "paid" ||
  state.receipts.length !== 3
)
  throw new Error("No-key recorded evidence startup failed.");
writeJson(resolve(projectRoot, "evidence/read-only-check.json"), {
  at: new Date().toISOString(),
  mode: state.mode,
  writable: state.writable,
  campaignId: state.campaign.id,
  receiptCount: state.receipts.length,
  passed: true,
  networkCalls: 0,
});
console.log(
  "No-key fresh startup shows recorded evidence with economic controls disabled.",
);
