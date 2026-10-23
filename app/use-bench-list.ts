"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useLoadOnArrival } from "@/app/use-load-on-arrival";
import type { WireResult } from "@/lib/wire";

/**
 * The list load five benches (deliveries, receipts, Shopee, categories, slips) and the two statistics
 * panels (deliveries, receipts) each copied: busy on, errors cleared, one request, then data, a
 * sign-in note or an error (D-301, D-302).
 *
 * **Only the latest load commits.** A sequence number counts the calls; an answer that is no longer
 * the newest is dropped, data, error, note and `busy` alike. Without it two overlapping loads let
 * the older answer, arriving last, overwrite the newer snapshot, and the first to finish set `busy`
 * false while another was still pending.
 *
 * Signed out is not a failure on an automatic load (arrival or the sign-in retry): a 401 becomes
 * `signInNote` (`signInText`), a 403 shows the route's own words there. A manual load shows both as
 * `error`. `error` is the load's alone: a bench keeps a write's refusal in its own state, or the
 * reload that follows the write would clear it, or show it as a failed load (D-302). `setData` is for
 * a bench that folds a written row into its list; `setBusy` is for a write that holds the controls
 * (Shopee's `act`).
 */

const NOTHING = async () => {};

export function useBenchList<T>(
  fetchList: () => Promise<WireResult<T>>,
  options: { signInText?: string; onArrival?: boolean } = {}
): {
  data: T | null;
  setData: Dispatch<SetStateAction<T | null>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  signInNote: string | null;
  load: (automatic?: boolean) => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInNote, setSignInNote] = useState<string | null>(null);

  // Held in refs so `load` stays one function for the component's life: the arrival effect keys on it.
  const fetchRef = useRef(fetchList);
  const signInTextRef = useRef(options.signInText);
  useEffect(() => {
    fetchRef.current = fetchList;
    signInTextRef.current = options.signInText;
  });
  const latest = useRef(0);

  const load = useCallback(async (automatic = false) => {
    const mine = ++latest.current;
    setBusy(true);
    setError(null);
    setSignInNote(null);
    const result = await fetchRef.current();
    if (mine !== latest.current) return;
    setBusy(false);
    if (!result.ok) {
      if (automatic && (result.status === 401 || result.status === 403)) {
        setSignInNote(result.status === 401 ? signInTextRef.current ?? result.why : result.why);
        return;
      }
      setError(result.why);
      return;
    }
    setData(result.data);
  }, []);

  // Always called, so the hook count never changes; a bench that loads on demand passes a no-op.
  useLoadOnArrival(options.onArrival === false ? NOTHING : load, signInNote !== null);

  return { data, setData, busy, setBusy, error, signInNote, load };
}
