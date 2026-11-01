// Builds a client's starter website from their config (src/domain/site-template.ts):
//   npx tsx scripts/build-site.ts <site.json> <out-dir> [--release]
// Images are copied from the config's folder; nothing is fetched from the internet. A release build refuses until the
// client has approved the copy and the privacy notice. The output is plain static files: any host can serve them.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { renderSite, type SiteConfig } from "../src/domain/site-template";

const [configPath, outDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const mode = process.argv.includes("--release") ? "release" : "preview";
if (!configPath || !outDir) {
  console.error("Usage: npx tsx scripts/build-site.ts <site.json> <out-dir> [--release]");
  process.exit(2);
}
const config = JSON.parse(readFileSync(configPath, "utf8")) as SiteConfig;
try {
  const site = renderSite(config, mode);
  mkdirSync(outDir, { recursive: true });
  for (const [name, body] of Object.entries(site.files)) writeFileSync(join(outDir, name), body);
  const from = dirname(resolve(configPath));
  for (const src of site.images) {
    mkdirSync(dirname(join(outDir, src)), { recursive: true });
    copyFileSync(join(from, src), join(outDir, src));
  }
  console.log(`Built a ${mode} of ${config.business.name}: ${Object.keys(site.files).length} files, ${site.images.length} images, in ${outDir}.`);
  for (const p of site.problems) console.log(`  still to do before release: ${p.message}`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
