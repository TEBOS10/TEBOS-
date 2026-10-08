import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

// Logs a contact attempt or referral against a prospect. Any authenticated
// staff member can call this — that's the point: outreach and referrals
// "made by anyone" feed straight into the call sheet, not just Sales' own
// entries. If prospect_id is omitted, a new prospect is created first (the
// referral/first-contact case), then the outreach entry is logged against it.
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  let prospectId: string | undefined = body.prospect_id;

  if (!prospectId) {
    if (!body.full_name) {
      return NextResponse.json(
        { ok: false, error: "prospect_id or full_name is required" },
        { status: 400 },
      );
    }
    const { data: newProspect, error: prospectError } = await supabase
      .from("prospects")
      .insert({
        full_name: body.full_name,
        org_name: body.org_name || null,
        contact_type: body.contact_type || "other",
        channel: body.channel || "other",
        handle_or_contact: body.handle_or_contact || null,
        source: body.source || (body.referred_by ? "referral" : "outreach"),
        referred_by: body.referred_by || null,
        added_by: user.id,
        assigned_department: body.assigned_department || "sales",
        priority: body.priority || "medium",
      })
      .select("id")
      .single();
    if (prospectError) return NextResponse.json({ ok: false, error: prospectError.message }, { status: 400 });
    prospectId = newProspect.id;
  }

  const { error: logError } = await supabase.from("outreach_log").insert({
    prospect_id: prospectId,
    logged_by: user.id,
    channel: body.log_channel || body.channel || "other",
    outcome: body.outcome || "other",
    summary: body.summary || null,
    follow_up_at: body.follow_up_at || null,
  });
  if (logError) return NextResponse.json({ ok: false, error: logError.message }, { status: 400 });

  return NextResponse.json({ ok: true, prospect_id: prospectId });
}
