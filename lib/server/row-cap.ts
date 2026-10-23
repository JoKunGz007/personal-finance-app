/**
 * PostgREST caps a plain select at `max_rows = 1000` and says nothing when it does. With
 * `select(cols, { count: "exact" })` the count is computed in the same statement as the rows, so
 * an array shorter than the count means rows were cut. A null count (none sent) is treated as
 * incomplete: fail closed rather than show a list that may be truncated.
 */
export function isComplete(read: { data: readonly unknown[] | null; count: number | null }): boolean {
  return typeof read.count === "number" && (read.data?.length ?? 0) === read.count;
}

export const PAGE_SIZE = 1000;

/**
 * The message of a PostgREST JWT error (code PGRST3xx), cut to 120 characters, as a spreadable
 * object; empty for every other error. PGRST3xx messages are fixed auth texts (e.g. "JWT expired")
 * that quote no row values; any other message can quote one and stays unlogged.
 */
export function authErrorMessage(error: unknown): { message?: string } {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  if (typeof e.code === "string" && e.code.startsWith("PGRST3") && typeof e.message === "string") {
    return { message: e.message.slice(0, 120) };
  }
  return {};
}

type Page = { data: readonly unknown[] | null; error: unknown; count: number | null };

/**
 * Reads every row past PostgREST's max_rows by paging. `page(from, to)` must already ask for
 * `{ count: "exact" }` and carry a stable unique `.order(...)`, then apply `.range(from, to)`
 * itself. Fails closed (`ok: false`) on any error, a missing count, a count that changes between
 * pages, or a short page before the count is reached: a cut list is never returned as a whole one.
 */
export async function readAll<Row>(
  page: (from: number, to: number) => PromiseLike<Page>,
  label = "read"
): Promise<{ ok: true; data: Row[] } | { ok: false }> {
  // Value-free: an error's code and HTTP status only, never its message (it can quote a value).
  // Exception: PGRST3xx messages are fixed auth texts (e.g. "JWT expired") that quote no row values.
  const fail = (reason: string, error?: unknown) => {
    const e = (error ?? {}) as { code?: unknown; status?: unknown; name?: unknown };
    console.error("readAll failed", { label, reason, code: e.code ?? e.name ?? null, status: e.status ?? null, ...authErrorMessage(error) });
    return { ok: false as const };
  };
  const rows: Row[] = [];
  let total: number | null = null;
  for (;;) {
    const read: Page = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (read.error) return fail("error", read.error);
    if (typeof read.count !== "number" || !Array.isArray(read.data)) return fail("no count or rows");
    if (total === null) total = read.count;
    else if (read.count !== total) return fail("count changed");
    rows.push(...(read.data as Row[]));
    if (rows.length === total) return { ok: true, data: rows };
    if (rows.length > total || read.data.length < PAGE_SIZE) return fail("short page");
  }
}
