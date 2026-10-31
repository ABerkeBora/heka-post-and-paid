import { readFileSync } from "node:fs";
import { submitProof, current } from "../server/app";
import { publicClient } from "../server/config";
import { proofData } from "../server/chain";
const path = process.argv[2];
const contractFlag = process.argv.indexOf("--contract");
const contract = contractFlag >= 0 ? process.argv[contractFlag + 1] : undefined;
if (contract && !/^0x[0-9a-fA-F]{40}$/.test(contract))
  throw new Error("Invalid contract address");
if (contract && !process.argv.includes("--check-only"))
  throw new Error(
    "Custom contract is allowed only with --check-only; no arbitrary delegated destination.",
  );
if (!path)
  throw new Error(
    "Usage: npm run submit-proof -- response.json [--check-only]",
  );
const file = JSON.parse(readFileSync(path, "utf8"));
const response = file.envelope || file;
if (process.argv.includes("--check-only")) {
  // Calls the actual deployed contract; no app validator substitutes for the oracle verifier.
  await publicClient.call({
    to: (contract || current().deployment.address) as `0x${string}`,
    data: proofData(response),
  });
  console.log(
    "Deployed contract accepted the response in eth_call; no transaction sent.",
  );
} else {
  const state = await submitProof(response);
  console.log(
    JSON.stringify({ status: state.status, receipts: state.receipts }, null, 2),
  );
}
