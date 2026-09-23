import { notFound, redirect } from "next/navigation";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import { INTAKE_SECTIONS, type IntakeField } from "@/lib/intake-schema";
import { DEPARTMENT_HIGHLIGHT_SECTIONS, DEPARTMENT_LABELS, type StaffProfile } from "@/lib/staff";
import DeliverableChecklist, { type DeliverableItem } from "@/components/staff/DeliverableChecklist";
import OnboardPlayerButton from "@/components/staff/OnboardPlayerButton";

function fieldValue(payload: Record<string, unknown>, field: IntakeField): string | null {
  const raw = payload[field.name];
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.type === "checkbox") return raw ? "Yes" : "No";
  if (field.type === "chips" || field.type === "cards") {
    return typeof raw === "string" ? raw.split("; ").filter(Boolean).join(", ") : String(raw);
  }
  return String(raw);
}

function packageTierFromInterest(interest: unknown): "foundation" | "growth" | "custom" | null {
  if (typeof interest !== "string") return null;
  const v = interest.toLowerCase();
  if (v.includes("foundation")) return "foundation";
  if (v.includes("growth")) return "growth";
  if (v.includes("custom")) return "custom";
  return null;
}

export default async function StaffCasePage({
  params,
}: {
  params: Promise<{ table: string; id: string }>;
}) {
  const { table, id } = await params;
  if (table !== "leads" && table !== "diagnostics") notFound();

  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/staff/login?next=/staff/case/${table}/${id}`);

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as StaffProfile | null;
  if (!profile) redirect("/staff");

  const { data: row } = await supabase.from(table).select("*").eq("id", id).maybeSingle();

  if (!row) {
    return (
      <main className="px-5 py-16">
        <div className="mx-auto max-w-3xl text-sm text-[var(--bame-muted)]">
          This case doesn&apos;t exist, or hasn&apos;t been routed to your department yet.
        </div>
      </main>
    );
  }

  const highlightSections = new Set(DEPARTMENT_HIGHLIGHT_SECTIONS[profile.department]);

  if (table === "leads") {
    const l = row as Record<string, unknown>;
    return (
      <main className="px-5 py-10">
        <div className="mx-auto max-w-3xl">
          <p className="bame-eyebrow">Quick enquiry</p>
          <h1 className="mt-2 text-2xl">{String(l.full_name)}</h1>
          <p className="mt-2 text-sm text-[var(--bame-muted)]">
            {String(l.email)} {l.phone ? `· ${l.phone}` : ""}
          </p>
          <div className="mt-8 grid gap-4 rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6 text-sm md:grid-cols-2">
            {(
              [
                ["Sport", l.sport],
                ["Career stage", l.career_stage],
                ["Primary focus", l.primary_focus],
                ["Location", l.location],
                ["Status", l.status],
                ["Assigned department", l.assigned_department ? DEPARTMENT_LABELS[l.assigned_department as keyof typeof DEPARTMENT_LABELS] : "Unassigned"],
                ["Source", l.source],
                ["Submitted", l.created_at ? new Date(String(l.created_at)).toLocaleString() : null],
              ] as Array<[string, unknown]>
            )
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-[var(--bame-muted)]">{label}</p>
                  <p className="mt-1">{String(value)}</p>
                </div>
              ))}
            {Boolean(l.goal) && (
              <div className="md:col-span-2">
                <p className="text-xs text-[var(--bame-muted)]">What they&apos;re looking for</p>
                <p className="mt-1">{String(l.goal)}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  const d = row as Record<string, unknown>;
  const payload = (d.payload as Record<string, unknown>) || {};

  const tier = packageTierFromInterest(d.package_interest);
  const assignedDept = d.assigned_department as string | null;
  let deliverableItems: DeliverableItem[] = [];
  if (tier && assignedDept) {
    const [{ data: deliverables }, { data: statuses }] = await Promise.all([
      supabase
        .from("deliverables")
        .select("id, title, phase")
        .eq("department", assignedDept)
        .eq("package_tier", tier)
        .order("phase")
        .order("sort_order"),
      supabase.from("case_deliverable_status").select("deliverable_id, done").eq("case_table", "diagnostics").eq("case_id", id),
    ]);
    const doneMap = new Map((statuses || []).map((s) => [s.deliverable_id, s.done]));
    deliverableItems = (deliverables || []).map((dl) => ({
      id: dl.id,
      title: dl.title,
      phase: dl.phase as DeliverableItem["phase"],
      done: !!doneMap.get(dl.id),
    }));
  }

  const sortedSections = [...INTAKE_SECTIONS].sort((a, b) => {
    const ah = highlightSections.has(a.id) ? 0 : 1;
    const bh = highlightSections.has(b.id) ? 0 : 1;
    return ah - bh;
  });

  let existingPlayerId: string | null = null;
  if (profile.is_admin) {
    const { data: existingPlayer } = await supabase
      .from("players")
      .select("id")
      .eq("source_case_table", "diagnostics")
      .eq("source_case_id", id)
      .maybeSingle();
    existingPlayerId = existingPlayer?.id || null;
  }

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <p className="bame-eyebrow">Diagnostic</p>
        <h1 className="mt-2 text-2xl">{String(d.athlete_full_name || "Unnamed")}</h1>
        <p className="mt-2 text-sm text-[var(--bame-muted)]">
          {d.athlete_email ? String(d.athlete_email) : ""} {d.primary_sport ? `· ${d.primary_sport}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--bame-muted)]">
          <span>Status: {String(d.status)}</span>
          <span>
            Department: {d.assigned_department ? DEPARTMENT_LABELS[d.assigned_department as keyof typeof DEPARTMENT_LABELS] : "Unassigned"}
          </span>
          {d.case_reference ? <span>Ref: {String(d.case_reference)}</span> : null}
          {d.created_at ? <span>Submitted {new Date(String(d.created_at)).toLocaleString()}</span> : null}
        </div>

        {profile.is_admin && (
          <div className="mt-4">
            {existingPlayerId ? (
              <a href={`/staff/players/${existingPlayerId}`} className="text-xs text-[var(--bame-accent)] hover:underline">
                View player profile →
              </a>
            ) : (
              <OnboardPlayerButton
                caseTable="diagnostics"
                caseId={id}
                fullName={String(d.athlete_full_name || "Unnamed")}
                email={d.athlete_email ? String(d.athlete_email) : null}
                sport={d.primary_sport ? String(d.primary_sport) : null}
                packageTier={tier || "foundation"}
              />
            )}
          </div>
        )}

        {!profile.is_admin && (
          <p className="mt-4 rounded-lg bg-[var(--bame-panel)] px-4 py-2 text-xs text-[var(--bame-accent)]">
            Highlighted below for {DEPARTMENT_LABELS[profile.department]} — the rest is shown for context.
          </p>
        )}

        {deliverableItems.length > 0 && (
          <section className="mt-8 rounded-2xl border border-[var(--bame-accent)]/50 bg-[var(--bame-panel)] p-6">
            <h2 className="text-sm font-semibold text-[var(--bame-accent)]">
              {DEPARTMENT_LABELS[assignedDept as keyof typeof DEPARTMENT_LABELS]} deliverables — {tier} package
            </h2>
            <p className="mt-1 text-xs text-[var(--bame-muted)]">
              Matched automatically from this client&apos;s package, so the team works from a checklist instead of starting from scratch.
            </p>
            <div className="mt-4">
              <DeliverableChecklist caseTable="diagnostics" caseId={id} items={deliverableItems} />
            </div>
          </section>
        )}

        <div className="mt-8 space-y-6">
          {sortedSections.map((section) => {
            const entries = section.fields
              .map((f) => [f.label, fieldValue(payload, f)] as const)
              .filter(([, v]) => v !== null);
            if (entries.length === 0) return null;

            const highlighted = profile.is_admin || highlightSections.has(section.id);

            return (
              <section
                key={section.id}
                className={`rounded-2xl border p-6 ${
                  highlighted
                    ? "border-[var(--bame-accent)]/50 bg-[var(--bame-panel)]"
                    : "border-[var(--bame-line)] bg-[var(--bame-panel)]/40 opacity-70"
                }`}
              >
                <h2 className={`text-sm font-semibold ${highlighted ? "text-[var(--bame-accent)]" : ""}`}>
                  {section.title}
                </h2>
                <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                  {entries.map(([label, value]) => (
                    <div key={label} className={entries.length === 1 ? "md:col-span-2" : ""}>
                      <p className="text-xs text-[var(--bame-muted)]">{label}</p>
                      <p className="mt-1 whitespace-pre-wrap">{value}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
