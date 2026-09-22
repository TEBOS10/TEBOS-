import StaffJoinForm from "@/components/staff/StaffJoinForm";

export const metadata = { title: "Join BAME — Staff" };

export default async function StaffJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="flex-1 bg-[var(--bame-bg)] px-5">
        <div className="mx-auto mt-24 max-w-sm text-center text-sm text-[var(--bame-muted)]">
          This invite link is missing its token. Ask your admin to resend it.
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-[var(--bame-bg)] px-5">
      <StaffJoinForm token={token} />
    </main>
  );
}
