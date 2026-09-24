// Finding-quality check against the real reasoning provider.
//
//   ANTHROPIC_API_KEY=… npm run eval:findings
//
// Costs real money (one model call per fixture). For each fixture it prints
// what was proposed, what TEBOS accepted or rejected and why, whether the
// expected topics were covered, and the token cost. A healthy result:
// nothing rejected for invented or unobtained references, every expected
// topic covered, absence claims reclassified rather than asserted.
import { AnthropicProvider } from "../src/intelligence/anthropic-provider";
import { prepareFindingsRequest, validateProposals } from "../src/intelligence/findings";
import { FIXTURES } from "./findings-fixtures";

// claude-opus-5 list prices per million tokens (input, output), USD.
const PRICE = { input: 5, output: 25 };

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY to run the finding-quality check (it makes real, billed model calls).");
  process.exit(2);
}
const provider = new AnthropicProvider();
let failures = 0;
let spend = 0;

for (const fx of FIXTURES) {
  const prepared = prepareFindingsRequest(fx.input);
  const response = await provider.structured(prepared.request);
  const { accepted, rejected } = validateProposals(response.value, prepared.refs, fx.input);
  const cost = (response.usage.inputTokens * PRICE.input + response.usage.outputTokens * PRICE.output) / 1e6;
  spend += cost;

  const text = accepted.map((f) => `${f.title} ${f.statement}`.toLowerCase()).join(" ");
  const uncovered = fx.shouldMention.filter((alts) => !alts.some((a) => text.includes(a)));
  const badRefs = rejected.filter((r) => /never obtained|no such evidence|No obtained evidence/.test(r.reason));

  console.log(`\n=== ${fx.name}  [${response.model}, ${response.usage.inputTokens}+${response.usage.outputTokens} tokens, $${cost.toFixed(4)}]`);
  for (const f of accepted) {
    console.log(`  ✓ ${f.kind.padEnd(14)} ${String(Math.round(f.confidence * 100)).padStart(3)}%  ${f.title}`);
    console.log(`      ${f.statement}`);
    for (const a of f.adjustments) console.log(`      ↳ ${a}`);
  }
  for (const r of rejected) console.log(`  ✗ ${r.title} — ${r.reason}`);
  if (uncovered.length) console.log(`  ! expected topics not covered: ${uncovered.map((u) => u.join("/")).join(", ")}`);
  if (badRefs.length) console.log(`  ! ${badRefs.length} finding(s) rejected for unsupported citations`);
  if (uncovered.length || badRefs.length || accepted.length === 0) failures++;
}

console.log(`\n${FIXTURES.length - failures}/${FIXTURES.length} fixtures healthy · total spend ≈ $${spend.toFixed(4)}`);
process.exit(failures ? 1 : 0);
