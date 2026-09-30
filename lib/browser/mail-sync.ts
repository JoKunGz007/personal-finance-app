// The mailbox syncs a page can start, as plain functions (D-235).
//
// **Extracted from `app/deliveries-bench.tsx` and `app/receipts-bench.tsx`, unchanged in what they
// ask or say.** Those two pages and `/inbox` ("Sync all mail") run the same loops, so the loops live
// here once. One request reads until its time budget and answers `truncated`; the caller asks again,
// up to `MAX_SYNC_ROUNDS`, which only stops a runaway loop. Every request is a same-origin POST with
// no body to this app's own owner-gated routes; the mail is read on the server and only counts come
// back.
//
// Callers run these one after another, never together: Gmail limits concurrent IMAP logins, and each
// request opens its own session.

import { z } from "zod";
import {
  deliverySyncReportSchema, describeSyncReport, type DeliverySyncReport
} from "@/lib/deliveries";
import {
  describeReceiptSyncReport, receiptSyncReportSchema, type ReceiptSyncReport
} from "@/lib/receipts";
import { DEFAULT_SYNC_DAYS, type SyncManifest } from "@/lib/statement-sync";
import { ledgerRequest } from "@/lib/wire";

export const MAX_SYNC_ROUNDS = 20;

/** What a sync loop leaves behind: the counts summed over every round, and why it stopped early. */
export type MailSyncOutcome<T> = {
  /** Summed over the rounds that answered; null when the first round already failed. */
  readonly total: T | null;
  /** The reason a round failed, in the route's own words; null when the loop ended cleanly. */
  readonly error: string | null;
};

function addRefused(total: Record<string, number>, next: Record<string, number>): Record<string, number> {
  const refused = { ...total };
  for (const [code, count] of Object.entries(next)) refused[code] = (refused[code] ?? 0) + count;
  return refused;
}

export function addDeliveryReports(total: DeliverySyncReport, next: DeliverySyncReport): DeliverySyncReport {
  return {
    messages: total.messages + next.messages,
    captured: total.captured + next.captured,
    alreadyStored: total.alreadyStored + next.alreadyStored,
    ridesCaptured: total.ridesCaptured + next.ridesCaptured,
    ridesAlreadyStored: total.ridesAlreadyStored + next.ridesAlreadyStored,
    notReceipts: total.notReceipts + next.notReceipts,
    refused: addRefused(total.refused, next.refused),
    truncated: next.truncated
  };
}

export function addReceiptReports(total: ReceiptSyncReport, next: ReceiptSyncReport): ReceiptSyncReport {
  return {
    messages: total.messages + next.messages,
    captured: total.captured + next.captured,
    alreadyStored: total.alreadyStored + next.alreadyStored,
    notReceipts: total.notReceipts + next.notReceipts,
    refused: addRefused(total.refused, next.refused),
    truncated: next.truncated
  };
}

async function syncLoop<T extends { readonly truncated: boolean }>(
  path: string,
  schema: z.ZodType<T>,
  add: (total: T, next: T) => T,
  onProgress?: (total: T) => void
): Promise<MailSyncOutcome<T>> {
  let total: T | null = null;
  for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
    const result = await ledgerRequest(path, schema, {
      fallback: "The mailbox could not be read.",
      offContract: "The sync response did not match its contract."
    }, { method: "POST" });
    if (!result.ok) return { total, error: result.why };
    total = total ? add(total, result.data) : result.data;
    onProgress?.(total);
    if (!total.truncated) break;
  }
  return { total, error: null };
}

/** Grab e-receipts, food and rides. `onProgress` gets the running total after every round. */
export function syncGrabMail(onProgress?: (total: DeliverySyncReport) => void): Promise<MailSyncOutcome<DeliverySyncReport>> {
  return syncLoop("/api/v1/deliveries/sync", deliverySyncReportSchema, addDeliveryReports, onProgress);
}

/** 7-Eleven e-tax invoices (D-232). `onProgress` gets the running total after every round. */
export function syncSevenElevenMail(onProgress?: (total: ReceiptSyncReport) => void): Promise<MailSyncOutcome<ReceiptSyncReport>> {
  return syncLoop("/api/v1/receipts/sync", receiptSyncReportSchema, addReceiptReports, onProgress);
}

/** " Not read: 2 bad total, 1 …." or "" — the refusal codes as words. */
function describeRefusedCodes(refusedCounts: Record<string, number>): string {
  const refused = Object.entries(refusedCounts);
  return refused.length > 0
    ? ` Not read: ${refused.map(([code, count]) => `${count} ${code.toLowerCase().replaceAll("_", " ")}`).join(", ")}.`
    : "";
}

const MORE_WAITING = " More mail is waiting; sync again.";

/** The line a finished Grab sync leaves on screen. */
export function describeGrabOutcome(total: DeliverySyncReport): string {
  return `${describeSyncReport(total)}${describeRefusedCodes(total.refused)}${total.truncated ? MORE_WAITING : ""}`;
}

/** The line a finished 7-Eleven sync leaves on screen. */
export function describeSevenElevenOutcome(total: ReceiptSyncReport): string {
  return `${describeReceiptSyncReport(total)}${describeRefusedCodes(total.refused)}${total.truncated ? MORE_WAITING : ""}`;
}

const STILL_READING = " Still reading…";

/** The running Grab line while a sync is still asking again. */
export function describeGrabProgress(total: DeliverySyncReport): string {
  return `${describeSyncReport(total)}${total.truncated ? STILL_READING : ""}`;
}

/** The running 7-Eleven line while a sync is still asking again. */
export function describeSevenElevenProgress(total: ReceiptSyncReport): string {
  return `${describeReceiptSyncReport(total)}${total.truncated ? STILL_READING : ""}`;
}

// --- Statements: a count only. The download, the password and the confirmation stay on /import. ---

const manifestSchema = z.object({
  messages: z.number().int().nonnegative(),
  attachments: z.array(z.object({ uid: z.number(), part: z.string() }).passthrough()),
  truncated: z.boolean(),
  since: z.string().nullable()
}).passthrough();

/**
 * How many statement PDFs are waiting in the mailbox, by the same listing `/import` uses, over the
 * same default look-back. **The listing only ever offers parts not yet fetched** (a downloaded part is
 * flagged on the message, `lib/server/statement-mailbox-session.ts`), so its length is the count
 * waiting. `more` means the listing stopped at its cap, so there are at least that many. Listing
 * downloads nothing and flags nothing.
 */
export type StatementsWaiting = { readonly count: number; readonly more: boolean };

export async function checkStatementMail(): Promise<{ ok: true; waiting: StatementsWaiting } | { ok: false; why: string }> {
  const result = await ledgerRequest(`/api/v1/imports/mailbox?days=${DEFAULT_SYNC_DAYS}`, manifestSchema, {
    fallback: "The mailbox could not be listed.",
    unreachable: "The mailbox could not be reached from this device.",
    offContract: "The mailbox answer did not match its contract."
  });
  if (!result.ok) return { ok: false, why: result.why };
  const manifest: Pick<SyncManifest, "truncated"> & { attachments: readonly unknown[] } = result.data;
  return { ok: true, waiting: { count: manifest.attachments.length, more: manifest.truncated } };
}
