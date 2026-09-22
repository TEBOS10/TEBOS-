import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const table = req.nextUrl.searchParams.get("table");
  if (table !== "leads" && table !== "diagnostics") {
    return NextResponse.json({ ok: false, error: "unknown table" }, { status: 400 });
  }

  const res = await fetch(
    `${process.env.SUPABASE_URL}/functions/v1/admin-data?table=${table}`,
    { headers: { "x-admin-token": process.env.SUPABASE_ADMIN_TOKEN || "" }, cache: "no-store" },
  );
  const json = await res.json();
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: json.error || "fetch failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: json.data });
}
