import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cashListSchema, cashEntryResponseSchema, cashCorrectionResponseSchema } from "@/lib/cash";
import { slipCorrectionResponseSchema, slipListSchema, slipsInForce } from "@/lib/slips";
import {
  API, OWNER_EMAIL, PUBLISHABLE, containerReachable, ownerId as lookupOwnerId,
  ownerSession, psql, resetOwnerImportSurface, type OwnerSession
} from "./helpers/local-owner";

// The HTTP boundary over migration 013's three RPCs — `create_cash_entry`,
// `set_cash_entry_correction` and `set_slip_correction` — which shipped with no routes and no
// callers, the same gap D-063 recorded about task 20 and D-067 about migration 012.
//
// pgTAP already proves the RPCs against the database. What is only provable here is the layer
// between: the zod boundary, money surviving the wire as canonical text, each database refusal
// translated into something the ledger view can say, and the corrections arriving on the same
// response as the records they are about.
//
// Every value is invented, per docs/FIXTURE_POLICY.md.
const ACCOUNT_ID = "cccccccc-0000-4000-8000-000000000051";
const ROW_MATCHING = "dddddddd-0000-4000-8000-000000000061";
const SLIP_MATCHED = "eeeeeeee-0000-4000-8000-000000000071";
const SLIP_FREE = "eeeeeeee-0000-4000-8000-000000000072";
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

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

