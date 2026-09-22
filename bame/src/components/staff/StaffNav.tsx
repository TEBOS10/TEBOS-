"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { StaffProfile } from "@/lib/staff";
import { DEPARTMENT_LABELS } from "@/lib/staff";

export default function StaffNav({ profile }: { profile: StaffProfile }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/staff/login");
    router.refresh();
  }

  const links = [{ href: "/staff", label: "Dashboard" }];
  if (profile.is_admin) links.push({ href: "/staff/team", label: "Team" });

  return (
    <header className="border-b border-[var(--bame-line)] px-5 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div>
          <p className="bame-eyebrow">BAME staff</p>
          <p className="text-sm text-[var(--bame-muted)]">
            {profile.full_name} &middot; {DEPARTMENT_LABELS[profile.department]}
          </p>
        </div>
        <nav className="flex items-center gap-5 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? "text-[var(--bame-accent)]" : "text-[var(--bame-muted)]"}
            >
              {l.label}
            </Link>
          ))}
          <button onClick={signOut} className="text-[var(--bame-muted)] hover:text-[var(--bame-ink)]">
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
