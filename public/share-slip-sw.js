// The share-to-app receiver, and the only reason this app has a service worker at all.
//
// A Web Share Target with `method: POST` delivers the shared image as a real network
// request to `/share-slip`. Letting that request reach the server would upload the slip
// image — precisely what D-050 forbids, and the decision that keeps a backup 14 KB instead
// of hundreds of megabytes. So the worker intercepts the POST, keeps the file in a local
// Cache, and redirects to the app, which reads it back and decodes it on-device. The bytes
// never leave the phone.
//
// It caches **nothing else**. No app shell, no assets, no routes. That is deliberate: a
// caching service worker serving a stale build is one of the hardest failures to diagnose
// in this kind of app, and task 19 is about to rewrite routing. This worker has exactly one
// fetch handler and it matches exactly one URL.

const SHARE_CACHE = "shared-slip-v1";
const SHARE_PATH = "/share-slip";
const PENDING_URL = "/__pending-shared-slip";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== SHARE_PATH) return;

  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const file = form.get("slip");
      if (file && typeof file !== "string") {
        const cache = await caches.open(SHARE_CACHE);
        await cache.put(
          PENDING_URL,
          new Response(file, { headers: { "content-type": file.type || "application/octet-stream" } })
        );
        return Response.redirect("/?shared=slip", 303);
      }
    } catch {
      // Fall through to the plain redirect below. A share that could not be stashed must
      // still land the owner somewhere useful rather than on a failed navigation.
    }
    return Response.redirect("/?shared=none", 303);
  })());
});
