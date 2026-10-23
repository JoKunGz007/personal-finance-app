import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LedgerCardRow } from "@/app/ledger-card-row";
import { LedgerSlipRow } from "@/app/ledger-slip-row";
import type { LedgerActions, LedgerModes } from "@/app/ledger-shared";

// D-296: a pick never starts while a correction form is open. Every value here is invented.

const idle: LedgerModes = {
  picking: false, pickingCard: false, matching: null, matchingCard: null,
  deciding: null, decidingCard: null, correcting: null, settingReporting: null
};
const layout = { showCombined: false, columns: 5 };
const actions = {} as LedgerActions;

const slipRow = {
  kind: "provisional", status: "awaiting-statement", ownerDecided: false, account: null,
  slip: { id: "slip-1", occurred_on: "2026-01-15", occurred_at_time: null, bank_code: "KTB", counterparty: "Invented Shop", amount_minor: "12500", slip_reference: "INVENTED0001" }
} as unknown as Parameters<typeof LedgerSlipRow>[0]["row"];
const cardRow = {
  kind: "card", status: "awaiting-statement", ownerDecided: false, account: null,
  card: { id: "card-1", occurred_on: "2026-01-15", occurred_at_time: "12:30:00", printed_account_digits: "0000", amount_minor: "12500", balance_minor: "100000", channel: "Invented" }
} as unknown as Parameters<typeof LedgerCardRow>[0]["row"];

// The `disabled` attribute of the button whose label starts with `label`, read from the markup.
function chooseDisabled(markup: string, label: string): boolean {
  const button = markup.match(new RegExp(`<button[^>]*aria-label="${label}[^"]*"[^>]*>`, "u"))?.[0];
  if (!button) throw new Error(`No button labelled ${label}`);
  return /\sdisabled=""/u.test(button);
}

const slip = (modes: LedgerModes) => renderToStaticMarkup(createElement(LedgerSlipRow, {
  row: slipRow, layout, modes, original: undefined, correction: null, categories: [], actions
}));
const card = (modes: LedgerModes) => renderToStaticMarkup(createElement(LedgerCardRow, {
  row: cardRow, layout, modes, original: undefined, correction: null, fittingRows: 0, reviewReason: undefined, categories: [], actions
}));

describe("Choose a statement row while a correction is open", () => {
  it("is enabled when nothing is open", () => {
    expect(chooseDisabled(slip(idle), "Choose a statement row for the slip")).toBe(false);
    expect(chooseDisabled(card(idle), "Choose a statement row for the card")).toBe(false);
  });
  it("is disabled while any record's correction form is open", () => {
    const correcting = { ...idle, correcting: "another-record" };
    expect(chooseDisabled(slip(correcting), "Choose a statement row for the slip")).toBe(true);
    expect(chooseDisabled(card(correcting), "Choose a statement row for the card")).toBe(true);
  });
});
