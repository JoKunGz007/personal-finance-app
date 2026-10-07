import { afterEach, describe, expect, test, vi } from "vitest";
import { browserDrainDeps, captureSlips, DRAIN_CONCURRENCY, drainInbox, type DrainDeps, type SlipPosted, type SlipScanAttempt } from "@/lib/browser/inbox-importer";
import type { StatementImportPosted } from "@/lib/browser/inbox-statement-client";
import { readLinemanPage } from "@/lib/delivery-lineman";
import {
  BUILD_ID, describeStatementRows, planStatement, reviewHref, statementNeedsReview, STATEMENT_LOCKED_REASON, STATEMENT_NO_PASSWORDS_REASON, statementHeldReason, type PdfReply,
  addedTogether, DIFFERENT_TIMES_REASON, describeDrain, describeSlipCapture, NOT_YET, parseRemembered, planLinemanOrders, planPdf,
  planReceiptScreenshots, progressLine, pruneRemembered, recogniseImage, REMEMBERED_KEY, SLIP_REVIEW_REMEMBERED_REASON, SLIP_UNCONFIRMED_REASON,
  SLIP_WAITING_REASON, slipPostBody, TWO_ORDERS_REASON, UNMATCHED_PAGE_REASON, type ReadySlip, type RememberedKind
} from "@/lib/inbox-drain";
import { readScreenshotPage, readScreenshotReceipt } from "@/lib/receipt-screenshot";
import { classifySlipRereadingYear } from "@/lib/slip-batch";
import { proposeSlipText, type Box, type OcrWord } from "@/lib/slip-ocr";
import type { ImageWordsRead } from "@/lib/browser/ocr-reader";
import type { SlipScanResult } from "@/lib/slip-scan";

// Every value is invented (docs/FIXTURE_POLICY.md). The word layouts reuse the shapes of
// tests/receipt-screenshot.test.ts and tests/delivery-lineman.test.ts; no real capture is involved.

const tokens = (lines: string[][]): OcrWord[] => lines.flatMap((row, top) => row.map((text, column) => ({
  text, left: 10 + column * 60, right: 60 + column * 60, top: 100 + top * 50, bottom: 130 + top * 50
})));
const sentences = (lines: readonly string[]): OcrWord[] => tokens(lines.map((line) => line.split(" ")));

const header = (number: string) => [
  ["01/06/69", "|", "14:35"],
  ["เลข", "ที่", "ใบเสร็จ", number],
  ["สาขา", "7", "-", "Eleven", "ทด", "สอบ"],
  ["รหัส", "ร้าน", ":", "30219"],
  ["รายการ", "สินค้า"]
];
const ITEMS = [
  ["2", "ขนม", "ปัง", "@", "15.00", "30.00"],
  ["1", "น้ำ", "ดื่ม", "10.000"],
  ["1", "M", "-", "Stamp", "(", "บาท", ")", "0.000"],
  ["ยอด", "รวม", "40.00"],
  ["1", "TMW", "ลด", "ขนม", "5.00"]
];
const TAIL = [
  ["ยอด", "สุทธิ", "3", "ชั้น", "35.00"],
  ["ทรู", "วอ", "ล", "เล็ท", "35.00"],
  ["TID", "#", "20260601000000000001"],
  ["R", "#", "0000012345P1", ":", "0000001", "01/06/69", "14:35"]
];
const FOOTER = [["ดู", "ใบ", "กำกับ", "ภาษี"]];

const wholeReceipt = (number = "12345") => tokens([...header(number), ...ITEMS, ...TAIL, ...FOOTER]);
const topOnly = (number = "12345") => tokens([...header(number), ...ITEMS.slice(0, 4), ...FOOTER]);

const OWNER_BLOCK = ["Invented Name", "0000000000", "9/9 Invented Road , Invented District", "Hang / place at given spot .", "Invented note to rider"];
// A second, different delivery block, so a second order's later screenshot can be told from the first's.
const OTHER_BLOCK = ["Other Name", "1111111111", "5/5 Other Road , Other District", "Leave at the gate .", "Other note to rider"];
const LM_FIRST = (number = "000000001", block = OWNER_BLOCK) => [
  "14:40 4G 53", "< Order details Contact us",
  `Order No. LMF - 260912-${number}`,
  "ร้าน ทดสอบ - สาขา ทดสอบ >",
  "12 SEP 26 21:00",
  "Delivery", ...block, "Menu", "ข้าว", "Reorder"
];
const LM_SECOND = (block = OWNER_BLOCK) => [
  "14:40 4G 53", "< Order details Contact us",
  ...block.slice(2), "Menu",
  "1 ข้าว ผัด ทดสอบ $ 120.00", "ไข่ ดาว ( 1 ) , เผ็ด น้อย",
  "ก๋วยเตี๋ยว ทดสอบ $ 60.00",
  "Food $ 180.00", "Delivery fee $ 20.00",
  "VIP ) LINE MAN VIP Delivery Discount - ฿ 15.00", "# Coupon - $ 40.00",
  "Pay with mobile banking $ 145.00", "Total ? B145.00",
  "Payment Method SCB EASY", "Reorder"
];

const receiptPage = (words: OcrWord[]) => {
  const read = readScreenshotPage(words);
  if (!read.ok) throw new Error(read.message);
  return read.value;
};
const orderPage = (lines: readonly string[]) => {
  const read = readLinemanPage(sentences(lines));
  if (!read.ok) throw new Error(read.message);
  return read.value;
};

const T0 = "2026-09-30T10:00:00Z";
const minutesAfter = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
/** An order page as the queue lists it: its name, its reading and when it was added. */
const queued = (name: string, lines: readonly string[], createdAt: string | null = T0) => ({ name, page: orderPage(lines), createdAt });

describe("recogniseImage", () => {
  test("a 7-Eleven screenshot is a receipt page", () => {
    expect(recogniseImage(wholeReceipt()).kind).toBe("receipt-page");
  });

  test("a LINE MAN order page is an order page, first or later", () => {
    expect(recogniseImage(sentences(LM_FIRST())).kind).toBe("lineman-page");
    expect(recogniseImage(sentences(LM_SECOND())).kind).toBe("lineman-page");
  });

  test("a slip or a card, which no recogniser knows, waits untouched", () => {
    const slip = sentences(["Transfer successful", "Invented Sender", "Amount 120.00 THB"]);
    expect(recogniseImage(slip)).toEqual({ kind: "keep", reason: NOT_YET });
    expect(recogniseImage([])).toEqual({ kind: "keep", reason: NOT_YET });
  });

  test("an order page that is recognised but unreadable keeps the parser's own reason", () => {
    const noMenu = recogniseImage(sentences(["< Order details Contact us", "Something else"]));
    expect(noMenu.kind).toBe("keep");
    expect(noMenu.kind === "keep" && noMenu.reason).not.toBe(NOT_YET);
    expect(noMenu.kind === "keep" && noMenu.reason).toMatch(/Menu/u);
  });
});

describe("planPdf", () => {
  const complete = readScreenshotReceipt([receiptPage(wholeReceipt())]);
  if (!complete.ok) throw new Error(complete.message);
  const receipt = complete.value;

  test("a complete receipt is captured as the form the worker found", () => {
    expect(planPdf({ type: "receipt", form: "condensed", receipt })).toEqual({ action: "capture", value: { form: "condensed", receipt } });
  });

  test("a receipt whose checks did not all pass is kept, not saved as partial on its own", () => {
    const plan = planPdf({ type: "receipt", form: "full", receipt: { ...receipt, completeness: "partial" } });
    expect(plan.action).toBe("keep");
    expect(plan.action === "keep" && plan.reason).toMatch(/Receipts page/u);
  });

  test("a PDF that is not a 7-Eleven form, or cannot be opened, waits untouched", () => {
    expect(planPdf({ type: "error", message: "This PDF is not a 7-Eleven e-tax receipt this app can read.", code: "UNKNOWN_FORM" }))
      .toEqual({ action: "keep", reason: NOT_YET });
    expect(planPdf({ type: "error", message: "This file could not be opened as a PDF.", code: "UNREADABLE_PDF" }))
      .toEqual({ action: "keep", reason: NOT_YET });
  });

  test("any other refusal, and a worker that failed, keep their own message", () => {
    expect(planPdf({ type: "error", message: "A field is missing.", code: "MISSING_FIELD" })).toEqual({ action: "keep", reason: "A field is missing." });
    expect(planPdf({ type: "error", message: "Reading this PDF took too long, so it was stopped." }))
      .toEqual({ action: "keep", reason: "Reading this PDF took too long, so it was stopped." });
  });
});

