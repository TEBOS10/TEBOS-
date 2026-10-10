import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { BIZ, ORG } from "./fixtures";

// The System page says plainly when analysis is paused because TEBOS's reasoning
// service refused its set-up, and never shows the service's raw error or name.
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const run = (id: string, minutesAgo: number, over: Record<string, unknown>) => ({
  id, org_id: ORG, business_id: BIZ, agent_role: "business_intelligence", purpose: "Business review", scan_id: null, status: "succeeded",
  started_at: at(minutesAgo), finished_at: at(minutesAgo), model_provider: null, model: null, tokens_in: null, tokens_out: null,
  input_context: {}, output_summary: { findings: 0 }, error_detail: null, ...over,
});
const raw = 'misconfigured: Anthropic rejected the request: 400 {"type":"error"}';

test("a client sees that analysis is paused, in plain words, without the provider's raw error", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.agent_runs = [
    run("r3", 5, { status: "failed", output_summary: { findings: 0, providerFault: true }, error_detail: raw }),
    run("r2", 40, { status: "failed", output_summary: { findings: 0, providerFault: true, fault: "misconfigured" }, error_detail: "Analysis is paused: TEBOS's reasoning service refused its set-up." }),
    run("r1", 120, {}),
  ];
  await page.goto("/system");
  await expect(page.getByTestId("analysis-paused")).toContainText("Analysis is paused");
  await expect(page.getByText(/Anthropic/)).toHaveCount(0);
  await expect(page.getByText(/"type":"error"/)).toHaveCount(0);
});

test("no pause notice once analysis succeeds again", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.agent_runs = [run("r2", 5, {}), run("r1", 40, { status: "failed", output_summary: { findings: 0, providerFault: true }, error_detail: raw })];
  await page.goto("/system");
  await expect(page.getByText("Worker runs")).toBeVisible();
  await expect(page.getByTestId("analysis-paused")).toHaveCount(0);
});
