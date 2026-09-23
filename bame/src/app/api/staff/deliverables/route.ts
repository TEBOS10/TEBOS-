import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest) {
  const { case_table, case_id, deliverable_id, done } = await req.json();
  if ((case_table !== "leads" && case_table !== "diagnostics") || !case_id || !deliverable_id) {
    return NextResponse.json({ ok: false, error: "case_table, case_id and deliverable_id are required" }, { status: 400 });
  }

  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("case_deliverable_status").upsert(
    {
      case_table,
      case_id,
      deliverable_id,
      done: !!done,
      done_by: done ? user.id : null,
      done_at: done ? new Date().toISOString() : null,
    },
    { onConflict: "case_table,case_id,deliverable_id" },
  );

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
