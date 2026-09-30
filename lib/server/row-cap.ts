/**
 * PostgREST caps a plain select at `max_rows = 1000` and says nothing when it does. With
 * `select(cols, { count: "exact" })` the count is computed in the same statement as the rows, so
 * an array shorter than the count means rows were cut. A null count (none sent) is treated as
 * incomplete: fail closed rather than show a list that may be truncated.
 */
export function isComplete(read: { data: readonly unknown[] | null; count: number | null }): boolean {
  return typeof read.count === "number" && (read.data?.length ?? 0) === read.count;
}
