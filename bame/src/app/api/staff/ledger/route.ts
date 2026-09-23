import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { entry_type, amount, department, player_id, description } = await req.json();
  if (!entry_type || !amount || !description) {
    return NextResponse.json({ ok: false, error: "entry_type, amount and description are required" }, { status: 400 });
  }

  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("capital_ledger").insert({
    entry_type,
    amount: Number(amount),
    department: department || null,
    player_id: player_id || null,
    description,
    created_by: user.id,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
