// The workspace for TEBOS's staff who aren't members of any organisation
// (salespeople, and maintainers before their first client): the pipeline and
// the playbook, and nothing of any client's.
import { BookOpen, Briefcase, LogOut, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link, usePath } from "../lib/router";
import { useSignedIn } from "../lib/session";
import { useStaff } from "../lib/staff";

export function StaffShell({ children }: { children: ReactNode }) {
  const path = usePath();
  const { db, session } = useSignedIn();
  const { access } = useStaff();
  const nav = [
    { to: "/pipeline", label: "Pipeline", icon: Briefcase },
    { to: "/sales", label: "Sales playbook", icon: BookOpen },
    ...(access?.admin ? [{ to: "/pipeline/team", label: "Staff", icon: Users }] : []),
  ];
  const roles = [access?.admin && "admin", access?.sales && "sales", access?.maintainer && "maintainer"].filter(Boolean);
  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="brand">
          <span className="brand-mark" aria-hidden><ShieldCheck size={18} /></span>
          <div>
            <div className="brand-name">TEBOS</div>
            <div className="brand-sub">Staff workspace</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = to === "/pipeline" ? path === to || (path.startsWith("/pipeline/") && !path.startsWith("/pipeline/team")) : path === to || path.startsWith(`${to}/`);
            return (
              <Link key={to} to={to} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={17} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="org-name">TEBOS staff</div>
          <div className="who">
            <span className="mono">{session.user.email}</span>
            <span className="role">{roles.join(", ")}</span>
          </div>
          <button className="btn btn-ghost-dark" onClick={() => db.auth.signOut()}>
            <LogOut size={15} aria-hidden /> Sign out
          </button>
          <p className="principle">Nothing of value before payment</p>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
