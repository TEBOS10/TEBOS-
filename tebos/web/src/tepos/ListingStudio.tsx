// The Listing studio in the agent's office: the founder drops in a listing's photos and facts, and TEPOS draws the
// Pelser-branded advert, the walkthrough shot list and the caption from them. Nothing is published: the founder
// downloads the advert or files it in the office, and posts it themselves. Photos stay on the device unless filed.
import { type Deal } from "@core/agent";
import {
  AD_STATUSES, HIGHLIGHTS_MAX, PROPERTY_KINDS, advertCopy, caption, checkFacts, openingLine, shotList,
  type AdStatus, type AgentCard, type ListingFacts, type PropertyKind,
} from "@core/studio";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ErrorNote } from "../components/ui";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { saveListingFacts, type ListingRow } from "./agentData";
import { FORMATS, canvasBlob, drawAdvert, loadFonts, loadImage, type Format } from "./studioRender";
import { fileDocument, listVault, openDocument } from "./vaultData";

const CARD_KEY = "tepos.studio.card";
const LOGO_KEY = "tepos.studio.logo";
const DEFAULT_CARD: AgentCard = { name: "", title: "Real Estate Professional | Property Value Creation", phone: "", email: "", agencyLine: "" };

// Per-device conveniences only: the founder's card and the chosen logo. Never needed for anything to work.
function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private window or blocked storage: the studio still works, it just forgets
  }
}

export const factsOf = (r: ListingRow): ListingFacts => {
  const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
  return {
    kind: (r.property_kind ?? null) as PropertyKind | null, suburb: r.suburb ?? null, city: r.city ?? null,
    bedrooms: n(r.bedrooms), bathrooms: n(r.bathrooms), offices: n(r.offices), kitchens: n(r.kitchens), parking: n(r.parking),
    floorM2: n(r.floor_m2), erfM2: n(r.erf_m2), highlights: r.highlights ?? [],
  };
};

export function ListingStudio({ listings, onChanged }: { listings: ListingRow[]; onChanged: () => void }) {
  const [listingId, setListingId] = useState<string>("");
  const listing = listings.find((l) => l.id === listingId) ?? null;
  return (
    <section className="pra-card" aria-label="Listing studio" data-testid="studio">
      <div className="pra-head">
        <div>
          <h2>Listing studio</h2>
          <p>Drop in a listing's photos and facts. The studio draws the Pelser advert, the walkthrough shot list and the caption from what you state, nothing else. Nothing is posted: you download or file it, and post it yourself.</p>
        </div>
      </div>
      <label className="pra-field">Listing
        <select value={listingId} onChange={(e) => setListingId(e.target.value)} aria-label="Listing for the studio">
          <option value="">Choose a listing</option>
          {listings.map((l) => <option key={l.id} value={l.id}>{l.ref} {l.label}</option>)}
        </select>
      </label>
      {listings.length === 0 && <p className="pra-empty">Add a listing first.</p>}
      {listing && <Studio key={listing.id} listing={listing} onChanged={onChanged} />}
    </section>
  );
}

