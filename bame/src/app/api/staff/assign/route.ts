import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import { DEPARTMENTS } from "@/lib/staff";

export async function POST(req: NextRequest) {
  const { table, id, department } = await req.json();
  const validDepartment = department === null || DEPARTMENTS.includes(department);
  if ((table !== "leads" && table !== "diagnostics") || !id || !validDepartment) {
    return NextResponse.json(
      { ok: false, error: "table, id and a valid department (or null to unassign) are required" },
      { status: 400 },
    );
  }

  const supabase = await getSupabaseSessionClient();
  // RLS scopes this update to admins (any department), the case's current
  // department reassigning within its own queue, or anyone on the case's
  // department sending it back to null (unassigned) — see the leads/diagnostics
  // UPDATE policies.
  const { error } = await supabase.from(table).update({ assigned_department: department }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
