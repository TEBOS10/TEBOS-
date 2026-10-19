// After `npm run build`: TEBOS and TEPOS are separate web apps, and TEBOS (dist) must carry nothing of TEPOS.
// Neither bundle names the AI or voice providers, and neither carries a privileged database key: the interface
// uses only the signed-in user's session (a service-role JWT's payload base64-encodes "service_role" as c2VydmljZV9yb2xl).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const text = (p) => /\.(js|html|css|json|xml|txt|webmanifest)$/.test(p);
const problems = [];
function forbid(dir, pattern, why) {
  for (const f of files(dir).filter(text)) if (pattern.test(readFileSync(f, "utf8"))) problems.push(`${f}: ${why}`);
}

forbid("dist", /TEPOS|Tidy Capital|IREKUN|tepos-mark|agent_listings|agent_contacts|vault_documents|tepos-vault/, "TEBOS must not contain TEPOS");
for (const d of ["dist", "dist-tepos"]) {
  forbid(d, /anthropic|elevenlabs|claude/i, "names a provider");
  forbid(d, /service_role|c2VydmljZV9yb2xl|sb_secret_[A-Za-z0-9_-]{16,}/, "carries a privileged database key");
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Bundles checked: TEBOS carries nothing of TEPOS; no provider names; no privileged database keys.");
