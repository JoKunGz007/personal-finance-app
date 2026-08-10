// What the owner still has to do before any owner-bound route will answer, as a pure
// function of what Supabase reports (PLAN task 19).
//
// **The rule this module exists to state once.** `lib/server/supabase.ts` refuses every
// owner-bound route unless the session is `aal2` *and* carries **two** verified TOTP
// factors. Supabase's own `aal2` is a weaker bar than that: verifying a single freshly
// enrolled factor already elevates a session, so an owner with one factor is `aal2` by
// Supabase's reckoning and still refused by this app's gate. Anything reading only the
// assurance level would therefore show a signed-in owner every route rejects, with nothing
// on screen to say why — so the factor count is checked first and the level second.
//
// Kept apart from `app/owner-access.tsx` for the same reason `lib/slip-ocr.ts` is kept
// apart from its engine: every rule about what the owner is allowed to do next is decided
// here and is testable without a browser, a redirect or a live Supabase.

/** Both of them, and the count `private.has_strong_owner_access` enforces in SQL. */
export const REQUIRED_FACTORS = 2;

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

  // Ordered after the count deliberately — see the header. A one-factor owner reaches
  // `aal2` and must still enrol, so the level can never be the first thing consulted.
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
