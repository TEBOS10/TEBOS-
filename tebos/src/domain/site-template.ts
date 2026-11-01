// The TEBOS starter website (docs/web-delivery/DESIGN_BRIEF.md): one static, dependency-free site for a service
// business, built from the client's brief and the content they supplied. It follows the design standard: one hero idea,
// a scroll story (the client's process, before → after), one display face, one accent, and the call to action always
// in reach. It never invents: no testimonial without the client's permission, no price that wasn't given, no claim the
// client didn't approve. A release build refuses until the copy and the privacy notice are approved; a preview build
// is stamped as a preview. The form shows "sent" only when the receiving address answers with success.
//
// Pure: renderSite returns the files; scripts/build-site.ts writes them and copies the client's images.

import type { IntakeAnswers } from "./web-delivery";

export interface SiteImage { src: string; alt: string }

export interface SiteConfig {
  business: {
    name: string;
    area: string;
    phone?: string;
    email?: string;
    whatsapp?: string;
    address?: string;
    hours?: string[];
  };
  brand: { accent: string; canvas: "light" | "dark"; display: "serif" | "grotesk"; logo?: SiteImage };
  hero: { eyebrow?: string; headline: string; promise: string; image?: SiteImage };
  firstAction: { label: string; kind: "form" | "call" | "whatsapp" | "email" };
  story?: { title: string; steps: Array<{ title: string; text: string; image?: SiteImage }> };
  services: Array<{ name: string; text: string; price?: string }>;
  testimonials?: Array<{ quote: string; who: string; permission: boolean }>;
  faq?: Array<{ q: string; a: string }>;
  form?: { endpoint: string; consentText: string };
  privacy?: { responsible: string; purpose: string; retention: string; contact: string };
  seo: { description: string; url?: string };
  approved: { copy: boolean; privacy: boolean };
}

export interface SiteProblem { field: string; message: string; blocksRelease: boolean; blocksPreview: boolean }

// ---------------------------------------------------------------------------
// Colour: the accent must carry readable text, and stand out from the canvas
// ---------------------------------------------------------------------------
const CANVAS = { light: { bg: "#f6f4ef", ink: "#16161a", muted: "#5b5b63", line: "rgba(0,0,0,0.1)", panel: "#ffffff" },
  dark: { bg: "#0b0b0d", ink: "#ededee", muted: "#a2a3a9", line: "rgba(255,255,255,0.1)", panel: "#141417" } } as const;

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
/** The text colour that reads best on the accent (black or white), with its contrast. */
export function onAccent(accent: string): { ink: string; ratio: number } {
  const black = contrast(accent, "#000000"), white = contrast(accent, "#ffffff");
  return black >= white ? { ink: "#000000", ratio: black } : { ink: "#ffffff", ratio: white };
}

