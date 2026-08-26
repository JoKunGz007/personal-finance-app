import { afterEach, describe, expect, it, vi } from "vitest";
import {
  announceOwnerReady,
  onOwnerReady,
  OWNER_READY_EVENT,
  ownerReadyGeneration,
  resetOwnerReadyForTests
} from "@/lib/owner-ready";

/**
 * The announcement that lets a read refused for want of a session recover without a press.
 *
 * **Why this module has tests at all.** It is four small functions, and every one of its rules
 * was learned from a failure rather than designed: the ledger began loading on arrival (PLAN
 * task 43), a sign-in that does not navigate left the table empty behind it, the obvious fix
 * lost a race, and the fix for the race could loop. None of that is visible in the shape of the
 * code, so it is pinned here.
 */

afterEach(() => {
  resetOwnerReadyForTests();
  vi.unstubAllGlobals();
});

describe("the count", () => {
  it("starts at zero, which is what a subscriber reads as 'no news yet'", () => {
    expect(ownerReadyGeneration()).toBe(0);
  });

  it("rises once per announcement", () => {
    announceOwnerReady();
    expect(ownerReadyGeneration()).toBe(1);
    announceOwnerReady();
    expect(ownerReadyGeneration()).toBe(2);
  });

  /**
   * The reason it is a count and not a boolean.
   *
   * A page wants this news because a request of its own was refused, and that refusal travels
   * over the network while the sign-in producing the news happens locally. On the path this was
   * written for the announcement fires *first*, so a listener subscribing on the refusal
   * subscribes to something that has already happened. A count survives being missed.
   */
  it("is readable after the fact, so an announcement made before anyone listened is not lost", () => {
    announceOwnerReady();

    const listener = vi.fn();
    onOwnerReady(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(ownerReadyGeneration()).toBe(1);
  });
});

describe("subscribing", () => {
  it("hears an announcement made while listening", () => {
    const listener = vi.fn();
    onOwnerReady(listener);

    announceOwnerReady();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops hearing after the returned unsubscribe is called", () => {
    const listener = vi.fn();
    const off = onOwnerReady(listener);

    announceOwnerReady();
    off();
    announceOwnerReady();

    expect(listener).toHaveBeenCalledTimes(1);
    // The count still moved: unsubscribing stops delivery, not the fact.
    expect(ownerReadyGeneration()).toBe(2);
  });

  it("dispatches on the window under a namespaced name, so nothing else answers to it", () => {
    const heard = vi.fn();
    window.addEventListener(OWNER_READY_EVENT, heard);
    announceOwnerReady();
    window.removeEventListener(OWNER_READY_EVENT, heard);

    expect(heard).toHaveBeenCalledTimes(1);
    expect(OWNER_READY_EVENT).toContain("private-ledger:");
  });
});

/**
 * The pattern `app/transactions-view.tsx` uses, asserted here rather than only in a browser.
 *
 * A view retries at most once per announcement. Without the comparison a refused retry would set
 * the state that re-registers the listener, which would retry, which would be refused — a loop
 * that no attempt limit or timer is needed to prevent once the question is "is there news since
 * I last acted" rather than "should I try again".
 */
describe("acting on it at most once per announcement", () => {
  function subscriber() {
    let actedAt = 0;
    const attempts = vi.fn();
    const attempt = () => {
      const current = ownerReadyGeneration();
      if (current === 0 || actedAt >= current) return;
      actedAt = current;
      attempts();
    };
    return { attempt, attempts };
  }

  it("does nothing when nothing has been announced", () => {
    const { attempt, attempts } = subscriber();
    attempt();
    expect(attempts).not.toHaveBeenCalled();
  });

  it("acts once on an announcement it missed", () => {
    announceOwnerReady();
    const { attempt, attempts } = subscriber();

    attempt();
    expect(attempts).toHaveBeenCalledTimes(1);
  });

  it("does not act again on the same announcement, however often it re-checks", () => {
    announceOwnerReady();
    const { attempt, attempts } = subscriber();

    attempt();
    attempt();
    attempt();

    expect(attempts).toHaveBeenCalledTimes(1);
  });

  it("acts again on a genuinely new announcement", () => {
    announceOwnerReady();
    const { attempt, attempts } = subscriber();
    attempt();

    announceOwnerReady();
    attempt();

    expect(attempts).toHaveBeenCalledTimes(2);
  });
});
