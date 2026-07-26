import { describe, expect, it } from "vitest";
import { assembleImportPayload } from "@/lib/import-assembly";
import type { PageText } from "@/lib/masked-diagnostics";
import { readStatement } from "@/lib/read-statement";
import { importPayloadSchema } from "@/lib/statement";
import { extractStatement } from "@/lib/statement-layout";
import { validStatement as krungthaiStatement } from "./fixtures/krungthai-layout-v1";
import { buildKbankPage, buildScbPage, kbankStatement, scbStatement } from "./fixtures/statement-layouts";

// Geometry reading for scb-layout-v1 and kbank-layout-v1. The fixtures are invented
// (docs/FIXTURE_POLICY.md): the structure comes from masked dumps of real statements
// (D-035), no coordinate does, and the money columns are placed deliberately closer
// together than a real statement prints them.

function expectFailure(result: ReturnType<typeof extractStatement>, code: string): string {
  expect(result.ok, `expected a failure with code ${code}`).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.code).toBe(code);
  return result.message;
}

describe("scb-layout-v1", () => {
  it("reads a two-page statement, and reads its credit as a deposit", () => {
    const result = extractStatement(scbStatement);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    expect(result.frame).toEqual({
      bankCode: "SCB",
      contractVersion: "scb-layout-v1",
      accountType: null,
      accountLastFour: "7890",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      openingBalance: "500000",
      closingBalance: "500000",
      currency: "THB",
      // The opening is printed, so unlike Krungthai it is never derived; the closing is
      // not, so it comes from the last row.
      balancesPrinted: false
    });

    expect(result.rows).toHaveLength(3);
    // This is the assertion the whole layout turns on. The middle row's figure sits in
    // the right-hand money sub-column, and reading it as a withdrawal — which is what the
    // first draft of docs/SCB_CONTRACT.md would have produced — inverts a real
    // transaction while parsing perfectly cleanly (D-039).
    expect(result.rows.map((row) => row.components[0]!.kind)).toEqual(["withdrawal", "deposit", "withdrawal"]);
    expect(result.rows.map((row) => row.components[0]!.amount.minor)).toEqual(["-25050", "100000", "-74950"]);
    expect(result.rows.map((row) => row.postBalance.minor)).toEqual(["474950", "574950", "500000"]);
  });

  it("splits the combined date-and-time run", () => {
    const result = extractStatement(scbStatement);
    if (!result.ok) throw new Error(result.message);
    expect(result.rows[0]!.sourceDate).toBe("2026-01-02");
    expect(result.rows[0]!.sourceTime).toBe("09:15");
    expect(result.rows[0]!.provenance.parserFields).toMatchObject({
      contractVersion: "scb-layout-v1",
      printedDateTime: "02/01/26 09:15"
    });
  });

  it("maps the channel, code and DESC text to distinct row fields", () => {
    const result = extractStatement(scbStatement);
    if (!result.ok) throw new Error(result.message);
    expect(result.rows[0]).toMatchObject({
      transactionLabel: "ENET",
      // Every SCB row carries a continuation line, and its value joins the description it
      // is printed under. On a real statement that value is frequently `-`, and it is kept
      // rather than dropped: deciding a printed run means nothing is a judgement about
      // content, and the description feeds the row fingerprint.
      description: "Synthetic outbound transfer -",
      reference: "E1",
      branch: null
    });
    // The repeated `DESC :` marker is a layout literal and never reaches a field.
    expect(result.rows[2]!.description).toBe("Synthetic market purchase Synthetic note");
    expect(result.rows[2]!.description).not.toContain("DESC");
  });

  it("refuses a figure printed in the wrong money sub-column", () => {
    // The balance chain still says deposit, so the arithmetic reads it correctly — but the
    // figure is right-aligned on the debit column, and geometry and arithmetic disagreeing
    // is exactly what must never be resolved by picking one.
    const pages: PageText[] = [
      buildScbPage([
        { dateTime: "02/01/26 09:15", code: "E1", channel: "ENET", debit: "250.50", balance: "4,749.50", description: "Synthetic outbound" },
        { dateTime: "05/01/26 18:42", code: "C2", channel: "ECOM", credit: "1,000.00", balance: "5,749.50", description: "Synthetic inbound", misfiled: true }
      ], { carryForward: "5,000.00", totals: { debitCount: "1", debitTotal: "250.50", creditCount: "1", creditTotal: "1,000.00" } })
    ];
    const message = expectFailure(extractStatement(pages), "AMBIGUOUS_ROW_GEOMETRY");
    expect(message).toMatch(/same column/u);
  });

  it("fails closed when a page carries a balance forward that does not match", () => {
    const pages: PageText[] = [
      scbStatement[0]!,
      buildScbPage([
        { dateTime: "09/01/26 12:00", code: "P3", channel: "POS", debit: "749.50", balance: "5,000.00", description: "Synthetic purchase" }
      ], { frame: null, carryForward: "9,999.99", totals: {} })
    ];
    const message = expectFailure(extractStatement(pages), "CARRY_FORWARD_MISMATCH");
    // The gap is reported as a shape, never as a figure.
    expect(message).not.toMatch(/\d/u.source === "" ? /$^/u : /\d[\d,]*\.\d\d/u);
  });

  it("fails closed when the balance moves by an amount the row does not state", () => {
    const pages: PageText[] = [
      buildScbPage([
        { dateTime: "02/01/26 09:15", code: "E1", channel: "ENET", debit: "250.50", balance: "4,000.00", description: "Synthetic outbound" }
      ], { carryForward: "5,000.00" })
    ];
    expectFailure(extractStatement(pages), "AMBIGUOUS_ROW_DIRECTION");
  });

  it("cross-checks the rows against the printed counts and totals", () => {
    const wrongCount: PageText[] = [
      scbStatement[0]!,
      buildScbPage([
        { dateTime: "09/01/26 12:00", code: "P3", channel: "POS", debit: "749.50", balance: "5,000.00", description: "Synthetic purchase" }
      ], { frame: null, carryForward: "5,749.50", totals: { debitCount: "7" } })
    ];
    expect(expectFailure(extractStatement(wrongCount), "SUMMARY_MISMATCH")).toMatch(/counts 7 withdrawal rows/u);

    const wrongTotal: PageText[] = [
      scbStatement[0]!,
      buildScbPage([
        { dateTime: "09/01/26 12:00", code: "P3", channel: "POS", debit: "749.50", balance: "5,000.00", description: "Synthetic purchase" }
      ], { frame: null, carryForward: "5,749.50", totals: { debitTotal: "1,200.00" } })
    ];
    const message = expectFailure(extractStatement(wrongTotal), "SUMMARY_MISMATCH");
    expect(message).toMatch(/the gap is [^\d]*d/u);
  });

  it("refuses a brought-forward balance printed below a transaction", () => {
    // Rebasing the chain on a carry-forward that is not the opening would silently change
    // every direction after it.
    const page = [...buildScbPage([
      { dateTime: "02/01/26 09:15", code: "E1", channel: "ENET", debit: "250.50", balance: "4,749.50", description: "Synthetic outbound" }
    ], { carryForward: null })];
    page.push({ str: "ยอดยกมา (Balance Brought Forward)", x: 70, y: 400 });
    page.push({ str: "4,749.50", x: 420, y: 400, width: 40 });
    expectFailure(extractStatement([page]), "MISSING_FRAME_FIELD");
  });

  it("refuses a statement whose frame prints no period", () => {
    expectFailure(extractStatement([buildScbPage([], { frame: { period: null } })]), "MISSING_FRAME_FIELD");
  });

  it("refuses an unreadable account number without echoing it", () => {
    const message = expectFailure(
      extractStatement([buildScbPage([], { frame: { accountNumber: "not-an-account" } })]),
      "INVALID_FRAME_CONTENT"
    );
    expect(message).not.toContain("not-an-account");
    expect(message).toMatch(/shape xxx-xx-xxxxxxx/u);
  });

  it("refuses a row that prints a zero amount", () => {
    const pages: PageText[] = [
      buildScbPage([
        { dateTime: "02/01/26 09:15", code: "E1", channel: "ENET", debit: "0.00", balance: "5,000.00", description: "Synthetic zero" }
      ], { carryForward: "5,000.00" })
    ];
    expect(expectFailure(extractStatement(pages), "INVALID_ROW_CONTENT")).toMatch(/zero amount/u);
  });

  it("resolves a Buddhist four-digit period into Gregorian row dates", () => {
    const pages: PageText[] = [
      buildScbPage([
        { dateTime: "02/01/69 09:15", code: "E1", channel: "ENET", debit: "250.50", balance: "4,749.50", description: "Synthetic outbound" }
      ], { frame: { period: "01/01/2569 - 31/01/2569" }, carryForward: "5,000.00" })
    ];
    const result = extractStatement(pages);
    if (!result.ok) throw new Error(result.message);
    // A four-digit year cannot be ambiguous across the 543-year gap, so this is a
    // determination rather than the inference that produced D-031.
    expect(result.frame.periodStart).toBe("2026-01-01");
    expect(result.rows[0]!.sourceDate).toBe("2026-01-02");
  });

  it("refuses a row dated outside the statement period", () => {
    const pages: PageText[] = [
      buildScbPage([
        { dateTime: "02/06/26 09:15", code: "E1", channel: "ENET", debit: "250.50", balance: "4,749.50", description: "Synthetic outbound" }
      ], { carryForward: "5,000.00" })
    ];
    expect(expectFailure(extractStatement(pages), "INVALID_ROW_CONTENT")).toMatch(/outside the statement period/u);
  });
});

