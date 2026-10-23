"use client";

import { CapturedSlips } from "@/app/captured-slips";
import { NotificationCardCapture } from "@/app/notification-card-capture";
import { SlipCapture } from "@/app/slip-capture";
import { useBenchList } from "@/app/use-bench-list";
import { slipListSchema, slipsInForce } from "@/lib/slips";
import { ledgerRequest } from "@/lib/wire";

const NO_SLIPS_DECIDED: ReadonlySet<string> = new Set();

/**
 * The slips route's two halves and the state they share (D-075).
 *
 * The capture form writes; the list reads. They are one component's worth of coordination and
 * two components' worth of markup, so the fetch lives here: **a capture must refresh the list,
 * and a capture is an event.** Doing it from an effect keyed on a counter would be a render
 * reacting to a render, which is both harder to follow and what React's own lint rule warns
 * about — the refresh belongs in the handler that knows a slip was just stored.
 *
 * Nothing loads until asked, as on every other surface that reaches real records. Once asked,
 * a capture keeps it current; before that, a capture leaves it alone.
 */
export function SlipsBench() {
  // On demand: no load on arrival and so no sign-in note; a refusal shows as the error.
  const { data, busy, error, load } = useBenchList(async () => {
    try {
      const result = await ledgerRequest("/api/v1/slips", slipListSchema, {
        fallback: "Captured slips could not be loaded.",
        unreachable: "The ledger could not be reached, so captured slips are not shown.",
        offContract: "The slips response did not match its contract, so none are shown."
      });
      if (!result.ok) return result;
      // Shown as they stand, corrections applied. A list that displayed the captured figure
      // beside a ledger showing the corrected one would make the two surfaces disagree about
      // the same slip, and the one to trust would not be the one that looks authoritative.
      return {
        ok: true as const,
        data: {
          slips: slipsInForce(result.data.slips, result.data.corrections),
          decided: new Set(result.data.matches.map((match) => match.slip_id)) as ReadonlySet<string>
        }
      };
    } catch {
      return { ok: false as const, kind: "unreachable" as const, why: "The ledger could not be reached, so captured slips are not shown.", status: null };
    }
  }, { onArrival: false });
  const slips = data?.slips ?? null;
  const decided = data?.decided ?? NO_SLIPS_DECIDED;

  return (
    <>
      <SlipCapture onCaptured={() => { if (slips !== null) void load(); }} />
      {/* A card sits on this route rather than the ledger's, and the difference from cash is the
          reason. Cash is a ledger fact the moment it is typed and is never reconciled; a card is
          a bank transaction with a printed running balance, so like a slip it is **provisional
          until the statement it belongs to arrives** (migration 016). It does not refresh the
          slip list, because a card is not a slip — the ledger view is where the two meet, and
          that is still ahead (PLAN task 27). */}
      <NotificationCardCapture />
      <CapturedSlips slips={slips} decided={decided} busy={busy} error={error} onLoad={() => void load()} />
    </>
  );
}
