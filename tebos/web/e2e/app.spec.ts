import { expect, test, type Page } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { ACTION, APPROVER_ID, BIZ, FINDING, ORG, USER_ID } from "./fixtures";

const shots = process.env.SCREENSHOT_DIR;
const snap = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test("signed-out visitors see sign-in, not data", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Clayworks")).toHaveCount(0);
  await snap(page, "0-sign-in");
});

test("home shows honest scan states and the command-centre cards", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What do you want TEBOS to work on?" })).toBeVisible();
  await expect(page.getByText("3 targets scanned · 2 acquired · 1 unavailable · confidence 46%")).toBeVisible();
  await expect(page.getByText("waiting for the acquisition worker")).toBeVisible();
  await expect(page.getByText("Reading: last ran")).toBeVisible();
  await expect(page.getByText("0 verified connections")).toBeVisible();
  await snap(page, "1-home");
});

test("a scan shows what was read, what wasn't, and why TEBOS is as confident as it is", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto("/scans");
  await page.getByRole("link", { name: "Clayworks Studio (fictional)" }).last().click();
  await expect(page.getByText("Partial.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "HTTP 503 from the site" })).toBeVisible();
  await expect(page.getByText("not obtained").first()).toBeVisible();
  await expect(page.getByText("Few independent sources agree")).toBeVisible();
  await expect(page.getByText(/claude-opus-5 · 2,140 in \/ 610 out tokens/)).toBeVisible();
  await expect(page.getByText("1 proposed finding was rejected for lack of evidence")).toBeVisible();
  await snap(page, "2-scan");
});

test("a finding answers 'why did TEBOS say this?' with the evidence", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto(`/findings/${FINDING}`);
  await expect(page.getByRole("heading", { name: "Why did TEBOS say this?" })).toBeVisible();
  await expect(page.getByText("Page links to WhatsApp")).toBeVisible();
  await expect(page.getByText('<a href="https://wa.me/27820000000">Order on WhatsApp</a>')).toBeVisible();
  await expect(page.getByText("How orders are recorded after a WhatsApp message")).toBeVisible();
  await snap(page, "3-finding");

  await page.goto("/findings");
  await page.getByRole("link", { name: "No self-service checkout" }).click();
  await expect(page.getByText("Hypothesis.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Reclassified as hypothesis/)).toBeVisible();
});

test("proposing an action derives its risk and approval from the capability", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto(`/findings/${FINDING}`);
  await page.getByRole("button", { name: "Propose an action" }).click();
  await page.getByLabel("Capability required").selectOption("finance.initiate_payment");
  await expect(page.getByText(/Tier 3 · Consequential: needs approval before it runs, from someone other than the requester/)).toBeVisible();
  await expect(page.getByRole("option", { name: "Tier 1 · Internal" })).toHaveAttribute("disabled", "");
});

test("requesting a scan reuses the business record for the domain and queues the scan", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto("/");
  await page.getByLabel("Business website URL").fill("www.clayworks.example/shop");
  await page.getByRole("button", { name: "Add objective or context" }).click();
  await page.getByLabel("Scan objective").fill("Check the order journey");
  await page.getByRole("button", { name: "Scan business" }).click();
  await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Queued. The acquisition worker will pick this scan up")).toBeVisible();
  expect(fake.writes.filter((w) => w.table === "businesses")).toHaveLength(0); // existing record reused
  expect(fake.writes.find((w) => w.table === "scans")?.body).toMatchObject({ objective: "Check the order journey", scope: { url: "https://www.clayworks.example/shop" } });
});

test("an action offers only legal next steps, and explains a refusal", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto(`/actions/${ACTION}`);
  await expect(page.getByText("Required, one execution per approval")).toBeVisible();
  await expect(page.getByRole("button", { name: "Queue for execution" })).toHaveCount(0); // tier 2: approval first
  await snap(page, "4-action");

  fake.refuse({ table: "actions", method: "PATCH", hint: "TEBOS_ILLEGAL_TRANSITION", message: "illegal action transition: ready -> cancelled" });
  await page.getByRole("button", { name: "Cancel action" }).click();
  await expect(page.getByText("That step isn't possible from the current state.")).toBeVisible();
  fake.refuse(null);

  await page.getByRole("button", { name: "Request approval" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "approvals")?.body).toMatchObject({ risk_tier: 2, requested_operation: "Add a structured order form" });
});

