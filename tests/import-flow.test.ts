import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bannerCarriesRefusal, bannerFor, confirmationFor, confirmed, openedFromWorklist, rebound,
  type BindOutcome, type Worklist
} from "@/lib/import-flow";

/**
 * The statement worklist's decisions, none of which need a browser to exercise.
 *
 * **This is the gap `PLAN.md` calls the largest thing owed, closed for the part that carried the
 * bugs.** No committed spec drives the batch worklist, and none could while these decisions lived
 * inside a React component — the only coverage was gitignored throwaways under `.runtime/`. Two
 * defects came out of exactly this logic in three days (D-147, D-148); both are asserted here.
 *
 * Every value invented, per `docs/FIXTURE_POLICY.md`. No amount, account or date appears: this
 * module handles labels, row counts and phases, and deliberately touches no money.
 */

const BOUND: BindOutcome = { kind: "bound", accountLabel: "Everyday •••• 4242" };
const NEEDS: BindOutcome = { kind: "needs-account" };
const REFUSED: BindOutcome = { kind: "refused", message: "Its printed last four match no account." };

const working = (phase: BindOutcome = BOUND): Worklist => openedFromWorklist("statement-a.pdf", 12, phase);

describe("taking a statement off the worklist", () => {
  it("carries the label and row count the banner will name", () => {
    expect(working()).toEqual({ label: "statement-a.pdf", rows: 12, phase: BOUND });
  });

  it("records all three outcomes a Bind & review press can produce", () => {
    // A statement leaves the worklist through three doors: it binds automatically (D-144), it
    // needs an account chosen, or `assembleImportPayload` refuses it.
    expect(working(BOUND).phase.kind).toBe("bound");
    expect(working(NEEDS).phase.kind).toBe("needs-account");
    expect(working(REFUSED).phase.kind).toBe("refused");
  });
});

describe("binding by hand", () => {
  it("moves the phase and keeps the entry it belongs to", () => {
    expect(rebound(working(NEEDS), BOUND)).toEqual({ label: "statement-a.pdf", rows: 12, phase: BOUND });
  });

  it("leaves the single-import path alone, because it has no worklist to answer to", () => {
    expect(rebound(null, BOUND)).toBeNull();
  });

  it("replaces a refusal rather than accumulating one beside a binding", () => {
    // The two used to be `boundTo: string | null` and `refusal: string | null` with a prose
    // invariant saying they are never both set. Now the phase is one of them or the other.
    const after = rebound(working(REFUSED), BOUND);
    expect(after?.phase).toEqual(BOUND);
  });
});

describe("reaching the ledger", () => {
  it("carries the account and batch id the worklist banner names", () => {
    const after = confirmed(working(), "Everyday •••• 4242", "batch-77");
    expect(after?.phase).toEqual({ kind: "confirmed", accountLabel: "Everyday •••• 4242", batchId: "batch-77" });
  });

  it("**cannot label a confirmation with an earlier statement's name** — D-147", () => {
    // The defect: `workingLabel` was only ever set, never cleared, so confirming a *single* import
    // after working a worklist entry still found it non-null and announced that the earlier
    // statement had reached the ledger, carrying this one's row count, account and batch id.
    // Off the worklist there is now nothing to label, and that is a property rather than a habit.
    expect(confirmed(null, "Everyday •••• 4242", "batch-77")).toBeNull();
  });

  it("keeps the label and row count of the statement actually confirmed", () => {
    const after = confirmed(openedFromWorklist("statement-b.pdf", 3, BOUND), "Savings •••• 1111", "batch-78");
    expect(after?.label).toBe("statement-b.pdf");
    expect(after?.rows).toBe(3);
  });
});

