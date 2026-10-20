import { test, expect } from "./fixtures/test";
import { unauthenticatedTest } from "./fixtures/test";

test.describe("Journey 2: Auth & Organization Gate", () => {
  unauthenticatedTest(
    "boundary state: accessing protected analysis route while signed out redirects to sign-in",
    async ({ page }) => {
      await page.goto("/analysis/00000000-0000-0000-0000-000000000000");

      // Middleware protects /analysis/* and redirects unauthenticated users to /sign-in
      await page.waitForURL((url) => url.pathname.includes("sign-in"));
      expect(page.url()).toContain("sign-in");
    }
  );

  test("happy path: signed in user with active organization accesses dashboard", async ({
    page,
  }) => {
    await page.goto("/");

    // Should NOT show landing page or sign-in buttons
    await expect(page.getByTestId("header-sign-in-btn")).not.toBeVisible();

    // Should show Dashboard New Analysis form and Analyses table
    await expect(page.getByRole("heading", { name: "NEW ANALYSIS" })).toBeVisible();
    await expect(page.getByTestId("analysis-repo-input")).toBeVisible();
    await expect(page.getByTestId("analysis-submit-btn")).toBeVisible();
  });
});
