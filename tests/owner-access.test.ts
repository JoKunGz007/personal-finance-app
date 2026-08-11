import { describe, expect, it } from "vitest";
import { abandonedFactors, ownerAccessState, REQUIRED_FACTORS } from "@/lib/owner-access";

// What the owner is asked to do next, decided without a browser, a redirect or a live
// Supabase (PLAN task 19). The component that renders these states is a thin shell over
// this function, so every rule worth getting right is checked here.

describe("owner access state", () => {
  const verified = (id: string) => ({ id, status: "verified" });
  const unverified = (id: string) => ({ id, status: "unverified" });

  it("offers nothing but sign-in when there is no session", () => {
    expect(ownerAccessState({ signedIn: false, level: null, factors: [] })).toEqual({ kind: "signed-out" });
    // A signed-out state is not affected by anything else that may be reported.
    expect(ownerAccessState({ signedIn: false, level: "aal2", factors: [verified("a")] }))
      .toEqual({ kind: "signed-out" });
  });

  it("asks for a factor immediately after a first sign-in", () => {
    expect(ownerAccessState({ signedIn: true, level: "aal1", factors: [] }))
      .toEqual({ kind: "enrol", verified: 0, remaining: 1 });
  });

  it("still asks for a factor when Supabase already calls the session aal2", () => {
    // **The case this module's ordering exists for**, and it is reachable in practice: an
    // `aal2` claim lives in a JWT that does not change until it is refreshed, so deleting a
    // factor from the dashboard leaves a session claiming `aal2` with nothing enrolled. An
    // implementation that consulted the level first would return `ready` here and show a
    // signed-in owner whom `private.has_strong_owner_access` rejects, with nothing on
    // screen to explain it.
    expect(ownerAccessState({ signedIn: true, level: "aal2", factors: [] }))
      .toEqual({ kind: "enrol", verified: 0, remaining: 1 });
  });

  it("does not count a factor that was never verified", () => {
    // An abandoned enrolment leaves this row behind. Counting it would take the owner
    // straight to a challenge for a factor whose secret nobody holds.
    expect(ownerAccessState({ signedIn: true, level: "aal2", factors: [unverified("a")] }))
      .toEqual({ kind: "enrol", verified: 0, remaining: 1 });
  });

  it("asks for a code when a factor exists but this session has not proved it", () => {
    expect(ownerAccessState({ signedIn: true, level: "aal1", factors: [verified("a")] }))
      .toEqual({ kind: "challenge", factorId: "a" });
  });

  it("treats an unknown or absent assurance level as not yet proved", () => {
    // `getAuthenticatorAssuranceLevel` can answer with an error, and the component passes
    // null through rather than inventing a level. Failing closed here means asking for a
    // code that is not needed, which costs nothing; failing open would show the ledger.
    expect(ownerAccessState({ signedIn: true, level: null, factors: [verified("a")] }))
      .toEqual({ kind: "challenge", factorId: "a" });
  });

  it("is ready at aal2 with a verified factor, which is exactly the gate's own rule", () => {
    expect(ownerAccessState({ signedIn: true, level: "aal2", factors: [verified("a")] }))
      .toEqual({ kind: "ready" });
  });

  it("treats a second factor as neither required nor a problem", () => {
    // The property that made requiring two pointless, asserted rather than assumed: the
    // gate counts factors, so more of them changes no outcome. Owners who enrolled two
    // before 2026-08-11 keep working unchanged (D-093).
    expect(ownerAccessState({ signedIn: true, level: "aal2", factors: [verified("a"), verified("b")] }))
      .toEqual({ kind: "ready" });
    expect(ownerAccessState({ signedIn: true, level: "aal1", factors: [verified("a"), verified("b")] }))
      .toEqual({ kind: "challenge", factorId: "a" });
  });

  it("agrees with the number the SQL gate enforces", () => {
    // `private.has_strong_owner_access` requires this many, and `lib/server/supabase.ts`
    // and the development sign-in route both import this constant rather than restating it.
    // If it is ever changed without migration 015's successor, the UI would stop asking for
    // a factor the database still demands, and the symptom would be a 403 with nothing on
    // screen about it.
    expect(REQUIRED_FACTORS).toBe(1);
  });

  it("names every unverified factor as abandoned, and no verified one", () => {
    expect(abandonedFactors([verified("a"), unverified("b"), unverified("c")]))
      .toEqual([unverified("b"), unverified("c")]);
    expect(abandonedFactors([verified("a")])).toEqual([]);
  });
});
