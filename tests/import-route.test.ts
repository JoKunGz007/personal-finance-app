import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { confirmationDigest, rowFingerprint } from "@/lib/canonical";
import { accountListSchema } from "@/lib/accounts";
import { assembleImportPayload } from "@/lib/import-assembly";
import { extractStatement } from "@/lib/krungthai-layout";
import type { ImportPayload } from "@/lib/statement";
import { validStatement } from "./fixtures/krungthai-layout-v1";
import {
  API, CONTAINER, OWNER_EMAIL, PUBLISHABLE, containerReachable, ownerId as lookupOwnerId,
  ownerSession, psql, resetOwnerImportSurface, weakOwnerSession, type OwnerSession
} from "./helpers/local-owner";

// Covers the Next.js route handlers themselves, which tests/import-confirm-e2e.test.ts
// deliberately does not: that suite posts straight to PostgREST, so the route's zod
// boundary, its fingerprint/digest computation, and the @supabase/ssr cookie session
// were previously verified only by reading the code. Here the real handler functions
// are invoked with a real cookie jar holding a real aal2 session.
const ACCOUNT_ID = "cccccccc-0000-4000-8000-000000000011";
const OTHER_ACCOUNT_ID = "cccccccc-0000-4000-8000-000000000012";

const reachable = containerReachable();

// The cookie jar is what the route reads through next/headers. It is populated by
// letting @supabase/ssr write a session into it, so the cookie names and encoding are
// the library's own rather than something this test invents.
const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    set: (name: string, value: string) => { jar.set(name, value); }
  })
}));

// One writer for the whole file: each createServerClient shares the same cookie
// storage key, and several live instances make GoTrue warn about concurrent use.
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

function buildPayload(accountId = ACCOUNT_ID): ImportPayload {
  const extracted = extractStatement(validStatement);
  if (!extracted.ok) throw new Error(extracted.message);
  const assembled = assembleImportPayload(extracted.frame, extracted.rows, {
    accountId,
    lastFour: extracted.frame.accountLastFour,
    currency: "THB"
  });
  if (!assembled.ok) throw new Error(assembled.message);
  return assembled.payload;
}

