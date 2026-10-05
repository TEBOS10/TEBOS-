import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { APPROVER_ID, BIZ, ORG, USER_ID } from "./fixtures";

// Architecture proposals: the team proposes who else does a founder-only step,
// and the rule they follow; the owner decides, never on their own proposal.

const now = new Date().toISOString();
function board(t: Record<string, Array<Record<string, unknown>>>) {
  t.board_components = [{ id: "lib", org_id: ORG, business_id: BIZ, name: "Contract library", kind: "document", supplier: null, owner_role: null, description: null,
    basis: "stated", evidence_id: null, connection_id: null, from_blueprint: null, retired_at: null, created_at: now, updated_at: now }];
  t.board_flows = [{ id: "f1", org_id: ORG, business_id: BIZ, name: "Opportunity to signed deal", starts_when: "A deal is found", done_when: "Signed",
    owner_role: null, objective_id: null, basis: "stated", from_blueprint: null, retired_at: null, created_at: now, updated_at: now }];
  const step = (id: string, position: number, name: string) => ({ id, org_id: ORG, business_id: BIZ, flow_id: "f1", position, name, performer: "founder",
    performer_role: "CEO", component_id: null, decision_rule: null, documented: false, basis: "stated", evidence_id: null, from_blueprint: null,
    retired_at: null, created_at: now, updated_at: now });
  t.board_steps = [step("s1", 1, "Approve every contract"), step("s2", 2, "Set the fee")];
}

test("the owner approves a proposal: the founder step is replaced by one with a written rule", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  board(t);
  t.step_proposals = [{ id: "p1", org_id: ORG, business_id: BIZ, step_id: "s1", performer: "staff", performer_role: "Legal", component_id: "lib",
    decision_rule: "Contracts built only from the standard clauses go out without the CEO.", reason: "Deals wait for the CEO to read every contract.",
    status: "proposed", proposed_by: APPROVER_ID, decided_by: null, decided_at: null, decision_note: null, new_step_id: null, created_at: now }];

  await page.goto(`/businesses/${BIZ}/board`);
  const proposal = page.getByTestId("proposal");
  await expect(proposal).toContainText("The team (Legal), on Contract library");
  await expect(proposal).toContainText("Rule: Contracts built only from the standard clauses");
  await expect(proposal.getByRole("button", { name: "Reject" })).toBeDisabled(); // a rejection says why
  await proposal.getByLabel("Note (needed to reject)").fill("Yes, standard clauses are fine");
  await proposal.getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "approve_step_proposal")?.body).toEqual({ p_proposal: "p1", p_note: "Yes, standard clauses are fine" });
  const row = page.getByTestId("flow-step").filter({ hasText: "Approve every contract" });
  await expect(row).toContainText("Rule: Contracts built only from the standard clauses go out without the CEO.");
  await expect(row).toContainText("Team");
  await expect(page.getByTestId("proposal")).toHaveCount(0);
});

test("the team proposes a rule for a founder step; their own proposal waits for the owner and can be withdrawn", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  board(t);
  t.step_proposals = [];
  await page.goto(`/businesses/${BIZ}/board`);
  const row = page.getByTestId("flow-step").filter({ hasText: "Set the fee" });
  await row.getByRole("button", { name: "Propose a rule" }).click();
  const form = page.getByRole("form", { name: "Propose a rule for Set the fee" });
  await expect(form.getByRole("button", { name: "Send to the owner" })).toBeDisabled();
  await form.getByLabel("Who does it instead").selectOption("automation");
  await form.getByLabel("The rule they follow").fill("Fees come from the rate card by package; discounts over 10% go to the CEO.");
  await form.getByLabel("Why: what waits on the founder today").fill("Every deal waits for the CEO to set a fee.");
  await expect(form.getByText("An automated step must name the piece it runs on.")).toBeVisible();
  await form.getByLabel("Who does it instead").selectOption("staff");
  await form.getByLabel("Role (optional)").fill("Sales");
  await form.getByRole("button", { name: "Send to the owner" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "step_proposals" && w.method === "POST")?.body).toEqual({
    org_id: ORG, business_id: BIZ, step_id: "s2", performer: "staff", performer_role: "Sales", component_id: null,
    decision_rule: "Fees come from the rate card by package; discounts over 10% go to the CEO.", reason: "Every deal waits for the CEO to set a fee.",
  });
  // it is ours: we can't approve our own, only withdraw it
  Object.assign(t.step_proposals![0]!, { proposed_by: USER_ID, status: "proposed" }); // the database's defaults
  await page.reload();
  const proposal = page.getByTestId("proposal");
  await expect(proposal).toContainText("Waiting for the owner.");
  await expect(proposal.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await proposal.getByRole("button", { name: "Withdraw" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "step_proposals" && w.method === "PATCH")?.body).toEqual({ status: "withdrawn" });
});
