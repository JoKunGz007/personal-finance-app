import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { readCardWordsWithVision } from "@/lib/notification-card-vision";

export const dynamic = "force-dynamic";

/**
 * Reading a card screenshot with Google Cloud Vision (`PLAN.md` task 35, D-120).
 *
 * **This route exists so the key does not go to the browser.** Calling Vision from the page would
 * mean shipping the key in a `NEXT_PUBLIC_` value — readable by anyone who loads the app — and
 * widening `connect-src` to name `vision.googleapis.com`. Relaying through this app's own origin
 * keeps the credential in the deployment's environment and leaves the strict CSP untouched
 * (D-058). The cost, stated plainly because it is real: the screenshot now passes through this
 * server as well as through Google, so **nothing here may log the image or the words**.
 *
 * It is the only route that reads a request body which is not JSON, and the only one that talks to
 * a third party. Both are deliberate and both are why the guards below are stricter than the
 * happy path needs.
 *
 * ## What it does not do
 *
 * It stores nothing, in the database or anywhere else — the same rule as the captured image itself
 * (D-050). It returns **words and boxes**, never a decision about what they mean: the grammar
 * (`lib/notification-card-ocr.ts`) and the strict pre-fill (`lib/notification-card-prefill.ts`)
 * both run in the browser, unchanged, on whichever engine produced the words. So no figure this
 * route relays can reach a stored value except through `parseThb`, the digit guard and
 * blank-on-failure, exactly as before Vision (D-114, D-118).
 *
 * ## Why a failure is not a fallback
 *
 * Any refusal here leaves every box blank and the owner types the card, which is what happened
 * until 2026-08-16. There is deliberately no local second attempt: the pre-fill is blank-on-failure
 * either way, so a fallback would buy a partial fill at the price of two engines behind one
 * grammar — and `findCards` is already known to depend on where an engine breaks a Thai run
 * (D-119). One engine, one measurement.
 */

/** Vision decodes these, and refusing anything else stops a non-image being relayed onward. */
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Four megabytes, which is a ceiling on what this app **forwards** rather than a Vision limit.
 *
 * A phone screenshot is a few hundred kilobytes; Vision itself accepts far more. The bound exists
 * because this route hands a caller's bytes to a third party, and an unbounded relay is worth
 * closing whether or not anything today would reach it.
 *
 * **Be precise about what it does not do.** The declared length is checked *before* the body is
 * read, so an oversized upload is refused without being buffered — but a request that declares no
 * length, or lies about it, is still read whole before the second check can fire. Closing that
 * properly means streaming the body and counting as it arrives, which is not worth writing here:
 * the caller has already passed `strongOwnerClient`, so this is the single owner of a
 * single-owner app, and the platform caps a serverless request body below this figure anyway.
 * **The bound protects the third party from this app, not this app from its caller** — and that
 * is the honest description of it rather than the one the first draft of this comment gave.
 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ACCEPTED_TYPES.has(contentType)) {
    return routeError("A card screenshot must be a PNG, JPEG or WebP image.", 415);
  }

  // Checked from the declared length first, so an oversized upload is refused without being read
  // into memory. `Content-Length` is absent on a chunked request and can be wrong on any request,
  // which is why the same bound is applied again below against the bytes actually received.
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    return routeError("That screenshot is too large to read. Crop it to the card and try again.", 413);
  }

  const body = await request.arrayBuffer().catch(() => null);
  if (!body) return routeError("The card screenshot could not be read.", 400);
  if (body.byteLength === 0) return routeError("The card screenshot is empty.", 422);
  if (body.byteLength > MAX_IMAGE_BYTES) {
    return routeError("That screenshot is too large to read. Crop it to the card and try again.", 413);
  }

  // Read at the point of use rather than at module scope, so a deployment that adds the key needs
  // no rebuild — and so the absence of a key is a runtime refusal the owner can act on rather than
  // a build that fails somewhere unrelated.
  const apiKey = process.env.GOOGLE_VISION_KEY ?? "";
  const read = await readCardWordsWithVision(new Uint8Array(body), apiKey);
  if (!read.ok) {
    // Three causes, three sentences, because they call for different things from the owner: a
    // missing key is the deployment's problem, an unreachable service is worth retrying, and a
    // refusal is not. None of them echoes anything Vision said — its messages can quote the image.
    if (read.code === "NOT_CONFIGURED") {
      return routeError("The card reader is not configured on this deployment. Type the card's values.", 503);
    }
    if (read.code === "UNREACHABLE") {
      return routeError("The card reader could not be reached. Check your connection, or type the card's values.", 503);
    }
    return routeError("The card reader could not read this image. Type the card's values.", 502);
  }

  return Response.json({ words: read.words }, { headers: noStoreHeaders });
}
