import { describe, expect, it } from "vitest";
import { extractStatement } from "@/lib/krungthai-layout";
import { sourceRowCandidateSchema } from "@/lib/statement";
import { reconcileRows } from "@/lib/reconcile";
import { buildPage, validStatement } from "./fixtures/krungthai-layout-v1";

// Geometry reading for krungthai-layout-v1. The fixtures are invented
// (docs/FIXTURE_POLICY.md), so these prove the extractor is correct against the
// synthetic layout — not that a real Krungthai PDF matches it.

const onePage = (rows: Parameters<typeof buildPage>[0], options?: Parameters<typeof buildPage>[1]) =>
  extractStatement([buildPage(rows, options)]);

describe("krungthai frame extraction", () => {
  it("reads the statement frame from page one", () => {
    const result = extractStatement(validStatement);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;

    expect(result.frame).toEqual({
      bankCode: "KTB",
      // Carried on the frame rather than hard-coded at assembly, now that three readers
      // reach `assembleImportPayload` and the payload schema pins the pair.
      contractVersion: "krungthai-layout-v1",
      accountType: "Savings",
      accountLastFour: "7890",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      openingBalance: "1000000",
      closingBalance: "1025970",
      currency: "THB",
      balancesPrinted: true,
      // This fixture prints a summary block whose counts and totals agree with its rows.
      crossChecked: true
    });
  });

  it("derives the balances when the statement does not print them", () => {
    // A real statement prints no opening or closing balance in the frame (D-026), so the
    // opening figure is the first row's printed balance less that row's own movement.
    const rows = [
      { date: "02/01/69", time: "09:15", label: "in", deposit: "1,000.00", balance: "11,000.00" },
      { date: "05/01/69", time: "18:42", label: "out", withdrawal: "250.50", balance: "10,749.50" }
    ];
    const result = extractStatement([buildPage(rows, { frame: { opening: null, closing: null } })]);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;

    expect(result.frame.balancesPrinted).toBe(false);
    // 11,000.00 printed after a 1,000.00 deposit means 10,000.00 before it.
    expect(result.frame.openingBalance).toBe("1000000");
    expect(result.frame.closingBalance).toBe("1074950");
    // Derived balances must still reconcile the rows they were derived from.
    expect(reconcileRows(result.frame.openingBalance, result.rows).blockers).toEqual([]);
  });

  it("still rejects a printed closing balance that disagrees with the rows", () => {
    // The cross-check is skipped only when nothing was printed to check against.
    const rows = [{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,259.70" }];
    expect(extractStatement([buildPage(rows, { frame: { closing: "99,999.00" } })]))
      .toMatchObject({ ok: false, code: "CLOSING_BALANCE_MISMATCH" });
  });

  it("reads a time printed on its own line under the date", () => {
    // The date and time are separate printed lines in the same column (D-026).
    const page = buildPage([{ date: "02/01/69", time: "09:15", label: "x", deposit: "1.00", balance: "10,259.70" }]);
    const date = page.find((item) => item.str === "02/01/69");
    const time = page.find((item) => item.str === "09:15");
    expect(time!.y).toBeLessThan(date!.y);
    expect(time!.x).toBe(date!.x);

    const result = extractStatement([page]);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]!.sourceTime).toBe("09:15");
  });

  it("requires the currency in the frame block, not merely somewhere on page one", () => {
    // A real statement prints `Currency THB` above the grid (confirmed 2026-07-25). D-025 had
    // widened the search to the whole page, which accepted a statement in another currency
    // that merely mentioned THB — including inside a transaction description.
    const page = buildPage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,259.70" }]);
    const currency = page.find((item) => /THB/u.test(item.str));
    const header = page.find((item) => item.str === "Date/Time");
    expect(currency, "the fixture must print a currency marker").toBeDefined();
    expect(currency!.y).toBeGreaterThan(header!.y);
    expect(extractStatement([page])).toMatchObject({ ok: true });

    // The same marker moved below the grid no longer satisfies it.
    const moved = page.map((item) => item === currency ? { ...item, y: header!.y - 100 } : item);
    expect(extractStatement([moved])).toMatchObject({ ok: false, code: "UNSUPPORTED_CURRENCY" });
  });

  it("matches a frame label whose internal spacing is padded", () => {
    // A padded or non-standard space inside a label is invisible in any printed or
    // reported form, so an anchored pattern rejecting it looks like a missing field.
    const page = buildPage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,259.70" }])
      .map((item) => item.str === "Account Number" ? { ...item, str: "Account  Number" } : item);
    const result = extractStatement([page]);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.frame.accountLastFour).toBe("7890");
  });

  it("does not let one frame field swallow the next field's value", () => {
    // The fixture prints `Branch Code 555` on the account-number line, as a real
    // statement does. Reading everything to the right of a label mixed those digits in,
    // which produced a wrong but entirely plausible account suffix.
    const page = buildPage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,259.70" }]);
    expect(page.some((item) => item.str === "Branch Code"), "the fixture must print a second pair").toBe(true);

    const result = extractStatement([page]);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    // 7890 from the account number, never 5555 or 8905 from the branch code beside it.
    expect(result.frame.accountLastFour).toBe("7890");
  });

  it("finds the grid header even when a frame label matches a column heading", () => {
    // The fixture prints a `Branch` frame label above the grid, as a real statement does,
    // and `Branch` is also a column heading. Taking the frame/grid boundary from the first
    // line matching *any* column anchor put it on that label's line, so every frame field
    // printed below it was cut out of the frame region — the account number among them.
    const page = buildPage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,259.70" }]);
    const heading = page.find((item) => item.str === "Date/Time")!;
    const strayLabel = page.filter((item) => item.str === "Branch" && item.y > heading.y);
    expect(strayLabel, "the fixture must print a bare `Branch` label above the grid").toHaveLength(1);
    // It has to sit *between* frame fields: the fields above a stray match still read,
    // which is what made a boundary bug look like a per-field wording problem.
    const accountNumber = page.find((item) => item.str === "Account Number")!;
    const accountType = page.find((item) => item.str === "Account Type")!;
    expect(accountNumber.y).toBeLessThan(strayLabel[0]!.y);
    expect(accountType.y).toBeGreaterThan(strayLabel[0]!.y);

    const result = extractStatement([page]);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.frame.accountLastFour).toBe("7890");
    expect(result.frame.accountType).toBe("Savings");
    expect(result.frame.periodEnd).toBe("2026-01-31");
  });

  it("reads a statement printed in Gregorian years rather than as Buddhist 1983", () => {
    // A real statement printed `26` for 2026 and was read as Buddhist 2526, i.e. 1983 — a
    // 43-year error on the period and on every row. Nothing failed closed: it parsed and
    // reached the bind stage with 1983 dates (D-031).
    const result = onePage(
      [{ date: "02/07/26", time: "09:15", label: "x", deposit: "1.00", balance: "10,259.70" }],
      { frame: { period: "01/07/26 - 31/07/26" } }
    );
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.frame.periodStart).toBe("2026-07-01");
    expect(result.frame.periodEnd).toBe("2026-07-31");
    // The era carries to the rows, so the whole file is read in one calendar.
    expect(result.rows[0]!.sourceDate).toBe("2026-07-02");
  });

  it("resolves a period start that crosses a new year against its own printed year", () => {
    // The start used to inherit the end's year outright, which dated a December opening a
    // year late. Buddhist 68 → 2025, 69 → 2026.
    const result = onePage(
      [{ date: "05/01/69", label: "x", deposit: "1.00", balance: "10,259.70" }],
      { frame: { period: "25/12/68 - 05/01/69" } }
    );
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.frame.periodStart).toBe("2025-12-25");
    expect(result.frame.periodEnd).toBe("2026-01-05");
  });

  it("keeps only the last four account digits", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    // The full printed number must not survive extraction anywhere in the frame.
    expect(JSON.stringify(result.frame)).not.toContain("123");
    expect(result.frame.accountLastFour).toHaveLength(4);
  });

  it("anchors two-digit row years on the period end, not the current year", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    for (const row of result.rows) {
      expect(row.sourceDate.startsWith("2026-")).toBe(true);
    }
  });
});