describe("what the banner says", () => {
  it("names the account on a binding, in the captured tone", () => {
    const banner = bannerFor(working(BOUND));
    expect(banner?.tone).toBe("captured");
    expect(banner?.heading).toBe("statement-a.pdf is bound to Everyday •••• 4242.");
    expect(banner?.body).toContain("12 row(s)");
    // The one thing the owner most needs to know before he looks away.
    expect(banner?.body).toContain("not in the ledger until you do");
  });

  it("asks for an account in the neutral tone, not the failure one", () => {
    const banner = bannerFor(working(NEEDS));
    expect(banner?.tone).toBe("already");
    expect(banner?.heading).toContain("needs an account");
  });

  it("quotes the refusal in the failed tone and says nothing was sent", () => {
    const banner = bannerFor(working(REFUSED));
    expect(banner?.tone).toBe("failed");
    expect(banner?.body).toContain("Its printed last four match no account.");
    expect(banner?.body).toContain("Nothing has been sent.");
  });

  it("says nothing once confirmed, so one press is not answered twice", () => {
    // The worklist renders its own confirmation banner and scrolls the owner back up to it.
    // Leaving this one up answered the same press in two places, one of them stale.
    const after = confirmed(working(), "Everyday •••• 4242", "batch-77");
    expect(after && bannerFor(after)).toBeNull();
  });
});

describe("the confirmation the worklist shows", () => {
  it("is derived from the phase rather than stored beside it", () => {
    const after = confirmed(openedFromWorklist("statement-c.pdf", 40, BOUND), "Savings •••• 1111", "batch-79");
    expect(confirmationFor(after)).toEqual({
      label: "statement-c.pdf", rows: 40, accountLabel: "Savings •••• 1111", batchId: "batch-79"
    });
  });

  it("is absent until the statement is actually in the ledger", () => {
    expect(confirmationFor(working(BOUND))).toBeNull();
    expect(confirmationFor(working(NEEDS))).toBeNull();
    expect(confirmationFor(working(REFUSED))).toBeNull();
    expect(confirmationFor(null)).toBeNull();
  });
});

describe("not announcing the same refusal twice", () => {
  it("suppresses the alert only while the banner is the one carrying it", () => {
    expect(bannerCarriesRefusal(working(REFUSED))).toBe(true);
    expect(bannerCarriesRefusal(working(BOUND))).toBe(false);
    expect(bannerCarriesRefusal(working(NEEDS))).toBe(false);
    expect(bannerCarriesRefusal(null)).toBe(false);
  });

  it("**asks where the message came from, not what it says**", () => {
    // The suppression was `bindingError !== batchBinding?.refusal` — string equality between two
    // independently-set pieces of state. It held only while no other path could produce the same
    // sentence, and would have broken silently the day two wordings converged: the alert would
    // simply vanish. Here the "choose an account" guard message is not a phase, so it is never
    // suppressed no matter what it happens to say.
    const sameWords = rebound(working(NEEDS), { kind: "refused", message: "Choose the ledger account this statement belongs to." });
    expect(bannerCarriesRefusal(sameWords)).toBe(true);
    // …and off the worklist entirely, nothing is ever suppressed.
    expect(bannerCarriesRefusal(null)).toBe(false);
  });
});

describe("leaving the worklist", () => {
  it("**is one value going to null, so it cannot be done by halves** — D-148", () => {
    // The defect: three `useState` slots meant leaving needed all three cleared, via a helper that
    // was then called at two of the four exits. A stale binding banner survived onto an unrelated
    // PDF, above a live Confirm button still holding the previous statement's payload. With one
    // value there is no combination to get wrong: everything derived from it goes at once.
    const nothing: Worklist | null = null;
    expect(bannerFor.length).toBe(1);
    expect(confirmationFor(nothing)).toBeNull();
    expect(bannerCarriesRefusal(nothing)).toBe(false);
    expect(rebound(nothing, BOUND)).toBeNull();
    expect(confirmed(nothing, "Everyday •••• 4242", "batch-77")).toBeNull();
  });
});

/**
 * **The helper that discards a loaded statement must account for every piece of state, and this is
 * what makes "account for" checkable.**
 *
 * `discardLoadedStatement()` clears what belongs to the document the owner is putting down. It is
 * the third attempt at this problem in four days: D-147 was state that was only ever set, D-148 was
 * the helper written to fix that being called at two of four exits, and this is the remaining hole
 * — a helper is a list, lists go stale, and adding a 27th `useState` without adding a line here
 * fails silently and looks exactly like a slot that was meant to survive.
 *
 * So the list is no longer trusted: every `useState` in the component must be **either** cleared by
 * the helper **or** named below with a reason it outlives a document. A new one that is neither
 * fails the gate, and the author has to decide which it is. That is the whole point — the failure
 * is not "you forgot", it is "say which of these two this is".
 *
 * Asserted by reading the source, which is this repo's established idiom for a structural promise
 * (`tests/privacy.test.ts`). It is matched on the setter call rather than on a word, because a
 * comment naming a setter is not a call to it — a mistake this repo's guards have now made three
 * times.
 */
