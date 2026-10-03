import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { triageLead } from "@/lib/lead-triage";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const contact_type = body.contact_type === "event" ? "event" : "athlete";
  const full_name = String(body.full_name || "").trim();
  const email = String(body.email || "").trim();

  if (!full_name || !email || !body.consent) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("check_submission_throttle", {
    p_table: "leads",
    p_email: email,
  });
  if (allowed === false) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions from this email recently. Please try again later." },
      { status: 429 },
    );
  }

  const details = {
    sport: body.sport || null,
    career_stage: body.career_stage || null,
    primary_focus: body.primary_focus || null,
    location: body.location || null,
    goal: body.goal || null,
  };

  // Advisory only, and null on any failure, so the lead is saved either way.
  const triage = await triageLead({ contact_type, ...details });

  // Generate the id ourselves and insert without asking Postgres to return
  // the row: the anon RLS policy only grants INSERT, not SELECT, and an
  // insert that requests the row back (`.select()`) needs SELECT too.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("leads").insert({
    id,
    contact_type,
    full_name,
    email,
    phone: body.phone || null,
    ...details,
    consent: !!body.consent,
    source: "website",
    ...(triage && {
      ai_score: triage.score,
      ai_priority: triage.priority,
      ai_summary: triage.summary,
      ai_suggested_department: triage.suggested_department,
      ai_next_step: triage.next_step,
      ai_triaged_at: new Date().toISOString(),
    }),
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}