describe("krungthai layout extraction", () => {
  it("reads every row from a well-formed two-page statement", () => {
    const result = extractStatement(validStatement);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;

    expect(result.rows).toHaveLength(4);
    expect(result.rows.map((row) => row.sourceDate)).toEqual([
      "2026-01-02", "2026-01-05", "2026-01-09", "2026-01-31"
    ]);
    // Provenance restarts per page, as the contract requires.
    expect(result.rows.map((row) => `${row.provenance.page}:${row.provenance.row}`))
      .toEqual(["1:1", "1:2", "1:3", "2:1"]);
  });

  it("produces rows that satisfy the import schema", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    for (const row of result.rows) {
      const parsed = sourceRowCandidateSchema.safeParse(row);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("signs withdrawals negative and keeps deposits positive", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    expect(result.rows[0]!.components).toEqual([{ kind: "deposit", amount: { minor: "100000", currency: "THB" } }]);
    expect(result.rows[1]!.components).toEqual([{ kind: "withdrawal", amount: { minor: "-25050", currency: "THB" } }]);
  });

  it("attaches a wrapped detail line to the row above it", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    expect(result.rows[0]!.transactionLabel).toBe("โอนเงินเข้า");
    expect(result.rows[0]!.description).toBe("Synthetic inbound transfer");
    // A row printed without a detail line falls back to its label.
    expect(result.rows[2]!.description).toBe("ถอนเงินสด");
  });

  it("reads the recognized interest/tax compound row as two components", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    const compound = result.rows[3]!;
    expect(compound.components).toHaveLength(2);
    expect(compound.components.map((component) => component.kind).sort()).toEqual(["deposit", "withdrawal"]);
    expect(compound.sourceTime).toBe("23:59");
  });

  it("assigns a right-aligned amount by its midpoint, not its left edge", () => {
    // Measured on a real statement (D-030): the money and branch columns are right-aligned,
    // so a wider figure starts further left. A `dd,ddd.dd` balance began 4 units left of
    // where a `d,ddd.dd` balance began — enough to fall out of the balance band under a
    // left-edge rule, which put two amounts into `deposit` and left `balance` empty.
    // `dd,ddd.dd` is the shape that broke a real statement, and the frame prints no closing
    // balance here so the value appears exactly once — as this row's balance.
    const page = buildPage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "12,345.67" }], { frame: { closing: null } })
      .map((item) => item.str === "12,345.67" ? { ...item, x: item.x - 14, width: 36 } : item);
    const balance = page.find((item) => item.str === "12,345.67")!;
    const anchor = page.find((item) => item.str === "Balance")!;
    expect(balance.x, "the fixture must start the amount left of its column anchor").toBeLessThan(anchor.x);
    expect(balance.x + balance.width! / 2).toBeGreaterThanOrEqual(anchor.x);

    const result = extractStatement([page]);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]!.postBalance.minor).toBe("1234567");
    expect(result.rows[0]!.components).toEqual([{ kind: "deposit", amount: { minor: "100", currency: "THB" } }]);
  });

  it("reads a printed zero money column as no movement, not as a rejection", () => {
    // A real statement prints the withholding-tax column as `0.00` on an interest posting
    // where no tax was withheld (D-029). The row is a plain deposit: the zero contributes
    // no component, so the interest/tax compound guard does not apply to it either.
    // The printed opening is the closing less this row's only real movement, so the chain
    // closes exactly when the zero column is ignored and fails if it is treated as money.
    const result = onePage([{
      date: "31/01/69", time: "23:59", label: "ดอกเบี้ยรับ",
      deposit: "2.51", withdrawal: "0.00", balance: "10,259.70"
    }], { frame: { opening: "10,257.19" } });
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;

    expect(result.rows[0]!.components).toEqual([{ kind: "deposit", amount: { minor: "251", currency: "THB" } }]);
    // The chain must still close over a row whose zero column was dropped.
    expect(reconcileRows(result.frame.openingBalance, result.rows).blockers).toEqual([]);
  });

  it("reconciles the extracted rows from the extracted opening balance", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    const reconciliation = reconcileRows(result.frame.openingBalance, result.rows);
    expect(reconciliation.blockers).toHaveLength(0);
  });
});