describe("planReceiptScreenshots", () => {
  test("a whole screenshot is captured, and names its file", () => {
    const groups = planReceiptScreenshots([{ name: "a.png", page: receiptPage(wholeReceipt()) }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ names: ["a.png"], plan: { action: "capture" } });
  });

  test("two receipts in one drain are two groups, each read alone", () => {
    const groups = planReceiptScreenshots([
      { name: "a.png", page: receiptPage(wholeReceipt("12345")) },
      { name: "b.png", page: receiptPage(topOnly("12399")) }
    ]);
    expect(groups.map((group) => [group.names, group.plan.action])).toEqual([[["a.png"], "capture"], [["b.png"], "keep"]]);
  });

  test("pages of one receipt join, and all their files are named", () => {
    const top = receiptPage(tokens([...header("12345"), ...ITEMS.slice(0, 4), ...FOOTER]));
    const bottom = receiptPage(tokens([...header("12345"), ...ITEMS.slice(3), ...TAIL, ...FOOTER]));
    const [group] = planReceiptScreenshots([{ name: "top.png", page: top }, { name: "bottom.png", page: bottom }]);
    expect(group).toMatchObject({ names: ["top.png", "bottom.png"], plan: { action: "capture" } });
  });

  test("a receipt that does not complete keeps its files with the parser's reason", () => {
    const [group] = planReceiptScreenshots([{ name: "top.png", page: receiptPage(topOnly()) }]);
    expect(group!.names).toEqual(["top.png"]);
    expect(group!.plan.action).toBe("keep");
    expect(group!.plan.action === "keep" && group!.plan.reason).toMatch(/bottom of this receipt/u);
  });

  test("nothing recognised, nothing planned", () => {
    expect(planReceiptScreenshots([])).toEqual([]);
  });
});

describe("planLinemanOrders", () => {
  test("two screenshots of one order are captured as one order, whichever was added first", () => {
    for (const pages of [
      [queued("1.png", LM_FIRST()), queued("2.png", LM_SECOND())],
      [queued("2.png", LM_SECOND()), queued("1.png", LM_FIRST())]
    ]) {
      const groups = planLinemanOrders(pages);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.names).toHaveLength(2);
      expect(groups[0]!.plan).toMatchObject({ action: "capture", value: { bookingId: "LMF-260912-000000001", totalMinor: "14500" } });
    }
  });

  test("pages added within ten minutes of each other are captured; eleven minutes apart, they are kept", () => {
    const near = planLinemanOrders([queued("1.png", LM_FIRST()), queued("2.png", LM_SECOND(), minutesAfter(10))]);
    expect(near[0]!.plan.action).toBe("capture");
    const far = planLinemanOrders([queued("1.png", LM_FIRST()), queued("2.png", LM_SECOND(), minutesAfter(11))]);
    expect(far).toHaveLength(1);
    expect(far[0]!.names).toEqual(["1.png", "2.png"]);
    expect(far[0]!.plan).toEqual({ action: "keep", reason: DIFFERENT_TIMES_REASON });
  });

  test("a page with no readable time is kept, even alone or when it is the first", () => {
    for (const time of [null, "not a time"]) {
      const groups = planLinemanOrders([queued("1.png", LM_FIRST(), time), queued("2.png", LM_SECOND())]);
      expect(groups[0]!.plan).toEqual({ action: "keep", reason: DIFFERENT_TIMES_REASON });
    }
  });

  test("a stuck order does not hold back the next: the other order's pages go through on their own", () => {
    const groups = planLinemanOrders([
      queued("a1.png", LM_FIRST("000000001", OWNER_BLOCK)),
      queued("b1.png", LM_FIRST("000000002", OTHER_BLOCK)),
      queued("b2.png", LM_SECOND(OTHER_BLOCK))
    ]);
    const byNames = Object.fromEntries(groups.map((group) => [group.names.join("+"), group.plan]));
    expect(byNames["b1.png+b2.png"]).toMatchObject({ action: "capture", value: { bookingId: "LMF-260912-000000002" } });
    expect(byNames["a1.png"]).toMatchObject({ action: "keep" });
  });

  test("a later screenshot that fits two orders is kept as mixed, and so are the first screenshots alone", () => {
    const groups = planLinemanOrders([
      queued("1.png", LM_FIRST("000000001")),
      queued("2.png", LM_FIRST("000000002")),
      queued("3.png", LM_SECOND())
    ]);
    expect(groups.flatMap((group) => group.names).sort()).toEqual(["1.png", "2.png", "3.png"]);
    expect(groups.every((group) => group.plan.action === "keep")).toBe(true);
    expect(groups.find((group) => group.names.join() === "3.png")?.plan).toEqual({ action: "keep", reason: TWO_ORDERS_REASON });
  });

  test("a later screenshot that fits no waiting order is kept with its own sentence", () => {
    const groups = planLinemanOrders([
      queued("a1.png", LM_FIRST("000000001", OWNER_BLOCK)),
      queued("b2.png", LM_SECOND(OTHER_BLOCK))
    ]);
    expect(groups.find((group) => group.names.join() === "b2.png")?.plan).toEqual({ action: "keep", reason: UNMATCHED_PAGE_REASON });
  });

  test("a later screenshot alone keeps its file with the parser's reason", () => {
    const [group] = planLinemanOrders([queued("2.png", LM_SECOND())]);
    expect(group!.plan.action).toBe("keep");
    expect(group!.plan.action === "keep" && group!.plan.reason).toMatch(/top of the order page/u);
  });

  test("no LINE MAN page, no plan", () => {
    expect(planLinemanOrders([])).toEqual([]);
  });
});

describe("planLinemanOrders: two orders to one address, told apart by the phone's clock", () => {
  // The status-bar clock is the first line's first word; "" removes it.
  const clocked = (lines: readonly string[], clock: string) => [`${clock} 4G 53`.trim(), ...lines.slice(1)];
  // Order B's second page: a dearer second dish, so its sums (and total 175.00) differ from order A's 145.00.
  const SECOND_B = () => LM_SECOND().map((line) => line
    .replace("ก๋วยเตี๋ยว ทดสอบ $ 60.00", "ก๋วยเตี๋ยว ทดสอบ $ 90.00").replace("Food $ 180.00", "Food $ 210.00")
    .replace("Pay with mobile banking $ 145.00", "Pay with mobile banking $ 175.00").replace("Total ? B145.00", "Total ? B175.00"));
  const firstA = (clock = "01:54") => queued("a1.png", clocked(LM_FIRST("000000001"), clock));
  const firstB = (clock = "01:59") => queued("b1.png", clocked(LM_FIRST("000000002"), clock));
  const secondA = (clock = "01:54") => queued("a2.png", clocked(LM_SECOND(), clock));
  const secondB = (clock = "01:59") => queued("b2.png", clocked(SECOND_B(), clock));
  const byFirst = (groups: ReturnType<typeof planLinemanOrders>) => Object.fromEntries(groups.map((group) => [group.names[0]!, group]));

  test("the live case: each order takes the second page shot at its own minute, however they were added", () => {
    for (const pages of [
      [firstA(), secondA(), firstB(), secondB()],
      [secondB(), firstB(), secondA(), firstA()]
    ]) {
      const groups = byFirst(planLinemanOrders(pages));
      const a = Object.values(groups).find((group) => group.names.includes("a1.png"))!;
      const b = Object.values(groups).find((group) => group.names.includes("b1.png"))!;
      expect([...a.names].sort()).toEqual(["a1.png", "a2.png"]);
      expect([...b.names].sort()).toEqual(["b1.png", "b2.png"]);
      expect(a.plan).toMatchObject({ action: "capture", value: { bookingId: "LMF-260912-000000001", totalMinor: "14500" } });
      expect(b.plan).toMatchObject({ action: "capture", value: { bookingId: "LMF-260912-000000002", totalMinor: "17500" } });
    }
  });

  test("a page within two minutes of both first pages stays mixed", () => {
    const groups = planLinemanOrders([firstA("01:54"), firstB("01:55"), secondA("01:56")]);
    expect(groups.find((group) => group.names.join() === "a2.png")?.plan).toEqual({ action: "keep", reason: TWO_ORDERS_REASON });
    expect(groups.every((group) => group.plan.action === "keep")).toBe(true);
  });

  test("a missing clock, on the page or on a first page, holds the page as mixed", () => {
    for (const pages of [
      [firstA(), firstB(), secondA("")],
      [firstA(""), firstB(), secondA()],
      [firstA(), firstB(""), secondB()],
      // A rival with no readable clock cannot be ruled out, even when the page's own match is clean.
      [firstA(), firstB(""), secondA()]
    ]) {
      const groups = planLinemanOrders(pages);
      const loose = groups.find((group) => group.names.length === 1 && group.names[0]!.endsWith("2.png"));
      expect(loose?.plan).toEqual({ action: "keep", reason: TWO_ORDERS_REASON });
    }
  });

  test("the window wraps midnight: an order that starts 23:59 takes a page shot at 00:01, and one starting 00:10 is ruled out", () => {
    const groups = planLinemanOrders([firstA("23:59"), firstB("00:10"), secondA("00:01")]);
    expect(groups.find((group) => group.names.includes("a1.png"))?.names.sort()).toEqual(["a1.png", "a2.png"]);
  });

  test("an order whose first page was shot more than two minutes after the page is ruled out; two minutes or less is not", () => {
    // B's first page is 3 minutes after the page: B cannot be its order, so it joins A (clock 01:50 is before it).
    const ruledOut = planLinemanOrders([firstA("01:50"), firstB("01:56"), secondA("01:53")]);
    expect(ruledOut.find((group) => group.names.includes("a1.png"))?.names.sort()).toEqual(["a1.png", "a2.png"]);
    // 2 minutes after: still in reach, so both remain and the page is held.
    const inReach = planLinemanOrders([firstA("01:50"), firstB("01:55"), secondA("01:53")]);
    expect(inReach.find((group) => group.names.join() === "a2.png")?.plan).toEqual({ action: "keep", reason: TWO_ORDERS_REASON });
  });

  test("the reviewer's timeline: A at 10:00, B at 10:05, then A's second page at 10:06 is never captured into B", () => {
    for (const pages of [
      [firstA("10:00"), firstB("10:05"), secondA("10:06"), secondB("10:05")],
      [secondB("10:05"), secondA("10:06"), firstB("10:05"), firstA("10:00")]
    ]) {
      const groups = planLinemanOrders(pages);
      const withA2 = groups.find((group) => group.names.includes("a2.png"))!;
      expect(withA2.names).not.toContain("b1.png");
      expect(withA2.names).not.toContain("b2.png");
      for (const group of groups) {
        // Whatever is captured must be one order's own pages.
        if (group.plan.action === "capture") {
          const order = group.plan.value.bookingId.endsWith("1") ? "a" : "b";
          expect(group.names.every((name) => name.startsWith(order))).toBe(true);
        }
      }
    }
  });

  test("known limit: a second page shot over two minutes BEFORE its own first page joins an earlier order in reach", () => {
    // B's page was shot 5 minutes before B's first page, so B is ruled out and A remains. Pinned so a change to this is noticed.
    const groups = planLinemanOrders([firstA("10:00"), firstB("10:10"), secondB("10:05")]);
    expect(groups.find((group) => group.names.includes("b2.png"))?.names).toContain("a1.png");
  });

  test("the clock is read above the heading only: a time printed below it is not the clock", () => {
    expect(orderPage(clocked(LM_FIRST(), "01:54")).shotAt).toBe(114);
    expect(orderPage(clocked(LM_FIRST(), "")).shotAt).toBeNull();
    // The first page prints its order time "21:00" and a later one "10:14" below the heading.
    expect(orderPage([...clocked(LM_SECOND(), "").slice(0, -1), "10:14", "Reorder"]).shotAt).toBeNull();
  });
});