// ---------------------------------------------------------------------------
// What stops a build
// ---------------------------------------------------------------------------
export function checkSite(c: SiteConfig): SiteProblem[] {
  const out: SiteProblem[] = [];
  const need = (ok: boolean, field: string, message: string, preview = true) => { if (!ok) out.push({ field, message, blocksRelease: true, blocksPreview: preview }); };
  const len = (s: string | undefined) => (s ?? "").trim().length;
  need(len(c.business.name) >= 2, "business.name", "The business's name is missing.");
  need(len(c.business.area) >= 2, "business.area", "Say where the business works.");
  need(len(c.hero.headline) >= 5, "hero.headline", "The headline is missing.");
  need(len(c.hero.promise) >= 10, "hero.promise", "The one-line promise under the headline is missing.");
  need(len(c.firstAction.label) >= 3, "firstAction.label", "Name the visitor's first action, e.g. \"Request a call-out\".");
  need(c.services.length >= 1 && c.services.every((s) => len(s.name) >= 2 && len(s.text) >= 10), "services", "List at least one service, each with a sentence about it.");
  need(len(c.seo.description) >= 50 && len(c.seo.description) <= 160, "seo.description", "Write a search description of 50 to 160 characters.");
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(c.brand.accent);
  need(hexOk, "brand.accent", "The accent colour must be a six-digit hex colour, e.g. #c8102e.");
  if (hexOk) {
    need(onAccent(c.brand.accent).ratio >= 4.5, "brand.accent", "Buttons in this accent can't carry readable text (contrast under 4.5:1). Choose a deeper or lighter shade.");
    need(contrast(c.brand.accent, CANVAS[c.brand.canvas].bg) >= 3, "brand.accent", "The accent doesn't stand out from the page (contrast under 3:1). Choose a stronger shade.");
  }
  const images = [c.brand.logo, c.hero.image, ...(c.story?.steps ?? []).map((s) => s.image)].filter(Boolean) as SiteImage[];
  need(images.every((i) => len(i.alt) >= 3 || i.alt === ""), "images", "Every image needs a description for people who can't see it.");
  need(images.every((i) => !/^https?:/i.test(i.src) && !i.src.includes("..")), "images", "Images come from the client's own files, inside the project folder.");
  const contact = { call: c.business.phone, whatsapp: c.business.whatsapp, email: c.business.email, form: c.form?.endpoint }[c.firstAction.kind];
  need(len(contact) > 0, "firstAction.kind", `The first action is "${c.firstAction.kind}", but its ${c.firstAction.kind === "form" ? "form address" : c.firstAction.kind} isn't given.`);
  if (c.form) {
    need(/^https:\/\/\S+$/.test(c.form.endpoint), "form.endpoint", "The form's receiving address must start with https://.");
    need(len(c.form.consentText) >= 20, "form.consentText", "The form needs a consent line saying what happens to what visitors send.");
  }
  const collects = Boolean(c.form || c.business.email);
  need(!collects || Boolean(c.privacy && len(c.privacy.responsible) >= 2 && len(c.privacy.purpose) >= 10 && len(c.privacy.retention) >= 5 && len(c.privacy.contact) >= 5),
    "privacy", "The site collects details, so it needs a privacy notice: who is responsible, why, for how long, and how to ask about it.");
  for (const [i, t] of (c.testimonials ?? []).entries()) need(t.permission === true, `testimonials[${i}]`, "A testimonial is published only with the person's permission.");
  out.push(...(c.approved.copy ? [] : [{ field: "approved.copy", message: "The client hasn't approved the copy.", blocksRelease: true, blocksPreview: false }]));
  if (collects) out.push(...(c.approved.privacy ? [] : [{ field: "approved.privacy", message: "The client hasn't approved the privacy notice.", blocksRelease: true, blocksPreview: false }]));
  return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const telHref = (n: string) => `tel:${n.replace(/[^0-9+]/g, "")}`;
const waHref = (n: string) => `https://wa.me/${n.replace(/[^0-9]/g, "").replace(/^0/, "27")}`;
const img = (i: SiteImage, cls = "", eager = false) =>
  `<img class="${cls}" src="${esc(i.src)}" alt="${esc(i.alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;

function actionHref(c: SiteConfig): string {
  switch (c.firstAction.kind) {
    case "call": return telHref(c.business.phone!);
    case "whatsapp": return waHref(c.business.whatsapp!);
    case "email": return `mailto:${c.business.email}`;
    default: return "#contact";
  }
}

/** Our own hero art when the client has no photograph: light falling across a soft grid, in their accent. */
function heroArt(accent: string, canvas: "light" | "dark"): string {
  const base = canvas === "dark" ? "#0b0b0d" : "#efece5";
  return `<svg class="hero-art" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true">
  <defs><radialGradient id="g" cx="70%" cy="30%" r="70%"><stop offset="0" stop-color="${accent}" stop-opacity="0.85"/><stop offset="0.55" stop-color="${accent}" stop-opacity="0.18"/><stop offset="1" stop-color="${base}" stop-opacity="0"/></radialGradient>
  <pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${canvas === "dark" ? "#ffffff" : "#000000"}" stroke-opacity="0.06"/></pattern></defs>
  <rect width="800" height="600" fill="${base}"/><rect width="800" height="600" fill="url(#p)"/><rect width="800" height="600" fill="url(#g)"/>
</svg>`;
}

function css(c: SiteConfig): string {
  const t = CANVAS[c.brand.canvas];
  const display = c.brand.display === "serif"
    ? `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`
    : `"Helvetica Neue", "Arial Nova", Arial, system-ui, sans-serif`;
  return `:root{--bg:${t.bg};--ink:${t.ink};--muted:${t.muted};--line:${t.line};--panel:${t.panel};--accent:${c.brand.accent};--on-accent:${onAccent(c.brand.accent).ink};
--display:${display};--text:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--gutter:clamp(16px,5vw,64px);--radius:14px}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.6 var(--text);overflow-x:hidden}
img,svg{display:block;max-width:100%}
a{color:inherit}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:4px}
.skip{position:absolute;left:-999px;top:8px}.skip:focus{left:8px;background:var(--panel);padding:8px 12px;z-index:50}
.wrap{width:min(1180px,100%);margin:0 auto;padding:0 var(--gutter)}
.preview{background:#ffd23f;color:#000;text-align:center;font:600 13px/1.4 var(--text);padding:6px 12px}
header.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px}
.brand{display:flex;align-items:center;gap:10px;font:600 17px/1 var(--text);text-decoration:none}.brand img{height:32px;width:auto}
nav.menu ul{display:flex;gap:22px;list-style:none;margin:0;padding:0}nav.menu a{text-decoration:none;color:var(--muted);font-size:15px}nav.menu a:hover{color:var(--ink)}
.menu-toggle{display:none;background:none;border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:8px 14px;font:inherit}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 22px;border-radius:999px;font:600 16px/1 var(--text);text-decoration:none;border:1px solid transparent;cursor:pointer}
.btn-accent{background:var(--accent);color:var(--on-accent)}.btn-ghost{border-color:var(--line);color:var(--ink);background:transparent}
.hero{position:relative;min-height:min(92vh,860px);display:grid;align-items:end;overflow:hidden;isolation:isolate}
.hero-media,.hero-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
.hero::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,transparent 30%,var(--bg) 96%)}
.hero .wrap{padding-top:120px;padding-bottom:clamp(40px,8vh,96px)}
.eyebrow{font:600 12px/1 var(--text);letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 18px}
h1,h2,h3{font-family:var(--display);font-weight:500;letter-spacing:-.02em;line-height:1.02;margin:0}
h1{font-size:clamp(44px,8.4vw,112px);max-width:14ch}
h2{font-size:clamp(34px,5.2vw,64px);max-width:18ch}
h3{font-size:clamp(22px,2.4vw,28px);line-height:1.15}
.promise{font-size:clamp(18px,1.6vw,21px);color:var(--muted);max-width:52ch;margin:22px 0 30px}
.actions{display:flex;flex-wrap:wrap;gap:12px}
section.band{padding:clamp(72px,12vh,140px) 0;border-top:1px solid var(--line)}
.story{display:grid;grid-template-columns:minmax(0,1fr);gap:48px}
.story-steps{list-style:none;margin:40px 0 0;padding:0;display:grid;gap:clamp(40px,14vh,160px)}
.step{opacity:.45;transition:opacity .5s ease}.step.is-active,.no-js .step{opacity:1}
.step-n{font:600 13px/1 var(--text);color:var(--accent);letter-spacing:.12em}
.step h3{margin:10px 0 12px}.step p{color:var(--muted);margin:0;max-width:46ch}
.step-media{margin-top:18px;border-radius:var(--radius);overflow:hidden;aspect-ratio:4/3;background:var(--panel)}.step-media img{width:100%;height:100%;object-fit:cover}
.story-visual{display:none}
@media (min-width:900px){
 .story.has-visual{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);align-items:start}
 .story:not(.has-visual) .story-steps{grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:40px}
 .story:not(.has-visual) .step{opacity:1}
 .story-visual{display:block;position:sticky;top:96px;aspect-ratio:4/5;border-radius:calc(var(--radius) * 1.5);overflow:hidden;background:var(--panel)}
 .story-visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .7s ease}.story-visual img.is-active{opacity:1}
 .story-visual .num{position:absolute;left:24px;bottom:18px;font:500 clamp(80px,10vw,140px)/1 var(--display);color:var(--accent);opacity:.9}
 .has-visual .step-media{display:none}
}
.services{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;margin-top:40px}
.service{background:var(--bg);padding:28px}.service p{color:var(--muted);margin:10px 0 0}.price{display:inline-block;margin-top:14px;font-weight:600;color:var(--accent)}
.quotes{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));margin-top:40px}
blockquote{margin:0;padding:28px;border:1px solid var(--line);border-radius:var(--radius);font:400 clamp(19px,1.8vw,23px)/1.4 var(--display)}blockquote footer{margin-top:16px;font:500 14px/1.4 var(--text);color:var(--muted)}
.faq{margin-top:32px;border-top:1px solid var(--line)}.faq details{border-bottom:1px solid var(--line);padding:18px 0}.faq summary{cursor:pointer;font-weight:600;list-style:none}.faq summary::after{content:"+";float:right;color:var(--accent)}.faq details[open] summary::after{content:"–"}.faq p{color:var(--muted);margin:10px 0 0}
.contact{display:grid;gap:40px;grid-template-columns:minmax(0,1fr)}
@media (min-width:900px){.contact{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.facts{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:10px;color:var(--muted)}.facts a{color:var(--ink)}
form.enquiry{display:grid;gap:14px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:clamp(20px,3vw,32px)}
label{display:grid;gap:6px;font:600 14px/1.3 var(--text)}
input,textarea{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;width:100%}
textarea{min-height:120px;resize:vertical}
.consent{display:flex;gap:10px;align-items:flex-start;font-weight:400;color:var(--muted)}.consent input{width:auto;margin-top:4px}
.form-status{min-height:1.4em;margin:0;font-size:15px}.form-status[data-state=sent]{color:var(--ink);font-weight:600}.form-status[data-state=error]{color:#d93a3a}
footer.site{border-top:1px solid var(--line);padding:40px 0 120px;color:var(--muted);font-size:14px}
footer.site .wrap{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between}
.reach{position:fixed;left:12px;right:12px;bottom:12px;z-index:30;display:flex;justify-content:center;transition:transform .3s ease,opacity .3s ease}
.js .reach.is-hidden{transform:translateY(140%);opacity:0;pointer-events:none}
.reach .btn{width:100%;max-width:520px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
@media (min-width:900px){.reach{display:none}footer.site{padding-bottom:40px}}
@media (max-width:820px){
 .menu-toggle{display:inline-flex}nav.menu{position:absolute;left:0;right:0;top:100%;background:var(--bg);border-bottom:1px solid var(--line);display:none}
 nav.menu.open{display:block}nav.menu ul{flex-direction:column;gap:0;padding:8px var(--gutter) 16px}nav.menu a{display:block;padding:12px 0;font-size:17px}
 .top .btn{display:none}
}
.legal{max-width:68ch;padding:80px var(--gutter) 120px;margin:0 auto}.legal h1{font-size:clamp(36px,6vw,64px);margin-bottom:28px}.legal dt{font-weight:600;margin-top:18px}.legal dd{margin:4px 0 0;color:var(--muted)}
.js .reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease}.js .reveal.is-in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition:none!important;animation:none!important}.js .reveal{opacity:1;transform:none}.step{opacity:1}}
`;
}

const JS = `(function(){
var d=document;d.documentElement.classList.remove("no-js");d.documentElement.classList.add("js");
var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var t=d.querySelector(".menu-toggle"),m=d.querySelector("nav.menu");
if(t&&m){t.addEventListener("click",function(){var o=m.classList.toggle("open");t.setAttribute("aria-expanded",o?"true":"false");});
 m.addEventListener("click",function(e){if(e.target.tagName==="A"){m.classList.remove("open");t.setAttribute("aria-expanded","false");}});}
var io="IntersectionObserver" in window;
var rev=d.querySelectorAll(".reveal");
if(reduce||!io){rev.forEach(function(e){e.classList.add("is-in");});}
else{var ro=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("is-in");ro.unobserve(e.target);}});},{rootMargin:"0px 0px -10% 0px"});rev.forEach(function(e){ro.observe(e);});}
var reach=d.querySelector(".reach"),hero=d.querySelector(".hero");
if(reach&&hero&&io){reach.classList.add("is-hidden");new IntersectionObserver(function(es){reach.classList.toggle("is-hidden",es[0].isIntersecting);}).observe(hero);}
var steps=d.querySelectorAll(".step"),pics=d.querySelectorAll(".story-visual img"),num=d.querySelector(".story-visual .num");
function show(i){steps.forEach(function(s,k){s.classList.toggle("is-active",k===i);});pics.forEach(function(p,k){p.classList.toggle("is-active",k===i);});if(num)num.textContent=String(i+1).padStart(2,"0");}
if(steps.length){show(0);if(io&&!reduce){var so=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)show(Array.prototype.indexOf.call(steps,e.target));});},{rootMargin:"-45% 0px -45% 0px"});steps.forEach(function(s){so.observe(s);});}
 else{steps.forEach(function(s){s.classList.add("is-active");});}}
