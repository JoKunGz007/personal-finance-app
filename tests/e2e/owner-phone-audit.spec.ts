import { expect, test, type Page } from "@playwright/test";
import { CONTAINER, containerReachable, psql } from "../helpers/local-owner";

/**
 * The phone audit, at last committed (PLAN task 51, D-168).
 *
 * **This began as a gitignored throwaway under `.runtime/`, and that is what went wrong.** It was
 * the only instrument in this repository measuring tap targets and horizontal overflow at phone
 * width — and because `.gitignore` held it, it had no history, no reviewer, and no run except when
 * somebody remembered. D-157 hid `Dev sign-in` behind the Settings disclosure below 700px on
 * 2026-08-26; this spec clicks that button, so it began timing out that day and **nobody noticed
 * for three days**, during which five undersized controls shipped — including task 48's own
 * (D-165, D-168). The failure mode of a throwaway instrument is not that it fails. It is that it
 * quietly stops being run.
 *
 * **It asserts now rather than reports.** The throwaway printed a list because PLAN task 28 was
 * unscoped and there was no agreed standard. There is one now: D-168 raised six controls to 44px
 * and D-139 set the rule that the raise is phone-width only. A standard nobody checks is a
 * preference, so this fails the gate instead of printing.
 *
 * Every value seeded here is invented, per `docs/FIXTURE_POLICY.md`.
 */

/** The seeded account, from `supabase/seed.sql` and `tests/helpers/local-owner.ts`. */
const ACCOUNT = "11111111-2222-4333-8444-555555555555";

/**
 * More rows than one page holds, which is the point of the number.
 *
 * `public.list_account_transactions_page` defaults to 100, so a seed of six — what the throwaway
 * used — leaves `Load older rows` unrendered. That control measured **106×42 on the deployed
 * ledger** and it took the owner opening a 1,604-row ledger in a narrow window to put it on screen
 * at all (D-168). D-138's family from a third direction: *a surface that exists only with enough
 * data behind it*. Seeding past the page boundary is what brings it inside an audit's reach.
 */
const SEEDED_ROWS = 120;

/**
 * **Rows per day, and why the fixture stopped putting each row on its own date.**
 *
 * Until 2026-09-04 this seed wrote `date '2026-01-01' + g`, so every day held exactly one row and
 * every day heading read a short date, "1 row" and a two-figure total. **A day with one row in it is
 * not a day**, and the difference was not cosmetic: D-187's spill cleared the unfixed CSS by **3px**
 * on that fixture where the real ledger overflowed by **39.4px**, because a shorter heading wraps
 * one line fewer. A guard that red-proves by three pixels is one content change away from proving
 * nothing.
 *
 * **Ten is the busy end rather than the average, and it is chosen deliberately.** The owner's ledger
 * runs about four rows a day (1,660 rows over the 424 days its statistics page reports); the day his
 * phone capture happened to show held ten. A fixture exists to make a defect visible, so it is sized
 * for the day that shows one — but the figure is the ninetieth percentile, not the mean, and saying
 * otherwise is how a "measured" number gets quoted for years.
 *
 * **The printed-balance chain still has to reconcile, which is what constrains the change.** Rows
 * carry `500000 - g * 1000` as the printed balance and a flat `-1000` movement, so each row's
 * movement must be the difference between its printed balance and the previous row's *in the order
 * the ledger reads them*. Ten rows sharing a date at a single `09:15` would leave that order
 * ambiguous, so each row within a day is stepped seven minutes later. Ordering by (date, time) then
 * matches ascending `g` exactly as it did when the date alone carried it.
 *
 * 120 rows over 12 days still crosses the 100-row page boundary, which is what keeps `Load older
 * rows` on screen (D-168).
 */
const ROWS_PER_DAY = 10;

const ROUTES = ["/ledger", "/statistics", "/import", "/slips", "/recovery"] as const;

