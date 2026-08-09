"use client";

import { formatThb } from "@/lib/money";
import type { CapturedSlip } from "@/lib/slips";

/**
 * What this device has captured, on the page that captured it (D-075).
 *
 * The gap this closes was found by the owner capturing a real slip: the form clears itself,
 * says one line, and leaves no record behind, so the only place a captured slip could be seen
 * was the ledger on another route. That is the same shape as D-062 — a write path whose read
 * path lives somewhere else — and it reads as "nothing happened" at exactly the moment the
 * owner most needs to know that something did.
 *
 * Deliberately **not** a reconciliation view. Whether a slip matched a statement row is a fact
 * about two records and belongs where both are shown; this answers the narrower question the
 * capture form leaves open — *is it stored, and is it what I typed* — and points at the ledger
 * for the rest.
 *
 * Presentational on purpose: the fetch lives in `app/slips-bench.tsx` because the one thing
 * that must refresh this list is a **capture**, which is an event rather than a render.
 */
export function CapturedSlips({ slips, decided, busy, error, onLoad }: {
  slips: CapturedSlip[] | null;
  decided: ReadonlySet<string>;
  busy: boolean;
  error: string | null;
  onLoad: () => void;
}) {
  return (
    <section className="captured-slips" aria-labelledby="captured-title">
      <div className="bench-heading">
        <p className="section-index">Captured</p>
        <div>
          <h2 id="captured-title">On this ledger</h2>
          <p>
            Every slip stored here, newest first. A slip is a provisional entry: it counts as
            money that moved, and the statement is what confirms it. Whether one has been
            matched to a statement row is shown in the ledger, not here.
          </p>
        </div>
      </div>

      <div className="ledger-controls">
        <button type="button" className="secondary-button" disabled={busy} onClick={onLoad}>
          {busy ? "Loading…" : slips ? "Reload" : "Show captured slips"}
        </button>
      </div>

      {error ? (
        <div className="warning error" role="alert">
          <strong>Not loaded</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {slips === null ? null : slips.length === 0 ? (
        <p className="ledger-empty" role="status">
          No slip has been captured on this ledger yet.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Bank</th>
                <th>Reference</th>
                <th>Counterparty</th>
                <th className="numeric">Amount</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((slip) => (
                <tr key={slip.id} className="provisional-row">
                  <td data-label="Date">
                    <time dateTime={slip.occurred_on}>{slip.occurred_on}</time>
                    <small>{slip.occurred_at_time ?? "no time printed"}</small>
                  </td>
                  <td data-label="Bank">
                    <strong>{slip.bank_code}</strong>
                    {/* The owner's own decision about this slip is worth showing here, because
                        it is the one thing on this page that is not simply what they typed. */}
                    {decided.has(slip.id) ? <small>your decision recorded</small> : null}
                  </td>
                  <td data-label="Reference"><span className="mono">{slip.slip_reference}</span></td>
                  <td data-label="Counterparty">
                    <span>{slip.counterparty ?? "none recorded"}</span>
                    {slip.note ? <em>{slip.note}</em> : null}
                  </td>
                  <td data-label="Amount" className={`numeric ${BigInt(slip.amount_minor) > 0n ? "positive" : ""}`}>
                    {BigInt(slip.amount_minor) > 0n ? "+" : ""}{formatThb(slip.amount_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
