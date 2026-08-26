import type { z } from "zod";

/**
 * Every route answers a failure as `{ error }`. Reading it back rather than showing a
 * status code matters most on the recovery path, where the server's own wording is
 * the only guidance a person has.
 *
 * **Prefer `ledgerRequest` to calling this directly.** Its parameter is `unknown`, so handing it
 * the wrong thing type-checks and fails *silently* — which has happened: passing the `Response`
 * instead of its parsed body made every refusal show the generic sentence, including the two the
 * capture route words specifically (`GOTCHAS.md`). `ledgerRequest` never gives a caller the chance,
 * because the caller never holds an unparsed body. This stays exported for the write paths that
 * have not moved yet.
 */
export function readError(body: unknown, fallback: string): string {
  return typeof body === "object" && body !== null && "error" in body
    ? String((body as { error: unknown }).error)
    : fallback;
}

/**
 * Why a request did not produce a value. Three genuinely different things, which the owner needs
 * told apart because each one sends him somewhere different:
 *
 * - `unreachable` — nothing answered, or a **2xx** answer was not JSON. **Diagnose the stack.**
 * - `refused` — the route answered with a failing status. **Read `why`.**
 * - `off-contract` — the route answered with JSON that its schema rejects. **Diagnose the build.**
 *
 * **The status wins over the body, and the boundary is worth stating exactly**, because this doc
 * said "or what answered was not JSON" until `/code-review` caught that the code disagrees with it.
 * A non-2xx answer that is *also* not JSON — a platform error page, which is the common case — is
 * `refused`, not `unreachable`, because the status is the more specific fact and the caller's
 * `fallback` is what gets shown. It is pinned by a test rather than left to this sentence.
 */
export type WireFailureKind = "unreachable" | "refused" | "off-contract";

export type WireResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly kind: WireFailureKind; readonly why: string };

/**
 * Wording for each way a request can fail. `fallback` is the only one required, because a route
 * that refuses usually supplies its own sentence and the other two are rare enough to share it.
 */
type WireWording = {
  /** Shown when the route refuses without a readable `{ error }` of its own. */
  readonly fallback: string;
  /** Shown when nothing answered or the answer was not JSON. Defaults to `fallback`. */
  readonly unreachable?: string;
  /** Shown when the answer was JSON but its schema rejected it. Defaults to `fallback`. */
  readonly offContract?: string;
};

/**
 * Stands in for a body that could not be parsed, so "not JSON" is distinguishable from a route
 * that legitimately answered `null`. A unique symbol rather than `null` or a string, because both
 * of those are values a route could return.
 */
const UNREADABLE: unique symbol = Symbol("unreadable-body");

/**
 * Issues one request to this app's own API and returns a value that satisfies `schema`, or the
 * reason it could not.
 *
 * **This is the seam the client tier did not have.** Before it, all 26 `fetch` call sites in
 * `app/` open-coded the same five steps — issue, survive a non-JSON body, check `ok`, read the
 * route's own error, validate against the contract — and each site re-decided them independently.
 * They had already diverged: `app/transactions-view.tsx` guarded three of its five loads with
 * `.catch(() => null)` and left the **two blocking ones** unguarded, so a platform error page on
 * the path that matters most reported as "the ledger could not be reached" and sent the owner to
 * check Docker while the route had in fact answered.
 *
 * **`schema` is a required parameter and that is the point.** Validation cannot be the step a
 * hurried call site leaves out, which it was at nine of twenty-six.
 *
 * **`cache: "no-store"` is the default** because every existing call site that named a cache mode
 * named that one, and a ledger read served from a cache is a wrong answer rather than a fast one.
 * `init` can still override it.
 *
 * The order of the checks is itself the contract: `ok` is read **before** the schema, so a route
 * that refuses in its own words is never reported as a contract failure.
 */
export async function ledgerRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  wording: WireWording,
  init?: RequestInit
): Promise<WireResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", ...init });
  } catch {
    // A transport failure carries nothing worth quoting — no status, no body, and the browser's own
    // message is about sockets rather than about a ledger.
    return { ok: false, kind: "unreachable", why: wording.unreachable ?? wording.fallback };
  }

  // **Never `.json()` bare.** A route that fails inside the platform rather than inside this app
  // answers with HTML, and a bare parse turns that into a thrown error the caller then attributes
  // to whatever its outer `catch` happens to say.
  const body: unknown = await response.json().catch(() => UNREADABLE);

  if (!response.ok) {
    return {
      ok: false,
      kind: "refused",
      // `body` is `UNREADABLE` rather than parsed JSON when the answer was not JSON at all;
      // `readError` finds no `error` key on it and falls through to the caller's wording, which
      // is the right outcome for both cases.
      why: readError(body, wording.fallback)
    };
  }

  if (body === UNREADABLE) {
    return { ok: false, kind: "unreachable", why: wording.unreachable ?? wording.fallback };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, kind: "off-contract", why: wording.offContract ?? wording.fallback };
  }
  return { ok: true, data: parsed.data };
}