describe("addedTogether", () => {
  test("within the window, at its edge, and past it", () => {
    expect(addedTogether([T0, minutesAfter(3), minutesAfter(10)])).toBe(true);
    expect(addedTogether([T0, minutesAfter(11)])).toBe(false);
    expect(addedTogether([minutesAfter(11), T0])).toBe(false);
  });

  test("a missing or unreadable time, or no time at all, is not together", () => {
    expect(addedTogether([T0, null])).toBe(false);
    expect(addedTogether([T0, "garbage"])).toBe(false);
    expect(addedTogether([])).toBe(false);
  });
});

describe("the remembered-file memory", () => {
  test("reads a build-stamped name-to-kind object, and treats anything else as empty", () => {
    const raw = '{"a.png":{"kind":"unrecognised","build":"abc"},"b.jpg":{"kind":"slip-review","build":"abc"},"c.png":{"kind":"other","build":"abc"},"d.png":3}';
    expect([...parseRemembered(raw, "abc")]).toEqual([["a.png", "unrecognised"], ["b.jpg", "slip-review"]]);
    for (const bad of [null, "", "not json", '["a.png","b.jpg"]', "3", "null"]) expect(parseRemembered(bad, "abc").size).toBe(0);
  });

  test("the key is v3, so what v1 stored (a bare list of names, under the old key) is never read", () => {
    expect(REMEMBERED_KEY).toBe("inbox:unrecognised:v3");
    expect(parseRemembered('["a.png"]', "abc").size).toBe(0);
  });

  // D-252: 20 K PLUS slips stayed "needs checking" after a deploy fixed their date, because the
  // verdict outlived the build that made it. Every kind is now dropped on another build.
  test("every entry is read on the build that stored it and dropped on another, unstamped ones too", () => {
    const raw = '{"a.pdf":{"kind":"held","reason":"overlap","build":"abc"},"b.png":{"kind":"slip-review","build":"abc"},"c.pdf":{"kind":"held","reason":"warnings","build":"old"},"d.pdf":{"kind":"held","build":"abc"},"e.png":"unrecognised"}';
    expect([...parseRemembered(raw, "abc")]).toEqual([
      ["a.pdf", { kind: "held", reason: "overlap", build: "abc" }], ["b.png", "slip-review"]
    ]);
    expect(parseRemembered(raw, "next").size).toBe(0);
  });

  test("keeps a held entry only while its file is in the queue", () => {
    const held = { kind: "held", reason: "overlap", build: "abc" } as const;
    const remembered = new Map<string, RememberedKind>([["a.pdf", held], ["gone.pdf", held]]);
    expect(pruneRemembered(remembered, ["a.pdf"], "abc")).toEqual({ "a.pdf": held });
  });

  test("keeps only the names still in the queue, stamped with the build, and reads back what it stored", () => {
    const remembered = new Map<string, RememberedKind>([["b.png", "slip-review"], ["gone.png", "unrecognised"], ["a.png", "unrecognised"]]);
    const stored = pruneRemembered(remembered, ["a.png", "b.png", "c.png"], "abc");
    expect(stored).toEqual({ "a.png": { kind: "unrecognised", build: "abc" }, "b.png": { kind: "slip-review", build: "abc" } });
    expect([...parseRemembered(JSON.stringify(stored), "abc")]).toEqual([["a.png", "unrecognised"], ["b.png", "slip-review"]]);
  });
});

describe("what the owner reads", () => {
  test("progress", () => {
    expect(progressLine(3, 7)).toBe("Importing 3 of 7…");
  });

  test("the summary counts what was imported and the slips held for money in or out, not the files waiting", () => {
    expect(describeDrain({ receipts: 2, orders: 1, slips: 3 })).toBe("2 receipts and 1 LINE MAN order imported. 3 slips need money in or out.");
    expect(describeDrain({ receipts: 1, orders: 0, slips: 0 })).toBe("1 receipt imported.");
    expect(describeDrain({ receipts: 1, orders: 0, slips: 1 })).toBe("1 receipt imported. 1 slip needs money in or out.");
    expect(describeDrain({ receipts: 0, orders: 2, slips: 0 })).toBe("2 LINE MAN orders imported.");
    expect(describeDrain({ receipts: 0, orders: 0, slips: 2 })).toBe("2 slips need money in or out.");
    expect(describeDrain({ receipts: 0, orders: 0, slips: 0 })).toBe("Nothing was imported.");
    expect(describeDrain({ receipts: 0, orders: 0, ordersAlready: 2, slips: 0 })).toBe("2 LINE MAN orders were already in the ledger.");
    expect(describeDrain({ receipts: 1, orders: 0, receiptsAlready: 1, ordersAlready: 1, slips: 0 }))
      .toBe("1 receipt imported. 1 receipt and 1 LINE MAN order were already in the ledger.");
    expect(describeDrain({ receipts: 0, orders: 0, receiptsAlready: 1, slips: 0 })).toBe("1 receipt was already in the ledger.");
    expect(describeDrain({ receipts: 0, orders: 0, slips: 0, statementsEmpty: 1 })).toBe("1 statement had no transactions.");
  });

  test("after the answer, the slips captured, already held and left in the queue", () => {
    expect(describeSlipCapture({ captured: 2, duplicates: 0, kept: 0 }, "withdrawal")).toBe("2 slips captured as money out.");
    expect(describeSlipCapture({ captured: 1, duplicates: 1, kept: 2 }, "deposit"))
      .toBe("1 slip captured as money in. 1 slip was already in the ledger. 2 slips stay in the queue.");
    expect(describeSlipCapture({ captured: 0, duplicates: 2, kept: 1 }, "deposit")).toBe("2 slips were already in the ledger. 1 slip stays in the queue.");
    expect(describeSlipCapture({ captured: 0, duplicates: 2, kept: 0, filled: 1 }, "deposit")).toBe("2 slips were already in the ledger; payee or memo added to 1.");
    expect(describeSlipCapture({ captured: 0, duplicates: 0, kept: 0 }, "deposit")).toBe("No slips were captured.");
  });
});

// --- drainInbox, with its dependencies replaced by fakes ---

// The test environment's Blob cannot be read back, so each fake download is labelled with its name.
const labels = new WeakMap<Blob, string>();
const blobOf = (label: string) => { const blob = new Blob([label]); labels.set(blob, label); return blob; };
const file = (name: string, created_at: string | null = T0) => ({ name, created_at, size: 1 });

type FakeOptions = {
  words?: Record<string, OcrWord[]>;
  removes?: (names: readonly string[]) => number;
  fail?: "receipt" | "order";
  /** Receipt and order captures the ledger answers as already held. */
  already?: boolean;
  remembered?: Record<string, RememberedKind>;
  /** An image's name to what the QR scan "found"; an image not listed has no QR. */
  scans?: Record<string, SlipScanAttempt>;
  /** What the statement route answers; defaults to captured. */
  statement?: StatementImportPosted;
  /** What the receipt reader says about any PDF; defaults to "cannot open it" (an encrypted statement). */
  pdf?: PdfReply;
  /** What the enlarged re-read of one box answers (D-257); defaults to a failure. */
  crop?: () => ImageWordsRead | Promise<ImageWordsRead>;
  /** What the enlarged re-read of the amount's box answers at a scale (D-259); defaults to a failure. */
  amountCrop?: (scale: number) => ImageWordsRead | Promise<ImageWordsRead>;
};