/** This repository's phone standard (D-168), and the width D-139 scopes it to. */
const MIN_TAP_PX = 44;
const PHONE_WIDTH = 390;

// **Viewport rather than `devices["iPhone 13"]`, because the owner config has one desktop project**
// and this spec has to reach phone width inside it. `hasTouch` comes along because a pointer-less
// device is the case the 44px rule exists for; `isMobile` is deliberately left alone, since it
// changes meta-viewport handling and nothing measured here depends on it.
//
// **390 CSS px is not a phone, and this file does not claim otherwise.** Chrome clamps a real
// window near 500px, so emulation is the only thing that reaches 390 on this machine — and D-138 is
// the standing proof that a measured width is not a device. The real-phone reading stays owed.
test.use({ viewport: { width: PHONE_WIDTH, height: 844 }, hasTouch: true });

function seedRows(owner: string): void {
  // Two sessions on purpose. `session_replication_role = replica` disables the append-only triggers
  // as well as the FK ones, which is the only way to remove a source row — but it would also
  // disable them for the *inserts*, so those run in their own ordinary session with every trigger
  // live. Components before transactions, because with FK triggers off the wrong order leaves
  // orphans that sit quietly rather than failing.
  const cleared = psql(`
    set session_replication_role = replica;
    delete from public.source_components where owner_id = '${owner}';
    delete from public.source_transactions where owner_id = '${owner}';`);
  expect(cleared.ok, `could not clear the previous run's rows: ${cleared.output}`).toBe(true);

  // One statement rather than ${SEEDED_ROWS} round trips: each `psql` is a `docker exec`, and 120
  // of them is a minute of process spawning for rows a single `generate_series` writes at once.
  const seeded = psql(`
    with inserted as (
      insert into public.source_transactions
        (owner_id, account_id, fingerprint_version, fingerprint, source_date, source_time,
         effective_date, transaction_label, description, reference, branch, post_balance_minor, currency)
      select '${owner}', '${ACCOUNT}', 'fingerprint-v1',
             md5('audit-' || g) || md5('salt-' || g),
             date '2026-01-01' + ((g - 1) / ${ROWS_PER_DAY} + 1),
             time '09:15' + (((g - 1) % ${ROWS_PER_DAY}) * interval '7 minutes'),
             date '2026-01-01' + ((g - 1) / ${ROWS_PER_DAY} + 1), 'Transfer',
             'Synthetic audit row ' || g, 'AUDITREF' || g, 'Synthetic branch',
             500000 - g * 1000, 'THB'
      from generate_series(1, ${SEEDED_ROWS}) g
      returning id
    )
    -- A flat -1000, because the printed balances above step by exactly 1000 and a row's movement
    -- has to be the difference between two printed balances. An amount that grew with the row
    -- number left the printed chain saying one thing and the components saying another, and
    -- private.combined_balances derives its running total from the printed deltas -- so after
    -- 120 rows the combined column rendered around -7,380,000 beside a printed 380,000. The audit
    -- measures layout, and the combined balance is one of the widest cells it measures, so a
    -- ledger shape no statement could produce is the wrong thing to characterise.
    -- (No backticks in here: this is inside a template literal, and one of them ended the string.)
    insert into public.source_components (owner_id, transaction_id, position, kind, amount_minor, currency)
    select '${owner}', id, 1, 'withdrawal', -1000, 'THB' from inserted;`);
  expect(seeded.ok, `could not seed the audit rows: ${seeded.output}`).toBe(true);
}

function clearRows(owner: string): void {
  psql(`
    set session_replication_role = replica;
    delete from public.source_components where owner_id = '${owner}';
    delete from public.source_transactions where owner_id = '${owner}';`);
}

/** Opens the phone header's Settings disclosure (D-157). A no-op above 700px, where it is hidden. */
async function openPhoneHeader(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "Settings" });
  if (await toggle.count() === 0 || !(await toggle.first().isVisible())) return;
  if (await toggle.first().getAttribute("aria-expanded") !== "true") await toggle.first().click();
}

