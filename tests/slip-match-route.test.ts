import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { slipListSchema, slipMatchResponseSchema } from "@/lib/slips";
import {
  API, OWNER_EMAIL, PUBLISHABLE, containerReachable, ownerId as lookupOwnerId,
  ownerSession, psql, resetOwnerImportSurface, weakOwnerSession, type OwnerSession
} from "./helpers/local-owner";

// The HTTP boundary over `public.set_slip_match` (migration 012, D-067), which shipped with
// no route and no caller — the exact shape of gap D-063 recorded, where task 20's write path
// had no read path and it took the owner using the app to notice.
//
// pgTAP already proves the RPC's 24 contracts against the database. What is only provable here
// is the layer between: the zod boundary, the path parameter, the translation of each database
// refusal into something the ledger view can say, and the decisions coming back on the same
// response as the slips they belong to. The real handlers are invoked against a real aal2
// cookie session, as `tests/import-route.test.ts` does.
//
// Every value is invented, per docs/FIXTURE_POLICY.md.
const ACCOUNT_ID = "cccccccc-0000-4000-8000-000000000021";
const SCB_ACCOUNT_ID = "cccccccc-0000-4000-8000-000000000022";
const ROW_NEAR = "dddddddd-0000-4000-8000-000000000031";
const ROW_FAR = "dddddddd-0000-4000-8000-000000000032";
const ROW_OTHER_BANK = "dddddddd-0000-4000-8000-000000000033";
const ROW_OTHER_AMOUNT = "dddddddd-0000-4000-8000-000000000034";
const SLIP_ONE = "eeeeeeee-0000-4000-8000-000000000041";
const SLIP_TWO = "eeeeeeee-0000-4000-8000-000000000042";
const AMOUNT = "-9000";

const reachable = containerReachable();

const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    set: (name: string, value: string) => { jar.set(name, value); }
  })
}));

let writer: Awaited<ReturnType<typeof cookieWriter>> | null = null;

async function cookieWriter() {
  const { createServerClient } = await import("@supabase/ssr");
  return createServerClient(API, PUBLISHABLE, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value))
    }
  });
}

async function seedCookieJar(session: OwnerSession) {
  jar.clear();
  writer ??= await cookieWriter();
  const { error } = await writer.auth.setSession(session);
  if (error) throw new Error(`could not store the session: ${error.message}`);
  if (jar.size === 0) throw new Error("@supabase/ssr wrote no session cookie");
}

