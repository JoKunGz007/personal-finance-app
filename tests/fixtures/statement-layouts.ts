import type { PageText, TextItem } from "@/lib/masked-diagnostics";
import { SYNTHETIC_GLYPH_ADVANCE } from "./synthetic-pdf";

// Invented synthetic geometry for contract versions scb-layout-v1 and kbank-layout-v1.
//
// Per docs/FIXTURE_POLICY.md every value and coordinate here is made up. The layouts were
// learned from masked structural dumps (D-035), and a dump's coordinates are deliberately
// **not** transcribed: the column positions below are chosen to be readable, the money
// columns are placed far closer together than a real statement prints them so the
// tolerance is actually stressed, and every amount, balance, date, channel and
// description is fictional.
//
// What does follow the real documents is the *structure*, because that is the whole point
// of having read the dumps: two right-aligned money sub-columns under one slash-joined
// heading, a brought-forward pseudo-row repeated per page, KBANK's three-line heading
// block and hyphen date separator, SCB's combined date-and-time run and `DESC :` marker,
// and the two different summary encodings. Heading words are the bank's boilerplate, not
// statement content.

// Money runs carry an explicit `width` so their right edges land exactly where a
// right-aligned column would put them — the reader's money geometry is entirely about
// right edges, so a fixture that omitted widths would prove nothing about it.
//
// The advance comes from the PDF generator rather than being chosen here. These fixtures
// are rendered into real PDFs and read back through pdf.js (tests/e2e/statement-pdf.spec.ts),
// and pdf.js reports the *rendered* width — so a fixture that invented its own advance
// would place a column at one right edge and have the browser find it at another, with
// the error growing with the length of the figure. That is precisely the failure the
// right-edge rule exists to catch, and it would have shown up only in a browser.
const GLYPH = SYNTHETIC_GLYPH_ADVANCE;

function rightAligned(str: string, rightEdge: number, y: number): TextItem {
  const width = str.length * GLYPH;
  return { str, x: rightEdge - width, y, width };
}

// ---------------------------------------------------------------------------
// SCB
// ---------------------------------------------------------------------------

const SCB = {
  headingY: 700,
  thaiMirrorY: 690,
  carryForwardY: 670,
  firstRowY: 650,
  rowPitch: 24,
  detailOffset: 9,
  footerY: 300,
  summaryY: 120,
  // Spaced so that no run's rendered width reaches the next run's x: pdf.js merges
  // near-adjacent runs on a line and offers no way to turn it off, and a merged run
  // destroys the grammar (GOTCHAS).
  columns: { date: 40, time: 75, code: 115, channel: 145, money: 200, balance: 290, description: 380 },
  codeX: 120,
  channelX: 150,
  // The two money columns, as right edges. Real ones sit much further apart; these are
  // close enough to matter and still clear of COLUMN_EDGE_TOLERANCE.
  debitEdge: 240,
  creditEdge: 265,
  balanceEdge: 330,
  markerX: 350,
  descriptionX: 400,
  carryForwardX: 60,
  summaryLabelX: 50
} as const;

export type ScbRow = {
  dateTime: string;
  code: string;
  channel: string;
  debit?: string;
  credit?: string;
  balance: string;
  description: string;
  detail?: string;
  // Prints the figure in the other money column without changing the balance chain, which
  // is how a reader that trusted geometry alone would invert a real transaction (D-039).
  misfiled?: boolean;
};

export type ScbFrameSpec = { accountNumber?: string | null; period?: string | null };
export type ScbTotalsSpec = {
  debitTotal?: string | null;
  creditTotal?: string | null;
  debitCount?: string | null;
  creditCount?: string | null;
};

