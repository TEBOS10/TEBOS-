import { redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import ContractPanel from "@/components/staff/ContractPanel";
import { PACKAGE_TIER_LABELS, type StaffProfile } from "@/lib/staff";

export const metadata = { title: "Files — BAME staff" };

interface ContractRow {
  id: string;
  source_case_table: "leads" | "diagnostics";
  source_case_id: string;
  athlete_full_name: string;
  athlete_email: string | null;
  package_tier: "foundation" | "growth" | "custom";
  monthly_fee: number;
  status: "draft" | "sent";
  sent_at: string | null;
  created_at: string;
}

export default async function AdminFilesPage() {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login?next=/staff/admin/files");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as StaffProfile | null;
  if (!profile?.is_admin) redirect("/staff");

  const { data: contracts } = await supabase
    .from("contracts")
    .select("id, source_case_table, source_case_id, athlete_full_name, athlete_email, package_tier, monthly_fee, status, sent_at, created_at")
    .order("created_at", { ascending: false });

  const rows = (contracts || []) as ContractRow[];
  const draftCount = rows.filter((r) => r.status === "draft").length;

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-4xl">
        <p className="bame-eyebrow">Admin</p>
        <h1 className="mt-2 text-2xl">Files</h1>
        <p className="mt-2 text-sm text-[var(--bame-muted)]">
          Every client agreement generated across every department, in one place. {draftCount > 0 && `${draftCount} drafted and not yet sent.`}
        </p>

        <div className="mt-8 space-y-4">
          {rows.length === 0 && (
            <p className="rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6 text-sm text-[var(--bame-muted)]">
              No contracts generated yet. They appear here as soon as a sales agent or admin marks an interview successful on a
              case.
            </p>
          )}
          {rows.map((c) => (
            <div key={c.id} className="rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link href={`/staff/case/${c.source_case_table}/${c.source_case_id}`} className="font-medium hover:underline">
                    {c.athlete_full_name}
                  </Link>
                  <p className="text-xs text-[var(--bame-muted)]">
                    {PACKAGE_TIER_LABELS[c.package_tier]} · R{c.monthly_fee.toLocaleString("en-ZA")}/mo · Generated{" "}
                    {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <ContractPanel contractId={c.id} status={c.status} athleteEmail={c.athlete_email} sentAt={c.sent_at} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
