import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { notificationCardCaptureResponseSchema, notificationCardListSchema } from "@/lib/notification-cards";
import {
  API, OWNER_EMAIL, PUBLISHABLE, containerReachable, ownerId as lookupOwnerId,
  ownerSession, psql, resetOwnerImportSurface, type OwnerSession
} from "./helpers/local-owner";

// The HTTP boundary over `capture_notification_card` (migration 016, PLAN task 27), which
// shipped with no route and no caller — the same gap D-063 recorded about task 20, D-067 about
// migration 012 and D-084 about migration 013.
//
// pgTAP already proves the RPC against the database. What is only provable here is the layer
// between: the zod boundary, **both** money values surviving the wire as canonical text, each
// database refusal translated into something a form can say, and — the one this route adds that
// no other layer performs — the per-layout account binding, which the database stores rather
// than checks.
//
// Every account number, amount, balance and date below is invented, per docs/FIXTURE_POLICY.md.
const SCB_ACCOUNT = "cccccccc-0000-4000-8000-000000000091";
const KBANK_ACCOUNT = "cccccccc-0000-4000-8000-000000000092";
const KTB_ACCOUNT = "cccccccc-0000-4000-8000-000000000093";

// KBank Live prints digits 6–9 of ten and masks the last, while `accounts.last_four` holds
// digits 7–10. They overlap by three and sit one digit apart, which is the whole reason the
// binding rule cannot be global (D-099).
const KBANK_LAST_FOUR = "2345";
const KBANK_PRINTED = "1234";      // digits 6–9: shares 234 with the stored value
const KBANK_NAIVE = KBANK_LAST_FOUR; // what a global last-four rule would have sent

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

