import { describe, expect, it } from "vitest";
import { runSync, type IntakeStore, type SourceAdapter, type SourceItem } from "../src/sources/sync";

// A test double for the store: it recognises a source reference it has seen, as reeds_capture does.
function memoryStore() {
  const seen = new Set<string>();
  const reports: Array<{ ok: boolean; error?: string }> = [];
  const store: IntakeStore = {
    async capture(_org, type, item) {
      const key = `${type}:${item.sourceRef}`;
      if (seen.has(key)) return { duplicate: true, created: 0, conflicts: 0 };
      seen.add(key);
      return { duplicate: false, created: item.items.length, conflicts: 0 };
    },
    async reportSync(_org, _type, ok, error) { reports.push({ ok, error }); },
  };
  return { store, reports };
}

const item = (ref: string): SourceItem => ({ sourceRef: ref, sourceLink: null, receivedAt: "2026-10-26T08:00:00Z", sender: null, summary: `Message ${ref}`,
  triage: "commitment", workspace: "agency", items: [{ title: `Act on ${ref}` }] });

describe("a source sync", () => {
  it("captures each item once, counts duplicates, and reports success only after it ran", async () => {
    const { store, reports } = memoryStore();
    const adapter: SourceAdapter = { type: "email", fetchSince: async () => ({ items: [item("a"), item("b"), item("a")], cursor: "c2" }) };
    const s = await runSync(store, "org", adapter, "c1");
    expect(s).toMatchObject({ fetched: 3, captured: 2, duplicates: 1, failed: false, cursor: "c2" });
    expect(reports).toEqual([{ ok: true, error: undefined }]);
  });

  it("a failure is reported with its error, never as a success, and the cursor stays put for the retry", async () => {
    const { store, reports } = memoryStore();
    const adapter: SourceAdapter = { type: "email", fetchSince: async () => { throw new Error("Mailbox not authorised (401)"); } };
    const s = await runSync(store, "org", adapter, "c1");
    expect(s).toMatchObject({ failed: true, error: "Mailbox not authorised (401)", cursor: "c1", captured: 0 });
    expect(reports).toEqual([{ ok: false, error: "Mailbox not authorised (401)" }]);
  });
});
