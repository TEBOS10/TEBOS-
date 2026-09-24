// Target planning: which pages of a public site to read, within the scan's
// target limit. Deterministic — no model is needed to pick "contact" and
// "about" pages (dossier §48, cheap work stays cheap).

const ASSET_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|ico|css|js|mjs|json|xml|pdf|zip|gz|mp4|mp3|mov|woff2?|ttf|eot|avi|docx?|xlsx?|pptx?)$/i;

// Pages that tell TEBOS most about how the business sells and operates.
const PRIORITY: Array<[RegExp, number]> = [
  [/contact|enquir|inquir|get-in-touch|quote/i, 100],
  [/about|who-we-are|our-story|company/i, 90],
  [/service|solution|what-we-do/i, 85],
  [/pric|package|plan|rates/i, 80],
  [/product|shop|store|menu/i, 70],
  [/book|appointment|reserv|schedule/i, 70],
  [/team|people|staff/i, 50],
  [/faq|help|support/i, 45],
  [/case-stud|portfolio|work|project|client/i, 40],
];
const LOW_VALUE = /login|signin|sign-in|register|cart|checkout|account|privacy|terms|cookie|legal|wp-admin|feed|tag\/|category\/|page\/\d+/i;

/** Canonical form used for de-duplication: no fragment, no trailing slash (except root), lowercase host. */
export function normaliseUrl(input: string, base?: string): string | null {
  let u: URL;
  try {
    u = new URL(input, base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, "");

export function sameSite(a: string, b: string): boolean {
  return bareHost(new URL(a).hostname) === bareHost(new URL(b).hostname);
}

export function scoreLink(url: string): number {
  const path = new URL(url).pathname;
  if (LOW_VALUE.test(path)) return -1;
  let score = 10 - Math.min(9, path.split("/").filter(Boolean).length * 3); // shallower is better
  for (const [pattern, weight] of PRIORITY) if (pattern.test(path)) score = Math.max(score, weight);
  return score;
}

/**
 * Pick up to `limit` same-site pages worth reading, best first, excluding
 * anything already planned or fetched.
 */
export function planTargets(pageUrl: string, links: readonly string[], limit: number, exclude: ReadonlySet<string>): string[] {
  const seen = new Set(exclude);
  const candidates: Array<{ url: string; score: number; order: number }> = [];
  links.forEach((href, order) => {
    const url = normaliseUrl(href, pageUrl);
    if (!url || seen.has(url) || !sameSite(url, pageUrl) || ASSET_EXTENSIONS.test(new URL(url).pathname)) return;
    seen.add(url);
    const score = scoreLink(url);
    if (score >= 0) candidates.push({ url, score, order });
  });
  return candidates
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map((c) => c.url);
}