/** Fakes for everything outside the drain; `words` maps an image's name to what Vision "read". */
function fakes(options: FakeOptions = {}) {
  const calls = {
    statementPosts: [] as string[], ocr: [] as string[], scans: [] as string[], downloads: [] as string[], removed: [] as string[][], receipts: 0, orders: 0, slipPosts: 0, rereads: [] as Array<{ name: string; box: Box }>, amountRereads: [] as number[],
    // Every scan and read in the order it happened, to show the scan comes first.
    order: [] as string[],
    saved: undefined as undefined | ReadonlyMap<string, RememberedKind>
  };
  const deps: DrainDeps = {
    download: async (name) => { calls.downloads.push(name); return { ok: true, value: blobOf(name) }; },
    remove: async (names) => { calls.removed.push([...names]); return { ok: true, value: options.removes ? options.removes(names) : names.length }; },
    readPdf: async () => options.pdf ?? { type: "error", message: "This file could not be opened as a PDF.", code: "UNREADABLE_PDF" },
    readImage: async (blob) => {
      const name = labels.get(blob)!;
      calls.ocr.push(name);
      calls.order.push(`ocr:${name}`);
      return { ok: true, words: options.words?.[name] ?? [] };
    },
    rereadBox: async (blob, box, crop) => {
      if (crop.field === "amount") {
        calls.amountRereads.push(crop.scale);
        return options.amountCrop ? options.amountCrop(crop.scale) : { ok: false, why: "The amount could not be read a second time." };
      }
      calls.rereads.push({ name: labels.get(blob)!, box });
      return options.crop ? options.crop() : { ok: false, why: "The year could not be read a second time." };
    },
    scanSlip: async (blob) => {
      const name = labels.get(blob)!;
      calls.scans.push(name);
      calls.order.push(`scan:${name}`);
      return options.scans?.[name] ?? { ok: false, code: "NO_QR_DETECTED", message: "No QR code was found." };
    },
    postSlip: async () => { calls.slipPosts += 1; return { ok: true, outcome: "captured" }; },
    postStatement: async (name) => {
      calls.statementPosts.push(name);
      return options.statement ?? { ok: true, answer: { kind: "captured" } };
    },
    postReceipt: async () => {
      calls.receipts += 1;
      return options.fail === "receipt" ? { ok: false, why: "The ledger could not be reached, so the receipt was not saved." } : { ok: true, already: options.already === true };
    },
    postOrder: async () => {
      calls.orders += 1;
      return options.fail === "order" ? { ok: false, why: "The order could not be saved." } : { ok: true, already: options.already === true };
    },
    memory: { load: () => new Map(Object.entries(options.remembered ?? {})), save: (remembered) => { calls.saved = new Map(remembered); } }
  };
  return { deps, calls };
}

describe("drainInbox", () => {
  const status = () => undefined;

  test("(a) a capture that fails removes nothing, and says why on the file", async () => {
    const { deps, calls } = fakes({ words: { "r.png": wholeReceipt() }, fail: "receipt" });
    const result = await drainInbox([file("r.png")], status, deps);
    expect(calls.receipts).toBe(1);
    expect(calls.removed).toEqual([]);
    expect(result.reasons["r.png"]).toMatch(/could not be reached/u);
    expect(result).toMatchObject({ receipts: 0, orders: 0, waiting: 1 });
  });

  test("a receipt that is stored leaves the queue and is counted", async () => {
    const { deps, calls } = fakes({ words: { "r.png": wholeReceipt() } });
    const result = await drainInbox([file("r.png")], status, deps);
    expect(calls.removed).toEqual([["r.png"]]);
    expect(result).toMatchObject({ receipts: 1, waiting: 0, reasons: {}, summary: "1 receipt imported." });
  });

  test("(b) a removal that Storage only partly did is not counted, and the files say so", async () => {
    const { deps } = fakes({
      words: {
        "top.png": tokens([...header("12345"), ...ITEMS.slice(0, 4), ...FOOTER]),
        "bottom.png": tokens([...header("12345"), ...ITEMS.slice(3), ...TAIL, ...FOOTER])
      },
      removes: (names) => names.length - 1
    });
    const result = await drainInbox([file("top.png"), file("bottom.png")], status, deps);
    expect(result).toMatchObject({ receipts: 0, waiting: 2 });
    expect(result.reasons["top.png"]).toMatch(/could not be removed/u);
    expect(result.reasons["bottom.png"]).toMatch(/could not be removed/u);
  });

  test("an image the scan FAILED on is not remembered as unrecognised, but one the scan answered about is", async () => {
    const failed = fakes({ scans: { "s.png": { ok: false, code: "SCAN_FAILED", message: "No QR reader could be loaded in this browser." } } });
    const failedResult = await drainInbox([file("s.png")], status, failed.deps);
    expect(failedResult.reasons["s.png"]).toBe(NOT_YET);
    expect(failed.calls.saved?.has("s.png")).toBe(false);

    const answered = fakes({});
    await drainInbox([file("s.png")], status, answered.deps);
    expect(answered.calls.saved?.get("s.png")).toBe("unrecognised");
  });

  test("(c) one stuck LINE MAN order does not stop the next: B is imported, A is kept", async () => {
    const { deps, calls } = fakes({
      words: {
        "a1.png": sentences(LM_FIRST("000000001", OWNER_BLOCK)),
        "b1.png": sentences(LM_FIRST("000000002", OTHER_BLOCK)),
        "b2.png": sentences(LM_SECOND(OTHER_BLOCK))
      }
    });
    const result = await drainInbox([file("a1.png"), file("b1.png"), file("b2.png")], status, deps);
    expect(calls.orders).toBe(1);
    expect(calls.removed).toEqual([["b1.png", "b2.png"]]);
    expect(result).toMatchObject({ orders: 1, waiting: 1 });
    expect(Object.keys(result.reasons)).toEqual(["a1.png"]);
    expect(result.summary).toBe("1 LINE MAN order imported.");
  });

  test("an order the ledger already held leaves the queue but is not called imported", async () => {
    const { deps, calls } = fakes({
      already: true,
      words: { "b1.png": sentences(LM_FIRST("000000002", OTHER_BLOCK)), "b2.png": sentences(LM_SECOND(OTHER_BLOCK)) }
    });
    const result = await drainInbox([file("b1.png"), file("b2.png")], status, deps);
    expect(calls.removed).toEqual([["b1.png", "b2.png"]]);
    expect(result).toMatchObject({ orders: 0, ordersAlready: 1, waiting: 0 });
    expect(result.summary).toBe("1 LINE MAN order was already in the ledger.");
  });

  test("LINE MAN pages added at different times are all kept, and nothing is posted", async () => {
    const { deps, calls } = fakes({ words: { "1.png": sentences(LM_FIRST()), "2.png": sentences(LM_SECOND()) } });
    const result = await drainInbox([file("1.png"), file("2.png", minutesAfter(30))], status, deps);
    expect(calls.orders).toBe(0);
    expect(calls.removed).toEqual([]);
    expect(result.reasons).toEqual({ "1.png": DIFFERENT_TIMES_REASON, "2.png": DIFFERENT_TIMES_REASON });
  });

  test("LINE images moved together are grouped by the time LINE received them, not the move", async () => {
    const lineName = (minutes: number, id: string) => `line-${Date.parse(minutesAfter(minutes))}-${id}.png`;
    const words = (a: string, b: string) => ({ [a]: sentences(LM_FIRST()), [b]: sentences(LM_SECOND()) });
    // Every file carries the same Storage time (T0), as after one move.
    const apart = fakes({ words: words(lineName(0, "1"), lineName(30, "2")) });
    const held = await drainInbox([file(lineName(0, "1")), file(lineName(30, "2"))], status, apart.deps);
    expect(apart.calls.orders).toBe(0);
    expect(Object.values(held.reasons)).toEqual([DIFFERENT_TIMES_REASON, DIFFERENT_TIMES_REASON]);

    const near = fakes({ words: words(lineName(0, "1"), lineName(2, "2")) });
    await drainInbox([file(lineName(0, "1")), file(lineName(2, "2"))], status, near.deps);
    expect(near.calls.orders).toBe(1);
  });

  test("(d) a file remembered as not recognised is not read by Vision again", async () => {
    const { deps, calls } = fakes({
      words: { "new.png": sentences(["Transfer successful", "Invented Sender"]), "old.png": wholeReceipt() },
      remembered: { "old.png": "unrecognised", "already-gone.png": "unrecognised" }
    });
    const result = await drainInbox([file("old.png"), file("new.png")], status, deps);
    expect(calls.ocr).toEqual(["new.png"]);
    expect(calls.downloads).toEqual(["new.png"]);
    expect(calls.scans).toEqual(["new.png"]);
    expect(result.reasons).toEqual({ "old.png": NOT_YET, "new.png": NOT_YET });
    // Pruning to the queue is the memory's own job (`pruneRemembered`); the drain hands it the new name too.
    expect([...calls.saved!.keys()].sort()).toEqual(["already-gone.png", "new.png", "old.png"]);
  });

  test("a recognised file is not added to the memory", async () => {
    const { deps, calls } = fakes({ words: { "r.png": wholeReceipt() } });
    await drainInbox([file("r.png")], status, deps);
    expect([...calls.saved!]).toEqual([]);
  });
});

// --- Statement PDFs ---

