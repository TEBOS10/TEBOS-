import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import { DEPARTMENTS } from "@/lib/staff";

export async function POST(req: NextRequest) {
  const { table, id, department } = await req.json();
  if ((table !== "leads" && table !== "diagnostics") || !id || !DEPARTMENTS.includes(department)) {
    return NextResponse.json({ ok: false, error: "table, id and a valid department are required" }, { status: 400 });
  }

  const supabase = await getSupabaseSessionClient();
  // RLS scopes this update to admins (any row) or the case's current department
  // (reassignment within their own queue) — see the leads/diagnostics UPDATE policies.
  const { error } = await supabase.from(table).update({ assigned_department: department }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
