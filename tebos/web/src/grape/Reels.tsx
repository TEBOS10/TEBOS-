// Listing reels (ADR 0019): drop the listing's photos, choose which to use, render, and download up to six vertical
// videos ready to post. Rendered on a canvas in this browser: the photos are never uploaded anywhere.
import { Download, Film, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cameraAt, coverRect, FADE_MS, MAX_REELS, planReels, recordingType, REEL, SHOT_MS, type ReelPlan } from "../lib/reels";

interface Photo { id: string; name: string; url: string; img: HTMLImageElement; on: boolean }
interface Made { plan: ReelPlan; url: string; ext: string }

export function Reels() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [count, setCount] = useState(MAX_REELS);
  const [caption, setCaption] = useState("");
  const [made, setMade] = useState<Made[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => () => { photos.forEach((p) => URL.revokeObjectURL(p.url)); made.forEach((m) => URL.revokeObjectURL(m.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(files: FileList | null) {
    if (!files) return;
    const next: Photo[] = [];
    for (const f of Array.from(files).filter((x) => x.type.startsWith("image/")).slice(0, 30)) {
      const url = URL.createObjectURL(f);
      const img = new Image(); img.src = url;
      try { await img.decode(); next.push({ id: `${f.name}-${f.size}-${Math.random()}`, name: f.name, url, img, on: true }); } catch { URL.revokeObjectURL(url); }
    }
    setPhotos((p) => [...p, ...next]);
  }

  const chosen = photos.filter((p) => p.on);
  async function render() {
    const type = typeof MediaRecorder === "undefined" ? null : recordingType((t) => MediaRecorder.isTypeSupported(t));
    if (!type) { setProblem("This browser can't record video. Try Chrome or Edge on a computer."); return; }
    const c = canvas.current!; const ctx = c.getContext("2d")!;
    setProblem(null); setMade([]);
    const plans = planReels(chosen.length, count);
    const out: Made[] = [];
    for (const [i, plan] of plans.entries()) {
      setProgress(`Rendering video ${i + 1} of ${plans.length}…`);
      const rec = new MediaRecorder(c.captureStream(REEL.fps), { mimeType: type.mime, videoBitsPerSecond: 8_000_000 });
      const parts: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      const stopped = new Promise((r) => (rec.onstop = r));
      rec.start();
      const total = SHOT_MS * plan.shots.length;
      await new Promise<void>((resolve) => {
        const t0 = performance.now();
        const frame = (now: number) => {
          const t = Math.min(now - t0, total - 1);
          draw(ctx, plan, chosen, t, caption);
          if (now - t0 >= total) { resolve(); return; }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      rec.stop(); await stopped;
      // label with the numbers shown on the thumbnails, not positions among the chosen ones
      const label = plan.shots.map((x) => photos.indexOf(chosen[x.photo]!) + 1).join(",");
      out.push({ plan: { ...plan, label }, url: URL.createObjectURL(new Blob(parts, { type: type.mime.split(";")[0] })), ext: type.ext });
      setMade([...out]);
    }
    setProgress(null);
  }

  return (
    <main className="gs-wrap gs-section gs-reels" data-testid="reels">
      <p className="gs-kicker">For the team · property listings</p>
      <h1>Listing photos into reels</h1>
      <p className="gs-lead">Drop the listing's photos, choose which to use, and render. You get up to six vertical videos, 9:16 and ready to post, each moving slowly through the rooms. It all happens in this browser: the photos aren't uploaded anywhere.</p>

      <label className="gs-drop">
        <ImagePlus size={22} aria-hidden />
        <span>Drop your listing photos, or choose them</span>
        <input type="file" accept="image/*" multiple aria-label="Listing photos" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
      </label>

      {photos.length > 0 && (
        <>
          <ul className="gs-picks" aria-label="Photos">
            {photos.map((p, i) => (
              <li key={p.id}>
                <button type="button" className={p.on ? "on" : ""} aria-pressed={p.on} aria-label={`Photo ${i + 1}: ${p.name}`}
                  onClick={() => setPhotos((all) => all.map((x) => (x.id === p.id ? { ...x, on: !x.on } : x)))}>
                  <img src={p.url} alt="" /><span className="gs-pick-n">{i + 1}</span>
                </button>
                <button type="button" className="gs-pick-x" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((all) => all.filter((x) => x.id !== p.id))}><X size={14} aria-hidden /></button>
              </li>
            ))}
          </ul>
          <div className="gs-reel-opts">
            <label>Videos <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many videos">
              {Array.from({ length: MAX_REELS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select></label>
            <label className="gs-grow">Caption (optional) <input value={caption} maxLength={60} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. 3 bed · Sandton" aria-label="Caption" /></label>
            <button type="button" className="gs-btn" onClick={() => void render()} disabled={chosen.length === 0 || progress !== null}>
              <Film size={16} aria-hidden /> {progress ?? `Render ${count} video${count > 1 ? "s" : ""}`}
            </button>
          </div>
          <p className="gs-muted">{chosen.length} of {photos.length} photos chosen. Each video is {(SHOT_MS * 4) / 1000} seconds, four photos.</p>
        </>
      )}
      {problem && <p className="gs-note" role="alert">{problem}</p>}

      {made.length > 0 && (
        <ul className="gs-made" aria-label="Your videos" data-testid="made">
          {made.map((m, i) => (
            <li key={m.url}>
              <p className="gs-made-label">Photos {m.plan.label}</p>
              <video src={m.url} controls playsInline muted loop aria-label={`Video ${i + 1}`} />
              <a className="gs-btn gs-btn-quiet" href={m.url} download={`listing-reel-${i + 1}.${m.ext}`}><Download size={15} aria-hidden /> Download</a>
            </li>
          ))}
        </ul>
      )}
      <canvas ref={canvas} width={REEL.width} height={REEL.height} className="gs-reel-canvas" aria-hidden />
      <p className="gs-muted gs-small">The camera moves are pans and zooms across your photos. Generated motion (rooms the camera moves through in depth) needs an AI video service; Grape Studios can add one later.</p>
    </main>
  );
}

function draw(ctx: CanvasRenderingContext2D, plan: ReelPlan, photos: Photo[], t: number, caption: string) {
  const { width: W, height: H } = REEL;
  const k = Math.floor(t / SHOT_MS), into = t - k * SHOT_MS;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  const paint = (shotIndex: number, local: number, alpha: number) => {
    const shot = plan.shots[shotIndex]; if (!shot) return;
    const img = photos[shot.photo]!.img;
    const r = coverRect(img.naturalWidth, img.naturalHeight, W, H, cameraAt(shot.move, local / SHOT_MS));
    ctx.globalAlpha = alpha; ctx.drawImage(img, r.x, r.y, r.w, r.h); ctx.globalAlpha = 1;
  };
  paint(k, into, 1);
  // cross-fade into the next shot over its last moments
  if (into > SHOT_MS - FADE_MS && k + 1 < plan.shots.length) paint(k + 1, into - SHOT_MS, (into - (SHOT_MS - FADE_MS)) / FADE_MS);
  // a soft shade at the foot, the caption and the studio's name
  const g = ctx.createLinearGradient(0, H * 0.72, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.72, W, H * 0.28);
  ctx.fillStyle = "#fff"; ctx.textAlign = "center";
  if (caption.trim()) { ctx.font = "500 56px 'Geist Variable', system-ui, sans-serif"; ctx.fillText(caption.trim(), W / 2, H - 190); }
  ctx.font = "500 30px 'Geist Variable', system-ui, sans-serif"; ctx.globalAlpha = 0.85;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "10px";
  ctx.fillText("GRAPE STUDIOS", W / 2, H - 110);
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  ctx.globalAlpha = 1;
}
