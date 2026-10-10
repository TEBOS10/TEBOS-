#!/usr/bin/env node
// Applies the repository's migrations to the live database, in order, each in
// its own transaction, and records each in Supabase's migration history.
// Run by CI after a merge to main has passed every check:
//   SUPABASE_DB_URL=... node scripts/migrate.mjs [--dry-run]
//
//   * A migration already in the history is skipped.
//   * One listed in supabase/applied-outside-history.txt (run by hand before
//     this runner existed) is recorded without being run again.
//   * A failure rolls that migration back and stops: nothing after it runs.
//   * A pending migration older than the newest applied one stops the run:
//     history is applied in order or not at all.
// The database's own guard (destructive_guard) still refuses data loss.
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
const dryRun = process.argv.includes("--dry-run");
if (!url) {
  console.log("SUPABASE_DB_URL is not set: no migrations applied. Add it as a repository secret to turn this on.");
  process.exit(0);
}

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
const outside = new Set(
  readFileSync(new URL("../supabase/applied-outside-history.txt", import.meta.url), "utf8")
    .split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean),
);

// Supabase requires an encrypted connection. SUPABASE_DB_CA (its CA certificate) also verifies the server;
// SUPABASE_DB_SSL=off is only for a local test database.
const ca = process.env.SUPABASE_DB_CA;
const local = process.env.SUPABASE_DB_SSL === "off";
const client = new pg.Client({ connectionString: url, ssl: local ? false : ca ? { ca } : { rejectUnauthorized: false } });
if (!ca && !local) console.log("Note: SUPABASE_DB_CA is not set, so the connection is encrypted but the server certificate is not verified.");
await client.connect();
try {
  const applied = new Set((await client.query("select version from supabase_migrations.schema_migrations")).rows.map((r) => r.version));
  const newest = [...applied].sort().at(-1) ?? "0";
  const pending = files.filter((f) => !applied.has(f.slice(0, 14)));
  if (!pending.length) {
    console.log("Nothing to apply: the live database has every migration.");
    process.exit(0);
  }
  for (const f of pending) {
    const version = f.slice(0, 14);
    const name = f.slice(15, -4);
    const sql = readFileSync(new URL(f, dir), "utf8");
    if (outside.has(version)) {
      console.log(`${dryRun ? "Would record" : "Recording"} ${f} (applied by hand before this runner; not run again)`);
      if (!dryRun) {
        await client.query("insert into supabase_migrations.schema_migrations (version, name, statements, created_by) values ($1, $2, $3, 'ci: recorded, applied by hand')", [version, name, [sql]]);
      }
      continue;
    }
    if (version < newest) throw new Error(`${f} is older than ${newest}, the newest applied migration. Give it a newer version.`);
    console.log(`${dryRun ? "Would apply" : "Applying"} ${f}`);
    if (dryRun) continue;
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into supabase_migrations.schema_migrations (version, name, statements, created_by) values ($1, $2, $3, 'ci')", [version, name, [sql]]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw new Error(`${f} failed and was rolled back; nothing after it was applied: ${err.message}`);
    }
  }
  console.log(dryRun ? "Dry run: nothing changed." : "Done.");
} finally {
  await client.end();
}
