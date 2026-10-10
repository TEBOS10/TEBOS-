#!/usr/bin/env node
// Checks the migrations a pull request adds, before anything can reach the
// live database. Run by CI on every pull request:
//   node tebos/scripts/check-migrations.mjs <base-ref>
//
//   * Applied migrations are history: none may be changed, renamed or deleted.
//   * A new migration is named <14-digit version>_<snake_case>.sql, and its
//     version is newer than every existing one (the runner applies in order).
//   * A new migration may not destroy data (drop a table, column, schema or
//     sequence, truncate, delete rows) or touch the database's guard against
//     it, unless the founder has labelled the pull request
//     founder-approved-destructive (FOUNDER_APPROVED_DESTRUCTIVE=true).
//     The database refuses such statements anyway (destructive_guard); this
//     check says so before merge, with the line.
import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "origin/main";
const approved = process.env.FOUNDER_APPROVED_DESTRUCTIVE === "true";
const DIR = "tebos/supabase/migrations/";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const changes = git("diff", "--name-status", "--no-renames", `${base}...HEAD`, "--", DIR)
  .split("\n").filter(Boolean).map((l) => l.split("\t"));
const existing = git("ls-tree", "--name-only", base, DIR).split("\n").filter(Boolean).map((p) => p.slice(DIR.length));
const latest = existing.map((f) => f.slice(0, 14)).sort().at(-1) ?? "0";

const DESTRUCTIVE = [
  [/\bdrop\s+(table|schema|materialized\s+view|sequence)\b/i, "drops a table, schema, view or sequence"],
  [/\bdrop\s+column\b/i, "drops a column"],
  [/\btruncate\b/i, "empties a table"],
  [/\bdelete\s+from\b/i, "deletes rows"],
  [/\btebos\.allow_destructive\b/i, "lifts the database's guard against data loss"],
  [/\btebos_guard\b|\bevent\s+trigger\b/i, "changes the database's guard against data loss"],
];

const problems = [];
for (const [status, path] of changes) {
  const file = path.slice(DIR.length);
  if (status !== "A") {
    problems.push(`${file}: an applied migration was ${status === "D" ? "deleted" : "changed"}. Write a new migration instead.`);
    continue;
  }
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) problems.push(`${file}: name it <14-digit version>_<snake_case>.sql`);
  if (file.slice(0, 14) <= latest) problems.push(`${file}: its version must be newer than ${latest}, the latest migration`);
  const sql = git("show", `HEAD:${path}`).replace(/--[^\n]*/g, "");
  sql.split("\n").forEach((line, i) => {
    for (const [re, what] of DESTRUCTIVE) {
      if (re.test(line) && !approved) problems.push(`${file}:${i + 1}: ${what}. Needs the founder's label founder-approved-destructive.`);
    }
  });
}

const added = changes.filter(([s]) => s === "A").length;
if (problems.length) {
  console.error(`Migration check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Migration check passed: ${added} new migration(s)${approved && added ? " (founder approved destructive changes)" : ""}.`);
