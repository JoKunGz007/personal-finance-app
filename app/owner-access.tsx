"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/browser/supabase";
import { announceOwnerReady } from "@/lib/owner-ready";
import {
  abandonedFactors,
  ownerAccessState,
  REQUIRED_FACTORS,
  type OwnerAccessState,
  type TotpFactor
} from "@/lib/owner-access";

/**
 * The real sign-in: Google, then two TOTP factors (PLAN task 19).
 *
 * One component owns the whole session because the four states are one sequence — signed
 * out, enrolling, proving a factor, ready — and splitting them across the header and a
 * page would mean two places reading the same Supabase state and disagreeing about it
 * whenever one refreshed and the other did not.
 *
 * **Every rule about which state applies lives in `lib/owner-access.ts`**, which knows
 * nothing about React or Supabase and is unit-tested without either. What is here is the
 * conversation with Supabase and the markup.
 *
 * It renders no panel at all when the owner is `ready` beyond the identity and a way out,
 * so the ordinary case is a line of text rather than a permanent block of security
 * furniture above the ledger.
 */

type Enrolment = { factorId: string; qrCode: string; secret: string };

export function OwnerAccess() {
  const [supabase] = useState(browserSupabase);
  const [state, setState] = useState<OwnerAccessState>({ kind: "signed-out" });
  const [email, setEmail] = useState("");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const codeField = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setState({ kind: "signed-out" });
      setEmail("");
      return;
    }
    const [assurance, listed] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors()
    ]);
    const factors: TotpFactor[] = listed.data?.totp ?? [];
    setEmail(user.email ?? "");
    setState(ownerAccessState({ signedIn: true, level: assurance.data?.currentLevel ?? null, factors }));
  }, [supabase]);

  // The load-on-mount shape the rest of this app uses (`app/correction-form.tsx`): the work
  // is inside an async call, so nothing sets state during the effect body itself.
  useEffect(() => { void (async () => { await refresh(); })(); }, [refresh]);

  // Focus lands on the field the owner has to type into the moment one appears. D-070 found
  // this exact defect in the match chooser — a mode opened, focus stayed at the top of the
  // document, and no axe pass could see it — so it is done deliberately here rather than
  // discovered again.
  useEffect(() => {
    if (state.kind === "challenge" || enrolment) codeField.current?.focus();
  }, [state.kind, enrolment]);

  /**
   * Says so, once, when the owner becomes `ready`.
   *
   * **Signing in does not navigate.** The owner can land on `/ledger` signed out, have the load
   * on arrival answered 401 (PLAN task 43), and complete a sign-in from the header without a
   * single thing on the page below changing — leaving an empty table and a "sign in" line in
   * front of someone who just did. This is what closes that, and it is announced rather than
   * observed so that this component stays the only reader of the session, for the reason given
   * at the top of this file.
   *
   * Keyed on `state.kind`, so it fires on the transition and not on every render.
   */
  useEffect(() => {
    if (state.kind === "ready") announceOwnerReady();
  }, [state.kind]);

  if (!supabase) {
    return <p className="owner-access-note">Supabase is not configured, so there is nothing to sign in to.</p>;
  }

  async function signIn() {
    if (!supabase) return;
    setBusy(true);
    setMessage("Opening Google…");
    // The callback origin is read from the browser rather than configured, so the same
    // build works on loopback and on whatever host it is later served from. Google will
    // still refuse any origin not registered against the OAuth client, which is the check
    // that matters and is not this app's to make.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) {
      setBusy(false);
      setMessage(`Google sign-in could not start: ${error.message}`);
    }
    // No success branch: the browser is navigating away.
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setEnrolment(null);
    setCode("");
    setMessage("Signed out.");
    await refresh();
    setBusy(false);
  }

  async function beginEnrolment() {
    if (!supabase) return;
    setBusy(true);
    setMessage("");

    // Clear anything a previous attempt abandoned first. An unverified factor still counts
    // against the account's limit and can never be completed, because its secret was shown
    // once on a screen that is gone — so without this, retrying is what eventually makes
    // enrolment impossible.
    const listed = await supabase.auth.mfa.listFactors();
    for (const stale of abandonedFactors(listed.data?.totp ?? [])) {
      await supabase.auth.mfa.unenroll({ factorId: stale.id });
    }

    const enrolled = await supabase.auth.mfa.enroll({
      factorType: "totp",
      // Supabase refuses a duplicate friendly name, and a retry after a failed verification
      // is the common case rather than the rare one.
      friendlyName: `Private Ledger ${new Date().toISOString()}`
    });
    setBusy(false);
    if (enrolled.error) {
      setMessage(`This factor could not be started: ${enrolled.error.message}`);
      return;
    }
    setEnrolment({
      factorId: enrolled.data.id,
      qrCode: enrolled.data.totp.qr_code,
      secret: enrolled.data.totp.secret
    });
    setCode("");
    setMessage("Scan the square with an authenticator app, then type the six digits it shows.");
  }

  async function submitCode(factorId: string) {
    if (!supabase) return;
    setBusy(true);
    setMessage("Checking the code…");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) {
      setBusy(false);
      // A rejected code is almost always a clock or a typo rather than a broken factor, and
      // the enrolment stays on screen so the same square can be retried.
      setMessage(`That code was not accepted: ${error.message}`);
      return;
    }
    setEnrolment(null);
    setCode("");
    await refresh();
    setBusy(false);
    setMessage("Accepted.");
  }

  return (
    <div className="owner-access">
      {state.kind === "signed-out" ? (
        <button className="primary-button" type="button" onClick={signIn} disabled={busy}>
          Sign in with Google
        </button>
      ) : null}

      {state.kind === "ready" ? (
        <p className="owner-access-note">
          Signed in as <strong>{email}</strong>.{" "}
          <button className="link-button" type="button" onClick={signOut} disabled={busy}>Sign out</button>
        </p>
      ) : null}

      {state.kind === "enrol" ? (
        <section className="owner-access-panel" aria-labelledby="owner-access-enrol">
          {/* Worded for the one factor `REQUIRED_FACTORS` currently asks for, but it does not
              hard-code that: the sentence about how many are left appears only when more than
              one is outstanding, so raising the constant changes the words rather than making
              them false. */}
          <h2 id="owner-access-enrol">Set up your authenticator</h2>
          <p>
            This ledger shows no financial record until an authenticator app is set up.
            {state.remaining > 1 ? ` ${state.verified} of ${REQUIRED_FACTORS} are done.` : ""}
          </p>

          {enrolment ? (
            <>
              {/* Decorative: the same secret is printed below as text, because a square is
                  unreadable to a screen reader and every authenticator app accepts the key
                  typed by hand.

                  A plain `<img>` on purpose. Supabase returns this as an inline `data:` SVG,
                  which `next/image` cannot optimise and would only route through a loader —
                  and the strict CSP allows it exactly as it stands (`img-src 'self' data:`). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="owner-access-qr" src={enrolment.qrCode} alt="" />
              <p className="owner-access-secret">
                Or type this key into the app: <code>{enrolment.secret}</code>
              </p>
              <form
                onSubmit={(event) => { event.preventDefault(); void submitCode(enrolment.factorId); }}
              >
                <label htmlFor="owner-access-code">Six-digit code</label>
                <input
                  id="owner-access-code"
                  ref={codeField}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                />
                <button className="primary-button" type="submit" disabled={busy || code.trim().length === 0}>
                  Confirm this factor
                </button>
              </form>
            </>
          ) : (
            <button className="primary-button" type="button" onClick={beginEnrolment} disabled={busy}>
              {state.verified === 0 ? "Set up your authenticator" : "Add another factor"}
            </button>
          )}

          <p className="owner-access-note">
            Signed in as {email}.{" "}
            <button className="link-button" type="button" onClick={signOut} disabled={busy}>Sign out</button>
          </p>
        </section>
      ) : null}

      {state.kind === "challenge" ? (
        <section className="owner-access-panel" aria-labelledby="owner-access-challenge">
          <h2 id="owner-access-challenge">Enter a code from your authenticator</h2>
          {/* The factor being proved, published so the browser spec can compute a code for
              the one this component actually chose rather than guessing at the order
              `listFactors` returned. It is a Supabase factor id — the same value the client
              already holds — and never the secret. */}
          <form
            data-factor-id={state.factorId}
            onSubmit={(event) => { event.preventDefault(); void submitCode(state.factorId); }}
          >
            <label htmlFor="owner-access-code">Six-digit code</label>
            <input
              id="owner-access-code"
              ref={codeField}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            <button className="primary-button" type="submit" disabled={busy || code.trim().length === 0}>
              Continue
            </button>
          </form>
          <p className="owner-access-note">
            Signed in as {email}.{" "}
            <button className="link-button" type="button" onClick={signOut} disabled={busy}>Sign out</button>
          </p>
        </section>
      ) : null}

      {/* Not role="status": the shell already carries one live region and every route carries
          its own, so a third named role would make `getByRole("status")` ambiguous on every
          page — the reasoning `app/site-header.tsx` records for its own session line. */}
      <p className="owner-access-message" aria-live="polite">{message}</p>
    </div>
  );
}
