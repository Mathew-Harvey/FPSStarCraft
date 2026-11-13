"""Lays the shots tools/veyl/shots.cjs took of one figure out as one capture sheet.
    python3 tools/veyl/sheet.py <kind> <shots dir> <out.jpg> [clay.png]
Top: the Blender clay view (if given). Then the zooms two to a row, then the first person view models and every pose, four to a row."""
import os
import sys
from PIL import Image, ImageDraw

k, d, out = sys.argv[1], sys.argv[2], sys.argv[3]
clay = sys.argv[4] if len(sys.argv) > 4 else None
W = 1280
BG, INK = (20, 18, 26), (255, 230, 150)


def label(dr, x, y, t):
    dr.rectangle((x, y, x + 8 + 6 * len(t), y + 16), fill=BG)
    dr.text((x + 4, y + 2), t, fill=INK)


def load(n):
    p = f'{d}/{k}-{n}.png'
    return Image.open(p).convert('RGB') if os.path.exists(p) else None


big = [(n, t) for n, t in (('paint', 'painted, game light, 5 m'), ('near', 'near, 20 m'), ('mid', 'middle, 80 m'),
                           ('cmd', 'command view (centre, 3x)'), ('map', 'straight down (what the map draws)'), ('line', 'beside Cantor and Warden'), ('field', 'in a song field'), ('silent', 'silent (out of any field)')) if load(n)]
small = []
if os.path.exists(f'{d}/{k}-vm.txt'):
    small += [('vm-' + m, 'first person: ' + m) for m in open(f'{d}/{k}-vm.txt').read().split()]
if os.path.exists(f'{d}/{k}-poses.txt'):
    small += [('pose-' + m, 'pose: ' + m) for m in open(f'{d}/{k}-poses.txt').read().split()]
small = [s for s in small if load(s[0])]
ci = None
if clay and os.path.exists(clay):
    ci = Image.open(clay).convert('RGB')
    ci = ci.resize((W, round(ci.height * W / ci.width)))
top = ci.height if ci else 0
rows_b, rows_s = (len(big) + 1) // 2, (len(small) + 3) // 4
sheet = Image.new('RGB', (W, top + rows_b * 360 + rows_s * 180), BG)
dr = ImageDraw.Draw(sheet)
if ci:
    sheet.paste(ci, (0, 0))
    label(dr, 0, 0, 'clay: front, three quarters, side, back')
for i, (n, t) in enumerate(big):
    im = load(n)
    if n == 'cmd':
        w, h = im.size
        im = im.crop((w // 2 - w // 6, h // 2 - h // 6, w // 2 + w // 6, h // 2 + h // 6))
    x, y = (i % 2) * 640, top + (i // 2) * 360
    sheet.paste(im.resize((640, 360)), (x, y))
    label(dr, x, y, t)
for i, (n, t) in enumerate(small):
    x, y = (i % 4) * 320, top + rows_b * 360 + (i // 4) * 180
    sheet.paste(load(n).resize((320, 180)), (x, y))
    label(dr, x, y, t)
sheet.save(out, quality=86)
print(out, sheet.size)
