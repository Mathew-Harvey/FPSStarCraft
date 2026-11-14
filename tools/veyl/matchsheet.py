"""Lays out the in-match shots tools/veyl/match.mjs took of one kind as one sheet: the five zooms on top, then stances, abilities and states.
    python3 tools/veyl/matchsheet.py <shots dir> <kind> <out.jpg>"""
import os
import sys
from PIL import Image, ImageDraw

d, k, out = sys.argv[1:4]
BG, INK, W = (20, 18, 26), (255, 230, 150), 1280
rows = [l.split('\t') for l in open(f'{d}/{k}.txt').read().splitlines() if l.strip()]
seen, shots = set(), []
for n, c in rows:                       # a later caption for the same shot wins (a building's close shot says whether it was sung)
    if n in seen:
        shots = [(a, c if a == n else b) for a, b in shots]
    else:
        seen.add(n)
        shots.append((n, c))
shots = [(n, c) for n, c in shots if os.path.exists(f'{d}/{n}.png')]
top = [s for s in shots if s[0].split('-', 1)[1] in ('fp', 'close', 'cmdnear', 'cmdfar', 'map')]
rest = [s for s in shots if s not in top]
rt, rr = (len(top) + 1) // 2, (len(rest) + 3) // 4
sheet = Image.new('RGB', (W, 30 + rt * 360 + rr * 180), BG)
dr = ImageDraw.Draw(sheet)
dr.text((8, 8), f'{k}: in a real match (tools/veyl/match.mjs)', fill=INK)


def put(n, c, x, y, w, h):
    sheet.paste(Image.open(f'{d}/{n}.png').convert('RGB').resize((w, h)), (x, y))
    dr.rectangle((x, y, x + 8 + 6 * len(c), y + 16), fill=BG)
    dr.text((x + 4, y + 2), c, fill=INK)


for i, (n, c) in enumerate(top):
    put(n, c, (i % 2) * 640, 30 + (i // 2) * 360, 640, 360)
for i, (n, c) in enumerate(rest):
    put(n, c, (i % 4) * 320, 30 + rt * 360 + (i // 4) * 180, 320, 180)
sheet.save(out, quality=84)
print(out, sheet.size)
