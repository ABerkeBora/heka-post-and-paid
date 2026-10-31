import { fundAgreement, startAgent, current } from "../server/app";
import { prepareGuard } from "../server/tamper";
await fundAgreement();
await prepareGuard();
try {
  const state = await startAgent();
  console.log(
    JSON.stringify(
      {
        status: state.status,
        deployment: state.deployment,
        receipts: state.receipts,
      },
      null,
      2,
    ),
  );
} catch (e: any) {
  console.error(e.shortMessage || e.message);
  process.exitCode = 1;
}
