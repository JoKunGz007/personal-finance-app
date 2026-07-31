import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

// `connect-src` names the configured Supabase origin rather than a hard-coded loopback one,
// so a hosted deployment reaches its database without the policy being widened to get there
// (`lib/security-headers.ts`). Read at build time, which is also when `NEXT_PUBLIC_*` are
// inlined — the header and the client therefore always agree about which project this build
// talks to.
const headers = securityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers }];
  }
};

export default nextConfig;