describe("krungthai summary cross-check", () => {
  // One deposit row, one page: the totals below state exactly that.
  const rows = [{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,259.70" }];
  const agreeing = {
    pages: "1", withdrawalCount: "0", withdrawalTotal: "0.00", depositCount: "1", depositTotal: "1.00"
  };

  it("accepts a statement whose printed totals agree with the rows read", () => {
    const result = onePage(rows, { totals: agreeing });
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.frame.crossChecked).toBe(true);
  });

  it("still reads a statement that prints no summary block at all, and says it was not checked", () => {
    // The *reader* still reads it: what a document contains is a fact, and the diagnostics
    // that would fix a wording mismatch depend on the parse succeeding. What such a
    // statement may not do is reach the ledger — `assembleImportPayload` refuses it
    // (D-043), which is asserted in tests/import-assembly.test.ts. Keeping the refusal at
    // the import boundary rather than in the reader is why this test and a dozen others
    // that never supply totals still pass.
    const result = onePage(rows, { totals: null });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.frame.crossChecked).toBe(false);
  });

  it.each([
    ["a row count", { depositCount: "2" }],
    ["a page count", { pages: "3" }],
    ["a money total", { depositTotal: "9,999.00" }]
  ])("fails closed when %s disagrees with the rows read", (_field, override) => {
    expect(onePage(rows, { totals: { ...agreeing, ...override } }))
      .toMatchObject({ ok: false, code: "SUMMARY_MISMATCH" });
  });

  it("reports a total mismatch as a masked gap, never as a figure", () => {
    const result = onePage(rows, { totals: { ...agreeing, depositTotal: "9,999.00" } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The order of magnitude survives; the value does not.
    expect(result.message).toContain("d,ddd.dd");
    expect(result.message).not.toMatch(/\d/u);
  });

  it("fails closed when a printed summary cannot be read", () => {
    // A block that is printed but unparseable must not be silently skipped, or a mismatch
    // would pass unnoticed — the opposite of an absent block.
    expect(onePage(rows, { totals: { ...agreeing, depositCount: "not-a-count" } }))
      .toMatchObject({ ok: false, code: "SUMMARY_MISMATCH" });
  });

  it("never absorbs a summary line into the last row, even printed close to it", () => {
    // The block sits inside the row region. A statement printing it within DETAIL_TOLERANCE of
    // the final row would otherwise have its counts merged into that row's cells.
    const page = buildPage(rows, { totals: agreeing });
    const lastRowY = Math.max(...page.filter((item) => item.str === "02/01/69").map((item) => item.y));
    const shifted = page.map((item) => item.y <= 600 && item.y >= 570
      ? { ...item, y: lastRowY - (600 - item.y) - 8 }
      : item);
    const summary = shifted.find((item) => item.str === "Total Page")!;
    expect(lastRowY - summary.y, "the fixture must print the summary within DETAIL_TOLERANCE").toBeLessThanOrEqual(14);

    const result = extractStatement([shifted]);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.sourceDate).toBe("2026-01-02");
  });
});

describe("krungthai frame fails closed", () => {
  const rows = [{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,259.70" }];

  it.each([
    ["account type", { accountType: null }],
    ["account number", { accountNumber: null }],
    ["statement period", { period: null }]
    // Opening and closing balance are deliberately absent: a real statement does not
    // print them, so their absence is valid and they are derived (D-026).
  ])("rejects a frame with no %s", (_field, frame) => {
    expect(onePage(rows, { frame })).toMatchObject({ ok: false, code: "MISSING_FRAME_FIELD" });
  });

  it("rejects a statement that does not state THB", () => {
    expect(onePage(rows, { frame: { currencyMarker: null } }))
      .toMatchObject({ ok: false, code: "UNSUPPORTED_CURRENCY" });
  });

  it("rejects an unreadable statement period", () => {
    expect(onePage(rows, { frame: { period: "01/01/69" } }))
      .toMatchObject({ ok: false, code: "INVALID_FRAME_CONTENT" });
  });

  it("rejects an inverted statement period", () => {
    expect(onePage(rows, { frame: { period: "31/01/69 - 01/01/69" } }))
      .toMatchObject({ ok: false, code: "INVALID_FRAME_CONTENT" });
  });

  it("rejects an unparsable opening balance", () => {
    expect(onePage(rows, { frame: { opening: "1.0e4" } }))
      .toMatchObject({ ok: false, code: "INVALID_FRAME_CONTENT" });
  });

  it("rejects a closing balance that disagrees with the final row", () => {
    expect(onePage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,000.01" }]))
      .toMatchObject({ ok: false, code: "CLOSING_BALANCE_MISMATCH" });
  });
});

describe("krungthai layout fails closed", () => {
  it("rejects a document without the bank signature", () => {
    expect(onePage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "2.00" }], { withSignature: false }))
      .toMatchObject({ ok: false, code: "UNSUPPORTED_LAYOUT" });
  });

  it("rejects a page missing a column heading", () => {
    expect(onePage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "2.00" }], { headings: false }))
      .toMatchObject({ ok: false, code: "MISSING_COLUMN_ANCHOR" });
  });

  it("rejects an impossible calendar date", () => {
    expect(onePage([{ date: "31/02/69", label: "x", deposit: "1.00", balance: "2.00" }]))
      .toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });

  it("rejects a row with no amount in either money column", () => {
    expect(onePage([{ date: "02/01/69", label: "x", balance: "2.00" }]))
      .toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });

  it("rejects money text that is not plain decimal", () => {
    expect(onePage([{ date: "02/01/69", label: "x", deposit: "1.0e3", balance: "2.00" }]))
      .toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });

  it("rejects an unknown compound row that is not the interest/tax pairing", () => {
    expect(onePage([
      { date: "02/01/69", label: "โอนเงิน", detail: "Unknown pairing", deposit: "10.00", withdrawal: "3.00", balance: "9.00" }
    ])).toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });

  it("rejects an unreadable printed time", () => {
    expect(onePage([{ date: "02/01/69", time: "25:99", label: "x", deposit: "1.00", balance: "2.00" }]))
      .toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });

  it("rejects a negative money column rather than guessing its direction", () => {
    // These columns print unsigned, so a sign means the statement encodes direction some
    // other way. Reading a credit as a withdrawal would invert a real transaction, which is
    // why this stays a rejection while a printed zero does not. The masked cell dump is
    // what distinguishes the two on a real statement — they once produced the same message.
    const negative = onePage([{ date: "02/01/69", label: "x", withdrawal: "-500.00", balance: "2.00" }]);
    expect(negative).toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
    if (negative.ok) return;
    expect(negative.message).toContain("withdrawal[-ddd.dd]");

    const negativeDeposit = onePage([{ date: "02/01/69", label: "x", deposit: "-1.00", balance: "2.00" }]);
    expect(negativeDeposit).toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
    if (negativeDeposit.ok) return;
    expect(negativeDeposit.message).toContain("deposit[-d.dd]");
  });

  it("rejects a row whose money columns both printed zero", () => {
    // Nothing moved, so there is no transaction to import and none will be invented.
    const result = onePage([{ date: "02/01/69", label: "x", withdrawal: "0.00", deposit: "0.00", balance: "2.00" }]);
    expect(result).toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
    if (result.ok) return;
    expect(result.message).toContain("withdrawal[d.dd]");
    expect(result.message).toContain("deposit[d.dd]");
  });

  it("reports every column of a rejected row, so a misfiled cell is visible", () => {
    // A value landing in the wrong column band is the failure mode that would silently
    // swap a withdrawal for a deposit, so the dump has to cover all seven columns rather
    // than only the one that failed.
    const result = onePage([{ date: "02/01/69", time: "09:15", label: "x", detail: "y", withdrawal: "0.00", balance: "2.00", branch: "z" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const key of ["dateTime", "transaction", "description", "withdrawal", "deposit", "balance", "branch"]) {
      expect(result.message, `missing ${key}`).toContain(`${key}[`);
    }
    // An empty column reports as empty rather than being omitted.
    expect(result.message).toContain("deposit[]");
    expect(result.message).toContain("dateTime[dd/dd/dd dd:dd]");
  });

  it("reports every unreadable row in one result, grouped by shape", () => {
    // Diagnosis used to stop at the first bad row, so one owner-driven read of a real
    // statement surfaced exactly one defect and cost a whole run. Rows repeat their shapes,
    // so a statement's remaining defects collapse to a few classes one read can return.
    // The import still fails closed — this changes what is reported, not what is accepted.
    const result = extractStatement([buildPage([
      { date: "02/01/69", label: "x", deposit: "1.00", balance: "10,259.70" },
      { date: "03/01/69", label: "y", withdrawal: "-1.00", balance: "5.00" },
      { date: "04/01/69", label: "z", withdrawal: "-2.00", balance: "6.00" },
      { date: "05/01/69", label: "w", balance: "7.00" }
    ])]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("3 rows could not be read");
    expect(result.message).toContain("in 2 distinct cases");
    // The two negative rows share a shape, so they are one class with a count.
    expect(result.message).toContain("2×");
    expect(result.message).toContain("withdrawal[-d.dd]");
    expect(result.message).toContain("neither a withdrawal nor a deposit amount");
  });

  it("rejects a statement with no readable rows", () => {
    expect(onePage([])).toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });
});
