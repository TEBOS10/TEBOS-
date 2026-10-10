import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { USER_ID } from "./fixtures";

// Marketing and PR drafts: staff draft, a platform admin approves, and a person
// publishes it and records where it went live. TEBOS never publishes anything.

const now = new Date().toISOString();
const REP = "99a10000-0000-4000-8000-0000000000b2";
const draft = (id: string, over: Record<string, unknown>) => ({
  id, channel: "linkedin", title: null, body: "TEBOS runs the work a business repeats.", status: "draft", author_id: USER_ID,
  reviewed_by: null, reviewed_at: null, review_note: null, published_url: null, published_at: null, published_by: null, created_at: now, updated_at: now, ...over,
});

test("a salesperson drafts a post and sends it for approval; they can't approve it themselves", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  t.platform_admins = [];
  t.platform_staff = [{ user_id: USER_ID, role: "sales", added_by: null, created_at: now }];
  t.content_drafts = [];

  await page.goto("/marketing");
  await expect(page.getByRole("heading", { name: "Marketing and PR" })).toBeVisible();
  await expect(page.getByText("No drafts yet.")).toBeVisible();
  await page.getByRole("button", { name: "New draft" }).click();
  const form = page.getByRole("form", { name: "New draft" });
  await expect(form.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await form.getByLabel("Channel").selectOption("press_release");
  await form.getByLabel("Title (optional)").fill("TEBOS opens its waiting list");
  await form.getByLabel("Text").fill("Johannesburg, October 2026. TEBOS opens its waiting list.");
  await form.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "content_drafts" && w.method === "POST")?.body).toEqual({
    channel: "press_release", title: "TEBOS opens its waiting list", body: "Johannesburg, October 2026. TEBOS opens its waiting list.",
  });

  Object.assign(t.content_drafts[0]!, draft(String(t.content_drafts[0]!.id), { channel: "press_release", title: "TEBOS opens its waiting list", body: "Johannesburg, October 2026. TEBOS opens its waiting list." })); // the database's defaults
  await page.reload();
  const card = page.getByTestId("draft");
  await expect(card).toContainText("Press release: TEBOS opens its waiting list");
  await card.getByRole("button", { name: "Send for approval" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "content_drafts" && w.method === "PATCH")?.body).toEqual({ status: "in_review" });

  t.content_drafts[0]!.status = "in_review";
  await page.reload();
  await expect(card).toContainText("waiting for approval");
  await expect(card.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Back to draft" })).toBeVisible();
});

test("a platform admin sends a draft back with a note, approves another, and records where an approved one went live", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  t.platform_admins = [{ user_id: USER_ID, created_at: now }];
  t.platform_staff = [{ user_id: REP, role: "sales", added_by: null, created_at: now }];
  t.staff_profiles = [{ user_id: REP, display_name: "Sipho" }];
  t.content_drafts = [
    draft("d1", { status: "in_review", author_id: REP, body: "We guarantee 50% more revenue." }),
    draft("d2", { status: "in_review", author_id: REP, channel: "instagram", body: "Your business, mapped." }),
    draft("d3", { status: "approved", author_id: REP, channel: "blog", title: "Foundations first", reviewed_by: USER_ID, reviewed_at: now }),
  ];

  await page.goto("/marketing");
  const promise = page.getByTestId("draft").filter({ hasText: "We guarantee" });
  await expect(promise).toContainText("By Sipho");
  await expect(promise.getByRole("button", { name: "Send back" })).toBeDisabled(); // a rejection says why
  await promise.getByLabel("Review note (needed to send it back)").fill("We can't promise revenue: say what TEBOS does.");
  await promise.getByRole("button", { name: "Send back" }).click();
  await expect.poll(() => fake.writes.find((w) => w.table === "content_drafts" && w.method === "PATCH")?.body).toEqual({
    status: "rejected", review_note: "We can't promise revenue: say what TEBOS does.",
  });

  await page.getByTestId("draft").filter({ hasText: "Your business, mapped." }).getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => fake.writes.filter((w) => w.table === "content_drafts" && w.method === "PATCH")[1]?.body).toEqual({ status: "approved", review_note: null });

  const blog = page.getByTestId("draft").filter({ hasText: "Foundations first" });
  await expect(blog).toContainText("approved: ready to publish");
  const record = blog.getByRole("button", { name: "Record as published" });
  await blog.getByLabel("Where it went live (https address)").fill("http://tebos.blog/foundations");
  await expect(record).toBeDisabled(); // https only
  await blog.getByLabel("Where it went live (https address)").fill("https://tebos.blog/foundations");
  await record.click();
  await expect.poll(() => fake.writes.filter((w) => w.table === "content_drafts" && w.method === "PATCH")[2]?.body).toEqual({
    status: "published", published_url: "https://tebos.blog/foundations",
  });
});

test("a marketer works from their drafts and their playbook, with no pipeline in sight", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as Record<string, Array<Record<string, unknown>>>;
  t.memberships = [];
  t.platform_admins = [];
  t.platform_staff = [{ user_id: USER_ID, role: "marketing", added_by: null, created_at: now }];
  t.content_drafts = [];
  t.sales_playbook = [
    { id: "s1", department: "sales", key: "plans", position: 10, title: "Plans and prices", body: "Sales only.", updated_by: null, updated_at: now },
    { id: "m1", department: "marketing", key: "claims", position: 20, title: "What we never publish", body: "**Nothing invented.**", updated_by: null, updated_at: now },
  ];

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marketing and PR" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Pipeline" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Sales playbook" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Marketing playbook" }).click();
  await expect(page.getByRole("heading", { name: "Marketing playbook" })).toBeVisible();
  await expect(page.getByText("Nothing invented.")).toBeVisible();
  await expect(page.getByText("Sales only.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);

  // the pipeline isn't theirs, even by its address
  await page.goto("/pipeline");
  await expect(page.getByText("This page is for TEBOS's own staff.")).toBeVisible();
});