describe("everything a discarded statement leaves behind", () => {
  /**
   * State that deliberately outlives the document, and why. **A reason is required**: an entry
   * added here without one is how this guard would become a rubber stamp.
   */
  const SURVIVES: Record<string, string> = {
    stage: "the caller sets it in the same handler, to unlock or select",
    file: "the caller sets it — it *is* the newly chosen document",
    password: "the field the owner is about to type into; `parsePdf` clears it after each attempt",
    status: "the caller replaces it with a sentence about the new document",
    accounts: "the ledger's account list, which belongs to the owner and not to any statement",
    idempotencyKey: "minted fresh on every successful bind, and unreachable without `boundAccount`",
    newAccountLabel: "the create-account sub-form, which is about the ledger rather than this PDF",
    newAccountType: "the create-account sub-form's savings/current toggle, likewise about the ledger",
    backupPassword: "the synthetic preview's own field, on a path that never loads a real statement",
    previewStale: "records that the synthetic preview was confirmed in this browser, not what is loaded",
    confirmedDigests: "session-scoped memory of what reached the ledger — forgetting it would re-invite a second pass",
    autoBind: "a preference the owner set, not a property of any document"
  };

  const source = readFileSync("app/import-bench.tsx", "utf8");

  const declared = [...source.matchAll(/const \[(\w+), set\w+\] = useState/gu)].map((m) => m[1]!);

  const helper = /function discardLoadedStatement\(\)[\s\S]*?\n  \}/u.exec(source)?.[0] ?? "";

  it("the helper must exist for this guard to mean anything", () => {
    expect(helper).toContain("setWorklist(null)");
    expect(declared.length).toBeGreaterThan(20);
  });

  it("accounts for every piece of state, as either cleared or deliberately kept", () => {
    // A setter *call*, not the word: `discardLoadedStatement`'s own comment names `setChosenAccountId`
    // in prose, and prose is not a clear.
    const cleared = new Set(
      [...helper.matchAll(/\bset([A-Z]\w*)\(/gu)].map((m) => m[1]![0]!.toLowerCase() + m[1]!.slice(1))
    );

    const unaccounted = declared.filter((name) => !cleared.has(name) && !(name in SURVIVES));
    expect(
      unaccounted,
      "new state must be cleared by discardLoadedStatement() or listed in SURVIVES with a reason — "
      + "a slot that is neither is the D-147 defect waiting to happen"
    ).toEqual([]);
  });

  it("keeps the kept-list honest, so it cannot quietly become an excuse", () => {
    // Two ways this guard rots: a name listed as surviving that the helper also clears (the list is
    // now lying about the code), and a name listed that no longer exists (the list outlived its
    // state and would hide a real omission behind a stale entry).
    const cleared = new Set(
      [...helper.matchAll(/\bset([A-Z]\w*)\(/gu)].map((m) => m[1]![0]!.toLowerCase() + m[1]!.slice(1))
    );
    for (const name of Object.keys(SURVIVES)) {
      expect(declared, `SURVIVES names ${name}, which is no longer state in the component`).toContain(name);
      expect(cleared.has(name), `SURVIVES claims ${name} outlives a document, but the helper clears it`).toBe(false);
      expect(SURVIVES[name]!.length, `${name} needs a reason, not an empty string`).toBeGreaterThan(10);
    }
  });

  it("clears the chooser, because only the batch path used to", () => {
    // The concrete omission this guard found on the day it was written. `workBatchEntry` reset the
    // dropdown and the file picker did not, so choosing a PDF by hand kept the previous statement's
    // account selected. Never a wrong import — binding still checks the printed bank code and last
    // four — but the same misdirection one path had already been fixed for.
    expect(helper).toContain('setChosenAccountId("")');
  });
});
