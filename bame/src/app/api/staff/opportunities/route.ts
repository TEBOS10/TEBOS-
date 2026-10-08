import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const playerId = req.nextUrl.searchParams.get("player_id");
  let query = supabase
    .from("opportunities")
    .select("*, players(full_name)")
    .order("created_at", { ascending: false });
  if (playerId) query = query.eq("player_id", playerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, opportunities: data });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { player_id, title } = body;
  if (!player_id || !title) {
    return NextResponse.json({ ok: false, error: "player_id and title are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      player_id,
      title,
      category: body.category || "other",
      source: body.source || null,
      value_estimate: body.value_estimate || null,
      contact_name: body.contact_name || null,
      contact_email: body.contact_email || null,
      contact_org: body.contact_org || null,
      notes: body.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const allowed = [
    "title",
    "category",
    "status",
    "outcome",
    "source",
    "value_estimate",
    "contact_name",
    "contact_email",
    "contact_org",
    "notes",
    "assigned_department",
  ];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key];
  }

  // RLS scopes this update to admins (any row) or the opportunity's current
  // department (working their own queue) — see the opportunities UPDATE policy.
  const { error } = await supabase.from("opportunities").update(update).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
