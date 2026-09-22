import { isAdminAuthed } from "@/lib/admin-auth";
import LoginForm from "@/components/admin/LoginForm";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const metadata = { title: "Admin — BAME" };

export default async function AdminPage() {
  const authed = await isAdminAuthed();

  if (!authed) {
    return (
      <main className="flex-1 bg-[var(--bame-bg)] px-5">
        <LoginForm />
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 py-10">
      <div className="mx-auto max-w-6xl">
        <p className="bame-eyebrow">BAME administration</p>
        <h1 className="mt-2 text-2xl">Leads &amp; diagnostics</h1>
        <p className="mt-2 text-sm text-[var(--bame-muted)]">
          Every website enquiry and full diagnostic lands here first. Assign a department and move status forward
          as BAME&apos;s team works each case.
        </p>
        <div className="mt-8">
          <AdminDashboard />
        </div>
      </div>
    </main>
  );
}
