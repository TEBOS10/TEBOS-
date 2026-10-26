#!/usr/bin/env python3
"""Turn a timestamped transcript into an .srt caption file.

Input lines look like:  [00:01.2] We work on a video for three to four months
(each line is one spoken segment; its end is the next line's start, the last one lasts 2.5 seconds).
Output: SRT cards of at most 2 lines of 32 characters, the segment's time shared across its cards by word count.
"""
import re
import sys

LINE = 32
TS = re.compile(r"^\[(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$")


def parse(text):
    out = []
    for raw in text.splitlines():
        m = TS.match(raw.strip())
        if not m:
            continue
        h, mnt, sec, words = m.groups()
        out.append((int(h or 0) * 3600 + int(mnt) * 60 + float(sec), words.strip()))
    return [s for s in out if s[1]]


def wrap(words):
    """Group words into cards of up to two lines of LINE characters."""
    cards, card, line = [], [], ""
    for w in words:
        nxt = (line + " " + w).strip()
        if len(nxt) <= LINE:
            line = nxt
            continue
        card.append(line)
        line = w
        if len(card) == 2:
            cards.append(card)
            card = []
    if line:
        card.append(line)
    if card:
        cards.append(card)
    return cards


def stamp(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def to_srt(segments):
    out, n = [], 1
    for i, (start, text) in enumerate(segments):
        end = segments[i + 1][0] if i + 1 < len(segments) else start + 2.5
        cards = wrap(text.split())
        total = sum(len(" ".join(c).split()) for c in cards) or 1
        t = start
        for c in cards:
            share = (end - start) * len(" ".join(c).split()) / total
            out.append(f"{n}\n{stamp(t)} --> {stamp(t + share)}\n" + "\n".join(c) + "\n")
            n += 1
            t += share
    return "\n".join(out)


if __name__ == "__main__":
    src = open(sys.argv[1], encoding="utf-8").read() if len(sys.argv) > 1 else sys.stdin.read()
    sys.stdout.write(to_srt(parse(src)))
