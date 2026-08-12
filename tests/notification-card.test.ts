import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_CARD_LAYOUTS,
  boundDigitCount,
  fieldMapFor,
  kindForDirection,
  layoutForChannel,
  matchAccountDigits,
  printsCounterparty,
  readDirection,
  resolveCardYear
} from "@/lib/notification-card";

// Every account number here is invented, per `docs/FIXTURE_POLICY.md`. The real cards were
// read under a grant on 2026-08-12 and only shapes and counts left that reading — no digit
// from them appears in this file or in any other.

describe("notification card layouts", () => {
  it("registers one layout per channel and resolves each by name", () => {
    expect(NOTIFICATION_CARD_LAYOUTS).toHaveLength(3);
    for (const layout of NOTIFICATION_CARD_LAYOUTS) {
      expect(layoutForChannel(layout.channel)).toBe(layout);
    }
    // Whether the other side of the transfer is named is a property of the *direction*, not of
    // the layout — see the counterparty test below. There is deliberately no per-layout flag.
  });
});

describe("the printed year is read per layout, never globally", () => {
  const gregorian = layoutForChannel("SCB Connect");
  const buddhist = layoutForChannel("Krungthai Connext");

  it("passes a four-digit Gregorian year through untouched", () => {
    expect(resolveCardYear(gregorian, 2026, 2026)).toBe(2026);
  });

  it("resolves a two-digit Buddhist year against the year the card was captured", () => {
    expect(resolveCardYear(buddhist, 69, 2026)).toBe(2026);
    expect(resolveCardYear(buddhist, 68, 2026)).toBe(2025);
  });

  // This is D-031's failure in miniature: reading a two-digit Buddhist year with the
  // four-digit rule, or the reverse, is what dated a whole statement 43 years early while
  // parsing cleanly the entire way. Each layout refuses the other's shape outright.
  it("refuses a year printed in the other layout's shape rather than guessing", () => {
    expect(() => resolveCardYear(gregorian, 69, 2026)).toThrow(/four-digit/u);
    expect(() => resolveCardYear(buddhist, 2026, 2026)).toThrow(/two-digit/u);
  });
});

describe("account digits are matched per layout, and refuse rather than guess", () => {
  const lastFour = layoutForChannel("SCB Connect");
  const offsetOne = layoutForChannel("KBank Live");

  it("compares a last-four layout directly", () => {
    expect(matchAccountDigits(lastFour, "1234", ["1234", "9876"])).toEqual({ outcome: "matched", lastFour: "1234" });
    expect(matchAccountDigits(lastFour, "1234", ["9876"])).toEqual({ outcome: "none" });
  });

  // The finding this whole module exists for. The card shows digits 6-9 of a ten-digit
  // account and masks the last one, so its four printed digits and the stored last four
  // overlap by three and sit one apart. Comparing them directly matches nothing — which is
  // why the naive reading reported real cards as belonging to no account at all.
  it("shifts an offset-one layout by one digit, where a direct comparison finds nothing", () => {
    expect(matchAccountDigits(offsetOne, "1234", ["2345"])).toEqual({ outcome: "matched", lastFour: "2345" });
    // The same digits under the naive rule: no match, and no error either.
    expect(matchAccountDigits(lastFour, "1234", ["2345"])).toEqual({ outcome: "none" });
  });

  it("refuses an offset-one match that only three shared digits cannot decide", () => {
    // Two accounts differing only in the digit the card masks are indistinguishable from it.
    expect(matchAccountDigits(offsetOne, "1234", ["2345", "2346"])).toEqual({
      outcome: "ambiguous",
      candidates: ["2345", "2346"]
    });
  });

  it("reports how many digits each layout actually pins down", () => {
    expect(boundDigitCount(lastFour)).toBe(4);
    // Four digits are printed; only three of them constrain the stored account.
    expect(boundDigitCount(offsetOne)).toBe(3);
  });

  it("refuses printed digits that are not four digits, on either layout", () => {
    for (const layout of [lastFour, offsetOne]) {
      expect(() => matchAccountDigits(layout, "123", [])).toThrow(/four account digits/u);
      expect(() => matchAccountDigits(layout, "12a4", [])).toThrow(/four account digits/u);
    }
  });

  it("ignores a stored value that is not four digits rather than matching it loosely", () => {
    expect(matchAccountDigits(lastFour, "1234", ["1234", "123"])).toEqual({ outcome: "matched", lastFour: "1234" });
  });
});

