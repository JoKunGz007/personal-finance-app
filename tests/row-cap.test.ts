import { describe, expect, it, vi } from "vitest";
import { readAll } from "@/lib/server/row-cap";

// A fake builder over `n` invented rows, honouring the range as PostgREST does (max_rows 1000).
function fake(n: number, tweak?: (call: number, page: { data: unknown[] | null; error: unknown; count: number | null }) => void) {
  let call = 0;
  const ranges: [number, number][] = [];
  const page = async (from: number, to: number) => {
    ranges.push([from, to]);
    const data = Array.from({ length: Math.max(0, Math.min(to, n - 1) - from + 1) }, (_, i) => from + i);
    const result = { data: data as unknown[] | null, error: null as unknown, count: n as number | null };
    call += 1;
    tweak?.(call, result);
    return result;
  };
  return { page, ranges };
}

describe("readAll", () => {
  it("returns zero rows as a complete empty read", async () => {
    expect(await readAll(fake(0).page)).toEqual({ ok: true, data: [] });
  });
  it("reads an exact multiple of the page size without a trailing request", async () => {
    const f = fake(2000);
    const r = await readAll<number>(f.page);
    expect(r.ok && r.data.length).toBe(2000);
    expect(f.ranges).toEqual([[0, 999], [1000, 1999]]);
  });
  it("reads 2,345 rows in order across three pages", async () => {
    const r = await readAll<number>(fake(2345).page);
    expect(r.ok && r.data).toEqual(Array.from({ length: 2345 }, (_, i) => i));
  });
  it("fails closed when the count drifts between pages", async () => {
    expect(await readAll(fake(2345, (c, p) => { if (c === 2) p.count = 2346; }).page)).toEqual({ ok: false });
  });
  it("fails closed on an error on page 2", async () => {
    expect(await readAll(fake(2345, (c, p) => { if (c === 2) { p.error = { message: "x" }; p.data = null; } }).page)).toEqual({ ok: false });
  });
  it("logs the message of a PGRST3xx error only", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fail = (error: unknown) => readAll(fake(5, (_c, p) => { p.error = error; p.data = null; }).page);
    await fail({ code: "PGRST303", message: "JWT expired" });
    await fail({ code: "42501", message: "permission denied for row 12345" });
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ code: "PGRST303", message: "JWT expired" });
    expect(spy.mock.calls[1]?.[1]).not.toHaveProperty("message");
    spy.mockRestore();
  });
  it("fails closed on a null count or a short page before the count", async () => {
    expect(await readAll(fake(5, (_c, p) => { p.count = null; }).page)).toEqual({ ok: false });
    expect(await readAll(fake(2345, (c, p) => { if (c === 2) p.data = (p.data as unknown[]).slice(0, 10); }).page)).toEqual({ ok: false });
  });
});
