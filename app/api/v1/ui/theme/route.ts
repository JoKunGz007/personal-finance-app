import { cookies } from "next/headers";
import { noStoreHeaders, routeError } from "@/lib/server/supabase";
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  themePreferenceRequestSchema
} from "@/lib/ui-theme";

export const dynamic = "force-dynamic";

/**
 * Stores which colour scheme this device draws the interface in.
 *
 * **A sibling of `/api/v1/ui/font` rather than a second field on it**, and that is the interesting
 * decision here. The font route's own docstring named `{font, theme}` as the exact shape its strict
 * schema refuses — written before this endpoint existed, and right: a caller sending both has a
 * broken model of an endpoint that stores one preference, and answering it as though the extra key
 * were fine is how a second preference gets half-built. So the second preference got built whole,
 * with its own closed set, instead of loosening the first.
 *
 * **Deliberately not owner-bound**, for the same reason the font route is not. Every other route
 * under `/api/v1/` opens with `strongOwnerClient()` because it reaches records. This one reaches
 * nothing: it reads a five-value enum and writes it straight back as a cookie on the caller's own
 * response. There is no database client, no RPC and no query, so there is no boundary for an owner
 * check to defend — and requiring aal2 to change a colour scheme would mean the signed-out page
 * could not be made readable on the device it is being read on.
 *
 * What stands in for that check is the **closed set**: the only thing this can ever write is one of
 * five known tokens, and the value's whole journey ends as an attribute on `<html>`.
 *
 * `httpOnly` because nothing in the browser reads it — the layout does, server-side, before first
 * paint. That is what keeps `app/` free of client storage APIs, and it is also what prevents a flash
 * of the light ground on a device that asked for dark.
 */
export async function POST(request: Request) {
  const parsed = themePreferenceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("That is not a colour scheme this app offers.", 422, parsed.error.flatten());

  const store = await cookies();
  store.set(THEME_COOKIE, parsed.data.theme, {
    httpOnly: true,
    sameSite: "lax",
    // Set on http://localhost during development, https everywhere it is deployed. Hardcoding
    // `secure: true` would make the cookie silently never stick on the local machine.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE
  });

  // The scheme that was actually stored, so the client renders from the server's word rather than
  // from what it hoped it sent.
  return Response.json({ theme: parsed.data.theme }, { headers: noStoreHeaders });
}
