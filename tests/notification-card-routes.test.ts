import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  notificationCardCaptureResponseSchema,
  notificationCardCorrectionResponseSchema,
  notificationCardDecisionResponseSchema,
  notificationCardListSchema
} from "@/lib/notification-cards";
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


async function decideCard(cardId: string, body: unknown) {
  const { PUT } = await import("@/app/api/v1/notification-cards/[id]/decision/route");
  const response = await PUT(
    new Request(`http://localhost/api/v1/notification-cards/${cardId}/decision`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
    { params: Promise.resolve({ id: cardId }) }
  );
  return { status: response.status, body: await response.json() };
}

async function correctCard(cardId: string, body: unknown) {
  const { PUT } = await import("@/app/api/v1/notification-cards/[id]/correction/route");
  const response = await PUT(
    new Request(`http://localhost/api/v1/notification-cards/${cardId}/correction`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
    { params: Promise.resolve({ id: cardId }) }
  );
  return { status: response.status, body: await response.json() };
}

/** A statement row on the KTB account, so a card has something real to be decided against. */
function seedRow(id: string, amountMinor: string, balanceMinor: string, date = "2026-06-10", time = "09:30") {
  const written = psql(`
    set session_replication_role = replica;
    insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
      source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
    values ('${id}', '${owner}', '${KTB_ACCOUNT}', 'fingerprint-v1', '${id.replace(/-/gu, "").padEnd(64, "0")}',
      '${date}', '${time}', '${date}', 'Invented label', 'Invented description', '${balanceMinor}', 'THB');
    insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
    values ('cccccccc-2222-4222-8222-${id.slice(-12)}', '${owner}', '${id}', 1, 'withdrawal', ${amountMinor}, 'THB');
    set session_replication_role = origin;
  `);
  expect(written.ok, `row seed failed: ${written.output}`).toBe(true);
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

  // Migration 019, D-114's trial. What is recorded is which fields the OCR pre-fill offered and
  // which of those the owner changed — **field names and nothing else**, because the statistic
  // this feeds is a rate over cards rather than anything about a figure.
  describe("what a card's pre-fill offered travels as field names", () => {
    it("records both lists in the audit row, carrying no figure", async () => {
      const written = await captureCard(card({
        occurredAtTime: "17:10",
        balanceMinor: "52100",
        prefillOffered: ["amount", "balance", "occurredAt"],
        prefillChanged: ["balance"]
      }));
      expect(written.status).toBe(201);
      const audit = psql(`
        select detail::text from public.audit_events
        where owner_id = '${owner}' and event_type = 'notification_card.capture'
        order by id desc limit 1;
      `);
      expect(audit.ok).toBe(true);
      expect(audit.output).toContain("prefill_offered");
      expect(audit.output).toContain("occurredAt");
      expect(audit.output).toContain("prefill_changed");
      // The figures that were on the very card this row is about must not be in it.
      expect(audit.output).not.toContain("52100");
      expect(audit.output).not.toContain("20000");
    });

    // **The deployment-ordering case.** Every push to `main` deploys (D-109), so the browser that
    // is live right now sends neither key and must keep capturing unchanged.
    it("captures a card that names no pre-fill at all, and records empty lists", async () => {
      const written = await captureCard(card({ occurredAtTime: "17:11", balanceMinor: "52000" }));
      expect(written.status).toBe(201);
      const audit = psql(`
        select detail->>'prefill_offered' from public.audit_events
        where owner_id = '${owner}' and event_type = 'notification_card.capture'
        order by id desc limit 1;
      `);
      expect(audit.ok).toBe(true);
      expect(audit.output).toContain("[]");
    });

    // **Migration 020 closed this and the expectation flipped with it** (D-122, D-126). It stood at
    // 422 for exactly as long as the database refused an explicitly empty list, which it did
    // because `array_length` of an empty array is NULL rather than 0 and the duplicate check
    // compared that against a count of 0.
    //
    // The note it replaces was written to fail when it went stale, and it did its job: an absent
    // key and an explicit `[]` are two spellings of "nothing" and only one of them was ever
    // exercised, which is how the defect survived a full green gate and surfaced on the first real
    // card whose pre-fill the owner changed nothing on.
    //
    // The app sends the absent form (`namesOrAbsent`), so this asserts the database directly rather
    // than a path the form can still take.
    it("accepts an explicitly empty list, the same as an absent key", async () => {
      const captured = await captureCard({
        ...card({ occurredAtTime: "17:31", balanceMinor: "51000" }),
        prefillOffered: [],
        prefillChanged: []
      });
      expect(captured.status).toBe(201);

      // And it records the empty lists rather than nothing at all, so a rate computed from these
      // rows has the denominator it needs.
      const audit = psql(`
        select detail->>'prefill_offered' from public.audit_events
        where owner_id = '${owner}' and event_type = 'notification_card.capture'
        order by id desc limit 1;
      `);
      expect(audit.ok).toBe(true);
      expect(audit.output).toContain("[]");
    });

    it("refuses a field name outside the closed set, rather than storing free text", async () => {
      const written = await captureCard(card({ occurredAtTime: "17:12", prefillOffered: ["counterparty"] }));
      expect(written.status).toBe(422);
    });

    // A figure smuggled into the list is the failure this closed set exists to prevent, and it
    // must be refused by the *shape* rather than by anything inspecting the string.
    it("refuses a figure where a field name belongs", async () => {
      const written = await captureCard(card({ occurredAtTime: "17:13", prefillOffered: ["1,234.00"] }));
      expect(written.status).toBe(422);
    });

    it("refuses a changed field that was never offered", async () => {
      const written = await captureCard(card({
        occurredAtTime: "17:14",
        prefillOffered: ["amount"],
        prefillChanged: ["balance"]
      }));
      expect(written.status).toBe(422);
      expect(String(written.body.error)).toContain("invalid");
    });

    it("refuses a field named twice, since it would double-count in any rate", async () => {
      const written = await captureCard(card({ occurredAtTime: "17:15", prefillOffered: ["amount", "amount"] }));
      expect(written.status).toBe(422);
    });
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

  describe("deciding and correcting a card", () => {
  const AGREEING = "dddddddd-0000-4000-8000-0000000000a1";
  const DISAGREEING = "dddddddd-0000-4000-8000-0000000000a2";

  it("stores a match, refuses a disagreeing balance, and stores the consent when it is given", async () => {
    // Two rows on the KTB account, same amount and day, differing only in their printed balance.
    // The card printed 4,910.00, so one row agrees and the other does not.
    seedRow(AGREEING, "-9000", "491000");
    seedRow(DISAGREEING, "-9000", "500000", "2026-06-10", "10:30");
    const captured = await captureCard(card({ amountMinor: "-9000", balanceMinor: "491000" }));
    expect(captured.status, JSON.stringify(captured.body)).toBe(201);
    const cardId = (captured.body as { card: { id: string } }).card.id;

    // The agreeing row pairs with no acknowledgement, and the consent is recorded as false.
    const agreed = await decideCard(cardId, { expectedRevision: 0, decision: "matched", transactionId: AGREEING });
    expect(agreed.status, JSON.stringify(agreed.body)).toBe(200);
    const parsed = notificationCardDecisionResponseSchema.safeParse(agreed.body);
    expect(parsed.success, JSON.stringify(parsed.error?.flatten())).toBe(true);
    if (parsed.success) {
      expect(parsed.data.decision.decision).toBe("matched");
      expect(parsed.data.decision.accepted_balance_mismatch).toBe(false);
    }

    // **The refusal this route exists to make legible.** The other row fits on account, amount
    // and date and prints a different balance, so it is refused — and nothing is stored, which
    // the revision still reading 1 is what proves.
    const refused = await decideCard(cardId, { expectedRevision: 1, decision: "matched", transactionId: DISAGREEING });
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(JSON.stringify(refused.body)).toMatch(/different balance/u);
    expect(psql(`select revision from public.notification_card_decision_overlays where card_id = '${cardId}';`).output.trim()).toBe("1");

    // The same request with the acknowledgement is accepted, and the acknowledgement is what is
    // stored rather than a comparison that would go stale after a later correction.
    const accepted = await decideCard(cardId, {
      expectedRevision: 1, decision: "matched", transactionId: DISAGREEING, acceptBalanceMismatch: true
    });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect((accepted.body as { decision: { accepted_balance_mismatch: boolean } }).decision.accepted_balance_mismatch).toBe(true);
  });

  it("omitting the acknowledgement is the refusal, never the override", async () => {
    // The field defaults to false in the schema, so a client that forgets it gets the fail-closed
    // answer. That is the property worth a test of its own: the safe branch must be the default
    // rather than something a caller has to remember.
    const captured = await captureCard(card({ amountMinor: "-9000", balanceMinor: "777700", occurredAtTime: "11:11" }));
    expect(captured.status, JSON.stringify(captured.body)).toBe(201);
    const cardId = (captured.body as { card: { id: string } }).card.id;

    const refused = await decideCard(cardId, { expectedRevision: 0, decision: "matched", transactionId: AGREEING });
    expect(refused.status).toBe(409);
  });

  it("retires a card and brings it back, without ever touching the card row", async () => {
    const captured = await captureCard(card({ amountMinor: "-1500", balanceMinor: "480000", occurredAtTime: "12:12" }));
    expect(captured.status, JSON.stringify(captured.body)).toBe(201);
    const cardId = (captured.body as { card: { id: string } }).card.id;
    const before = psql(`select amount_minor from public.notification_cards where id = '${cardId}';`).output.trim();

    const retired = await decideCard(cardId, { expectedRevision: 0, decision: "not-a-payment", transactionId: null });
    expect(retired.status, JSON.stringify(retired.body)).toBe(200);
    expect((retired.body as { decision: { decision: string } }).decision.decision).toBe("not-a-payment");

    // Reversible, which is what makes retirement safe on an append-only table.
    const back = await decideCard(cardId, { expectedRevision: 1, decision: "unmatched", transactionId: null });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect((back.body as { decision: { decision: string } }).decision.decision).toBe("unmatched");

    // The card itself never moved. Retirement is a decision beside it, not an edit of it.
    expect(psql(`select amount_minor from public.notification_cards where id = '${cardId}';`).output.trim()).toBe(before);
    expect(psql(`select count(*) from public.notification_card_decision_revisions where card_id = '${cardId}';`).output.trim()).toBe("2");
  });

  it("corrects the balance and returns both money columns as canonical text or null", async () => {
    const captured = await captureCard(card({ amountMinor: "-2500", balanceMinor: "460000", occurredAtTime: "13:13" }));
    expect(captured.status, JSON.stringify(captured.body)).toBe(201);
    const cardId = (captured.body as { card: { id: string } }).card.id;

    const corrected = await correctCard(cardId, {
      expectedRevision: 0, kind: null, amountMinor: null, balanceMinor: "455000",
      occurredOn: null, occurredAtTime: null, counterparty: null, categoryId: null, note: null
    });
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(200);
    const parsed = notificationCardCorrectionResponseSchema.safeParse(corrected.body);
    expect(parsed.success, JSON.stringify(parsed.error?.flatten())).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.correction.balance_minor).toBe("455000");
    // An uncorrected amount stays **null**, not the string "null" — the overlay reads null as
    // "not corrected", so stringifying it would record a correction nobody made.
    expect(parsed.data.correction.amount_minor).toBeNull();
  });

  it("returns cards, corrections and decisions on one response", async () => {
    const listed = await listCards();
    expect(listed.status).toBe(200);
    const parsed = notificationCardListSchema.safeParse(listed.body);
    expect(parsed.success, JSON.stringify(parsed.error?.flatten())).toBe(true);
    if (!parsed.success) return;
    // The half-arrival this shape exists to prevent: facts without the owner's disagreement.
    expect(parsed.data.decisions.length).toBeGreaterThan(0);
    expect(parsed.data.corrections.length).toBeGreaterThan(0);
  });

  it("refuses a row whose movement is not the card's, and a stale revision", async () => {
    const captured = await captureCard(card({ amountMinor: "-3500", balanceMinor: "450000", occurredAtTime: "14:14" }));
    const cardId = (captured.body as { card: { id: string } }).card.id;

    // Same account, different amount — refused on the amount, to the minor unit.
    const wrongAmount = await decideCard(cardId, { expectedRevision: 0, decision: "matched", transactionId: AGREEING });
    expect(wrongAmount.status).toBe(422);

    await decideCard(cardId, { expectedRevision: 0, decision: "unmatched", transactionId: null });
    const stale = await decideCard(cardId, { expectedRevision: 0, decision: "unmatched", transactionId: null });
    expect(stale.status).toBe(409);
  });

  it("refuses a decision the contract does not name", async () => {
    const captured = await captureCard(card({ amountMinor: "-4500", balanceMinor: "440000", occurredAtTime: "15:15" }));
    const cardId = (captured.body as { card: { id: string } }).card.id;
    const bad = await decideCard(cardId, { expectedRevision: 0, decision: "retired", transactionId: null });
    expect(bad.status).toBe(422);
    // A matched decision must name a row, and the other two must not.
    const mismatched = await decideCard(cardId, { expectedRevision: 0, decision: "unmatched", transactionId: AGREEING });
    expect(mismatched.status).toBe(422);
  });
  });

  // The reader route (D-120, D-129), which is the only route in this app that reads a body which is
  // not JSON and the only one that talks to a third party.
  //
  // **It is no longer a card route and its tests stay here anyway**, which is worth stating rather
  // than leaving as an accident. It moved from `/api/v1/notification-cards/read` to
  // `/api/v1/ocr/read` when slip capture became its second caller (D-129), because a slip reading
  // through a card's URL is a misdescription that later gets reasoned from. These tests stay in this
  // file because what they need is a real signed-in aal2 session, which this file's harness already
  // establishes; splitting them out would mean a second copy of that setup, and a second copy is
  // how two harnesses come to disagree about what "signed in" means.
  //
  // **What is provable here is the wiring and the guards**, not the recognition: the accuracy claim
  // is a measurement over real screenshots, and the mapping from a Vision response is covered by
  // `tests/vision-ocr.test.ts` with an injected `fetch`. What only this layer can show
  // is that the guards run *before* anything leaves the machine, and that a missing key refuses
  // rather than calling out unauthenticated.
  describe("reading a card screenshot", () => {
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    async function readCard(body: BodyInit, contentType: string) {
      const { POST } = await import("@/app/api/v1/ocr/read/route");
      const response = await POST(new Request("http://localhost/api/v1/ocr/read", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body
      }));
      return { status: response.status, body: await response.json().catch(() => null) };
    }

    it("refuses anything that is not an image Vision decodes", async () => {
      // The relay is the reason this is stricter than it needs to be: whatever this route accepts,
      // it forwards to a third party.
      expect((await readCard("{}", "application/json")).status).toBe(415);
      expect((await readCard(PNG, "image/heic")).status).toBe(415);
      expect((await readCard(PNG, "text/plain")).status).toBe(415);
    });

    it("takes the media type without its parameters", async () => {
      // A browser sends `image/png` bare, but a `charset` or `boundary` parameter must not turn an
      // accepted type into a refusal — the failure would look like a broken reader, not a guard.
      vi.stubEnv("GOOGLE_VISION_KEY", "");
      expect((await readCard(PNG, "image/png; charset=binary")).status).toBe(503);
    });

    it("refuses an empty body and one larger than it will forward", async () => {
      vi.stubEnv("GOOGLE_VISION_KEY", "");
      expect((await readCard(new Uint8Array(0), "image/png")).status).toBe(422);
      const tooLarge = new Uint8Array(4 * 1024 * 1024 + 1);
      const refused = await readCard(tooLarge, "image/png");
      expect(refused.status).toBe(413);
    });

    it("refuses an oversized upload from its declared length, before reading the body", async () => {
      // The bound protects the third party from this app. Checking it only *after*
      // `arrayBuffer()` still forwards nothing, but buffers everything first — so the declared
      // length is checked ahead of the read. A lied-about or absent length falls through to the
      // check above, which is why both exist rather than either replacing the other.
      vi.stubEnv("GOOGLE_VISION_KEY", "");
      const { POST } = await import("@/app/api/v1/ocr/read/route");
      let read = false;
      const request = new Request("http://localhost/api/v1/ocr/read", {
        method: "POST",
        headers: { "Content-Type": "image/png", "Content-Length": String(9 * 1024 * 1024) },
        body: new Uint8Array([1, 2, 3])
      });
      // Proves the refusal came from the header rather than from the bytes: reading the body at
      // all would flip this, and the assertion below would fail even though the status matched.
      const guarded = new Proxy(request, {
        get(target, key) {
          if (key === "arrayBuffer") { read = true; return () => target.arrayBuffer(); }
          // **`target` as the receiver, not the proxy.** `Request.headers` is a getter over a
          // private field, and reading it with the proxy as `this` throws "Cannot read private
          // member #headers" — the route then fails for a reason that has nothing to do with what
          // is being tested. Functions are bound for the same reason.
          const value = Reflect.get(target, key, target) as unknown;
          return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        }
      });

      const response = await POST(guarded);
      expect(response.status).toBe(413);
      expect(read, "the body must not be read once the declared length is over the bound").toBe(false);
    });

    it("refuses without calling out when no key is configured", async () => {
      // 503 rather than 500: the deployment is missing a value, the owner can still type the card,
      // and the message says so. The size and type guards above having run first is the point —
      // nothing was sent anywhere to find this out.
      vi.stubEnv("GOOGLE_VISION_KEY", "");
      const refused = await readCard(PNG, "image/png");
      expect(refused.status).toBe(503);
      expect((refused.body as { error?: string }).error).toMatch(/not configured/iu);
    });

    it("sends the image to Vision and returns the words it read", async () => {
      vi.stubEnv("GOOGLE_VISION_KEY", "test-key-not-a-real-one");
      const realFetch = globalThis.fetch;
      let sent: { url: string; headers: Record<string, string>; body: string } | null = null;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        // Everything that is not Vision — the owner's own session lookup — goes to the real one.
        if (!url.startsWith("https://vision.googleapis.com")) return realFetch(input as RequestInfo, init);
        sent = {
          url,
          headers: (init?.headers ?? {}) as Record<string, string>,
          body: String(init?.body ?? "")
        };
        return new Response(JSON.stringify({
          responses: [{
            fullTextAnnotation: {
              pages: [{ blocks: [{ paragraphs: [{ words: [{
                symbols: [{ text: "บ" }, { text: "า" }, { text: "ท" }],
                boundingBox: { vertices: [{ x: 4, y: 8 }, { x: 40, y: 8 }, { x: 40, y: 30 }, { x: 4, y: 30 }] }
              }] }] }] }]
            }
          }]
        }), { status: 200 });
      }) as typeof fetch;

      try {
        const read = await readCard(PNG, "image/png");
        expect(read.status).toBe(200);
        expect((read.body as { words: unknown[] }).words)
          .toEqual([{ text: "บาท", left: 4, top: 8, right: 40, bottom: 30 }]);
      } finally {
        globalThis.fetch = realFetch;
      }

      const request = sent as unknown as { url: string; headers: Record<string, string>; body: string } | null;
      expect(request, "the route must have called Vision").not.toBeNull();
      // The key travels in a header, never in the URL, which is the half that reaches access logs.
      expect(request!.url).not.toContain("test-key-not-a-real-one");
      expect(request!.headers["X-Goog-Api-Key"]).toBe("test-key-not-a-real-one");
      // And the bytes this route was given are the bytes it forwarded, base64 as Vision wants them.
      const parsed = JSON.parse(request!.body) as { requests: Array<{ image: { content: string } }> };
      expect(parsed.requests[0]!.image.content).toBe(Buffer.from(PNG).toString("base64"));
    });
  });
});
