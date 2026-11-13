"""Capture sheet for one new Ironhold building (art/yard2.py, src/factions/ironhold/look/yard2.ts): clay, painted in game
light from the front and the back, beside the Rigger and the old buildings it stands among, and the zooms.
python3 tools/ironhold-yard-sheet.py <kind> <outdir>   (needs dist/ironhold-bench.html from tools/ironhold-bench.mjs)"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

kind, out = sys.argv[1], sys.argv[2]
H = {'pumpjack': 5, 'twinbay': 3.6, 'labbay': 4.8, 'dugout': 2.2, 'flaktower': 8, 'hangar': 6.5, 'annex': 10, 'surveyrig': 16, 'bastion': 15, 'skids': 6, 'depotsunk': 2}[kind]
W = {'hangar': 11, 'surveyrig': 13, 'bastion': 13, 'skids': 9, 'depotsunk': 6, 'annex': 8}.get(kind, 5.5)
# what stands in the picture: the building itself, or for the parts, the building they go with
main = {'skids': [{'bld': 'bunkhouse', 'args': [], 'x': 0, 'z': 0, 'y': .62}, {'bld': 'skids', 'args': [3.9, 3.0], 'x': 0, 'z': 0}],
        'depotsunk': [{'bld': 'depotSunk', 'args': [], 'x': 0, 'z': 0}]}.get(kind, [{'bld': kind, 'x': 0, 'z': 0}])
host = {'twinbay': ('bunkhouse', 6.3), 'labbay': ('machineshop', 7.4)}.get(kind)
def figs(yaw, clay=False, rig=True):
    fs = [dict(f, yaw=yaw, clay=clay) for f in main]
    if host and not clay:
        import math
        fs.append({'bld': host[0], 'args': [] if host[0] == 'bunkhouse' else None, 'x': host[1] * math.cos(yaw), 'z': -host[1] * math.sin(yaw), 'yaw': yaw})
        if fs[-1]['args'] is None: del fs[-1]['args']
    if rig: fs.append({'kind': 'rigger', 'x': W * .7 + 1, 'z': W * .5, 'yaw': -.6})
    return fs
d = max(H, W) * 2.0
three = {'at': [-d * .75, H * .55 + 1.5, d * .95], 'look': [0, H * .4, 0], 'fov': 42}
shots = [
    {'name': 'clay', 'w': 800, 'h': 800, 'figs': figs(-.5, True, False), 'cam': three},
    {'name': 'paint', 'w': 800, 'h': 800, 'figs': figs(-.5, False, False), 'cam': three},
    {'name': 'back', 'w': 800, 'h': 800, 'figs': figs(2.6, False, False), 'cam': three},
    {'name': 'rigger', 'w': 1000, 'h': 800, 'figs': figs(-.5), 'cam': {'at': [-d * .5, 1.7, d * .9], 'look': [W * .2, H * .4, 0], 'fov': 55}},
    {'name': 'z-near', 'w': 1000, 'h': 640, 'figs': figs(-.5), 'cam': {'at': [-18, 4, 26], 'look': [0, H * .4, 0], 'fov': 60}},
    {'name': 'z-mid', 'w': 1000, 'h': 640, 'figs': figs(-.5), 'cam': {'at': [-70, 22, 30], 'look': [0, H * .4, 0], 'fov': 60}},
    {'name': 'z-cmd', 'w': 1000, 'h': 640, 'figs': figs(-.5), 'cam': {'at': [0, 44, 28], 'look': [0, 0, 0], 'fov': 50}},
    {'name': 'z-map', 'w': 640, 'h': 640, 'figs': figs(0), 'cam': {'top': [0, 0], 'span': 60}},
]
os.makedirs(out, exist_ok=True)
spec = os.path.join(out, kind + '-spec.json'); json.dump(shots, open(spec, 'w'))
raw = os.path.join(out, 'raw-' + kind)
subprocess.run(['node', 'tools/ironhold-shots.cjs', 'dist/ironhold-bench.html', spec, raw], check=True)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26)
except Exception: font = ImageFont.load_default()
def im(n, w):
    a = Image.open(os.path.join(raw, n + '.png')).convert('RGB'); return a.resize((w, int(a.height * w / a.width)))
def inset(a, n, cw, ch, z=3):
    b = Image.open(os.path.join(raw, n + '.png')).convert('RGB')
    c = b.crop((b.width // 2 - cw // 2, b.height // 2 - ch // 2, b.width // 2 + cw // 2, b.height // 2 + ch // 2)).resize((cw * z, ch * z), Image.NEAREST)
    k = a.width / b.width; c = c.resize((int(c.width * k), int(c.height * k)))
    a.paste(c, (a.width - c.width - 6, a.height - c.height - 6)); ImageDraw.Draw(a).rectangle((a.width - c.width - 7, a.height - c.height - 7, a.width - 6, a.height - 6), outline=(255, 194, 26), width=3); return a
def lab(a, t):
    g = ImageDraw.Draw(a); g.rectangle((0, 0, 14 + len(t) * 16, 38), fill=(14, 13, 20)); g.text((8, 5), t, fill=(255, 194, 26), font=font); return a
rows = [[lab(im('clay', 600), 'clay'), lab(im('paint', 600), 'painted, game light'), lab(im('back', 600), 'back'), lab(im('rigger', 750), 'beside the Rigger')],
        [lab(inset(im('z-near', 760), 'z-near', 240, 150, 2), 'near, 32 m (inset x2)'), lab(inset(im('z-mid', 760), 'z-mid', 140, 90), 'middle, 80 m (inset x3)'),
         lab(inset(im('z-cmd', 760), 'z-cmd', 160, 100), 'command view (inset x3)'), lab(inset(im('z-map', 480), 'z-map', 110, 110), 'full map, 60 m (inset x3)')]]
Wd = max(sum(a.width for a in r) for r in rows); Ht = sum(max(a.height for a in r) for r in rows)
sheet = Image.new('RGB', (Wd, Ht + 70), (14, 13, 20))
ImageDraw.Draw(sheet).text((16, 18), kind.upper() + '  -  Ironhold building, stream E capture sheet', fill=(255, 194, 26), font=font)
y = 70
for r in rows:
    x = 0
    for a in r: sheet.paste(a, (x, y)); x += a.width
    y += max(a.height for a in r)
sheet.save(os.path.join(out, kind + '.jpg'), quality=84); print(os.path.join(out, kind + '.jpg'), sheet.size)
