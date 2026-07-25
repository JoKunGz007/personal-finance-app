import type { PageText, TextItem } from "@/lib/krungthai-layout";

// Invented synthetic geometry for contract version krungthai-layout-v1.
//
// Per docs/FIXTURE_POLICY.md every value and coordinate here is made up: no real
// statement was opened, measured, redacted, or perturbed to produce it. Names,
// amounts, balances, branches, and labels are fictional, and the column positions are
// chosen to be readable rather than copied from anything.
//
// The column *structure* does follow what a real statement prints, as reported by the
// 2026-07-25 smoke test (DECISIONS D-024): one `Date/Time` column rather than separate
// date and time columns, and `Transaction` printed separately from
// `Description/Cheque No.`. Matching the structure is what makes these fixtures worth
// anything — the previous invented shape could never have matched a real statement.
// Heading words are the bank's boilerplate, not statement content; no figure, name, or
// date from a real document appears here.

const COLUMN_X = {
  dateTime: 40,
  transaction: 150,
  description: 240,
  withdrawal: 360,
  deposit: 420,
  balance: 480,
  branch: 545
} as const;

const HEADER_Y = 700;
const FIRST_ROW_Y = 676;
const ROW_PITCH = 24;
const DETAIL_OFFSET = 10;
// The time sits on its own line just under its row's date, within DETAIL_TOLERANCE.
const TIME_OFFSET = 12;
// The currency sits in the frame block above the grid, which is where a real statement
// prints it — `Currency  THB` on its own line (confirmed 2026-07-25, superseding D-025).
const CURRENCY_Y = 705;
// A footer line below the last row the fixtures use, well clear of DETAIL_TOLERANCE. It
// begins with a street number, as a real statement's footer does, so the fixtures keep
// exercising the guard that stops a numeric footer from aborting a statement (D-026).
const FOOTER_Y = 480;
// The summary block's first line, likewise clear of the last row.
const SUMMARY_Y = 600;

type RowSpec = {
  date: string;
  time?: string;
  label: string;
  detail?: string;
  withdrawal?: string;
  deposit?: string;
  balance: string;
  branch?: string;
};

// The date and time share one column, printed as two runs on the same line — which is
// also the case the reader has to tolerate, since pdf.js may emit them either way.

// The invented frame block, printed above the grid on page one as label/value
// pairs sharing a line. Overriding a field to null omits it, so a test can prove
// the extractor fails closed on a missing field.
export type FrameSpec = {
  accountType?: string | null;
  accountNumber?: string | null;
  period?: string | null;
  opening?: string | null;
  closing?: string | null;
  currencyMarker?: string | null;
};

// Labels are English because a real statement prints them that way (D-024). Only
// `Account Type` is confirmed by the smoke test — the account-number, period, and
// balance labels sit on lines the label diagnostic redacts, so their exact wording is
// still a guess and the reader keeps accepting the Thai alternates too.
const DEFAULT_FRAME: Required<FrameSpec> = {
  accountType: "Savings",
  accountNumber: "123-4-56789-0",
  period: "01/01/69 - 31/01/69",
  opening: "10,000.00",
  closing: "10,259.70",
  currencyMarker: "Currency THB"
};

// The summary block a real statement prints on its last page (D-033): each money label
// followed by a row count and then a total, and `Total Page` followed by a page count and a
// carry-forward marker rather than an amount. Overriding a field to null omits that line, so
// a test can prove the cross-check both fires and tolerates absence.
export type TotalsSpec = {
  pages?: string | null;
  withdrawalCount?: string | null;
  withdrawalTotal?: string | null;
  depositCount?: string | null;
  depositTotal?: string | null;
};

