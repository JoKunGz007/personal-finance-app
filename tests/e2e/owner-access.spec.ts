import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, unlinkSync } from "node:fs";
import { totp } from "../../lib/dev/totp";
import { containerReachable, ownerId, psql } from "../helpers/local-owner";

// The real sign-in surface, in a real browser (PLAN task 19, step one).
//
// **Why this needs a browser at all.** `lib/owner-access.ts` decides which state applies and
// is unit-tested without one, but nothing there proves that Supabase's enrolment actually
// returns a scannable square, that a code typed into the form is accepted, or that the
// session ends up at the level `strongOwnerClient` demands. Those are the parts that were
// unreachable until now: the app's only sign-in minted `aal2` with both factors already
// verified, so no enrolment screen and no challenge screen had ever been rendered.
//
// `?stop=aal1` on the development sign-in is what makes them reachable — the same synthetic
// password sign-in, stopped before the MFA climb, behind the same three guards.
//
// Google itself is not exercised here and cannot be: `signInWithOAuth` hands the browser to
// a third party. What this covers is everything after the redirect comes back, which is the
// half that is this app's code.

const SECRET_STORE = ".runtime/dev-mfa-private-ledger-local.json";

const reachable = containerReachable();
test.skip(!reachable, "The local Supabase container is unreachable; run `pnpm supabase:start`.");

/**
 * Sign in and stop at aal1, leaving the browser holding the cookie session.
 *
 * The request is made **from the page** rather than through `page.request`, and that is
 * load-bearing rather than stylistic: the session cookies have to be written into the same
 * jar `document.cookie` reads, which is what `@supabase/ssr`'s browser client uses. Driven
 * through `page.request` the enrolment call still succeeded — the cookies reached the
 * server — while `challengeAndVerify` failed with `Auth session missing!`, because the
 * client in the page had never seen a session at all. This is also how the app's own
 * development sign-in button does it.
 */
async function devSignIn(page: import("@playwright/test").Page, query = "") {
  const result = await page.evaluate(async (search) => {
    const response = await fetch(`/api/v1/dev/session${search}`, { method: "POST", cache: "no-store" });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }, query);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body;
}

async function signInAtAal1(page: import("@playwright/test").Page) {
  const body = await devSignIn(page, "?stop=aal1");
  expect(body.level).toBe("aal1");
  await page.reload();
}

function verifiedFactorCount(): number {
  return Number(psql(`select count(*) from auth.mfa_factors where user_id = '${ownerId()}' and status = 'verified';`).output.trim());
}

// **Both hooks, and the second one is the one that matters.** These tests are the only
// place that enrols a factor through the UI, so the secrets belong to the test rather than
// to `.runtime/dev-mfa-*.json` — and a factor whose secret the development route never saw
// is exactly the lockout that route reports as a 409. Playwright interleaves these tests
// with `owner-session.spec.ts`, whose every test signs in through that route, so leaving one
// behind fails a *different file* with `AAL2 required to enroll a new factor`, which names
// neither this spec nor the factor it left. Clearing on the way out as well as on the way in
// is what keeps the two files independent (GOTCHAS, "Leftover test accounts collide…").
function clearFactors() {
  psql(`delete from auth.mfa_factors where user_id = '${ownerId()}';`);
  // The route's remembered secrets go too: they name factor ids that no longer exist, and a
  // run that ends must leave this machine as it found it.
  try { unlinkSync(SECRET_STORE); } catch { /* absent is the normal case */ }
}

test.beforeEach(clearFactors);
test.afterEach(clearFactors);

