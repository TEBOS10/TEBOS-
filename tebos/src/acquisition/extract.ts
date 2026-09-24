// Deterministic extraction of observed facts from a public page (dossier §13).
//
// Every item is something TEBOS actually saw, with the excerpt that shows it
// and where on the page it was. Absence is never turned into a fact: if no
// contact form is found, nothing is recorded — interpreting gaps is the
// intelligence layer's job, with its own confidence.
//
// This is a pragmatic tag scanner, not a full HTML parser; it is tolerant of
// malformed markup and caps everything it keeps.

export interface ExtractedFact {
  kind: "title" | "meta_description" | "heading" | "email" | "phone" | "whatsapp" | "form" | "social_link" | "page_text";
  fact: string;
  excerpt: string;
  contentLocation: string;
  structuredValue?: Record<string, unknown>;
}

export interface Extraction {
  facts: ExtractedFact[];
  links: string[];
  wordCount: number;
  /** 0..1 — how much usable structure/text was found. */
  quality: number;
}

const MAX_EXCERPT = 300;
const MAX_TEXT_EXCERPT = 1000;
const MAX_ITEMS_PER_KIND = 5;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const cap = (s: string, n = MAX_EXCERPT) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function stripNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ");
}

const SOCIAL = /(?:^|\.)(facebook|instagram|linkedin|twitter|x|tiktok|youtube)\.com$/i;

export function extractHtml(html: string, pageUrl: string): Extraction {
  const doc = stripNonContent(html);
  const facts: ExtractedFact[] = [];
  const push = (f: ExtractedFact) => {
    if (facts.filter((x) => x.kind === f.kind).length < MAX_ITEMS_PER_KIND) facts.push(f);
  };

  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(doc);
  if (title && clean(title[1]!)) {
    const text = clean(title[1]!);
    push({ kind: "title", fact: `Page title: ${cap(text, 200)}`, excerpt: cap(title[0]), contentLocation: "head > title" });
  }

  for (const m of doc.matchAll(/<meta\b[^>]*>/gi)) {
    const name = (attr(m[0], "name") ?? attr(m[0], "property") ?? "").toLowerCase();
    const content = attr(m[0], "content");
    if ((name === "description" || name === "og:description") && content?.trim()) {
      push({
        kind: "meta_description",
        fact: `Meta description: ${cap(content.trim(), 250)}`,
        excerpt: cap(m[0]),
        contentLocation: `head > meta[${name === "description" ? "name" : "property"}="${name}"]`,
      });
      break;
    }
  }

  for (const m of doc.matchAll(/<(h1|h2)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const text = clean(m[2]!);
    if (text) push({ kind: "heading", fact: `${m[1]!.toUpperCase()} heading: ${cap(text, 200)}`, excerpt: cap(m[0]), contentLocation: m[1]!.toLowerCase() });
  }

  const links: string[] = [];
  const seenContacts = new Set<string>();
  for (const m of doc.matchAll(/<a\b[^>]*>[\s\S]*?<\/a\s*>|<a\b[^>]*\/?>/gi)) {
    const href = attr(m[0], "href")?.trim();
    if (!href) continue;
    const lower = href.toLowerCase();
    if (lower.startsWith("mailto:")) {
      const email = decodeURIComponent(href.slice(7).split("?")[0]!).trim();
      if (email && !seenContacts.has(`e:${email}`)) {
        seenContacts.add(`e:${email}`);
        push({ kind: "email", fact: `Email address published: ${email}`, excerpt: cap(m[0]), contentLocation: 'a[href^="mailto:"]', structuredValue: { email } });
      }
      continue;
    }
    if (lower.startsWith("tel:")) {
      const phone = decodeURIComponent(href.slice(4)).replace(/[^\d+]/g, "");
      if (phone && !seenContacts.has(`t:${phone}`)) {
        seenContacts.add(`t:${phone}`);
        push({ kind: "phone", fact: `Phone number published: ${phone}`, excerpt: cap(m[0]), contentLocation: 'a[href^="tel:"]', structuredValue: { phone } });
      }
      continue;
    }
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    const host = abs.hostname.toLowerCase();
    if (host === "wa.me" || host === "api.whatsapp.com" || host.endsWith(".whatsapp.com")) {
      if (!seenContacts.has("whatsapp")) {
        seenContacts.add("whatsapp");
        push({ kind: "whatsapp", fact: "Page links to WhatsApp", excerpt: cap(m[0]), contentLocation: 'a[href*="wa.me"]', structuredValue: { href: abs.toString() } });
      }
      continue;
    }
    const social = SOCIAL.exec(host.replace(/^www\./, ""));
    if (social && !seenContacts.has(`s:${social[1]}`)) {
      seenContacts.add(`s:${social[1]}`);
      push({ kind: "social_link", fact: `Page links to ${social[1]}`, excerpt: cap(m[0]), contentLocation: "a[href]", structuredValue: { network: social[1], href: abs.toString() } });
    }
    links.push(abs.toString());
  }

  const forms = [...doc.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form\s*>/gi)];
  if (forms.length > 0) {
    const fields = forms.map((f) => [...f[1]!.matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map((i) => attr(i[0], "name") ?? attr(i[0], "type") ?? i[1]!));
    push({
      kind: "form",
      fact: `Page contains ${forms.length} form${forms.length === 1 ? "" : "s"}`,
      excerpt: cap(forms[0]![0]),
      contentLocation: "form",
      structuredValue: { forms: forms.map((f, i) => ({ action: attr(f[0].slice(0, f[0].indexOf(">") + 1), "action"), fields: fields[i] })) },
    });
  }

  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body\s*>/i.exec(doc);
  const text = clean(bodyMatch ? bodyMatch[1]! : doc);
  const wordCount = text ? text.split(" ").length : 0;
  if (wordCount > 0) {
    push({
      kind: "page_text",
      fact: `Page text captured (${wordCount} words)`,
      excerpt: cap(text, MAX_TEXT_EXCERPT),
      contentLocation: "body",
      structuredValue: { wordCount },
    });
  }

  const hasTitle = facts.some((f) => f.kind === "title");
  const hasHeading = facts.some((f) => f.kind === "heading");
  const quality = Math.min(1, (hasTitle ? 0.25 : 0) + (hasHeading ? 0.25 : 0) + Math.min(0.5, wordCount / 400));
  return { facts, links, wordCount, quality };
}

export function extractPlainText(text: string): Extraction {
  const t = text.replace(/\s+/g, " ").trim();
  const wordCount = t ? t.split(" ").length : 0;
  return {
    facts: wordCount
      ? [{ kind: "page_text", fact: `Page text captured (${wordCount} words)`, excerpt: cap(t, MAX_TEXT_EXCERPT), contentLocation: "body", structuredValue: { wordCount } }]
      : [],
    links: [],
    wordCount,
    quality: Math.min(1, wordCount / 400),
  };
}
