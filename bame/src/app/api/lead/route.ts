import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

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
  const { data, error } = await supabase
    .from("leads")
    .insert({
      contact_type,
      full_name,
      email,
      phone: body.phone || null,
      sport: body.sport || null,
      career_stage: body.career_stage || null,
      primary_focus: body.primary_focus || null,
      location: body.location || null,
      goal: body.goal || null,
      consent: !!body.consent,
      source: "website",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
