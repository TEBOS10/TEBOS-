import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--bame-line)]/70 bg-[var(--bame-bg)]/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="text-lg font-semibold tracking-wide">
          BAME
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-[var(--bame-muted)] md:flex">
          <Link href="/#services" className="hover:text-[var(--bame-ink)]">Services</Link>
          <Link href="/#how-it-works" className="hover:text-[var(--bame-ink)]">How it works</Link>
          <Link href="/#athletes" className="hover:text-[var(--bame-ink)]">Athletes</Link>
          <Link href="/#events" className="hover:text-[var(--bame-ink)]">Events</Link>
        </nav>
        <Link
          href="/intake"
          className="rounded-full bg-[var(--bame-accent)] px-4 py-2 text-sm font-semibold text-[#1a1608] transition hover:opacity-90"
        >
          Start here
        </Link>
      </div>
    </header>
  );
}
