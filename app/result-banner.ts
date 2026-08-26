"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * The attribute the focus target carries. **One spelling, deliberately.**
 *
 * It was two: `app/import-bench.tsx` introduced `data-bind-result` for the same role its two
 * siblings already spelled `data-capture-result` (D-147), so a sweep for the pattern found two of
 * three. Exported so a call site names the constant rather than retyping the string — a banner that
 * spells it differently is not focused, and nothing fails.
 */
export const RESULT_ATTRIBUTE = "data-capture-result";

/**
 * Brings a result banner into view and moves focus to it, which is the whole accessibility contract
 * for "something happened, and the answer is somewhere the owner is not looking".
 *
 * **This was three copies before 2026-08-25** (D-150) — `app/notification-card-capture.tsx`,
 * `app/statement-batch.tsx` and `app/import-bench.tsx` each carried the same
 * `requestAnimationFrame` → `scrollIntoView` → `focus({ preventScroll: true })` body, and each
 * carried its own copy of the reasoning below. They had begun to drift: the newest spelled the
 * focus target differently, and a fourth capture surface would have started from whichever copy its
 * author happened to open.
 *
 * Two call shapes, because the three sites genuinely have two:
 *
 * - **Pass `announce`** and the banner is revealed whenever that value changes to something
 *   non-null. Use it where the result is state — a binding outcome, a confirmation.
 * - **Call `reveal()`** where the result is an event with more than one origin, as on the card
 *   capture form, which announces from three different handlers.
 *
 * Both are the same behaviour and neither is a wrapper around the other; `announce` is an effect
 * that calls `reveal`.
 *
 * ### Why the body is what it is
 *
 * **Deferred a frame**, because it runs in the same commit that puts the banner on screen:
 * scrolling before the layout includes it lands short by the banner's own height.
 *
 * **No `behavior` is passed, and that is the accessible choice rather than an omission.** Left
 * unspecified the browser follows the CSS `scroll-behavior`, which `app/globals.css` sets to
 * `smooth` and overrides to `auto` under `prefers-reduced-motion`. Passing `"smooth"` here would
 * ignore that preference for the one person who set it.
 *
 * **Focus follows the eye** (D-125). The scroll moves the viewport and nothing else, so a keyboard
 * user would be left on a control that has just gone off-screen — Tab would continue from something
 * they can no longer see. Moving focus to the result is the standard pattern for a region like this
 * and is **not** a focus trap: Tab and Escape behave normally and nothing on the page is hidden,
 * which is exactly the difference from the modal dialog D-123 declined.
 *
 * `preventScroll` because the scroll above already chose the position; letting focus scroll as well
 * overrides `scroll-margin-top` and jams the banner against the viewport edge.
 *
 * @param announce Reveal whenever this changes to a non-null value. Omit for the imperative shape.
 * @returns `anchor`, for the element holding the banner, and `reveal` to do it by hand.
 */
export function useResultBanner(announce?: unknown): {
  readonly anchor: RefObject<HTMLDivElement | null>;
  readonly reveal: () => void;
} {
  const anchor = useRef<HTMLDivElement | null>(null);

  // A stable identity, so the effect below can list it as a dependency and still re-run on
  // `announce` alone. A function rebuilt every render would re-run that effect every render, which
  // is a scroll on every keystroke. `anchor` is a ref and never changes identity, so the empty
  // dependency list is honest rather than a suppression.
  const reveal = useCallback(() => {
    requestAnimationFrame(() => {
      const element = anchor.current;
      if (!element) return;
      element.scrollIntoView({ block: "start" });
      // **A banner that spells the attribute differently is simply not focused, and nothing fails
      // — which is how the spelling drifted in the first place.** The scroll still happens, so the
      // page looks right and only a keyboard user is left behind. There is no runtime warning here
      // on purpose: `tests/privacy.test.ts` forbids browser logging anywhere under `app/`, and a
      // guard that fires in the gate beats one that fires in a browser nobody is watching. That
      // same file asserts the spelling across every caller instead.
      element.querySelector<HTMLElement>(`[${RESULT_ATTRIBUTE}]`)?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    // `undefined` is "this caller does not use the announce shape"; `null` is "there is no result
    // right now". Neither is something to scroll to, and the distinction matters because clearing a
    // banner must not scroll to where it used to be.
    if (announce === undefined || announce === null) return;
    reveal();
  }, [announce, reveal]);

  return { anchor, reveal };
}
