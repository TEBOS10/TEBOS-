import { expect, test } from "@playwright/test";
import { installFakeSupabase } from "./fake-supabase";
import { BIZ, ORG } from "./fixtures";

// The operating picture: what a website can't show is said plainly, never estimated. Founder's request, 5 Nov 2026.
test("a business shows its operating picture: what was seen outside, what the owner said, and what is still unknown", async ({ page }) => {
  const fake = await installFakeSupabase(page);
  const t = fake.tables as unknown as Record<string, Array<Record<string, unknown>>>;
  const wa = t.evidence!.find((e) => e.fact === "Page links to WhatsApp")!;
  wa.structured_value = { kind: "whatsapp" };
  t.evidence!.push({ ...wa, id: "e9000000-0000-4000-8000-000000000001", state: "user_supplied", fact: "Usually two days before we reply",
    excerpt: "Usually two days before we reply", structured_value: { question_key: "time.response", question: "How long before someone replies?" },
    org_id: ORG, business_id: BIZ, scan_id: null, scan_target_id: null });
  await page.goto(`/businesses/${BIZ}`);
  const pic = page.getByTestId("operating-picture");
  await expect(pic).toBeVisible();
  const ops = pic.getByRole("region", { name: "How the work flows" });
  await expect(ops).toContainText("Seen from outside");
  await expect(ops).toContainText("Page links to WhatsApp");
  const time = pic.getByRole("region", { name: "How long things take" });
  await expect(time).toContainText("Owner's statement");
  await expect(time).toContainText("Usually two days before we reply");
  const money = pic.getByRole("region", { name: "The money" });
  await expect(money).toContainText("Not known");
  await expect(money).toContainText("A private business's revenue and margins are not public.");
  await money.getByText(/questions? would fill this in/).click();
  await expect(money).toContainText("Which numbers do you look at each week or month");
  await expect(page.getByText("2 of 4 parts have anything recorded")).toBeVisible();
});