async function captureCard(body: unknown) {
  const { POST } = await import("@/app/api/v1/notification-cards/route");
  const response = await POST(new Request("http://localhost/api/v1/notification-cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  }));
  return { status: response.status, body: await response.json() };
}

async function listCards() {
  const { GET } = await import("@/app/api/v1/notification-cards/route");
  const response = await GET();
  return { status: response.status, headers: response.headers, body: await response.json() };
}

/** A Krungthai outgoing card, the shape everything below varies from. */
function card(overrides: Record<string, unknown> = {}) {
  return {
    accountId: KTB_ACCOUNT,
    channel: "Krungthai Connext",
    printedAccountDigits: "9934",
    kind: "withdrawal",
    amountMinor: "-20000",
    balanceMinor: "73100",
    occurredOn: "2026-06-10",
    occurredAtTime: "17:00",
    counterparty: null,
    categoryId: null,
    note: null,
    ...overrides
  };
}

let owner = "";
let strongSession: OwnerSession;

// One `beforeAll` for the whole file, with the groups below nested inside it. Seeding the
// cookie jar again per group looked tidier and cost every test after the first group a 403: the
// stored session had already been rotated by the requests above, so replaying the original
// tokens produced a jar the route would not accept.
describe.skipIf(!reachable)("notification cards over HTTP", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", API);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    vi.stubEnv("OWNER_GOOGLE_EMAIL", OWNER_EMAIL);

    owner = lookupOwnerId();
    expect(owner, "the seeded owner must exist").toMatch(/^[0-9a-f-]{36}$/);
    const cleaned = resetOwnerImportSurface(owner, [SCB_ACCOUNT, KBANK_ACCOUNT, KTB_ACCOUNT]);
    expect(cleaned.ok, `cleanup failed: ${cleaned.output}`).toBe(true);

    // One account per layout, because the binding rule this route enforces is per layout and a
    // single account could only ever exercise one of the two masks.
    const setup = psql(`
      insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
      values ('${SCB_ACCOUNT}', '${owner}', 'SCB', 'Card synthetic SCB', 'savings', '7781', 'THB', 'Asia/Bangkok'),
             ('${KBANK_ACCOUNT}', '${owner}', 'KBANK', 'Card synthetic KBANK', 'savings', '${KBANK_LAST_FOUR}', 'THB', 'Asia/Bangkok'),
             ('${KTB_ACCOUNT}', '${owner}', 'KTB', 'Card synthetic KTB', 'savings', '9934', 'THB', 'Asia/Bangkok');
    `);
    expect(setup.ok, `setup failed: ${setup.output}`).toBe(true);

    strongSession = await ownerSession();
    await seedCookieJar(strongSession);
  });

  afterAll(() => {
    if (!owner) return;
    resetOwnerImportSurface(owner, [SCB_ACCOUNT, KBANK_ACCOUNT, KTB_ACCOUNT]);
    vi.unstubAllEnvs();
  });

  describe("capture", () => {
  it("captures a card and returns it in the published shape", async () => {
    const written = await captureCard(card());
    expect(written.status, JSON.stringify(written.body)).toBe(201);
    const parsed = notificationCardCaptureResponseSchema.safeParse(written.body);
    expect(parsed.success, JSON.stringify(parsed.error?.flatten())).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.captured).toBe(true);
    // Both money values are canonical text on the wire, never JSON numbers (D-018, D-002). The
    // balance is held to that rule as firmly as the amount rather than being treated as
    // metadata because it is not the transaction's own value.
    expect(parsed.data.card.amount_minor).toBe("-20000");
    expect(parsed.data.card.balance_minor).toBe("73100");
    expect(parsed.data.card.occurred_at_time).toMatch(/^17:00/);
    // The digits are stored as printed, never normalised into the stored last four — a row that
    // silently recorded them as such would erase the evidence the offset was applied at all.
    expect(parsed.data.card.printed_account_digits).toBe("9934");

    // Neither the owner id nor the fingerprint reaches the wire. The published shape is strict,
    // so this is really asserted by the parse above; it is named here because the RPC returns
    // the row whole and passing it through would have been the easy mistake.
    expect(parsed.data.card).not.toHaveProperty("owner_id");
    expect(parsed.data.card).not.toHaveProperty("fingerprint");
  });

  it("reports an exact re-capture as already held rather than as an error", async () => {
    const again = await captureCard(card());
    expect(again.status).toBe(200);
    expect(again.body.captured).toBe(false);

    const rows = psql(`select count(*) from public.notification_cards where owner_id = '${owner}';`);
    expect(rows.output.trim()).toBe("1");
  });

  // The fingerprint carries the balance, so this is a *different* card rather than a re-capture
  // — which is what stops two payments of the same amount at the same minute becoming one row.
  it("treats the same amount at a different balance as a second card", async () => {
    const second = await captureCard(card({ balanceMinor: "53100", occurredAtTime: "17:05" }));
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body.captured).toBe(true);

    const rows = psql(`select count(*) from public.notification_cards where owner_id = '${owner}';`);
    expect(rows.output.trim()).toBe("2");
  });

  it("lists the captured cards with both money values as text", async () => {
    const listed = await listCards();
    expect(listed.status).toBe(200);
    expect(listed.headers.get("Cache-Control")).toContain("no-store");
    const parsed = notificationCardListSchema.safeParse(listed.body);
    expect(parsed.success, JSON.stringify(parsed.error?.flatten())).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.cards).toHaveLength(2);
    for (const stored of parsed.data.cards) {
      expect(typeof stored.amount_minor).toBe("string");
      expect(typeof stored.balance_minor).toBe("string");
    }
  });

  it("writes an audit row carrying structure and no value", async () => {
    const audit = psql(`
      select detail::text from public.audit_events
      where owner_id = '${owner}' and event_type = 'notification_card.capture'
      order by id desc limit 1;
    `);
    expect(audit.ok).toBe(true);
    expect(audit.output).toContain("Krungthai Connext");
    // No amount, balance, counterparty or account digits — the same rule every audit row here
    // follows.
    expect(audit.output).not.toContain("20000");
    expect(audit.output).not.toContain("73100");
    expect(audit.output).not.toContain("9934");
  });
  });

  // The binding rule is per layout, and the reason it cannot be global is that applying one
  // layout's convention everywhere fails **silently** — as no such account rather than as an
  // error, on every card, forever (D-099).
  describe("the account a card is bound to is checked per layout", () => {
  it("accepts KBank Live's offset digits and refuses the naive last four", async () => {
    // The distinguishing pair. A global last-four rule would send the stored digits and this
    // route would take them; the offset rule sends digits 6–9, and only that is accepted.
    const naive = await captureCard(card({
      accountId: KBANK_ACCOUNT,
      channel: "KBank Live",
      printedAccountDigits: KBANK_NAIVE,
      occurredAtTime: "11:15"
    }));
    expect(naive.status).toBe(422);
    expect(String(naive.body.error)).toContain("do not belong to that account");

    const offset = await captureCard(card({
      accountId: KBANK_ACCOUNT,
      channel: "KBank Live",
      printedAccountDigits: KBANK_PRINTED,
      occurredAtTime: "11:15"
    }));
    expect(offset.status, JSON.stringify(offset.body)).toBe(201);
    expect(offset.body.card.printed_account_digits).toBe(KBANK_PRINTED);
  });

  it("refuses digits that belong to no account on a last-four layout", async () => {
    const wrong = await captureCard(card({
      accountId: SCB_ACCOUNT,
      channel: "SCB Connect",
      printedAccountDigits: "1111",
      occurredAtTime: "12:00"
    }));
    expect(wrong.status).toBe(422);
    expect(String(wrong.body.error)).toContain("do not belong to that account");
  });

  it("refuses a channel that does not belong to the account's bank", async () => {
    const crossed = await captureCard(card({
      accountId: KTB_ACCOUNT,
      channel: "SCB Connect",
      printedAccountDigits: "9934",
      occurredAtTime: "12:30"
    }));
    expect(crossed.status).toBe(422);
    expect(String(crossed.body.error)).toContain("SCB");
  });

  it("refuses an account the owner does not hold", async () => {
    const missing = await captureCard(card({ accountId: "cccccccc-0000-4000-8000-0000000000ff" }));
    expect(missing.status).toBe(422);
    expect(String(missing.body.error)).toContain("does not exist");
  });
  });

  describe("what the card contract refuses before the database sees it", () => {
  it("refuses an amount whose sign disagrees with the direction", async () => {
    const wrongWay = await captureCard(card({ kind: "deposit", amountMinor: "-20000" }));
    expect(wrongWay.status).toBe(422);
  });

  it("refuses money sent as a JSON number rather than canonical text", async () => {
    const asNumber = await captureCard('{"accountId":"' + KTB_ACCOUNT + '","channel":"Krungthai Connext",' +
      '"printedAccountDigits":"9934","kind":"withdrawal","amountMinor":-20000,"balanceMinor":"73100",' +
      '"occurredOn":"2026-06-10","occurredAtTime":"17:00","counterparty":null,"categoryId":null,"note":null}');
    expect(asNumber.status).toBe(422);
  });

  // Not nullable, unlike a slip's. All three layouts print `hh:mm`, and the time is what lets a
  // card locate its statement row before the balance confirms it (D-098).
  it("refuses a card with no time", async () => {
    const timeless = await captureCard(card({ occurredAtTime: null }));
    expect(timeless.status).toBe(422);
  });

  it("refuses a date outside the plausible window and names the era", async () => {
    // A two-digit Buddhist year resolved with the wrong rule lands 543 years out, which is D-031
    // exactly. Both the client window and the RPC bound it; this is the client's refusal.
    const farFuture = await captureCard(card({ occurredOn: "2569-06-10" }));
    expect(farFuture.status).toBe(422);
  });

  it("refuses a field the contract does not name", async () => {
    const extra = await captureCard(card({ fingerprint: "f".repeat(64) }));
    expect(extra.status).toBe(422);
  });
  });
});
