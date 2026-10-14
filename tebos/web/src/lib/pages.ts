// The public site's pages, each with its own title and description. The build
// writes a copy of index.html per page carrying these (so search results and
// link previews show the right page, not the home page's text) and the
// sitemap from the same list. A test keeps it in step with the routes in App.
// Plain text only: no prices, no results, no supplier names.

import { POSTS } from "./blog";

export const SITE_URL = "https://tebos-demo.vercel.app";

export interface PublicPage {
  path: string;
  title: string;
  description: string;
}

const PAGES: PublicPage[] = [
  { path: "/", title: "TEBOS · Business Operating Systems",
    description: "A business that runs on structure, not on you. TEBOS maps how your business runs and builds the architecture around the systems you already have." },
  { path: "/showcase", title: "What TEBOS does · TEBOS",
    description: "Watch how TEBOS takes work off a business, one problem at a time: sales, money, reporting, delivery, websites and security. Each says honestly what runs today." },
  { path: "/systems", title: "An operating system for your kind of business · TEBOS",
    description: "Operating-system blueprints for agencies, practices, gyms, restaurants, trades and more: the pieces, flows and steps a business of your kind runs on." },
  { path: "/self-check", title: "How much does your business run through you? · TEBOS",
    description: "A free ten-question self-check. See where your business still depends on you, and get a result you can share." },
  { path: "/demo", title: "Try the demo · TEBOS",
    description: "Click through TEBOS with a fictional agency's board: its flows, the rules behind each step, its objectives and its approvals. Nothing is sent anywhere." },
  { path: "/tour", title: "A tour of TEBOS",
    description: "An animated tour of how TEBOS maps a business, finds the steps that run through the owner, and builds the structure that replaces them." },
  { path: "/film", title: "The TEBOS film",
    description: "A short narrated film on how a business can run on structure instead of on its founder." },
  { path: "/pricing", title: "Pricing · TEBOS",
    description: "TEBOS plans for small businesses and companies: pay monthly, or grow together in an equity partnership. All prices are shown on the page." },
  { path: "/waitlist", title: "Get your operating system in 3 days · TEBOS",
    description: "Join the TEBOS waiting list. Tell us your kind of business, and TEBOS drafts its operating system within days of starting." },
  { path: "/blog", title: "Blog · TEBOS",
    description: "Practical articles on running a business on structure rather than on its founder. Each one is useful without buying anything." },
  { path: "/privacy", title: "Privacy policy · TEBOS",
    description: "How TEBOS collects, uses and protects personal information, under South Africa's Protection of Personal Information Act." },
  { path: "/terms", title: "Website terms · TEBOS",
    description: "The terms that apply when you use the TEBOS website and platform." },
];

export const PUBLIC_PAGES: readonly PublicPage[] = [
  ...PAGES,
  ...POSTS.map((p) => ({ path: `/blog/${p.slug}`, title: `${p.title} · TEBOS`, description: p.summary })),
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** index.html with this page's title, description, canonical address and link-preview tags. */
export function pageHtml(template: string, page: PublicPage): string {
  const url = `${SITE_URL}${page.path === "/" ? "/" : page.path}`;
  const set = (html: string, re: RegExp, tag: string) => {
    if (!re.test(html)) throw new Error(`index.html is missing ${re}`);
    return html.replace(re, tag);
  };
  let html = template;
  html = set(html, /<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  html = set(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(page.description)}" />`);
  html = set(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(page.title)}" />`);
  html = set(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(page.description)}" />`);
  return html.replace("</head>", `    <link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n  </head>`);
}

/** The sitemap, from the same list. */
export function sitemapXml(): string {
  const urls = PUBLIC_PAGES.map((p) => `  <url><loc>${SITE_URL}${p.path}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Where the built copy for a page goes, relative to the build folder. vercel.json rewrites each page's address to it. */
export const pageFile = (path: string) => (path === "/" ? "index.html" : `${path.slice(1)}.html`);
