import { describe, expect, it } from "vitest";
import { OPERATING_PARTS, operatingPicture, pictureCoverage, type PictureEvidence } from "../src/domain/operatingPicture";
import { allQuestions, marketingAgencyPlaybook, PLAYBOOKS, smallBusinessPlaybook, smallBusinessPlaybookV1 } from "../src/domain/playbooks";

let n = 0;
const ev = (p: Partial<PictureEvidence>): PictureEvidence => ({ id: `e${++n}`, state: "acquired", fact: "x", structured_value: null, created_at: `2026-11-05T10:00:${String(n).padStart(2, "0")}Z`, ...p });
const part = (views: ReturnType<typeof operatingPicture>, k: string) => views.find((v) => v.part.key === k)!;

describe("operating picture", () => {
  it("with nothing recorded, every part is unknown and lists the questions that would answer it", () => {
    const v = operatingPicture([], smallBusinessPlaybook);
    expect(v.map((x) => x.status)).toEqual(["unknown", "unknown", "unknown", "unknown"]);
    expect(part(v, "time").openQuestions.map((q) => q.key)).toEqual(["time.response", "time.delivery"]);
    expect(part(v, "money").openQuestions.map((q) => q.key)).toEqual(["money.invoicing", "money.spend", "numbers.weekly", "numbers.goal"]);
    expect(pictureCoverage(v)).toEqual({ known: 0, total: 4 });
  });

  it("a website scan fills only how customers get in touch; ownership, money and time stay unknown", () => {
    const v = operatingPicture([
      ev({ fact: "Phone number published: 012 345 6789", structured_value: { kind: "phone" } }),
      ev({ fact: "Page links to WhatsApp", structured_value: { kind: "whatsapp" } }),
      ev({ fact: "Page text captured (500 words)", structured_value: { kind: "page_text" } }),
      ev({ state: "unavailable", fact: null, structured_value: { kind: "email" } }),
    ], smallBusinessPlaybook);
    expect(part(v, "operations").status).toBe("seen_outside");
    expect(part(v, "operations").seen.map((e) => e.fact)).toEqual(["Page links to WhatsApp", "Phone number published: 012 345 6789"]);
    for (const k of ["ownership", "money", "time"]) expect(part(v, k).status).toBe("unknown");
  });

  it("the owner's answers fill their part as statements, and answered questions leave the open list", () => {
    const v = operatingPicture([
      ev({ state: "user_supplied", fact: "About two days to reply", structured_value: { question_key: "time.response", question: "How long to reply?" } }),
      ev({ state: "user_supplied", fact: "I sign every quote", structured_value: { question_key: "owner.decisions", question: "Who decides?" } }),
    ], smallBusinessPlaybook);
    expect(part(v, "time").status).toBe("owner_stated");
    expect(part(v, "time").stated[0]!.question).toBe("How long to reply?");
    expect(part(v, "time").openQuestions.map((q) => q.key)).toEqual(["time.delivery"]);
    expect(part(v, "ownership").status).toBe("owner_stated");
    expect(pictureCoverage(v)).toEqual({ known: 2, total: 4 });
  });

  it("stale or contradicted evidence doesn't count", () => {
    const v = operatingPicture([ev({ state: "stale", structured_value: { kind: "phone" } })], smallBusinessPlaybook);
    expect(part(v, "operations").status).toBe("unknown");
  });

  it("every question in every playbook belongs to exactly one part", () => {
    for (const p of PLAYBOOKS) for (const q of allQuestions(p)) {
      const parts = OPERATING_PARTS.filter((x) => x.questionPrefixes.some((pre) => q.key.startsWith(pre)));
      expect(parts.length, `${p.key} ${q.key}`).toBe(1);
    }
  });

  it("playbook version 2 adds the time questions; version 1 stays readable for interviews already taken", () => {
    expect(smallBusinessPlaybook.version).toBe(2);
    expect(allQuestions(smallBusinessPlaybookV1).some((q) => q.key.startsWith("time."))).toBe(false);
    expect(allQuestions(smallBusinessPlaybook).filter((q) => q.key.startsWith("time.")).length).toBe(2);
    expect(allQuestions(marketingAgencyPlaybook).length).toBeGreaterThan(0);
  });
});
