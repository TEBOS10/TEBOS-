import { getSupabaseSessionClient } from "@/lib/supabase-server";
import StaffNav from "@/components/staff/StaffNav";
import type { StaffProfile } from "@/lib/staff";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: StaffProfile | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, department, is_admin")
      .eq("id", user.id)
      .maybeSingle();
    profile = data as StaffProfile | null;
  }

  if (!profile) {
    return <div className="flex-1 bg-[var(--bame-bg)]">{children}</div>;
  }

  return (
    <div className="flex-1 bg-[var(--bame-bg)]">
      <StaffNav profile={profile} />
      {children}
    </div>
  );
}
