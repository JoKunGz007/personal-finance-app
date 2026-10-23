import { describe, expect, it, vi } from "vitest";

// Every value is invented. The confirm route reports how many rows the batch linked to stored rows.
const state = vi.hoisted(() => ({
  linked: 2 as number | null,
  batchIds: [] as string[],
  result: { kind: "ok" } as { kind: string }
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => ({ ok: true, supabase: {} })
}));
vi.mock("@/lib/server/confirm-import", async (original) => ({
  ...(await original<typeof import("@/lib/server/confirm-import")>()),
  confirmImport: async () => state.result.kind === "ok"
    ? { kind: "ok", batchId: "bbbbbbbb-0000-4000-8000-000000000001", payloadDigest: "d", fingerprints: [], warnings: [] }
    : { kind: "error", message: "The import could not be confirmed atomically." }
}));
vi.mock("@/lib/server/fingerprint-lookup", () => ({
  linkedBatchRowCount: async (_client: unknown, batchId: string) => { state.batchIds.push(batchId); return state.linked; }
}));

import { assembleImportPayload } from "@/lib/import-assembly";
import { extractStatement } from "@/lib/krungthai-layout";
import { validStatement } from "./fixtures/krungthai-layout-v1";

function payload() {
  const extracted = extractStatement(validStatement);
  if (!extracted.ok) throw new Error(extracted.message);
  const assembled = assembleImportPayload(extracted.frame, extracted.rows, {
    accountId: "cccccccc-0000-4000-8000-000000000011", bankCode: extracted.frame.bankCode, lastFour: extracted.frame.accountLastFour, currency: "THB"
  });
  if (!assembled.ok) throw new Error(assembled.message);
  return assembled.payload;
}

async function confirm() {
  const { POST } = await import("@/app/api/v1/imports/confirm/route");
  const response = await POST(new Request("http://localhost/api/v1/imports/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "aaaaaaaa-0000-4000-8000-000000000001", artifactDigest: "e".repeat(64), payload: payload() })
  }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("POST /api/v1/imports/confirm linked count", () => {
  it("returns the batch's linked row count", async () => {
    state.linked = 2; state.batchIds = []; state.result = { kind: "ok" };
    const response = await confirm();
    expect(response.status).toBe(201);
    expect(response.body.linkedRows).toBe(2);
    expect(state.batchIds).toEqual(["bbbbbbbb-0000-4000-8000-000000000001"]);
  });

  it("caps the count at the payload's rows and reports null when the read fails", async () => {
    state.linked = 999; state.result = { kind: "ok" };
    expect((await confirm()).body.linkedRows).toBe(payload().rows.length);
    state.linked = null;
    const failed = await confirm();
    expect(failed.status).toBe(201);
    expect(failed.body.linkedRows).toBeNull();
  });

  it("does not read the batch when the confirm failed", async () => {
    state.batchIds = []; state.result = { kind: "error" };
    expect((await confirm()).status).toBe(400);
    expect(state.batchIds).toEqual([]);
  });
});
