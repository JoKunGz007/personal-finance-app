// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ImapFlow } from "imapflow";
import { findAttachments } from "@/lib/server/statement-mailbox-session";
import { MAX_SYNC_ATTACHMENTS, MAX_SYNC_MESSAGES_SCANNED, stepTimer } from "@/lib/statement-sync";
import { fetchedFlag } from "@/lib/server/statement-mailbox";

/**
 * How the listing turns one search and one FETCH into a capped, newest-first manifest.
 *
 * **A fake client rather than a mailbox, and it is not a mock of the protocol.** It answers `search`
 * with uids and `fetch` with body structures, in ascending uid order the way a server does — which is
 * what makes "newest first" something this code has to do rather than something it inherits. What it
 * records is how many commands were issued and for which uids, because the point of the change under
 * test is that examining two hundred messages costs one command rather than two hundred.
 *
 * Every value is invented, per `docs/FIXTURE_POLICY.md`.
 */

type FakeMessage = { readonly flags?: Set<string> };

function fakeMailbox(uids: readonly number[], over: (uid: number) => FakeMessage = () => ({})) {
  const fetches: number[][] = [];
  const client = {
    search: async () => [...uids],
    fetch: async function* (range: number[]) {
      fetches.push([...range]);
      for (const uid of [...range].sort((left, right) => left - right)) {
        yield {
          uid,
          flags: over(uid).flags ?? new Set<string>(),
          bodyStructure: {
            childNodes: [
              { part: "1", type: "text/plain" },
              { part: "2", type: "application/pdf", size: 2048, dispositionParameters: { filename: `statement-${uid}.pdf` } }
            ]
          }
        };
      }
    },
    fetchOne: async () => {
      throw new Error("the listing must not fetch one message at a time");
    }
  } as unknown as ImapFlow;
  return { client, fetches };
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

describe("listing the mailbox in one fetch", () => {
  it("examines every message with a single command and returns them newest first", async () => {
    const { client, fetches } = fakeMailbox(range(5));
    const result = await findAttachments(client, ["statements@bank.example"], null);
    expect(fetches).toHaveLength(1);
    expect(result.found.map((item) => item.uid)).toEqual([5, 4, 3, 2, 1]);
    expect(result.messages).toBe(5);
    expect(result.truncated).toBe(false);
  });

  it("asks only for the newest messages the scan cap allows, and says there is more", async () => {
    const total = MAX_SYNC_MESSAGES_SCANNED + 25;
    const everyPartFetched = () => ({ flags: new Set([fetchedFlag("2")]) });
    const { client, fetches } = fakeMailbox(range(total), everyPartFetched);
    const result = await findAttachments(client, ["statements@bank.example"], null);
    expect(fetches).toHaveLength(1);
    const asked = fetches[0] ?? [];
    expect(asked).toHaveLength(MAX_SYNC_MESSAGES_SCANNED);
    expect(Math.min(...asked)).toBe(total - MAX_SYNC_MESSAGES_SCANNED + 1);
    // Nothing new among them, and still not reported as an empty mailbox: the cap is truncation.
    expect(result.found).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it("stops at the attachment cap with the newest kept", async () => {
    const { client } = fakeMailbox(range(MAX_SYNC_ATTACHMENTS + 3));
    const result = await findAttachments(client, ["statements@bank.example"], null);
    expect(result.found).toHaveLength(MAX_SYNC_ATTACHMENTS);
    expect(result.found[0]?.uid).toBe(MAX_SYNC_ATTACHMENTS + 3);
    expect(result.truncated).toBe(true);
  });

  it("does not call a cap reached on the last message truncation", async () => {
    const { client } = fakeMailbox(range(MAX_SYNC_ATTACHMENTS));
    const result = await findAttachments(client, ["statements@bank.example"], null);
    expect(result.found).toHaveLength(MAX_SYNC_ATTACHMENTS);
    expect(result.truncated).toBe(false);
  });

  it("issues no fetch at all when the search matches nothing", async () => {
    const { client, fetches } = fakeMailbox([]);
    const result = await findAttachments(client, ["statements@bank.example"], null);
    expect(fetches).toHaveLength(0);
    expect(result).toEqual({ messages: 0, found: [], truncated: false });
  });

  it("reports the search and the fetch as steps when asked", async () => {
    const { client } = fakeMailbox(range(2));
    const steps: string[] = [];
    await findAttachments(client, ["statements@bank.example"], null, (step) => steps.push(step));
    expect(steps).toEqual(["search", "fetch"]);
  });
});

describe("timing a mailbox route's steps", () => {
  it("renders each step's duration since the one before, rounded, as a Server-Timing header", () => {
    const clock = [0, 120.4, 1500.6, 1510];
    const timer = stepTimer(() => clock.shift() ?? 0);
    timer.lap("auth");
    timer.lap("imap-open");
    timer.lap("search");
    expect(timer.header()).toBe("auth;dur=120, imap-open;dur=1380, search;dur=9");
  });

  it("is an empty header before any step", () => {
    expect(stepTimer(() => 0).header()).toBe("");
  });
});
