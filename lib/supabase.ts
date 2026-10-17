import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import type { Database } from "./database.types";

// Server-only. The one place a Supabase client is built for request code.
//
// Uses Clerk's native third-party integration: the plain Clerk session token is
// sent as the access token, and Supabase verifies it against Clerk's keys. The
// token carries the active organization (`o.id`), which is what every RLS
// policy reads. No JWT template, no shared secret.
export async function createClerkSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase environment variables. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set."
    );
  }

  const { getToken } = await auth();

  return createClient<Database>(supabaseUrl, supabaseKey, {
    accessToken: async () => (await getToken()) ?? null,
  });
}

/**
 * Creates a server-only admin client using SUPABASE_SECRET_KEY, bypassing RLS.
 * Used for background pipeline tasks; throws when its URL or secret key is missing.
 */
export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "Missing Supabase admin environment variables. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set."
    );
  }

  return createClient<Database>(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Ensures an organization row exists in public.organizations so child tables
 * with foreign keys to organizations (projects, analyses, files, etc.) can insert cleanly.
 */
export async function ensureOrganization(orgId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("organizations")
    .upsert({ id: orgId }, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to ensure organization: ${error.message}`);
  }
}

