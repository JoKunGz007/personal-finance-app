import { cookies } from "next/headers";
import { noStoreHeaders, routeError } from "@/lib/server/supabase";
import { NAV_COOKIE, NAV_COOKIE_MAX_AGE, navPreferenceRequestSchema } from "@/lib/ui-nav";

export const dynamic = "force-dynamic";

/**
 * Stores how this device lays out the section nav at phone width.
 *
 * A sibling of `/api/v1/ui/theme` and `/api/v1/ui/font`, with its own strict schema rather than a
 * second field on either. **Deliberately not owner-bound**, for the same reason they are not: it
 * reaches no database, only reads a two-value enum and writes it back as a cookie on the caller's own
 * response. The closed set is the defence; its whole journey ends as an attribute on `<html>`.
 * `httpOnly` because only the layout reads it, server-side, before first paint.
 */
export async function POST(request: Request) {
  const parsed = navPreferenceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("That is not a nav layout this app offers.", 422, parsed.error.flatten());

  const store = await cookies();
  store.set(NAV_COOKIE, parsed.data.nav, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: NAV_COOKIE_MAX_AGE
  });

  return Response.json({ nav: parsed.data.nav }, { headers: noStoreHeaders });
}
