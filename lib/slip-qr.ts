import type { BankCode } from "@/lib/statement-frame";

// The QR printed on a Thai bank transfer slip, and the only part of a slip this
// app treats as exact.
//
// D-050 assigns the QR one job and one job only: **identity**. It carries no amount,
// so it can never propose a value; what it carries is the bank and a transaction
// reference, which together are the dedup key and the key a statement row is later
// matched against. That is the part D-050 calls catastrophic to get wrong, which is
// why every check in this file fails closed rather than salvaging a partial read.
//
// The grammar below was derived structurally from the 23 slips in `receipts_sample/`
// and confirms D-053 in every part. Only the shape is recorded here — no real
// reference appears in this repo, and the fixtures are built by `buildSlipQrPayload`
// rather than copied from a slip.
//
// Outer TLV, three fields in a fixed order:
//   00  the nested identity block below
//   51  "TH", constant across all 23 samples
//   91  CRC-16/CCITT-FALSE of everything preceding it, as four uppercase hex digits
//
// Nested inside tag 00, three more:
//   00  "000001", a format identifier, constant across all 23 samples
//   01  the three-digit Thai bank code
//   02  the transaction reference
//
// Observed reference lengths: KBANK 20, Krungthai 17 or 21, SCB 25. They are recorded
// as evidence and deliberately **not** enforced — see `MAX_REFERENCE_LENGTH`.

export const SLIP_QR_FORMAT_ID = "000001";
export const SLIP_QR_COUNTRY = "TH";

// The three banks this ledger reads statements for, keyed by the code the slip QR
// prints. A slip from any other bank is refused rather than stored against a guess:
// the reference would be recorded with no account it could ever reconcile against.
export const SLIP_BANK_BY_QR_CODE: Record<string, BankCode> = {
  "004": "KBANK",
  "006": "KTB",
  "014": "SCB"
};

export const QR_CODE_BY_SLIP_BANK: Record<BankCode, string> = {
  KBANK: "004",
  KTB: "006",
  SCB: "014"
};

// A bound rather than a per-bank pin. D-053's sample is one owner's three banks, and
// Krungthai alone already prints two lengths — so pinning the observed set would refuse
// a legitimate slip the day a bank adds a third. The CRC already proves the reference
// was read correctly, which is what pinning a length would otherwise be standing in for.
const MAX_REFERENCE_LENGTH = 64;
const REFERENCE_CHARSET = /^[0-9A-Za-z]+$/;

export type SlipQrErrorCode =
  | "MALFORMED_TLV"
  | "UNEXPECTED_SLIP_STRUCTURE"
  | "UNSUPPORTED_SLIP_FORMAT"
  | "UNKNOWN_SLIP_BANK"
  | "INVALID_SLIP_REFERENCE"
  | "SLIP_CRC_MISMATCH";

export type SlipIdentity = {
  bankCode: BankCode;
  // The three-digit code exactly as the QR printed it, kept beside the resolved bank
  // so a stored slip records what was read and not only what it was mapped to.
  bankQrCode: string;
  reference: string;
};

export type SlipQrResult =
  | { ok: true; identity: SlipIdentity }
  | { ok: false; code: SlipQrErrorCode; message: string };

type TlvField = { tag: string; value: string };

function failure(code: SlipQrErrorCode, message: string): SlipQrResult {
  return { ok: false, code, message };
}

// EMVCo TLV: two digits of tag, two digits of length, then exactly that many characters.
// Returns null on anything that does not consume the input exactly — a trailing byte is a
// malformed payload, not a field to ignore.
export function parseTlv(payload: string): TlvField[] | null {
  const fields: TlvField[] = [];
  let cursor = 0;
  while (cursor < payload.length) {
    if (cursor + 4 > payload.length) return null;
    const tag = payload.slice(cursor, cursor + 2);
    const lengthText = payload.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) return null;
    const length = Number(lengthText);
    const value = payload.slice(cursor + 4, cursor + 4 + length);
    if (value.length !== length) return null;
    fields.push({ tag, value });
    cursor += 4 + length;
  }
  return fields;
}

