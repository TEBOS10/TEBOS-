// Bookings: the team's schedule (ADR 0016). The week at a glance; the requests to answer; one booking at a time to
// confirm (once the deposit has arrived), decline, cancel, mark as shot and delivered. The database holds every rule;
// a viewer sees when and what, never who.
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { BOOKING_STATUS_LABEL, crewBlocker, deposit, saLocal, shootChecklist, type CrewRecord } from "@core/bookings";
import type { BookingStatus } from "@core/states";
import { money } from "@core/property";
import { saToday } from "@core/week";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { addTimeOff, assignedTo, booking, crew, hours as loadHours, openRequests, schedule, setHours, updateBooking, type Booking, type ScheduleItem } from "../lib/bookingsData";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const DAY_START = 7, DAY_END = 20, PX = 44; // the grid shows 07:00 to 20:00, 44px an hour
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TONE: Record<string, "good" | "warn" | "bad" | "info" | "neutral"> = {
  requested: "warn", confirmed: "good", completed: "info", delivered: "neutral", cancelled: "bad", no_show: "bad", time_off: "neutral",
};

/** Monday of the week holding `day` (YYYY-MM-DD). */
function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (wd - 1));
  return d.toISOString().slice(0, 10);
}
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const shortDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });
const when = (iso: string) => { const l = saLocal(iso); return `${shortDate(l.date)} ${l.time}`; };