describe("planStatement", () => {
  test("captured and already-stored statements let the file go", () => {
    expect(planStatement({ kind: "captured" })).toEqual({ action: "capture", outcome: "captured" });
    expect(planStatement({ kind: "duplicate" })).toEqual({ action: "capture", outcome: "duplicate" });
    expect(planStatement({ kind: "empty" })).toEqual({ action: "capture", outcome: "empty" });
  });

  test("a locked or password-less statement stays, in plain words, with no review link", () => {
    expect(planStatement({ kind: "held", reason: "locked" })).toEqual({ action: "keep", reason: STATEMENT_LOCKED_REASON, review: false });
    expect(planStatement({ kind: "held", reason: "no-passwords" })).toEqual({ action: "keep", reason: STATEMENT_NO_PASSWORDS_REASON, review: false });
    expect(STATEMENT_LOCKED_REASON).toBe("None of the stored statement passwords opens this PDF.");
    expect(STATEMENT_NO_PASSWORDS_REASON).toBe("No statement password is set on the server yet.");
    expect(planStatement({ kind: "held", reason: "unreadable" })).toMatchObject({ action: "keep", review: false });
  });

  test("needs-account, warnings, overlap, confirm-failed and assembly codes stay with a review link", () => {
    expect(statementHeldReason("overlap")).toBe("Some rows of this statement are already in the ledger, so it waits for a look.");
    expect(statementNeedsReview("overlap")).toBe(true);
    for (const reason of ["needs-account", "warnings", "overlap", "confirm-failed", "NOT_CROSS_CHECKED"]) {
      const plan = planStatement({ kind: "held", reason });
      expect(plan).toMatchObject({ action: "keep", review: true });
      expect(statementHeldReason(reason)).not.toBe("");
    }
    expect(reviewHref("0b9f3c5e-1111-4222-8333-444455556666.pdf")).toBe("/import?inbox=0b9f3c5e-1111-4222-8333-444455556666.pdf");
  });
});

describe("drainInbox with statement PDFs", () => {
  const status = () => undefined;
  const NAME = "0b9f3c5e-1111-4222-8333-444455556666.pdf";

  test("a captured statement is removed only after the answer, and counted", async () => {
    const { deps, calls } = fakes();
    const result = await drainInbox([file(NAME)], status, deps);
    expect(calls.statementPosts).toEqual([NAME]);
    expect(calls.removed).toEqual([[NAME]]);
    expect(result).toMatchObject({ statements: 1, waiting: 0, reasons: {}, reviewable: [], summary: "1 statement imported." });
  });

  test("a statement already in the ledger is removed too, and said so rather than counted as imported", async () => {
    const { deps, calls } = fakes({ statement: { ok: true, answer: { kind: "duplicate" } } });
    const result = await drainInbox([file(NAME)], status, deps);
    expect(calls.removed).toEqual([[NAME]]);
    expect(result.waiting).toBe(0);
    expect(result).toMatchObject({ statements: 0, statementsAlready: 1, summary: "1 statement was already in the ledger." });
  });

  test("an overlapping statement is imported and says how many rows were new (D-260)", async () => {
    const { deps, calls } = fakes({ statement: { ok: true, answer: { kind: "captured", rowCount: 42, existingRows: 30 } } });
    const result = await drainInbox([file(NAME)], status, deps);
    expect(calls.removed).toEqual([[NAME]]);
    expect(result).toMatchObject({
      statements: 1, waiting: 0, reviewable: [],
      summary: "1 statement imported. Statement: 12 new rows imported, 30 already in the ledger."
    });
  });

  test("a statement whose rows are all stored is let go and reported, not imported (D-260)", async () => {
    const { deps, calls } = fakes({ statement: { ok: true, answer: { kind: "duplicate", rowCount: 42 } } });
    const result = await drainInbox([file(NAME)], status, deps);
    expect(calls.removed).toEqual([[NAME]]);
    expect(result).toMatchObject({
      statements: 0, statementsAlready: 1, waiting: 0,
      summary: "1 statement was already in the ledger. Statement: All 42 rows are already in the ledger."
    });
  });

  test("the row sentence wording (D-260)", () => {
    expect(describeStatementRows("s.pdf", { kind: "captured", rowCount: 2, existingRows: 1 })).toBe("s.pdf: 1 new row imported, 1 already in the ledger.");
    expect(describeStatementRows("s.pdf", { kind: "duplicate", rowCount: 1 })).toBe("s.pdf: Its 1 row is already in the ledger.");
    expect(describeStatementRows("s.pdf", { kind: "captured", rowCount: 4, existingRows: 0 })).toBeNull();
    expect(describeStatementRows("s.pdf", { kind: "captured" })).toBeNull();
    expect(describeStatementRows("s.pdf", { kind: "duplicate" })).toBeNull();
  });

  test("a held statement stays with its reason and a review link when Import can help", async () => {
    const { deps, calls } = fakes({ statement: { ok: true, answer: { kind: "held", reason: "needs-account" } } });
    const result = await drainInbox([file(NAME)], status, deps);
    expect(calls.removed).toEqual([]);
    expect(result).toMatchObject({ statements: 0, waiting: 1, reviewable: [NAME], summary: "Nothing was imported." });
    expect(result.reasons[NAME]).toBe(statementHeldReason("needs-account"));
  });

  test("a locked statement stays with no link", async () => {
    const { deps, calls } = fakes({ statement: { ok: true, answer: { kind: "held", reason: "locked" } } });
    const result = await drainInbox([file(NAME)], status, deps);
    expect(calls.removed).toEqual([]);
    expect(result.reasons[NAME]).toBe(STATEMENT_LOCKED_REASON);
    expect(result.reviewable).toEqual([]);
  });

  test("a held statement is remembered with this build, and the next drain skips download and server read", async () => {
    const first = fakes({ statement: { ok: true, answer: { kind: "held", reason: "overlap" } } });
    await drainInbox([file(NAME)], status, first.deps);
    expect(first.calls.saved?.get(NAME)).toEqual({ kind: "held", reason: "overlap", build: BUILD_ID });

    const second = fakes({ remembered: { [NAME]: { kind: "held", reason: "overlap", build: BUILD_ID } } });
    const result = await drainInbox([file(NAME)], status, second.deps);
    expect(second.calls.downloads).toEqual([]);
    expect(second.calls.statementPosts).toEqual([]);
    expect(result.reasons[NAME]).toBe(statementHeldReason("overlap"));
    expect(result.reviewable).toEqual([NAME]);
    expect(second.calls.saved?.has(NAME)).toBe(true);
  });

  test("locked, password-less, needs-account, confirm-failed and failed statements are not remembered", async () => {
    for (const statement of [
      { ok: true, answer: { kind: "held", reason: "locked" } },
      { ok: true, answer: { kind: "held", reason: "no-passwords" } },
      { ok: true, answer: { kind: "held", reason: "needs-account" } },
      { ok: true, answer: { kind: "held", reason: "confirm-failed" } },
      { ok: false, why: "x" }
    ] as const) {
      const { deps, calls } = fakes({ statement });
      await drainInbox([file(NAME)], status, deps);
      expect(calls.saved?.has(NAME)).toBe(false);
    }
  });

  test("a failed request keeps the file with the technical reason and is not remembered as unrecognised", async () => {
    const { deps, calls } = fakes({ statement: { ok: false, why: "The statement could not be fetched. (LOOKUP_FAILED)" } });
    const result = await drainInbox([file(NAME)], status, deps);
    expect(calls.removed).toEqual([]);
    expect(result.reasons[NAME]).toMatch(/LOOKUP_FAILED/u);
    expect([...calls.saved!]).toEqual([]);
  });

  test("a PDF the receipt reader refuses for another reason never reaches the statement route", async () => {
    const { deps, calls } = fakes({ pdf: { type: "error", message: "This PDF is not a 7-Eleven e-tax receipt this app can read.", code: "UNKNOWN_FORM" } });
    const result = await drainInbox([file(NAME)], status, deps);
    expect(calls.statementPosts).toEqual([]);
    expect(result.reasons[NAME]).toBe(NOT_YET);
  });

  test("a captured statement whose removal fails is not counted and says so", async () => {
    const { deps } = fakes({ removes: () => 0 });
    const result = await drainInbox([file(NAME)], status, deps);
    expect(result).toMatchObject({ statements: 0, waiting: 1 });
    expect(result.reasons[NAME]).toMatch(/could not be removed/u);
  });

  test("describeDrain names statements", () => {
    expect(describeDrain({ receipts: 1, orders: 0, slips: 0, statements: 2 })).toBe("1 receipt and 2 statements imported.");
  });
});

// --- Bank slips ---

const line = (top: number, entries: Array<[string, number, number]>): OcrWord[] =>
  entries.map(([text, left, right]) => ({ text, left, right, top, bottom: top + 20 }));
/** An invented SCB slip's words: the amount under its own label, and a fee below it to be ignored. */
const slipWords = (amount = "1,250.00"): OcrWord[] => [
  ...line(100, [["จำนวนเงิน", 10, 90], [amount, 300, 380], ["บาท", 390, 420]]),
  ...line(140, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360], ["บาท", 390, 420]])
];
const identity = { bankCode: "SCB", bankQrCode: "014", reference: "202607141234567890AB" } as const;
const slipScan = (reference = identity.reference): SlipScanResult =>
  ({ ok: true, identity: { ...identity, reference }, payload: `INVENTED-PAYLOAD-${reference}`, scale: 1, candidates: 1 });