// CRC-16/CCITT-FALSE: polynomial 0x1021, initial value 0xFFFF, no reflection, no final
// XOR. Verified against all 23 sample slips, which is what licenses treating a mismatch
// as a refusal rather than a warning.
export function crc16CcittFalse(text: string): number {
  let crc = 0xffff;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    // The payload is ASCII by construction; anything wider would hash bytes this loop
    // never sees, so it is refused before it can produce a plausible-looking digest.
    if (code > 0x7f) throw new Error("Slip QR payloads are ASCII.");
    crc ^= code << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function formatCrc(crc: number): string {
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function readSlipQr(payload: string): SlipQrResult {
  if (typeof payload !== "string" || payload.length === 0) {
    return failure("MALFORMED_TLV", "The slip QR payload is empty.");
  }
  if (!/^[\x20-\x7e]+$/.test(payload)) {
    return failure("MALFORMED_TLV", "The slip QR payload is not printable ASCII.");
  }

  const outer = parseTlv(payload);
  if (outer === null) return failure("MALFORMED_TLV", "The slip QR payload is not well-formed TLV.");

  // The CRC covers everything before its own value, so it has to be the final field for
  // the check below to mean anything. A payload with fields after it is refused rather
  // than checked over a prefix that no longer covers the whole message.
  const last = outer.at(-1);
  if (!last || last.tag !== "91" || last.value.length !== 4) {
    return failure("UNEXPECTED_SLIP_STRUCTURE", "The slip QR payload does not end with a four-digit CRC field.");
  }

  const stated = last.value.toUpperCase();
  if (!/^[0-9A-F]{4}$/.test(stated)) {
    return failure("SLIP_CRC_MISMATCH", "The slip QR CRC is not four hexadecimal digits.");
  }
  const computed = formatCrc(crc16CcittFalse(payload.slice(0, -4)));
  if (computed !== stated) {
    return failure("SLIP_CRC_MISMATCH", "The slip QR CRC does not match its payload.");
  }

  const country = outer.find((field) => field.tag === "51");
  if (!country || country.value !== SLIP_QR_COUNTRY) {
    return failure("UNEXPECTED_SLIP_STRUCTURE", "The slip QR does not carry the Thai slip marker.");
  }

  const identityBlock = outer.find((field) => field.tag === "00");
  if (!identityBlock) return failure("UNEXPECTED_SLIP_STRUCTURE", "The slip QR carries no identity block.");

  const inner = parseTlv(identityBlock.value);
  if (inner === null) return failure("MALFORMED_TLV", "The slip QR identity block is not well-formed TLV.");

  const format = inner.find((field) => field.tag === "00");
  if (!format || format.value !== SLIP_QR_FORMAT_ID) {
    return failure("UNSUPPORTED_SLIP_FORMAT", "The slip QR is not the Thai slip-verification format this app reads.");
  }

  const bank = inner.find((field) => field.tag === "01");
  if (!bank || !/^\d{3}$/.test(bank.value)) {
    return failure("UNKNOWN_SLIP_BANK", "The slip QR carries no three-digit bank code.");
  }
  const bankCode = SLIP_BANK_BY_QR_CODE[bank.value];
  if (!bankCode) {
    return failure("UNKNOWN_SLIP_BANK", `The slip QR names bank ${bank.value}, which this ledger holds no account for.`);
  }

  const reference = inner.find((field) => field.tag === "02");
  if (!reference || reference.value.length === 0) {
    return failure("INVALID_SLIP_REFERENCE", "The slip QR carries no transaction reference.");
  }
  if (reference.value.length > MAX_REFERENCE_LENGTH || !REFERENCE_CHARSET.test(reference.value)) {
    return failure("INVALID_SLIP_REFERENCE", "The slip QR transaction reference is not a bounded alphanumeric string.");
  }

  return { ok: true, identity: { bankCode, bankQrCode: bank.value, reference: reference.value } };
}

// Builds a payload in the grammar above, CRC included.
//
// It lives in `lib/` rather than in the fixtures because it is what keeps every test
// input **invented**: a fixture is constructed from a made-up reference instead of copied
// off a real slip, which `docs/FIXTURE_POLICY.md` requires and which no amount of care
// with a copied string would achieve. It is also the red-proof tool — mutate one
// character of a built payload and `readSlipQr` must refuse it.
export function buildSlipQrPayload(input: { bankQrCode: string; reference: string }): string {
  // TLV lengths are two digits, so a field of 100 characters cannot be expressed at all.
  // Building one silently would produce a payload that parses as something else entirely.
  if (input.bankQrCode.length > 99 || input.reference.length > 99) {
    throw new Error("A slip QR field longer than 99 characters cannot be expressed in TLV.");
  }
  const identity =
    `0006${SLIP_QR_FORMAT_ID}` +
    `01${input.bankQrCode.length.toString().padStart(2, "0")}${input.bankQrCode}` +
    `02${input.reference.length.toString().padStart(2, "0")}${input.reference}`;
  if (identity.length > 99) {
    throw new Error("The slip QR identity block is too long to express in TLV.");
  }
  const body =
    `00${identity.length.toString().padStart(2, "0")}${identity}` +
    `51${SLIP_QR_COUNTRY.length.toString().padStart(2, "0")}${SLIP_QR_COUNTRY}` +
    "9104";
  return `${body}${formatCrc(crc16CcittFalse(body))}`;
}