test("a viewer can read but gets no controls", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.memberships![0]!.role = "viewer";
  await page.goto("/");
  await expect(page.getByText("You have view access.")).toBeVisible();
  await page.goto(`/actions/${ACTION}`);
  await expect(page.getByText("Your role can view this action but not change it")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request approval" })).toHaveCount(0);
});

test("history, approvals and the audit trail name people, not ids", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.approvals!.push({
    id: "a1", org_id: ORG, action_id: ACTION, requested_operation: "Add a structured order form", risk_tier: 2, status: "rejected", requested_by: USER_ID, requested_at: new Date(Date.now() - 6e5).toISOString(),
    decided_by: APPROVER_ID, decided_at: new Date(Date.now() - 3e5).toISOString(), decision_note: "Needs a test order first", expires_at: null, consumed_at: null, data_scope: null, proposed_action: {},
  });
  await page.goto(`/actions/${ACTION}`);
  await expect(page.getByText("Thandi Mokoena (you)").first()).toBeVisible();
  await expect(page.getByText(/decided by Nia Dlamini/)).toBeVisible();
  await expect(page.getByText(/User 00000000/)).toHaveCount(0);
  await page.goto("/system");
  await expect(page.getByRole("cell", { name: "TEBOS agent" }).first()).toBeVisible();
});

test("someone without a name is asked for one", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.profiles = fake.tables.profiles!.filter((p) => p.user_id !== USER_ID);
  await page.goto("/");
  await page.getByLabel("Your name").fill("Thandi");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "profiles")?.body).toMatchObject({ user_id: USER_ID, display_name: "Thandi" });
});

