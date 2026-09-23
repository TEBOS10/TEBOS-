import { redirect } from "next/navigation";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import { DEPARTMENTS, DEPARTMENT_LABELS, PACKAGE_CLIENT_FEES, formatZAR, type Department, type StaffProfile } from "@/lib/staff";
import AllocationEditor from "@/components/staff/AllocationEditor";
import LedgerForm from "@/components/staff/LedgerForm";

export const metadata = { title: "Finance — BAME staff" };

// Only departments paid as a fixed monthly amount per active client belong here.
// Sales (10% one-time referral commission), Finance/Admin (% of total company
// revenue) and CEO/BAME (company-wide profit share) are funded a different way —
// see the capital ledger and the compensation notes below instead.
const ALLOCATABLE_DEPARTMENTS = DEPARTMENTS.filter((d) => d === "production" || d === "pr" || d === "tech");

export default async function StaffFinancePage() {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login?next=/staff/finance");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as StaffProfile | null;

  if (!profile || (!profile.is_admin && profile.department !== "finance")) {
    return (
      <main className="px-5 py-10">
        <div className="mx-auto max-w-3xl text-sm text-[var(--bame-muted)]">Only Finance and admin can open this workstation.</div>
      </main>
    );
  }

  const [{ data: players }, { data: allocations }, { data: ledger }] = await Promise.all([
    supabase.from("players").select("id, package_tier, status").eq("status", "active"),
    supabase.from("department_allocations").select("package_tier, department, monthly_amount"),
    supabase.from("capital_ledger").select("id, entry_type, amount, department, description, created_at").order("created_at", { ascending: false }).limit(30),
  ]);

  const allocationMap = new Map(
    (allocations || []).map((a) => [`${a.package_tier}:${a.department}`, a.monthly_amount as number | null]),
  );

  const activePlayers = players || [];
  const tierCounts = { foundation: 0, growth: 0, custom: 0 } as Record<string, number>;
  for (const p of activePlayers) tierCounts[p.package_tier] = (tierCounts[p.package_tier] || 0) + 1;

  const departmentTotals: Record<Department, { total: number; unknown: number }> = {} as never;
  for (const dept of ALLOCATABLE_DEPARTMENTS) {
    let total = 0;
    let unknown = 0;
    for (const p of activePlayers) {
      if (p.package_tier === "custom") continue;
      const amount = allocationMap.get(`${p.package_tier}:${dept}`);
      if (amount === null || amount === undefined) unknown += 1;
      else total += amount;
    }
    departmentTotals[dept] = { total, unknown };
  }

  const totalExpectedRevenue = activePlayers.reduce((sum, p) => {
    const tier = p.package_tier as string;
    if (tier === "foundation" || tier === "growth") {
      return sum + PACKAGE_CLIENT_FEES[tier];
    }
    return sum;
  }, 0);

  const ledgerRows = ledger || [];
  const runningBalance = ledgerRows.reduce((sum, e) => {
    const signed = e.entry_type === "income" ? e.amount : -e.amount;
    return sum + signed;
  }, 0);

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-4xl space-y-10">
        <div>
          <p className="bame-eyebrow">Finance</p>
          <h1 className="mt-2 text-2xl">Workstation</h1>
          <p className="mt-2 text-sm text-[var(--bame-muted)]">
            Allocations and totals recalculate automatically from the active client roster — fill in the real split once
            and it stays current on its own.
          </p>
        </div>

        <section className="rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6">
          <h2 className="text-sm font-semibold">Active roster &amp; expected monthly revenue</h2>
          <div className="mt-3 grid gap-4 text-sm md:grid-cols-4">
            <div>
              <p className="text-xs text-[var(--bame-muted)]">Foundation ({formatZAR(PACKAGE_CLIENT_FEES.foundation)}/mo each)</p>
              <p className="mt-1 text-lg">{tierCounts.foundation || 0}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--bame-muted)]">Growth ({formatZAR(PACKAGE_CLIENT_FEES.growth)}/mo each)</p>
              <p className="mt-1 text-lg">{tierCounts.growth || 0}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--bame-muted)]">Custom (priced separately)</p>
              <p className="mt-1 text-lg">{tierCounts.custom || 0}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--bame-muted)]">Total expected /mo</p>
              <p className="mt-1 text-lg text-[var(--bame-accent)]">{formatZAR(totalExpectedRevenue)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6">
          <h2 className="text-sm font-semibold">Department allocation split</h2>
          <p className="mt-1 text-xs text-[var(--bame-muted)]">
            Tech&apos;s split is already filled in from the real COT deliverables document. Everyone else shows &quot;TBD&quot; until
            the real numbers come in — fill a cell in and it applies immediately.
          </p>
          <div className="mt-4">
            <AllocationEditor
              allocations={(allocations || []).filter(
                (a): a is { package_tier: "foundation" | "growth"; department: Department; monthly_amount: number | null } =>
                  a.package_tier !== "custom",
              )}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--bame-accent)]/50 bg-[var(--bame-panel)] p-6">
          <h2 className="text-sm font-semibold text-[var(--bame-accent)]">Who gets what — computed automatically</h2>
          <div className="mt-4 divide-y divide-[var(--bame-line)]">
            {ALLOCATABLE_DEPARTMENTS.map((dept) => (
              <div key={dept} className="flex items-center justify-between py-3 text-sm">
                <span>{DEPARTMENT_LABELS[dept]}</span>
                <span>
                  {formatZAR(departmentTotals[dept].total)}/mo
                  {departmentTotals[dept].unknown > 0 && (
                    <span className="ml-2 text-xs text-[var(--bame-muted)]">
                      (+{departmentTotals[dept].unknown} client{departmentTotals[dept].unknown > 1 ? "s" : ""} pending split)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Capital ledger</h2>
          <p className="mt-1 text-xs text-[var(--bame-muted)]">
            Running balance: <span className="text-[var(--bame-accent)]">{formatZAR(runningBalance)}</span>
          </p>
          <div className="mt-4">
            <LedgerForm />
          </div>
          <div className="mt-4 divide-y divide-[var(--bame-line)] rounded-2xl border border-[var(--bame-line)]">
            {ledgerRows.length === 0 && <p className="p-4 text-sm text-[var(--bame-muted)]">No entries logged yet.</p>}
            {ledgerRows.map((e) => (
              <div key={e.id} className="flex items-center justify-between p-4 text-sm">
                <div>
                  <p className="capitalize">
                    {e.entry_type} {e.department ? `· ${DEPARTMENT_LABELS[e.department as Department]}` : ""}
                  </p>
                  <p className="text-xs text-[var(--bame-muted)]">{e.description}</p>
                </div>
                <div className="text-right">
                  <p className={e.entry_type === "income" ? "text-[var(--bame-accent)]" : ""}>
                    {e.entry_type === "income" ? "+" : "-"}
                    {formatZAR(e.amount)}
                  </p>
                  <p className="text-xs text-[var(--bame-muted)]">{new Date(e.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
