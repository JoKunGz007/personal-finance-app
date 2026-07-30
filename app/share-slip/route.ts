export const dynamic = "force-dynamic";

// A fallback that should never run.
//
// `public/share-slip-sw.js` intercepts every POST to this path and keeps the shared image
// on the device, which is what D-050 requires. This handler exists only for the window in
// which the service worker is not yet controlling the page — and it deliberately **does not
// read the request body**, so the image is discarded rather than parsed, stored or logged.
//
// Note the residual exposure honestly: on a hosted deployment the bytes still travel to the
// server before this redirect is written, even though nothing here reads them. That is one
// of the things task 19 has to confirm when hosting lands (D-051), and it is why the share
// target is only reachable from an installed app whose worker is already registered.
export async function POST() {
  return Response.redirect(new URL("/?shared=none", process.env.APP_ORIGIN ?? "http://127.0.0.1:3000"), 303);
}
