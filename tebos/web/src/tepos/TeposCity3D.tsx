// Hosts the 3D city (city3d.ts). Loaded lazily from the TEPOS home, only where the device can draw it smoothly;
// everywhere else, and with reduced motion, the home shows the drawn city (TeposCity) instead.
import { useEffect, useRef, useState } from "react";
import type { PortalOrigin } from "../components/Portal";
import { createCity, STAGES, type City, type CityBuilding } from "./city3d";
import { PORTALS, type Portal } from "./portals";

export default function TeposCity3D({ onOpen, allowed }: { onOpen: (p: Portal, e: PortalOrigin) => void; allowed: (p: Portal) => boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const city = useRef<City | null>(null);
  const [stage, setStage] = useState(0);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const open = useRef(onOpen);
  open.current = onOpen;
  const access = PORTALS.map((p) => allowed(p));
  const signature = access.join(",");

  useEffect(() => {
    if (!host.current) return;
    const buildings: CityBuilding[] = PORTALS.map((p, i) => ({
      key: p.key, name: p.name, shade: p.shade, accent: p.accent,
      final: !access[i] ? 1 : p.built ? 5 : 3,
      status: !access[i] ? "no access" : p.built ? "open" : "not built yet",
    }));
    try {
      city.current = createCity(host.current, buildings, {
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        onOpen: (key, origin) => {
          const p = PORTALS.find((x) => x.key === key);
          if (p && allowed(p)) open.current(p, origin);
        },
        onStage: (s, d) => { setStage(s); setDone(d); },
      });
    } catch {
      setFailed(true);
      return;
    }
    const onResize = () => city.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      city.current?.dispose();
      city.current = null;
    };
    // rebuild only when what you can open changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (failed) return null;
  const builtCount = PORTALS.filter((p) => p.built).length;
  return (
    <figure className="city3d" aria-label="The TEPOS city in 3D: one building per portal">
      <div className="city3d-stage" ref={host} role="group" aria-label="Portals as buildings" data-testid="city-3d" />
      <figcaption className="city3d-caption" aria-live="polite">
        {done ? (
          <>
            <strong>Your city</strong>
            <span>{builtCount} of {PORTALS.length} built. Drag to look around; the rest are still going up.</span>
            <button type="button" className="city3d-replay" onClick={() => { setDone(false); city.current?.replay(); }}>Build it again</button>
          </>
        ) : (
          <>
            <strong>{STAGES[stage]}</strong>
            <span>Built from the blueprint up.</span>
          </>
        )}
        <span className="city3d-progress" aria-hidden><span style={{ width: `${done ? 100 : ((stage + 0.5) / STAGES.length) * 100}%` }} /></span>
      </figcaption>
    </figure>
  );
}