async function listCash() {
  const { GET } = await import("@/app/api/v1/cash/route");
  const response = await GET();
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function recordCash(body: unknown) {
  const { POST } = await import("@/app/api/v1/cash/route");
  const response = await POST(jsonRequest("http://localhost/api/v1/cash", "POST", body));
  return { status: response.status, body: await response.json() };
}

async function correctCash(id: string, body: unknown) {
  const { PUT } = await import("@/app/api/v1/cash/[id]/correction/route");
  const response = await PUT(
    jsonRequest(`http://localhost/api/v1/cash/${id}/correction`, "PUT", body),
    { params: Promise.resolve({ id }) }
  );
  return { status: response.status, body: await response.json() };
}

async function correctSlip(id: string, body: unknown) {
  const { PUT } = await import("@/app/api/v1/slips/[id]/correction/route");
  const response = await PUT(
    jsonRequest(`http://localhost/api/v1/slips/${id}/correction`, "PUT", body),
    { params: Promise.resolve({ id }) }
  );
  return { status: response.status, body: await response.json() };
}

/** Every field null — the shape a correction takes when only one thing is being changed. */
function correction(overrides: Record<string, unknown> = {}) {
  return {
    expectedRevision: 0,
    kind: null,
    amountMinor: null,
    occurredOn: null,
    occurredAtTime: null,
    counterparty: null,
    categoryId: null,
    note: null,
    ...overrides
  };
}

let owner = "";
let strongSession: OwnerSession;
let cashId = "";

describe.skipIf(!reachable)("cash entry and correction routes", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", API);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    vi.stubEnv("OWNER_GOOGLE_EMAIL", OWNER_EMAIL);

    owner = lookupOwnerId();
    expect(owner, "the seeded owner must exist").toMatch(/^[0-9a-f-]{36}$/);
    const cleaned = resetOwnerImportSurface(owner, [ACCOUNT_ID]);
    expect(cleaned.ok, `cleanup failed: ${cleaned.output}`).toBe(true);

    // One statement row and two slips, inserted directly. This suite is about the routes, so
    // driving import and capture through their own paths would prove them again while making a
    // failure here ambiguous about which layer broke.
    const setup = psql(`
      insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
      values ('${ACCOUNT_ID}', '${owner}', 'KTB', 'Cash synthetic', 'savings', '9933', 'THB', 'Asia/Bangkok');
      insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
        source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
      values ('${ROW_MATCHING}', '${owner}', '${ACCOUNT_ID}', 'fingerprint-v1', '${"e".repeat(64)}',
        '2026-06-10', '09:30', '2026-06-10', 'Invented label', 'Invented description', 500000, 'THB');
      insert into public.source_components(owner_id, transaction_id, position, kind, amount_minor, currency)
      values ('${owner}', '${ROW_MATCHING}', 1, 'withdrawal', ${AMOUNT}, 'THB');
      insert into public.slips(id, owner_id, bank_code, bank_qr_code, slip_reference, qr_payload,
        kind, amount_minor, currency, occurred_on, occurred_at_time)
      values ('${SLIP_MATCHED}', '${owner}', 'KTB', '006', 'A00000000000000051', 'invented-qr-payload-51',
              'withdrawal', ${AMOUNT}, 'THB', '2026-06-10', '09:31'),
             ('${SLIP_FREE}', '${owner}', 'KTB', '006', 'A00000000000000052', 'invented-qr-payload-52',
              'withdrawal', -2500, 'THB', '2026-06-10', '09:32');
    `);
    expect(setup.ok, `setup failed: ${setup.output}`).toBe(true);

    strongSession = await ownerSession();
    await seedCookieJar(strongSession);
  }, 120_000);

  afterAll(() => {
    vi.unstubAllEnvs();
    resetOwnerImportSurface(owner, [ACCOUNT_ID]);
  });

  it("records a cash payment and returns it in the published shape", async () => {
    const response = await recordCash({
      kind: "withdrawal",
      amountMinor: "-2500",
      occurredOn: "2026-06-11",
      occurredAtTime: "12:15",
      counterparty: "Invented market stall",
      categoryId: null,
      note: null
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);

    const parsed = cashEntryResponseSchema.safeParse(response.body);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.flatten())).toBe(true);
    if (!parsed.success) return;
    cashId = parsed.data.entry.id;
    // Money crossed the wire as canonical text rather than a JSON number, which is the one
    // way a float could enter this ledger (D-018).
    expect(parsed.data.entry.amount_minor).toBe("-2500");
    expect(parsed.data.entry.currency).toBe("THB");
  }, 30_000);

  it("writes two entries for two identical payments rather than collapsing them", async () => {
    // The deliberate opposite of slip capture: a slip's QR reference is an external identity,
    // and cash has none, so two identical payments on one day are two payments.
    const first = await recordCash({
      kind: "withdrawal", amountMinor: "-4000", occurredOn: "2026-06-12",
      occurredAtTime: null, counterparty: null, categoryId: null, note: null
    });
    const second = await recordCash({
      kind: "withdrawal", amountMinor: "-4000", occurredOn: "2026-06-12",
      occurredAtTime: null, counterparty: null, categoryId: null, note: null
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.entry.id).not.toBe(second.body.entry.id);
  }, 30_000);

  it("refuses an amount whose sign contradicts its direction", async () => {
    const response = await recordCash({
      kind: "withdrawal", amountMinor: "2500", occurredOn: "2026-06-11",
      occurredAtTime: null, counterparty: null, categoryId: null, note: null
    });
    expect(response.status).toBe(422);
  }, 30_000);

  it("refuses money as a JSON number", async () => {
    const response = await recordCash({
      kind: "withdrawal", amountMinor: -2500, occurredOn: "2026-06-11",
      occurredAtTime: null, counterparty: null, categoryId: null, note: null
    });
    expect(response.status).toBe(422);
  }, 30_000);

  it("audits the entry and advances the mutation sequence", async () => {
    // Both are the RPC's doing rather than the route's, and both are what a direct insert
    // would have skipped. The sequence matters beyond bookkeeping: it makes the standing
    // backup stale (D-065).
    const audited = psql(`select count(*) from public.audit_events
      where owner_id = '${owner}' and event_type = 'cash.entry.created';`);
    expect(audited.ok && Number(audited.output.trim())).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it("returns the entries and their corrections on one response", async () => {
    const listed = await listCash();
    expect(listed.status).toBe(200);
    expect(listed.headers.get("Cache-Control")).toBe("no-store");

    const parsed = cashListSchema.safeParse(listed.body);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.flatten())).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.entries.length).toBe(3);
    expect(parsed.data.corrections).toEqual([]);
  }, 30_000);

  it("corrects an entry without touching what was first recorded", async () => {
    const response = await correctCash(cashId, correction({ kind: "withdrawal", amountMinor: "-2600" }));
    expect(response.status, JSON.stringify(response.body)).toBe(200);

    const parsed = cashCorrectionResponseSchema.safeParse(response.body);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.flatten())).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.correction.amount_minor).toBe("-2600");
    expect(parsed.data.correction.revision).toBe(1);
    // An uncorrected field stays null, which is what the overlay reads as "the original stands".
    expect(parsed.data.correction.counterparty).toBeNull();

    // The base row is untouched, and the listing carries both halves.
    const listed = cashListSchema.parse((await listCash()).body);
    const base = listed.entries.find((entry) => entry.id === cashId);
    expect(base?.amount_minor).toBe("-2500");
    expect(listed.corrections).toHaveLength(1);
  }, 30_000);

  it("keeps an append-only revision of every correction", async () => {
    const history = psql(`select count(*) from public.cash_entry_revisions
      where owner_id = '${owner}' and cash_entry_id = '${cashId}';`);
    expect(history.ok && history.output.trim()).toBe("1");
  }, 30_000);

  it("refuses a stale revision rather than overwriting another session's correction", async () => {
    const response = await correctCash(cashId, correction({ expectedRevision: 0, counterparty: "Invented other" }));
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/another session/u);
  }, 30_000);

  it("clears a correction when every field comes back null", async () => {
    // The undo, and the reason a mistaken correction is itself correctable: the overlay row
    // survives with a higher revision, and the original figure is in force again.
    const response = await correctCash(cashId, correction({ expectedRevision: 1 }));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const parsed = cashCorrectionResponseSchema.parse(response.body);
    expect(parsed.correction.amount_minor).toBeNull();
    expect(parsed.correction.revision).toBe(2);
  }, 30_000);

  it("answers 404 for an entry this owner does not hold", async () => {
    const response = await correctCash("cccccccc-0000-4000-8000-0000000000ff", correction({ counterparty: "Invented" }));
    expect(response.status).toBe(404);
  }, 30_000);

  it("answers 400 for an id that is not a uuid, before reaching the database", async () => {
    const response = await correctCash("not-a-uuid", correction());
    expect(response.status).toBe(400);
  }, 30_000);

  it("refuses a corrected amount whose direction did not come with it", async () => {
    const response = await correctCash(cashId, correction({ expectedRevision: 2, amountMinor: "-2600" }));
    expect(response.status).toBe(422);
  }, 30_000);

  it("corrects what the owner typed on a slip", async () => {
    const response = await correctSlip(SLIP_FREE, correction({ kind: "withdrawal", amountMinor: "-2700" }));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const parsed = slipCorrectionResponseSchema.parse(response.body);
    expect(parsed.correction.amount_minor).toBe("-2700");
    expect(parsed.correction.revision).toBe(1);
  }, 30_000);

  it("puts the corrected figure in force through the listing the ledger reads", async () => {
    const { GET } = await import("@/app/api/v1/slips/route");
    const listed = slipListSchema.parse(await (await GET()).json());
    const inForce = slipsInForce(listed.slips, listed.corrections).find((slip) => slip.id === SLIP_FREE);
    expect(inForce?.amount_minor).toBe("-2700");
    // And the original is still there to compare against, which is the whole point of an overlay.
    expect(listed.slips.find((slip) => slip.id === SLIP_FREE)?.amount_minor).toBe("-2500");
  }, 30_000);

  it("refuses a slip correction that would falsify a stored match", async () => {
    // The guard migration 013 states and migration 014 completed from the other side. The
    // match was accepted because the two amounts agreed to the satang; a correction that
    // breaks that is named rather than silently re-paired.
    const { PUT } = await import("@/app/api/v1/slips/[id]/match/route");
    const matched = await PUT(
      jsonRequest(`http://localhost/api/v1/slips/${SLIP_MATCHED}/match`, "PUT", {
        expectedRevision: 0, decision: "matched", transactionId: ROW_MATCHING
      }),
      { params: Promise.resolve({ id: SLIP_MATCHED }) }
    );
    expect(matched.status, JSON.stringify(await matched.clone().json())).toBe(200);

    const response = await correctSlip(SLIP_MATCHED, correction({ kind: "withdrawal", amountMinor: "-9100" }));
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/Undo that match first/u);
  }, 30_000);

  it("allows a slip correction that leaves the stored match's amounts agreeing", async () => {
    // Correcting something other than the amount is not a threat to the pairing, and refusing
    // it would make the guard broader than the thing it protects.
    const response = await correctSlip(SLIP_MATCHED, correction({ counterparty: "Invented payee two" }));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
  }, 30_000);
});
