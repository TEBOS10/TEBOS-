import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENCY_PACK, VAULT_FOLDERS, VAULT_MAX_BYTES, VAULT_MIME_TYPES, checkVaultDocument, fingerprint, packProgress } from "../src/domain/vault";

const draft = { folder: "agency_forms", packItem: "exclusive_mandate", title: "Exclusive mandate", fileName: "Exclusive_Mandate.pdf", mimeType: "application/pdf", sizeBytes: 548_300, note: null };

describe("the vault: the rules", () => {
  it("files a PDF or photo up to 20 MB, in a listed folder, with a title", () => {
    expect(checkVaultDocument(draft).ok).toBe(true);
    expect(checkVaultDocument({ ...draft, folder: "secrets" }).ok).toBe(false);
    expect(checkVaultDocument({ ...draft, title: " " }).ok).toBe(false);
    expect(checkVaultDocument({ ...draft, mimeType: "application/x-msdownload" }).ok).toBe(false);
    expect(checkVaultDocument({ ...draft, sizeBytes: VAULT_MAX_BYTES + 1 }).ok).toBe(false);
    expect(checkVaultDocument({ ...draft, packItem: "made_up" }).ok).toBe(false);
    expect(checkVaultDocument({ ...draft, note: "password: hunter2" }).ok).toBe(false);
  });

  it("counts the agency's papers that are really stored", () => {
    expect(packProgress([])).toMatchObject({ total: 16, filed: 0 });
    const p = packProgress([
      { folder: "agency_forms", packItem: "exclusive_mandate", storedAt: "2026-10-19T10:00:00Z", archivedAt: null },
      { folder: "agency_forms", packItem: "open_mandate", storedAt: null, archivedAt: null },
      { folder: "licence", packItem: "ppra_application", storedAt: "2026-10-19T10:00:00Z", archivedAt: "2026-10-19T11:00:00Z" },
    ]);
    expect(p.filed).toBe(1);
    expect(p.missing.map((m) => m.key)).toContain("open_mandate");
  });

  it("fingerprints a file with SHA-256", async () => {
    expect(await fingerprint(new TextEncoder().encode("abc").buffer as ArrayBuffer))
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("the vault: the domain mirrors the database", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261019130000_tepos_vault.sql"), "utf8");
  const listAfter = (marker: string) => {
    const start = sql.indexOf(marker);
    return [...sql.slice(start, sql.indexOf("))", start)).matchAll(/'([a-z0-9_/.-]+)'/g)].map((m) => m[1]);
  };
  it("folders, the agency's papers, file types and the size limit match", () => {
    expect(listAfter("folder        text not null check")).toEqual(Object.keys(VAULT_FOLDERS));
    expect(listAfter("pack_item     text check")).toEqual(AGENCY_PACK.map((p) => p.key));
    expect(listAfter("mime_type     text not null check")).toEqual([...VAULT_MIME_TYPES]);
    expect(sql).toContain(`size_bytes between 1 and ${VAULT_MAX_BYTES}`);
    for (const p of AGENCY_PACK) expect(Object.keys(VAULT_FOLDERS)).toContain(p.folder);
  });
});