export function buildScbPage(
  rows: readonly ScbRow[],
  options: {
    headings?: boolean;
    frame?: ScbFrameSpec | null;
    carryForward?: string | null;
    totals?: ScbTotalsSpec | null;
    balanceHeading?: string;
    footer?: boolean;
  } = {}
): PageText {
  const {
    headings = true, frame = {}, carryForward = null, totals = null,
    balanceHeading = "Balance/Baht", footer = true
  } = options;
  const items: TextItem[] = [];

  if (frame) {
    const values = { accountNumber: "123-456789-0", period: "01/01/2026 - 31/01/2026", ...frame };
    // Thai labels, as the dumps record for this layout, printed in a block on the right.
    if (values.accountNumber !== null) {
      items.push({ str: "เลขที่บัญชี", x: 420, y: 740 });
      items.push({ str: values.accountNumber, x: 500, y: 740 });
    }
    items.push({ str: "ที่อยู่", x: 420, y: 730 });
    items.push({ str: "88 Synthetic Road", x: 500, y: 730 });
    if (values.period !== null) {
      items.push({ str: "วันที่", x: 420, y: 720 });
      items.push({ str: values.period, x: 500, y: 720 });
    }
  }

  if (headings) {
    items.push({ str: "Date", x: SCB.columns.date, y: SCB.headingY });
    items.push({ str: "Time", x: SCB.columns.time, y: SCB.headingY });
    items.push({ str: "Code", x: SCB.columns.code, y: SCB.headingY });
    items.push({ str: "Channel", x: SCB.columns.channel, y: SCB.headingY });
    items.push({ str: "Debit/Credit", x: SCB.columns.money, y: SCB.headingY });
    // Carries the currency as well as the column name; see docs/SCB_CONTRACT.md.
    items.push({ str: balanceHeading, x: SCB.columns.balance, y: SCB.headingY });
    items.push({ str: "Description/Note", x: SCB.columns.description, y: SCB.headingY });
    // The Thai mirror line, which prints six runs for seven columns and must never be
    // taken as a second heading row.
    items.push({ str: "วันที่", x: SCB.columns.date, y: SCB.thaiMirrorY });
    items.push({ str: "เวลา รายการ", x: SCB.columns.time, y: SCB.thaiMirrorY });
    items.push({ str: "ช่องทาง", x: SCB.columns.channel, y: SCB.thaiMirrorY });
    items.push({ str: "ลูกหนี้/เจ้าหนี้", x: SCB.columns.money, y: SCB.thaiMirrorY });
    items.push({ str: "ยอดเงินคงเหลือ", x: SCB.columns.balance, y: SCB.thaiMirrorY });
    items.push({ str: "รายละเอียด", x: SCB.columns.description, y: SCB.thaiMirrorY });
  }

  if (carryForward !== null) {
    items.push({ str: "ยอดยกมา (Balance Brought Forward)", x: SCB.carryForwardX, y: SCB.carryForwardY });
    items.push(rightAligned(carryForward, SCB.balanceEdge, SCB.carryForwardY));
  }

  rows.forEach((row, index) => {
    const y = SCB.firstRowY - index * SCB.rowPitch;
    items.push({ str: row.dateTime, x: SCB.columns.date, y });
    items.push({ str: row.code, x: SCB.codeX, y });
    items.push({ str: row.channel, x: SCB.channelX, y });
    const debitEdge = row.misfiled ? SCB.creditEdge : SCB.debitEdge;
    const creditEdge = row.misfiled ? SCB.debitEdge : SCB.creditEdge;
    if (row.debit !== undefined) items.push(rightAligned(row.debit, debitEdge, y));
    if (row.credit !== undefined) items.push(rightAligned(row.credit, creditEdge, y));
    items.push(rightAligned(row.balance, SCB.balanceEdge, y));
    items.push({ str: "DESC :", x: SCB.markerX, y });
    items.push({ str: row.description, x: SCB.descriptionX, y });
    // The continuation line, present on every real row, carrying the marker again.
    items.push({ str: "DESC :", x: SCB.markerX, y: y - SCB.detailOffset });
    items.push({ str: row.detail ?? "-", x: SCB.descriptionX, y: y - SCB.detailOffset });
  });

  // Page furniture below the grid, far enough down that it must not be absorbed into the
  // last row as a continuation.
  if (footer) items.push({ str: "88 Synthetic Road, Bangkok 10110", x: 40, y: SCB.footerY });

  if (totals) {
    const values = {
      debitTotal: "1,000.00", creditTotal: "1,000.00", debitCount: "2", creditCount: "1", ...totals
    };
    if (values.debitTotal !== null) {
      items.push({ str: "TOTAL AMOUNTS (Debit)", x: SCB.summaryLabelX, y: SCB.summaryY });
      items.push(rightAligned(values.debitTotal, SCB.debitEdge, SCB.summaryY));
    }
    if (values.creditTotal !== null) {
      items.push({ str: "TOTAL AMOUNTS (Credit)", x: SCB.summaryLabelX, y: SCB.summaryY - 14 });
      items.push(rightAligned(values.creditTotal, SCB.creditEdge, SCB.summaryY - 14));
    }
    // Both counts on one line, right-aligned on the two money columns.
    if (values.debitCount !== null) {
      items.push({ str: "TOTAL ITEMS", x: SCB.summaryLabelX, y: SCB.summaryY - 28 });
      items.push(rightAligned(values.debitCount, SCB.debitEdge, SCB.summaryY - 28));
      items.push(rightAligned(values.creditCount ?? "0", SCB.creditEdge, SCB.summaryY - 28));
    }
  }

  return items;
}

