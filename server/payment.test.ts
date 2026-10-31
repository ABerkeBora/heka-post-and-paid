import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  type Hex,
} from "viem";
import { AUSD, API_RECIPIENT, AIRNODE, now } from "./config";
import {
  validatePayment,
  assertReusableIntent,
  verifyTransferReceipt,
  type Mandate,
} from "./payment";

const payer = "0x1111111111111111111111111111111111111111" as const;
const other = "0x2222222222222222222222222222222222222222" as const;
const hash = `0x${"ab".repeat(32)}` as Hex;
const transfer = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
function mandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: "test-mandate",
    status: "active",
    apiPerCallUnits: "10000",
    apiTotalUnits: "20000",
    apiSpentUnits: "0",
    maxActions: 2,
    actionsUsed: 0,
    gasCapWei: "100000",
    gasTotalCapWei: "200000",
    gasSpentWei: "0",
    expiresAt: now() + 3600,
    recipient: API_RECIPIENT,
    asset: AUSD,
    network: "eip155:84532",
    beneficiary: other,
    contract: "0x3333333333333333333333333333333333333333",
    ...overrides,
  };
}
function requirement(overrides: Record<string, unknown> = {}) {
  return {
    scheme: "exact",
    network: "eip155:84532",
    asset: AUSD,
    payTo: API_RECIPIENT,
    amount: "10000",
    maxTimeoutSeconds: 60,
    ...overrides,
  };
}
function log(
  overrides: {
    address?: string;
    from?: `0x${string}`;
    to?: `0x${string}`;
    amount?: bigint;
  } = {},
) {
  return {
    address: overrides.address || AUSD,
    topics: encodeEventTopics({
      abi: [transfer],
      eventName: "Transfer",
      args: {
        from: overrides.from || payer,
        to: overrides.to || API_RECIPIENT,
      },
    }),
    data: encodeAbiParameters(
      [{ type: "uint256" }],
      [overrides.amount ?? 10000n],
    ),
  };
}
function receipt(logs = [log()], status = "success") {
  return { status, transactionHash: hash, logs };
}
function completedIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: "intent-1",
    httpStatus: 200,
    amountUnits: "10000",
    response: JSON.stringify({
      airnode: AIRNODE,
      requestHash: hash,
      timestamp: String(now()),
      data: '{"postId":"20","authorId":"12","createdAt":"Tue Mar 21 20:50:14 +0000 2006","text":"just setting up my twttr"}',
      signature: `0x${"12".repeat(65)}`,
    }),
    settlement: {
      success: true,
      transaction: hash,
      network: "eip155:84532",
      payer,
    },
    verifiedReceipt: {
      transactionHash: hash,
      blockNumber: "1",
      status: "success",
    },
    ...overrides,
  };
}

test("accepts the exact priced operation within remaining action and API budgets", () => {
  assert.doesNotThrow(() =>
    validatePayment(
      mandate({ apiSpentUnits: "10000", actionsUsed: 1 }),
      requirement(),
    ),
  );
});
test("accepts address casing differences without widening the recipient or asset", () => {
  assert.doesNotThrow(() =>
    validatePayment(
      mandate(),
      requirement({
        asset: AUSD.toLowerCase(),
        payTo: API_RECIPIENT.toLowerCase(),
      }),
    ),
  );
});
test("rejects a mainnet payment requirement", () => {
  assert.throws(() =>
    validatePayment(mandate(), requirement({ network: "eip155:8453" })),
  );
});
test("rejects a mandate with the wrong network even when the challenge is correct", () => {
  assert.throws(() =>
    validatePayment(mandate({ network: "eip155:1" }), requirement()),
  );
});
test("rejects a different payment asset", () => {
  assert.throws(() =>
    validatePayment(mandate(), requirement({ asset: other })),
  );
});
test("rejects a mutated mandate asset", () => {
  assert.throws(() =>
    validatePayment(mandate({ asset: other }), requirement()),
  );
});
test("rejects a different service recipient", () => {
  assert.throws(() =>
    validatePayment(mandate(), requirement({ payTo: other })),
  );
});
test("rejects a mutated mandate service recipient", () => {
  assert.throws(() =>
    validatePayment(mandate({ recipient: other }), requirement()),
  );
});
test("rejects a per-call overcharge by one integer unit", () => {
  assert.throws(() =>
    validatePayment(mandate(), requirement({ amount: "10001" })),
  );
});
test("rejects a fee that would exceed the remaining total budget", () => {
  assert.throws(() =>
    validatePayment(mandate({ apiSpentUnits: "10001" }), requirement()),
  );
});
test("rejects zero, negative and non-integer fee amounts", () => {
  for (const amount of ["0", "-1", "0.01", "not-an-integer"]) {
    assert.throws(
      () => validatePayment(mandate(), requirement({ amount })),
      amount,
    );
  }
});
test("rejects the next call when the action cap is exhausted", () => {
  assert.throws(() =>
    validatePayment(mandate({ actionsUsed: 2 }), requirement()),
  );
});
test("rejects an expired mandate without authorizing another charge", () => {
  assert.throws(() =>
    validatePayment(mandate({ expiresAt: now() - 1 }), requirement()),
  );
});

