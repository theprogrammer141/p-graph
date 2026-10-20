import { unauthenticatedTest as test, expect } from "./fixtures/test";

test.describe("Journey 1: Public Landing & Theme (Signed Out)", () => {
  test("happy path: renders marketing landing page, sections, and toggles theme", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Header elements
    await expect(page.locator("header").getByText("-graph")).toBeVisible();
    await expect(page.getByText("v0.1")).toBeVisible();
    await expect(page.getByTestId("header-sign-in-btn")).toBeVisible();
    await expect(page.getByTestId("header-sign-up-btn")).toBeVisible();

    // 2. Hero content
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "See the shape of your codebase"
    );
    await expect(page.getByTestId("hero-repo-input")).toBeVisible();
    await expect(page.getByTestId("hero-submit-btn")).toBeVisible();

    // 3. Theme toggle
    const html = page.locator("html");
    await page.getByTestId("theme-dark-btn").click();
    await expect(html).toHaveClass(/dark/);

    await page.getByTestId("theme-light-btn").click();
    await expect(html).not.toHaveClass(/dark/);

    // 4. Marketing sections exist
    await expect(page.getByRole("heading", { name: /Folders as boxes/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /really parsing the code/i })
    ).toBeVisible();
  });

  test("failure state: invalid repository URL displays validation error", async ({ page }) => {
    await page.goto("/");

    const input = page.getByTestId("hero-repo-input");
    const submit = page.getByTestId("hero-submit-btn");

    await input.fill("not-a-valid-github-url");
    await submit.click();

    const errorBanner = page.getByTestId("hero-form-error");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText("valid GitHub repository URL");
  });

  test("boundary state: submitting valid URL while signed out redirects to sign-in with return URL", async ({
    page,
  }) => {
    await page.goto("/");

    const input = page.getByTestId("hero-repo-input");
    const submit = page.getByTestId("hero-submit-btn");

    await input.fill("https://github.com/facebook/react");
    await submit.click();

    // Should redirect to /sign-in carrying redirect_url
    await page.waitForURL((url) => url.pathname.includes("sign-in"));
    expect(page.url()).toContain("redirect_url");
    expect(decodeURIComponent(decodeURIComponent(page.url()))).toContain(
      "https://github.com/facebook/react"
    );
  });
});