function matchRequest(slipId: string, body: unknown) {
  return new Request(`http://localhost/api/v1/slips/${slipId}/match`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function put(slipId: string, body: unknown) {
  const { PUT } = await import("@/app/api/v1/slips/[id]/match/route");
  const response = await PUT(matchRequest(slipId, body), params(slipId));
  return { status: response.status, body: await response.json() };
}

async function listSlips() {
  const { GET } = await import("@/app/api/v1/slips/route");
  const response = await GET();
  return { status: response.status, headers: response.headers, body: await response.json() };
}

let owner = "";
let strongSession: OwnerSession;
// The revision the database holds for SLIP_ONE, carried between tests because optimistic
// concurrency is the contract: a caller that has lost count is a caller that gets a 409.
let revision = 0;

describe.skipIf(!reachable)("slip match decision route", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", API);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    vi.stubEnv("OWNER_GOOGLE_EMAIL", OWNER_EMAIL);

    owner = lookupOwnerId();
    expect(owner, "the seeded owner must exist").toMatch(/^[0-9a-f-]{36}$/);
    const cleaned = resetOwnerImportSurface(owner, [ACCOUNT_ID, SCB_ACCOUNT_ID]);
    expect(cleaned.ok, `cleanup failed: ${cleaned.output}`).toBe(true);

    // Four statement rows and two slips, inserted directly: this suite is about the route,
    // and driving capture and import through their own paths would prove them again while
    // making a failure here ambiguous about which layer broke.
    const transaction = (id: string, account: string, date: string, amount: string, digit: string) => `
      insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
        source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
      values ('${id}', '${owner}', '${account}', 'fingerprint-v1', '${digit.repeat(64)}',
        '${date}', '09:30', '${date}', 'Invented label', 'Invented description', 500000, 'THB');
      insert into public.source_components(owner_id, transaction_id, position, kind, amount_minor, currency)
      values ('${owner}', '${id}', 1, '${amount.startsWith("-") ? "withdrawal" : "deposit"}', ${amount}, 'THB');
    `;
    const slip = (id: string, bank: string, reference: string, date: string, amount: string) => `
      insert into public.slips(id, owner_id, bank_code, bank_qr_code, slip_reference, qr_payload,
        kind, amount_minor, currency, occurred_on, occurred_at_time)
      values ('${id}', '${owner}', '${bank}', '006', '${reference}', 'invented-qr-payload-${reference}',
        '${amount.startsWith("-") ? "withdrawal" : "deposit"}', ${amount}, 'THB', '${date}', '09:31');
    `;

    const setup = psql(`
      insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
      values ('${ACCOUNT_ID}', '${owner}', 'KTB', 'Match synthetic', 'savings', '9911', 'THB', 'Asia/Bangkok'),
             ('${SCB_ACCOUNT_ID}', '${owner}', 'SCB', 'Match synthetic SCB', 'savings', '9922', 'THB', 'Asia/Bangkok');
      ${transaction(ROW_NEAR, ACCOUNT_ID, "2026-06-10", AMOUNT, "a")}
      ${transaction(ROW_FAR, ACCOUNT_ID, "2026-05-02", AMOUNT, "b")}
      ${transaction(ROW_OTHER_BANK, SCB_ACCOUNT_ID, "2026-06-10", AMOUNT, "c")}
      ${transaction(ROW_OTHER_AMOUNT, ACCOUNT_ID, "2026-06-10", "-9500", "d")}
      ${slip(SLIP_ONE, "KTB", "A00000000000000001", "2026-06-10", AMOUNT)}
      ${slip(SLIP_TWO, "KTB", "A00000000000000002", "2026-06-10", AMOUNT)}
    `);
    expect(setup.ok, `setup failed: ${setup.output}`).toBe(true);

    strongSession = await ownerSession();
    await seedCookieJar(strongSession);
  }, 120_000);

  afterAll(() => {
    vi.unstubAllEnvs();
    resetOwnerImportSurface(owner, [ACCOUNT_ID, SCB_ACCOUNT_ID]);
  });

  it("returns the slips and their decisions on one response", async () => {
    const listed = await listSlips();
    expect(listed.status).toBe(200);
    expect(listed.headers.get("Cache-Control")).toBe("no-store");

    const parsed = slipListSchema.safeParse(listed.body);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.flatten())).toBe(true);
    if (!parsed.success) return;
    // Both slips, no decisions: every slip starts under the automatic rule, and the absence of
    // a row is what that state looks like (D-067).
    expect(parsed.data.slips.map((entry) => entry.id).sort()).toEqual([SLIP_ONE, SLIP_TWO].sort());
    expect(parsed.data.matches).toEqual([]);
  }, 30_000);

  it("stores a match the automatic window would never have proposed", async () => {
    // ROW_FAR is 39 days from the slip, so this is the case the override exists for: a pairing
    // the rule cannot make, held to the two facts the RPC re-checks rather than to three.
    const response = await put(SLIP_ONE, { expectedRevision: revision, decision: "matched", transactionId: ROW_FAR });
    expect(response.status, JSON.stringify(response.body)).toBe(200);

    const parsed = slipMatchResponseSchema.safeParse(response.body);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.flatten())).toBe(true);
    if (!parsed.success) return;
    revision = parsed.data.match.revision;
    expect(parsed.data.match).toEqual({ slip_id: SLIP_ONE, decision: "matched", transaction_id: ROW_FAR, revision: 1 });

    // Read back through the listing, which is what the ledger view actually reconciles from.
    const listed = slipListSchema.parse((await listSlips()).body);
    expect(listed.matches).toEqual([{ slip_id: SLIP_ONE, decision: "matched", transaction_id: ROW_FAR, revision: 1 }]);
  }, 30_000);

  it("audits the decision and advances the mutation sequence", async () => {
    // Both are the RPC's doing rather than the route's, and both are what a direct insert
    // would have skipped — so the route is only worth trusting if they landed. The sequence
    // matters beyond bookkeeping: it is what makes the standing backup stale (D-065).
    const audited = psql(`select count(*) from public.audit_events
      where owner_id = '${owner}' and event_type = 'slip.match.matched' and entity_id = '${SLIP_ONE}';`);
    expect(audited.ok && audited.output.trim()).toBe("1");
    const history = psql(`select count(*) from public.slip_match_revisions
      where owner_id = '${owner}' and slip_id = '${SLIP_ONE}';`);
    expect(history.ok && history.output.trim()).toBe("1");
  }, 30_000);

  it("refuses a stale revision rather than overwriting another session's decision", async () => {
    const response = await put(SLIP_ONE, { expectedRevision: 0, decision: "matched", transactionId: ROW_NEAR });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/another session/u);
    // And nothing moved: the stored decision is still the one that was there.
    const listed = slipListSchema.parse((await listSlips()).body);
    expect(listed.matches[0]!.transaction_id).toBe(ROW_FAR);
  }, 30_000);

  it("refuses a statement row another slip already claims", async () => {
    // The partial unique index (D-067). Silently moving the claim would unmatch a payment the
    // owner cannot see from the row they are looking at.
    const response = await put(SLIP_TWO, { expectedRevision: 0, decision: "matched", transactionId: ROW_FAR });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already matched to that statement row/u);
  }, 30_000);

  it("refuses a row at another bank, or one whose amount is not the slip's", async () => {
    // The guard D-067 called the conservative end: an override resolves ambiguity and rejects
    // a wrong pairing, and is not a way to declare two different sums the same payment. The
    // messages are separated because the two mistakes have different fixes.
    const wrongBank = await put(SLIP_TWO, { expectedRevision: 0, decision: "matched", transactionId: ROW_OTHER_BANK });
    expect(wrongBank.status).toBe(422);
    expect(wrongBank.body.error).toMatch(/different bank/u);

    const wrongAmount = await put(SLIP_TWO, { expectedRevision: 0, decision: "matched", transactionId: ROW_OTHER_AMOUNT });
    expect(wrongAmount.status).toBe(422);
    expect(wrongAmount.body.error).toMatch(/not the slip's amount/u);

    const stored = psql(`select count(*) from public.slip_match_overlays where owner_id = '${owner}' and slip_id = '${SLIP_TWO}';`);
    expect(stored.ok && stored.output.trim(), "a refused decision must store nothing").toBe("0");
  }, 30_000);

  it("undoes a match, keeping the history rather than erasing it", async () => {
    const response = await put(SLIP_ONE, { expectedRevision: revision, decision: "unmatched", transactionId: null });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const parsed = slipMatchResponseSchema.parse(response.body);
    revision = parsed.match.revision;
    expect(parsed.match).toEqual({ slip_id: SLIP_ONE, decision: "unmatched", transaction_id: null, revision: 2 });

    // Two revisions, and the first still names the row: the current value is mutable and the
    // history is not, which is the whole point of the overlay pair.
    const history = psql(`select revision || ' ' || (snapshot->>'decision') from public.slip_match_revisions
      where owner_id = '${owner}' and slip_id = '${SLIP_ONE}' order by revision;`);
    expect(history.ok && history.output.trim().split("\n").map((line) => line.trim()))
      .toEqual(["1 matched", "2 unmatched"]);

    // And the row it released can now be claimed by the other slip.
    const claimed = await put(SLIP_TWO, { expectedRevision: 0, decision: "matched", transactionId: ROW_FAR });
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200);
  }, 30_000);

  it("refuses a body the database would have had to interpret", async () => {
    // Each of these is caught by the schema rather than translated back from a database error.
    for (const body of [
      { expectedRevision: revision, decision: "matched", transactionId: null },
      { expectedRevision: revision, decision: "unmatched", transactionId: ROW_NEAR },
      { expectedRevision: revision, decision: "probably", transactionId: ROW_NEAR },
      { expectedRevision: -1, decision: "unmatched", transactionId: null },
      { expectedRevision: revision, decision: "unmatched", transactionId: null, slipId: SLIP_ONE },
      "not json at all"
    ]) {
      const response = await put(SLIP_ONE, body);
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
  }, 30_000);

  it("refuses a slip id that is not one, and a slip this owner does not hold", async () => {
    const malformed = await put("not-a-uuid", { expectedRevision: 0, decision: "unmatched", transactionId: null });
    expect(malformed.status).toBe(400);

    const absent = await put("eeeeeeee-0000-4000-8000-0000000000ff", { expectedRevision: 0, decision: "unmatched", transactionId: null });
    expect(absent.status).toBe(404);
  }, 30_000);

  it("refuses a row this owner does not hold without saying whether it exists", async () => {
    const response = await put(SLIP_ONE, {
      expectedRevision: revision, decision: "matched", transactionId: "dddddddd-0000-4000-8000-0000000000ff"
    });
    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/does not exist/u);
  }, 30_000);

  // Last, because they leave the cookie jar holding a session that cannot do anything.
  it("refuses a decision from a session that has not passed MFA", async () => {
    await seedCookieJar(await weakOwnerSession());
    const response = await put(SLIP_ONE, { expectedRevision: revision, decision: "unmatched", transactionId: null });
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/AAL2/u);
  }, 30_000);

  it("refuses an unauthenticated decision", async () => {
    jar.clear();
    const response = await put(SLIP_ONE, { expectedRevision: revision, decision: "unmatched", transactionId: null });
    expect(response.status).toBe(401);
  }, 30_000);
});
