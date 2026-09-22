import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/admin-auth";

export async function PATCH(req: NextRequest) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();

  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/admin-data`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-admin-token": process.env.SUPABASE_ADMIN_TOKEN || "",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: json.error || "update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: json.data });
}
