import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Creates a browser-side Supabase client authenticated with the Clerk session token.
 * This client is used for Realtime channel subscriptions and browser queries.
 */
export function createBrowserSupabaseClient(getToken?: () => Promise<string | null>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createClient<Database>(supabaseUrl, supabaseKey, {
    accessToken: getToken ? async () => (await getToken()) ?? null : undefined,
  });
}
