import { test, expect } from "./fixtures/test";
import { seedTestWorkspace } from "./helpers/seed";

test.describe("Journey 4: Analysis Pipeline & Progress Tracker", () => {
  test("happy path: in-progress analysis displays stepper and stage messages", async ({
    page,
  }) => {
    const seeded = await seedTestWorkspace({
      orgId: "org_3KBLhxwRso6l6AxUEPvfPzkzNWx",
      repoOwner: "test-progress-owner",
      repoName: "test-progress-repo",
      status: "parsing",
      stage: "fetch",
      stageMessage: "Fetching repository archive...",
    });

    try {
      await page.goto(`/analysis/${seeded.analysisId}`);

      await expect(page.getByTestId("analysis-progress-card")).toBeVisible();
      await expect(page.getByTestId("analysis-status")).toContainText("parsing");
      await expect(page.getByTestId("analysis-stepper")).toBeVisible();
      await expect(page.getByTestId("analysis-progress-message")).toContainText(
        "Fetching repository archive..."
      );
    } finally {
      await seeded.cleanup();
    }
  });

  test("failure state: failed analysis displays stage error and working retry button", async ({
    page,
  }) => {
    const seeded = await seedTestWorkspace({
      orgId: "org_3KBLhxwRso6l6AxUEPvfPzkzNWx",
      repoOwner: "test-failed-owner",
      repoName: "test-failed-repo",
      status: "failed",
      stage: "failed",
      failedStage: "parse",
      error: "AST parsing failed: unexpected syntax token",
    });

    try {
      await page.goto(`/analysis/${seeded.analysisId}`);

      const failedView = page.getByTestId("analysis-failed-view");
      await expect(failedView).toBeVisible();
      await expect(failedView).toContainText("failed in stage: parse");
      await expect(failedView).toContainText("AST parsing failed: unexpected syntax token");

      // Retry button is available
      const retryBtn = page.getByTestId("analysis-rerun-btn");
      await expect(retryBtn).toBeVisible();
      await expect(retryBtn).toBeEnabled();

      // Clicking rerun analysis resets state
      await retryBtn.click();
      await expect(page.getByTestId("analysis-status")).toContainText("parsing");
    } finally {
      await seeded.cleanup();
    }
  });

  test("boundary state: non-existent analysis ID renders 404 page", async ({ page }) => {
    const response = await page.goto("/analysis/00000000-0000-0000-0000-000000000000");

    // Next.js returns 404 for notFound()
    expect(response?.status()).toBe(404);
    await expect(page.getByText("404 Not Found")).toBeVisible();
  });
});