type Measurement = { overflow: string[]; small: string[]; pans: boolean; scrollWidth: number };

/** Everything overflowing the viewport, and every control under the tap standard. */
async function measure(page: Page, minTap: number): Promise<Measurement> {
  return page.evaluate((min) => {
    const vw = document.documentElement.clientWidth;
    const overflow: string[] = [];
    const small: string[] = [];
    const name = (el: Element) => {
      const cls = typeof el.className === "string" && el.className.trim() !== ""
        // **`\s+`, and the throwaway had `s+`.** That split on a literal "s", so any class
        // containing one was cut in half and the reported selector was fiction. It never mattered
        // while a human read the output; it matters now that a failure message is the only thing
        // standing between a reader and the wrong element.
        ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "";
      return `${el.tagName.toLowerCase()}${cls}`;
    };
    // **The viewport is not always the right reference, and using it anyway is how this check
    // produced its first false positive.** `/import`'s stage list is 810px wide inside a container
    // that scrolls horizontally on purpose, exactly as the ledger table does — D-163 made phone
    // rows into cards but wide things still scroll inside their own box. Measured against the
    // viewport, every one of those is "outside" while the page itself is perfectly well behaved.
    //
    // So the question each element is asked is whether it escapes **its own scroll container**,
    // and whether the *document* pans is asked separately below. A deliberate scroller is allowed
    // to be wider than the screen; nothing is allowed to spill out of the box that holds it.
    const scrollParent = (el: Element): Element | null => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") return p;
      }
      return null;
    };
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const holder = scrollParent(el);
      if (holder === null) {
        if (r.right > vw + 1 || r.left < -1) overflow.push(`${name(el)} [${Math.round(r.left)}..${Math.round(r.right)}] vw=${vw}`);
      } else {
        // Against the container's *scrollable* extent, not its visible box: an element at scroll
        // offset 600 inside a 1160px-wide scroller is where it should be, and only an element
        // beyond `scrollWidth` is genuinely spilling.
        const hr = holder.getBoundingClientRect();
        const left = r.left - hr.left + holder.scrollLeft;
        if (left < -1 || left + r.width > holder.scrollWidth + 1) {
          overflow.push(`${name(el)} [${Math.round(left)}..${Math.round(left + r.width)}] inside ${name(holder)} scrollWidth=${holder.scrollWidth}`);
        }
      }
      if (!/^(button|a|select|input|textarea)$/i.test(el.tagName)) continue;
      const type = (el as HTMLInputElement).type;
      if (type === "hidden" || type === "file") continue;
      // A pixel of slack, because a 44px rule lands on 43.98 under a fractional device ratio and
      // that is the layout being right rather than wrong.
      if (r.height >= min - 1 && r.width >= min - 1) continue;
      // **A checkbox inside a label is tapped by the label**, so the input's own box is the wrong
      // element to judge — the same error as measuring the table rather than the cell. Credit the
      // label only when the label itself clears the target.
      const lr = el.closest("label")?.getBoundingClientRect();
      if (lr && lr.height >= min - 1 && lr.width >= min - 1) continue;
      small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return {
      overflow: [...new Set(overflow)].slice(0, 12),
      small: [...new Set(small)].slice(0, 12),
      pans: document.documentElement.scrollWidth > vw + 1,
      scrollWidth: document.documentElement.scrollWidth
    };
  }, minTap);
}

function assertClean(where: string, found: Measurement): void {
  expect(found.small, `${where}: controls under ${MIN_TAP_PX}px — ${found.small.join(", ")}`).toEqual([]);
  expect(found.overflow, `${where}: elements outside the viewport — ${found.overflow.join(", ")}`).toEqual([]);
  expect(found.pans, `${where}: the page pans sideways (scrollWidth ${found.scrollWidth} vs ${PHONE_WIDTH})`).toBe(false);
}

