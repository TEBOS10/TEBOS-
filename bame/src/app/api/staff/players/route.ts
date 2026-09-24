import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { full_name, email, sport, package_tier, source_case_table, source_case_id } = body;

  if (!full_name || !package_tier) {
    return NextResponse.json({ ok: false, error: "full_name and package_tier are required" }, { status: 400 });
  }

  const supabase = await getSupabaseSessionClient();
  const { data, error } = await supabase
    .from("players")
    .insert({
      full_name,
      email: email || null,
      sport: sport || null,
      package_tier,
      source_case_table: source_case_table || null,
      source_case_id: source_case_id || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
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
