// Work (founder, 1 Nov 2026: "visually showcase a few templates of what we've made like BAME and a new client ...
// Grape Studios"). Each piece says plainly what it is: a live client site, a concept, or a template with sample text.
// The Grape Studios concept is interactive. The booking flow books nothing, and the editor works on the visitor's own
// photos inside their browser; nothing is uploaded. The premium AI edits need a provider and are labelled as such.
import { ArrowUpRight, Download, Film, ImagePlus, Moon, Sparkles, Sun, Sunset, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { applyLook, channelStats, LOOK_LABEL, matchReference, type ChannelStats, type Look } from "../lib/grade";
import { CATEGORIES as GRAPE, deposit, type CategoryKey } from "../lib/grapeRates";
import { money } from "@core/property";
import { SiteFrame } from "./BlogPage";
import "../work.css";

interface Piece { key: string; name: string; kind: "Live client site" | "Concept" | "Template"; what: string; image: string; href: string; external?: boolean }

const WORK: Piece[] = [
  { key: "bame", name: "BAME", kind: "Live client site", what: "Brand management for sport: athletes, clubs and events.",
    image: "/work/bame-live.jpg", href: "https://bamemarketing.site", external: true },
  { key: "grape", name: "Grape Studios", kind: "Concept", what: "Book a photoshoot by category, and edit photos like a studio.",
    image: "/work/grape-concept.jpg", href: "/work/grape-studios" },
  { key: "service", name: "Service business", kind: "Template", what: "TEBOS's starter website for a service business. Sample text.",
    image: "/work/service-template.jpg", href: "/systems" },
];

function useTitle(title: string) {
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => { document.title = before; };
  }, [title]);
}

