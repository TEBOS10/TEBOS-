# Turning a talking video into an edited short (job 10)

The aim is the "raw video to edited" result: captions that carry the meaning, a few strong text cards, and a tight
open. The plan is produced here; the edit itself is done in CapCut, Instagram's editor or a video tool.

## From the transcript

1. **The hook.** Find the single most surprising or valuable sentence. If it isn't in the first 2 seconds, cut it to
   the front as a cold open.
2. **Captions.** Run `python3 scripts/srt.py transcript.txt > captions.srt`. It splits into lines of at most 32
   characters and 2 lines per card, and keeps the speaker's timing.
3. **Text cards.** Each number or key phrase the speaker says (a time, an amount, a name) becomes a full-screen card
   for 1–1.5 seconds. Use only numbers the speaker actually said, written exactly as said.
4. **Cuts.** Remove the dead air, the "um" and repeated starts. List each cut as `start → end: why`.
5. **The end.** The last 2 seconds hold the call to action on screen.

## Rules

- Captions are word for word. Never rephrase someone's words in a caption.
- A card's number must match the transcript. If a figure is a claim (like "$1.5M a video"), the card says who claims
  it.
- Someone else's footage is used only with permission, or within fair commentary with credit. Not a client's brand
  without consent.
