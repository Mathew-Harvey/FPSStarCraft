"""Capture sheet for one new Ironhold figure: clay, painted in game light beside the Rigger, its poses, first person, and the five zooms.
python3 tools/ironhold-sheet.py <kind> <outdir>   (needs dist/ironhold-bench.html from tools/ironhold-bench.mjs)"""
import json, math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

kind, out = sys.argv[1], sys.argv[2]
H = {'sapper': 1.9, 'hauldrone': 1.8, 'dustbike': 1.9, 'piledriver': 3.2}.get(kind, 2.0)
fr = lambda v: v - math.floor(v)
rest_id = lambda want: next(i for i in range(1, 400) if math.floor(fr(math.sin(i * 127.1 + 2 * 311.7) * 43758.5453) * 3) == want)
POSES = {
    'sapper': [('rest 1', {'idle': 12, 'id': rest_id(0)}), ('rest 2: crouched', {'idle': 12, 'id': rest_id(1)}), ('rest 3: sat down', {'idle': 12, 'id': rest_id(2)}),
               ('walk', {'speed': 1, 'dist': .45}), ('run', {'speed': 1.6, 'dist': .9}), ('fire', {'kick': 1, 'pitch': .05}), ('dig in / set charge', {'work': True})],
    'hauldrone': [('hover', {}), ('flying', {'speed': 1}), ('drilling', {'work': True}), ('loaded', {'load': True, 'speed': 1}), ('rest', {'idle': 12})],
    'dustbike': [('rolling', {'speed': 1, 'dist': .3, 'aim': .25}), ('Kick Start', {'speed': 1.6, 'dist': .3}), ('burner', {'kick': 1}), ('rest', {'idle': 12, 'id': 3})],
    'piledriver': [('on the road', {'anchor': 0}), ('anchoring', {'anchor': .5}), ('anchored', {'anchor': 1, 'pitch': .35}), ('fire', {'anchor': 1, 'pitch': .35, 'kick': .5}), ('anchored, turret turned', {'anchor': 1, 'pitch': .2, 'aim': .9})],
}[kind]
d = H * 1.9
three = lambda yaw=-.6: {'at': [-d * .62, H * .75, d * .9], 'look': [0, H * .5, 0], 'fov': 40}
shots = [
    {'name': 'clay', 'w': 800, 'h': 800, 'figs': [{'kind': kind, 'x': 0, 'z': 0, 'yaw': -.6, 'clay': True, 'state': {}}], 'cam': three()},
    {'name': 'paint', 'w': 800, 'h': 800, 'figs': [{'kind': kind, 'x': 0, 'z': 0, 'yaw': -.6, 'state': {}}], 'cam': three()},
    {'name': 'back', 'w': 800, 'h': 800, 'figs': [{'kind': kind, 'x': 0, 'z': 0, 'yaw': 2.5, 'state': {}}], 'cam': three()},
    {'name': 'rigger', 'w': 1000, 'h': 800, 'figs': [{'kind': kind, 'x': 0, 'z': 0, 'yaw': -.6, 'state': {}}, {'kind': 'rigger', 'x': H * .55 + .8, 'z': -.8, 'yaw': -.6}], 'cam': {'at': [-d * .7, H * .7, d * 1.1], 'look': [H * .3, H * .45, 0], 'fov': 40}},
    {'name': 'fp', 'w': 1000, 'h': 640, 'figs': [{'kind': kind, 'x': 0, 'z': 0, 'yaw': 0, 'fp': True, 'state': {}}], 'cam': {'fp': True}},
    {'name': 'z-near', 'w': 1000, 'h': 640, 'figs': [{'kind': kind, 'x': 0, 'z': 0, 'yaw': -.6, 'state': {}}, {'kind': 'rigger', 'x': 2.5, 'z': -1, 'yaw': -.6}], 'cam': {'at': [-12, 3, 20], 'look': [0, H * .5, 0], 'fov': 60}},
    {'name': 'z-mid', 'w': 1000, 'h': 640, 'figs': [{'kind': kind, 'x': 0, 'z': 0, 'yaw': -.6, 'state': {}}, {'kind': 'rigger', 'x': 2.5, 'z': -1, 'yaw': -.6}], 'cam': {'at': [-70, 20, 26], 'look': [0, H * .5, 0], 'fov': 60}},
    {'name': 'z-cmd', 'w': 1000, 'h': 640, 'figs': [{'kind': kind, 'x': 0, 'z': 0, 'yaw': -.6, 'state': {}}, {'kind': 'rigger', 'x': 2.5, 'z': -1, 'yaw': -.6}], 'cam': {'at': [0, 34, 22], 'look': [0, 0, 0], 'fov': 50}},
    {'name': 'z-map', 'w': 640, 'h': 640, 'figs': [{'kind': kind, 'x': 0, 'z': 0, 'yaw': 0, 'state': {}}, {'kind': 'rigger', 'x': 2.5, 'z': -1, 'yaw': 0}], 'cam': {'top': [0, 0], 'span': 60}},
]
for i, (lab, st) in enumerate(POSES):
    shots.append({'name': 'pose%d' % i, 'w': 600, 'h': 700, 'figs': [{'kind': kind, 'x': 0, 'z': 0, 'yaw': -1.25, 'state': dict(st, t=3.3)}], 'cam': three()})