var f=d.querySelector("form.enquiry");
if(f){var st=f.querySelector(".form-status"),b=f.querySelector("button[type=submit]"),busy=false;
 f.addEventListener("submit",function(e){e.preventDefault();if(busy)return;
  if(!f.checkValidity()){f.reportValidity();return;}
  busy=true;b.disabled=true;st.dataset.state="sending";st.textContent="Sending…";
  var data={name:f.elements.name.value,contact:f.elements.contact.value,message:f.elements.message.value,consent:f.elements.consent.checked,page:location.pathname};
  var ac=window.AbortController?new AbortController():null,timer=setTimeout(function(){if(ac)ac.abort();},10000);
  fetch(f.getAttribute("action"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),signal:ac?ac.signal:undefined})
  .then(function(r){if(!r.ok)throw new Error("status "+r.status);st.dataset.state="sent";st.textContent=f.dataset.sent;f.reset();})
  .catch(function(){st.dataset.state="error";st.textContent=f.dataset.failed;})
  .then(function(){clearTimeout(timer);busy=false;b.disabled=false;});
 });}
})();
`;

export interface RenderedSite { files: Record<string, string>; images: string[]; problems: SiteProblem[] }

/** Render the site. Throws if the mode is blocked; a preview is stamped as one. */
export function renderSite(c: SiteConfig, mode: "preview" | "release"): RenderedSite {
  const problems = checkSite(c);
  const blocking = problems.filter((p) => (mode === "release" ? p.blocksRelease : p.blocksPreview));
  if (blocking.length) throw new Error(`The site can't be built for ${mode}: ${blocking.map((p) => p.message).join(" ")}`);
  const b = c.business;
  const steps = c.story?.steps ?? [];
  const stepPics = steps.filter((s) => s.image);
  const quotes = (c.testimonials ?? []).filter((t) => t.permission === true);
  const nav = [
    steps.length ? ["#how", c.story!.title.length <= 18 ? c.story!.title : "How it works"] : null,
    ["#services", "Services"],
    quotes.length ? ["#clients", "Clients"] : null,
    (c.faq ?? []).length ? ["#faq", "Questions"] : null,
    ["#contact", "Contact"],
  ].filter(Boolean) as Array<[string, string]>;
  const href = actionHref(c);
  const cta = `<a class="btn btn-accent" href="${esc(href)}">${esc(c.firstAction.label)}</a>`;
  const second = c.firstAction.kind !== "call" && b.phone ? `<a class="btn btn-ghost" href="${telHref(b.phone)}">Call ${esc(b.phone)}</a>` : "";
  const ld = {
    "@context": "https://schema.org", "@type": "LocalBusiness", name: b.name, areaServed: b.area, description: c.seo.description,
    ...(b.phone ? { telephone: b.phone } : {}), ...(b.email ? { email: b.email } : {}), ...(b.address ? { address: b.address } : {}),
    ...(c.seo.url ? { url: c.seo.url } : {}),
  };
  const head = (title: string, extra = "") => `<!doctype html>
<html lang="en-ZA" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(c.seo.description)}">
${mode === "preview" ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(c.seo.description)}"><meta property="og:type" content="website">
${c.seo.url ? `<link rel="canonical" href="${esc(c.seo.url)}">` : ""}
<meta name="theme-color" content="${CANVAS[c.brand.canvas].bg}">
<link rel="stylesheet" href="styles.css">${extra}
</head>`;
  const banner = mode === "preview" ? `<div class="preview" role="note">Preview for ${esc(b.name)}: not yet approved for release.</div>` : "";
  const headerHtml = `${banner}
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
  <a class="brand" href="index.html">${c.brand.logo ? img(c.brand.logo) : ""}<span>${esc(b.name)}</span></a>
  <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu">Menu</button>
  <nav class="menu" id="menu" aria-label="Main"><ul>${nav.map(([h, l]) => `<li><a href="index.html${h}">${esc(l)}</a></li>`).join("")}</ul></nav>
  ${cta.replace('href="#contact"', 'href="index.html#contact"')}
</div></header>`;
  const footerHtml = `<footer class="site"><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(b.name)} · ${esc(b.area)}</span>${c.privacy ? `<a href="privacy.html">Privacy</a>` : ""}</div></footer>`;

  const story = steps.length ? `<section class="band" id="how"><div class="wrap story${stepPics.length ? " has-visual" : ""}">
  <div><p class="eyebrow">How it works</p><h2 class="reveal">${esc(c.story!.title)}</h2>
  <ol class="story-steps">${steps.map((s, i) => `<li class="step"><span class="step-n">${String(i + 1).padStart(2, "0")}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>${s.image ? `<div class="step-media">${img(s.image)}</div>` : ""}</li>`).join("")}</ol></div>
  ${stepPics.length ? `<div class="story-visual" aria-hidden="true">${steps.map((s) => (s.image ? img({ src: s.image.src, alt: "" }) : `<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`)).join("")}<span class="num">01</span></div>` : ""}
</div></section>` : "";
  const services = `<section class="band" id="services"><div class="wrap"><p class="eyebrow">Services</p><h2 class="reveal">What ${esc(b.name)} does</h2>
  <div class="services">${c.services.map((s) => `<article class="service"><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p>${s.price ? `<span class="price">${esc(s.price)}</span>` : ""}</article>`).join("")}</div></div></section>`;
  const clients = quotes.length ? `<section class="band" id="clients"><div class="wrap"><p class="eyebrow">Clients</p><h2 class="reveal">In their words</h2>
  <div class="quotes">${quotes.map((q) => `<blockquote>“${esc(q.quote)}”<footer>${esc(q.who)}</footer></blockquote>`).join("")}</div></div></section>` : "";
  const faq = (c.faq ?? []).length ? `<section class="band" id="faq"><div class="wrap"><p class="eyebrow">Questions</p><h2 class="reveal">Asked often</h2>
  <div class="faq">${c.faq!.map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("")}</div></div></section>` : "";
  const facts = [
    b.phone ? `<li>Call <a href="${telHref(b.phone)}">${esc(b.phone)}</a></li>` : "",
    b.whatsapp ? `<li>WhatsApp <a href="${waHref(b.whatsapp)}">${esc(b.whatsapp)}</a></li>` : "",
    b.email ? `<li>Email <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>` : "",
    b.address ? `<li>${esc(b.address)}</li>` : "",
    ...(b.hours ?? []).map((h) => `<li>${esc(h)}</li>`),
  ].join("");
  const form = c.form ? `<form class="enquiry" action="${esc(c.form.endpoint)}" method="post" novalidate aria-label="Send ${esc(b.name)} a message"
    data-sent="Sent. ${esc(b.name)} has your message and will reply." data-failed="Not sent. Your message is still here: please try again, or contact ${esc(b.name)} directly.">
    <label>Your name<input name="name" autocomplete="name" required maxlength="120"></label>
    <label>Phone or email<input name="contact" autocomplete="email" required maxlength="160"></label>
    <label>How can we help?<textarea name="message" required maxlength="2000"></textarea></label>
    <label class="consent"><input type="checkbox" name="consent" required> <span>${esc(c.form.consentText)}${c.privacy ? ' <a href="privacy.html">Privacy notice</a>' : ""}</span></label>
    <button class="btn btn-accent" type="submit">Send</button>
    <p class="form-status" role="status" aria-live="polite"></p>
  </form>` : `<div class="enquiry-alt"><p class="eyebrow">Get in touch directly</p>${cta}</div>`;
  const contact = `<section class="band" id="contact"><div class="wrap contact">
  <div><p class="eyebrow">Contact</p><h2 class="reveal">${esc(c.firstAction.label)}</h2><ul class="facts">${facts}</ul></div>
  ${form}
</div></section>`;
  const index = `${head(`${b.name} · ${b.area}`, `\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`)}
<body>
${headerHtml}
<main id="main">
<section class="hero">${c.hero.image ? img(c.hero.image, "hero-media", true) : heroArt(c.brand.accent, c.brand.canvas)}
  <div class="wrap"><p class="eyebrow">${esc(c.hero.eyebrow ?? b.area)}</p><h1>${esc(c.hero.headline)}</h1><p class="promise">${esc(c.hero.promise)}</p>
  <div class="actions">${cta}${second}</div></div>
</section>
${story}
${services}
${clients}
${faq}
${contact}
</main>
${footerHtml}
<div class="reach">${cta}</div>
<script src="site.js" defer></script>
</body>
</html>
`;
  const files: Record<string, string> = { "index.html": index, "styles.css": css(c), "site.js": JS, "robots.txt": mode === "preview" ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\n${c.seo.url ? `Sitemap: ${c.seo.url.replace(/\/$/, "")}/sitemap.xml\n` : ""}` };
  if (c.privacy) {
    const p = c.privacy;
    files["privacy.html"] = `${head(`Privacy · ${b.name}`)}
<body>
${headerHtml}
<main id="main" class="legal"><h1>Privacy notice</h1>
<p>How ${esc(b.name)} handles what you send through this website.</p>
<dl><dt>Who is responsible</dt><dd>${esc(p.responsible)}</dd><dt>Why we collect it</dt><dd>${esc(p.purpose)}</dd>
<dt>How long we keep it</dt><dd>${esc(p.retention)}</dd><dt>To ask about, correct or delete your details</dt><dd>${esc(p.contact)}</dd></dl>
</main>
${footerHtml}
<script src="site.js" defer></script>
</body>
</html>
`;
  }
  if (mode === "release" && c.seo.url) {
    const root = c.seo.url.replace(/\/$/, "");
    files["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(root)}/</loc></url>${c.privacy ? `<url><loc>${esc(root)}/privacy.html</loc></url>` : ""}</urlset>\n`;
  }
  const images = [c.brand.logo, c.hero.image, ...steps.map((s) => s.image)].filter(Boolean).map((i) => i!.src);
  return { files, images: [...new Set(images)], problems };
}

/**
 * A first draft of the site's config from the client's submitted brief. Only what the brief says is used; everything
 * else is left empty, so checkSite lists exactly what the client still has to supply (services, the promise, the
 * privacy notice, contact details). The draft is never approved: the client approves the copy and the privacy notice.
 */
export function draftSiteFromBrief(a: IntakeAnswers, area: string, accent = "#c2410c"): SiteConfig {
  const display: SiteConfig["brand"]["display"] = a.visual_direction === "luxury_editorial" || a.visual_direction === "cinematic_3d" ? "serif" : "grotesk";
  return {
    business: { name: a.business_name ?? "", area },
    brand: { accent, canvas: a.visual_direction === "minimal" || a.visual_direction === "corporate" ? "light" : "dark", display },
    hero: { headline: "", promise: "" },
    firstAction: { label: a.first_action ?? "", kind: (a.launch_features ?? []).includes("contact_form") ? "form" : "call" },
    services: [],
    seo: { description: "" },
    approved: { copy: false, privacy: false },
  };
}
