// The client's board in 3D, with a chip per flow to follow one at a time.
// Loaded lazily from the board page; rebuilt when the board's records change.
import { useEffect, useMemo, useRef, useState } from "react";
import { createClientBoard, type ClientBoard } from "./clientBoard";
import type { BoardLayout } from "./layout";

export default function ClientBoardView({ layout }: { layout: BoardLayout }) {
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<ClientBoard | null>(null);
  const [flow, setFlow] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const signature = useMemo(() => JSON.stringify(layout), [layout]);

  useEffect(() => {
    if (!host.current) return;
    try {
      board.current = createClientBoard(host.current, layout, { reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
    } catch {
      setFailed(true);
      return;
    }
    board.current.highlight(flow);
    const onResize = () => board.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      board.current?.dispose();
      board.current = null;
    };
    // rebuild only when the records behind the layout change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => board.current?.highlight(flow), [flow]);

  if (failed) return <p className="muted">This browser can't draw the 3D board. Everything it shows is in the sections below.</p>;
  return (
    <div className="cb">
      {layout.flows.length > 0 && (
        <div className="cb-chips" role="group" aria-label="Follow a flow">
          <button type="button" className={`pr-chip ${flow === null ? "on" : ""}`} aria-pressed={flow === null} onClick={() => setFlow(null)}>All flows</button>
          {layout.flows.map((f) => (
            <button type="button" key={f.id} className={`pr-chip ${flow === f.id ? "on" : ""}`} aria-pressed={flow === f.id} onClick={() => setFlow(flow === f.id ? null : f.id)}>
              {f.name}{f.founderOnly ? <span className="cb-chip-count" title="Steps that exist only in the founder's head"> · {f.founderOnly} founder-only</span> : null}
            </button>
          ))}
        </div>
      )}
      <div className="cb-stage" ref={host} data-testid="board-3d" />
      <ul className="cb-legend">
        <li><span className="cb-key cb-key-solid" /> Confirmed by evidence</li>
        <li><span className="cb-key cb-key-glass" /> Described, not yet confirmed</li>
        <li><span className="cb-key cb-key-amber" /> A step only in the founder's head</li>
        <li><span className="cb-key cb-key-column" /> Objective, filled only from a connected system</li>
      </ul>
    </div>
  );
}
