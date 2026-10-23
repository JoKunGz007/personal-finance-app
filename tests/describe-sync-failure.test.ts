import { afterEach, describe, expect, it, vi } from "vitest";
import { describeSyncFailure, NO_ROUTE_TEXT, syncGrabMail, syncMailboxStatements } from "@/lib/browser/mail-sync";

// "The server could not be reached" and "the server answered N" are different faults (Open item 9).
// `fetch` is stubbed; nothing is contacted.

afterEach(() => { vi.unstubAllGlobals(); });

const html = (status: number) => new Response("<html>Gateway Timeout</html>", { status, headers: { "content-type": "text/html" } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("describeSyncFailure", () => {
  it("words each kind of failure", () => {
    expect(describeSyncFailure({ kind: "unreachable", why: NO_ROUTE_TEXT, status: null }, "the mailbox was not read"))
      .toBe("The server could not be reached, so the mailbox was not read.");
    expect(describeSyncFailure({ kind: "refused", why: NO_ROUTE_TEXT, status: 504 }, "the mailbox was not read"))
      .toBe("The server answered 504, so the mailbox was not read.");
    expect(describeSyncFailure({ kind: "refused", why: "Own words.", status: 500 }, "x")).toBe("Own words.");
    expect(describeSyncFailure({ kind: "off-contract", why: "Off.", status: null }, "x")).toBe("Off.");
  });
});

describe("the Sync loops' failure sentences", () => {
  it("say the server could not be reached when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    expect((await syncGrabMail()).error).toBe("The server could not be reached, so the mailbox was not read.");
  });

  it("say which status answered when the body has no error of its own", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html(504)));
    expect((await syncGrabMail()).error).toBe("The server answered 504, so the mailbox was not read.");
  });

  it("show the route's own words as they are", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "X" }, 500)));
    expect((await syncGrabMail()).error).toBe("X");
  });

  it("word the statement listing the same way", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html(502)));
    expect(await syncMailboxStatements()).toEqual({ ok: false, why: "The server answered 502, so the mailbox was not listed." });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    expect(await syncMailboxStatements()).toEqual({ ok: false, why: "The server could not be reached, so the mailbox was not listed." });
  });

  it("word a per-statement platform answer by its status", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => call++ === 0
      ? json({ messages: 1, attachments: [{ uid: 4, part: "2", name: "s.pdf" }], truncated: false, since: null })
      : html(504)));
    const result = await syncMailboxStatements();
    expect(result.ok && result.total.error).toBe("The server answered 504, so the statement was not fetched.");
  });
});
