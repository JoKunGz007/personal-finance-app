import type { MinorUnitString } from "@/lib/money";
import type { SourceRowCandidate } from "@/lib/statement";

// Types shared by every statement reader.
//
// They live here rather than in one reader because there are now three: the hand-written
// `lib/krungthai-layout.ts` and the two descriptor-driven layouts in
// `lib/statement-layout.ts`. Only the types are shared — no geometry logic is, which is
// the whole point of DECISIONS D-011's successor note in `HANDOFF.md`: the Krungthai
// reader is the highest-risk proven code in the repo and is not being refactored into an
// abstraction that has never run against a second layout.

export const BANK_CODES = ["KTB", "SCB", "KBANK"] as const;
export type BankCode = (typeof BANK_CODES)[number];

export const CONTRACT_VERSIONS = ["krungthai-layout-v1", "scb-layout-v1", "kbank-layout-v1"] as const;
export type ContractVersion = (typeof CONTRACT_VERSIONS)[number];

// A contract version reads exactly one bank's layout, so the two fields of a payload
// cannot vary independently. Enumerating both without pinning them together would let a
// payload claim `scb-layout-v1` for a `KTB` account, and the bank code is what
// `private.row_fingerprint` hashes — so the pairing is enforced where the payload is
// validated rather than left to the caller.
export const CONTRACT_BANK: Record<ContractVersion, BankCode> = {
  "krungthai-layout-v1": "KTB",
  "scb-layout-v1": "SCB",
  "kbank-layout-v1": "KBANK"
};

export type LayoutErrorCode =
  | "UNSUPPORTED_LAYOUT"
  | "MISSING_COLUMN_ANCHOR"
  | "AMBIGUOUS_ROW_GEOMETRY"
  | "INVALID_ROW_CONTENT"
  | "MISSING_FRAME_FIELD"
  | "INVALID_FRAME_CONTENT"
  | "UNSUPPORTED_CURRENCY"
  | "CLOSING_BALANCE_MISMATCH"
  | "SUMMARY_MISMATCH"
  // Added with the SCB and KBANK readers (D-039). Both layouts print one money column
  // per row and encode direction by which of two right-aligned sub-columns the figure
  // sits in, so direction is derived from the balance chain and cross-checked against
  // that geometry — these name the two ways that can fail.
  | "AMBIGUOUS_ROW_DIRECTION"
  | "CARRY_FORWARD_MISMATCH";

// The account number is reduced to its last four digits at the point of extraction, so
// no full account number is ever carried past a parser.
export type StatementFrame = {
  bankCode: BankCode;
  // Which reader produced this frame. It travels into the import payload and into the
  // artifact row, so a committed import records the contract it was read under rather
  // than inheriting a hard-coded one.
  contractVersion: ContractVersion;
  // Null when the layout does not print one. Neither SCB nor KBANK does; Krungthai does
  // and still requires it.
  accountType: string | null;
  accountLastFour: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: MinorUnitString;
  closingBalance: MinorUnitString;
  currency: "THB";
  // False when the statement printed neither balance and both were derived from the
  // rows. The closing cross-check only means something when the value was printed.
  balancesPrinted: boolean;
};

export type LayoutResult =
  | { ok: true; frame: StatementFrame; rows: SourceRowCandidate[] }
  | { ok: false; code: LayoutErrorCode; message: string };
