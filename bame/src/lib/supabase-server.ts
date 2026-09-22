import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Session-aware Supabase client for Server Components / Route Handlers.
// Uses the signed-in staff member's own cookies, so every query is subject
// to the real RLS policies (their department, or admin) — no service role.
export async function getSupabaseSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render; the proxy already refreshes the session.
        }
      },
    },
  });
}
