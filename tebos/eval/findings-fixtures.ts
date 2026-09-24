// Synthetic evidence sets for checking finding quality against a real model.
// These are hand-written test inputs, clearly fictional; they never enter
// the database. Each lists what a good answer should cover.
import type { EvidenceForReasoning, FindingsInput } from "../src/intelligence/findings";

let n = 0;
const acquired = (uri: string, fact: string, excerpt: string, contentLocation = "body"): EvidenceForReasoning => ({
  id: `fx-${++n}`, sourceId: uri, sourceUri: uri, state: "acquired", fact, missingDescription: null, excerpt, contentLocation, confidence: 0.9,
});
const missing = (uri: string, why: string): EvidenceForReasoning => ({
  id: `fx-${++n}`, sourceId: uri, sourceUri: uri, state: "unavailable", fact: null, missingDescription: `${uri} could not be read: ${why}`, excerpt: null, contentLocation: null, confidence: null,
});

export interface Fixture {
  name: string;
  input: FindingsInput;
  /** Topics a useful answer should raise (case-insensitive substring match on title + statement). */
  shouldMention: string[][];
}

export const FIXTURES: Fixture[] = [
  {
    name: "Pottery studio, WhatsApp-only enquiries (fictional)",
    shouldMention: [["whatsapp"], ["track", "record", "measure", "follow"]],
    input: {
      business: { name: "Clayworks Studio (fictional)", website: "https://clayworks.example/", industry: "Handmade ceramics" },
      objective: "Understand how customers enquire and order",
      userContext: [{ kind: "problem", statement: "Orders get lost between WhatsApp chats and my notebook." }],
      scanCoverage: 0.75,
      pagesRead: 3,
      evidence: [
        acquired("https://clayworks.example/", "Page title: Clayworks Studio | Handmade Ceramics", "<title>Clayworks Studio | Handmade Ceramics</title>", "head > title"),
        acquired("https://clayworks.example/", "Page links to WhatsApp", '<a href="https://wa.me/27820000000">Order on WhatsApp</a>', 'a[href*="wa.me"]'),
        acquired("https://clayworks.example/", "Page text captured (180 words)", "Every piece is made by hand in our studio. To order, message us on WhatsApp with the piece you like and we will confirm availability and delivery."),
        acquired("https://clayworks.example/shop", "H1 heading: Shop", "<h1>Shop</h1>", "h1"),
        acquired("https://clayworks.example/shop", "Page text captured (95 words)", "Mugs R250. Bowls R320. Vases from R450. Prices exclude delivery. Message us on WhatsApp to order."),
        acquired("https://clayworks.example/about", "Page links to instagram", '<a href="https://instagram.com/clayworks">Instagram</a>', "a[href]"),
        missing("https://clayworks.example/contact", "HTTP 503 from the site"),
      ],
    },
  },
  {
    name: "Plumbing firm with a quote form (fictional)",
    shouldMention: [["form", "quote"], ["emergency", "24"]],
    input: {
      business: { name: "Rapid Pipes (fictional)", website: "https://rapidpipes.example/", industry: "Plumbing" },
      objective: null,
      userContext: [],
      scanCoverage: 1,
      pagesRead: 3,
      evidence: [
        acquired("https://rapidpipes.example/", "H1 heading: 24/7 Emergency Plumbing in Pretoria", "<h1>24/7 Emergency Plumbing in Pretoria</h1>", "h1"),
        acquired("https://rapidpipes.example/", "Phone number published: +27120000000", '<a href="tel:+27120000000">Call now</a>', 'a[href^="tel:"]'),
        acquired("https://rapidpipes.example/quote", "Page contains 1 form", '<form action="/quote-submit"><input name="name"><input name="phone"><textarea name="problem"></textarea></form>', "form"),
        acquired("https://rapidpipes.example/quote", "Page text captured (60 words)", "Request a quote and we will call you back within one business day."),
        acquired("https://rapidpipes.example/services", "Page text captured (240 words)", "Burst geysers, blocked drains, leak detection. Emergency call-outs available day and night."),
      ],
    },
  },
];