describe("drainInbox with bank slips", () => {
  const status = () => undefined;

  test("a slip is told by its QR before any Vision read, is read once, and never reaches recogniseImage", async () => {
    // Its words would be a whole receipt if the receipt recogniser were ever shown them.
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": [...slipWords(), ...wholeReceipt()] } });
    const result = await drainInbox([file("s.png")], status, deps);
    expect(calls.order).toEqual(["scan:s.png", "ocr:s.png"]);
    expect(calls.ocr).toEqual(["s.png"]);
    expect(calls.receipts).toBe(0);
    expect(result.receipts).toBe(0);
  });

  test("a QR that is not a slip's falls through to the receipt path unchanged", async () => {
    const { deps, calls } = fakes({
      scans: { "r.png": { ok: false, code: "NO_SLIP_QR_DETECTED", message: "This QR code is not a slip's." } },
      words: { "r.png": wholeReceipt() }
    });
    const result = await drainInbox([file("r.png")], status, deps);
    expect(calls.order).toEqual(["scan:r.png", "ocr:r.png"]);
    expect(calls.receipts).toBe(1);
    expect(result).toMatchObject({ receipts: 1, slips: [] });
  });

  test("a ready slip is returned with what the capture needs, and is not removed or captured during the drain", async () => {
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": slipWords() } });
    const result = await drainInbox([file("s.png")], status, deps);
    expect(result.slips).toEqual([{
      name: "s.png",
      payload: `INVENTED-PAYLOAD-${identity.reference}`,
      identity,
      occurredOn: "2026-07-14",
      occurredAtTime: null,
      amountMinor: "125000",
      ...proposeSlipText(slipWords(), identity.bankCode)
    }]);
    expect(calls.removed).toEqual([]);
    expect(calls.slipPosts).toBe(0);
    expect(result.reasons).toEqual({ "s.png": SLIP_WAITING_REASON });
    // The drain's summary leaves slips out: the page captures them as money out and says so (D-252).
    expect(result).toMatchObject({ waiting: 1, summary: "Nothing was imported." });
    // Waiting for the capture is not a verdict: a slip whose capture failed must be offered again.
    expect([...calls.saved!]).toEqual([]);
  });

  test("a slip needing checking is kept with the reason and where to type it, and remembered", async () => {
    // No amount label at all: no box to re-read, so the verdict is definite (D-259).
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": slipWords().slice(3) } });
    const result = await drainInbox([file("s.png")], status, deps);
    expect(calls.amountRereads).toEqual([]);
    expect(result.slips).toEqual([]);
    expect(calls.removed).toEqual([]);
    expect(result.reasons["s.png"]).toMatch(/\.$/u);
    expect(result.reasons["s.png"]).not.toMatch(/remove it here/u);
    // The row offers "Add on Slips" instead of the sentence (D-261).
    expect(result.slipReview).toEqual(["s.png"]);
    expect([...calls.saved!]).toEqual([["s.png", "slip-review"]]);
  });

  test("a slip remembered as needing checking is skipped without a download, a scan or a Vision read", async () => {
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": slipWords() }, remembered: { "s.png": "slip-review" } });
    const result = await drainInbox([file("s.png")], status, deps);
    expect(calls.downloads).toEqual([]);
    expect(calls.scans).toEqual([]);
    expect(calls.ocr).toEqual([]);
    expect(result.reasons).toEqual({ "s.png": SLIP_REVIEW_REMEMBERED_REASON });
    expect(result.slipReview).toEqual(["s.png"]);
    expect(calls.saved!.get("s.png")).toBe("slip-review");
  });

  test("a reader that could not be reached is not remembered, so the next open reads the slip again", async () => {
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() } });
    const unreachable: DrainDeps = { ...deps, readImage: async () => ({ ok: false, why: "The reader could not be reached." }) };
    const result = await drainInbox([file("s.png")], status, unreachable);
    expect(result.reasons["s.png"]).toMatch(/^The reader could not be reached\./u);
    expect([...calls.saved!]).toEqual([]);
  });

  test("a slip and a receipt in one drain are each handled by their own path", async () => {
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": slipWords(), "r.png": wholeReceipt() } });
    const result = await drainInbox([file("s.png"), file("r.png")], status, deps);
    expect(calls.removed).toEqual([["r.png"]]);
    expect(result.slips.map((slip) => slip.name)).toEqual(["s.png"]);
    expect(result).toMatchObject({ receipts: 1, waiting: 1, summary: "1 receipt imported." });
  });
});

describe("drainInbox reads files concurrently", () => {
  const queue = ["s1.png", "top.png", "s2.png", "bottom.png", "b1.png", "x.png", "b2.png"];
  const words = {
    "s1.png": slipWords(),
    "s2.png": slipWords("300.00"),
    "top.png": tokens([...header("12345"), ...ITEMS.slice(0, 4), ...FOOTER]),
    "bottom.png": tokens([...header("12345"), ...ITEMS.slice(3), ...TAIL, ...FOOTER]),
    "b1.png": sentences(LM_FIRST("000000002", OTHER_BLOCK)),
    "b2.png": sentences(LM_SECOND(OTHER_BLOCK))
  };
  const scans = { "s1.png": slipScan(), "s2.png": slipScan("202607141234567890CD" as typeof identity.reference) };
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  /** The fakes with every Vision read delayed by `delayOf(name)` and the reads in flight counted. */
  function slowFakes(delayOf: (name: string) => number) {
    const base = fakes({ words, scans });
    const flight = { now: 0, peak: 0 };
    const deps: DrainDeps = {
      ...base.deps,
      readImage: async (blob) => {
        flight.now += 1;
        flight.peak = Math.max(flight.peak, flight.now);
        await sleep(delayOf(labels.get(blob)!));
        flight.now -= 1;
        return base.deps.readImage(blob);
      }
    };
    return { deps, calls: base.calls, flight };
  }

  test("reads that finish out of order still give slips and pages in queue order", async () => {
    // The later the file is queued, the sooner its read answers.
    const slow = slowFakes((name) => (queue.length - queue.indexOf(name)) * 15);
    const slowResult = await drainInbox(queue.map((name) => file(name)), () => undefined, slow.deps);
    expect(slow.calls.ocr).not.toEqual(queue);

    const even = slowFakes(() => 0);
    const evenResult = await drainInbox(queue.map((name) => file(name)), () => undefined, even.deps);

    expect(slowResult.slips.map((slip) => slip.name)).toEqual(["s1.png", "s2.png"]);
    expect(slow.calls.removed).toEqual([["top.png", "bottom.png"], ["b1.png", "b2.png"]]);
    expect(slowResult).toEqual(evenResult);
    expect(slow.calls.saved).toEqual(even.calls.saved);
  });

  test("at most DRAIN_CONCURRENCY reads are in flight at once, and progress counts completed files", async () => {
    const lines: string[] = [];
    const slow = slowFakes(() => 10);
    await drainInbox(queue.map((name) => file(name)), (line) => lines.push(line), slow.deps);
    expect(slow.flight.peak).toBe(DRAIN_CONCURRENCY);
    expect(lines).toEqual(Array.from({ length: queue.length + 1 }, (_, done) => progressLine(done, queue.length)));
  });
});

