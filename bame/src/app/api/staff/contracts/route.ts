import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import { buildContractBlocks, contractDocTitle, CONTRACT_FOOTER, type ContractInput } from "@/lib/contract-template";
import { renderPdf } from "@/lib/pdf/render";

const PACKAGE_TIERS = ["foundation", "growth", "custom"] as const;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    source_case_table,
    source_case_id,
    athlete_full_name,
    athlete_id_passport,
    athlete_dob,
    athlete_address,
    athlete_email,
    athlete_phone,
    current_club,
    package_tier,
    monthly_fee,
    initial_term_months,
    commencement_date,
  } = body;

  if (
    (source_case_table !== "leads" && source_case_table !== "diagnostics") ||
    !source_case_id ||
    !athlete_full_name ||
    !PACKAGE_TIERS.includes(package_tier) ||
    !monthly_fee ||
    !commencement_date
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid contract details." }, { status: 400 });
  }

  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data: contract, error: insertError } = await supabase
    .from("contracts")
    .insert({
      source_case_table,
      source_case_id,
      athlete_full_name,
      athlete_id_passport: athlete_id_passport || null,
      athlete_dob: athlete_dob || null,
      athlete_address: athlete_address || null,
      athlete_email: athlete_email || null,
      athlete_phone: athlete_phone || null,
      current_club: current_club || null,
      package_tier,
      monthly_fee,
      initial_term_months: initial_term_months || 3,
      commencement_date,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !contract) {
    return NextResponse.json({ ok: false, error: insertError?.message || "Could not create contract." }, { status: 400 });
  }

  const input: ContractInput = {
    athleteFullName: athlete_full_name,
    athleteIdPassport: athlete_id_passport || "",
    athleteDob: athlete_dob ? new Date(athlete_dob).toLocaleDateString("en-ZA") : "",
    athleteAddress: athlete_address || "",
    athleteEmail: athlete_email || "",
    athletePhone: athlete_phone || "",
    currentClub: current_club || "",
    packageTier: package_tier,
    monthlyFee: Number(monthly_fee),
    initialTermMonths: Number(initial_term_months) || 3,
    commencementDate: new Date(commencement_date).toLocaleDateString("en-ZA"),
  };

  const blocks = buildContractBlocks(input);
  const pdfBytes = await renderPdf(blocks, { docTitle: contractDocTitle(athlete_full_name), footerRight: CONTRACT_FOOTER });

  const storagePath = `${source_case_table}/${source_case_id}/${contract.id}.pdf`;
  const { error: uploadError } = await supabase.storage.from("contracts").upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (uploadError) {
    return NextResponse.json({ ok: false, error: `Contract was recorded but the PDF couldn't be saved: ${uploadError.message}` }, { status: 500 });
  }

  const { error: updateError } = await supabase.from("contracts").update({ pdf_storage_path: storagePath }).eq("id", contract.id);
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: contract.id });
}
