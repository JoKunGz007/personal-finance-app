"use client";

import { useEffect, useRef } from "react";
import { onOwnerReady, ownerReadyGeneration } from "@/lib/owner-ready";

/**
 * Load once on arrival, and again once the owner signs in if that first load was refused for want
 * of a session — the same two halves `app/categories-bench.tsx` spells out inline (PLAN task 43).
 * Signing in does not navigate, so without the second half a visit that lands signed out stays
 * empty until a manual reload.
 */
export function useLoadOnArrival(load: (automatic: boolean) => Promise<void>, waitingForSignIn: boolean) {
  const loadRequested = useRef(false);
  useEffect(() => {
    if (loadRequested.current) return;
    loadRequested.current = true;
    void load(true);
  }, [load]);

  const retriedAtGeneration = useRef(0);
  useEffect(() => {
    if (!waitingForSignIn) return;
    const retry = () => {
      const current = ownerReadyGeneration();
      if (current === 0 || retriedAtGeneration.current >= current) return;
      retriedAtGeneration.current = current;
      void load(true);
    };
    retry();
    return onOwnerReady(retry);
  }, [waitingForSignIn, load]);
}
