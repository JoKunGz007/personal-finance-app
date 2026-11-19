import { beforeEach, describe, expect, it, vi } from "vitest";

// The best-effort time fill (migration 067). The match decision is `loadReceiptMatches`'s (mocked
// here); the RPC's own rules are pgTAP's (043). Every value is invented.
const R1 = "aaaaaaaa-0000-4000-8000-000000000001";
const R2 = "aaaaaaaa-0000-4000-8000-000000000002";
const R3 = "aaaaaaaa-0000-4000-8000-000000000003";
const R4 = "aaaaaaaa-0000-4000-8000-000000000004";
const R5 = "aaaaaaaa-0000-4000-8000-000000000005";
const T1 = "bbbbbbbb-0000-4000-8000-000000000001";
const T2 = "bbbbbbbb-0000-4000-8000-000000000002";
const T5 = "bbbbbbbb-0000-4000-8000-000000000005";

const state = vi.hoisted(() => ({ loaded: null as unknown }));
vi.mock("@/lib/server/current-matches", () => ({ loadReceiptMatches: async () => state.loaded }));

import { fillReceiptTimes } from "@/lib/server/receipt-time-fill";

const R6 = "aaaaaaaa-0000-4000-8000-000000000006";
const T6 = "bbbbbbbb-0000-4000-8000-000000000006";

const receipt = (id: string, time: string | null, status: string, rowId: string | null, sources: string[] = ["screenshot"]) =>
  ({ id, purchased_at_time: time, sources, match: { status, row: rowId ? { transaction_id: rowId } : null } });

type Result = { data?: unknown; error?: unknown };

function client(result: Result | (() => never) = { data: { filled: true }, error: null }) {
  const calls: Array<[string, unknown]> = [];
  const stub = {
    calls,
    rpc: async (name: string, args: unknown) => {
      calls.push([name, args]);
      if (typeof result === "function") return result();
      return { data: result.data ?? null, error: result.error ?? null };
    }
  };
  return stub as typeof stub & Parameters<typeof fillReceiptTimes>[0];
}

describe("fillReceiptTimes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    state.loaded = {
      ok: true,
      receipts: [
        receipt(R1, null, "matched", T1),
        receipt(R2, "12:30:00", "matched", T2),
        receipt(R3, null, "ambiguous", null),
        receipt(R4, null, "none", null),
        receipt(R5, null, "linked", null),
        // A matched full tax invoice: time-less by form, never any candidates, so never offered.
        receipt(R6, null, "matched", T6, ["full"])
      ],
      decisions: [{ receipt_id: R5, decision: "matched", transaction_id: T5, revision: 1 }]
    };
  });

  it("offers only time-less screenshot receipts with a matched or linked row, never a timed, ambiguous, unmatched or full-invoice one", async () => {
    const c = client();
    const report = await fillReceiptTimes(c);
    expect(c.calls).toEqual([
      ["fill_receipt_time", { p_receipt_id: R1, p_transaction_id: T1 }],
      ["fill_receipt_time", { p_receipt_id: R5, p_transaction_id: T5 }]
    ]);
    expect(report).toEqual({ attempted: 2, filled: 2 });
  });

  it("narrows to the given receipt ids", async () => {
    const c = client();
    await fillReceiptTimes(c, { receiptIds: [R5, R2] });
    expect(c.calls).toEqual([["fill_receipt_time", { p_receipt_id: R5, p_transaction_id: T5 }]]);
  });

  it("counts a no-op reason as not filled", async () => {
    const c = client({ data: { filled: false, reason: "no time candidates" } });
    expect(await fillReceiptTimes(c)).toEqual({ attempted: 2, filled: 0 });
  });

  it("swallows an RPC error, logs a code only, and still tries the next receipt", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const c = client({ error: { message: "receipt not owned, secret detail", code: "P0001" } });
    expect(await fillReceiptTimes(c)).toEqual({ attempted: 2, filled: 0 });
    expect(c.calls).toHaveLength(2);
    expect(log).toHaveBeenCalledWith("receipt time fill failed", { stage: "rpc", code: "P0001" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("swallows a thrown error and a refused load", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(fillReceiptTimes(client(() => { throw new Error("boom with a value"); }))).resolves.toEqual({ attempted: 1, filled: 0 });
    state.loaded = { ok: false, message: "x", status: 500 };
    const c = client();
    await expect(fillReceiptTimes(c)).resolves.toEqual({ attempted: 0, filled: 0 });
    expect(c.calls).toEqual([]);
    expect(log).toHaveBeenCalledWith("receipt time fill failed", { stage: "load", status: 500 });
  });
});
