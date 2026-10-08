import { redirect } from "next/navigation";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import {
  PROSPECT_CHANNEL_LABELS,
  PROSPECT_CONTACT_TYPE_LABELS,
  PROSPECT_SOURCE_LABELS,
  DEPARTMENT_LABELS,
  type Prospect,
  type StaffProfile,
} from "@/lib/staff";
import OutreachForm from "@/components/staff/OutreachForm";
import ProspectLogEntry from "@/components/staff/ProspectLogEntry";

export const metadata = { title: "Call sheet — BAME staff" };

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // back up to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default async function CallSheetPage() {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login?next=/staff/call-sheet");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as StaffProfile | null;
  if (!profile) {
    return (
      <main className="px-5 py-10">
        <div className="mx-auto max-w-5xl text-sm text-[var(--bame-muted)]">Your account isn&apos;t fully set up yet. Contact an admin.</div>
      </main>
    );
  }

  // v_call_sheet already filters to open prospects, ordered by priority
  // then how overdue they are — it's the same live query the Monday cron
  // counts from, so this page always matches what triggered the notification.
  const { data: callSheet } = await supabase.from("v_call_sheet").select("*");
  const rows = (callSheet || []) as Prospect[];
  const due = rows.filter((p) => p.is_due);
  const upcoming = rows.filter((p) => !p.is_due);

  const monday = startOfWeekMonday(new Date());
  const weekLabel = monday.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });

  function ProspectRow({ p }: { p: Prospect }) {
    return (
      <div className="border-t border-[var(--bame-line)] p-4 text-sm first:border-t-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">
              {p.full_name}
              {p.org_name ? ` · ${p.org_name}` : ""}
            </p>
            <p className="text-xs text-[var(--bame-muted)]">
              {PROSPECT_CONTACT_TYPE_LABELS[p.contact_type]} · {PROSPECT_CHANNEL_LABELS[p.channel]}
              {p.handle_or_contact ? ` (${p.handle_or_contact})` : ""} · {PROSPECT_SOURCE_LABELS[p.source]}
            </p>
            {p.notes && <p className="mt-1 text-xs text-[var(--bame-muted)]">{p.notes}</p>}
          </div>
          <div className="text-right text-xs text-[var(--bame-muted)]">
            <p
              className={`rounded-full px-2 py-0.5 ${
                p.priority === "high" ? "bg-[var(--bame-accent)]/20 text-[var(--bame-accent)]" : "border border-[var(--bame-line)]"
              }`}
            >
              {p.priority}
            </p>
            {p.next_follow_up_at && <p className="mt-1">Follow up {new Date(p.next_follow_up_at).toLocaleDateString("en-ZA")}</p>}
            <p className="mt-1">{p.contact_count || 0} contact{(p.contact_count || 0) === 1 ? "" : "s"} logged</p>
          </div>
        </div>
        <div className="mt-2">
          <ProspectLogEntry prospectId={p.id} defaultChannel={p.channel} />
        </div>
      </div>
    );
  }

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="bame-eyebrow">Week of {weekLabel}</p>
            <h1 className="mt-2 text-2xl">Call sheet</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--bame-muted)]">
              Builds itself — every prospect logged by anyone on staff (outreach or referral) lands here
              automatically, surfaced again the moment a follow-up date comes due. Nothing to compile by hand.
            </p>
          </div>
          <OutreachForm />
        </div>

        <section>
          <h2 className="text-sm font-semibold text-[var(--bame-accent)]">Due now ({due.length})</h2>
          {due.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--bame-muted)]">Nothing due — fully caught up.</p>
          ) : (
            <div className="mt-3 rounded-2xl border border-[var(--bame-line)]">
              {due.map((p) => (
                <ProspectRow key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold">Scheduled for later ({upcoming.length})</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--bame-muted)]">Nothing scheduled.</p>
          ) : (
            <div className="mt-3 rounded-2xl border border-[var(--bame-line)]">
              {upcoming.map((p) => (
                <ProspectRow key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>

        {profile.is_admin && (
          <p className="text-xs text-[var(--bame-muted)]">
            Every Monday at 6am, Sales and Admin get a notification with the count of contacts due. Reassigning a
            prospect to another department (e.g. {DEPARTMENT_LABELS.pr}) is available from the prospects API for admins.
          </p>
        )}
      </div>
    </main>
  );
}