os.makedirs(out, exist_ok=True)
spec = os.path.join(out, kind + '-spec.json')
json.dump(shots, open(spec, 'w'))
raw = os.path.join(out, 'raw-' + kind)
subprocess.run(['node', 'tools/ironhold-shots.cjs', 'dist/ironhold-bench.html', spec, raw], check=True)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26)
except Exception:
    font = ImageFont.load_default()
def im(n, w=None, crop=None, zoom=1):
    a = Image.open(os.path.join(raw, n + '.png')).convert('RGB')
    if crop:
        cx, cy, cw, ch = crop
        a = a.crop((cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2)).resize((cw * zoom, ch * zoom), Image.NEAREST)
    if w:
        a = a.resize((w, int(a.height * w / a.width)))
    return a
def inset(a, n, cw, ch, z=3):
    b = Image.open(os.path.join(raw, n + '.png')).convert('RGB')
    c = b.crop((b.width // 2 - cw // 2, b.height // 2 - ch // 2, b.width // 2 + cw // 2, b.height // 2 + ch // 2)).resize((cw * z, ch * z), Image.NEAREST)
    k = a.width / b.width
    c = c.resize((int(c.width * k), int(c.height * k)))
    a.paste(c, (a.width - c.width - 6, a.height - c.height - 6)); ImageDraw.Draw(a).rectangle((a.width - c.width - 7, a.height - c.height - 7, a.width - 6, a.height - 6), outline=(255, 194, 26), width=3)
    return a
def lab(a, t):
    g = ImageDraw.Draw(a); g.rectangle((0, 0, 14 + len(t) * 16, 38), fill=(14, 13, 20)); g.text((8, 5), t, fill=(255, 194, 26), font=font); return a
rows = [[lab(im('clay', 600), 'clay'), lab(im('paint', 600), 'painted, game light'), lab(im('back', 600), 'back'), lab(im('rigger', 750), 'beside the Rigger')],
        [lab(im('pose%d' % i, 420), l) for i, (l, _) in enumerate(POSES)],
        [lab(im('fp', 760), 'first person'), lab(inset(im('z-near', 760), 'z-near', 200, 130, 2), 'near, 23 m (inset x2)'), lab(inset(im('z-mid', 760), 'z-mid', 140, 90), 'middle, 77 m (inset x3)'),
         lab(inset(im('z-cmd', 760), 'z-cmd', 160, 100), 'command view (inset x3)'), lab(inset(im('z-map', 480), 'z-map', 110, 110), 'full map, 60 m (inset x3)')]]
W = max(sum(a.width for a in r) for r in rows)
Ht = sum(max(a.height for a in r) for r in rows)
sheet = Image.new('RGB', (W, Ht + 70), (14, 13, 20))
ImageDraw.Draw(sheet).text((16, 18), kind.upper() + '  -  Ironhold, stream E capture sheet', fill=(255, 194, 26), font=font)
y = 70
for r in rows:
    x = 0
    for a in r:
        sheet.paste(a, (x, y)); x += a.width
    y += max(a.height for a in r)
sheet.save(os.path.join(out, kind + '.jpg'), quality=84)
print(os.path.join(out, kind + '.jpg'), sheet.size)