export function buildPage(
  rows: readonly RowSpec[],
  options: { withSignature?: boolean; headings?: boolean; frame?: FrameSpec | null; totals?: TotalsSpec | null } = {}
): PageText {
  const { withSignature = true, headings = true, frame = {}, totals = null } = options;
  const items: TextItem[] = [];

  if (withSignature) {
    // The bank signature the reader looks for. A real statement carries the English
    // name, which is what the smoke test's first check confirmed.
    items.push({ str: "Krungthai Bank Public Company Limited", x: 40, y: 780 });
    items.push({ str: "Statement of Account (synthetic)", x: 40, y: 770 });
  }

  if (frame) {
    const values = { ...DEFAULT_FRAME, ...frame };
    const push = (label: string, value: string | null, y: number) => {
      if (value === null) return;
      items.push({ str: label, x: 40, y });
      items.push({ str: value, x: 170, y });
    };
    // In the frame block above the grid, on its own line, as a real statement prints it.
    // Its own line matters: sharing the closing-balance line would put `Currency THB` inside
    // that field's value, since a two-word run does not match the single-word stop pattern.
    if (values.currencyMarker !== null) items.push({ str: values.currencyMarker, x: 303, y: CURRENCY_Y });
    // Wordings a real statement prints (D-026). `Branch Code` shares the account-number
    // line, as it does on a real statement, so the fixture exercises the stop rule that
    // keeps one field's value out of the next.
    //
    // The printed order matters, not just the labels. A real statement prints a `Branch`
    // frame label between the statement period and the account number, and `Branch`
    // matches the `branch` *column* anchor — so a reader that takes the grid boundary
    // from the first line matching any anchor reads the two fields above it and reports
    // the account number as missing. Reproducing that order makes the fixture fail with
    // the real statement's exact message rather than merely failing (GOTCHAS).
    push("Statement Period", values.period, 760);
    push("Account Type", values.accountType, 750);
    items.push({ str: "Branch", x: 40, y: 740 });
    items.push({ str: "Synthetic Central Branch", x: 170, y: 740 });
    push("Account Number", values.accountNumber, 730);
    items.push({ str: "Branch Code", x: 303, y: 730 });
    items.push({ str: "555", x: 397, y: 730 });
    push("Opening Balance", values.opening, 720);
    push("Closing Balance", values.closing, 710);
  }

  if (headings) {
    items.push({ str: "Date/Time", x: COLUMN_X.dateTime, y: HEADER_Y });
    items.push({ str: "Transaction", x: COLUMN_X.transaction, y: HEADER_Y });
    items.push({ str: "Description/Cheque No.", x: COLUMN_X.description, y: HEADER_Y });
    items.push({ str: "Withdrawal", x: COLUMN_X.withdrawal, y: HEADER_Y });
    items.push({ str: "Deposit", x: COLUMN_X.deposit, y: HEADER_Y });
    items.push({ str: "Balance", x: COLUMN_X.balance, y: HEADER_Y });
    items.push({ str: "Branch", x: COLUMN_X.branch, y: HEADER_Y });
  }

  rows.forEach((row, index) => {
    const y = FIRST_ROW_Y - index * ROW_PITCH;
    items.push({ str: row.date, x: COLUMN_X.dateTime, y });
    // The time is printed on its own line below the date, in the same column, which is
    // what a real statement does (D-026). The reader has to merge it back.
    if (row.time) items.push({ str: row.time, x: COLUMN_X.dateTime, y: y - TIME_OFFSET });
    items.push({ str: row.label, x: COLUMN_X.transaction, y });
    if (row.withdrawal) items.push({ str: row.withdrawal, x: COLUMN_X.withdrawal, y });
    if (row.deposit) items.push({ str: row.deposit, x: COLUMN_X.deposit, y });
    items.push({ str: row.balance, x: COLUMN_X.balance, y });
    if (row.branch) items.push({ str: row.branch, x: COLUMN_X.branch, y });
    // Wrapped detail line, printed slightly below its row in the description column.
    if (row.detail) items.push({ str: row.detail, x: COLUMN_X.description, y: y - DETAIL_OFFSET });
  });

  // A footer, as every page of a real statement carries. It starts with a street number so
  // the fixtures keep proving that a numeric footer does not abort a statement.
  if (rows.length > 0) items.push({ str: "88 Synthetic Road, Bangkok 10110", x: 40, y: FOOTER_Y });

  if (totals) {
    // Below the last row the fixtures use and well clear of DETAIL_TOLERANCE, as on a real
    // statement — the reader must not absorb these into the final transaction.
    const push = (label: string, count: string | null, amount: string | null, y: number) => {
      if (count === null) return;
      items.push({ str: label, x: 40, y });
      items.push({ str: count, x: 110, y });
      if (amount !== null) items.push({ str: amount, x: 170, y });
    };
    push("Total Page", totals.pages ?? null, "C/F", SUMMARY_Y);
    push("Total Withdrawal", totals.withdrawalCount ?? null, totals.withdrawalTotal ?? null, SUMMARY_Y - 15);
    push("Total Deposit", totals.depositCount ?? null, totals.depositTotal ?? null, SUMMARY_Y - 30);
  }

  return items;
}

// A well-formed two-page statement: a plain deposit, a withdrawal with a wrapped
// detail line and a branch, a row without a printed time, and an interest/tax
// compound row on page two.
//
// The last page carries a summary block whose counts and totals agree with those rows —
// 3 withdrawal rows totalling 752.30, 2 deposit rows totalling 1,012.00, across 2 pages —
// so the main fixture exercises the global cross-check rather than only the row parsing.
// Note the compound row counts in *both* columns, which is what a real statement does.
export const validStatement: PageText[] = [
  buildPage([
    { date: "02/01/69", time: "09:15", label: "โอนเงินเข้า", detail: "Synthetic inbound transfer", deposit: "1,000.00", balance: "11,000.00" },
    { date: "05/01/69", time: "18:42", label: "ชำระสินค้า", detail: "Synthetic market purchase", withdrawal: "250.50", balance: "10,749.50", branch: "Mobile" },
    { date: "09/01/69", label: "ถอนเงินสด", withdrawal: "500.00", balance: "10,249.50", branch: "สาขาสีลม" }
  ]),
  buildPage([
    { date: "31/01/69", time: "23:59", label: "ดอกเบี้ยรับ", detail: "หักภาษี ณ ที่จ่าย", deposit: "12.00", withdrawal: "1.80", balance: "10,259.70" }
  ], {
    withSignature: false,
    frame: null,
    totals: { pages: "2", withdrawalCount: "3", withdrawalTotal: "752.30", depositCount: "2", depositTotal: "1,012.00" }
  })
];

export const ROW_PITCH_FOR_TESTS = ROW_PITCH;
export const COLUMN_X_FOR_TESTS = COLUMN_X;
