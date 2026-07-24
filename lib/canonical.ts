import type { ImportPayload, SourceRowCandidate } from "@/lib/statement";

export function normalizeSourceText(value: string | null): string | null {
  return value === null ? null : value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Canonical JSON accepts only safe integer numbers.");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error(`Unsupported canonical JSON value: ${typeof value}`);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

export async function rowFingerprint(
  accountId: string,
  bankCode: "KTB",
  row: SourceRowCandidate
): Promise<string> {
  const deposit = row.components.filter((item) => item.kind === "deposit").reduce((sum, item) => sum + BigInt(item.amount.minor), 0n);
  const withdrawal = row.components.filter((item) => item.kind === "withdrawal").reduce((sum, item) => sum + BigInt(item.amount.minor), 0n);
  const facts = {
    version: "fingerprint-v1",
    accountId,
    bankCode,
    sourceDate: row.sourceDate,
    sourceTime: row.sourceTime,
    transactionLabel: normalizeSourceText(row.transactionLabel),
    description: normalizeSourceText(row.description),
    reference: normalizeSourceText(row.reference),
    withdrawal: withdrawal.toString(),
    deposit: deposit.toString(),
    postBalance: row.postBalance.minor,
    branch: normalizeSourceText(row.branch)
  };
  return sha256Hex(canonicalJson(facts));
}

export async function payloadDigest(payload: ImportPayload): Promise<string> {
  return sha256Hex(canonicalJson(payload));
}
