import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export type Db = SupabaseClient<Database>;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Null when the app was built without its Supabase settings; the app then says so instead of failing obscurely. */
export const supabase: Db | null = url && key ? createClient<Database>(url, key) : null;
