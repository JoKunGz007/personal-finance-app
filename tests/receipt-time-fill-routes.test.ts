import { beforeEach, describe, expect, it, vi } from "vitest";

// Each write path that can complete a time-less receipt's match calls the best-effort fill after
// success, never after a failure, and never changes its response. Every value is invented.
const RECEIPT = "aaaaaaaa-0000-4000-8000-000000000001";
const ROW = "bbbbbbbb-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  fills: [] as unknown[],
  capture: null as unknown,
  setMatch: { data: null as unknown, error: null as unknown },
  syncFails: false,
  confirm: { data: "batch" as unknown, error: null as unknown }
}));

vi.mock("@/lib/server/receipt-time-fill", () => ({
  fillReceiptTimes: async (_client: unknown, options?: unknown) => { state.fills.push(options ?? null); return { attempted: 0, filled: 0 }; }
}));
vi.mock("@/lib/server/receipt-pdf-node", () => ({ loadPdfJs: async () => undefined, readReceiptPdfBytes: async () => null }));
vi.mock("@/lib/server/receipt-mailbox", () => ({
  syncReceiptMail: async () => { if (state.syncFails) throw new Error("mailbox"); return { scanned: 1 }; }
}));
vi.mock("@/lib/server/statement-mailbox-session", () => ({
  mailboxConfig: () => ({ ok: true, config: {} }),
  openMailbox: async () => ({ client: {}, release: async () => undefined })
}));
vi.mock("@/lib/server/auto-categorise", () => ({ autoCategorise: async () => undefined }));
vi.mock("@/lib/server/receipt-store", () => ({ captureReceipt: async () => state.capture }));
vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => ({
    ok: true,
    supabase: { rpc: async (name: string) => name === "set_receipt_match" ? state.setMatch : { data: null, error: null } }
  })
}));

beforeEach(() => {
  state.fills = [];
  state.capture = { ok: true, data: { captured: true, receipt: { id: RECEIPT, purchased_at_time: null } } };
  state.setMatch = { data: { receipt_id: RECEIPT, decision: "matched", transaction_id: ROW, revision: 1 }, error: null };
  state.syncFails = false;
  state.confirm = { data: "batch", error: null };
});

describe("POST /api/v1/receipts", () => {
  const post = async () => {
    const { POST } = await import("@/app/api/v1/receipts/route");
    return POST(new Request("http://localhost/api/v1/receipts", { method: "POST", body: "{}" }));
  };

  it("fills for the captured receipt after success and leaves the body as captured", async () => {
    const response = await post();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ captured: true, receipt: { id: RECEIPT, purchased_at_time: null } });
    expect(state.fills).toEqual([{ receiptIds: [RECEIPT] }]);
  });

  it("does not fill for a receipt that already has a time, or after a refusal", async () => {
    state.capture = { ok: true, data: { captured: false, receipt: { id: RECEIPT, purchased_at_time: "12:30:00" } } };
    expect((await post()).status).toBe(200);
    state.capture = { ok: false, reason: "refused" };
    expect((await post()).status).toBe(400);
    expect(state.fills).toEqual([]);
  });
});

describe("PUT /api/v1/receipts/[id]/match", () => {
  const put = async (decision: "matched" | "unmatched") => {
    const { PUT } = await import("@/app/api/v1/receipts/[id]/match/route");
    return PUT(
      new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ expectedRevision: 0, decision, transactionId: decision === "matched" ? ROW : null }) }),
      { params: Promise.resolve({ id: RECEIPT }) }
    );
  };

  it("fills for that receipt after a stored link and leaves the body as before", async () => {
    const response = await put("matched");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ match: { receipt_id: RECEIPT, decision: "matched", transaction_id: ROW, revision: 1 } });
    expect(state.fills).toEqual([{ receiptIds: [RECEIPT] }]);
  });

  it("does not fill after a decline or a refusal", async () => {
    state.setMatch = { data: { receipt_id: RECEIPT, decision: "unmatched", transaction_id: null, revision: 2 }, error: null };
    expect((await put("unmatched")).status).toBe(200);
    state.setMatch = { data: null, error: { message: "revision conflict" } };
    expect((await put("matched")).status).toBe(409);
    expect(state.fills).toEqual([]);
  });
});

describe("confirmImport (the confirm, mailbox and Inbox import routes)", () => {
  async function confirm(rpcError: unknown) {
    const { confirmImport } = await import("@/lib/server/confirm-import");
    const { assembleImportPayload } = await import("@/lib/import-assembly");
    const { extractStatement } = await import("@/lib/krungthai-layout");
    const { validStatement } = await import("./fixtures/krungthai-layout-v1");
    const extracted = extractStatement(validStatement);
    if (!extracted.ok) throw new Error(extracted.message);
    const assembled = assembleImportPayload(extracted.frame, extracted.rows, {
      accountId: "cccccccc-0000-4000-8000-000000000011", bankCode: extracted.frame.bankCode, lastFour: extracted.frame.accountLastFour, currency: "THB"
    });
    if (!assembled.ok) throw new Error(assembled.message);
    const client = { rpc: async (name: string) => name === "confirm_import" ? { data: "batch", error: rpcError } : { data: null, error: null } };
    return confirmImport(client as never, { idempotencyKey: "aaaaaaaa-0000-4000-8000-000000000001", artifactDigest: "e".repeat(64), payload: assembled.payload });
  }

  it("fills after a committed import and not after a failed one", async () => {
    expect((await confirm(null)).kind).toBe("ok");
    expect(state.fills).toEqual([null]);
    state.fills = [];
    expect((await confirm({ message: "boom" })).kind).toBe("error");
    expect(state.fills).toEqual([]);
  });
});

describe("POST /api/v1/receipts/sync", () => {
  const sync = async () => {
    const { POST } = await import("@/app/api/v1/receipts/sync/route");
    return POST();
  };

  it("fills once for the whole sync and leaves the report as it was", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await sync();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ scanned: 1 });
    expect(state.fills).toEqual([null]);
  });

  it("does not fill when the sync fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.syncFails = true;
    expect((await sync()).status).toBe(502);
    expect(state.fills).toEqual([]);
  });
});
