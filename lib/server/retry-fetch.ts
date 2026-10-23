/**
 * One retry for a read the network or the upstream dropped (PLAN Open item 1: intermittent
 * "could not be loaded in full" 500s on production).
 *
 * Only GET and HEAD are retried: they carry no body and change nothing, so sending one twice is
 * safe. Every write in this app is a POST to an RPC and is never retried here, idempotent or not —
 * a POST whose response was lost may already have run. A 4xx is an answer, not a fault, and is
 * returned as is. An aborted request is not retried.
 */
const RETRY_STATUSES = new Set([500, 502, 503, 504]);
export const RETRY_DELAY_MS = 200;

export function retryingFetch(base: typeof fetch = fetch, delayMs = RETRY_DELAY_MS): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" && method !== "HEAD") return base(input, init);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
    // Value-free: the method and status only. The URL carries table names and filter values.
    const retry = async (reason: string | number) => {
      console.warn("retryingFetch retry", { method, reason });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      signal?.throwIfAborted();
      return base(input, init);
    };
    let response: Response;
    try {
      response = await base(input, init);
    } catch (error) {
      if (signal?.aborted) throw error;
      return retry("network");
    }
    if (!RETRY_STATUSES.has(response.status)) return response;
    // Release the discarded answer's connection rather than leaving it to the garbage collector.
    await response.body?.cancel().catch(() => {});
    return retry(response.status);
  };
}
