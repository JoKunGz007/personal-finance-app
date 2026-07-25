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
      accountType: "Savings",
      accountLastFour: "7890",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      openingBalance: "1000000",
      closingBalance: "1025970",
      currency: "THB",
      balancesPrinted: true
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

  it("reads a currency stated below the transaction grid", () => {
    // A real statement prints the currency under the transactions, not in the label
    // block above them (D-025). This pins that down: narrowing the search back to the
    // frame block would fail here rather than only against a real PDF.
    const page = buildPage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,259.70" }]);
    const currency = page.find((item) => /THB/u.test(item.str));
    const header = page.find((item) => item.str === "Date/Time");
    expect(currency, "the fixture must print a currency marker").toBeDefined();
    expect(currency!.y).toBeLessThan(header!.y);
    expect(extractStatement([page])).toMatchObject({ ok: true });
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

  it("reconciles the extracted rows from the extracted opening balance", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    const reconciliation = reconcileRows(result.frame.openingBalance, result.rows);
    expect(reconciliation.blockers).toHaveLength(0);
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

  it("rejects a statement with no readable rows", () => {
    expect(onePage([])).toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });
});
