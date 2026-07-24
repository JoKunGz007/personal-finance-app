import type { PageText, TextItem } from "@/lib/krungthai-layout";

// Invented synthetic geometry for contract version krungthai-layout-v1.
//
// Per docs/FIXTURE_POLICY.md every value and coordinate here is made up: no real
// statement was opened, measured, redacted, or perturbed to produce it. Names,
// amounts, balances, branches, and Thai labels are fictional, and the column
// positions are chosen to be readable rather than copied from anything.

const COLUMN_X = {
  date: 40,
  time: 110,
  description: 170,
  withdrawal: 330,
  deposit: 400,
  balance: 470,
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

export function buildPage(rows: readonly RowSpec[], options: { withSignature?: boolean; headings?: boolean } = {}): PageText {
  const { withSignature = true, headings = true } = options;
  const items: TextItem[] = [];

  if (withSignature) {
    items.push({ str: "บมจ. ธนาคารกรุงไทย", x: 40, y: 780 });
    items.push({ str: "รายการเดินบัญชี (สังเคราะห์)", x: 40, y: 760 });
  }

  if (headings) {
    items.push({ str: "วันที่", x: COLUMN_X.date, y: HEADER_Y });
    items.push({ str: "เวลา", x: COLUMN_X.time, y: HEADER_Y });
    items.push({ str: "รายการ", x: COLUMN_X.description, y: HEADER_Y });
    items.push({ str: "ถอนเงิน", x: COLUMN_X.withdrawal, y: HEADER_Y });
    items.push({ str: "ฝากเงิน", x: COLUMN_X.deposit, y: HEADER_Y });
    items.push({ str: "ยอดคงเหลือ", x: COLUMN_X.balance, y: HEADER_Y });
    items.push({ str: "ช่องทาง", x: COLUMN_X.branch, y: HEADER_Y });
  }

  rows.forEach((row, index) => {
    const y = FIRST_ROW_Y - index * ROW_PITCH;
    items.push({ str: row.date, x: COLUMN_X.date, y });
    if (row.time) items.push({ str: row.time, x: COLUMN_X.time, y });
    items.push({ str: row.label, x: COLUMN_X.description, y });
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
  ], { withSignature: false })
];

export const ROW_PITCH_FOR_TESTS = ROW_PITCH;
export const COLUMN_X_FOR_TESTS = COLUMN_X;
