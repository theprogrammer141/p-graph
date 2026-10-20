import { test, expect } from "./fixtures/test";
import { seedTestWorkspace } from "./helpers/seed";

test.describe("Journey 5: Workspace Graph & Detail Pane", () => {
  test("happy path: renders graph nodes, navigates folders and files, and updates detail pane", async ({
    page,
  }) => {
    const seeded = await seedTestWorkspace({
      orgId: "org_3KBLhxwRso6l6AxUEPvfPzkzNWx",
      repoOwner: "test-workspace-owner",
      repoName: "test-workspace-repo",
      status: "complete",
    });

    try {
      await page.goto(`/analysis/${seeded.analysisId}`);

      // 1. Canvas and sidebars are visible
      await expect(page.getByTestId("graph-canvas-container")).toBeVisible();
      await expect(page.getByTestId("categories-sidebar")).toBeVisible();
      await expect(page.getByTestId("detail-pane")).toBeVisible();

      // 2. Default state: Repository Summary in detail pane
      await expect(page.getByTestId("repo-summary-view")).toBeVisible();
      await expect(page.getByTestId("repo-summary-view")).toContainText("test-workspace-repo");

      // 3. Folded folder node exists on canvas
      const folderNode = page.getByTestId("folded-node-src/components");
      await expect(folderNode).toBeVisible();

      // 4. Click folder to open it into panel node
      await folderNode.click();
      const panelNode = page.getByTestId("panel-node-src/components");
      await expect(panelNode).toBeVisible();

      // 5. Click file inside opened folder
      const fileRow = page.getByTestId("file-row-src/components/button.tsx");
      await expect(fileRow).toBeVisible();
      await fileRow.click();

      // 6. Detail pane switches to FileDetailView
      await expect(page.getByTestId("file-detail-view")).toBeVisible();
      const filePath = page.getByTestId("file-detail-path");
      await expect(filePath).toContainText("src/components/button.tsx");

      // 7. Deselect button returns to repository summary
      const deselectBtn = page.getByTestId("detail-deselect-btn");
      await expect(deselectBtn).toBeVisible();
      await deselectBtn.click();
      await expect(page.getByTestId("repo-summary-view")).toBeVisible();
    } finally {
      await seeded.cleanup();
    }
  });

  test("edge state: partial coverage renders warning banner with collapsible details", async ({
    page,
  }) => {
    const seeded = await seedTestWorkspace({
      orgId: "org_3KBLhxwRso6l6AxUEPvfPzkzNWx",
      repoOwner: "test-partial-owner",
      repoName: "test-partial-repo",
      status: "complete",
      withSkippedFiles: true,
    });

    try {
      await page.goto(`/analysis/${seeded.analysisId}`);

      // Coverage banner is visible
      const banner = page.getByTestId("coverage-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText("Graph is partial");
      await expect(banner).toContainText("skipped file");

      // Toggle collapse
      const toggleBtn = page.getByTestId("coverage-banner-toggle");
      await toggleBtn.click();
      await expect(banner).toContainText("Partial graph");

      // Expand back
      await page.getByTestId("coverage-banner-toggle").click();
      await expect(banner).toContainText("Some edges could not be statically resolved");
    } finally {
      await seeded.cleanup();
    }
  });

  test("action state: reanalyse button restarts the pipeline and redirects to progress view", async ({
    page,
  }) => {
    const seeded = await seedTestWorkspace({
      orgId: "org_3KBLhxwRso6l6AxUEPvfPzkzNWx",
      repoOwner: "test-restart-owner",
      repoName: "test-restart-repo",
      status: "complete",
    });

    try {
      await page.goto(`/analysis/${seeded.analysisId}`);

      const reanalyseBtn = page.getByTestId("reanalyse-btn");
      await expect(reanalyseBtn).toBeVisible();
      await reanalyseBtn.click();

      // Switches back to progress card
      await expect(page.getByTestId("analysis-progress-card")).toBeVisible();
      await expect(page.getByTestId("analysis-status")).toContainText("parsing");
    } finally {
      await seeded.cleanup();
    }
  });
});
