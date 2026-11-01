// Grape Studios' booking site (ADR 0016), stage 1: the work, the categories and their rates, booking a time that is
// really free, and a private page where the customer follows their booking and its schedule. Its own build
// (vite.grape.config.ts); it talks to TEBOS only as the public does.
import { ArrowRight, ArrowUpRight, Camera } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BOOKING_NEXT, BOOKING_STATUS_LABEL, deliveryWindow, deposit, saLocal } from "@core/bookings";
import type { BookingStatus } from "@core/states";
import { money } from "@core/property";
import { Link, matchPath, navigate, RouterProvider, usePath } from "../lib/router";
import { use3d } from "../world/support";
import { Reels } from "./Reels";
import { BEHANCE, BOOKINGS_EMAIL, BRANDS, freeTimes, INSTAGRAM, loadCatalogue, myBooking, requestBooking, type Catalogue, type CatService, type MyBooking } from "./data";

const PHOTOS = ["studio", "on-location", "corporate", "graduation", "property", "events"].map((k) => `/photos/${k}.jpg`);
const longDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const plusDays = (n: number) => { const d = new Date(Date.now() + 2 * 3600_000); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hoursText = (m: number) => (m % 60 === 0 ? `${m / 60} h` : `${(m / 60).toFixed(1)} h`);

export function GrapeApp() {
  return <RouterProvider><Routes /></RouterProvider>;
}

function Routes() {
  const path = usePath();
  const [cat, setCat] = useState<Catalogue | null>(null);
  useEffect(() => { void loadCatalogue().then(setCat); }, []);
  const mine = matchPath("/b/:token", path);
  const book = matchPath("/book/:service", path);
  const reels = path === "/reels";
  return (
    <div className="gs">
      <Nav onDark={!mine && !book && !reels && Boolean(cat)} />
      {reels ? <Reels />
        : mine ? <BookingView token={mine.token!} />
        : !cat ? <p className="gs-wrap gs-muted">Loading…</p>
        : book ? <BookFlow cat={cat} serviceKey={book.service!} />
        : <Home cat={cat} />}
      <footer className="gs-foot gs-wrap">
        <span>Grape Studios · Johannesburg</span>
        <a href={INSTAGRAM} target="_blank" rel="noreferrer noopener"><Camera size={15} aria-hidden /> @grape.studios_</a>
        <a href={BEHANCE} target="_blank" rel="noreferrer noopener">Portfolio on Behance</a>
        <a href={`mailto:${BOOKINGS_EMAIL}`}>{BOOKINGS_EMAIL}</a>
      </footer>
    </div>
  );
}

function Nav({ onDark }: { onDark: boolean }) {
  return (
    <header className={`gs-nav gs-wrap ${onDark ? "" : "gs-nav-light"}`}>
      <Link to="/" className="gs-brand"><img src="/logo.png" alt="" width={30} height={30} /> GRAPE STUDIOS</Link>
      <nav aria-label="Site">
        <a href="/#work">Work</a>
        <a href="/#book" className="gs-pill">Book a shoot</a>
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
function Home({ cat }: { cat: Catalogue }) {
  return (
    <main>
      <Hero />
      <section id="work" className="gs-wrap gs-section" aria-labelledby="gs-work">
        <p className="gs-kicker">Fashion · lifestyle · portraiture · events</p>
        <h2 id="gs-work">The work</h2>
        <div className="gs-tri">{PHOTOS.slice(0, 3).map((p) => <img key={p} src={p} alt="" loading="lazy" />)}</div>
        <div className="gs-tri">{PHOTOS.slice(3).map((p) => <img key={p} src={p} alt="" loading="lazy" />)}</div>
      </section>
      <section id="brands" className="gs-wrap gs-brands" aria-labelledby="gs-brands">
        <p className="gs-kicker" id="gs-brands">Brands we've shot for</p>
        <ul className="gs-brand-list">{BRANDS.map((b) => <li key={b}>{b}</li>)}</ul>
      </section>
      <section id="book" className="gs-wrap gs-section" aria-labelledby="gs-book">
        <p className="gs-kicker">Six ways to work together</p>
        <h2 id="gs-book">Book a shoot</h2>
        {!cat.accepting && (
          <p className="gs-note" data-testid="not-open">Online booking opens soon. Until then, book by email: <a href={`mailto:${BOOKINGS_EMAIL}`}>{BOOKINGS_EMAIL}</a>.</p>
        )}
        <ul className="gs-cats">
          {cat.services.map((s) => (
            <li key={s.key}>
              <Link to={`/book/${s.key}`} className="gs-cat">
                {s.cover && <img src={s.cover} alt="" loading="lazy" />}
                <span className="gs-cat-name">{s.name}</span>
                <span className="gs-cat-from">{s.packages.length ? `From ${money(Math.min(...s.packages.map((p) => p.price_cents)) / 100)}` : "Quoted"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Hero() {
  const host = useRef<HTMLDivElement>(null);
  const [three] = useState(() => use3d() && window.innerWidth >= 700);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!three || !host.current) return;
    let stop: (() => void) | null = null, cancelled = false;
    void import("./hero3d").then(({ mountHero }) => {
      if (cancelled || !host.current) return;
      stop = mountHero(host.current, { onReady: () => setReady(true), onError: () => setFailed(true) });
    });
    return () => { cancelled = true; stop?.(); };
  }, [three]);
  return (
    <section className="gs-hero" data-testid="hero" data-scene={three && !failed ? (ready ? "3d" : "loading") : "still"}>
      {/* the modelled object: live in 3D where the device can, otherwise a still render of the same object */}
      {(!three || failed || !ready) && <img className="gs-hero-still" src="/hero/grape-lens.jpg" alt="" aria-hidden onError={(e) => { e.currentTarget.hidden = true; }} />}
      {three && !failed && <div ref={host} className={`gs-hero-3d ${ready ? "on" : ""}`} aria-hidden />}
      <div className="gs-hero-copy gs-wrap">
        <p className="gs-kicker">Grape Studios · Johannesburg</p>
        <h1>Book the shoot<br />you <em>want.</em></h1>
        <a href="#book" className="gs-btn">Book a shoot <ArrowRight size={16} aria-hidden /></a>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------
function BookFlow({ cat, serviceKey }: { cat: Catalogue; serviceKey: string }) {
  const s = cat.services.find((x) => x.key === serviceKey);
  const [pkg, setPkg] = useState<number | "custom" | null>(s && s.packages.length === 0 ? "custom" : null);
  const [minutes, setMinutes] = useState(120);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [times, setTimes] = useState<string[] | null>(null);
  const [f, setF] = useState({ name: "", email: "", phone: "", brief: "", consent: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => plusDays(i + 1)), []);
  const chosen = s && typeof pkg === "number" ? s.packages[pkg] : undefined;
  const length = chosen ? chosen.minutes : minutes;
  useEffect(() => {
    if (!day || !cat.live) return;
    setTimes(null); setTime(null);
    void freeTimes(day, length).then(setTimes, () => setTimes([]));
  }, [day, length, cat.live]);
  if (!s) return <main className="gs-wrap gs-section"><p>That kind of shoot isn't offered. <Link to="/">See all six</Link>.</p></main>;
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      const r = await requestBooking({ service: s!.id!, package: chosen?.id ?? null, starts: time!, minutes: length, ...f });
      navigate(`/b/${r.token}`);
    } catch (err) {
      setError((err as { message?: string }).message ?? "That didn't go through. Try another time.");
    } finally { setBusy(false); }
  }
  return (
    <main className="gs-wrap gs-section gs-book">
      <Link to="/" className="gs-back">← All shoots</Link>
      <div className="gs-book-head">
        {s.cover && <img src={s.cover} alt="" />}
        <div>
          <p className="gs-kicker">Book</p>
          <h1>{s.name}</h1>
          <p className="gs-muted">{[s.pictures, s.delivery_min ? `images in ${s.delivery_min} to ${s.delivery_max} working days` : null,
            s.at_studio ? "at the studio" : s.travel_min ? `travel R${s.travel_min} to R${s.travel_max} around Johannesburg` : null].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      <Step n="1" title="Choose a rate">
        <div className="gs-pkgs" role="group" aria-label="Rate">
          {s.packages.map((p, i) => (
            <button key={p.label} type="button" className={`gs-pkg ${pkg === i ? "on" : ""}`} aria-pressed={pkg === i} onClick={() => setPkg(i)}>
              <span>{p.label}</span><strong>{money(p.price_cents / 100)}</strong>{p.note && <small>{p.note}</small>}
            </button>
          ))}
          <button type="button" className={`gs-pkg ${pkg === "custom" ? "on" : ""}`} aria-pressed={pkg === "custom"} onClick={() => setPkg("custom")}>
            <span>Custom rate</span><strong>Quoted</strong><small>Tailored to what you need</small>
          </button>
        </div>
        {pkg === "custom" && (
          <label className="gs-field">How long?
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[60, 120, 180, 240, 360, 480].map((m) => <option key={m} value={m}>{hoursText(m)}</option>)}
            </select>
          </label>
        )}
      </Step>

      {pkg !== null && (
        <Step n="2" title="Choose a day and time">
          {!cat.live ? (
            <p className="gs-note" data-testid="not-open">Online booking opens soon. Until then, email <a href={`mailto:${BOOKINGS_EMAIL}?subject=${encodeURIComponent(`Booking: ${s.name}`)}`}>{BOOKINGS_EMAIL}</a> with the day you'd like.</p>
          ) : (
            <>
              <div className="gs-days" role="group" aria-label="Day">
                {days.map((d) => <button key={d} type="button" className={`gs-chip ${day === d ? "on" : ""}`} aria-pressed={day === d} onClick={() => setDay(d)}>{shortDay(d)}</button>)}
              </div>
              {day && (times === null ? <p className="gs-muted">Finding free times…</p> : times.length === 0 ? <p className="gs-muted">Nothing free that day. Try another.</p> : (
                <div className="gs-days" role="group" aria-label="Time">
                  {times.map((t) => <button key={t} type="button" className={`gs-chip ${time === t ? "on" : ""}`} aria-pressed={time === t} onClick={() => setTime(t)}>{saLocal(t).time}</button>)}
                </div>
              ))}
            </>
          )}
        </Step>
      )}

      {cat.live && time && (
        <Step n="3" title="Your details">
          <form className="gs-form" onSubmit={submit} aria-label="Your details">
            <p className="gs-summary" data-testid="summary">
              <strong>{s.name}</strong> · {chosen ? chosen.label : `Custom, ${hoursText(length)}`} · {longDate(saLocal(time).date)} at {saLocal(time).time}
              <br />{chosen
                ? <>{money(chosen.price_cents / 100)}. A {money(deposit(chosen.price_cents).deposit / 100)} deposit (half, non-refundable) holds your date; the rest is paid on the day{s.travel_min ? ", plus travel" : ""}.</>
                : "Grape Studios replies with a quote. Your date is held once the deposit is paid."}
            </p>
            <label className="gs-field">Your name<input required minLength={2} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
            <label className="gs-field">Email<input required type="email" maxLength={120} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
            <label className="gs-field">Phone (optional)<input type="tel" pattern="\+?[0-9 ]{9,16}" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></label>
            <label className="gs-field">{pkg === "custom" ? "What do you need?" : "Anything we should know? (optional)"}
              <textarea rows={3} maxLength={1000} required={pkg === "custom"} minLength={pkg === "custom" ? 10 : undefined} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} />
            </label>
            <label className="gs-check"><input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
              I agree to the 50% non-refundable deposit, and to Grape Studios using my details for this booking only.</label>
            {error && <p className="gs-error" role="alert">{error}</p>}
            <button className="gs-btn" disabled={busy}>{busy ? "Sending…" : chosen ? "Request this shoot" : "Ask for a quote"}</button>
          </form>
        </Step>
      )}
    </main>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return <section className="gs-step"><p className="gs-step-n">0{n}</p><h2>{title}</h2>{children}</section>;
}

// ---------------------------------------------------------------------------
// The customer's booking and its schedule
// ---------------------------------------------------------------------------
function BookingView({ token }: { token: string }) {
  const [b, setB] = useState<MyBooking | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => { void myBooking(token).then(setB, () => setB(null)); }, [token]);
  if (b === undefined) return <p className="gs-wrap gs-muted">Loading your booking…</p>;
  if (b === null) return <main className="gs-wrap gs-section"><h1>We couldn't find that booking</h1><p>Check the link, or email <a href={`mailto:${BOOKINGS_EMAIL}`}>{BOOKINGS_EMAIL}</a>.</p></main>;
  const start = saLocal(b.starts_at), end = saLocal(b.ends_at);
  const status = b.status as BookingStatus;
  const delivery = b.delivery_min && b.delivery_max ? deliveryWindow(b.starts_at, b.delivery_min, b.delivery_max) : null;
  const steps: Array<{ label: string; detail: string; done: boolean }> = [
    { label: "Requested", detail: b.ref, done: true },
    { label: "Deposit", detail: b.deposit_cents ? `${money(b.deposit_cents / 100)}${b.deposit_paid ? ", received" : ", due to hold your date"}` : "Quote first", done: b.deposit_paid },
    { label: "The shoot", detail: `${longDate(start.date)}, ${start.time} to ${end.time}`, done: ["completed", "delivered"].includes(status) },
    { label: "Your images", detail: b.delivered_note ?? (delivery ? `between ${shortDay(delivery.from)} and ${shortDay(delivery.to)}` : "after the shoot"), done: status === "delivered" },
  ];
  return (
    <main className="gs-wrap gs-section gs-mine" data-testid="my-booking">
      <p className="gs-kicker">Your booking · {b.ref}</p>
      <h1>{b.service}{b.package ? ` · ${b.package}` : ""}</h1>
      <p className="gs-status" data-testid="status"><span className={`gs-dot gs-dot-${status}`} /> {BOOKING_STATUS_LABEL[status] ?? b.status}. {BOOKING_NEXT[status]}</p>
      {b.status_note && <p className="gs-note">{b.status_note}</p>}
      <ol className="gs-timeline" aria-label="Schedule">
        {steps.map((s) => <li key={s.label} className={s.done ? "done" : ""}><strong>{s.label}</strong><span>{s.detail}</span></li>)}
      </ol>
      {b.deposit_instructions && !b.deposit_paid && (
        <section className="gs-card" aria-label="Paying the deposit">
          <h2>Paying the deposit</h2>
          <p>{b.deposit_instructions}</p>
          <p className="gs-muted">Use {b.ref} as the reference. Your date is held once it arrives.</p>
        </section>
      )}
      {b.balance_due && b.price_cents && b.deposit_cents && (
        <section className="gs-card" aria-label="The balance">
          <h2>The balance</h2>
          <p>{money((b.price_cents - b.deposit_cents) / 100)} is due before your gallery is released. Pay it the same way as the deposit, with {b.ref} as the reference.</p>
        </section>
      )}
      {b.gallery_url && /^https:\/\//.test(b.gallery_url) && (
        <section className="gs-card" aria-label="Your gallery">
          <h2>Your gallery</h2>
          <p><a className="gs-btn" href={b.gallery_url} target="_blank" rel="noreferrer noopener">Open your gallery <ArrowUpRight size={15} aria-hidden /></a></p>
        </section>
      )}
      <Week busy={b.week_busy} day={start.date} />
      <div className="gs-row">
        <button type="button" className="gs-btn gs-btn-quiet" onClick={() => { void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true)); }}>
          {copied ? "Link copied" : "Copy this page's link"}
        </button>
        {b.contact_email && <a className="gs-btn gs-btn-quiet" href={`mailto:${b.contact_email}?subject=${encodeURIComponent(b.ref)}`}>Email Grape Studios <ArrowUpRight size={15} aria-hidden /></a>}
      </div>
      <p className="gs-muted">Keep this link: it's the only way to see your booking here. Anyone with it can see the booking, but not your details.</p>
    </main>
  );
}

/** The studio's week around the booking: when it's busy, and which slot is yours. Nobody else's details. */
function Week({ busy, day }: { busy: MyBooking["week_busy"]; day: string }) {
  const monday = (() => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1)); return d; })();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  return (
    <section className="gs-week" aria-label="The studio's week">
      <h2>The studio's week</h2>
      <div className="gs-week-grid">
        {days.map((d) => {
          const mine = busy.filter((x) => saLocal(x.starts_at).date === d);
          return (
            <div key={d} className={`gs-week-day ${d === day ? "is-yours" : ""}`}>
              <span className="gs-week-name">{shortDay(d)}</span>
              {mine.length === 0 ? <span className="gs-week-free">Free</span> : mine.map((x) => (
                <span key={x.starts_at} className={`gs-week-slot ${x.yours ? "yours" : ""}`}>{saLocal(x.starts_at).time}–{saLocal(x.ends_at).time}{x.yours ? " · you" : " · booked"}</span>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export type { CatService };