test("enrols both factors from the app, and the ledger stays shut until the second one lands", async ({ page }) => {
  await page.goto("/ledger");
  await signInAtAal1(page);
  expect(verifiedFactorCount(), "this test must start from no factors at all").toBe(0);

  const panel = page.getByRole("region", { name: "Two authenticator codes are required" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("0 of 2");

  const secrets: string[] = [];
  for (const factor of [1, 2]) {
    await panel.getByRole("button", { name: factor === 1 ? "Set up the first factor" : "Set up the second factor" }).click();

    // The square and the typed key are both offered. The key is what makes this usable
    // without a camera, and it is what this test reads — a QR is not machine-readable here
    // for the same reason it is not screen-reader-readable.
    await expect(panel.locator(".owner-access-qr")).toBeVisible();
    const secret = (await panel.locator(".owner-access-secret code").innerText()).trim();
    expect(secret.length).toBeGreaterThan(0);
    expect(secrets, "each factor must get its own secret").not.toContain(secret);
    secrets.push(secret);

    if (factor === 1) {
      // The accessibility pass runs while the panel is at its fullest — image, key, label
      // and field all present. It is the only automatic check this surface has.
      const results = await new AxeBuilder({ page }).include(".owner-access-panel").analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

      // Focus is on the field the owner has to type into, without a click. D-070 found
      // exactly this defect in the match chooser, where no axe pass could see it.
      await expect(page.locator("#owner-access-code")).toBeFocused();
    }

    await page.locator("#owner-access-code").fill(totp(secret));
    await panel.getByRole("button", { name: "Confirm this factor" }).click();

    // Asserted on the message rather than on what disappears next. A rejected code leaves
    // the panel looking almost identical — same heading, same count — so a later assertion
    // would report the count it found and say nothing about why the code failed.
    await expect(page.locator(".owner-access-message")).toContainText("Accepted.");

    if (factor === 1) {
      // **The state this whole module exists for.** One verified factor already puts the
      // session at Supabase's own `aal2`, and the app still refuses to show anything —
      // so the panel must still be here, now asking for the second.
      await expect(panel).toContainText("1 of 2");
      await expect(panel.getByRole("button", { name: "Set up the second factor" })).toBeVisible();
      expect(verifiedFactorCount()).toBe(1);
    }
  }

  // Both factors in, and the panel is gone rather than merely quiet.
  await expect(page.getByText("Signed in as")).toBeVisible();
  await expect(page.getByRole("region", { name: "Two authenticator codes are required" })).toHaveCount(0);

  // Asserted against the database, not the component's own report of itself — this is the
  // count `private.has_strong_owner_access` reads.
  expect(verifiedFactorCount()).toBe(2);
});

test("asks a returning owner for one code, and refuses a wrong one without losing the session", async ({ page }) => {
  // Enrol through the development route's ordinary path, which records each factor's secret
  // where this test can read it — the returning-owner case starts from factors that already
  // exist, which is exactly what the enrolment test does not leave behind.
  await page.goto("/ledger");
  const minted = await devSignIn(page);
  expect(minted.level, "the ordinary path must reach aal2").toBe("aal2");
  const stored: Array<{ factorId: string; secret: string }> = JSON.parse(readFileSync(SECRET_STORE, "utf8"));
  expect(verifiedFactorCount()).toBe(2);

  // Signing out is the path a returning owner takes, and it is also what drops this session
  // back to nothing so the next one starts at aal1 with both factors already in place.
  await page.reload();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await signInAtAal1(page);

  const panel = page.getByRole("region", { name: "Enter a code from your authenticator" });
  await expect(panel).toBeVisible();
  // No enrolment offered: both factors exist, so the only thing missing is proof.
  await expect(page.getByRole("region", { name: "Two authenticator codes are required" })).toHaveCount(0);
  await expect(page.locator("#owner-access-code")).toBeFocused();

  // A wrong code is refused and says so, and the panel survives it. A challenge screen that
  // dropped the session on a typo would send the owner back through Google every time.
  await page.locator("#owner-access-code").fill("000000");
  await panel.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".owner-access-message")).toContainText("not accepted");
  await expect(panel).toBeVisible();

  // The factor the component chose, rather than whichever one this test would have guessed.
  const factorId = await panel.locator("form").getAttribute("data-factor-id");
  const secret = stored.find((entry) => entry.factorId === factorId)?.secret;
  expect(secret, `no stored secret for the chosen factor ${factorId}`).toBeTruthy();

  await page.locator("#owner-access-code").fill(totp(secret!));
  await panel.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Signed in as")).toBeVisible();
  await expect(page.getByRole("region", { name: "Enter a code from your authenticator" })).toHaveCount(0);
  // Nothing was enrolled to get here — a challenge proves a factor, it does not add one.
  expect(verifiedFactorCount()).toBe(2);
});
