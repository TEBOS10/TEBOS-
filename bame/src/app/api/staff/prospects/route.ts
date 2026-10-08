import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const dueOnly = req.nextUrl.searchParams.get("due") === "1";
  const table = dueOnly ? "v_call_sheet" : "prospects";
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, prospects: data });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { full_name } = body;
  if (!full_name) return NextResponse.json({ ok: false, error: "full_name is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("prospects")
    .insert({
      full_name,
      org_name: body.org_name || null,
      contact_type: body.contact_type || "other",
      channel: body.channel || "other",
      handle_or_contact: body.handle_or_contact || null,
      source: body.source || "outreach",
      referred_by: body.referred_by || null,
      added_by: user.id,
      assigned_department: body.assigned_department || "sales",
      priority: body.priority || "medium",
      notes: body.notes || null,
      next_follow_up_at: body.next_follow_up_at || null,
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
    "full_name",
    "org_name",
    "contact_type",
    "channel",
    "handle_or_contact",
    "status",
    "priority",
    "notes",
    "next_follow_up_at",
    "assigned_department",
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key];
  }

  // Reassigning department is admin-only, same convention as opportunities —
  // RLS gates which rows can be updated, not which columns.
  if ("assigned_department" in update) {
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (!profile?.is_admin) {
      return NextResponse.json({ ok: false, error: "Only admins can route a prospect to a department" }, { status: 403 });
    }
  }

  const { error } = await supabase.from("prospects").update(update).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
