import { NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-contract`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ contract_id: id }),
  });
  const json = await res.json();
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: json.error || "Could not send the contract." }, { status: res.status });
  }
  return NextResponse.json(json);
}
