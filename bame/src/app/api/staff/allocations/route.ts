import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest) {
  const { package_tier, department, monthly_amount, notes } = await req.json();
  if (!package_tier || !department) {
    return NextResponse.json({ ok: false, error: "package_tier and department are required" }, { status: 400 });
  }

  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.from("department_allocations").upsert(
    {
      package_tier,
      department,
      monthly_amount: monthly_amount === "" || monthly_amount === null ? null : Number(monthly_amount),
      notes: notes || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "package_tier,department" },
  );

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
