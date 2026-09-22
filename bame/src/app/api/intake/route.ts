import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { ALL_INTAKE_FIELDS } from "@/lib/intake-schema";

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.consent_service || !body.consent_contact) {
    return NextResponse.json(
      { ok: false, error: "Required consent was not given." },
      { status: 400 },
    );
  }
  if (!body.primary_goal || !body.key_problem) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields." },
      { status: 400 },
    );
  }

  // Keep only known fields in the stored payload — drop anything unexpected.
  const knownNames = new Set(ALL_INTAKE_FIELDS.map((f) => f.name));
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (knownNames.has(k)) payload[k] = v;
  }
  payload.submitted_at = new Date().toISOString();

  // Generate the id ourselves and insert without asking Postgres to return
  // the row: the anon RLS policy only grants INSERT, not SELECT, and an
  // insert that requests the row back (`.select()`) needs SELECT too.
  const id = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("diagnostics").insert({
    id,
    lead_id: body.lead_id || null,
    case_reference: body.case_reference || null,
    contact_type: body.contact_type === "event" ? "event" : "athlete",
    package_interest: body.package_interest || body.event_package_interest || null,
    payload,
    athlete_full_name: body.athlete_full_name || body.full_name || null,
    athlete_email: body.email || null,
    primary_sport: body.primary_sport || null,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Optional: forward to the BAME Google Apps Script webhook, which renders
  // a PDF and emails it to administration — same pipeline as the original
  // standalone diagnostic (see Code.gs / SETUP.md). No-op if not configured.
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  if (appsScriptUrl) {
    try {
      await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams(
          Object.entries(payload).map(([k, v]) => [k, typeof v === "boolean" ? (v ? "Yes" : "No") : String(v ?? "")]),
        ),
      });
    } catch {
      // Storage in Supabase already succeeded; email delivery is best-effort.
    }
  }

  return NextResponse.json({ ok: true, id });
}
