import { afterEach, describe, expect, it, vi } from "vitest";
import { describeStatementTotal, GONE_REASON, statementsNeedDeviceImport, syncMailboxStatements, TOO_LARGE_REASON } from "@/lib/browser/mail-sync";
import { statementHeldReason } from "@/lib/inbox-drain";
import { mailboxReviewHref, parseMailboxParam } from "@/lib/statement-sync";

/** The mailbox statements import loop and its review link (D-237). `fetch` is stubbed; every value is invented. */

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(answers: (call: number) => Response) {
  let call = 0;
  const spy = vi.fn(async () => answers(call++));
  vi.stubGlobal("fetch", spy);
  return spy;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const item = (uid: number) => ({ id: `${uid}.2`, uid, part: "2", name: `s${uid}.pdf`, sizeBytes: 10 });
const listing = (uids: number[], truncated = false) =>
  json({ messages: uids.length, attachments: uids.map(item), truncated, since: null });

describe("the statements import loop", () => {
  it("posts each listed statement once, in order, in import mode", async () => {
    const spy = stubFetch((call) => call === 0 ? listing([4, 5]) : json({ kind: "captured", artifactDigest: "d" }));
    const result = await syncMailboxStatements();

    expect(result.ok && result.total).toMatchObject({ captured: 2, duplicates: 0, held: [], remaining: 0, error: null });
    expect(spy).toHaveBeenCalledTimes(3);
    const calls = spy.mock.calls as unknown as [string, RequestInit][];
    expect(calls[1]![0]).toBe("/api/v1/imports/mailbox/statement");
    expect(JSON.parse(String(calls[1]![1].body))).toEqual({ uid: 4, part: "2", mode: "import" });
    expect(JSON.parse(String(calls[2]![1].body))).toEqual({ uid: 5, part: "2", mode: "import" });
  });

  it("counts duplicates and keeps held ones with a reason and a review link", async () => {
    stubFetch((call) => call === 0 ? listing([4, 5, 6])
      : call === 1 ? json({ kind: "duplicate", artifactDigest: "d" })
      : call === 2 ? json({ kind: "held", reason: "warnings", artifactDigest: "d" })
      : json({ kind: "held", reason: "locked", artifactDigest: "d" }));
    const result = await syncMailboxStatements();
    if (!result.ok) throw new Error(result.why);

    expect(result.total.duplicates).toBe(1);
    expect(result.total.held.map((entry) => entry.reviewHref)).toEqual(["/import?mailbox=5%3A2", null]);
    expect(result.total.held[0]!.reason).toBe(statementHeldReason("warnings"));
    expect(statementsNeedDeviceImport(result.total)).toBe(true);
  });

  it("stops at the first failed request and counts the rest as remaining", async () => {
    const spy = stubFetch((call) => call === 0 ? listing([4, 5, 6]) : json({ error: "The mailbox is busy." }, 502));
    const result = await syncMailboxStatements();

    expect(result.ok && result.total).toMatchObject({ captured: 0, remaining: 3, error: expect.stringContaining("The mailbox is busy.") });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("holds a statement the mailbox no longer has, or that is too large, and carries on", async () => {
    const spy = stubFetch((call) => call === 0 ? listing([4, 5, 6])
      : call === 1 ? json({ error: "No statement attachment was found there." }, 404)
      : call === 2 ? json({ error: "Too large." }, 413)
      : json({ kind: "captured", artifactDigest: "d" }));
    const result = await syncMailboxStatements();
    if (!result.ok) throw new Error(result.why);

    expect(spy).toHaveBeenCalledTimes(4);
    expect(result.total).toMatchObject({ captured: 1, remaining: 0, error: null });
    expect(result.total.held.map((entry) => entry.reason)).toEqual([GONE_REASON, TOO_LARGE_REASON]);
    expect(result.total.held.every((entry) => entry.reviewHref === null)).toBe(true);
    expect(statementsNeedDeviceImport(result.total)).toBe(false);
  });

  it("still stops on a 5xx", async () => {
    const spy = stubFetch((call) => call === 0 ? listing([4, 5]) : json({ error: "Busy." }, 502));
    const result = await syncMailboxStatements();
    expect(result.ok && result.total).toMatchObject({ remaining: 2, held: [] });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("reports a listing failure and posts nothing", async () => {
    const spy = stubFetch(() => json({ error: "The statement mailbox could not be opened." }, 502));
    expect(await syncMailboxStatements()).toEqual({ ok: false, why: "The statement mailbox could not be opened." });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("describes the totals and offers the device import only when something still needs it", () => {
    const base = { captured: 0, duplicates: 0, held: [], remaining: 0, more: false, error: null };
    expect(describeStatementTotal({ ...base, captured: 2, duplicates: 1 })).toBe("2 statements imported. 1 statement was already in the ledger.");
    expect(describeStatementTotal(base)).toBe("No new statements were imported.");
    expect(statementsNeedDeviceImport(base)).toBe(false);
    expect(statementsNeedDeviceImport({ ...base, more: true })).toBe(true);
    expect(statementsNeedDeviceImport({ ...base, remaining: 1 })).toBe(true);
  });
});

describe("the mailbox review link", () => {
  it("round-trips a ref through the query value", () => {
    const value = new URL(mailboxReviewHref({ uid: 12, part: "1.2" }), "http://x").searchParams.get("mailbox");
    expect(parseMailboxParam(value)).toEqual({ uid: 12, part: "1.2" });
  });

  it("refuses anything the attachment route would refuse", () => {
    for (const raw of [null, "", "12", "0:2", "-1:2", "12:", "12:a", "12:0", "12:1..2", "12:2:3", "1.5:2", "12:2/../x"]) {
      expect(parseMailboxParam(raw), String(raw)).toBeNull();
    }
  });
});