describe("kbank-layout-v1", () => {
  it("reads a two-page statement across a three-line heading block", () => {
    const result = extractStatement(kbankStatement);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    expect(result.frame).toMatchObject({
      bankCode: "KBANK",
      contractVersion: "kbank-layout-v1",
      accountLastFour: "7890",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      openingBalance: "80000",
      // Printed in the frame, so unlike SCB it is not derived from the last row.
      closingBalance: "0",
      balancesPrinted: true
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((row) => row.components[0]!.kind)).toEqual(["deposit", "withdrawal", "withdrawal"]);
    expect(result.rows.map((row) => row.components[0]!.amount.minor)).toEqual(["120000", "-50000", "-150000"]);
  });

  it("reads date and time as two runs, separated by a hyphen", () => {
    const result = extractStatement(kbankStatement);
    if (!result.ok) throw new Error(result.message);
    expect(result.rows[0]!.sourceDate).toBe("2026-01-02");
    expect(result.rows[0]!.sourceTime).toBe("09:15");
    expect(result.rows[0]!.provenance.parserFields).toMatchObject({ printedDateTime: "02-01-26 09:15" });
  });

  it("maps the descriptions, channel and details columns to distinct row fields", () => {
    const result = extractStatement(kbankStatement);
    if (!result.ok) throw new Error(result.message);
    expect(result.rows[0]).toMatchObject({
      transactionLabel: "Transfer Deposit",
      description: "Synthetic inbound",
      reference: null,
      branch: "K PLUS"
    });
    expect(result.rows[2]!.description).toBe("Synthetic payment Synthetic wrapped detail");
  });

  it("does not read the Beginning Balance line as a transaction", () => {
    const result = extractStatement(kbankStatement);
    if (!result.ok) throw new Error(result.message);
    // It leads with a date exactly as a transaction does; only its label distinguishes it,
    // and it is printed at the top of every page.
    expect(result.rows.every((row) => row.transactionLabel !== "Beginning Balance")).toBe(true);
    expect(result.rows).toHaveLength(3);
  });

  it("reads the summary block from the top of page one", () => {
    const result = extractStatement(kbankStatement);
    // Its counts are embedded in the label runs and its amounts sit in a column of their
    // own — a cross-check written for either of the other two layouts reads nothing here.
    expect(result.ok).toBe(true);

    // Two withdrawals and one deposit, so both embedded counts agree and only the
    // printed withdrawal total is wrong.
    const pages: PageText[] = [
      buildKbankPage([
        { date: "02-01-26", time: "09:15", description: "Transfer Deposit", deposit: "1,200.00", balance: "2,000.00" },
        { date: "05-01-26", time: "18:42", description: "Cash Withdrawal", withdrawal: "500.00", balance: "1,500.00" },
        { date: "09-01-26", time: "12:00", description: "Payment", withdrawal: "1,500.00", balance: "0.00" }
      ], { carryForward: "800.00", totals: { withdrawal: "9,999.00" } })
    ];
    expect(expectFailure(extractStatement(pages), "SUMMARY_MISMATCH")).toMatch(/withdrawal total/u);
  });

  it("refuses a figure printed in the wrong money sub-column", () => {
    const pages: PageText[] = [
      buildKbankPage([
        { date: "02-01-26", time: "09:15", description: "Transfer Deposit", deposit: "1,200.00", balance: "2,000.00" },
        { date: "05-01-26", time: "18:42", description: "Cash Withdrawal", withdrawal: "500.00", balance: "1,500.00", misfiled: true }
      ], { carryForward: "800.00", totals: null })
    ];
    expectFailure(extractStatement(pages), "AMBIGUOUS_ROW_GEOMETRY");
  });

  it("refuses a statement whose heading block does not state the currency", () => {
    // KBANK prints `(THB)` on the lower heading line, which is separable from the anchors.
    // SCB cannot reproduce this case: its marker is inside the required `Balance/Baht`
    // anchor, so a statement that reads at all has stated its currency.
    const pages: PageText[] = [
      buildKbankPage([
        { date: "02-01-26", time: "09:15", description: "Transfer Deposit", deposit: "1,200.00", balance: "2,000.00" }
      ], { carryForward: "800.00", currencyMarker: null, totals: null })
    ];
    expectFailure(extractStatement(pages), "UNSUPPORTED_CURRENCY");
  });
});

describe("layout dispatch", () => {
  it("routes each fixture to the reader that matches its headings", () => {
    const scb = readStatement(scbStatement);
    const kbank = readStatement(kbankStatement);
    const krungthai = readStatement(krungthaiStatement);
    for (const result of [scb, kbank, krungthai]) {
      expect(result.ok, result.ok ? "" : result.message).toBe(true);
    }
    if (!scb.ok || !kbank.ok || !krungthai.ok) throw new Error("unreachable");
    expect([scb.frame.bankCode, kbank.frame.bankCode, krungthai.frame.bankCode]).toEqual(["SCB", "KBANK", "KTB"]);
  });

  it("keeps a KBANK statement whose rows name another bank on the KBANK reader", () => {
    // Both real KBANK statements print `Internet/Mobile SCB` as an ordinary channel, so a
    // bank-name signature would route every one of them to the SCB reader. A bank's name
    // appearing on another bank's statement is what a transfer is (D-039).
    const pages: PageText[] = [
      buildKbankPage([
        { date: "02-01-26", time: "09:15", description: "Transfer Deposit", deposit: "1,200.00", balance: "2,000.00", channel: "Internet/Mobile SCB" }
      ], { carryForward: "800.00", totals: { withdrawal: null, deposit: "1,200.00" } })
    ];
    const result = readStatement(pages);
    if (!result.ok) throw new Error(result.message);
    expect(result.frame.bankCode).toBe("KBANK");
    expect(result.rows[0]!.branch).toBe("Internet/Mobile SCB");
  });

  it("keeps an SCB statement whose rows name Krungthai on the SCB reader", () => {
    const pages: PageText[] = [
      buildScbPage([
        { dateTime: "02/01/26 09:15", code: "E1", channel: "ENET", debit: "250.50", balance: "4,749.50", description: "Transfer to Krungthai account" }
      ], { carryForward: "5,000.00", totals: { debitCount: "1", debitTotal: "250.50", creditCount: "0", creditTotal: "0.00" } })
    ];
    const result = readStatement(pages);
    if (!result.ok) throw new Error(result.message);
    expect(result.frame.bankCode).toBe("SCB");
  });

  it("refuses a document carrying no supported layout's headings", () => {
    const page: PageText = [
      { str: "ANZ", x: 40, y: 700 },
      { str: "EXIM", x: 140, y: 700 },
      { str: "MIZUHO", x: 240, y: 700 }
    ];
    const result = readStatement([page]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("UNSUPPORTED_LAYOUT");
    // A bank-abbreviation glossary sat in the KBANK folder and briefly looked like proof
    // that the layout was unreadable. It has no heading line, so it is refused rather than
    // attempted (docs/KBANK_CONTRACT.md).
    expect(result.message).not.toMatch(/Krungthai/u);
  });
});

describe("the import contract carries the layout that produced it", () => {
  const target = { accountId: "11111111-2222-4333-8444-555555555556", bankCode: "SCB", lastFour: "7890", currency: "THB" };

  it("assembles an SCB statement under its own contract version", () => {
    const read = extractStatement(scbStatement);
    if (!read.ok) throw new Error(read.message);
    const assembled = assembleImportPayload(read.frame, read.rows, target);
    expect(assembled.ok, assembled.ok ? "" : assembled.message).toBe(true);
    if (!assembled.ok) throw new Error("unreachable");
    expect(assembled.payload.contractVersion).toBe("scb-layout-v1");
    expect(assembled.payload.bankCode).toBe("SCB");
  });

  it("rejects a payload pairing one bank with another layout's contract version", () => {
    const read = extractStatement(scbStatement);
    if (!read.ok) throw new Error(read.message);
    const assembled = assembleImportPayload(read.frame, read.rows, target);
    if (!assembled.ok) throw new Error("unreachable");
    // The bank code is hashed into every row fingerprint, so an unpinned pair would let a
    // payload change what its fingerprints mean while still validating.
    const tampered = { ...assembled.payload, bankCode: "KTB" as const };
    const parsed = importPayloadSchema.safeParse(tampered);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("unreachable");
    expect(JSON.stringify(parsed.error.issues)).toMatch(/does not read this bank's layout/u);
  });
});
