import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseSessionClient();

  const { data: contract, error } = await supabase.from("contracts").select("pdf_storage_path").eq("id", id).maybeSingle();
  if (error || !contract?.pdf_storage_path) {
    return NextResponse.json({ ok: false, error: "Contract not found." }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("contracts")
    .createSignedUrl(contract.pdf_storage_path, 300);

  if (signError || !signed) {
    return NextResponse.json({ ok: false, error: signError?.message || "Could not create a download link." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
