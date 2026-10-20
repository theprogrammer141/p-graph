import { test as setup } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import fs from "node:fs";
import path from "node:path";
import "@/lib/load-env";
import { ensureOrganization } from "@/lib/supabase";

const authFile = path.resolve(process.cwd(), "playwright/.auth/user.json");



setup("authenticate test user", async ({ page, baseURL }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.warn("[auth.setup] CLERK_SECRET_KEY not found. Writing fallback auth state.");
    fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  try {
    await clerkSetup();
    await setupClerkTestingToken({ page });

    const clerkBackend = createClerkClient({ secretKey });
    const users = await clerkBackend.users.getUserList({ limit: 1 });

    if (!users.data || users.data.length === 0) {
      console.warn("[auth.setup] No test users found in Clerk. Writing fallback auth state.");
      fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
      return;
    }

    const testUser = users.data[0];
    const memberships = await clerkBackend.users.getOrganizationMembershipList({
      userId: testUser.id,
    });
    const targetOrgId = memberships.data[0]?.organization.id;

    if (targetOrgId) {
      await ensureOrganization(targetOrgId);
    }

    const signInToken = await clerkBackend.signInTokens.createSignInToken({
      userId: testUser.id,
      expiresInSeconds: 300,
    });

    const targetUrl = baseURL || "http://localhost:3000";
    await page.goto(targetUrl);

    await page.waitForFunction(
      () =>
        typeof window !== "undefined" &&
        window.Clerk !== undefined &&
        window.Clerk.loaded === true
    );

    await page.evaluate(async (ticket) => {
      if (!window.Clerk?.client) return;
      const res = await window.Clerk.client.signIn.create({
        strategy: "ticket",
        ticket,
      });
      if (res.createdSessionId) {
        await window.Clerk.setActive({ session: res.createdSessionId });
      }
    }, signInToken.token);

    if (targetOrgId) {
      await page.evaluate(async (orgId) => {
        if (!window.Clerk) return;
        await window.Clerk.setActive({ organization: orgId });
      }, targetOrgId);
    }

    // Allow session cookies to sync
    await page.waitForTimeout(1000);

    // Save signed-in session state
    await page.context().storageState({ path: authFile });
    console.log(`[auth.setup] Successfully saved auth state for user ${testUser.id} to ${authFile}`);
  } catch (err) {
    console.warn("[auth.setup] Error during programmatic sign-in:", err);
    // Write empty state as fallback so unauthenticated tests can proceed
    fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
  }
});
