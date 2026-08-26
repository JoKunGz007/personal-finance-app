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

export const metadata: Metadata = {
  title: "Private Ledger",
  description: "A local-first Thai bank statement and slip ledger.",
  robots: { index: false, follow: false },
  // Declares the share target that lets a bank app hand a slip straight to this one
  // (D-050, PLAN task 20). Installing needs HTTPS, so it is inert until hosting lands —
  // task 19, which is why 20 can be built now but not used from a phone yet.
  manifest: "/manifest.webmanifest"
};

// **`themeColor` must equal `--mist`, and it is the one colour no screenshot can check.** It tints
// the browser's own chrome around the page on a phone, so a stale value shows as a band in the wrong
// colour above the app — invisible to the headless audit, which never renders chrome. It sat at the
// pre-2026-08-21 blue-grey for a full day after the palette changed.
//
// `light` rather than `light dark`: this app declares one scheme (D-137), and the declaration is
// what makes a date picker and a select dropdown render light on a device whose OS is dark. Without
// it those controls come back dark against a cream page.
export const viewport: Viewport = { colorScheme: "light", themeColor: "#fefae0" };

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
  const font = fontChoiceFrom((await cookies()).get(FONT_COOKIE)?.value);
  return (
    <html lang="en" data-font={font}>
      <body>
        <nav aria-label="Skip links">
          <a className="skip-link" href="#main">Skip to content</a>
        </nav>
        <div className="app-shell">
          <SiteHeader font={font} />
          <main id="main">{children}</main>
          <footer><span>Private Ledger</span><p>No analytics · no session replay · no financial response caching</p></footer>
        </div>
      </body>
    </html>
  );
}
