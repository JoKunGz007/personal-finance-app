import { describe, expect, it } from "vitest";
import type { LedgerAccount } from "@/lib/accounts";
import { soleMatchingAccount } from "@/lib/statement-binding";
import { buildPageText } from "@/lib/statement-page-text";

function account(id: string, bank: string, lastFour: string): LedgerAccount {
  return {
    id, bank_code: bank, label: "Invented", account_type: "savings",
    last_four: lastFour, currency: "THB", timezone: "Asia/Bangkok"
  } as LedgerAccount;
}

describe("soleMatchingAccount", () => {
  const frame = { bankCode: "KTB" as const, accountLastFour: "1234" };
  const a = account("00000000-0000-4000-8000-000000000001", "KTB", "1234");

  it("returns null for no accounts or no match", () => {
    expect(soleMatchingAccount(frame, null)).toBeNull();
    expect(soleMatchingAccount(frame, [account("00000000-0000-4000-8000-000000000002", "KTB", "9999")])).toBeNull();
    expect(soleMatchingAccount(frame, [account("00000000-0000-4000-8000-000000000002", "SCB", "1234")])).toBeNull();
  });

  it("returns the one account matching bank and last four", () => {
    const other = account("00000000-0000-4000-8000-000000000002", "SCB", "1234");
    expect(soleMatchingAccount(frame, [other, a])).toBe(a);
  });

  it("returns null when two accounts match", () => {
    const twin = account("00000000-0000-4000-8000-000000000003", "KTB", "1234");
    expect(soleMatchingAccount(frame, [a, twin])).toBeNull();
  });

  it("ignores the statement's currency", () => {
    const foreign = { ...frame, currency: "USD" };
    expect(soleMatchingAccount(foreign, [a])).toBe(a);
  });
});

describe("buildPageText", () => {
  it("keeps positioned runs, drops blanks and marker items, and NFKC-normalises", () => {
    const items = [
      { str: "Invented", transform: [1, 0, 0, 1, 10.5, 700], width: 40 },
      { str: "   ", transform: [1, 0, 0, 1, 20, 700], width: 3 },
      { type: "beginMarkedContent" },
      { str: "１２３", transform: [1, 0, 0, 1, 55, 690.25], width: 18 }
    ];
    expect(buildPageText(items)).toEqual([
      { str: "Invented", x: 10.5, y: 700, width: 40 },
      { str: "123", x: 55, y: 690.25, width: 18 }
    ]);
  });
});
