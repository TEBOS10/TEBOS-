const STYLES = {
  hot: "bg-[var(--bame-accent)] text-[#1a1608]",
  warm: "ring-1 ring-[var(--bame-accent)] text-[var(--bame-accent)]",
  cold: "ring-1 ring-[var(--bame-line)] text-[var(--bame-muted)]",
} as const;

export default function LeadPriorityBadge({
  priority,
  score,
}: {
  priority: keyof typeof STYLES | null;
  score: number | null;
}) {
  if (!priority) return null;
  return (
    <span
      title="AI triage score: advisory only"
      className={`inline-block rounded-full px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide ${STYLES[priority]}`}
    >
      {priority} {score !== null ? `· ${score}` : ""}
    </span>
  );
}
