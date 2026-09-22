import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/staff-admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "accept_invite", ...body }),
  });
  const json = await res.json();
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: json.error || "could not accept invite" }, { status: res.status });
  }
  return NextResponse.json({ ok: true, email: json.email });
}
