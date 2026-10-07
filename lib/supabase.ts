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

// Server-only admin client using SUPABASE_SECRET_KEY (bypasses RLS).
// Used for offline verification scripts or background pipeline tasks.
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

