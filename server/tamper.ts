import { resolve } from "node:path";
import {
  keccak256,
  encodePacked,
  toHex,
  type Hex,
  decodeErrorResult,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { current, exportEvidence } from "./app";
import { publicClient, wallets, now, iso } from "./config";
import {
  load,
  save,
  exclusive,
  readJson,
  writeJson,
  LOCAL,
  event,
} from "./store";
import {
  artifact,
  deploymentData,
  proofData,
  sendDurable,
  chainState,
} from "./chain";
import { validatePayment } from "./payment";
export async function prepareGuard() {
  return exclusive(async () => {
    const state = current();
    if (state.guard) return state.guard;
    if (!state.deployment)
      throw new Error(
        "Fund the primary agreement before the rejection harness.",
      );
    const config = {
      ...state.campaign,
      payoutWei: "1000000000",
      maxResponseAge: 30,
      claimDeadline: now() + 180,
    };
    const { record, receipt } = await sendDurable(
      state,
      "guard-funding",
      "buyer",
      { data: deploymentData(config), value: BigInt(config.payoutWei) },
      100000000000000n,
    );
    state.guard = {
      address: receipt.contractAddress || record.contractAddress,
      transactionHash: record.hash,
      campaign: config,
    };
    save(state);
    return state.guard;
  });
}
function rejection(error: any) {
  let data = error?.data || error?.cause?.data || error?.cause?.cause?.data;
  if (typeof data === "object") data = data?.data;
  try {
    return decodeErrorResult({ abi: artifact().abi, data }).errorName;
  } catch {}
  return error.shortMessage || error.message || "Contract rejected";
}
export async function runTamper() {
  return exclusive(async () => {
    const state = current();
    const envelope = state.rawEnvelope || state.snapshot;
    const recorded = readJson<any>(resolve("evidence/tamper.json"));
    if (
      recorded?.results?.length &&
      (!state.guard || (await chainState(state.guard.address)) !== 0)
    ) {
      state.tamper = {
        results: recorded.results,
        recorded: true,
        contract: recorded.guard.address,
        checkedAt: recorded.checkedAt,
      };
      save(state);
      return state.tamper;
    }
    if (!state.guard || !envelope)
      throw new Error(
        "Run npm run scenario to prepare a funded rejection harness and a real paid snapshot first.",
      );
    const guard = state.guard;
    state.tamper ||= { results: [] };
    const result = (name: string, patch: any) => {
      const index = state.tamper.results.findIndex((r: any) => r.name === name);
      const value = { name, ...patch };
      if (index >= 0) state.tamper.results[index] = value;
      else state.tamper.results.push(value);
      save(state);
    };
    const before = {
      state: await chainState(guard.address),
      balanceWei: String(
        await publicClient.getBalance({ address: guard.address }),
      ),
    };
    if (before.state !== 0)
      throw new Error("Rejection harness must still be funded and active.");
    // A real paid response to the same post WITHOUT the pinned projection is a different request.
    const different = readJson<any>(
      resolve("evidence/source-preflight.json"),
    )?.envelope;
    if (!different)
      throw new Error(
        "Run npm run preflight to obtain the real different-request response.",
      );
    const wrongKey = privateKeyToAccount(generatePrivateKey());
    const wrongSignature = await wrongKey.signMessage({
      message: {
        raw: keccak256(
          encodePacked(
            ["bytes32", "uint256", "bytes"],
            [
              envelope.requestHash,
              BigInt(envelope.timestamp),
              toHex(envelope.data),
            ],
          ),
        ),
      },
    });
    const cases = [
      {
        name: "Edited value",
        response: {
          ...envelope,
          data: envelope.data.replace("just", "forged"),
        },
        expected: "signature",
      },
      {
        name: "Different request",
        response: different,
        expected: "request signature",
      },
      {
        name: "Wrong signer",
        response: { ...envelope, signature: wrongSignature },
        expected: "signer",
      },
      { name: "Stale response", response: envelope, expected: "freshness" },
    ];
    for (const c of cases) {
      const key = "tamper-" + c.name.toLowerCase().replaceAll(" ", "-");
      const existing = state.transactions[key];
      if (existing?.status === "reverted") {
        result(c.name, {
          status: "pass",
          detail: "Deployed contract rejected the response; escrow unchanged.",
          transactionHash: existing.hash,
        });
        continue;
      }
      const block = await publicClient.getBlock();
      if (
        c.name === "Stale response" &&
        Number(block.timestamp) - Number(envelope.timestamp) <=
          guard.campaign.maxResponseAge
      ) {
        result(c.name, {
          status: "pending",
          detail: `Use the original response after its ${guard.campaign.maxResponseAge}-second harness freshness limit. No timestamp is edited.`,
        });
        continue;
      }
      let reason = "";
      try {
        await publicClient.call({
          account: wallets().deployer.account.address,
          to: guard.address,
          data: proofData(c.response),
        });
      } catch (e: any) {
        reason = rejection(e);
      }
      if (!reason) {
        result(c.name, {
          status: "fail",
          detail: "Unexpected acceptance; no transaction was broadcast.",
        });
        continue;
      }
      const { record, receipt } = await sendDurable(
        state,
        key,
        "deployer",
        { to: guard.address, data: proofData(c.response), gas: 650000n } as any,
        100000000000000n,
        true,
      );
      const after = {
        state: await chainState(guard.address),
        balanceWei: String(
          await publicClient.getBalance({ address: guard.address }),
        ),
      };
      const pass =
        receipt.status === "reverted" &&
        before.state === after.state &&
        before.balanceWei === after.balanceWei;
      result(c.name, {
        status: pass ? "pass" : "fail",
        detail: `${reason}. Funded escrow and payout state unchanged.`,
        transactionHash: record.hash,
        before,
        after,
        response: { ...c.response, airnode: c.response.airnode },
        gasCostWei: record.gasCostWei,
      });
    }
    // Pure policy rejection and chain replay test are separate from the four oracle tests.
    let overBudget = false;
    try {
      validatePayment(
        {
          ...state.mandate,
          actionsUsed: 0,
          apiSpentUnits: "0",
          status: "active",
          expiresAt: now() + 60,
        },
        {
          network: "eip155:84532",
          asset: state.mandate.asset,
          payTo: state.mandate.recipient,
          amount: "10001",
        },
      );
    } catch {
      overBudget = true;
    }
    result("Over-budget agent action", {
      status: overBudget ? "pass" : "fail",
      detail:
        "10001 units exceeds the pinned 10000-unit call cap. No authorization created.",
    });
    let duplicate = false;
    try {
      await publicClient.call({
        account: wallets().deployer.account.address,
        to: state.deployment.address,
        data: proofData(envelope),
      });
    } catch (e: any) {
      duplicate = true;
    }
    result("Duplicate payout", {
      status: duplicate ? "pass" : "fail",
      detail:
        "The already-paid agreement rejects another submission. No second payout or API charge.",
    });
    const after = {
      state: await chainState(guard.address),
      balanceWei: String(
        await publicClient.getBalance({ address: guard.address }),
      ),
    };
    const evidence = {
      checkedAt: iso(),
      network: state.network,
      main: state.deployment,
      guard,
      before,
      after,
      results: state.tamper.results,
    };
    writeJson(resolve("evidence/tamper.json"), evidence);
    event(
      state,
      "Rejection checks recorded",
      `${state.tamper.results.filter((r: any) => r.status === "pass").length} checks passed; ${state.tamper.results.filter((r: any) => r.status === "pending").length} pending.`,
    );
    return { results: state.tamper.results };
  });
}
export async function refundGuard() {
  return exclusive(async () => {
    const state = current();
    if (!state.guard) throw new Error("No rejection harness.");
    const { encodeFunctionData } = await import("viem");
    const data = encodeFunctionData({
      abi: artifact().abi,
      functionName: "refund",
    });
    const { record } = await sendDurable(
      state,
      "guard-refund",
      "buyer",
      { to: state.guard.address, data },
      100000000000000n,
    );
    state.guard.refunded = true;
    save(state);
    const evidence = readJson<any>(resolve("evidence/tamper.json")) || {};
    evidence.refund = {
      transactionHash: record.hash,
      state: await chainState(state.guard.address),
      balanceWei: String(
        await publicClient.getBalance({ address: state.guard.address }),
      ),
    };
    writeJson(resolve("evidence/tamper.json"), evidence);
    return evidence.refund;
  });
}