// A well-formed two-page SCB statement. The opening is printed, page two carries the
// balance forward, and the last page's summary agrees with the rows: two debits totalling
// 1,000.00 and one credit of 1,000.00.
export const scbStatement: PageText[] = [
  buildScbPage([
    { dateTime: "02/01/26 09:15", code: "E1", channel: "ENET", debit: "250.50", balance: "4,749.50", description: "Synthetic outbound transfer" },
    { dateTime: "05/01/26 18:42", code: "C2", channel: "ECOM", credit: "1,000.00", balance: "5,749.50", description: "Synthetic inbound transfer" }
  ], { carryForward: "5,000.00" }),
  buildScbPage([
    { dateTime: "09/01/26 12:00", code: "P3", channel: "POS", debit: "749.50", balance: "5,000.00", description: "Synthetic market purchase", detail: "Synthetic note" }
  ], { frame: null, carryForward: "5,749.50", totals: {} })
];

// ---------------------------------------------------------------------------
// KBANK
// ---------------------------------------------------------------------------

const KBANK = {
  upperHeadingY: 706,
  headingY: 700,
  lowerHeadingY: 694,
  carryForwardY: 674,
  firstRowY: 650,
  rowPitch: 24,
  detailOffset: 10,
  footerY: 300,
  summaryY: 760,
  columns: { date: 40, time: 80, description: 110, money: 180, balance: 260, channel: 330, details: 400 },
  dateX: 32,
  descriptionX: 115,
  channelX: 340,
  detailsX: 400,
  timeHeadingX: 70,
  currencyX: 270,
  frameLabelX: 340,
  frameValueX: 400,
  frameAmountEdge: 520,
  // Eight units apart: twice COLUMN_EDGE_TOLERANCE and no more, because the real pair is
  // the closer of the two layouts and a comfortable fixture would not prove the reader
  // can tell them apart.
  withdrawalEdge: 240,
  depositEdge: 248,
  balanceEdge: 310
} as const;

export type KbankRow = {
  date: string;
  time: string;
  description: string;
  withdrawal?: string;
  deposit?: string;
  balance: string;
  channel?: string;
  details?: string;
  detail?: string;
  misfiled?: boolean;
};

export type KbankFrameSpec = {
  accountNumber?: string | null;
  period?: string | null;
  endingBalance?: string | null;
};
export type KbankTotalsSpec = { withdrawal?: string | null; deposit?: string | null };