describe("captureSlips", () => {
  const ready = (name: string, amountMinor = "125000"): ReadySlip => ({
    name, payload: `INVENTED-PAYLOAD-${name}`, identity, occurredOn: "2026-07-14", occurredAtTime: "09:05", amountMinor,
    counterparty: null, note: null
  });

  /** Fakes for the two things `captureSlips` uses; every call goes into one ordered log. */
  function slipFakes(options: { post?: (name: string) => SlipPosted; removes?: (names: readonly string[]) => number } = {}) {
    const log: string[] = [];
    const bodies: ReturnType<typeof slipPostBody>[] = [];
    const deps = {
      postSlip: async (body: ReturnType<typeof slipPostBody>): Promise<SlipPosted> => {
        bodies.push(body);
        const name = (body.qrPayload ?? "").replace("INVENTED-PAYLOAD-", "");
        log.push(`post:${name}`);
        return options.post ? options.post(name) : { ok: true, outcome: "captured" };
      },
      remove: async (names: readonly string[]) => {
        log.push(`remove:${names.join("+")}`);
        return { ok: true as const, value: options.removes ? options.removes(names) : names.length };
      }
    };
    return { deps, log, bodies };
  }

  test("a withdrawal is posted negative and a deposit positive, with the request the batch form sends", async () => {
    const out = slipFakes();
    await captureSlips([ready("a.png")], "withdrawal", out.deps);
    expect(out.bodies[0]).toEqual({
      qrPayload: "INVENTED-PAYLOAD-a.png", bankCode: "SCB", bankQrCode: "014", slipReference: identity.reference, kind: "withdrawal",
      amountMinor: "-125000", currency: "THB", occurredOn: "2026-07-14", occurredAtTime: "09:05", counterparty: null, categoryId: null, note: null
    });
    // The payee and memo read off the slip travel in the request as they were read (D-252).
    const named = slipFakes();
    await captureSlips([{ ...ready("a.png"), counterparty: "INVENTED PAYEE CO", note: "invented memo" }], "withdrawal", named.deps);
    expect(named.bodies[0]).toMatchObject({ counterparty: "INVENTED PAYEE CO", note: "invented memo" });
    const into = slipFakes();
    await captureSlips([ready("a.png")], "deposit", into.deps);
    expect(into.bodies[0]).toMatchObject({ kind: "deposit", amountMinor: "125000" });
  });

  test("a file is removed only after the ledger answered, one slip at a time and in order", async () => {
    const { deps, log } = slipFakes({ post: (name) => ({ ok: true, outcome: name === "b.png" ? "duplicate" : "captured" }) });
    const result = await captureSlips([ready("a.png"), ready("b.png")], "withdrawal", deps);
    expect(log).toEqual(["post:a.png", "remove:a.png", "post:b.png", "remove:b.png"]);
    expect(result).toEqual({ captured: 1, duplicates: 1, filled: 0, reasons: {}, slipReview: [] });
  });

  test("a duplicate the re-send filled is counted among the duplicates as filled", async () => {
    const { deps } = slipFakes({ post: (name) => ({ ok: true, outcome: "duplicate", filled: name === "a.png" }) });
    const result = await captureSlips([ready("a.png"), ready("b.png")], "withdrawal", deps);
    expect(result).toEqual({ captured: 0, duplicates: 2, filled: 1, reasons: {}, slipReview: [] });
  });

  test("a refused capture keeps its file and says why, and the next slip still goes through", async () => {
    const { deps, log } = slipFakes({ post: (name) => (name === "a.png" ? { ok: false, why: "The ledger could not be reached." } : { ok: true, outcome: "captured" }) });
    const result = await captureSlips([ready("a.png"), ready("b.png")], "deposit", deps);
    expect(log).toEqual(["post:a.png", "post:b.png", "remove:b.png"]);
    expect(result).toEqual({ captured: 1, duplicates: 0, filled: 0, reasons: { "a.png": "The ledger could not be reached." }, slipReview: [] });
  });

  test("a confirmation that could not be read keeps the file, and nothing is removed", async () => {
    const { deps, log } = slipFakes({ post: () => ({ ok: false, why: SLIP_UNCONFIRMED_REASON }) });
    const result = await captureSlips([ready("a.png")], "deposit", deps);
    expect(log).toEqual(["post:a.png"]);
    expect(result.reasons["a.png"]).toBe(SLIP_UNCONFIRMED_REASON);
  });

  test("a removal Storage did not do keeps the file, says so and does not count it", async () => {
    const { deps } = slipFakes({ removes: () => 0 });
    const result = await captureSlips([ready("a.png")], "deposit", deps);
    expect(result).toMatchObject({ captured: 0, duplicates: 0 });
    expect(result.reasons["a.png"]).toMatch(/could not be removed/u);
  });

  test("a slip the ledger refused itself (409) is remembered as needing checking; a network failure is not", async () => {
    let saved: ReadonlyMap<string, RememberedKind> | undefined;
    const memory = {
      load: () => new Map<string, RememberedKind>([["old.png", "unrecognised"]]),
      save: (remembered: ReadonlyMap<string, RememberedKind>) => { saved = new Map(remembered); }
    };
    const { deps } = slipFakes({
      post: (name) => name === "a.png"
        ? { ok: false, why: "A slip with the same bank, date, time and amount is already stored.", settled: true }
        : { ok: false, why: "This slip could not be captured." }
    });
    const result = await captureSlips([ready("a.png"), ready("b.png")], "withdrawal", { ...deps, memory });
    expect(result.reasons["a.png"]).toMatch(/already stored/u);
    expect([...saved!]).toEqual([["old.png", "unrecognised"], ["a.png", "slip-review"]]);
    expect(result.slipReview).toEqual(["a.png"]);
  });

  test("nothing is saved when no slip was refused by the ledger itself", async () => {
    let saves = 0;
    const memory = { load: () => new Map<string, RememberedKind>(), save: () => { saves += 1; } };
    const { deps } = slipFakes({ post: () => ({ ok: false, why: "This slip could not be captured." }) });
    await captureSlips([ready("a.png")], "withdrawal", { ...deps, memory });
    expect(saves).toBe(0);
  });

  test("the capture request marks a 409 with a reason settled, and a 500 or 401 not", async () => {
    const answer = (status: number) => vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "invented reason" }), { status }));
    const post = browserDrainDeps({} as never, "uid").postSlip;
    const body = slipPostBody(ready("a.png"), "withdrawal", "-125000");
    try {
      answer(409);
      expect(await post(body)).toEqual({ ok: false, why: "invented reason", settled: true });
      answer(500);
      expect(await post(body)).toEqual({ ok: false, why: "invented reason" });
      answer(401);
      expect(await post(body)).toEqual({ ok: false, why: "invented reason" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("an amount the ledger cannot store is kept without being sent", async () => {
    const { deps, log } = slipFakes();
    const result = await captureSlips([ready("a.png", "12.5")], "deposit", deps);
    expect(log).toEqual([]);
    expect(result.reasons["a.png"]).toMatch(/not one this ledger can store/u);
  });
});

// --- The printed year, read a second time (D-257) ---
// A Krungthai slip whose QR reference carries no date (17 characters, no 8-digit run), so the printed
// date is the only source. Vision reads "2569" as "2559" on the whole slip; the year's own box, cropped
// and enlarged, reads right. Every value is invented.

// --- The amount, read a second time from its own enlarged box (D-259) ---
// Vision read "23.00" as "23,00" on a whole slip and correctly on the amount's crop. Every value is invented.

describe("drainInbox rereads an amount the strict grammar refused", () => {
  const status = () => undefined;
  /** The crop's words: the label and the figure beside it, as `locateAmount`'s box holds them. */
  const amountCrop = (figure: string): ImageWordsRead =>
    ({ ok: true, words: [{ text: "จำนวนเงิน", left: 0, right: 160, top: 0, bottom: 40 }, { text: figure, left: 400, right: 520, top: 0, bottom: 40 }] });

  test("an amount misread 23,00 and read 23.00 on its 2x crop is captured, with one extra read", async () => {
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": slipWords("23,00") }, amountCrop: () => amountCrop("23.00") });
    const result = await drainInbox([file("s.png")], status, deps);
    expect(calls.amountRereads).toEqual([2]);
    expect(result.slips).toHaveLength(1);
    expect(result.slips[0]).toMatchObject({ amountMinor: "2300", occurredOn: "2026-07-14" });
  });

  test("a 2x crop that still fails the grammar is read again at 3x, and 3x's value is used", async () => {
    const { deps, calls } = fakes({
      scans: { "s.png": slipScan() }, words: { "s.png": slipWords("23,00") }, amountCrop: (scale) => amountCrop(scale === 2 ? "23,00" : "23.00")
    });
    const result = await drainInbox([file("s.png")], status, deps);
    expect(calls.amountRereads).toEqual([2, 3]);
    expect(result.slips[0]).toMatchObject({ amountMinor: "2300" });
  });

  test("a crop that reads the same lenient 23,00 at both scales is still refused: no lenient path", async () => {
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": slipWords("23,00") }, amountCrop: () => amountCrop("23,00") });
    const result = await drainInbox([file("s.png")], status, deps);
    expect(calls.amountRereads).toEqual([2, 3]);
    expect(result.slips).toEqual([]);
    expect(result.reasons["s.png"]).toMatch(/^That does not read as a plain amount\./u);
  });

  test("both crop reads failing keeps the original reason and is not remembered, so the next open reads again", async () => {
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": slipWords("23,00") } });
    const result = await drainInbox([file("s.png")], status, deps);
    expect(calls.amountRereads).toEqual([2, 3]);
    expect(result.slips).toEqual([]);
    expect(result.reasons["s.png"]).toMatch(/^That does not read as a plain amount\./u);
    expect([...calls.saved!]).toEqual([]);
  });

  test("a crop read that throws counts as a failed read and is not remembered", async () => {
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": slipWords("23,00") }, amountCrop: () => { throw new Error("boom"); } });
    const result = await drainInbox([file("s.png")], status, deps);
    expect(calls.amountRereads).toEqual([2, 3]);
    expect(result.reasons["s.png"]).toMatch(/^That does not read as a plain amount\./u);
    expect([...calls.saved!]).toEqual([]);
  });

  test("a slip whose QR and printed dates disagree is a definite verdict: no second read, and remembered", async () => {
    const words = [...slipWords(), ...line(180, [["15", 10, 40], ["ก.ค.", 45, 100], ["2569", 105, 170]])];
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": words } });
    const result = await drainInbox([file("s.png")], status, deps);
    expect(calls.amountRereads).toEqual([]);
    expect(result.reasons["s.png"]).toMatch(/disagree/u);
    expect([...calls.saved!]).toEqual([["s.png", "slip-review"]]);
  });
});

describe("classifySlipRereadingYear marks what a retry could change (D-259)", () => {
  const base = { reference: identity.reference, bankCode: "SCB" as const, readerRefusal: null, window: { earliest: "2016-01-01", latest: "2027-12-31" }, today: new Date("2026-10-07T05:00:00Z") };
  const never = async () => ({ ok: false as const });

  test("an unreachable reader is retryable", async () => {
    expect(await classifySlipRereadingYear({ ...base, words: null, readerRefusal: "The reader could not be reached." }, never)).toMatchObject({ status: "review", retryable: true });
  });

  test("a refused amount whose crops fail is retryable, with the original reason", async () => {
    expect(await classifySlipRereadingYear({ ...base, words: slipWords("23,00") }, never))
      .toMatchObject({ status: "review", retryable: true, reason: expect.stringMatching(/^That does not read as a plain amount\./u) });
  });

  test("no amount label at all is definite", async () => {
    expect(await classifySlipRereadingYear({ ...base, words: slipWords().slice(3) }, never)).toMatchObject({ status: "review", retryable: false });
  });
});

describe("drainInbox rereads a printed year the window refused", () => {
  const status = () => undefined;
  const KTB_NO_DATE = "ABCDEFGHJKLMNPQRS";
  const ktbScan = (reference = KTB_NO_DATE): SlipScanResult =>
    ({ ok: true, identity: { bankCode: "KTB", bankQrCode: "006", reference }, payload: `INVENTED-PAYLOAD-${reference}`, scale: 1, candidates: 1 });
  /** Krungthai-shaped: the amount under its label and, on a line of its own, the printed date in three words. */
  const ktbWords = (year: string, day = "24", month = "ก.ย."): OcrWord[] => [
    ...line(100, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380], ["บาท", 390, 420]]),
    ...line(140, [["ค่าธรรมเนียม", 10, 90], ["0.00", 300, 360], ["บาท", 390, 420]]),
    ...line(180, [[day, 10, 40], [month, 45, 100], [year, 105, 170]])
  ];

  afterEach(() => { vi.useRealTimers(); });
  const today = () => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-07T05:00:00Z") });
  const cropWords = (text: string): ImageWordsRead => ({ ok: true, words: [{ text, left: 0, right: 100, top: 0, bottom: 30 }] });

  test("a year misread 2559 and read 2569 on its crop is captured with the corrected date, the amount from the full read", async () => {
    today();
    const { deps, calls } = fakes({ scans: { "k.png": ktbScan() }, words: { "k.png": ktbWords("2559") }, crop: () => cropWords("2569") });
    const result = await drainInbox([file("k.png")], status, deps);
    expect(calls.rereads).toEqual([{ name: "k.png", box: { left: 105, top: 180, right: 170, bottom: 200 } }]);
    expect(result.slips).toHaveLength(1);
    expect(result.slips[0]).toMatchObject({ occurredOn: "2026-09-24", amountMinor: "125000" });
  });

  test("a year misread 2558 (out of the era window) and read 2568 on its crop is captured as 2025-11-29", async () => {
    today();
    const { deps, calls } = fakes({ scans: { "k.png": ktbScan() }, words: { "k.png": ktbWords("2558", "29", "พ.ย.") }, crop: () => cropWords("2568") });
    const result = await drainInbox([file("k.png")], status, deps);
    expect(calls.rereads).toHaveLength(1);
    expect(result.slips[0]).toMatchObject({ occurredOn: "2025-11-29", amountMinor: "125000" });
  });

  test("a slip needing both an amount and a year re-read gets both", async () => {
    today();
    const words = ktbWords("2559").map((word) => (word.text === "1,250.00" ? { ...word, text: "23,00" } : word));
    const amountCrop: ImageWordsRead = { ok: true, words: [{ text: "จำนวนเงิน", left: 0, right: 160, top: 0, bottom: 40 }, { text: "23.00", left: 400, right: 520, top: 0, bottom: 40 }] };
    const { deps, calls } = fakes({ scans: { "k.png": ktbScan() }, words: { "k.png": words }, amountCrop: () => amountCrop, crop: () => cropWords("2569") });
    const result = await drainInbox([file("k.png")], status, deps);
    expect(calls.amountRereads).toEqual([2]);
    expect(calls.rereads).toHaveLength(1);
    expect(result.slips[0]).toMatchObject({ occurredOn: "2026-09-24", amountMinor: "2300" });
  });

  test("a crop that also reads 2559 leaves the slip in review with the original out-of-range reason", async () => {
    today();
    const { deps, calls } = fakes({ scans: { "k.png": ktbScan() }, words: { "k.png": ktbWords("2559") }, crop: () => cropWords("2559") });
    const result = await drainInbox([file("k.png")], status, deps);
    expect(calls.rereads).toHaveLength(1);
    expect(result.slips).toEqual([]);
    expect(result.reasons["k.png"]).toContain("outside the range this ledger accepts");
  });

  test("a crop read that fails keeps the original reason, not a reader-unreachable one", async () => {
    today();
    const { deps, calls } = fakes({ scans: { "k.png": ktbScan() }, words: { "k.png": ktbWords("2559") } });
    const result = await drainInbox([file("k.png")], status, deps);
    expect(calls.rereads).toHaveLength(1);
    expect(result.slips).toEqual([]);
    expect(result.reasons["k.png"]).toContain("outside the range this ledger accepts");
    expect(result.reasons["k.png"]).not.toMatch(/reader|could not be read/u);
    // A second read was tried and gave nothing usable, so the next open reads it again (D-259).
    expect([...calls.saved!]).toEqual([]);
  });

  test("a crop read that throws keeps the original reason too", async () => {
    today();
    const { deps } = fakes({ scans: { "k.png": ktbScan() }, words: { "k.png": ktbWords("2559") }, crop: () => { throw new Error("boom"); } });
    const result = await drainInbox([file("k.png")], status, deps);
    expect(result.slips).toEqual([]);
    expect(result.reasons["k.png"]).toContain("outside the range this ledger accepts");
  });

  test("a slip whose QR carries the date never triggers a crop read", async () => {
    today();
    const { deps, calls } = fakes({ scans: { "s.png": slipScan() }, words: { "s.png": [...slipWords(), ...line(180, [["24", 10, 40], ["ก.ย.", 45, 100], ["2559", 105, 170]])] }, crop: () => cropWords("2569") });
    await drainInbox([file("s.png")], status, deps);
    expect(calls.rereads).toEqual([]);
  });

  test("a doubtful year (07 Oct 2569 is still in the window as 2559) never triggers a crop read", async () => {
    today();
    const { deps, calls } = fakes({ scans: { "k.png": ktbScan() }, words: { "k.png": ktbWords("2569", "07", "ต.ค.") }, crop: () => cropWords("2569") });
    const result = await drainInbox([file("k.png")], status, deps);
    expect(calls.rereads).toEqual([]);
    expect(result.slips).toEqual([]);
    expect(result.reasons["k.png"]).toContain("Enter the date yourself");
  });

  test("a slip with no date on it never triggers a crop read", async () => {
    today();
    const { deps, calls } = fakes({ scans: { "k.png": ktbScan() }, words: { "k.png": slipWords() }, crop: () => cropWords("2569") });
    await drainInbox([file("k.png")], status, deps);
    expect(calls.rereads).toEqual([]);
  });

  test("a slip whose amount cannot be read never triggers a crop read", async () => {
    today();
    const { deps, calls } = fakes({ scans: { "k.png": ktbScan() }, words: { "k.png": ktbWords("2559").slice(3) }, crop: () => cropWords("2569") });
    await drainInbox([file("k.png")], status, deps);
    expect(calls.rereads).toEqual([]);
  });
});

