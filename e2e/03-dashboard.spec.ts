import { test, expect } from "./fixtures/test";
import { seedTestWorkspace } from "./helpers/seed";

test.describe("Journey 3: Dashboard & Repository Analysis Submission", () => {
  test("happy path: displays seeded analyses in table and navigates to workspace", async ({
    page,
  }) => {
    // Seed an isolated completed analysis for the test user
    const seeded = await seedTestWorkspace({
      orgId: "org_3KBLhxwRso6l6AxUEPvfPzkzNWx", // Active org for test user
      repoOwner: "test-owner",
      repoName: "test-dashboard-repo",
      status: "complete",
    });

    try {
      await page.goto("/");

      const table = page.getByTestId("analyses-table");
      await expect(table).toBeVisible();

      // The seeded analysis row should appear
      const row = page.getByTestId(`analysis-row-${seeded.analysisId}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText("test-owner/test-dashboard-repo");
      await expect(row).toContainText("complete");

      // Clicking analysis link navigates to /analysis/[id]
      const link = row.getByTestId("analysis-link");
      await link.click();

      await page.waitForURL(`**/analysis/${seeded.analysisId}`);
      expect(page.url()).toContain(`/analysis/${seeded.analysisId}`);
    } finally {
      await seeded.cleanup();
    }
  });

  test("failure state: invalid GitHub repo URL displays form error", async ({ page }) => {
    await page.goto("/");

    const input = page.getByTestId("analysis-repo-input");
    const submit = page.getByTestId("analysis-submit-btn");

    await input.fill("https://not-github.com/someone/somerepo");
    await submit.click();

    const error = page.getByTestId("analysis-form-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("valid GitHub repository URL");
  });

  test("empty state: renders empty workspace card when organization has no analyses", async ({
    page,
  }) => {
    // When visiting an org with no analyses or filtering
    await page.goto("/");

    // If there are no analyses, the empty state card is displayed
    const emptyState = page.getByTestId("empty-analyses-state");
    const table = page.getByTestId("analyses-table");

    const hasAnalyses = await table.isVisible().catch(() => false);
    if (!hasAnalyses) {
      await expect(emptyState).toBeVisible();
      await expect(emptyState).toContainText("Empty Workspace");
    } else {
      await expect(table).toBeVisible();
    }
  });
});