function Studio({ listing, onChanged }: { listing: ListingRow; onChanged: () => void }) {
  const org = useOrg();
  const deal = listing.deal as Deal;
  const price = listing.price === null ? null : Number(listing.price);
  const [facts, setFacts] = useState<ListingFacts>(factsOf(listing));
  const [status, setStatus] = useState<AdStatus>(["sold", "let"].includes(listing.stage) ? "closed" : "available");
  const [format, setFormat] = useState<Format>("post");
  const [card, setCard] = useState<AgentCard>(() => readLocal(CARD_KEY, DEFAULT_CARD));
  const [photos, setPhotos] = useState<HTMLImageElement[]>([]);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [logoId, setLogoId] = useState<string>(() => readLocal<{ id: string }>(LOGO_KEY, { id: "" }).id);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const copy = useMemo(() => advertCopy(deal, price, facts, status), [deal, price, facts, status]);
  const vault = useQuery(() => listVault(org.db, org.organisation.id), [org.organisation.id]);
  const logos = (vault.data ?? []).filter((d) => d.folder === "marketing" && d.stored_at && !d.archived_at && d.mime_type.startsWith("image/"));

  useEffect(() => {
    let live = true;
    void loadFonts().then(() => {
      if (live && canvas.current) drawAdvert(canvas.current, { format, copy, card, photos, logo });
    });
    return () => { live = false; };
  }, [format, copy, card, photos, logo]);

  useEffect(() => writeLocal(CARD_KEY, card), [card]);

  // The logo comes from the office files: opening it is logged, like every vault read.
  async function chooseLogo(id: string) {
    setError(null);
    setLogoId(id);
    writeLocal(LOGO_KEY, { id });
    if (!id) return setLogo(null);
    try {
      const url = await openDocument(org.db, id);
      const blob = await (await fetch(url)).blob();
      setLogo(await loadImage(URL.createObjectURL(blob)));
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    if (logoId && logos.some((d) => d.id === logoId) && !logo) void chooseLogo(logoId);
    // only once the office files have loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.data]);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError(null);
    try {
      const imgs = await Promise.all([...files].filter((f) => f.type.startsWith("image/")).slice(0, 4).map((f) => loadImage(URL.createObjectURL(f))));
      setPhotos(imgs);
    } catch (e) {
      setError(e);
    }
  }

  async function saveFacts(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    setNote(null);
    const clean = { ...facts, highlights: facts.highlights.map((h) => h.trim()).filter(Boolean) };
    const check = checkFacts(clean);
    if (!check.ok) return setError(new Error(check.reason));
    setBusy(true);
    try {
      await saveListingFacts(org.db, listing.id, {
        property_kind: clean.kind, suburb: clean.suburb?.trim() || null, city: clean.city?.trim() || null,
        bedrooms: clean.bedrooms, bathrooms: clean.bathrooms, offices: clean.offices, kitchens: clean.kitchens, parking: clean.parking,
        floor_m2: clean.floorM2, erf_m2: clean.erfM2, highlights: clean.highlights,
      });
      setFacts(clean);
      setNote("Facts saved.");
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const fileName = `${listing.ref}-${copy.ribbon.toLowerCase().replace(/\s+/g, "-")}-${format}.png`;
  async function download() {
    if (!canvas.current) return;
    const blob = await canvasBlob(canvas.current);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
  async function fileIt() {
    if (!canvas.current) return;
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const blob = await canvasBlob(canvas.current);
      await fileDocument(org.db, org.organisation.id, new File([blob], fileName, { type: "image/png" }), {
        folder: "marketing", packItem: null, title: `Advert ${listing.ref}: ${copy.ribbon.toLowerCase()}, ${FORMATS[format].label.toLowerCase()}`, note: null,
      });
      setNote("Filed in your office files, under Marketing.");
      void vault.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const num = (k: "bedrooms" | "bathrooms" | "offices" | "kitchens" | "parking" | "floorM2" | "erfM2", label: string) => (
    <label className="pra-field">{label}
      <input type="number" min={0} inputMode="numeric" value={facts[k] ?? ""}
        onChange={(e) => setFacts({ ...facts, [k]: e.target.value === "" ? null : Number(e.target.value) })} />
    </label>
  );
  const shots = shotList(facts);
  const text = caption(deal, price, facts, status, card);
  const copyText = (t: string) => { void navigator.clipboard?.writeText(t); setNote("Copied."); };

  return (
    <div className="studio">
      <form className="pra-fields" onSubmit={saveFacts} aria-label="Listing facts">
        <label className="pra-field">Kind of property
          <select value={facts.kind ?? ""} onChange={(e) => setFacts({ ...facts, kind: (e.target.value || null) as PropertyKind | null })}>
            <option value="">Not stated</option>
            {Object.entries(PROPERTY_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="pra-field">Suburb<input value={facts.suburb ?? ""} onChange={(e) => setFacts({ ...facts, suburb: e.target.value || null })} /></label>
        <label className="pra-field">City<input value={facts.city ?? ""} onChange={(e) => setFacts({ ...facts, city: e.target.value || null })} /></label>
        {num("bedrooms", "Bedrooms")}{num("bathrooms", "Bathrooms")}{num("offices", "Offices")}{num("kitchens", "Kitchens")}{num("parking", "Parking bays")}
        {num("floorM2", "Floor area (m²)")}{num("erfM2", "Erf size (m²)")}
        <label className="pra-field pra-full">Highlights (one per line, up to {HIGHLIGHTS_MAX})
          <textarea rows={3} value={facts.highlights.join("\n")}
            onChange={(e) => setFacts({ ...facts, highlights: e.target.value.split("\n").slice(0, HIGHLIGHTS_MAX) })} />
        </label>
        <div className="pra-actions pra-full"><button className="pra-btn primary" disabled={busy}>Save the facts</button></div>
      </form>

      <div className="pra-fields" aria-label="Advert settings">
        <label className="pra-field pra-full">Photos (up to 4; the first is the main one)
          <input type="file" accept="image/*" multiple onChange={(e) => void addPhotos(e.target.files)} aria-label="Photos" />
        </label>
        <label className="pra-field">Logo
          <select value={logoId} onChange={(e) => void chooseLogo(e.target.value)} aria-label="Logo">
            <option value="">{logos.length ? "Choose from your office files" : "File the logo under Marketing first"}</option>
            {logos.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </label>
        <label className="pra-field">Status
          <select value={status} onChange={(e) => setStatus(e.target.value as AdStatus)} aria-label="Status">
            {Object.entries(AD_STATUSES).map(([k, v]) => <option key={k} value={k}>{k === "closed" ? (deal === "rental" ? "Just let" : v) : k === "available" ? (deal === "rental" ? "To let" : "For sale") : v}</option>)}
          </select>
        </label>
        <label className="pra-field">Size
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)} aria-label="Size">
            {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="pra-field">Your name<input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></label>
        <label className="pra-field">Your title<input value={card.title} onChange={(e) => setCard({ ...card, title: e.target.value })} /></label>
        <label className="pra-field">Phone<input value={card.phone} onChange={(e) => setCard({ ...card, phone: e.target.value })} /></label>
        <label className="pra-field">Email<input value={card.email} onChange={(e) => setCard({ ...card, email: e.target.value })} /></label>
        <label className="pra-field pra-full">What every advert must show (ask your principal)
          <input value={card.agencyLine} onChange={(e) => setCard({ ...card, agencyLine: e.target.value })} placeholder="e.g. the wording your principal gives you" />
        </label>
        <p className="pra-note pra-full">Your name, title and contact details stay on this device only.</p>
      </div>

      <ErrorNote error={error} title="Not done" />
      {note && <p className="pra-text" role="status">{note}</p>}

      <div className="studio-preview">
        <canvas ref={canvas} data-testid="studio-canvas" aria-label="Advert preview" />
      </div>
      <div className="pra-actions">
        <button className="pra-btn primary" onClick={() => void download()}>Download the advert</button>
        <button className="pra-btn" disabled={busy} onClick={() => void fileIt()}>File it in my office</button>
      </div>

      <div className="studio-columns">
        <div>
          <h3>Walkthrough shot list</h3>
          <p className="pra-text"><strong>Opening line:</strong> {openingLine(deal, price, facts)}</p>
          <ol className="studio-shots" data-testid="studio-shots">
            {shots.map((s, i) => <li key={i}><strong>{s.title}</strong> <small className="pra-note">{s.how}</small></li>)}
          </ol>
        </div>
        <div>
          <h3>Caption</h3>
          <pre className="studio-caption" data-testid="studio-caption">{text}</pre>
          <button className="pra-btn" onClick={() => copyText(text)}>Copy the caption</button>
        </div>
      </div>
    </div>
  );
}
