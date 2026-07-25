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

export function buildPage(
  rows: readonly RowSpec[],
  options: { withSignature?: boolean; headings?: boolean; frame?: FrameSpec | null } = {}
): PageText {
  const { withSignature = true, headings = true, frame = {} } = options;
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
    if (values.currencyMarker !== null) items.push({ str: values.currencyMarker, x: 400, y: 760 });
    push("Account Type", values.accountType, 750);
    push("Account No.", values.accountNumber, 740);
    push("Period", values.period, 730);
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
    // Same column as the date, printed a little to its right on the same line.
    if (row.time) items.push({ str: row.time, x: COLUMN_X.dateTime + 55, y });
    items.push({ str: row.label, x: COLUMN_X.transaction, y });
    if (row.withdrawal) items.push({ str: row.withdrawal, x: COLUMN_X.withdrawal, y });
    if (row.deposit) items.push({ str: row.deposit, x: COLUMN_X.deposit, y });
    items.push({ str: row.balance, x: COLUMN_X.balance, y });
    if (row.branch) items.push({ str: row.branch, x: COLUMN_X.branch, y });
    // Wrapped detail line, printed slightly below its row in the description column.
    if (row.detail) items.push({ str: row.detail, x: COLUMN_X.description, y: y - DETAIL_OFFSET });
  });

  return items;
}

// A well-formed two-page statement: a plain deposit, a withdrawal with a wrapped
// detail line and a branch, a row without a printed time, and an interest/tax
// compound row on page two.
export const validStatement: PageText[] = [
  buildPage([
    { date: "02/01/69", time: "09:15", label: "โอนเงินเข้า", detail: "Synthetic inbound transfer", deposit: "1,000.00", balance: "11,000.00" },
    { date: "05/01/69", time: "18:42", label: "ชำระสินค้า", detail: "Synthetic market purchase", withdrawal: "250.50", balance: "10,749.50", branch: "Mobile" },
    { date: "09/01/69", label: "ถอนเงินสด", withdrawal: "500.00", balance: "10,249.50", branch: "สาขาสีลม" }
  ]),
  buildPage([
    { date: "31/01/69", time: "23:59", label: "ดอกเบี้ยรับ", detail: "หักภาษี ณ ที่จ่าย", deposit: "12.00", withdrawal: "1.80", balance: "10,259.70" }
  ], { withSignature: false, frame: null })
];

export const ROW_PITCH_FOR_TESTS = ROW_PITCH;
export const COLUMN_X_FOR_TESTS = COLUMN_X;