// The printed grammar — `docs/NOTIFICATION_CARD_CONTRACT.md`, measured 2026-08-12. No label
// wording below is a value: labels are format knowledge, exactly as the statement and slip
// contracts treat them. Every account number and amount remains invented.

describe("where each field sits is looked up per layout and per direction", () => {
  const scb = layoutForChannel("SCB Connect");
  const kbank = layoutForChannel("KBank Live");
  const ktb = layoutForChannel("Krungthai Connext");

  it("anchors the two fields that carry no label of their own", () => {
    // Different layouts, different fields, same anchor — which is why the anchor is a shape
    // rather than a boolean on the field.
    expect(fieldMapFor(scb, "out")?.amount).toEqual({ kind: "under-title" });
    expect(fieldMapFor(kbank, "in")?.occurredAt).toEqual({ kind: "under-title" });
    // And the same field is labelled elsewhere, so neither case generalises.
    expect(fieldMapFor(kbank, "in")?.amount).toEqual({ kind: "label", label: "จำนวนเงิน" });
    expect(fieldMapFor(scb, "out")?.occurredAt).toEqual({ kind: "label", label: "วันที่/เวลา" });
  });

  // The trap this whole lookup exists for. `จากบัญชี` names the owner's own account on an
  // outgoing Krungthai card and the *sender's* on an incoming one, and both print four digits.
  // Nothing on the card marks which is which; only the label paired with the direction does.
  it("reads Krungthai's colliding label as the owner's account one way and the sender's the other", () => {
    expect(fieldMapFor(ktb, "out")?.ownAccount).toEqual({ kind: "label", label: "จากบัญชี" });
    expect(fieldMapFor(ktb, "in")?.counterpartyAccount).toEqual([{ kind: "label", label: "จากบัญชี" }]);
    // The owner's own account is under a different label on an incoming card, and confusing the
    // two binds the payment to the counterparty's bank instead of the owner's.
    expect(fieldMapFor(ktb, "in")?.ownAccount).toEqual({ kind: "label", label: "เข้าบัญชี" });
    expect(fieldMapFor(ktb, "in")?.ownAccount).not.toEqual(fieldMapFor(ktb, "in")?.counterpartyAccount);
  });

  it("carries the same collision on SCB Connect, which outgoing cards alone could not show", () => {
    // Measured 2026-08-12 once an incoming SCB card existed, and it corrected the first pass:
    // this layout collides exactly as Krungthai does, so the collision is a property of Thai
    // banking vocabulary rather than of one bank.
    expect(fieldMapFor(scb, "out")?.ownAccount).toEqual({ kind: "label", label: "จากบัญชี" });
    expect(fieldMapFor(scb, "in")?.ownAccount).toEqual({ kind: "label", label: "เข้าบัญชี" });
    expect(fieldMapFor(scb, "in")?.counterpartyAccount).toEqual([{ kind: "label", label: "จากบัญชี" }]);
  });

  it("has a measured map for every layout in both directions", () => {
    for (const layout of NOTIFICATION_CARD_LAYOUTS) {
      for (const direction of ["in", "out"] as const) {
        expect(fieldMapFor(layout, direction), `${layout.channel} ${direction}`).not.toBeNull();
      }
    }
  });

  it("names the counterparty per direction, not per bank", () => {
    // The correction of 2026-08-12. A per-layout flag said SCB Connect prints no counterparty,
    // which was true of its outgoing cards and false of its incoming ones.
    expect(printsCounterparty(scb, "in")).toBe(true);
    expect(printsCounterparty(scb, "out")).toBe(false);
    expect(printsCounterparty(ktb, "in")).toBe(true);
    expect(printsCounterparty(ktb, "out")).toBe(true);
    // KBank names neither side in either direction, so an absent counterparty there is the
    // ordinary case and never a misread.
    expect(printsCounterparty(kbank, "in")).toBe(false);
    expect(printsCounterparty(kbank, "out")).toBe(false);
  });

  it("accepts either label a Krungthai outgoing card uses for the other side", () => {
    // One direction of one layout, two real variants: a transfer to a bank account and a
    // transfer to a wallet. A single label would read one and silently miss the other.
    expect(fieldMapFor(ktb, "out")?.counterpartyAccount).toEqual([
      { kind: "label", label: "ไปยังบัญชี" },
      { kind: "label", label: "หมายเลข" }
    ]);
    expect(fieldMapFor(ktb, "out")?.counterpartyName).toEqual([
      { kind: "label", label: "ผู้รับโอน" },
      { kind: "label", label: "ไปยัง" }
    ]);
  });
});

