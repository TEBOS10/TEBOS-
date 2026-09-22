import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

async function getAccessToken() {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export async function GET() {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/staff-admin?action=list`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: json.error || "fetch failed" }, { status: res.status });
  }
  return NextResponse.json({ ok: true, staff: json.staff, pending_invites: json.pending_invites });
}

export async function POST(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = body.action === "revoke_invite" ? "revoke_invite" : "invite";

  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/staff-admin`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json();
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: json.error || "request failed" }, { status: res.status });
  }
  return NextResponse.json({ ok: true, token: json.token });
}