export function WorkPage() {
  useTitle("Work · TEBOS");
  return (
    <SiteFrame>
      <p className="lp-kicker">Work</p>
      <h1 className="lp-title">Made by TEBOS</h1>
      <p className="lp-sub">Each one says what it is: a live client site, a concept, or a template.</p>
      <ul className="wk-grid" data-testid="work">
        {WORK.map((w) => (
          <li key={w.key}>
            <a className="wk-card" href={w.href} {...(w.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
              <span className="wk-shot"><img src={w.image} alt={`${w.name}: ${w.what}`} loading="lazy" /></span>
              <span className="wk-meta">
                <span className="wk-name">{w.name} <ArrowUpRight size={16} aria-hidden /></span>
                <span className="wk-kind">{w.kind}</span>
              </span>
              <span className="wk-what">{w.what}</span>
            </a>
          </li>
        ))}
      </ul>
    </SiteFrame>
  );
}

// ---------------------------------------------------------------------------
// Grape Studios, a concept
// ---------------------------------------------------------------------------
const SLOTS = ["08:00", "10:00", "12:00", "14:00", "16:00"];

export function GrapeStudiosPage() {
  useTitle("Grape Studios · a concept by TEBOS");
  return (
    <div className="gr">
      <header className="gr-nav">
        <a href="/work" className="gr-back">← Work</a>
        <span className="gr-mark"><img src="/work/grape/logo.png" alt="" width={34} height={34} /> GRAPE STUDIOS</span>
        <span className="gr-flag">Concept by TEBOS</span>
      </header>
      <section className="gr-hero">
        <h1>Book the shoot you want.<br /><em>Edit like a studio.</em></h1>
        <p>Studio, on location, corporate, graduation, property and events, in Johannesburg.</p>
      </section>
      <Booking />
      <Editor />
      <footer className="gr-foot">
        A concept TEBOS made for Grape Studios, with Grape Studios' own photos and rates. Booking here sends nothing. The
        editor works on your photos inside your browser; nothing is uploaded.
      </footer>
    </div>
  );
}

function Booking() {
  const [catKey, setCatKey] = useState<CategoryKey | null>(null);
  const [pkg, setPkg] = useState<number | "custom" | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [done, setDone] = useState(false);
  const days = useMemo(() => {
    const out: Array<{ iso: string; label: string }> = [];
    const d = new Date();
    for (let i = 2; out.length < 10; i++) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      out.push({ iso: x.toISOString().slice(0, 10), label: x.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }) });
    }
    return out;
  }, []);
  const cat = GRAPE.find((c) => c.key === catKey);
  const chosen = cat && typeof pkg === "number" ? cat.packages[pkg] : undefined;
  const reset = (k: CategoryKey) => { setCatKey(k); setPkg(GRAPE.find((c) => c.key === k)!.packages.length ? null : "custom"); setDay(null); setSlot(null); setDone(false); };
  return (
    <section className="gr-section" aria-labelledby="gr-book">
      <p className="gr-step">01</p>
      <h2 id="gr-book">Book a shoot</h2>
      <ul className="gr-cats" role="group" aria-label="Kind of shoot">
        {GRAPE.map((c) => (
          <li key={c.key}>
            <button type="button" className={`gr-cat ${catKey === c.key ? "on" : ""}`} aria-pressed={catKey === c.key} onClick={() => reset(c.key)}>
              <img src={c.cover} alt={c.coverAlt} loading="lazy" />
              <span className="gr-cat-name">{c.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {cat && (
        <div className="gr-card" data-testid="rate-card">
          <div className="gr-card-head">
            <h3>{cat.name}</h3>
            <p>{cat.pictures} · images in {cat.delivery}{cat.transport ? ` · travel R${cat.transport[0]} to R${cat.transport[1]} around Johannesburg` : " · at the studio"}</p>
          </div>
          <div className="gr-pkgs" role="group" aria-label="Rate">
            {cat.packages.map((p, i) => (
              <button key={p.label} type="button" className={`gr-pkg ${pkg === i ? "on" : ""}`} aria-pressed={pkg === i} onClick={() => { setPkg(i); setDone(false); }}>
                <span>{p.label}</span><strong>{money(p.cents / 100)}</strong>{p.note && <small>{p.note}</small>}
              </button>
            ))}
            <button type="button" className={`gr-pkg ${pkg === "custom" ? "on" : ""}`} aria-pressed={pkg === "custom"} onClick={() => { setPkg("custom"); setDone(false); }}>
              <span>Custom rate</span><strong>Quoted</strong><small>Tailored to what you need</small>
            </button>
          </div>
        </div>
      )}
      {cat && pkg !== null && (
        <div className="gr-when">
          <div className="gr-days" role="group" aria-label="Day">
            {days.map((d) => (
              <button key={d.iso} type="button" className={`gr-chip ${day === d.iso ? "on" : ""}`} aria-pressed={day === d.iso} onClick={() => { setDay(d.iso); setDone(false); }}>{d.label}</button>
            ))}
          </div>
          {day && (
            <div className="gr-days" role="group" aria-label="Time">
              {SLOTS.map((s) => (
                <button key={s} type="button" className={`gr-chip ${slot === s ? "on" : ""}`} aria-pressed={slot === s} onClick={() => { setSlot(s); setDone(false); }}>{s}</button>
              ))}
            </div>
          )}
          {pkg === "custom" && day && (
            <label className="gr-brief">What do you need?
              <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="The occasion, how many people, how long, where" />
            </label>
          )}
        </div>
      )}
      {cat && pkg !== null && day && slot && (
        <div className="gr-summary">
          <div>
            <p><strong>{cat.name}</strong> · {chosen ? chosen.label : "Custom rate"} · {days.find((d) => d.iso === day)?.label} · {slot}</p>
            {chosen
              ? <p className="gr-note" data-testid="deposit">{money(chosen.cents / 100)}. A {money(deposit(chosen.cents).deposit / 100)} deposit (half, non-refundable) holds the date; {money(deposit(chosen.cents).balance / 100)} on the day{cat.transport ? ", plus travel" : ""}.</p>
              : <p className="gr-note">Grape Studios replies with a quote. The date is held once the deposit is paid.</p>}
          </div>
          {done
            ? <p role="status" className="gr-note">This is a concept, so nothing was sent. On Grape Studios' platform this would hold the slot and send the deposit request.</p>
            : <button type="button" className="gr-btn" disabled={pkg === "custom" && brief.trim().length < 10} onClick={() => setDone(true)}>{chosen ? "Request this shoot" : "Ask for a quote"}</button>}
        </div>
      )}
    </section>
  );
}

interface Photo { id: number; name: string; url: string; img: HTMLImageElement }

async function loadImage(file: File): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  return img;
}

/** Draws an image fitted to at most `max` pixels wide, and returns its canvas. */
function drawFitted(img: HTMLImageElement, max = 1600): HTMLCanvasElement {
  const scale = Math.min(1, max / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function render(img: HTMLImageElement, look: Look, ref: ChannelStats | null, strength: number): string {
  const c = drawFitted(img);
  const ctx = c.getContext("2d")!;
  const data = ctx.getImageData(0, 0, c.width, c.height);
  if (ref) matchReference(data.data, ref, strength);
  applyLook(data.data, look);
  ctx.putImageData(data, 0, 0);
  return c.toDataURL("image/jpeg", 0.9);
}

function Editor() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [active, setActive] = useState(0);
  const [look, setLook] = useState<Look>("original");
  const [ref, setRef] = useState<{ stats: ChannelStats; url: string } | null>(null);
  const [strength, setStrength] = useState(0.8);
  const [split, setSplit] = useState(50);
  const [edited, setEdited] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const nextId = useRef(1);
  const photo = photos[active];

  useEffect(() => {
    if (!photo) { setEdited(null); return; }
    setEdited(render(photo.img, look, ref?.stats ?? null, strength));
  }, [photo, look, ref, strength]);

  async function add(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, 24);
    const loaded = await Promise.all(files.map(async (f) => ({ id: nextId.current++, name: f.name, img: await loadImage(f), url: "" })));
    setPhotos((p) => [...p, ...loaded.map((l) => ({ ...l, url: l.img.src }))]);
    e.target.value = "";
  }
  async function addRef(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = await loadImage(f);
    const c = drawFitted(img, 400);
    setRef({ stats: channelStats(c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data), url: img.src });
    e.target.value = "";
  }
  function downloadAll() {
    photos.forEach((p, i) => {
      const a = document.createElement("a");
      a.href = render(p.img, look, ref?.stats ?? null, strength);
      a.download = `grape-${String(i + 1).padStart(2, "0")}-${look}.jpg`;
      a.click();
    });
  }
  async function makeVideo() {
    if (photos.length === 0 || typeof MediaRecorder === "undefined") return;
    setMaking(true);
    const c = document.createElement("canvas");
    c.width = 1280; c.height = 720;
    const ctx = c.getContext("2d")!;
    const frames = await Promise.all(photos.map(async (p) => {
      const i = new Image(); i.src = render(p.img, look, ref?.stats ?? null, strength); await i.decode(); return i;
    }));
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
    const parts: Blob[] = [];
    rec.ondataavailable = (ev) => parts.push(ev.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    const per = 2400, t0 = performance.now(), total = per * frames.length;
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const t = now - t0;
        if (t >= total) { resolve(); return; }
        const k = Math.floor(t / per), f = (t % per) / per;
        const img = frames[k]!;
        // a slow push-in on each photo, fading into the next
        const zoom = 1.04 + 0.08 * f;
        const s = Math.max(c.width / img.width, c.height / img.height) * zoom;
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.globalAlpha = Math.min(1, f * 4);
        ctx.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s);
        ctx.globalAlpha = 1;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await stopped;
    setVideo(URL.createObjectURL(new Blob(parts, { type: "video/webm" })));
    setMaking(false);
  }

  const LOOK_ICON = { original: ImagePlus, day: Sun, golden: Sunset, night: Moon } as const;
  return (
    <section className="gr-section" aria-labelledby="gr-edit">
      <p className="gr-step">02</p>
      <h2 id="gr-edit">Edit your photos</h2>
      <p className="gr-lead">Add one photo or a whole shoot. Pick a look, or give it a reference to match. Everything happens in your browser.</p>
      <div className="gr-tools">
        <label className="gr-btn">
          <ImagePlus size={16} aria-hidden /> Add photos
          <input type="file" accept="image/*" multiple onChange={add} aria-label="Add photos" hidden />
        </label>
        <label className="gr-btn gr-btn-quiet">
          <Wand2 size={16} aria-hidden /> {ref ? "Change reference" : "Add a reference"}
          <input type="file" accept="image/*" onChange={addRef} aria-label="Add a reference photo" hidden />
        </label>
        {ref && <img className="gr-ref" src={ref.url} alt="Reference photo" />}
        {ref && (
          <label className="gr-strength">Match <input type="range" min={0} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} aria-label="How closely to match the reference" /></label>
        )}
      </div>
      <div className="gr-looks" role="group" aria-label="Look">
        {(Object.keys(LOOK_LABEL) as Look[]).map((l) => {
          const Icon = LOOK_ICON[l];
          return <button key={l} type="button" className={`gr-chip ${look === l ? "on" : ""}`} aria-pressed={look === l} onClick={() => setLook(l)}><Icon size={14} aria-hidden /> {LOOK_LABEL[l]}</button>;
        })}
      </div>
      {photo && edited ? (
        <>
          <div className="gr-compare" data-testid="compare" style={{ ["--split" as string]: `${split}%`, aspectRatio: `${photo.img.naturalWidth} / ${photo.img.naturalHeight}` }}>
            <img src={photo.url} alt={`${photo.name}, before`} />
            <img src={edited} alt={`${photo.name}, after`} className="gr-after" />
            <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Before and after" />
          </div>
          {photos.length > 1 && (
            <ul className="gr-strip" aria-label="Your photos">
              {photos.map((p, i) => (
                <li key={p.id}><button type="button" className={i === active ? "on" : ""} onClick={() => setActive(i)} aria-label={`Show ${p.name}`}><img src={p.url} alt="" /></button></li>
              ))}
            </ul>
          )}
          <div className="gr-tools">
            <button type="button" className="gr-btn" onClick={downloadAll}><Download size={16} aria-hidden /> Save {photos.length === 1 ? "the photo" : `all ${photos.length}`}</button>
            <button type="button" className="gr-btn gr-btn-quiet" onClick={makeVideo} disabled={making}><Film size={16} aria-hidden /> {making ? "Making the video…" : "Make a video"}</button>
          </div>
          {video && <video className="gr-video" src={video} controls playsInline aria-label="Your video" />}
        </>
      ) : (
        <div className="gr-empty">Your photos appear here.</div>
      )}
      <div className="gr-premium">
        <Sparkles size={18} aria-hidden />
        <div>
          <strong>Studio edits with AI: not connected yet.</strong> A true relight from day to night, careful retouching
          judged against your reference, and photos that move as video need an AI provider. TEBOS connects one once Grape
          Studios chooses it. What you see above is a colour grade, a colour match and a slideshow video, made in your browser.
        </div>
      </div>
    </section>
  );
}
