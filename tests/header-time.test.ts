import { describe, expect, test, vi } from "vitest";
import { resolveHeaderTime } from "@/lib/browser/header-time";
import type { OcrWord } from "@/lib/slip-ocr";

// Every value is invented (docs/FIXTURE_POLICY.md).
const BOX = { left: 10, top: 10, right: 70, bottom: 40 };
const word = (text: string): OcrWord => ({ text, left: 10, right: 60, top: 10, bottom: 30 });
const BLOB = new Blob(["x"]);

describe("resolveHeaderTime", () => {
  test("a box that reads one time answers it, enlarged 2x as a time crop", async () => {
    const reread = vi.fn().mockResolvedValue({ ok: true, words: [word("14:35")] });
    expect(await resolveHeaderTime(BLOB, BOX, reread)).toEqual({ ok: true, answer: "14:35" });
    expect(reread).toHaveBeenCalledWith(BLOB, BOX, { field: "time", scale: 2 });
  });

  test("no box answers null without reading anything", async () => {
    const reread = vi.fn();
    expect(await resolveHeaderTime(BLOB, null, reread)).toEqual({ ok: true, answer: null });
    expect(reread).not.toHaveBeenCalled();
  });

  test("a failed re-read is a refusal carrying its reason, not a blank answer", async () => {
    const reread = vi.fn().mockResolvedValue({ ok: false, why: "The reader could not be reached." });
    expect(await resolveHeaderTime(BLOB, BOX, reread)).toEqual({ ok: false, why: "The reader could not be reached." });
  });

  test("a read with no single time answers null", async () => {
    const reread = vi.fn().mockResolvedValue({ ok: true, words: [word("hello")] });
    expect(await resolveHeaderTime(BLOB, BOX, reread)).toEqual({ ok: true, answer: null });
  });
});
