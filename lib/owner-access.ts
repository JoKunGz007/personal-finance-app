// What the owner still has to do before any owner-bound route will answer, as a pure
// function of what Supabase reports (PLAN task 19).
//
// **The rule this module exists to state once.** An owner-bound route needs `aal2` *and* a
// verified TOTP factor, and the factor count is checked **before** the assurance level.
// That order is load-bearing rather than stylistic: enrolment and elevation are separate
// events, so an owner can hold a session Supabase already calls `aal2` while carrying no
// verified factor at all — a factor deleted from the dashboard leaves exactly that state,
// because the `aal` claim lives in a JWT that does not change until it is refreshed.
// Reading the level first would show a signed-in owner every route rejects, with nothing on
// screen to say why.
//
// Kept apart from `app/owner-access.tsx` for the same reason `lib/slip-ocr.ts` is kept
// apart from its engine: every rule about what the owner is allowed to do next is decided
// here and is testable without a browser, a redirect or a live Supabase.

/**
 * One, and the count `private.has_strong_owner_access` enforces in SQL (D-093, migration
 * 015). **The only place TypeScript states this number** — `lib/server/supabase.ts` and
 * `app/api/v1/dev/session/route.ts` both import it, so the app cannot disagree with itself
 * about the bar. It can still disagree with the database, which is what the pgTAP contract
 * in `supabase/tests/002_security_contracts.sql` is for.
 *
 * It was two until 2026-08-11, on a rationale that did not survive being questioned: the
 * gate counts enrolled factors rather than proved ones, so the second bought no strength at
 * sign-in, and recovery comes from storing a secret independently rather than from the
 * count. D-004 required two and never said why; D-093 supersedes it.
 */
export const REQUIRED_FACTORS = 1;

/** The shape of a Supabase TOTP factor, structurally rather than by import. */
export type TotpFactor = { id: string; status: string };

export type OwnerAccessState =
  /** No session at all. Google sign-in is the only thing on offer. */
  | { kind: "signed-out" }
  /** Signed in, but short of two verified factors. `remaining` is how many are still needed. */
  | { kind: "enrol"; verified: number; remaining: number }
  /** Both factors exist; this session has not proved one yet. */
  | { kind: "challenge"; factorId: string }
  /** `aal2` with two verified factors — what every owner-bound route requires. */
  | { kind: "ready" };

export function ownerAccessState(input: {
  signedIn: boolean;
  level: string | null;
  factors: readonly TotpFactor[];
}): OwnerAccessState {
  if (!input.signedIn) return { kind: "signed-out" };

  const verified = input.factors.filter((factor) => factor.status === "verified");
  if (verified.length < REQUIRED_FACTORS) {
    return { kind: "enrol", verified: verified.length, remaining: REQUIRED_FACTORS - verified.length };
  }

  // Ordered after the count deliberately — see the header. A stale `aal2` claim can outlive
  // the factor that earned it, so the level can never be the first thing consulted.
  if (input.level !== "aal2") return { kind: "challenge", factorId: verified[0]!.id };

  return { kind: "ready" };
}

/**
 * Factors left behind by an enrolment nobody finished.
 *
 * Supabase creates the factor at `enroll` and marks it verified only once a code is
 * accepted, so closing the tab midway leaves an `unverified` row that counts against the
 * account's factor limit and is useless — its secret was shown once, on a screen that is
 * gone. Clearing them before starting a new enrolment is what keeps a retry from being
 * the thing that exhausts the limit.
 */
export function abandonedFactors(factors: readonly TotpFactor[]): TotpFactor[] {
  return factors.filter((factor) => factor.status !== "verified");
}
