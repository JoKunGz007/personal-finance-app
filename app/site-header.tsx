"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FontPicker } from "@/app/font-picker";
import { OwnerAccess } from "@/app/owner-access";
import type { FontChoice } from "@/lib/ui-font";
import { announceOwnerReady } from "@/lib/owner-ready";

// The shell every route renders inside (PLAN task 19).
//
// Until 2026-07-31 this app was one long page, and reaching the ledger meant scrolling past
// the import bench — which had already been worked around once by reordering the sections
// (task 17). Routing is the fix that reordering was standing in for, and it lands here
// rather than with hosting because it needs nothing hosted.
const ROUTES = [
  { href: "/ledger", label: "Ledger" },
  { href: "/statistics", label: "Statistics" },
  { href: "/import", label: "Import" },
  { href: "/slips", label: "Slips" },
  { href: "/recovery", label: "Recovery" }
] as const;

// The chosen typeface arrives as a prop rather than being read here, because the cookie that holds
// it is httpOnly and this is a client component. `app/layout.tsx` resolves it server-side and hands
// it down, which is also what keeps the face correct on first paint (PLAN task 42).
export function SiteHeader({ font }: { font: FontChoice }) {
  const pathname = usePathname();
  const [session, setSession] = useState("");
  /**
   * Whether the header's secondary controls are on screen. **Phone only** — above 700px the panel
   * is `display: contents` and this decides nothing, which is why there is no media query in here.
   *
   * The reason it exists: on a phone this header was taking most of the first screen before any
   * route's own heading began — brand, privacy chip, typeface picker and its two-line note, two
   * sign-in controls, the route row and the session line. The ledger page's whole point is the
   * table, and it could not be the most visible thing on the device while that held. The route row
   * and the brand stay; everything a person touches once a week folds behind one control, which is
   * the same trade the `(i)` disclosures make with copy.
   */
  const [panelOpen, setPanelOpen] = useState(false);

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
    // **The second producer of this announcement, and the one the browser suites drive.** Like the
    // real login it mints a session without navigating, so anything already refused for want of
    // one is sitting there refused — the ledger loads on arrival now (PLAN task 43), so on this
    // route that is the whole table. `lib/owner-ready.ts` says what listens and why it is told
    // rather than asked.
    announceOwnerReady();
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

      {/* Phone only: `display: none` above 700px. Placed before the panel so it keeps its position
          in the flex row when the panel collapses. */}
      <button
        type="button"
        className="header-toggle"
        aria-expanded={panelOpen}
        aria-controls="header-panel"
        onClick={() => setPanelOpen((current) => !current)}
      >
        Settings
      </button>

      {/* **`display: contents` above 700px**, so the desktop header is laid out exactly as it was:
          these children go on participating in the header's own flex row rather than being wrapped
          in a box. Below it the wrapper becomes a real full-width row that `panelOpen` shows or
          hides. Nothing here is a landmark, so flattening it costs no semantics. */}
      <div className="header-panel" id="header-panel" data-open={panelOpen}>
      <div className="header-side">
        <span className="privacy-chip"><i aria-hidden="true" /> Documents stay on this device</span>
        <FontPicker value={font} />
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

      {/* A sibling of `.header-side` rather than a child, so it can take the full row when it has a
          panel to show — the enrolment square and its key do not fit beside the nav, and neither
          does a code field. Ordered before the session line. */}
      <OwnerAccess />

      {/* Always mounted, so the announcement is a change to a live region rather than a new
          one appearing. Deliberately not role="status": every route already has one status
          line of its own, and a second would make `getByRole("status")` ambiguous on every
          page — including in the specs that read those lines. */}
      <p className="session-state" aria-live="polite">{session}</p>
      </div>
    </header>
  );
}