test("an admin invites a teammate and gets a one-time link", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto("/team");
  await expect(page.getByRole("cell", { name: "Nia Dlamini" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("Sipho@Clayworks.example");
  await page.getByRole("button", { name: /Create invitation/ }).click();
  await expect(page.getByTestId("invite-link")).toContainText("/invite/fixture-invitation-token");
  expect(fake.writes.find((w) => w.table === "create_invitation")?.body).toMatchObject({ p_org: ORG, p_email: "Sipho@Clayworks.example" });
  await expect(page.getByText("sipho@clayworks.example", { exact: true })).toBeVisible();
  await snap(page, "5-team");
});

test("an invitation link can be accepted by someone with no organisation yet", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const other = "10000000-0000-4000-8000-000000000002";
  fake.tables.organisations!.push({ id: other, name: "Clayworks team", slug: "clayworks-team", created_at: new Date().toISOString() });
  fake.tables.memberships = fake.tables.memberships!.filter((m) => m.user_id !== USER_ID);
  fake.tables.invitations!.push({ id: "i1", org_id: other, email: "operator@fixture.test", role: "operator", status: "pending", invited_by: APPROVER_ID, accepted_by: null, created_at: new Date().toISOString(), expires_at: null, accepted_at: null });
  await page.goto("/invite/some-token");
  await expect(page.getByText("operator@fixture.test")).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByText("Clayworks team")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("an expired invitation says so", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto("/invite/expired-token");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByText("This invitation has expired.")).toBeVisible();
});

test("signed-out visitors following an invitation are asked to sign in first", async ({ page }) => {
  await installFakeSupabase(page, { signedIn: false });
  await page.goto("/invite/some-token");
  await expect(page.getByText("You've been invited to TEBOS.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("an outcome is only verified when it was observed and checked, and then allows verification", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const action = fake.tables.actions!.find((a) => a.id === ACTION)!;
  action.status = "completed";
  await page.goto(`/actions/${ACTION}`);
  await page.getByRole("button", { name: "Record an outcome" }).click();
  await page.getByLabel("Metric").fill("Orders captured per week");
  await page.getByLabel("Baseline").fill("12");
  await page.getByLabel("Expected").fill("20");
  await expect(page.getByRole("button", { name: "Record outcome", exact: true })).toBeVisible(); // nothing observed: not verified
  await page.getByLabel("Observed", { exact: true }).fill("19");
  await page.getByLabel("How was the observed value checked?").fill("Counted rows in the order form export");
  await page.getByRole("button", { name: "Record verified outcome" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "outcomes")?.body).toMatchObject({ metric: "Orders captured per week", baseline_value: 12, observed_value: 19, verification_method: "Counted rows in the order form export" });
  await expect(page.getByText(/Verified .*: Counted rows/)).toBeVisible();
  await page.getByRole("button", { name: "Mark verified by outcome" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "actions" && (w.body as { status?: string }).status === "verified")).toBeTruthy();
});

test("the business report labels every statement and exports CSV", async ({ page }) => {
  await installFakeSupabase(page);
  await page.goto(`/businesses/${BIZ}`);
  await page.getByRole("link", { name: "Report" }).click();
  await expect(page).toHaveURL(new RegExp(`/businesses/${BIZ}/report$`));
  await expect(page.getByRole("heading", { name: /business report/ })).toBeVisible();
  for (const label of ["Observed fact", "Interpretation", "Hypothesis", "Recommendation", "User statement"]) {
    await expect(page.locator(".kind-label", { hasText: label }).first()).toBeVisible();
  }
  await expect(page.getByText("Orders get lost between WhatsApp chats and my notebook.")).toBeVisible();
  await expect(page.getByText("What TEBOS could not read")).toBeVisible();
  await expect(page.getByText("HTTP 503 from the site").first()).toBeVisible();
  await snap(page, "6-report");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Findings CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/-findings\.csv$/);
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  expect(text).toContain("finding_id,label,category");
  expect(text).toContain("hypothesis");
});

test("an admin connects Resend; the key goes to the vault and the connection waits for TEBOS's own check", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto("/connections");
  await page.getByLabel("Sender").fill("Clay Studio <orders@clay.example>");
  await page.getByLabel("Resend API key").fill("re_secret_test_key_123");
  await page.getByRole("button", { name: "Save and check with Resend" }).click();
  await expect(page.getByTestId("connection-label")).toHaveText("Configured — not yet verified");
  const insert = fake.writes.find((w) => w.table === "connection_instances");
  expect(insert?.body).toMatchObject({ connector_key: "resend", settings: { from: "Clay Studio <orders@clay.example>" } });
  expect(JSON.stringify(insert?.body)).not.toContain("re_secret");
  expect(fake.writes.find((w) => w.table === "set_connection_secret")?.body).toMatchObject({ p_purpose: "api_key", p_secret: "re_secret_test_key_123" });
  await expect(page.getByText("re_secret_test_key_123")).toHaveCount(0);
  await snap(page, "7-connections");
});

test("a send-only Resend key is shown as connected, with webhook-only delivery confirmation", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.connection_instances!.push({
    id: "c1", org_id: ORG, business_id: null, connector_key: "resend", status: "connected", granted_scopes: ["emails:send"], credential_ref_id: "k1",
    webhook_credential_ref_id: null, last_verified_at: new Date(Date.now() - 6e4).toISOString(), last_success_at: null, last_failure_at: null, failure_detail: null,
    verification_requested_at: null, settings: { from: "orders@clay.example" }, created_by: USER_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  await page.goto("/connections");
  await expect(page.getByTestId("connection-label")).toHaveText("Connected");
  await expect(page.getByText("webhooks only (send-only key)")).toBeVisible();
  await page.getByRole("button", { name: "Check now" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "connection_instances" && w.method === "PATCH")?.body).toHaveProperty("verification_requested_at");
});

test("an email action is proposed with the exact email, which is checked before anyone approves it", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto(`/findings/${FINDING}`);
  await page.getByRole("button", { name: "Propose an action" }).click();
  await page.getByLabel("Action", { exact: true }).fill("Confirm orders by email");
  await page.getByLabel("Objective").fill("Every customer gets a confirmation");
  await page.getByLabel("Capability required").selectOption("email.send_transactional");
  await page.getByPlaceholder("customer@example.com").fill("buyer@clay, other@clay.example");
  await page.getByLabel("Subject", { exact: true }).fill("Your order");
  await page.getByRole("textbox", { name: /^Message/ }).fill("Thank you, we have your order.");
  await expect(page.getByText("Not an email address: buyer@clay")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create proposed action" })).toBeDisabled();
  await page.getByPlaceholder("customer@example.com").fill("buyer@clay.example");
  await page.getByRole("button", { name: "Create proposed action" }).click();
  await expect(page).toHaveURL(/\/actions\//);
  expect(fake.writes.find((w) => w.table === "actions")?.body).toMatchObject({
    execution_method: "api", risk_tier: 2, approval_required: true,
    execution_input: { to: ["buyer@clay.example"], subject: "Your order", text: "Thank you, we have your order.", replyTo: null },
  });
});

test("a provider action can't be started or verified by hand; it waits for TEBOS and the provider", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const action = fake.tables.actions!.find((a) => a.id === ACTION)!;
  Object.assign(action, { status: "queued", execution_method: "api", capability_key: "email.send_transactional",
    execution_input: { to: ["buyer@clay.example"], subject: "Your order", text: "Thank you." } });
  await page.goto(`/actions/${ACTION}`);
  await expect(page.getByTestId("email-preview")).toHaveText("Thank you.");
  await expect(page.getByText("Waiting for TEBOS to send it")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start execution" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit email" })).toHaveCount(0); // frozen after approval

  action.status = "completed";
  fake.tables.action_runs!.push({ id: "r1", org_id: ORG, action_id: ACTION, approval_id: null, connection_instance_id: "c1", capability_key: "email.send_transactional",
    execution_method: "api", status: "succeeded", idempotency_key: "k", request_summary: {}, response_summary: {}, error_class: null, error_detail: null,
    started_at: null, finished_at: null, verified: false, verified_at: null, verification_method: null, provider_reference: "msg_1", provider_status: "accepted",
    provider_status_at: null, created_at: new Date().toISOString() });
  await page.reload();
  await expect(page.getByText("Waiting for the provider to confirm delivery")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify" })).toHaveCount(0);
  await expect(page.getByText(/provider ref msg_1/)).toBeVisible();
});

test("a signed-in person changes their password from their account page", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto("/");
  await page.getByRole("link", { name: "operator@fixture.test" }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await page.getByRole("textbox", { name: /^New password/ }).fill("a-new-password-123");
  await page.getByRole("textbox", { name: /^Repeat new password/ }).fill("a-new-password-12");
  await expect(page.getByText("The two passwords don't match.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change password" })).toBeDisabled();
  await page.getByRole("textbox", { name: /^Repeat new password/ }).fill("a-new-password-123");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();
  expect(fake.writes.find((w) => w.table.startsWith("auth/user"))?.body).toMatchObject({ password: "a-new-password-123" });
});

