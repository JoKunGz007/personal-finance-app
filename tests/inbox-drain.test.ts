import { describe, expect, test } from "vitest";
import { drainInbox, type DrainDeps } from "@/lib/browser/inbox-importer";
import { readLinemanPage } from "@/lib/delivery-lineman";
import {
  addedTogether, DIFFERENT_TIMES_REASON, describeDrain, NOT_YET, parseRemembered, planLinemanOrders, planPdf, planReceiptScreenshots, progressLine,
  pruneRemembered, recogniseImage, TWO_ORDERS_REASON, UNMATCHED_PAGE_REASON
} from "@/lib/inbox-drain";
import { readScreenshotPage, readScreenshotReceipt } from "@/lib/receipt-screenshot";
import type { OcrWord } from "@/lib/slip-ocr";

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

describe("the unrecognised-file memory", () => {
  test("reads a stored list, and treats anything else as empty", () => {
    expect([...parseRemembered('["a.png","b.jpg"]')]).toEqual(["a.png", "b.jpg"]);
    expect([...parseRemembered('["a.png",3,null]')]).toEqual(["a.png"]);
    for (const bad of [null, "", "not json", '{"a":1}', "3"]) expect(parseRemembered(bad).size).toBe(0);
  });

  test("keeps only the names still in the queue", () => {
    expect(pruneRemembered(new Set(["b.png", "gone.png", "a.png"]), ["a.png", "b.png", "c.png"])).toEqual(["a.png", "b.png"]);
  });
});

describe("what the owner reads", () => {
  test("progress", () => {
    expect(progressLine(3, 7)).toBe("Importing 3 of 7…");
  });

  test("the summary counts what was imported and what waits", () => {
    expect(describeDrain({ receipts: 2, orders: 1, waiting: 3 })).toBe("2 receipts and 1 LINE MAN order imported; 3 files wait.");
    expect(describeDrain({ receipts: 1, orders: 0, waiting: 0 })).toBe("1 receipt imported.");
    expect(describeDrain({ receipts: 0, orders: 2, waiting: 1 })).toBe("2 LINE MAN orders imported; 1 file waits.");
    expect(describeDrain({ receipts: 0, orders: 0, waiting: 2 })).toBe("Nothing was imported. 2 files wait.");
    expect(describeDrain({ receipts: 0, orders: 0, waiting: 0 })).toBe("Nothing was waiting.");
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
  remembered?: string[];
};

/** Fakes for everything outside the drain; `words` maps an image's name to what Vision "read". */
function fakes(options: FakeOptions = {}) {
  const calls = { ocr: [] as string[], removed: [] as string[][], receipts: 0, orders: 0, saved: undefined as undefined | ReadonlySet<string> };
  const deps: DrainDeps = {
    download: async (name) => ({ ok: true, value: blobOf(name) }),
    remove: async (names) => { calls.removed.push([...names]); return { ok: true, value: options.removes ? options.removes(names) : names.length }; },
    readPdf: async () => { throw new Error("no PDFs in this test"); },
    readImage: async (blob) => {
      const name = labels.get(blob)!;
      calls.ocr.push(name);
      return { ok: true, words: options.words?.[name] ?? [] };
    },
    postReceipt: async () => {
      calls.receipts += 1;
      return options.fail === "receipt" ? { ok: false, why: "The ledger could not be reached, so the receipt was not saved." } : { ok: true };
    },
    postOrder: async () => {
      calls.orders += 1;
      return options.fail === "order" ? { ok: false, why: "The order could not be saved." } : { ok: true };
    },
    memory: { load: () => new Set(options.remembered ?? []), save: (remembered) => { calls.saved = new Set(remembered); } }
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
    expect(result.summary).toBe("1 LINE MAN order imported; 1 file waits.");
  });

  test("LINE MAN pages added at different times are all kept, and nothing is posted", async () => {
    const { deps, calls } = fakes({ words: { "1.png": sentences(LM_FIRST()), "2.png": sentences(LM_SECOND()) } });
    const result = await drainInbox([file("1.png"), file("2.png", minutesAfter(30))], status, deps);
    expect(calls.orders).toBe(0);
    expect(calls.removed).toEqual([]);
    expect(result.reasons).toEqual({ "1.png": DIFFERENT_TIMES_REASON, "2.png": DIFFERENT_TIMES_REASON });
  });

  test("(d) a file remembered as not recognised is not read by Vision again", async () => {
    const { deps, calls } = fakes({
      words: { "new.png": sentences(["Transfer successful", "Invented Sender"]), "old.png": wholeReceipt() },
      remembered: ["old.png", "already-gone.png"]
    });
    const result = await drainInbox([file("old.png"), file("new.png")], status, deps);
    expect(calls.ocr).toEqual(["new.png"]);
    expect(result.reasons).toEqual({ "old.png": NOT_YET, "new.png": NOT_YET });
    // Pruning to the queue is the memory's own job (`pruneRemembered`); the drain hands it the new name too.
    expect([...calls.saved!].sort()).toEqual(["already-gone.png", "new.png", "old.png"]);
  });

  test("a recognised file is not added to the memory", async () => {
    const { deps, calls } = fakes({ words: { "r.png": wholeReceipt() } });
    await drainInbox([file("r.png")], status, deps);
    expect([...calls.saved!]).toEqual([]);
  });
});
