import { runTamper, refundGuard } from "../server/tamper";
console.log(
  JSON.stringify(
    process.argv.includes("--refund-guard")
      ? await refundGuard()
      : await runTamper(),
    null,
    2,
  ),
);
