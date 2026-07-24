import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Private Ledger",
  description: "A local-first Krungthai statement ledger.",
  robots: { index: false, follow: false }
};

export const viewport: Viewport = { colorScheme: "light dark", themeColor: "#eaf0f4" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Skip links">
          <a className="skip-link" href="#main">Skip to ledger</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
