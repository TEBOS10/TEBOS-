// Marketing and PR drafts. TEBOS's staff draft; a platform admin approves;
// a person publishes it on the channel and records where it went live.
// TEBOS never publishes anything itself. The database enforces every step.
import { canEditDraft, canMoveDraft, CONTENT_CHANNELS, isPublishedUrl, type ContentChannel, type ContentStatus } from "@core/content";
import { useState, type FormEvent } from "react";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { createContentDraft, listContentDrafts, updateContentDraft, type ContentDraft } from "../lib/data";
import { ago } from "../lib/format";
import { useSignedIn } from "../lib/session";
import { useStaff } from "../lib/staff";
import { useQuery } from "../lib/useQuery";
import { StaffOnly } from "./PipelinePage";

const CHANNEL_LABEL: Record<ContentChannel, string> = {
  linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", x: "X", tiktok: "TikTok",
  blog: "Blog article", press_release: "Press release", newsletter: "Newsletter",
};
const STATUS: Record<ContentStatus, { label: string; tone: "neutral" | "info" | "good" | "warn" }> = {
  draft: { label: "draft", tone: "neutral" }, in_review: { label: "waiting for approval", tone: "info" },
  approved: { label: "approved: ready to publish", tone: "good" }, rejected: { label: "sent back", tone: "warn" },
  published: { label: "published", tone: "good" }, withdrawn: { label: "withdrawn", tone: "neutral" },
};
const ORDER: ContentStatus[] = ["in_review", "approved", "rejected", "draft", "published", "withdrawn"];

export function MarketingPage() {
  return <StaffOnly title="Marketing">{() => <Drafts />}</StaffOnly>;
}

function Drafts() {
  const { db } = useSignedIn();
  const q = useQuery(() => listContentDrafts(db), []);
  const [writing, setWriting] = useState(false);
  const drafts = q.data ?? [];
  return (
    <div className="stack">
      <PageHeader eyebrow="TEBOS" title="Marketing and PR"
        actions={<button className="btn btn-primary" onClick={() => setWriting(true)}>New draft</button>}>
        Posts, articles, press releases and newsletters. Everything is approved by a platform admin before it goes out, and TEBOS never
        publishes anything itself: whoever publishes it records where it went live.
      </PageHeader>
      {writing && <NewDraft onDone={() => { setWriting(false); q.reload(); }} onCancel={() => setWriting(false)} />}
      {q.error ? <ErrorNote error={q.error} title="Couldn't load the drafts" /> : !q.data ? <Loading /> : drafts.length === 0 ? (
        <Card><Empty>No drafts yet.</Empty></Card>
      ) : (
        ORDER.map((st) => {
          const rows = drafts.filter((d) => d.status === st);
          if (!rows.length) return null;
          return (
            <Card key={st} title={`${STATUS[st].label.replace(/^./, (c) => c.toUpperCase())} · ${rows.length}`}>
              <div className="stack">{rows.map((d) => <DraftCard key={d.id} draft={d} onChanged={q.reload} />)}</div>
            </Card>
          );
        })
      )}
    </div>
  );
}

function NewDraft({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { db } = useSignedIn();
  const [form, setForm] = useState({ channel: "linkedin" as ContentChannel, title: "", body: "" });
  const [error, setError] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createContentDraft(db, form);
      onDone();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <Card title="New draft">
      <form className="form" onSubmit={submit} aria-label="New draft">
        <div className="form-row">
          <Field label="Channel">
            <select className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as ContentChannel })}>
              {CONTENT_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </select>
          </Field>
          <Field label="Title (optional)"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        </div>
        <Field label="Text"><textarea className="input" rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
        <ErrorNote error={error} title="Not saved" />
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-primary" disabled={!form.body.trim()}>Save draft</button>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </Card>
  );
}

function DraftCard({ draft: d, onChanged }: { draft: ContentDraft; onChanged: () => void }) {
  const { db, userId } = useSignedIn();
  const { access, nameOf } = useStaff();
  const me = { userId, isAdmin: !!access?.admin };
  const status = d.status as ContentStatus;
  const mine = d.author_id === userId;
  const [body, setBody] = useState(d.body);
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const may = (to: ContentStatus, extra: { reviewNote?: string; publishedUrl?: string } = {}) => canMoveDraft({ status, authorId: d.author_id }, to, me, extra).ok;
  async function run(patch: Parameters<typeof updateContentDraft>[2]) {
    setBusy(true);
    setError(null);
    try {
      await updateContentDraft(db, d.id, patch);
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const editable = canEditDraft(status) && (mine || me.isAdmin);
  return (
    <section className="card" data-testid="draft" style={{ padding: 14 }}>
      <div className="row" style={{ gap: 8, justifyContent: "space-between" }}>
        <strong>{CHANNEL_LABEL[d.channel as ContentChannel] ?? d.channel}{d.title ? `: ${d.title}` : ""}</strong>
        <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
      </div>
      <p className="list-meta" style={{ margin: "4px 0" }}>By {mine ? "you" : nameOf(d.author_id)} · {ago(d.updated_at)}</p>
      {editable ? (
        <Field label="Text"><textarea className="input" rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      ) : <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{d.body}</p>}
      {d.review_note && <p className="list-meta">Review note: {d.review_note}</p>}
      {d.published_url && <p className="list-meta">Live at <a href={d.published_url} target="_blank" rel="noreferrer noopener">{d.published_url}</a></p>}

      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        {editable && body !== d.body && <button className="btn btn-sm" disabled={busy || !body.trim()} onClick={() => run({ body: body.trim() })}>Save changes</button>}
        {may("in_review") && <button className="btn btn-sm btn-primary" disabled={busy || body !== d.body} onClick={() => run({ status: "in_review" })}>Send for approval</button>}
        {status !== "draft" && may("draft") && <button className="btn btn-sm" disabled={busy} onClick={() => run({ status: "draft" })}>Back to draft</button>}
        {may("withdrawn") && <button className="btn btn-sm" disabled={busy} onClick={() => run({ status: "withdrawn" })}>Withdraw</button>}
      </div>

      {status === "in_review" && me.isAdmin && (
        <div className="stack" style={{ marginTop: 8 }}>
          <Field label="Review note (needed to send it back)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run({ status: "approved", review_note: note.trim() || null })}>Approve</button>
            <button className="btn btn-sm" disabled={busy || !may("rejected", { reviewNote: note })} onClick={() => run({ status: "rejected", review_note: note.trim() })}>Send back</button>
          </div>
        </div>
      )}
      {status === "approved" && (mine || me.isAdmin) && (
        <div className="stack" style={{ marginTop: 8 }}>
          <p className="list-meta" style={{ margin: 0 }}>Publish it yourself on {CHANNEL_LABEL[d.channel as ContentChannel] ?? d.channel}, then record where it went live.</p>
          <Field label="Where it went live (https address)"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field>
          <div><button className="btn btn-sm btn-primary" disabled={busy || !isPublishedUrl(url)} onClick={() => run({ status: "published", published_url: url.trim() })}>Record as published</button></div>
        </div>
      )}
      <ErrorNote error={error} title="Not saved" />
    </section>
  );
}
