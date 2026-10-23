/**
 * One retry for a read the network or the upstream dropped (PLAN Open item 1: intermittent
 * "could not be loaded in full" 500s on production).
 *
 * Rule 1: only GET and HEAD are retried on a 500/502/503/504 or a network failure: they carry no
 * body and change nothing, so sending one twice is safe. A POST (every write in this app is a POST
 * to an RPC) is never retried for these, idempotent or not — a POST whose response was lost may
 * already have run. A 4xx is an answer, not a fault, and is returned as is. An aborted request is
 * not retried.
 *
 * Rule 2, any method: a 401 whose JSON body has `code: "PGRST303"` is sent once more. PostgREST
 * validates the JWT before running any SQL, so this refusal means nothing ran and resending even a
 * POST is safe. Seen on production 2026-10-24 on one RPC while eight sibling reads with the same
 * token passed. The second answer is returned whatever it is; there is never a third send.
 */
const RETRY_STATUSES = new Set([500, 502, 503, 504]);
export const RETRY_DELAY_MS = 200;

async function isJwtRefusal(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    const body = (await response.clone().json()) as { code?: unknown } | null;
    return body?.code === "PGRST303";
  } catch {
    return false;
  }
}

export function retryingFetch(base: typeof fetch = fetch, delayMs = RETRY_DELAY_MS): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const readOnly = method === "GET" || method === "HEAD";
    const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
    // Value-free: the method and status only. The URL carries table names and filter values.
    // Sending again with `base(input, init)` assumes a replayable body: supabase-js sends string
    // bodies, not streams.
    const retry = async (reason: string | number) => {
      console.warn("retryingFetch retry", { method, reason });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      signal?.throwIfAborted();
      return base(input, init);
    };
    if (!readOnly) {
      const response = await base(input, init);
      if (!(await isJwtRefusal(response))) return response;
      await response.body?.cancel().catch(() => {});
      return retry("PGRST303");
    }
    let response: Response;
    try {
      response = await base(input, init);
    } catch (error) {
      if (signal?.aborted) throw error;
      return retry("network");
    }
    if (RETRY_STATUSES.has(response.status)) {
      // Release the discarded answer's connection rather than leaving it to the garbage collector.
      await response.body?.cancel().catch(() => {});
      return retry(response.status);
    }
    if (!(await isJwtRefusal(response))) return response;
    await response.body?.cancel().catch(() => {});
    return retry("PGRST303");
  };
}
