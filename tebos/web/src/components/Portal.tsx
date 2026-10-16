// The portal: a tile that, when opened, pulls you through a warm vortex in its own colours into its space.
// With reduced motion it simply opens.
import { inkFor } from "@core/brand";
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

interface Opening {
  rect: DOMRect;
  shade: string;
  accent: string;
}

const DURATION = 650;

export function usePortal() {
  const [opening, setOpening] = useState<Opening | null>(null);
  function open(e: MouseEvent<HTMLElement>, shade: string, accent: string, go: () => void) {
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return go();
    setOpening({ rect: e.currentTarget.getBoundingClientRect(), shade, accent });
    window.setTimeout(() => {
      go();
      window.setTimeout(() => setOpening(null), 250);
    }, DURATION);
  }
  const overlay = opening ? (
    <div
      className="portal-vortex"
      aria-hidden
      style={{
        "--x": `${opening.rect.left}px`, "--y": `${opening.rect.top}px`, "--w": `${opening.rect.width}px`, "--h": `${opening.rect.height}px`,
        "--shade": opening.shade, "--accent": opening.accent,
      } as CSSProperties}
    >
      <div className="portal-swirl" />
    </div>
  ) : null;
  return { open, overlay };
}

export function PortalTile({ shade, accent, monogram, name, line, status, onOpen, testId }: {
  shade: string; accent: string; monogram: string; name: string; line: ReactNode; status: ReactNode;
  onOpen: (e: MouseEvent<HTMLButtonElement>) => void; testId?: string;
}) {
  const ink = inkFor(shade);
  return (
    <button type="button" className="portal-tile" data-testid={testId} onClick={onOpen}
      style={{ "--shade": shade, "--accent": accent, "--ink": ink } as CSSProperties}>
      <span className="portal-mark" aria-hidden>{monogram}</span>
      <span className="portal-name">{name}</span>
      <span className="portal-line">{line}</span>
      <span className="portal-status">{status}</span>
    </button>
  );
}