test("completed paid intent can be reused without creating a second authorization", () => {
  assert.doesNotThrow(() =>
    assertReusableIntent(completedIntent(), mandate(), now()),
  );
});
test("a cached HTTP200 body without a settlement is never a paid result", () => {
  assert.throws(() =>
    assertReusableIntent(
      completedIntent({ settlement: undefined }),
      mandate(),
      now(),
    ),
  );
});
test("a cached HTTP200 body with failed settlement is never a paid result", () => {
  assert.throws(() =>
    assertReusableIntent(
      completedIntent({ settlement: { success: false, transaction: hash } }),
      mandate(),
      now(),
    ),
  );
});
test("successful settlement does not turn a cached HTTP error into a delivered snapshot", () => {
  assert.throws(() =>
    assertReusableIntent(
      completedIntent({ httpStatus: 400 }),
      mandate(),
      now(),
    ),
  );
});
test("successful settlement with an empty response is not a reusable result", () => {
  assert.throws(() =>
    assertReusableIntent(completedIntent({ response: "" }), mandate(), now()),
  );
});
test("a cached unsigned error object is not a signed envelope", () => {
  assert.throws(() =>
    assertReusableIntent(
      completedIntent({ response: '{"error":"upstream unavailable"}' }),
      mandate(),
      now(),
    ),
  );
});

test("accepts a confirmed exact aUSD transfer from the payer to the pinned service", () => {
  assert.doesNotThrow(() => verifyTransferReceipt(receipt(), payer, 10000n));
});
test("rejects a reverted receipt even if it contains superficially matching logs", () => {
  assert.throws(() =>
    verifyTransferReceipt(receipt([log()], "reverted"), payer, 10000n),
  );
});
test("rejects a successful transaction with no token transfer", () => {
  assert.throws(() => verifyTransferReceipt(receipt([]), payer, 10000n));
});
test("rejects an otherwise matching event from another token contract", () => {
  assert.throws(() =>
    verifyTransferReceipt(receipt([log({ address: other })]), payer, 10000n),
  );
});
test("rejects a transfer charged to another payer", () => {
  assert.throws(() =>
    verifyTransferReceipt(receipt([log({ from: other })]), payer, 10000n),
  );
});
test("rejects a transfer to another recipient", () => {
  assert.throws(() =>
    verifyTransferReceipt(receipt([log({ to: other })]), payer, 10000n),
  );
});
test("rejects a transfer with an incorrect integer amount", () => {
  assert.throws(() =>
    verifyTransferReceipt(receipt([log({ amount: 9999n })]), payer, 10000n),
  );
  assert.throws(() =>
    verifyTransferReceipt(receipt([log({ amount: 10001n })]), payer, 10000n),
  );
});
test("ignores unrelated logs and finds the actual matching payment event", () => {
  assert.doesNotThrow(() =>
    verifyTransferReceipt(receipt([log({ to: other }), log()]), payer, 10000n),
  );
});

test("rejects a mandate whose previously reserved API budget leaves insufficient funds", () => {
  assert.throws(() =>
    validatePayment(mandate({ apiReservedUnits: "10001" }), requirement()),
  );
});
test("rejects an inactive mandate before signing a fee authorization", () => {
  assert.throws(() =>
    validatePayment(mandate({ status: "completed" }), requirement()),
  );
});
test("a settlement header alone does not make cached data a paid result", () => {
  assert.throws(() =>
    assertReusableIntent(
      completedIntent({ verifiedReceipt: undefined }),
      mandate(),
      now(),
    ),
  );
});
test("completed cached evidence remains readable after expiry without authorizing new spend", () => {
  assert.doesNotThrow(() =>
    assertReusableIntent(
      completedIntent(),
      mandate({ expiresAt: now() - 1, status: "completed" }),
      now(),
    ),
  );
});
test("an unresolved intent cannot replay an authorization after mandate expiry", () => {
  assert.throws(() =>
    assertReusableIntent(
      { id: "unresolved", paymentHeader: "already signed" },
      mandate({ expiresAt: now() - 1 }),
      now(),
    ),
  );
});
test("an unresolved intent cannot replay an authorization under an inactive mandate", () => {
  assert.throws(() =>
    assertReusableIntent(
      { id: "unresolved", paymentHeader: "already signed" },
      mandate({ status: "stopped" }),
      now(),
    ),
  );
});
