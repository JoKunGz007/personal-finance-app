import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkStatementMail, describeGrabOutcome, describeSevenElevenOutcome, MAX_SYNC_ROUNDS, syncGrabMail, syncSevenElevenMail
} from "@/lib/browser/mail-sync";

/**
 * The mailbox sync loops the Orders, Receipts and Inbox pages share. `fetch` is stubbed and every
 * count is invented (`docs/FIXTURE_POLICY.md`); no route is contacted.
 */

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(answers: (call: number) => Response) {
  let call = 0;
  const spy = vi.fn(async () => answers(call++));
  vi.stubGlobal("fetch", spy);
  return spy;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const grab = (over: Record<string, unknown> = {}) => ({
  messages: 2, captured: 1, alreadyStored: 0, ridesCaptured: 1, ridesAlreadyStored: 0, notReceipts: 0,
  refused: {}, truncated: false, ...over
});
const receipts = (over: Record<string, unknown> = {}) => ({
  messages: 2, captured: 1, alreadyStored: 1, notReceipts: 0, refused: {}, truncated: false, ...over
});

describe("the Grab sync loop", () => {
  it("asks once when nothing is left waiting, by POST to the sync route", async () => {
    const spy = stubFetch(() => json(grab()));
    const outcome = await syncGrabMail();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("/api/v1/deliveries/sync", expect.objectContaining({ method: "POST" }));
    expect(outcome.error).toBeNull();
    expect(outcome.total?.captured).toBe(1);
  });

  it("asks again while truncated, sums every round, and reports progress after each", async () => {
    const spy = stubFetch((call) => json(grab({
      captured: 2, alreadyStored: 1, refused: { BAD_TOTAL: 1 }, truncated: call < 2
    })));
    const seen: number[] = [];
    const outcome = await syncGrabMail((total) => seen.push(total.captured));

    expect(spy).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([2, 4, 6]);
    expect(outcome.total).toMatchObject({ captured: 6, alreadyStored: 3, ridesCaptured: 3, messages: 6, refused: { BAD_TOTAL: 3 }, truncated: false });
  });

  it("stops at the round cap and says more mail is waiting", async () => {
    const spy = stubFetch(() => json(grab({ truncated: true })));
    const outcome = await syncGrabMail();

    expect(MAX_SYNC_ROUNDS).toBe(20);
    expect(spy).toHaveBeenCalledTimes(20);
    expect(outcome.total?.truncated).toBe(true);
    expect(describeGrabOutcome(outcome.total!)).toContain("More mail is waiting; sync again.");
  });

  it("keeps the rounds that answered and surfaces the route's own words when a later one fails", async () => {
    stubFetch((call) => call === 0
      ? json(grab({ truncated: true }))
      : json({ error: "The statement mailbox could not be opened." }, 502));
    const outcome = await syncGrabMail();

    expect(outcome.error).toBe("The statement mailbox could not be opened.");
    expect(outcome.total?.captured).toBe(1);
  });

  it("returns no total and the error when the first round fails", async () => {
    stubFetch(() => json({ error: "Sign in first." }, 401));
    expect(await syncGrabMail()).toEqual({ total: null, error: "Sign in first." });
  });

  it("refuses an answer that does not match the contract", async () => {
    stubFetch(() => json({ captured: "many" }));
    expect(await syncGrabMail()).toEqual({ total: null, error: "The sync response did not match its contract." });
  });

  it("words the final line as the Orders page always has", () => {
    expect(describeGrabOutcome(grab({ refused: { NO_TOTAL: 2 } }) as never))
      .toBe("1 new order, 0 already stored, 1 new ride, 0 rides already stored, 2 not read. Not read: 2 no total.");
  });
});

describe("the 7-Eleven sync loop", () => {
  it("posts to the receipts route and sums rounds while truncated", async () => {
    const spy = stubFetch((call) => json(receipts({ truncated: call === 0 })));
    const outcome = await syncSevenElevenMail();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith("/api/v1/receipts/sync", expect.objectContaining({ method: "POST" }));
    expect(outcome.total).toMatchObject({ captured: 2, alreadyStored: 2, messages: 4, truncated: false });
    expect(describeSevenElevenOutcome(outcome.total!)).toBe("2 new receipts, 2 already stored.");
  });

  it("stops at the round cap", async () => {
    const spy = stubFetch(() => json(receipts({ truncated: true })));
    await syncSevenElevenMail();
    expect(spy).toHaveBeenCalledTimes(MAX_SYNC_ROUNDS);
  });

  it("surfaces an error with the total so far", async () => {
    stubFetch((call) => call === 0 ? json(receipts({ truncated: true })) : json({ error: "Nope." }, 500));
    const outcome = await syncSevenElevenMail();
    expect(outcome.error).toBe("Nope.");
    expect(outcome.total?.captured).toBe(1);
  });
});

describe("the statements check", () => {
  const attachment = (uid: number) => ({ id: `${uid}.2`, uid, part: "2", name: "a.pdf", sizeBytes: 10 });

  it("lists with the default look-back and counts what the listing offers", async () => {
    const spy = stubFetch(() => json({ messages: 2, attachments: [attachment(1), attachment(2), attachment(3)], truncated: false, since: "2026-01-01" }));
    const result = await checkStatementMail();

    expect(spy).toHaveBeenCalledWith("/api/v1/imports/mailbox?days=30", expect.anything());
    expect(result).toEqual({ ok: true, waiting: { count: 3, more: false } });
  });

  it("says when the listing stopped at its cap", async () => {
    stubFetch(() => json({ messages: 9, attachments: [attachment(1)], truncated: true, since: null }));
    expect(await checkStatementMail()).toEqual({ ok: true, waiting: { count: 1, more: true } });
  });

  it("reports the route's refusal", async () => {
    stubFetch(() => json({ error: "The statement mailbox could not be opened." }, 502));
    expect(await checkStatementMail()).toEqual({ ok: false, why: "The statement mailbox could not be opened." });
  });
});
