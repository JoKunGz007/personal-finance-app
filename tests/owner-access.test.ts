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
    expect(ownerAccessState({ signedIn: false, level: "aal2", factors: [verified("a"), verified("b")] }))
      .toEqual({ kind: "signed-out" });
  });

  it("asks for both factors immediately after a first sign-in", () => {
    expect(ownerAccessState({ signedIn: true, level: "aal1", factors: [] }))
      .toEqual({ kind: "enrol", verified: 0, remaining: 2 });
  });

  it("still asks for the second factor when Supabase already calls the session aal2", () => {
    // **The case this module exists for.** Verifying one freshly enrolled factor elevates a
    // session to aal2, so Supabase's own bar is met while `lib/server/supabase.ts` still
    // refuses every owner-bound route for want of a second factor. An implementation that
    // consulted the level first would return `ready` here and show a signed-in owner whom
    // every route rejects, with nothing on screen to explain it.
    expect(ownerAccessState({ signedIn: true, level: "aal2", factors: [verified("a")] }))
      .toEqual({ kind: "enrol", verified: 1, remaining: 1 });
  });

  it("does not count a factor that was never verified", () => {
    // An abandoned enrolment leaves this row behind. Counting it would take the owner
    // straight to a challenge for a factor whose secret nobody holds.
    expect(ownerAccessState({ signedIn: true, level: "aal1", factors: [verified("a"), unverified("b")] }))
      .toEqual({ kind: "enrol", verified: 1, remaining: 1 });
  });

  it("asks for a code when both factors exist but this session has not proved one", () => {
    expect(ownerAccessState({ signedIn: true, level: "aal1", factors: [verified("a"), verified("b")] }))
      .toEqual({ kind: "challenge", factorId: "a" });
  });

  it("treats an unknown or absent assurance level as not yet proved", () => {
    // `getAuthenticatorAssuranceLevel` can answer with an error, and the component passes
    // null through rather than inventing a level. Failing closed here means asking for a
    // code that is not needed, which costs nothing; failing open would show the ledger.
    expect(ownerAccessState({ signedIn: true, level: null, factors: [verified("a"), verified("b")] }))
      .toEqual({ kind: "challenge", factorId: "a" });
  });

  it("is ready only at aal2 with both factors, which is exactly the gate's own rule", () => {
    expect(ownerAccessState({ signedIn: true, level: "aal2", factors: [verified("a"), verified("b")] }))
      .toEqual({ kind: "ready" });
    // More than the requirement is still ready — the gate counts a minimum, not an exact number.
    expect(ownerAccessState({ signedIn: true, level: "aal2", factors: [verified("a"), verified("b"), verified("c")] }))
      .toEqual({ kind: "ready" });
  });

  it("agrees with the number the SQL gate enforces", () => {
    // `private.has_strong_owner_access` and `lib/server/supabase.ts` both require two. If
    // this constant is ever loosened, the UI would stop asking for a factor the database
    // still demands, and the symptom would be a 403 with nothing on screen about it.
    expect(REQUIRED_FACTORS).toBe(2);
  });

  it("names every unverified factor as abandoned, and no verified one", () => {
    expect(abandonedFactors([verified("a"), unverified("b"), unverified("c")]))
      .toEqual([unverified("b"), unverified("c")]);
    expect(abandonedFactors([verified("a"), verified("b")])).toEqual([]);
  });
});
