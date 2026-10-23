import { describe, expect, test } from "vitest";
import { summarizeFailures, verifyTotals, type PrintedTotals } from "@/lib/statement-checks";

// Every value is invented (`docs/FIXTURE_POLICY.md`).

const printed: PrintedTotals = { withdrawalCount: 2, withdrawalTotal: "15000", depositCount: 1, depositTotal: "50000" };
const read = { withdrawal: { rows: 2, minor: 15000n }, deposit: { rows: 1, minor: 50000n } };

describe("verifyTotals", () => {
  test("agreeing counts and totals, or none printed, pass", () => {
    expect(verifyTotals(printed, read)).toBeNull();
    expect(verifyTotals({ withdrawalCount: null, withdrawalTotal: null, depositCount: null, depositTotal: null }, read)).toBeNull();
  });
  test("a count mismatch names both counts", () => {
    expect(verifyTotals(printed, { ...read, deposit: { rows: 3, minor: 50000n } }))
      .toEqual({ ok: false, code: "SUMMARY_MISMATCH", message: "The statement counts 1 deposit rows but the reader found 3." });
  });
  test("a total mismatch reports the gap's masked shape, the same in either sign, and never the figure", () => {
    const messages = [14000n, 16000n].map((minor) => {
      const result = verifyTotals(printed, { ...read, withdrawal: { rows: 2, minor } });
      return result && !result.ok && result.code === "SUMMARY_MISMATCH" ? result.message : "";
    });
    expect(messages[0]).toMatch(/^The statement's printed withdrawal total does not match the rows read; the gap is /u);
    expect(messages[0]).not.toMatch(/\d/u);
    expect(messages[1]).toBe(messages[0]);
  });
  test("withdrawals are checked before deposits", () => {
    const result = verifyTotals(printed, { withdrawal: { rows: 9, minor: 15000n }, deposit: { rows: 9, minor: 50000n } });
    expect(result && !result.ok && result.message).toContain("withdrawal");
  });
});

describe("summarizeFailures", () => {
  test("one failure keeps its code and message", () => {
    expect(summarizeFailures([{ code: "INVALID_ROW_CONTENT", message: "Page 1 row 4: bad date." }]))
      .toEqual({ ok: false, code: "INVALID_ROW_CONTENT", message: "1 row could not be read. Page 1 row 4: bad date." });
  });
  test("repeats group by message without the location; the first code wins", () => {
    const result = summarizeFailures([
      { code: "INVALID_ROW_CONTENT", message: "Page 1 row 4: bad date." },
      { code: "AMBIGUOUS_ROW_GEOMETRY", message: "Page 2 row —: two amounts." },
      { code: "INVALID_ROW_CONTENT", message: "Page 3 row 9: bad date." }
    ]);
    expect(result).toEqual({
      ok: false,
      code: "INVALID_ROW_CONTENT",
      message: "3 rows could not be read, in 2 distinct cases. 2× Page 1 row 4: bad date. | Page 2 row —: two amounts."
    });
  });
  test("past six classes, the rest are counted, not shown", () => {
    const failures = Array.from({ length: 8 }, (_, index) => ({ code: "INVALID_ROW_CONTENT" as const, message: `Page 1 row ${index}: case ${index}.` }));
    const result = summarizeFailures(failures);
    const message = result.ok ? "" : result.message;
    expect(message).toMatch(/^8 rows could not be read, in 8 distinct cases\. /u);
    expect(message).toContain("case 5.");
    expect(message).not.toContain("case 6.");
    expect(message).toMatch(/ \| and 2 further cases not shown$/u);
  });
});
