/**
 * The one announcement the session makes to the rest of the page.
 *
 * **Why an event and not a second reader of the session.** `app/owner-access.tsx` owns the whole
 * sign-in sequence on purpose, and says why in its own words: splitting it would mean "two places
 * reading the same Supabase state and disagreeing about it whenever one refreshed and the other
 * did not". That reasoning did not stop applying when the ledger started loading on arrival
 * (PLAN task 43) — so the ledger does not ask whether anyone is signed in. It is told by the
 * component that already knows.
 *
 * **What it is for.** Signing in does not navigate: the owner can land on `/ledger` signed out,
 * have the automatic load answered 401, and complete a sign-in without anything on the page below
 * changing. Without this the table stays empty until a manual Reload — the toll task 43 removed,
 * reintroduced at the exact moment the owner has just proved who he is.
 *
 * **It is a counter and not a flag, because the two halves race and the listener loses.** The
 * refusal that makes a page want this news arrives over the network; the sign-in that produces
 * the news happens locally. On the path this was written for — land signed out, sign in, both in
 * under a second — the announcement fires *before* the 401 lands, so a listener subscribing on
 * the refusal subscribes to an event that has already happened and waits forever. That is not a
 * hypothetical: it is what the owner suite caught. A subscriber therefore reads the count as well
 * as listening, and acts on either.
 *
 * The count is also what stops a retry loop. A page that retries and is refused *again* wants to
 * stop, not to try once more for the same reason; comparing against the generation it last acted
 * on gives it "once per announcement" without any timer or attempt limit.
 */
export const OWNER_READY_EVENT = "private-ledger:owner-ready";

let generation = 0;

/**
 * How many times the owner has been announced ready since this document loaded. `0` means never.
 *
 * It deliberately does **not** decrease on sign-out. What a caller asks of it is "is there news
 * since I last looked", and a sign-out is not news that would repair a refused read — the retry
 * it would trigger would simply be refused again, correctly.
 */
export function ownerReadyGeneration(): number {
  return generation;
}

/**
 * Called when an aal2 owner session has just become available **without a navigation**.
 *
 * **There are two producers and both are needed.** `app/owner-access.tsx` announces when its own
 * state reaches `ready`, which is the real login's TOTP challenge completing on whatever page the
 * owner happened to be on. `app/site-header.tsx` announces after the development sign-in route
 * mints one, which is the path every browser suite drives — and it does not go through
 * `OwnerAccess` at all, so that component's state stays `signed-out` behind it. Announcing from
 * only one of them leaves the other silent, which is exactly the failure the owner suite caught.
 *
 * Google sign-in needs no announcement: it returns through `/auth/callback` and the full page
 * load that follows carries the session into the first render.
 */
export function announceOwnerReady() {
  generation += 1;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OWNER_READY_EVENT));
}

/**
 * Subscribes to it, returning the unsubscribe. Shaped for `useEffect` so a caller cannot
 * accidentally leave a listener behind on a component that has gone.
 *
 * **Subscribing is not enough on its own** — see the note above. Read `ownerReadyGeneration()`
 * once at subscription time too, or the announcement that already fired is missed.
 */
export function onOwnerReady(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OWNER_READY_EVENT, listener);
  return () => window.removeEventListener(OWNER_READY_EVENT, listener);
}

/** Test-only: resets the counter so one spec's announcements cannot leak into the next. */
export function resetOwnerReadyForTests() {
  generation = 0;
}