describe("drainInbox with a slip whose QR cannot be found (D-258)", () => {
  const status = () => undefined;
  // An invented SCB slip: its bank in the header, its printed date and time, and its reference.
  const PRINTED_REFERENCE = "2026071431a2B3c4D5e6F7g8H";
  const printedSlip = (): OcrWord[] => [
    ...line(10, [["›", 5, 10], ["SCB,", 15, 60]]),
    ...line(60, [["14 ก.ค. 2569 - 09:05", 10, 200]]),
    ...slipWords(),
    ...line(400, [["รหัสอ้างอิง:", 10, 110], [PRINTED_REFERENCE, 120, 330]])
  ];

  test("no QR at all: a printed identity makes a ready slip with no QR payload", async () => {
    const { deps, calls } = fakes({ words: { "p.png": printedSlip() } });
    const result = await drainInbox([file("p.png")], status, deps);
    expect(result.slips).toEqual([{
      name: "p.png",
      payload: null,
      identity: { bankCode: "SCB", bankQrCode: null, reference: PRINTED_REFERENCE },
      occurredOn: "2026-07-14",
      occurredAtTime: "09:05",
      amountMinor: "125000",
      ...proposeSlipText(printedSlip(), "SCB")
    }]);
    expect(result.reasons).toEqual({ "p.png": SLIP_WAITING_REASON });
    expect(calls.slipPosts).toBe(0);
  });

  test("a QR that is not a slip's keeps today's path, even over printed slip text", async () => {
    const { deps } = fakes({
      scans: { "p.png": { ok: false, code: "NO_SLIP_QR_DETECTED", message: "This QR code is not a slip's." } },
      words: { "p.png": printedSlip() }
    });
    const result = await drainInbox([file("p.png")], status, deps);
    expect(result.slips).toEqual([]);
    expect(result.reasons["p.png"]).toBe(NOT_YET);
  });

  test("a printed slip's capture body carries no QR payload and no QR bank code", () => {
    const body = slipPostBody({
      name: "p.png", payload: null, identity: { bankCode: "SCB", bankQrCode: null, reference: PRINTED_REFERENCE },
      occurredOn: "2026-07-14", occurredAtTime: "09:05", amountMinor: "125000", counterparty: null, note: null
    }, "withdrawal", "-125000");
    expect(body).toMatchObject({ qrPayload: null, bankCode: "SCB", bankQrCode: null, slipReference: PRINTED_REFERENCE, occurredAtTime: "09:05" });
  });
});
