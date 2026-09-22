import StaffLoginForm from "@/components/staff/StaffLoginForm";

export const metadata = { title: "Staff sign in — BAME" };

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex-1 bg-[var(--bame-bg)] px-5">
      <StaffLoginForm next={next && next.startsWith("/staff") ? next : "/staff"} />
    </main>
  );
}
