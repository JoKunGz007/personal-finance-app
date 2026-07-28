/**
 * Every route answers a failure as `{ error }`. Reading it back rather than showing a
 * status code matters most on the recovery path, where the server's own wording is
 * the only guidance a person has.
 */
export function readError(body: unknown, fallback: string): string {
  return typeof body === "object" && body !== null && "error" in body
    ? String((body as { error: unknown }).error)
    : fallback;
}
