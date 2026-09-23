import { notFound, redirect } from "next/navigation";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import { INTAKE_SECTIONS, type IntakeField } from "@/lib/intake-schema";
import { DEPARTMENT_HIGHLIGHT_SECTIONS, DEPARTMENT_LABELS, type StaffProfile } from "@/lib/staff";

function fieldValue(payload: Record<string, unknown>, field: IntakeField): string | null {
  const raw = payload[field.name];
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.type === "checkbox") return raw ? "Yes" : "No";
  if (field.type === "chips" || field.type === "cards") {
    return typeof raw === "string" ? raw.split("; ").filter(Boolean).join(", ") : String(raw);
  }
  return String(raw);
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

  const sortedSections = [...INTAKE_SECTIONS].sort((a, b) => {
    const ah = highlightSections.has(a.id) ? 0 : 1;
    const bh = highlightSections.has(b.id) ? 0 : 1;
    return ah - bh;
  });

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

        {!profile.is_admin && (
          <p className="mt-4 rounded-lg bg-[var(--bame-panel)] px-4 py-2 text-xs text-[var(--bame-accent)]">
            Highlighted below for {DEPARTMENT_LABELS[profile.department]} — the rest is shown for context.
          </p>
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
