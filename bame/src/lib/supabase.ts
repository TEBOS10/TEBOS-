import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

// Server-side only. Inserts rely on the anon-insert RLS policy (see
// supabase/migrations); this client never has read/update/delete access —
// the /admin dashboard reads through the admin-data Edge Function instead,
// which is the only place the service role key is used.
export function getSupabaseServerClient() {
  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}