function confirmRequest(body: unknown) {
  return new Request("http://localhost/api/v1/imports/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

let owner = "";
let strongSession: OwnerSession;

describe.skipIf(!reachable)("import and accounts route handlers", () => {
  beforeAll(async () => {
    // The route reads its configuration from the environment at call time. These are
    // set explicitly rather than read from any .env file: the owner gate compares an
    // email, and the test must control which identity it claims to be.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", API);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    vi.stubEnv("OWNER_GOOGLE_EMAIL", OWNER_EMAIL);

    owner = lookupOwnerId();
    expect(owner, "the seeded owner must exist").toMatch(/^[0-9a-f-]{36}$/);
    const cleaned = resetOwnerImportSurface(owner, [ACCOUNT_ID, OTHER_ACCOUNT_ID]);
    expect(cleaned.ok, `cleanup failed: ${cleaned.output}`).toBe(true);

    const setup = psql(`
      insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
      values ('${ACCOUNT_ID}', '${owner}', 'KTB', 'Route synthetic', 'savings', '7890', 'THB', 'Asia/Bangkok'),
             ('${OTHER_ACCOUNT_ID}', '${owner}', 'KTB', 'Route synthetic other', 'current', '1234', 'THB', 'Asia/Bangkok');
    `);
    expect(setup.ok, `setup failed: ${setup.output}`).toBe(true);

    strongSession = await ownerSession();
    await seedCookieJar(strongSession);
  }, 120_000);

  afterAll(() => {
    vi.unstubAllEnvs();
    resetOwnerImportSurface(owner, [ACCOUNT_ID, OTHER_ACCOUNT_ID]);
  });

  describe("GET /api/v1/accounts", () => {
    it("lists the owner's accounts in its published shape", async () => {
      const { GET } = await import("@/app/api/v1/accounts/route");
      const response = await GET();
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");

      const parsed = accountListSchema.safeParse(await response.json());
      expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.flatten())).toBe(true);
      if (!parsed.success) return;

      const listed = parsed.data.accounts.filter((account) => [ACCOUNT_ID, OTHER_ACCOUNT_ID].includes(account.id));
      expect(listed).toHaveLength(2);
      // Ordered by label, and carrying the last four digits the binding check needs.
      expect(listed.map((account) => account.label)).toEqual(["Route synthetic", "Route synthetic other"]);
      expect(listed[0]!.last_four).toBe("7890");
      // The published column set is the contract: no wider account identifier is
      // selected, and the strict schema above would already have rejected an extra one.
      expect(Object.keys(listed[0]!).sort()).toEqual(
        ["account_type", "bank_code", "currency", "id", "label", "last_four", "timezone"]
      );
    });
  });

  describe("POST /api/v1/imports/confirm", () => {
    it("confirms an assembled payload through the route's own boundary", async () => {
      const payload = buildPayload();
      const { POST } = await import("@/app/api/v1/imports/confirm/route");
      const response = await POST(confirmRequest({
        idempotencyKey: randomUUID(),
        artifactDigest: "e".repeat(64),
        payload
      }));

      const body = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(201);
      expect(body.batchId).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.fingerprints).toHaveLength(payload.rows.length);

      // The route's own fingerprint and digest computation, which the PostgREST suite
      // could only mirror by hand, is what the database accepted.
      const fingerprints = await Promise.all(payload.rows.map((row) => rowFingerprint(payload.accountId, payload.bankCode, row)));
      expect(body.fingerprints).toEqual(fingerprints);
      const expectedDigest = await confirmationDigest({
        accountId: payload.accountId,
        contractVersion: payload.contractVersion,
        currency: payload.currency,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        openingBalanceMinor: payload.openingBalance.minor,
        closingBalanceMinor: payload.closingBalance.minor
      }, payload.rows.map((row, index) => ({ ...row, fingerprint: fingerprints[index], sourceIndex: index + 1 })));
      expect(body.payloadDigest).toBe(expectedDigest);

      const stored = psql(`select count(*) from public.source_transactions where owner_id = '${owner}' and account_id = '${ACCOUNT_ID}';`);
      expect(stored.output.trim()).toBe(String(payload.rows.length));
    }, 60_000);

    it("reports a replayed idempotency key as a conflict", async () => {
      const payload = buildPayload();
      const key = randomUUID();
      const { POST } = await import("@/app/api/v1/imports/confirm/route");
      const first = await POST(confirmRequest({ idempotencyKey: key, artifactDigest: "1".repeat(64), payload }));
      expect(first.status, JSON.stringify(await first.clone().json())).toBe(201);

      // Same retry key, different artifact: the route must translate this to 409
      // rather than a generic failure.
      const replay = await POST(confirmRequest({ idempotencyKey: key, artifactDigest: "2".repeat(64), payload }));
      expect(replay.status).toBe(409);
      expect((await replay.json()).error).toMatch(/already used/u);
    }, 60_000);

    it("rejects a body that is not JSON", async () => {
      const { POST } = await import("@/app/api/v1/imports/confirm/route");
      const response = await POST(confirmRequest("not json at all"));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/not valid JSON/u);
    });

    it("rejects unknown fields, a bad digest, and a missing key at the zod boundary", async () => {
      const payload = buildPayload();
      const { POST } = await import("@/app/api/v1/imports/confirm/route");
      const cases = [
        { idempotencyKey: randomUUID(), artifactDigest: "f".repeat(64), payload, extra: "smuggled" },
        { idempotencyKey: randomUUID(), artifactDigest: "F".repeat(64), payload },
        { idempotencyKey: "not-a-uuid", artifactDigest: "f".repeat(64), payload },
        { artifactDigest: "f".repeat(64), payload },
        { idempotencyKey: randomUUID(), artifactDigest: "f".repeat(64), payload: { ...payload, currency: "USD" } }
      ];
      for (const body of cases) {
        const response = await POST(confirmRequest(body));
        expect(response.status, JSON.stringify(body).slice(0, 120)).toBe(422);
        expect((await response.json()).error).toBe("The import contract is invalid.");
      }
      // Nothing landed for the second account, so no rejected case reached the database.
      const stored = psql(`select count(*) from public.source_transactions where owner_id = '${owner}' and account_id = '${OTHER_ACCOUNT_ID}';`);
      expect(stored.output.trim()).toBe("0");
    }, 60_000);

    it("blocks indistinguishable rows before the database is touched", async () => {
      const payload = buildPayload(OTHER_ACCOUNT_ID);
      const duplicated = { ...payload, rows: [payload.rows[0]!, payload.rows[0]!] };
      const { POST } = await import("@/app/api/v1/imports/confirm/route");
      const response = await POST(confirmRequest({
        idempotencyKey: randomUUID(),
        artifactDigest: "3".repeat(64),
        payload: duplicated
      }));
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.details.code).toBe("AMBIGUOUS_DUPLICATES");

      const stored = psql(`select count(*) from public.source_transactions where owner_id = '${owner}' and account_id = '${OTHER_ACCOUNT_ID}';`);
      expect(stored.output.trim()).toBe("0");
    }, 60_000);

  });

  // These run last on purpose: signing in again at aal1 replaces the stored session,
  // and a refreshed token in that family is no longer aal2. Restoring the strong
  // session mid-file made the suite order-dependent, so the weak cases come after
  // every test that needs strong access.
  describe("without strong owner access", () => {
    it("refuses an accounts listing to a session that has not passed MFA", async () => {
      await seedCookieJar(await weakOwnerSession());
      const { GET } = await import("@/app/api/v1/accounts/route");
      const response = await GET();
      expect(response.status).toBe(403);
      expect((await response.json()).error).toMatch(/AAL2/u);
    }, 30_000);

    it("refuses a confirmation to a session that has not passed MFA", async () => {
      await seedCookieJar(await weakOwnerSession());
      const { POST } = await import("@/app/api/v1/imports/confirm/route");
      const response = await POST(confirmRequest({
        idempotencyKey: randomUUID(),
        artifactDigest: "4".repeat(64),
        payload: buildPayload()
      }));
      expect(response.status).toBe(403);
      expect((await response.json()).error).toMatch(/AAL2/u);
    }, 30_000);

    it("refuses an unauthenticated request", async () => {
      jar.clear();
      const { POST } = await import("@/app/api/v1/imports/confirm/route");
      const response = await POST(confirmRequest({
        idempotencyKey: randomUUID(),
        artifactDigest: "5".repeat(64),
        payload: buildPayload()
      }));
      expect(response.status).toBe(401);
      expect((await response.json()).error).toMatch(/Sign in/u);
    }, 30_000);
  });
});

it.skipIf(reachable)("reports that the route wrapper was not verified", () => {
  console.warn(
    `Skipped import and accounts route handlers: container ${CONTAINER} is unreachable. ` +
    "Run `pnpm supabase:start` to exercise them — a skipped run proves nothing about the route boundary."
  );
  expect(reachable).toBe(false);
});
