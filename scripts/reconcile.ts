import { resolve } from "node:path";
import { current, exportEvidence } from "../server/app";
import { publicClient } from "../server/config";
import { receiptFeeBreakdown } from "../server/chain";
import { exclusive, save, writeJson } from "../server/store";
await exclusive(async () => {
  const state = current();
  for (const record of Object.values(state.transactions) as any[]) {
    const receipt = await publicClient.getTransactionReceipt({
      hash: record.hash,
    });
    Object.assign(record, await receiptFeeBreakdown(receipt));
  }
  if (state.mandate && state.transactions.payout)
    state.mandate.gasSpentWei = state.transactions.payout.gasCostWei;
  save(state);
  writeJson(resolve("evidence/live-flow.json"), exportEvidence(state));
  writeJson(
    resolve("evidence/runs", state.campaign.id + ".json"),
    exportEvidence(state),
  );
  console.log(
    JSON.stringify(
      {
        status: state.status,
        transactionCosts: exportEvidence(state).transactionCosts,
      },
      null,
      2,
    ),
  );
});
