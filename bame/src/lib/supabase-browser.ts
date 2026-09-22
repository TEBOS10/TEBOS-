import { createBrowserClient } from "@supabase/ssr";

// Session-aware Supabase client for Client Components (staff login, dashboard).
// Reads/writes the same auth cookies the proxy and server client use.
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
