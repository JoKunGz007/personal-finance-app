import { describe, expect, it } from "vitest";
import {
  proposeReceiptMatches,
  qualifiesAutomatically,
  RECEIPT_MATCH_WINDOW_MINUTES,
  receiptMatchRequestSchema,
  type ReceiptLedgerCandidate,
  type ReceiptMatchDecision
} from "@/lib/receipt-match";

// Every id and value here is invented.
const R1 = "aaaaaaaa-0000-4000-8000-000000000001";
const R2 = "aaaaaaaa-0000-4000-8000-000000000002";
const T1 = "bbbbbbbb-0000-4000-8000-000000000001";
const T2 = "bbbbbbbb-0000-4000-8000-000000000002";
const ACCOUNT = "cccccccc-0000-4000-8000-000000000001";

function candidate(receipt: string, transaction: string, lag: number | null, trueMoney = true): ReceiptLedgerCandidate {
  return {
    receipt_id: receipt,
    transaction_id: transaction,
    account_id: ACCOUNT,
    source_date: "2026-09-01",
    source_time: "10:00:00",
    transaction_label: "SIPI",
    description: trueMoney ? "SIPS TRUE MONEY CO.,LTD." : "PromptPay invented payee",
    lag_minutes: lag,
    names_true_money: trueMoney
  };
}

const decision = (receipt: string, transaction: string | null, revision = 1): ReceiptMatchDecision =>
  ({ receipt_id: receipt, decision: transaction ? "matched" : "unmatched", transaction_id: transaction, revision });

describe("the automatic rule for one candidate", () => {
  it("takes a TRUE MONEY row at or after the receipt, inside the window", () => {
    expect(qualifiesAutomatically({ names_true_money: true, lag_minutes: 0 })).toBe(true);
    expect(qualifiesAutomatically({ names_true_money: true, lag_minutes: 47 })).toBe(true);
    expect(qualifiesAutomatically({ names_true_money: true, lag_minutes: RECEIPT_MATCH_WINDOW_MINUTES })).toBe(true);
  });

  it("refuses a row before the receipt, past the window, without a time, or not naming TRUE MONEY", () => {
    expect(qualifiesAutomatically({ names_true_money: true, lag_minutes: -1 })).toBe(false);
    expect(qualifiesAutomatically({ names_true_money: true, lag_minutes: RECEIPT_MATCH_WINDOW_MINUTES + 1 })).toBe(false);
    expect(qualifiesAutomatically({ names_true_money: true, lag_minutes: null })).toBe(false);
    // The reimbursement case: same amount, a minute later, and still declined.
    expect(qualifiesAutomatically({ names_true_money: false, lag_minutes: 1 })).toBe(false);
  });

  it("is the measured two hours", () => {
    expect(RECEIPT_MATCH_WINDOW_MINUTES).toBe(120);
  });
});

describe("proposeReceiptMatches", () => {
  it("matches a receipt with exactly one qualifying row", () => {
    const states = proposeReceiptMatches([R1], [candidate(R1, T1, 2)], []);
    expect(states.get(R1)).toMatchObject({ status: "matched", row: { transaction_id: T1 }, revision: 0 });
  });

  it("reads no qualifying row as none, not as an error, and still offers the rows for a manual link", () => {
    const states = proposeReceiptMatches([R1], [candidate(R1, T2, 1, false)], []);
    expect(states.get(R1)).toMatchObject({ status: "none", row: null });
    expect(states.get(R1)!.options.map((option) => option.transaction_id)).toEqual([T2]);
  });

  it("refuses two qualifying rows rather than choosing one", () => {
    const states = proposeReceiptMatches([R1], [candidate(R1, T1, 2), candidate(R1, T2, 30)], []);
    expect(states.get(R1)).toMatchObject({ status: "ambiguous", row: null });
  });

  it("refuses when two receipts both want the one row, in either order", () => {
    const pair = [candidate(R1, T1, 2), candidate(R2, T1, 5)];
    for (const order of [pair, [...pair].reverse()]) {
      const states = proposeReceiptMatches([R1, R2], order, []);
      expect(states.get(R1)!.status).toBe("ambiguous");
      expect(states.get(R2)!.status).toBe("ambiguous");
    }
  });

  it("lets the owner's link win, and takes the linked row out of every other receipt's reach", () => {
    const states = proposeReceiptMatches([R1, R2], [candidate(R1, T1, 2), candidate(R2, T1, 5)], [decision(R2, T1)]);
    expect(states.get(R2)).toMatchObject({ status: "linked", row: { transaction_id: T1 }, revision: 1 });
    // R1 would have matched T1 on its own; the owner gave it to R2, so R1 has nothing left.
    expect(states.get(R1)).toMatchObject({ status: "none", row: null, options: [] });
  });

  it("resolves an ambiguity once the owner settles one side of it", () => {
    const states = proposeReceiptMatches(
      [R1, R2],
      [candidate(R1, T1, 2), candidate(R1, T2, 3), candidate(R2, T2, 1)],
      [decision(R2, T2)]
    );
    expect(states.get(R1)).toMatchObject({ status: "matched", row: { transaction_id: T1 } });
  });

  it("keeps a decline final, with no row and the stored revision", () => {
    const states = proposeReceiptMatches([R1], [candidate(R1, T1, 2)], [decision(R1, null, 3)]);
    expect(states.get(R1)).toMatchObject({ status: "declined", row: null, revision: 3 });
    expect(states.get(R1)!.options.map((option) => option.transaction_id)).toEqual([T1]);
  });

  it("honours a link to a row outside the candidate read, without describing it", () => {
    const states = proposeReceiptMatches([R1], [], [decision(R1, T1)]);
    expect(states.get(R1)).toMatchObject({ status: "linked", row: null });
  });

  it("gives every receipt a state, including one with no candidates at all", () => {
    const states = proposeReceiptMatches([R1, R2], [candidate(R1, T1, 0)], []);
    expect(states.get(R2)).toMatchObject({ status: "none", row: null, options: [], revision: 0 });
  });
});

describe("the match request", () => {
  it("pairs a link with a row and a decline with none", () => {
    expect(receiptMatchRequestSchema.safeParse({ expectedRevision: 0, decision: "matched", transactionId: T1 }).success).toBe(true);
    expect(receiptMatchRequestSchema.safeParse({ expectedRevision: 1, decision: "unmatched", transactionId: null }).success).toBe(true);
    expect(receiptMatchRequestSchema.safeParse({ expectedRevision: 0, decision: "matched", transactionId: null }).success).toBe(false);
    expect(receiptMatchRequestSchema.safeParse({ expectedRevision: 0, decision: "unmatched", transactionId: T1 }).success).toBe(false);
  });
});
