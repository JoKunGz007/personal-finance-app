"use client";

import { useCallback, useState } from "react";
import { CapturedSlips } from "@/app/captured-slips";
import { SlipCapture } from "@/app/slip-capture";
import { slipListSchema, slipsInForce, type CapturedSlip } from "@/lib/slips";
import { readError } from "@/lib/wire";

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
  const [slips, setSlips] = useState<CapturedSlip[] | null>(null);
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/slips", { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readError(body, "Captured slips could not be loaded."));
        return;
      }
      const parsed = slipListSchema.safeParse(body);
      if (!parsed.success) {
        setError("The slips response did not match its contract, so none are shown.");
        return;
      }
      // Shown as they stand, corrections applied. A list that displayed the captured figure
      // beside a ledger showing the corrected one would make the two surfaces disagree about
      // the same slip, and the one to trust would not be the one that looks authoritative.
      setSlips(slipsInForce(parsed.data.slips, parsed.data.corrections));
      setDecided(new Set(parsed.data.matches.map((match) => match.slip_id)));
    } catch {
      setError("The ledger could not be reached, so captured slips are not shown.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <>
      <SlipCapture onCaptured={() => { if (slips !== null) void load(); }} />
      <CapturedSlips slips={slips} decided={decided} busy={busy} error={error} onLoad={() => void load()} />
    </>
  );
}
