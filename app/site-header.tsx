"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { OwnerAccess } from "@/app/owner-access";

// The shell every route renders inside (PLAN task 19).
//
// Until 2026-07-31 this app was one long page, and reaching the ledger meant scrolling past
// the import bench — which had already been worked around once by reordering the sections
// (task 17). Routing is the fix that reordering was standing in for, and it lands here
// rather than with hosting because it needs nothing hosted.
const ROUTES = [
  { href: "/ledger", label: "Ledger" },
  { href: "/import", label: "Import" },
  { href: "/slips", label: "Slips" },
  { href: "/recovery", label: "Recovery" }
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [session, setSession] = useState("");

  // Share-to-app registers its worker here rather than on the slips page, and the move is
  // routing's doing. The share target delivers a POST that only a registered worker can
  // intercept; with one page, any visit armed it. With four, a worker installed only by
  // /slips means the first share ever made arrives before anything is listening — so the
  // image reaches the server's fallback handler instead of staying on the device, which is
  // the one thing D-050 rules out. Registering in the shell arms it on any visit.
  //
  // It remains exactly one registration site, and `public/share-slip-sw.js` still caches
  // nothing but the shared image: a worker that served an app shell would hand this app a
  // stale build, which is among the hardest failures here to diagnose (tests/privacy.test.ts).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Failure costs share-to-app only; choosing a file by hand still works, so there is
    // nothing to report and nothing to retry.
    void navigator.serviceWorker.register("/share-slip-sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  // Development only, and stripped from a production bundle along with its button. It mints
  // the aal2 cookie session the owner-bound routes require, so every route behind one can be
  // reached in a browser without a Google account or an authenticator app.
  //
  // **It is not superseded by the Google sign-in that now sits beside it, and both stay.**
  // The browser suites drive this one: it is synchronous, needs no third party, and cannot
  // run anywhere but this machine (the route checks the flag, the Supabase URL and the
  // request's own Host, all three fail closed). The real login is `app/owner-access.tsx`,
  // which is the only one a hosted deployment has.
  // See app/api/v1/dev/session/route.ts for why a password session satisfies the gate.
  async function devSignIn() {
    setSession("Minting a development owner session…");
    const response = await fetch("/api/v1/dev/session", { method: "POST", cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);
    const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    if (!response.ok) {
      setSession(typeof record.error === "string" ? record.error : "The development session could not be created.");
      return;
    }
    const warning = typeof record.warning === "string" ? ` ${record.warning}` : "";
    setSession(`Signed in as the synthetic owner at ${String(record.level)} with ${String(record.verifiedFactors)} verified factors.${warning}`);
  }

  return (
    <header className="site-header">
      <Link className="brand" href="/ledger" aria-label="Private Ledger home">
        <span className="brand-mark" aria-hidden="true">PL</span>
        <span><strong>Private Ledger</strong><small>Local-first · Bangkok time</small></span>
      </Link>

      <nav className="site-nav" aria-label="Sections">
        <ul>
          {ROUTES.map((route) => {
            const current = pathname === route.href || pathname.startsWith(`${route.href}/`);
            return (
              <li key={route.href}>
                <Link href={route.href} aria-current={current ? "page" : undefined} className={current ? "current" : ""}>
                  {route.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="header-side">
        <span className="privacy-chip"><i aria-hidden="true" /> Documents stay on this device</span>
        {/* Local acceptance only, and opt-in. The bundler inlines the flag at build time, so
            in a build that did not set it the comparison is `undefined === "1"` and this is
            never rendered — though the literal below does survive in the chunk, since a dead
            branch is not the same as an absent string. The route answers 404 without the same
            flag, which is the guard that matters. Not gated on NODE_ENV: the browser suite
            runs against a production build, because the strict CSP forbids the eval() React
            needs under `next dev` (GOTCHAS, D-036). */}
        {process.env.NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION === "1" ? (
          <button className="secondary-button" type="button" onClick={devSignIn}>Dev sign-in</button>
        ) : null}
      </div>

      {/* A direct child of the header rather than of `.header-side`, so it can take the
          full row when it has a panel to show — the enrolment square and its key do not fit
          beside the nav, and neither does a code field. Ordered before the session line. */}
      <OwnerAccess />

      {/* Always mounted, so the announcement is a change to a live region rather than a new
          one appearing. Deliberately not role="status": every route already has one status
          line of its own, and a second would make `getByRole("status")` ambiguous on every
          page — including in the specs that read those lines. */}
      <p className="session-state" aria-live="polite">{session}</p>
    </header>
  );
}
