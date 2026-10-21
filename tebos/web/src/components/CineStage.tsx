// A page's opening on the cinematic stage: the CSS light always, and on a wide screen with a graphics chip (and
// without reduced motion) the 3D structure drifting into place beside the words. Phones keep the light: the
// structure would crowd the text and cost battery. The scene loads after the page, so it never delays the text.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { use3d } from "../world/support";
import { CineLight } from "./CineLight";

export function CineStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [three] = useState(() => use3d() && window.innerWidth >= 820);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!three || !host.current) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void import("../world/structureScene").then(({ mountStructure }) => {
      if (cancelled || !host.current) return;
      stop = mountStructure(host.current, { onReady: () => setReady(true) });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [three]);

  return (
    <div className={`cine ${className}`} data-testid="cine-stage" data-scene={three ? (ready ? "3d" : "loading") : "light"}>
      <CineLight />
      {three && <div ref={host} className={`cine-3d ${ready ? "on" : ""}`} aria-hidden />}
      {children}
    </div>
  );
}
