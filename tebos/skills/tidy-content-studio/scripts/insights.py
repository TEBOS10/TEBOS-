#!/usr/bin/env python3
"""Summarise an Instagram Insights CSV export honestly: totals with their bases, and each post's own numbers.

Usage: python3 insights.py export.csv
It reads whichever of these columns exist (Instagram renames them now and then): Reach, Likes, Comments, Saves,
Shares, Follows, Profile visits, Plays/Views, Post type, Publish time, Description/Caption. Missing columns are reported
as missing, never filled in.
"""
import csv
import sys

WANT = {
    "reach": ["Reach", "Accounts reached"],
    "views": ["Plays", "Views", "Impressions"],
    "likes": ["Likes"],
    "comments": ["Comments"],
    "saves": ["Saves"],
    "shares": ["Shares"],
    "follows": ["Follows"],
    "visits": ["Profile visits"],
    "type": ["Post type", "Type"],
    "time": ["Publish time", "Date"],
    "text": ["Description", "Caption"],
}


def pick(row, names):
    for n in names:
        if n in row and row[n] not in ("", None):
            return row[n]
    return None


def num(v):
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def main(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print("No posts in the export.")
        return
    cols = rows[0].keys()
    missing = [k for k, names in WANT.items() if not any(n in cols for n in names)]
    print(f"Posts: {len(rows)}")
    if missing:
        print("Not in this export (not estimated): " + ", ".join(missing))
    if len(rows) < 10:
        print("Fewer than 10 posts: describe, don't conclude.")
    posts = []
    for r in rows:
        p = {k: pick(r, names) for k, names in WANT.items()}
        posts.append(p)
    for metric in ("saves", "shares", "follows", "visits"):
        vals = [(num(p[metric]), num(p["reach"])) for p in posts if num(p[metric]) is not None and num(p["reach"])]
        if vals:
            s, r = sum(v for v, _ in vals), sum(r for _, r in vals)
            print(f"{metric}: {int(s)} out of {int(r)} reached across {len(vals)} posts")
    print("\nPost | type | reach | saves | shares | follows | first words")
    ranked = sorted(posts, key=lambda p: num(p["reach"]) or 0, reverse=True)
    for p in ranked:
        words = (p["text"] or "")[:40].replace("\n", " ")
        print(f"{p['time'] or '?'} | {p['type'] or '?'} | {p['reach'] or '-'} | {p['saves'] or '-'} | {p['shares'] or '-'} | {p['follows'] or '-'} | {words}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: insights.py export.csv")
    main(sys.argv[1])
