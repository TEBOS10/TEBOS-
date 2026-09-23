import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--bame-line)]/70 py-10 text-sm text-[var(--bame-muted)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-semibold text-[var(--bame-ink)]">BAME</div>
          <div>Brand management for sport in motion.</div>
        </div>
        <nav className="flex flex-wrap gap-5">
          <Link href="/#services">Services</Link>
          <Link href="/#athletes">Athletes</Link>
          <Link href="/#refer">Refer &amp; earn 10%</Link>
          <Link href="/intake">Get started</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <div className="flex items-center gap-4">
          <span>© {new Date().getFullYear()} BAME</span>
          <Link href="/staff/login" className="text-xs opacity-60 hover:opacity-100">
            Staff
          </Link>
        </div>
      </div>
    </footer>
  );
}
