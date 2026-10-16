// TEPOS, the Tidy Enterprise Personal Operating System: the founder's personal side (founder, 17 Oct 2026).
// TEBOS serves clients; TEPOS runs Tidy's own portals. Each portal is a tile in its own shade of earthy brown or
// beige. A portal that isn't built yet says so: it never shows invented figures.

export interface Portal {
  key: string;
  name: string;
  /** what you find inside, in a line */
  line: string;
  /** the tile's colour: earthy browns and beiges, each different */
  shade: string;
  /** the monogram's colour */
  accent: string;
  monogram: string;
  /** where it opens: the organisation (by slug) and the page */
  org?: string;
  to: string;
  built: boolean;
}

export const PORTALS: readonly Portal[] = [
  { key: "capital", name: "Tidy Capital", line: "The reserve: every income stream, and how many months the money lasts.",
    shade: "#3b2a1e", accent: "#d9b77e", monogram: "TC", org: "irekun", to: "/tepos/capital", built: true },
  { key: "enterprise", name: "Tidy Enterprise", line: "Property Revenue Architecture cases, and the credentials towards asset management.",
    shade: "#6b4a32", accent: "#ecd3ab", monogram: "TE", org: "tidy-enterprise", to: "/property", built: true },
  { key: "irekun", name: "IREKUN", line: "Security: two-step sign-in and the private organisation only you can open.",
    shade: "#241a14", accent: "#c08a5a", monogram: "IR", org: "irekun", to: "/tepos/irekun", built: true },
  { key: "academics", name: "Academics", line: "The study path towards asset management: qualifications, dates and evidence.",
    shade: "#d9c4a5", accent: "#6b4a32", monogram: "AC", to: "/tepos/academics", built: false },
  { key: "agent", name: "Real Estate Job", line: "Listings, buyers and sellers, appointments, and no enquiry left unanswered.",
    shade: "#8a6a4f", accent: "#f3e6d0", monogram: "RE", to: "/tepos/agent", built: false },
  { key: "forex", name: "Forex", line: "Paper trading with every idea time-stamped before its outcome. No live trading.",
    shade: "#efe3cf", accent: "#8a5a35", monogram: "FX", to: "/tepos/forex", built: false },
];

/** What each portal not built yet will hold, from the roadmap (docs/ROADMAP.md, founder's priorities). */
export const COMING: Record<string, { priority: string; holds: string[] }> = {
  academics: { priority: "Founder's priority 4: the study path", holds: [
    "Each qualification towards asset management (property finance, property investment and development, what the FSCA requires) as an objective with a date.",
    "Evidence of completion for each: a certificate or result, never a tick on its own.",
  ] },
  agent: { priority: "Founder's priority 3: the agent's office", holds: [
    "Every buyer, seller and listing with its next step and date.",
    "Listing write-ups and marketing drafted from the property's facts, for your approval.",
    "An instant acknowledgement for every enquiry, from a template you approved; everything else drafted for approval.",
    "Commission expected versus received, feeding Tidy Capital.",
  ] },
  forex: { priority: "Founder's priority 6: Tidy Capital, honestly", holds: [
    "A research and paper-trading ledger: every idea time-stamped before its outcome is known.",
    "Every result recorded, win or loss: the verifiable track record a future fund needs.",
    "No live trading, and no figure that isn't recorded. Forex income always counts as speculative in Tidy Capital.",
  ] },
};

/** TEPOS pages: the menu shows the TEPOS side on these. */
export const isTeposPath = (path: string) => path === "/tepos" || path.startsWith("/tepos/") || path === "/property" || path.startsWith("/property/") || path === "/resilience";
