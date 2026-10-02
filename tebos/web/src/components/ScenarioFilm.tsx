// Plays a scenario: a day in the life of a business on its TEBOS operating
// system, moment by moment, each lighting up the real step of the blueprint it
// shows (who does it, what it runs on). Labelled on screen as an illustration.
import { Bot, Check, ChevronLeft, ChevronRight, Crown, Pause, Play, RotateCcw, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Performer } from "@core/board";
import { stepOf, type Scenario } from "../scenarios";
import "../film.css";
import "../scenario.css";

type Frame =
  | { kind: "title"; seconds: number }
  | { kind: "before"; seconds: number }
  | { kind: "moment"; index: number; seconds: number }
  | { kind: "after"; seconds: number };

const PERFORMER: Record<Performer, { label: string; icon: typeof Bot }> = {
  automation: { label: "Automatic", icon: Bot },
  staff: { label: "The team", icon: User },
  provider: { label: "A supplier", icon: User },
  client: { label: "The customer", icon: User },
  founder: { label: "The owner", icon: Crown },
};

export function framesOf(s: Scenario): Frame[] {
  return [
    { kind: "title", seconds: 4 },
    { kind: "before", seconds: 9 },
    ...s.moments.map((_, index) => ({ kind: "moment" as const, index, seconds: 6 })),
    { kind: "after", seconds: 9 },
  ];
}

export function ScenarioFilm({ scenario, onEnded }: { scenario: Scenario; onEnded?: () => void }) {
  const frames = useMemo(() => framesOf(scenario), [scenario]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const ended = useRef(false);

  useEffect(() => {
    setIndex(0);
    setPlaying(true);
    ended.current = false;
  }, [scenario]);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (index < frames.length - 1) setIndex(index + 1);
      else {
        setPlaying(false);
        if (!ended.current) {
          ended.current = true;
          onEnded?.();
        }
      }
    }, frames[index]!.seconds * 1000);
    return () => clearTimeout(t);
  }, [index, playing, frames, onEnded]);

  const frame = frames[index]!;
  const go = (i: number) => setIndex(Math.max(0, Math.min(frames.length - 1, i)));
  return (
    <div className="fm sc" data-testid="scenario" data-frame={frame.kind === "moment" ? `moment-${frame.index}` : frame.kind}>
      <div className="fm-stage">
        <div className="fm-floor" aria-hidden />
        <div className="fm-glow" aria-hidden />
        <div className="sc-scene" key={index} aria-live="polite">
          {frame.kind === "title" && (
            <div className="sc-center fm-in">
              <p className="sc-kicker">A day on TEBOS</p>
              <h2 className="sc-title">{scenario.label}</h2>
              <p className="sc-dim">{scenario.who}</p>
            </div>
          )}
          {frame.kind === "before" && (
            <div className="sc-list">
              <p className="sc-kicker">Before</p>
              {scenario.before.map((b, i) => <p key={b} className="sc-item fm-in" style={{ ["--d" as string]: `${i * 2.4}s` }}>{b}</p>)}
            </div>
          )}
          {frame.kind === "moment" && <Moment scenario={scenario} index={frame.index} />}
          {frame.kind === "after" && (
            <div className="sc-list">
              <p className="sc-kicker">With its operating system</p>
              {scenario.after.map((b, i) => (
                <p key={b} className="sc-item sc-good fm-in" style={{ ["--d" as string]: `${i * 2.4}s` }}><Check aria-hidden /> {b}</p>
              ))}
            </div>
          )}
        </div>
        <span className="fm-label">Illustration · example names and numbers</span>
      </div>
      <div className="sc-controls">
        <button className="btn btn-sm" onClick={() => go(index - 1)} aria-label="Back"><ChevronLeft size={16} aria-hidden /></button>
        <button className="btn btn-sm" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <button className="btn btn-sm" onClick={() => go(index + 1)} aria-label="Next"><ChevronRight size={16} aria-hidden /></button>
        <button className="btn btn-sm" onClick={() => { go(0); setPlaying(true); }} aria-label="Start again"><RotateCcw size={16} aria-hidden /></button>
        <div className="sc-progress" aria-hidden><span style={{ width: `${((index + 1) / frames.length) * 100}%` }} /></div>
      </div>
    </div>
  );
}

function Moment({ scenario, index }: { scenario: Scenario; index: number }) {
  const m = scenario.moments[index]!;
  const where = stepOf(scenario, m);
  if (typeof where === "string") return <p className="sc-item">{m.text}</p>;
  const flow = where.blueprint.flows[where.flowIndex]!;
  const step = flow.steps[m.step]!;
  const who = PERFORMER[step.performer];
  const Icon = who.icon;
  return (
    <div className="sc-moment">
      <div className="sc-head fm-in">
        <span className="sc-clock">{m.at}</span>
        <span className="sc-flow">{flow.name}</span>
      </div>
      <ol className="sc-steps" aria-label={`Steps of ${flow.name}`}>
        {flow.steps.map((st, i) => (
          <li key={st.name} className={i < m.step ? "done" : i === m.step ? "now" : "next"} aria-current={i === m.step ? "step" : undefined}>
            {i < m.step ? <Check aria-hidden /> : <span className="sc-dot">{i + 1}</span>}
            <span>{st.name}</span>
          </li>
        ))}
      </ol>
      <div className={`sc-card fm-pop-z ${step.performer === "founder" ? "owner" : step.performer === "automation" ? "auto" : ""}`}>
        <div className="sc-who"><Icon aria-hidden /> {who.label}{step.role && step.performer !== "automation" ? ` · ${step.role}` : ""}{step.piece ? ` · runs on ${step.piece}` : ""}</div>
        <p className="sc-text">{m.text}</p>
      </div>
    </div>
  );
}
