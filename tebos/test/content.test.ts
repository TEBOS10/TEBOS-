import { describe, expect, it } from "vitest";
import { canEditDraft, canMoveDraft, isPublishedUrl } from "../src";

const admin = { userId: "boss", isAdmin: true };
const rep = { userId: "rep", isAdmin: false };

describe("marketing drafts", () => {
  it("goes draft → review → approved → published, and nothing skips review", () => {
    expect(canMoveDraft({ status: "draft", authorId: "rep" }, "in_review", rep)).toEqual({ ok: true });
    expect(canMoveDraft({ status: "draft", authorId: "rep" }, "approved", admin)).toMatchObject({ code: "TEBOS_ILLEGAL_TRANSITION" });
    expect(canMoveDraft({ status: "draft", authorId: "rep" }, "published", rep, { publishedUrl: "https://x.com/1" })).toMatchObject({ code: "TEBOS_ILLEGAL_TRANSITION" });
    expect(canMoveDraft({ status: "published", authorId: "rep" }, "withdrawn", admin)).toMatchObject({ ok: false });
  });
  it("only a platform admin approves or rejects, and a rejection says why", () => {
    expect(canMoveDraft({ status: "in_review", authorId: "rep" }, "approved", rep)).toMatchObject({ code: "TEBOS_NOT_APPROVER" });
    expect(canMoveDraft({ status: "in_review", authorId: "rep" }, "approved", admin)).toEqual({ ok: true });
    expect(canMoveDraft({ status: "in_review", authorId: "rep" }, "rejected", admin)).toMatchObject({ code: "TEBOS_VALIDATION" });
    expect(canMoveDraft({ status: "in_review", authorId: "rep" }, "rejected", admin, { reviewNote: "Too long" })).toEqual({ ok: true });
  });
  it("staff move only their own drafts", () => {
    expect(canMoveDraft({ status: "draft", authorId: "someone" }, "in_review", rep)).toMatchObject({ code: "TEBOS_PERMISSION_DENIED" });
  });
  it("published needs the https address where it went live", () => {
    expect(canMoveDraft({ status: "approved", authorId: "rep" }, "published", rep)).toMatchObject({ code: "TEBOS_VALIDATION" });
    expect(isPublishedUrl("http://insecure.example")).toBe(false);
    expect(isPublishedUrl("https://www.linkedin.com/posts/tebos-1")).toBe(true);
    expect(canMoveDraft({ status: "approved", authorId: "rep" }, "published", rep, { publishedUrl: "https://www.linkedin.com/posts/tebos-1" })).toEqual({ ok: true });
  });
  it("the words change only while it's a draft", () => {
    expect(canEditDraft("draft")).toBe(true);
    expect(canEditDraft("in_review")).toBe(false);
    expect(canEditDraft("approved")).toBe(false);
  });
});