export function BookingsPage() {
  const org = useOrg();
  const team = org.role === "org_admin" || org.role === "operator";
  const [week, setWeek] = useState(() => mondayOf(saToday()));
  const [open, setOpen] = useState<string | null>(null);
  const items = useQuery(() => schedule(org.db, org.organisation.id, week, 7), [org.organisation.id, week]);
  const requests = useQuery(() => (team ? openRequests(org.db, org.organisation.id) : Promise.resolve([])), [org.organisation.id, team]);
  const reload = () => { items.reload(); requests.reload(); };
  return (
    <div className="stack bk-page">
      <PageHeader eyebrow={org.organisation.name} title="Bookings"
        actions={
          <span className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={16} aria-hidden /></button>
            <button className="btn btn-sm" onClick={() => setWeek(mondayOf(saToday()))}>This week</button>
            <button className="btn btn-sm" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={16} aria-hidden /></button>
          </span>
        }>
        The week at a glance. {team ? "Confirm a booking once its deposit has arrived." : "Only the team sees who booked."}
      </PageHeader>

      {team && (
        <Card title="To answer" subtitle={requests.data?.length ? undefined : "No requests waiting."}>
          {requests.error ? <ErrorNote error={requests.error} title="Couldn't load requests" /> : !requests.data ? <Loading /> : requests.data.length > 0 && (
            <ul className="list web-list" data-testid="requests">
              {requests.data.map((b) => (
                <li key={b.id}>
                  <button type="button" className="row-button" onClick={() => setOpen(b.id)}>
                    <strong>{b.customer_name}</strong> · {when(b.starts_at)} · {b.price_cents ? money(b.price_cents / 100) : "custom rate"} <span className="muted">{b.ref}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {items.error ? <ErrorNote error={items.error} title="Couldn't load the schedule" /> : !items.data ? <Loading /> : (
        <WeekGrid week={week} items={items.data} onOpen={team ? setOpen : undefined} />
      )}

      {open && <BookingPanel id={open} onClose={() => setOpen(null)} onChanged={reload} />}
      {team && <MyShoots onOpen={setOpen} />}
      {team && <TimeOffCard onDone={reload} />}
      {org.role === "org_admin" && <HoursCard />}
    </div>
  );
}

function WeekGrid({ week, items, onOpen }: { week: string; items: ScheduleItem[]; onOpen?: (id: string) => void }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const today = saToday();
  return (
    <div className="bk-week" data-testid="week">
      <div className="bk-hours" aria-hidden>
        {Array.from({ length: DAY_END - DAY_START }, (_, i) => <span key={i} style={{ top: i * PX }}>{String(DAY_START + i).padStart(2, "0")}:00</span>)}
      </div>
      {days.map((day, i) => {
        const mine = items.filter((it) => saLocal(it.starts_at).date === day);
        return (
          <section key={day} className={`bk-day ${day === today ? "today" : ""}`} aria-label={`${WEEKDAYS[i]} ${shortDate(day)}`}>
            <h3>{WEEKDAYS[i]} <span>{shortDate(day)}</span></h3>
            <div className="bk-col" style={{ height: (DAY_END - DAY_START) * PX }}>
              {mine.map((it) => {
                const s = saLocal(it.starts_at), e = saLocal(it.ends_at);
                const top = Math.max(0, (Number(s.time.slice(0, 2)) + Number(s.time.slice(3)) / 60 - DAY_START) * PX);
                const endH = e.date !== day ? DAY_END : Number(e.time.slice(0, 2)) + Number(e.time.slice(3)) / 60;
                const height = Math.max(22, (Math.min(endH, DAY_END) - DAY_START) * PX - top);
                const body = (
                  <>
                    <strong>{it.kind === "time_off" ? "Closed" : it.service}</strong>
                    <span>{s.time}–{e.date !== day ? "…" : e.time}{it.package ? ` · ${it.package}` : ""}</span>
                    {it.customer_name && <span>{it.customer_name}</span>}
                  </>
                );
                return onOpen && it.kind === "booking"
                  ? <button key={it.id} type="button" className={`bk-item bk-${it.status}`} style={{ top, height }} onClick={() => onOpen(it.id)} data-testid="slot">{body}</button>
                  : <div key={it.id} className={`bk-item bk-${it.status}`} style={{ top, height }} data-testid="slot">{body}</div>;
              })}
            </div>
            {mine.length === 0 && <p className="bk-free">Free</p>}
          </section>
        );
      })}
    </div>
  );
}

function BookingPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const org = useOrg();
  const q = useQuery(() => booking(org.db, id), [id]);
  if (q.error) return <ErrorNote error={q.error} title="Couldn't open this booking" />;
  if (!q.data) return <Loading />;
  const b = q.data;
  const done = () => { q.reload(); onChanged(); };
  return (
    <Card title={`${b.ref} · ${b.customer_name}`} actions={<button className="btn btn-sm" onClick={onClose}>Close</button>}>
      <div className="stack" style={{ gap: 12 }} data-testid="booking-panel">
        <p><Badge tone={TONE[b.status] ?? "neutral"}>{BOOKING_STATUS_LABEL[b.status as BookingStatus] ?? b.status}</Badge> {when(b.starts_at)} to {saLocal(b.ends_at).time}</p>
        <p className="muted">{b.customer_email}{b.customer_phone ? ` · ${b.customer_phone}` : ""}</p>
        {b.brief && <p>“{b.brief}”</p>}
        <p>{b.price_cents ? <>{money(b.price_cents / 100)} · deposit {money(deposit(b.price_cents).deposit / 100)}{b.deposit_ref ? ` received (${b.deposit_ref})` : " not yet received"}</> : "Custom rate: quote a price first."}</p>
        <Actions b={b} onDone={done} />
      </div>
    </Card>
  );
}

function Actions({ b, onDone }: { b: Booking; onDone: () => void }) {
  const org = useOrg();
  const team = useQuery(() => crew(org.db, org.organisation.id), [org.organisation.id]);
  const [f, setF] = useState({ price: "", ref: "", note: "", delivered: "", assignee: b.assignee_id ?? "", releases: "", balance: "", gallery: "" });
  const [error, setError] = useState<unknown>(null);
  async function run(e: FormEvent | React.MouseEvent, patch: Parameters<typeof updateBooking>[2]) {
    e.preventDefault(); setError(null);
    try { await updateBooking(org.db, b.id, patch); onDone(); } catch (err) { setError(err); }
  }
  const record = b as Booking & CrewRecord;
  const status = b.status as BookingStatus;
  const shotOver = new Date(b.ends_at) <= new Date();
  const owed = (b.price_cents ?? 0) - (b.deposit_cents ?? 0) > 0;
  const note = <Field label="Why (the customer sees this if it's declined or cancelled)"><input className="input" required minLength={5} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>;
  const crewName = (id: string | null) => team.data?.find((m) => m.user_id === id)?.display_name ?? "Someone on the team";
  return (
    <div className="stack" style={{ gap: 14 }}>
      {(status === "requested" || status === "confirmed") && (
        <form className="form" aria-label="Assign the photographer" onSubmit={(e) => run(e, { assignee_id: f.assignee || null })}>
          <Field label="Photographer" hint="Anyone on the team can shoot; the owner doesn't have to.">
            <select className="input" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}>
              <option value="">Not assigned</option>
              {(team.data ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </select>
          </Field>
          <button className="btn" disabled={f.assignee === (b.assignee_id ?? "")}>Assign</button>
        </form>
      )}
      {status !== "requested" && b.assignee_id && <p className="muted" data-testid="assignee">Shot by {crewName(b.assignee_id)}</p>}
      {status === "requested" && !b.package_id && (
        <form className="form" aria-label="Quote a price" onSubmit={(e) => run(e, { price_cents: Math.round(Number(f.price) * 100) })}>
          <Field label="Quote (rand)"><input className="input" type="number" min="1" step="1" required value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <button className="btn">Save the quote</button>
        </form>
      )}
      {status === "requested" && (
        <form className="form" aria-label="Confirm" onSubmit={(e) => run(e, { status: "confirmed", deposit_ref: f.ref.trim(), status_note: `Deposit received: ${f.ref.trim()}.` })}>
          <Field label="Deposit received: its reference" hint="From your bank statement or payment app. TEBOS never sees the account."><input className="input" required minLength={4} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
          {!b.assignee_id && <p className="muted">Assign the photographer first.</p>}
          <button className="btn btn-primary" disabled={!b.price_cents || !b.assignee_id}>Confirm the booking</button>
        </form>
      )}
      {status !== "requested" && status !== "declined" && status !== "cancelled" && status !== "no_show" && (
        <ul className="bk-check" aria-label="Shoot checklist">
          {shootChecklist(record).map((x) => <li key={x.key} className={x.done ? "done" : ""}>{x.done ? "✓" : "○"} {x.label}</li>)}
        </ul>
      )}
      {status === "confirmed" && !b.call_sheet_at && (
        <button className="btn" onClick={(e) => run(e, { call_sheet_at: new Date().toISOString() })}>Call sheet sent</button>
      )}
      {status === "confirmed" && shotOver && (
        <div className="stack" style={{ gap: 10 }}>
          {!b.releases_note && (
            <form className="form" aria-label="Record the releases" onSubmit={(e) => run(e, { releases_note: f.releases.trim() })}>
              <Field label="Releases" hint="Who signed, or why none were needed (e.g. a property shoot)."><input className="input" required minLength={5} maxLength={300} value={f.releases} onChange={(e) => setF({ ...f, releases: e.target.value })} /></Field>
              <button className="btn">Save</button>
            </form>
          )}
          {!b.backed_up_at && <button className="btn" onClick={(e) => run(e, { backed_up_at: new Date().toISOString() })}>Files backed up</button>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={Boolean(crewBlocker(record, "completed"))} onClick={(e) => run(e, { status: "completed", status_note: "Shot as booked." })}>Mark as shot</button>
            <button className="btn" onClick={(e) => run(e, { status: "no_show", status_note: "The customer didn't arrive." })}>No-show</button>
          </div>
          {crewBlocker(record, "completed") && <p className="muted">{crewBlocker(record, "completed")}.</p>}
        </div>
      )}
      {status === "completed" && owed && !b.balance_ref && (
        <form className="form" aria-label="Record the balance" onSubmit={(e) => run(e, { balance_ref: f.balance.trim() })}>
          <Field label={`Balance received (${money(((b.price_cents ?? 0) - (b.deposit_cents ?? 0)) / 100)}): its reference`}><input className="input" required minLength={4} value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} /></Field>
          <button className="btn">Record the balance</button>
        </form>
      )}
      {status === "completed" && !b.gallery_url && (
        <form className="form" aria-label="Add the gallery" onSubmit={(e) => run(e, { gallery_url: f.gallery.trim() })}>
          <Field label="Gallery link" hint="The customer sees it on their booking page once delivered."><input className="input" type="url" required pattern="https://.+" value={f.gallery} onChange={(e) => setF({ ...f, gallery: e.target.value })} placeholder="https://" /></Field>
          <button className="btn">Save the link</button>
        </form>
      )}
      {status === "completed" && (
        <form className="form" aria-label="Delivered" onSubmit={(e) => run(e, { status: "delivered", delivered_note: f.delivered.trim(), status_note: "Images delivered." })}>
          <Field label="How the images were sent"><input className="input" required minLength={5} value={f.delivered} onChange={(e) => setF({ ...f, delivered: e.target.value })} placeholder="e.g. Gallery link by email, 48 images" /></Field>
          {crewBlocker(record, "delivered") && <p className="muted">{crewBlocker(record, "delivered")}.</p>}
          <button className="btn btn-primary" disabled={Boolean(crewBlocker(record, "delivered"))}>Mark as delivered</button>
        </form>
      )}
      <ErrorNote error={error} title="Not saved" />
    </div>
  );
}

/** The signed-in team member's own shoots, soonest first, so a photographer sees their week without asking. */
function MyShoots({ onOpen }: { onOpen: (id: string) => void }) {
  const org = useOrg();
  const q = useQuery(() => assignedTo(org.db, org.organisation.id, org.userId), [org.organisation.id, org.userId]);
  if (!q.data || q.data.length === 0) return null;
  return (
    <Card title="My shoots" subtitle="Confirmed and shot bookings assigned to you.">
      <ul className="bk-list" data-testid="my-shoots">
        {q.data.map((b) => (
          <li key={b.id}><button className="btn btn-ghost" onClick={() => onOpen(b.id)}>{when(b.starts_at)} · {b.ref} · {b.customer_name}</button>
            <span className="muted"> {shootChecklist(b as Booking & CrewRecord).filter((x) => !x.done).length} to do</span></li>
        ))}
      </ul>
    </Card>
  );
}

function TimeOffCard({ onDone }: { onDone: () => void }) {
  const org = useOrg();
  const [f, setF] = useState({ day: "", from: "08:00", to: "18:00", reason: "" });
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const iso = (day: string, t: string) => new Date(`${day}T${t}:00+02:00`).toISOString();
  return (
    <Card title="Close the studio" subtitle="Blocks a time so nobody can book it.">
      <form className="form" aria-label="Time off" onSubmit={async (e) => {
        e.preventDefault(); setError(null); setSaved(false);
        try { await addTimeOff(org.db, org.organisation.id, iso(f.day, f.from), iso(f.day, f.to), f.reason); setSaved(true); onDone(); } catch (err) { setError(err); }
      }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Field label="Day"><input className="input" type="date" required value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
          <Field label="From"><input className="input" type="time" required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="time" required value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        </div>
        <Field label="Why (optional, only the team sees it)"><input className="input" maxLength={120} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <ErrorNote error={error} title="Not saved" />
        {saved && <p role="status">Closed.</p>}
        <button className="btn">Close this time</button>
      </form>
    </Card>
  );
}

function HoursCard() {
  const org = useOrg();
  const q = useQuery(() => loadHours(org.db, org.organisation.id), [org.organisation.id]);
  const [error, setError] = useState<unknown>(null);
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load working hours" />;
  if (!q.data) return <Loading />;
  return (
    <Card title={<span className="row" style={{ gap: 8 }}><CalendarDays size={16} aria-hidden /> Working hours</span>} subtitle="Bookings can only be made inside these.">
      <ul className="list web-list" data-testid="hours">
        {WEEKDAYS.map((name, i) => {
          const h = q.data!.find((x) => x.weekday === i + 1);
          return (
            <li key={name} className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ width: 40 }}>{name}</strong>
              {h ? <span>{h.opens.slice(0, 5)}–{h.closes.slice(0, 5)}</span> : <span className="muted">Closed</span>}
              <form className="row" style={{ gap: 6 }} aria-label={`Hours on ${name}`} onSubmit={async (e) => {
                e.preventDefault(); setError(null);
                const fd = new FormData(e.currentTarget);
                try { await setHours(org.db, org.organisation.id, i + 1, String(fd.get("opens")), fd.get("closed") ? null : String(fd.get("closes"))); q.reload(); } catch (err) { setError(err); }
              }}>
                <input className="input" type="time" name="opens" defaultValue={h?.opens.slice(0, 5) ?? "08:00"} aria-label="Opens" />
                <input className="input" type="time" name="closes" defaultValue={h?.closes.slice(0, 5) ?? "18:00"} aria-label="Closes" />
                <label className="row" style={{ gap: 4 }}><input type="checkbox" name="closed" defaultChecked={!h} /> Closed</label>
                <button className="btn btn-sm">Save</button>
              </form>
            </li>
          );
        })}
      </ul>
      <ErrorNote error={error} title="Not saved" />
    </Card>
  );
}
