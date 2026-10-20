import { test, expect } from "./fixtures/test";
import { seedTestWorkspace } from "./helpers/seed";

test.describe("Journey 6: AI Explanations & Ask Panel (Agent)", () => {
  test("happy path: switches to explanation tab and chats with ask agent", async ({
    page,
  }) => {
    const seeded = await seedTestWorkspace({
      orgId: "org_3KBLhxwRso6l6AxUEPvfPzkzNWx",
      repoOwner: "test-ai-owner",
      repoName: "test-ai-repo",
      status: "complete",
    });

    try {
      await page.goto(`/analysis/${seeded.analysisId}`);

      // 1. Switch to Explanation tab
      const explanationTabBtn = page.getByTestId("detail-tab-explanation");
      await explanationTabBtn.click();
      await expect(page.getByTestId("explanation-tab-view")).toBeVisible();

      // 2. Switch to Ask panel
      const askTabBtn = page.getByTestId("detail-tab-ask");
      await askTabBtn.click();
      await expect(page.getByTestId("ask-panel-chat")).toBeVisible();

      // 3. Suggested questions are visible
      const suggestions = page.getByTestId("ask-suggestion-btn");
      await expect(suggestions.first()).toBeVisible();

      // 4. Mock the streaming agent endpoint to avoid external AI latency and costs
      await page.route("**/api/agent/chat", async (route) => {
        const text = "Authentication is managed via middleware in `src/index.ts`.";
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: `event: text_chunk\ndata: ${JSON.stringify({
            text,
          })}\n\nevent: done\ndata: ${JSON.stringify({
            fullText: text,
          })}\n\n`,
        });
      });

      // 5. Send a question
      const input = page.getByTestId("ask-input");
      const submitBtn = page.getByTestId("ask-submit-btn");

      await input.fill("Where is authentication handled?");
      await submitBtn.click();

      // 6. Verify user message and streamed assistant response
      await expect(page.getByTestId("ask-user-message")).toContainText(
        "Where is authentication handled?"
      );
      const assistantMessage = page.getByTestId("ask-assistant-message");
      await expect(assistantMessage).toBeVisible();
      await expect(assistantMessage).toContainText("Authentication is managed via middleware");
    } finally {
      await seeded.cleanup();
    }
  });

  test("failure state: AI endpoint network error displays error notification", async ({
    page,
  }) => {
    const seeded = await seedTestWorkspace({
      orgId: "org_3KBLhxwRso6l6AxUEPvfPzkzNWx",
      repoOwner: "test-ai-error-owner",
      repoName: "test-ai-error-repo",
      status: "complete",
    });

    try {
      await page.goto(`/analysis/${seeded.analysisId}`);

      // Switch to Ask tab
      await page.getByTestId("detail-tab-ask").click();

      // Mock AI endpoint failure (e.g. rate limit or provider error)
      await page.route("**/api/agent/chat", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "AI provider rate limit exceeded. Please wait a moment." }),
        });
      });

      const input = page.getByTestId("ask-input");
      const submitBtn = page.getByTestId("ask-submit-btn");

      await input.fill("Explain architecture");
      await submitBtn.click();

      // Formatted error message is displayed
      const errorMsg = page.getByTestId("ask-error-message");
      await expect(errorMsg).toBeVisible();
      await expect(errorMsg).toContainText("limit exceeded");
    } finally {
      await seeded.cleanup();
    }
  });

  test("validation state: empty prompt prevents message submission", async ({ page }) => {
    const seeded = await seedTestWorkspace({
      orgId: "org_3KBLhxwRso6l6AxUEPvfPzkzNWx",
      repoOwner: "test-ai-valid-owner",
      repoName: "test-ai-valid-repo",
      status: "complete",
    });

    try {
      await page.goto(`/analysis/${seeded.analysisId}`);
      await page.getByTestId("detail-tab-ask").click();

      const input = page.getByTestId("ask-input");
      const submitBtn = page.getByTestId("ask-submit-btn");

      await input.fill("   ");
      await expect(submitBtn).toBeDisabled();
    } finally {
      await seeded.cleanup();
    }
  });
});
