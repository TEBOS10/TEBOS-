---
name: tidy-content-studio
description: Plans, writes, reviews and packages social content for the founder's brands (TEBOS, BAME, the founder's Pelser property listings, Property Revenue Architecture). Use when asked to plan a week of posts, write reel scripts or captions, audit a profile, review post performance from Instagram Insights, draft comment or DM replies, build a listing content pack, or turn a video transcript into captions and an edit plan. Drafts only; nothing is posted or sent.
---

# Tidy Content Studio

One skill, eleven jobs, four brands. It turns real material (a listing's facts, an Insights export, a transcript, a
profile screenshot) into content the founder approves and posts. It never posts, sends, replies or follows on its
own, and never invents a number, a client or a result.

## First: which brand, and what do we actually have?

Ask only if it isn't clear from the request:

1. **The brand.** Read its rules before writing anything:
   - TEBOS → `references/brands.md#tebos`
   - BAME → `references/brands.md#bame`
   - A Pelser listing or the founder as agent → `references/real-estate.md` (the property-advertising rules come first)
   - PRA → `references/brands.md#pra`
2. **The material.** Work only from what was given: stated facts, screenshots, exports, transcripts. Anything missing
   is written as `[to confirm: …]`, never filled with a plausible guess.

## The eleven jobs

| # | Job | Input | Output |
|---|---|---|---|
| 1 | Profile audit | Profile screenshot or description | Bio, highlights, pinned posts and link: what to keep, change, remove; one rewritten bio |
| 2 | Weekly plan | The brand, the week's goal, what's happening that week | 3–5 posts across the brand's pillars, each with format, hook and its single job (reach, trust or enquiry) |
| 3 | Reel scripts | A topic or a plan slot | Hook (first 2 seconds), 3 beats, one call to action; spoken lines and on-screen text separated; 20–40 seconds |
| 4 | Captions | A post or script | Caption with a first line that stands alone, the call to action, and up to 5 specific hashtags |
| 5 | Comment and DM replies | The comments or messages, pasted | A draft reply for each; anything about price, a contract, a complaint or personal details is flagged "founder replies personally" |
| 6 | Performance review | An Insights export (CSV) or screenshots | Run `scripts/insights.py` on a CSV. Report what moved (reach, saves, shares, profile visits, follows, enquiries) and how sure we can be (`references/performance.md`) |
| 7 | Why it worked | The review | 2–3 patterns with the posts that show them, labelled "seen once", "seen twice" or "seen 3+ times" |
| 8 | Winning-script library | The patterns | New entries for the brand's script library, each with the evidence and the date |
| 9 | Listing content pack | A listing's stated facts | Shot list, reel script, carousel, caption and portal text, all through `references/real-estate.md` |
| 10 | Video edit plan | A transcript with timestamps | Captions as an `.srt` file (`scripts/srt.py`), on-screen text cards (key numbers and words), a cut list, and one hook re-cut for the first 2 seconds (`references/video-edit.md`) |
| 11 | Pre-post check | Any finished piece | The brand's checklist. "Ready for the founder's approval" or the exact fixes |

## Rules that never bend

- **Drafts only.** The founder approves and posts. No scheduling, posting, replying, following or messaging on
  anyone's behalf.
- **Nothing invented:** no follower counts, results, testimonials, client names, sale prices, "sold in 3 days", or
  quotes. A number appears only if it was given, with where it came from.
- **People and consent.** No client, athlete, buyer or seller is named, shown or quoted without their written consent
  and the founder's confirmation. No personal contact details in any post.
- **Honest claims.** No guaranteed outcomes: not sponsorship, not a sale price, not followers, not "viral".
  "Helps", "aims to" and "here's what we did" are fine.
- **Small numbers are small.** One good post is a hint, not a pattern. Say so (`references/performance.md`).
- **Property advertising** follows `references/real-estate.md` without exception: the agency's name, the founder's
  status, the principal's approval.

## Output format

End every job with:
- **Ready for approval:** what is finished.
- **To confirm:** every `[to confirm]` item, as a short list.
- **Do not post until:** any approval still needed (the principal, a client's consent, the founder).
