import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
// **The three pixel faces are declared in `globals.css`, not imported here, and that is deliberate.**
// Each needs a `size-adjust` descriptor — Press Start 2P draws its capitals at a full em, 1.43x
// IBM Plex at the same `font-size`, which is why it looked enormous beside the others — and a
// descriptor can only be set on the `@font-face` rule itself. Fontsource's own CSS carries none, so
// the rules are written locally against its `.woff2` files. Still bundled rather than fetched:
// `font-src 'self'` admits no external font host, and weakening the CSP for typography is not a
// trade this app makes. All OFL-1.1, all Latin only — Thai falls back to IBM Plex Sans Thai above,
// which is why that stack is never removed from any of the switched families.
import "./globals.css";
import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/app/site-header";
import { FONT_COOKIE, fontChoiceFrom } from "@/lib/ui-font";
import {
  SYSTEM_DARK,
  THEME_COOKIE,
  THEME_GROUNDS,
  colorSchemeFor,
  themeChoiceFrom
} from "@/lib/ui-theme";

export const metadata: Metadata = {
  title: "Private Ledger",
  description: "A local-first Thai bank statement and slip ledger.",
  robots: { index: false, follow: false },
  // Declares the share target that lets a bank app hand a slip straight to this one
  // (D-050, PLAN task 20). Installing needs HTTPS, so it is inert until hosting lands —
  // task 19, which is why 20 can be built now but not used from a phone yet.
  manifest: "/manifest.webmanifest"
};

// **`themeColor` must equal the chosen scheme's `--mist`, and it is the one colour no screenshot can
// check.** It tints the browser's own chrome around the page on a phone, so a stale value shows as a
// band in the wrong colour above the app — invisible to the headless audit, which never renders
// chrome. It sat at the pre-2026-08-21 blue-grey for a full day after the palette changed.
//
// **A function rather than a constant since 2026-09-01**, because there are four schemes and the
// answer depends on a cookie. `generateViewport` may read one; the static export could not, so a
// constant here would have gone stale for three of the four the moment dark landed —
// `THEME_GROUNDS` is asserted against `globals.css` in `tests/ui-theme.test.ts` so the two cannot
// drift the way they did before.
//
// Under `system` the meta gets **both** values with media conditions attached, which is the only way
// to answer a question whose answer the server does not know. A pinned scheme gets one colour and
// `colorScheme` names itself, so choosing Daylight on a dark-OS phone gets light native controls
// rather than dark ones on a cream page.
export async function generateViewport(): Promise<Viewport> {
  const theme = themeChoiceFrom((await cookies()).get(THEME_COOKIE)?.value);
  return {
    colorScheme: colorSchemeFor(theme),
    themeColor: theme === "system"
      ? [
          { media: "(prefers-color-scheme: light)", color: THEME_GROUNDS.light },
          { media: "(prefers-color-scheme: dark)", color: THEME_GROUNDS[SYSTEM_DARK] }
        ]
      : THEME_GROUNDS[theme]
  };
}

// The shell — header, main, footer — belongs to every route since routing landed, so it
// lives here instead of inside a page component. Each route renders its own sections into
// `main` and owns its own state; nothing is shared across a navigation but the session
// cookie, which is what makes the split honest rather than cosmetic.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // **Resolved on the server, before first paint.** Holding the choice in browser storage instead
  // would paint the default face and then swap, and the only cure is a blocking inline script this
  // app's CSP would have to admit. Read through `fontChoiceFrom`, which is total over untrusted
  // input: a cookie is client-supplied, and the only thing that can reach this attribute is one of
  // four known tokens. (`lib/ui-font.ts` carries the full reasoning — it can name the API this file
  // may not, because the guard against client storage covers `app/` and nothing else.)
  // One read for both preferences: `cookies()` is a request-scoped store, so asking twice would be
  // two awaits for one answer. The scheme goes through `themeChoiceFrom`, total over untrusted input
  // for the same reason and in the same shape as the face beside it (`lib/ui-theme.ts`).
  const jar = await cookies();
  const font = fontChoiceFrom(jar.get(FONT_COOKIE)?.value);
  const theme = themeChoiceFrom(jar.get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-font={font} data-theme={theme}>
      <body>
        <nav aria-label="Skip links">
          <a className="skip-link" href="#main">Skip to content</a>
        </nav>
        <div className="app-shell">
          <SiteHeader font={font} theme={theme} />
          <main id="main">{children}</main>
          <footer><span>Private Ledger</span><p>No analytics · no session replay · no financial response caching</p></footer>
        </div>
      </body>
    </html>
  );
}
