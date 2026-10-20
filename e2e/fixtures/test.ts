/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect, Page } from "@playwright/test";

export const test = base;
export { expect };

/**
 * Fixture for tests that must run completely signed out.
 */
export const unauthenticatedTest = base.extend<{ page: Page }>({
  storageState: async ({}, use) => {
    await use({ cookies: [], origins: [] });
  },
});
