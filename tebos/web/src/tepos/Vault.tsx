// The private vault in the agent's office (ROADMAP priority 5): the founder's own papers, filed by folder, stored
// as they are and never changed. Each keeps its SHA-256 fingerprint. Opening one is logged first, and its link
// lasts one minute. Lives in the private organisation, opened only after two-step sign-in.
import { AGENCY_PACK, VAULT_FOLDERS, checkVaultDocument, packProgress, type VaultFolder } from "@core/vault";
import { useMemo, useState, type FormEvent } from "react";
import { ErrorNote, Loading } from "../components/ui";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { fileDocument, listVault, listVaultReads, openDocument, sendFile, updateFiling, type VaultDocumentRow } from "./vaultData";

const PACK_TITLE = Object.fromEntries(AGENCY_PACK.map((p) => [p.key, p.title]));
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const when = (iso: string) => iso.slice(0, 16).replace("T", " ");

export function Vault() {
  const org = useOrg();
  const orgId = org.organisation.id;
  const q = useQuery(() => Promise.all([listVault(org.db, orgId), listVaultReads(org.db, orgId)]), [orgId]);
  const [filing, setFiling] = useState<{ packItem: string | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const docs = q.data?.[0] ?? [];
  const reads = q.data?.[1] ?? [];
  const progress = packProgress(docs.map((d) => ({ folder: d.folder, packItem: d.pack_item, storedAt: d.stored_at, archivedAt: d.archived_at })));
  const titles = Object.fromEntries(docs.map((d) => [d.id, d.title]));
  const folders = useMemo(() => {
    const shown = docs.filter((d) => showArchived || !d.archived_at);
    return (Object.keys(VAULT_FOLDERS) as VaultFolder[])
      .map((f) => ({ folder: f, docs: shown.filter((d) => d.folder === f) }))
      .filter((g) => g.docs.length > 0);
  }, [docs, showArchived]);

  async function open(d: VaultDocumentRow) {
    setError(null);
    // Opened before the wait, so the browser doesn't block it as a pop-up.
    const tab = window.open("about:blank", "_blank");
    try {
      const url = await openDocument(org.db, d.id);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
      q.reload();
    } catch (e) {
      tab?.close();
      setError(e);
    }
  }

  return (
    <section className="pra-card" aria-label="Office files" data-testid="vault">
      <div className="pra-head">
        <div>
          <h2>Your office files</h2>
          <p>Stored as they are and never changed. Each keeps a fingerprint, so a copy can be checked against it. Opening a file is logged, and its link lasts one minute.</p>
        </div>
        <button className="pra-btn" onClick={() => setFiling({ packItem: null })}>File a document</button>
      </div>
      {q.loading && !q.data && <Loading />}
      <ErrorNote error={q.error ?? error} title="The vault didn't load or open" />
      {filing && <FileForm packItem={filing.packItem} onDone={() => { setFiling(null); q.reload(); }} onCancel={() => setFiling(null)} />}
      {q.data && (
        <>
          <p className="pra-text" data-testid="vault-pack"><strong>{progress.filed} of {progress.total}</strong> of the agency's papers filed.</p>
          {progress.missing.length > 0 && (
            <ul className="pra-list" aria-label="Still to file">
              {progress.missing.map((p) => (
                <li key={p.key}>
                  {p.title} <small className="pra-note">· {VAULT_FOLDERS[p.folder]}</small>{" "}
                  <button className="pra-btn" aria-label={`File ${p.title}`} onClick={() => setFiling({ packItem: p.key })}>File it</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {folders.map((g) => (
        <div key={g.folder} data-testid={`vault-folder-${g.folder}`}>
          <h3>{VAULT_FOLDERS[g.folder]}</h3>
          <div className="pra-table-wrap">
            <table className="pra-table">
              <tbody>{g.docs.map((d) => <DocRow key={d.id} doc={d} onOpen={() => void open(d)} onChanged={q.reload} />)}</tbody>
            </table>
          </div>
        </div>
      ))}
      {docs.some((d) => d.archived_at) && (
        <div className="pra-actions"><button className="pra-btn" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide archived" : "Show archived"}</button></div>
      )}
      {reads.length > 0 && (
        <details>
          <summary>Recent openings</summary>
          <ul className="pra-list" data-testid="vault-reads">
            {reads.map((r) => <li key={r.id}>{titles[r.document_id] ?? "A document"} <small className="pra-note">· {when(r.opened_at)}</small></li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

function DocRow({ doc, onOpen, onChanged }: { doc: VaultDocumentRow; onOpen: () => void; onChanged: () => void }) {
  const org = useOrg();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function run(f: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await f();
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <tr>
      <td>
        {doc.title}{doc.archived_at && <> <span className="pra-tag">archived</span></>}
        <br /><small className="pra-note" title={`SHA-256 ${doc.sha256}`}>{doc.file_name} · {size(doc.size_bytes)} · fingerprint {doc.sha256.slice(0, 12)}</small>
        <ErrorNote error={error} title="Not done" />
      </td>
      <td>
        {doc.stored_at
          ? <small className="pra-note">stored {when(doc.stored_at)}</small>
          : <span className="pra-tag amber">upload not finished</span>}
      </td>
      <td>
        {doc.stored_at
          ? <button className="pra-btn primary" aria-label={`Open ${doc.title}`} onClick={onOpen}>Open</button>
          : (
            <label className="pra-btn">
              Send the file again
              <input type="file" hidden accept={doc.mime_type} disabled={busy}
                onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void run(() => sendFile(org.db, doc, f)); }} />
            </label>
          )}
        {" "}
        <button className="pra-btn" disabled={busy} aria-label={`${doc.archived_at ? "Restore" : "Archive"} ${doc.title}`}
          onClick={() => void run(() => updateFiling(org.db, doc.id, { archived: !doc.archived_at }))}>{doc.archived_at ? "Restore" : "Archive"}</button>
      </td>
    </tr>
  );
}

function FileForm({ packItem, onDone, onCancel }: { packItem: string | null; onDone: () => void; onCancel: () => void }) {
  const org = useOrg();
  const preset = AGENCY_PACK.find((p) => p.key === packItem);
  const [file, setFile] = useState<File | null>(null);
  const [pack, setPack] = useState(packItem ?? "");
  const [folder, setFolder] = useState<string>(preset?.folder ?? "deals");
  const [title, setTitle] = useState(preset?.title ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  function choosePack(key: string) {
    setPack(key);
    const p = AGENCY_PACK.find((x) => x.key === key);
    if (p) {
      setFolder(p.folder);
      setTitle(p.title);
    }
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!file) {
      setError(new Error("Choose the file."));
      return;
    }
    const filing = { folder, packItem: pack || null, title: title.trim(), note: note.trim() || null };
    const check = checkVaultDocument({ ...filing, fileName: file.name, mimeType: file.type, sizeBytes: file.size });
    if (!check.ok) {
      setError(new Error(check.reason));
      return;
    }
    setBusy(true);
    try {
      await fileDocument(org.db, org.organisation.id, file, filing);
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pra-fields" onSubmit={save} aria-label="File a document">
      <label className="pra-field pra-full">The file (PDF or photo, up to 20 MB)
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
      </label>
      <label className="pra-field">One of the agency's papers?
        <select value={pack} onChange={(ev) => choosePack(ev.target.value)}>
          <option value="">No, something else</option>
          {AGENCY_PACK.map((p) => <option key={p.key} value={p.key}>{PACK_TITLE[p.key]}</option>)}
        </select>
      </label>
      <label className="pra-field">Folder
        <select value={folder} onChange={(ev) => setFolder(ev.target.value)}>
          {Object.entries(VAULT_FOLDERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="pra-field pra-full">Title<input value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="e.g. Signed mandate, L-001" /></label>
      <label className="pra-field pra-full">Note<input value={note} onChange={(ev) => setNote(ev.target.value)} /></label>
      <div className="pra-full"><ErrorNote error={error} title="Not filed" /></div>
      <div className="pra-actions pra-full">
        <button className="pra-btn primary" disabled={busy}>{busy ? "Filing…" : "File it"}</button>
        <button type="button" className="pra-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
