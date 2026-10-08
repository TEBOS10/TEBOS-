import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import { DEPARTMENT_LABELS, type Department } from "@/lib/staff";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { full_name, email, sport, package_tier, source_case_table, source_case_id } = body;

  if (!full_name || !package_tier) {
    return NextResponse.json({ ok: false, error: "full_name and package_tier are required" }, { status: 400 });
  }

  const supabase = await getSupabaseSessionClient();

  let department: Department | null = null;
  if (source_case_table && source_case_id) {
    const { data: sourceCase } = await supabase
      .from(source_case_table)
      .select("assigned_department")
      .eq("id", source_case_id)
      .maybeSingle();
    department = (sourceCase?.assigned_department as Department | null) || null;
  }

  const { data, error } = await supabase
    .from("players")
    .insert({
      full_name,
      email: email || null,
      sport: sport || null,
      package_tier,
      department,
      source_case_table: source_case_table || null,
      source_case_id: source_case_id || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  // Kick off the handoff: someone needs to book the first call and work the checklist,
  // not just inherit a blank profile.
  if (source_case_table && source_case_id) {
    await supabase.from("notifications").insert({
      department: department || "admin",
      case_table: source_case_table,
      case_id: source_case_id,
      message: department
        ? `${full_name} was onboarded as a player — schedule their kickoff call and work through the ${DEPARTMENT_LABELS[department]} checklist.`
        : `${full_name} was onboarded as a player with no department on the case — assign one and schedule their kickoff call.`,
    });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const allowed = [
    "full_name",
    "email",
    "sport",
    "package_tier",
    "status",
    "photo_url",
    "bio",
    "highlights",
    "achievements",
    "portfolio_public",
    "kickoff_call_scheduled_at",
    "kickoff_call_completed_at",
    "kickoff_call_notes",
  ];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key];
  }

  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.from("players").update(update).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
