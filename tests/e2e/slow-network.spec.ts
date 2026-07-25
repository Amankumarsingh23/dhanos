import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./support/ui";

/**
 * PROMPT 55 (production acceptance review) — "slow network" review item.
 * A real bug was found and fixed during this pass: the Accounts page's
 * "Show closed" checkbox is bound to a URL-searchParam-driven filter
 * (filters.includeClosed, read fresh from the Server Component on every
 * navigation — see src/features/accounts/accounts-manager.tsx) rather
 * than local state, so its `checked` prop stayed stale (unchecked) for
 * the *entire* round trip after being clicked — confirmed live to stay
 * unchecked for the full duration of a simulated 1.5s-latency request,
 * only flipping once the new server-rendered data arrived. On any real
 * network latency this looks completely unresponsive: a user clicks,
 * sees nothing happen, and reasonably concludes the click didn't
 * register. Fixed with `useOptimistic` — the checkbox now reflects the
 * clicked value immediately and reconciles with the real value once the
 * navigation settles. This spec is the permanent regression guard.
 */
test("show-closed checkbox reflects the click immediately, even under slow network, never appearing unresponsive", async ({
  page,
}) => {
  await signUpAndOnboard(page, "slow-network-checkbox");
  await page.goto("/app/accounts");

  const toggle = page.getByLabel(/show closed/i);
  await expect(toggle).not.toBeChecked();

  // Simulate real latency specifically for the navigation the checkbox
  // itself triggers (the initial page load is unthrottled, matching a
  // real user who's already on the page before the network degrades).
  await page.route("**/app/accounts*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await toggle.click();

  // Must show checked immediately — not just "eventually, once the
  // request finishes" (expect()'s own retry/polling would let a slow
  // eventual-consistency bug pass silently; sampling forces the point).
  await expect(toggle).toBeChecked({ timeout: 200 });

  // ...and must *stay* checked throughout the slow round trip, not flip
  // back to unchecked while waiting and then re-check once data arrives.
  for (let i = 0; i < 10; i++) {
    await expect(toggle).toBeChecked();
    await page.waitForTimeout(100);
  }

  // Once the (slow) navigation actually completes, the real server value
  // has caught up to the optimistic one — still checked, now for real.
  await expect(toggle).toBeChecked({ timeout: 3000 });
});
