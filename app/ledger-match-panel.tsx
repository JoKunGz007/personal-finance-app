"use client";

import { useState } from "react";
import type { z } from "zod";
import { ledgerRequest } from "@/lib/wire";

/** What the panel needs of a ledger row, whichever document it pays for. */
export interface MatchPanelRow {
  transaction_id: string;
  source_date: string;
  source_time: string | null;
  description: string;
  lag_minutes: number | null;
}

export interface MatchPanelState {
  status: "linked" | "declined" | "matched" | "ambiguous" | "none" | "outside";
  row: MatchPanelRow | null;
  /** A ride paid in two parts (D-229): its second charge or refund. */
  also?: MatchPanelRow[];
  options: MatchPanelRow[];
  revision: number;
}

/** A ledger row in one line: when it posted, how far from the document's time, and what the bank called it. */
export function describeRow(row: MatchPanelRow): string {
  const when = row.source_time ? `${row.source_date} ${row.source_time.slice(0, 5)}` : row.source_date;
  // A refund lands days later (D-229), so a gap of a day or more reads in days.
  const span = (minutes: number) => minutes >= 1440 ? `${Math.round(minutes / 1440)} day${Math.round(minutes / 1440) === 1 ? "" : "s"}` : `${minutes} min`;
  const lag = row.lag_minutes === null
    ? ""
    : row.lag_minutes >= 0
      ? ` (${span(row.lag_minutes)} after)`
      : ` (${span(-row.lag_minutes)} before)`;
  return `${when}${lag} · ${row.description}`;
}

/**
 * Which ledger row a receipt or an order itemizes (D-212, D-220). Neither is money, so nothing here
 * changes a balance; the owner's decision always wins over the automatic rule, and a link is held
 * by the database to the document's exact total. `sentence` is the caller's, because what "no row"
 * means differs by document.
 */
export function LedgerMatchPanel({ endpoint, match, sentence, outsideRange, responseSchema, onChanged }: {
  endpoint: string;
  match: MatchPanelState;
  sentence: string;
  /** Said of a linked row the candidate read's three days do not reach. */
  outsideRange: string;
  responseSchema: z.ZodType;
  onChanged: () => void;
}) {
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(request: { decision: "matched" | "unmatched"; transactionId: string | null }) {
    setSaving(true);
    setError(null);
    const result = await ledgerRequest(endpoint, responseSchema, {
      fallback: "The decision could not be saved.",
      unreachable: "The ledger could not be reached, so nothing was saved."
    }, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, expectedRevision: match.revision })
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.why);
      return;
    }
    // The chosen row is about to leave the choices; a kept id would re-link it on the next press.
    setChoice("");
    onChanged();
  }

  const showsRow = match.status === "matched" || match.status === "linked";
  // Rows a link could name, other than the one already in force.
  const choices = match.options.filter((option) => option.transaction_id !== match.row?.transaction_id);

  return (
    <div className="receipt-match">
      <p className="ledger-status">
        {sentence}
        {showsRow ? <> <span>{match.row ? describeRow(match.row) : outsideRange}</span></> : null}
        {showsRow ? (match.also ?? []).map((row) => <span key={row.transaction_id}> and <span>{describeRow(row)}</span></span>) : null}
      </p>
      <div className="slip-actions">
        {showsRow ? (
          <button type="button" className="secondary-button" disabled={saving}
            onClick={() => void decide({ decision: "unmatched", transactionId: null })}>
            {match.status === "linked" ? "Unlink" : "Not this row"}
          </button>
        ) : null}
        {choices.length > 0 ? (
          <>
            <label className="account-control">
              <span>{showsRow ? "Link a different row" : "Link a row of the same amount"}</span>
              <select value={choice} disabled={saving} onChange={(event) => setChoice(event.target.value)}>
                <option value="">Choose a row…</option>
                {choices.map((option) => (
                  <option key={option.transaction_id} value={option.transaction_id}>{describeRow(option)}</option>
                ))}
              </select>
            </label>
            <button type="button" className="secondary-button" disabled={saving || choice === ""}
              onClick={() => void decide({ decision: "matched", transactionId: choice })}>
              Link
            </button>
          </>
        ) : null}
        {saving ? <span role="status">Saving…</span> : null}
      </div>
      {error ? <p className="status error" role="alert">{error}</p> : null}
    </div>
  );
}