test.describe("the app at phone width", () => {
  test.skip(!containerReachable(), `local Supabase (${CONTAINER}) is not reachable — start it with \`pnpm supabase:start\``);

  test("every route holds the tap standard and stays inside the viewport", async ({ page }) => {
    const owner = psql("select id from auth.users where email = 'synthetic.owner@example.invalid';");
    expect(owner.ok && /^[0-9a-f-]{36}$/.test(owner.output.trim()), `the seeded owner must exist: ${owner.output}`).toBe(true);
    const ownerId = owner.output.trim();

    seedRows(ownerId);
    try {
      await page.goto("/ledger");
      // D-157 put every header control except the brand and the route row behind the disclosure
      // below 700px, and `Dev sign-in` is one of them. This is the line whose absence blinded the
      // throwaway for three days.
      await openPhoneHeader(page);
      await page.getByRole("button", { name: "Dev sign-in" }).click();
      await expect(page.locator(".session-state")).toContainText("aal2", { timeout: 60_000 });

      for (const route of ROUTES) {
        await page.goto(route);

        // **The instrument check, and it is the reason this file exists in its second form.** The
        // first version reported four clean routes while `.ledger-table { min-width: 1160px }` was
        // escaping the viewport on a real phone (D-138) — because nothing in this app loads until
        // asked, so every table it walked past was *absent* rather than narrow, and a rule with no
        // element to apply to cannot be measured wrong. A clean measurement of an empty shell is
        // the failure this guard converts into a red test.
        if (route === "/ledger") {
          await expect(page.locator("table"), "no table rendered — a clean audit here would be of a page nobody saw").toHaveCount(1);
          await expect(page.getByRole("button", { name: "Load older rows" }),
            `${SEEDED_ROWS} rows were seeded past the ${100}-row page, so the control D-168 found only on the real ledger must be on screen`)
            .toBeVisible();

          // **A day heading that spills onto the card below it — the defect every check above
          // walks straight past.** `measure()` asks only whether an element escapes its container
          // *horizontally*, so a heading escaping *downwards* was outside the instrument's question
          // entirely. `.ledger-table th:nth-child(1)` sizes a desktop column and sits outside every
          // media query, so it went on pinning the `colspan=7` heading cell to 115px at phone
          // width; the cell's height would not grow either. Its three parts wrapped to four lines
          // and the day total painted over the first transaction card. Found by reading the owner's
          // own 390px capture, then measured on the deployed build: 117 of 122 headings, the worst
          // by 39.4px.
          //
          // The instrument check first, in this file's own tradition (D-138): the seed writes ten
          // rows to each of twelve days, so a heading stands above every group of cards, and a run
          // that finds none is measuring a page where grouping never rendered rather than a page
          // that is correct.
          await expect(page.locator("tr.day-head"),
            "no day headings rendered — a clean check here would prove nothing")
            .not.toHaveCount(0);

          const headings = await page.evaluate(() =>
            Array.from(document.querySelectorAll("tr.day-head")).flatMap((head, i) => {
              const line = head.querySelector(".day-head-line");
              if (line === null) return [];
              const cell = head.getBoundingClientRect();
              const inner = line.getBoundingClientRect();
              // No `?? cell` fallback: substituting the row's own rect for a missing cell would
              // compute `pinched` as exactly 0 and pass, so a refactor that stopped rendering a
              // `<th>` would retire this check silently rather than failing it. `-1` is the
              // sentinel for that, and the filter below treats it as a failure and not a pass.
              const th = head.querySelector("th")?.getBoundingClientRect() ?? null;
              // Indices and pixels rather than text: a failure message is read in CI output, and
              // this one has no business carrying a ledger's dates or totals into it.
              return [{ i, spill: inner.bottom - cell.bottom, pinched: th === null ? -1 : cell.width - th.width }];
            }));

          // **The spill itself, which is what the owner saw.** Red-proved against the unfixed CSS
          // on **12 headings of 12, by 20–21px** — against the real ledger's 39.4px, which is the
          // right order of magnitude and is the reason `ROWS_PER_DAY` exists. The first fixture put
          // one row on each of 120 days and red-proved on 85 of 102 by **3px**; a guard whose
          // margin is three pixels is one content change from proving nothing, and it was written
          // that way because nobody had run it against a realistic day.
          const spilling = headings.filter((h) => h.spill > 0.5);
          expect(spilling.map((h) => `#${h.i} by ${Math.round(h.spill)}px`),
            "day headings spilling below their own row onto the card beneath").toEqual([]);

          // **The cause, asserted directly.** The heading cell must fill its row rather than keep a
          // desktop column's 115px. Both checks red-prove against the unfixed CSS, so this is not
          // the only one that bites — but it is the unconditional one: it does not care how long
          // the heading's text is, and it fires on every heading at 358 − 115 = 243px whatever the
          // fixture holds. That independence is what made it worth adding while the spill check
          // still cleared by three pixels, and it is still worth keeping now that it clears by
          // twenty. `< 0` catches the missing-cell sentinel above, so a heading that stops being a
          // `<th>` fails here rather than passing.
          const pinched = headings.filter((h) => h.pinched > 1 || h.pinched < 0);
          expect(pinched.map((h) => `#${h.i} by ${Math.round(h.pinched)}px`),
            "day heading cells narrower than their own row — a desktop column width survived the stacked mode")
            .toEqual([]);
        }
        if (route === "/statistics") {
          // Four tables and two inline charts, none of which exist until the RPC answers.
          await expect(page.locator("table").first()).toBeVisible({ timeout: 30_000 });
        }

        assertClean(`${route}, header shut`, await measure(page, MIN_TAP_PX));

        // **The second pass is what the throwaway never had for most routes.** Every measurement it
        // took ran with the disclosure shut, because navigating resets it — so the privacy chip and
        // the font picker, which live inside it, were never inside a measured viewport at all.
        // D-139 states the rule: a surface that only exists after an action is a surface no walking
        // audit can measure. This is that action, on every route rather than on one.
        await openPhoneHeader(page);
        await expect(page.locator(".header-panel"),
          `${route}: the disclosure did not open, so this would measure the collapsed header twice`)
          .toHaveAttribute("data-open", "true");
        assertClean(`${route}, header open`, await measure(page, MIN_TAP_PX));

        // **A third pass, because the disclosure is not the only surface that exists only after an
        // action.** `/statistics`' two `input[type="date"]` render only when the Custom tick is on
        // (D-170), so `.window-custom input[type="date"]` — which carries its own `min-height:
        // 44px` — sat inside this file's own definition of an unmeasurable surface, and a
        // regression dropping that rule would have shipped green past the audit written to catch
        // exactly that. Found by `/code-review high`, which is the eighth time it has found a real
        // one.
        //
        // `getByRole` and not `getByLabel`: a field labelled `To` also resolves a checkbox labelled
        // `Custom` under `getByLabel`'s case-insensitive substring match, which is the trap D-170
        // recorded while building this control.
        if (route === "/statistics") {
          await page.getByRole("checkbox", { name: "Custom" }).check();
          await expect(page.locator('.window-custom input[type="date"]'),
            "the Custom tick did not reveal the date fields, so this pass would measure nothing new")
            .toHaveCount(2);
          assertClean(`${route}, custom window open`, await measure(page, MIN_TAP_PX));
        }
      }
    } finally {
      // In `finally` so a failed assertion does not leave 120 synthetic rows behind for the next
      // suite to trip over — which is how two leftover accounts blocked both Vitest and the owner
      // suite on 2026-08-29 through D-048's guard.
      clearRows(ownerId);
    }
  });
});
