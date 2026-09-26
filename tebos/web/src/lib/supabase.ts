import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { createDemoClient } from "../demo/client";
import { isDemo } from "../demo/mode";

export type Db = SupabaseClient<Database>;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Null when the app was built without its Supabase settings; the app then says so instead of failing obscurely. */
// In demo mode (/demo) every request is answered in the browser from fictional data.
export const supabase: Db | null = isDemo ? createDemoClient() : url && key ? createClient<Database>(url, key) : null;
