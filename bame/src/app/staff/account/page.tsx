import { redirect } from "next/navigation";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import { DEPARTMENT_LABELS, type StaffProfile } from "@/lib/staff";
import ChangePasswordForm from "@/components/staff/ChangePasswordForm";

export const metadata = { title: "Account — BAME staff" };

export default async function StaffAccountPage() {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login?next=/staff/account");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as StaffProfile | null;

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-md space-y-8">
        <div>
          <p className="bame-eyebrow">Account</p>
          <h1 className="mt-2 text-2xl">Your login</h1>
          {profile && (
            <p className="mt-2 text-sm text-[var(--bame-muted)]">
              {profile.full_name} &middot; {DEPARTMENT_LABELS[profile.department]} &middot; {profile.email}
            </p>
          )}
        </div>

        <section className="rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6">
          <h2 className="text-sm font-semibold">Change password</h2>
          <p className="mt-1 text-xs text-[var(--bame-muted)]">
            If you&apos;re still using the temporary password from onboarding, set your own here now.
          </p>
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        </section>
      </div>
    </main>
  );
}