export function buildKbankPage(
  rows: readonly KbankRow[],
  options: {
    headings?: boolean;
    frame?: KbankFrameSpec | null;
    carryForward?: string | null;
    totals?: KbankTotalsSpec | null;
    currencyMarker?: string | null;
    footer?: boolean;
  } = {}
): PageText {
  const {
    headings = true, frame = {}, carryForward = null, totals = null,
    currencyMarker = "(THB)", footer = true
  } = options;
  const items: TextItem[] = [];

  if (frame) {
    const values = {
      accountNumber: "123-4-56789-0", period: "01/01/2026 - 31/01/2026", endingBalance: null,
      ...frame
    };
    items.push({ str: "Reference Code", x: KBANK.frameLabelX, y: 800 });
    items.push({ str: "00000000000000000001", x: KBANK.frameValueX, y: 800 });
    if (values.accountNumber !== null) {
      items.push({ str: "Account Number", x: KBANK.frameLabelX, y: 790 });
      items.push({ str: values.accountNumber, x: KBANK.frameValueX, y: 790 });
    }
    if (values.period !== null) {
      items.push({ str: "Period", x: KBANK.frameLabelX, y: 780 });
      items.push({ str: values.period, x: KBANK.frameValueX, y: 780 });
    }
    if (values.endingBalance !== null) {
      items.push({ str: "Ending Balance", x: KBANK.frameLabelX, y: 770 });
      items.push(rightAligned(values.endingBalance, KBANK.frameAmountEdge, 770));
    }
  }

  // The summary block sits above the grid on page one, the opposite of SCB's.
  if (totals) {
    const values = { withdrawal: "2,000.00", deposit: "1,200.00", ...totals };
    if (values.withdrawal !== null) {
      // The count lives inside the label's own run, so it is read out of the text rather
      // than taken from the next column.
      items.push({ str: "Total Withdrawal 2 items", x: KBANK.frameLabelX, y: KBANK.summaryY });
      items.push(rightAligned(values.withdrawal, KBANK.frameAmountEdge, KBANK.summaryY));
    }
    if (values.deposit !== null) {
      items.push({ str: "Total Deposit 1 items", x: KBANK.frameLabelX, y: KBANK.summaryY - 13 });
      items.push(rightAligned(values.deposit, KBANK.frameAmountEdge, KBANK.summaryY - 13));
    }
  }

  if (headings) {
    // Three printed lines. The balance column's heading is on the upper one and the time
    // column's on the lower, so a reader anchoring on the main line alone finds five
    // anchors for six columns.
    items.push({ str: "Date/", x: KBANK.timeHeadingX, y: KBANK.upperHeadingY });
    items.push({ str: "Outstanding Balance", x: KBANK.columns.balance, y: KBANK.upperHeadingY });

    items.push({ str: "Date", x: KBANK.columns.date, y: KBANK.headingY });
    items.push({ str: "Descriptions", x: KBANK.columns.description, y: KBANK.headingY });
    items.push({ str: "Withdrawal / Deposit", x: KBANK.columns.money, y: KBANK.headingY });
    items.push({ str: "Channel", x: KBANK.columns.channel, y: KBANK.headingY });
    items.push({ str: "Details", x: KBANK.columns.details, y: KBANK.headingY });

    items.push({ str: "Trn.Time", x: KBANK.timeHeadingX, y: KBANK.lowerHeadingY });
    if (currencyMarker !== null) items.push({ str: currencyMarker, x: KBANK.currencyX, y: KBANK.lowerHeadingY });
  }

  if (carryForward !== null) {
    // Leads with a date exactly as a transaction does, so only the label tells them apart.
    items.push({ str: "01-01-26", x: KBANK.dateX, y: KBANK.carryForwardY });
    items.push({ str: "Beginning Balance", x: KBANK.descriptionX, y: KBANK.carryForwardY });
    items.push(rightAligned(carryForward, KBANK.balanceEdge, KBANK.carryForwardY));
  }

  rows.forEach((row, index) => {
    const y = KBANK.firstRowY - index * KBANK.rowPitch;
    items.push({ str: row.date, x: KBANK.dateX, y });
    items.push({ str: row.time, x: KBANK.columns.time, y });
    items.push({ str: row.description, x: KBANK.descriptionX, y });
    const withdrawalEdge = row.misfiled ? KBANK.depositEdge : KBANK.withdrawalEdge;
    const depositEdge = row.misfiled ? KBANK.withdrawalEdge : KBANK.depositEdge;
    if (row.withdrawal !== undefined) items.push(rightAligned(row.withdrawal, withdrawalEdge, y));
    if (row.deposit !== undefined) items.push(rightAligned(row.deposit, depositEdge, y));
    items.push(rightAligned(row.balance, KBANK.balanceEdge, y));
    if (row.channel) items.push({ str: row.channel, x: KBANK.channelX, y });
    if (row.details) items.push({ str: row.details, x: KBANK.detailsX, y });
    if (row.detail) items.push({ str: row.detail, x: KBANK.detailsX, y: y - KBANK.detailOffset });
  });

  if (footer) items.push({ str: "Page 1 of 1 - synthetic", x: KBANK.dateX, y: KBANK.footerY });

  return items;
}

// A well-formed two-page KBANK statement. The summary is at the top of page one, the
// closing balance is printed in the frame, and page two carries the balance forward.
export const kbankStatement: PageText[] = [
  buildKbankPage([
    { date: "02-01-26", time: "09:15", description: "Transfer Deposit", deposit: "1,200.00", balance: "2,000.00", channel: "K PLUS", details: "Synthetic inbound" },
    { date: "05-01-26", time: "18:42", description: "Cash Withdrawal", withdrawal: "500.00", balance: "1,500.00", channel: "ATM Synthetic", details: "Synthetic cash" }
  ], { frame: { endingBalance: "0.00" }, carryForward: "800.00", totals: {} }),
  buildKbankPage([
    { date: "09-01-26", time: "12:00", description: "Payment", withdrawal: "1,500.00", balance: "0.00", channel: "K PLUS", details: "Synthetic payment", detail: "Synthetic wrapped detail" }
  ], { frame: null, carryForward: "1,500.00" })
];

export const SCB_GEOMETRY_FOR_TESTS = SCB;
export const KBANK_GEOMETRY_FOR_TESTS = KBANK;
