import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logMailSyncFailure, safeErrorCode } from "@/lib/server/mail-sync-log";

// The one value-free log line a failed mailbox Sync request leaves (Open item 9). Errors are invented;
// the fake address stands for the account address an IMAP error can quote.
const ADDRESS = "owner@example.test";

const state = vi.hoisted(() => ({
  openError: null as unknown,
  syncError: null as unknown,
  authStatus: 0
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => state.authStatus === 0
    ? { ok: true, supabase: {} }
    : { ok: false, status: state.authStatus, message: "Refused." }
}));
vi.mock("@/lib/server/statement-mailbox-session", () => ({
  mailboxConfig: () => ({ ok: true, config: { senders: [] } }),
  openMailbox: async () => {
    if (state.openError) throw state.openError;
    return { client: {}, release: async () => {} };
  },
  findAttachments: async () => { throw state.syncError; }
}));
vi.mock("@/lib/server/delivery-mailbox", () => ({
  syncDeliveryMail: async () => { throw state.syncError; }
}));

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  state.openError = null; state.syncError = null; state.authStatus = 0;
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { logged.mockRestore(); });

describe("the failure code", () => {
  it("keeps a short plain code or name, preferring the code", () => {
    expect(safeErrorCode({ code: "ETIMEDOUT", name: "Error" })).toBe("ETIMEDOUT");
    expect(safeErrorCode(Object.assign(new Error("x"), { name: "ImapFlowError" }))).toBe("ImapFlowError");
  });

  it("drops a code with spaces, over 40 characters, or not a string", () => {
    expect(safeErrorCode({ code: "has a space" })).toBeNull();
    expect(safeErrorCode({ code: "A".repeat(41) })).toBeNull();
    expect(safeErrorCode({ code: "A".repeat(40) })).toBe("A".repeat(40));
    expect(safeErrorCode({ code: 7 })).toBeNull();
    expect(safeErrorCode(null)).toBeNull();
    expect(safeErrorCode("text")).toBeNull();
  });

  it("logs fixed words and the code, never the message", () => {
    logMailSyncFailure("x/y", "open", 502, Object.assign(new Error(`login failed for ${ADDRESS}`), { code: "AUTH FAILED" }));
    expect(logged).toHaveBeenCalledWith("mail sync failed", { route: "x/y", stage: "open", status: 502, code: null });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(ADDRESS);
  });
});

describe("the Sync routes", () => {
  it("log an open failure for Grab, without the error's message", async () => {
    state.openError = Object.assign(new Error(`Invalid credentials for ${ADDRESS}`), { code: "AuthenticationFailed" });
    const { POST } = await import("@/app/api/v1/deliveries/sync/route");
    const response = await POST();

    expect(response.status).toBe(502);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("mail sync failed", { route: "deliveries/sync", stage: "open", status: 502, code: "AuthenticationFailed" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(ADDRESS);
  });

  it("log a null code when the error's code is not a plain token", async () => {
    state.openError = Object.assign(new Error(ADDRESS), { code: `bad code ${ADDRESS}` });
    const { GET } = await import("@/app/api/v1/imports/mailbox/route");
    await GET(new Request("http://x.test/api/v1/imports/mailbox"));

    expect(logged).toHaveBeenCalledWith("mail sync failed", { route: "imports/mailbox", stage: "open", status: 502, code: null });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(ADDRESS);
  });

  it("log a read failure after the mailbox opened", async () => {
    state.syncError = Object.assign(new Error(ADDRESS), { name: "TypeError" });
    const { POST } = await import("@/app/api/v1/deliveries/sync/route");
    expect((await POST()).status).toBe(502);

    expect(logged).toHaveBeenCalledWith("mail sync failed", { route: "deliveries/sync", stage: "read", status: 502, code: "TypeError" });
  });

  it("log nothing for an owner-auth refusal", async () => {
    state.authStatus = 403;
    const { POST } = await import("@/app/api/v1/deliveries/sync/route");
    expect((await POST()).status).toBe(403);

    expect(logged).not.toHaveBeenCalled();
  });
});