describe("direction is read from two signals and refuses when they disagree", () => {
  const scb = layoutForChannel("SCB Connect");
  const kbank = layoutForChannel("KBank Live");
  const ktb = layoutForChannel("Krungthai Connext");

  it("reads each layout's own wording, in both directions", () => {
    expect(readDirection(kbank, "รายการเงินเข้า", 50_000n)).toEqual({ outcome: "read", direction: "in", kind: "deposit" });
    expect(readDirection(kbank, "รายการโอน/ถอน", -50_000n)).toEqual({ outcome: "read", direction: "out", kind: "withdrawal" });
    expect(readDirection(ktb, "เงินเข้า", 70_000n)).toEqual({ outcome: "read", direction: "in", kind: "deposit" });
    expect(readDirection(ktb, "เงินออก", -70_000n)).toEqual({ outcome: "read", direction: "out", kind: "withdrawal" });
    expect(readDirection(scb, "รายการเงินออก", -42_800n)).toEqual({ outcome: "read", direction: "out", kind: "withdrawal" });
    expect(readDirection(scb, "รายการเงินเข้า", 42_800n)).toEqual({ outcome: "read", direction: "in", kind: "deposit" });
  });

  it("refuses a card whose words and sign contradict each other", () => {
    // A misread of either signal, and the reason both are read: stored on the surviving one,
    // this is a payment recorded backwards, which no correction fully undoes on an append-only
    // row. It names both readings so the refusal can say what disagreed.
    expect(readDirection(kbank, "รายการเงินเข้า", -50_000n)).toEqual({ outcome: "contradicted", byWords: "in", bySign: "out" });
    expect(readDirection(ktb, "เงินออก", 20_000n)).toEqual({ outcome: "contradicted", byWords: "out", bySign: "in" });
  });

  it("refuses wording it does not recognise, and a zero movement", () => {
    expect(readDirection(kbank, "รายการอะไรสักอย่าง", 50_000n)).toEqual({ outcome: "unrecognised" });
    // No card prints a zero movement, so a zero is a failed amount read wearing a plausible
    // shape rather than a transaction that moved nothing.
    expect(readDirection(ktb, "เงินเข้า", 0n)).toEqual({ outcome: "unrecognised" });
  });

  it("refuses a shorter word that is really part of another layout's longer one", () => {
    // Thai has no word separator, so `เงินเข้า` sits inside `รายการเงินเข้า` and `เงินออก`
    // inside `รายการเงินออก`. Read naively, Krungthai's grammar accepts an SCB or KBank card —
    // and the account digits are then matched with the wrong mask.
    expect(readDirection(ktb, "รายการเงินเข้า", 50_000n)).toEqual({ outcome: "unrecognised" });
    expect(readDirection(ktb, "รายการเงินออก", -50_000n)).toEqual({ outcome: "unrecognised" });
  });

  it("cannot tell SCB Connect from KBank Live by wording, and the module says so", () => {
    // Both print the identical incoming title, so the words carry no signal here at all. This
    // is asserted rather than left implicit: it is the one case the cross-layout check above
    // does not cover, and the channel has to come from the LINE conversation instead.
    const shared = "รายการเงินเข้า";
    expect(readDirection(scb, shared, 1n)).toEqual({ outcome: "read", direction: "in", kind: "deposit" });
    expect(readDirection(kbank, shared, 1n)).toEqual({ outcome: "read", direction: "in", kind: "deposit" });
  });

  it("maps a direction onto the vocabulary every ledger table already shares", () => {
    expect(kindForDirection("in")).toBe("deposit");
    expect(kindForDirection("out")).toBe("withdrawal");
  });
});
