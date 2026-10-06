// Marketing and PR drafts (migration content_drafts). TEBOS drafts; a platform
// admin approves; a person publishes and records where. Mirrors the
// database's rules so the interface can explain them; the database decides.

import { OK, fail, type Check } from "./rules";

export const CONTENT_CHANNELS = ["linkedin", "instagram", "facebook", "x", "tiktok", "blog", "press_release", "newsletter"] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];

export const CONTENT_STATUSES = ["draft", "in_review", "approved", "rejected", "published", "withdrawn"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

const NEXT: Record<ContentStatus, readonly ContentStatus[]> = {
  draft: ["in_review", "withdrawn"],
  in_review: ["approved", "rejected", "draft", "withdrawn"],
  rejected: ["draft", "withdrawn"],
  approved: ["published", "withdrawn"],
  published: [],
  withdrawn: [],
};

export interface ContentActor {
  userId: string;
  isAdmin: boolean;
}

/** Whether `me` may move a draft from its status to `to`, with what the move needs. */
export function canMoveDraft(
  d: { status: ContentStatus; authorId: string },
  to: ContentStatus,
  me: ContentActor,
  extra: { reviewNote?: string; publishedUrl?: string } = {},
): Check {
  if (!NEXT[d.status].includes(to)) return fail("TEBOS_ILLEGAL_TRANSITION", `A ${d.status.replace("_", " ")} draft can't become ${to.replace("_", " ")}.`);
  if (!me.isAdmin && d.authorId !== me.userId) return fail("TEBOS_PERMISSION_DENIED", "Staff move only their own drafts.");
  if ((to === "approved" || to === "rejected") && !me.isAdmin) return fail("TEBOS_NOT_APPROVER", "A platform admin approves what TEBOS publishes.");
  if (to === "rejected" && !extra.reviewNote?.trim()) return fail("TEBOS_VALIDATION", "Say why it's rejected.");
  if (to === "published" && !isPublishedUrl(extra.publishedUrl ?? "")) return fail("TEBOS_VALIDATION", "Add the https address where it went live.");
  return OK;
}

export const isPublishedUrl = (u: string) => /^https:\/\/\S+$/.test(u.trim()) && u.trim().length <= 500;

/** The words can change only while it's a draft. */
export const canEditDraft = (status: ContentStatus) => status === "draft";
