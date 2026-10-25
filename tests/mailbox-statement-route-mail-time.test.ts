import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The mailbox statement route records when the statement's mail arrived (migration 064). The core
// (processMailboxStatement), the mailbox and the database are stubs; every value is invented.
const BATCH = "bbbbbbbb-0000-4000-8000-000000000001";
const ARTIFACT = "cccccccc-0000-4000-8000-000000000001";
const ARRIVED = new Date("2026-10-20T03:04:05.000Z");

const state = vi.hoisted(() => ({
  internalDate: null as Date | null,
  /** What the stubbed core does: confirm a new batch, or find the artifact already stored. */
  path: "confirm" as "confirm" | "replay" | "held",
  rpcCalls: [] as { name: string; args: unknown }[],
  rpcError: null as unknown,
  rpcThrows: false
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => ({
    ok: true,
    supabase: {
      rpc: async (name: string, args: unknown) => {
        state.rpcCalls.push({ name, args });
        if (state.rpcThrows) throw new Error("invented");
        return { data: null, error: state.rpcError };
      },
      from: (table: string) => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          limit: async () => ({ data: [{ id: table === "import_artifacts" ? ARTIFACT : BATCH }], error: null })
        };
        return chain;
      }
    }
  })
}));
vi.mock("@/lib/server/statement-mailbox-session", () => ({
  mailboxConfig: () => ({ ok: true, config: { senders: [] } }),
  openMailbox: async () => ({ client: { download: async () => ({ content: (async function* () { yield new Uint8Array([1]); })() }) }, unlock: () => {}, release: async () => {} }),
  markFetchedOnSession: async () => true,
  verifyAttachment: async () => ({ name: "x.pdf", sizeBytes: 1, internalDate: state.internalDate })
}));
vi.mock("@/lib/server/confirm-import", () => ({
  confirmImport: async () => ({ kind: "ok", batchId: BATCH, payloadDigest: "d", fingerprints: [], warnings: [] })
}));
vi.mock("@/lib/server/fingerprint-lookup", () => ({ existingImportRowCount: async () => 0, linkedBatchRowCount: async () => 0 }));
vi.mock("@/lib/server/statement-pdf-node", () => ({ readStatementPdf: async () => ({}), readStatementPdfPages: async () => ({}) }));
vi.mock("@/lib/server/mailbox-statement", () => ({
  processMailboxStatement: async (mode: string, deps: {
    download: () => Promise<unknown>;
    artifactExists: (digest: string) => Promise<boolean | null>;
    confirmImport: (body: unknown) => Promise<unknown>;
  }) => {
    await deps.download();
    // Worst case for the mode guard: outside import mode the stub still confirms a batch and reports
    // a saved statement, so only the route's own mode check can keep it from recording.
    if (mode !== "import") {
      await deps.confirmImport({});
      return { kind: "captured", artifactDigest: "a".repeat(64), accountLabel: "x", periodStart: "p", periodEnd: "q", rowCount: 1, existingRows: 0 };
    }
    if (state.path === "held") return { kind: "held", reason: "warnings", artifactDigest: "a".repeat(64) };
    if (state.path === "replay") {
      await deps.artifactExists("a".repeat(64));
      return { kind: "duplicate", artifactDigest: "a".repeat(64) };
    }
    await deps.confirmImport({});
    return { kind: "captured", artifactDigest: "a".repeat(64), accountLabel: "x", periodStart: "p", periodEnd: "q", rowCount: 1, existingRows: 0 };
  }
}));

async function post(mode: "import" | "read" | "dump") {
  const { POST } = await import("@/app/api/v1/imports/mailbox/statement/route");
  return POST(new Request("http://x.test/api/v1/imports/mailbox/statement", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid: 7, part: "2", mode })
  }));
}

let warned: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  state.internalDate = ARRIVED; state.path = "confirm"; state.rpcCalls = []; state.rpcError = null; state.rpcThrows = false;
  warned = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe("the mailbox statement route and mail arrival", () => {
  it("records the internal date against the confirmed batch", async () => {
    const response = await post("import");
    expect(response.status).toBe(200);
    expect(state.rpcCalls).toEqual([{ name: "record_statement_mail", args: { p_batch_id: BATCH, p_received_at: ARRIVED.toISOString() } }]);
    expect(warned).not.toHaveBeenCalled();
  });

  it("records against the earlier batch when the statement was already stored", async () => {
    state.path = "replay";
    expect((await post("import")).status).toBe(200);
    expect(state.rpcCalls).toEqual([{ name: "record_statement_mail", args: { p_batch_id: BATCH, p_received_at: ARRIVED.toISOString() } }]);
  });

  it("still succeeds, with one value-free line, when the RPC errors", async () => {
    state.rpcError = { code: "P0001", message: "batch 123 for owner@example.test" };
    const response = await post("import");
    expect(response.status).toBe(200);
    expect((await response.json()).kind).toBe("captured");
    expect(warned).toHaveBeenCalledTimes(1);
    expect(warned).toHaveBeenCalledWith("statement mail time not recorded", { code: "P0001" });
    expect(JSON.stringify(warned.mock.calls)).not.toContain("owner@example.test");
  });

  it("still succeeds when the RPC call throws", async () => {
    state.rpcThrows = true;
    expect((await post("import")).status).toBe(200);
    expect(warned).toHaveBeenCalledTimes(1);
  });

  it("still succeeds, calls nothing and logs one line when the message has no internal date", async () => {
    state.internalDate = null;
    expect((await post("import")).status).toBe(200);
    expect(state.rpcCalls).toEqual([]);
    expect(warned).toHaveBeenCalledTimes(1);
    expect(warned).toHaveBeenCalledWith("statement mail time not recorded", { code: "NO_INTERNAL_DATE" });
  });

  it("records nothing for a held statement", async () => {
    state.path = "held";
    expect((await post("import")).status).toBe(200);
    expect(state.rpcCalls).toEqual([]);
  });

  it("records nothing in read mode", async () => {
    expect((await post("read")).status).toBe(200);
    expect(state.rpcCalls).toEqual([]);
  });

  it("records nothing in dump mode", async () => {
    expect((await post("dump")).status).toBe(200);
    expect(state.rpcCalls).toEqual([]);
  });
});