test("someone who forgot their password can ask for a reset link", async ({ page }) => {
  const fake = await installFakeSupabase(page, { signedIn: false });
  await page.goto("/");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill("operator@fixture.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If that address has a TEBOS account, a reset link is on its way.")).toBeVisible();
  const reset = fake.writes.find((w) => w.table.startsWith("auth/recover"));
  expect(reset?.body).toMatchObject({ email: "operator@fixture.test" });
  expect(decodeURIComponent(reset!.table)).toContain("redirect_to=http://localhost:5174/reset-password");
  await expect(page.getByLabel("Password")).toHaveCount(0);
});

test("the reset link opens a screen to choose a new password", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  await page.goto("/reset-password");
  await page.getByRole("textbox", { name: /^New password/ }).fill("fresh-password-456");
  await page.getByRole("textbox", { name: /^Repeat new password/ }).fill("fresh-password-456");
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.getByRole("button", { name: "Continue to TEBOS" }).click();
  await expect(page.getByRole("heading", { name: "What do you want TEBOS to work on?" })).toBeVisible();
  expect(fake.writes.find((w) => w.table.startsWith("auth/user"))?.body).toMatchObject({ password: "fresh-password-456" });
});

test("creating the first organisation explains what's missing instead of doing nothing", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  fake.tables.memberships = [];
  await page.goto("/");
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect(page.getByText("Type your organisation's name first.")).toBeVisible();
  await page.getByLabel("Short name").fill("tidy-");
  await expect(page.getByLabel("Short name")).toHaveValue("tidy-"); // dashes survive typing
  await page.getByLabel("Organisation name").fill("Tidy Enterprise");
  await page.getByLabel("Short name").fill("");
  await expect(page.getByLabel("Short name")).toHaveValue("tidy-enterprise");
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "create_organisation")?.body).toEqual({ p_name: "Tidy Enterprise", p_slug: "tidy-enterprise" });
});
