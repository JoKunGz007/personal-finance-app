import { cookies } from "next/headers";
import { noStoreHeaders, routeError } from "@/lib/server/supabase";
import {
  FONT_COOKIE,
  FONT_COOKIE_MAX_AGE,
  fontPreferenceRequestSchema
} from "@/lib/ui-font";

export const dynamic = "force-dynamic";

/**
 * Stores which typeface this device draws the interface in.
 *
 * **Deliberately not owner-bound, and that is the one thing worth arguing here.** Every other route
 * under `/api/v1/` opens with `strongOwnerClient()` because it reaches records. This one reaches
 * nothing: it reads a four-value enum and writes it straight back as a cookie on the caller's own
 * response. There is no database client, no RPC and no query — so there is no boundary for an owner
 * check to defend, and requiring aal2 to change a typeface would only mean the signed-out page could
 * not be made legible.
 *
 * What stands in for that check is the **closed set**. `fontPreferenceRequestSchema` is a strict
 * `z.enum`, so the only thing this can ever write is one of four known tokens; an unknown key is
 * refused rather than ignored, because a caller sending `{font, theme}` has a broken model of this
 * endpoint and answering it as though the extra key were fine is how a second preference gets
 * half-built. `lib/ui-font.ts` carries the reasoning for the cookie over a row.
 *
 * `httpOnly` because nothing in the browser reads it — the layout does, server-side, before first
 * paint. That is also what keeps `app/` free of client storage APIs and free of the blocking inline
 * script a browser-storage version would need the CSP to admit. (Naming that API here, even to rule
 * it out, fails the guard that forbids it — see `lib/ui-font.ts`.)
 */
export async function POST(request: Request) {
  const parsed = fontPreferenceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("That is not a typeface this app offers.", 422, parsed.error.flatten());

  const store = await cookies();
  store.set(FONT_COOKIE, parsed.data.font, {
    httpOnly: true,
    sameSite: "lax",
    // Set on http://localhost during development, https everywhere it is deployed. Hardcoding
    // `secure: true` would make the cookie silently never stick on the local machine.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: FONT_COOKIE_MAX_AGE
  });

  // The face that was actually stored, so the client renders from the server's word rather than
  // from what it hoped it sent.
  return Response.json({ font: parsed.data.font }, { headers: noStoreHeaders });
}
