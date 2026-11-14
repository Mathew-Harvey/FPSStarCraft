"""Capture sheet for the Ironhold ability effects (built on stream H's effect kit): each effect partway through, next to the body
that casts it, close up and from the command view height.
python3 tools/ironhold-fx-sheet.py <outdir>   (needs dist/ironhold-bench.html from tools/ironhold-bench.mjs)"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
near = lambda d=9, h=4: {'at': [-d * .7, h, d], 'look': [0, 1.2, 0], 'fov': 50}
up = {'at': [0, 34, 22], 'look': [0, 0, 0], 'fov': 50}
fig = lambda k, **kw: dict({'kind': k, 'x': 0, 'z': 0, 'yaw': -.6, 'state': {}}, **kw)
FX = [
    ('Overtime (Linesman)', [fig('linesman')], [{'fn': 'overtime', 'args': ['at:0'], 't': .15}], near(6, 2.5)),
    ('Shaft Mine (Sapper)', [fig('sapper', state={'work': True})], [{'fn': 'shaftMine', 'args': [[1.2, 0, .8]], 't': .4}], near(6, 2.5)),
    ('Satchel: fuse', [fig('sapper', x=-2.5)], [{'fn': 'satchel', 'args': [[1, 0, 0]], 't': 1.0}], near(8, 3)),
    ('Satchel: blast', [fig('sapper', x=-2.5)], [{'fn': 'satchel', 'args': [[1, 0, 0]], 't': 1.75}], near(8, 3)),
    ('Ghillie (Longshot, own side)', [fig('longshot')], [{'fn': 'ghillie', 'args': ['obj:0', True], 't': .3}], near(6, 2.5)),
    ('Tranq (Longshot)', [fig('longshot', x=-4)], [{'fn': 'tranq', 'args': [[-4, 1.4, 0], [2, 0, -1]], 't': .5}], near(10, 4)),
    ('Deep Charge: warning', [fig('longshot', x=-6)], [{'fn': 'deepCharge', 'args': [[2, 0, -2]], 't': 6}], near(16, 8)),
    ('Deep Charge: blast', [fig('longshot', x=-9)], [{'fn': 'deepCharge', 'args': [[2, 0, -2]], 't': 10.3}], near(16, 8)),
    ('Kick Start (Dustbike)', [fig('dustbike', state={'speed': 1.6, 'dist': .3})], [{'fn': 'kickStart', 'args': ['fig:0'], 't': .2}], near(6, 2.5)),
    ('Haul Drone call-down', [fig('hauldrone')], [{'fn': 'callDown', 'args': ['fig:0', [0, 0, 0]], 't': 1.0}], near(9, 4)),
    ('Anchor (Pile Driver)', [fig('piledriver', state={'anchor': 1})], [{'fn': 'anchorDust', 'args': ['fig:0'], 't': .25}], near(9, 4)),
    ('Afterburn (Hopper)', [fig('hopper', y=2, yaw=1.35, state={'speed': 1.6})], [{'fn': 'afterburn', 'args': ['fig:0'], 't': .8}], near(13, 5)),
    ('Smoke Cloak (Gadfly, own side)', [fig('gadfly', y=2)], [{'fn': 'smokeCloak', 'args': ['fig:0', True], 't': 2}], near(14, 6)),
    ('Flare (Surveyor)', [fig('surveyor', x=-6, y=1)], [{'fn': 'flare', 'args': [[2, 0, 0]], 't': 3}], near(16, 7)),
    ('Jam (Surveyor) on a Pile Driver', [fig('piledriver')], [{'fn': 'jam', 'args': ['at:0'], 't': 1.2}], near(9, 4)),
    ('Stake Gun (Surveyor)', [fig('surveyor', x=-5, y=1)], [{'fn': 'stakeGun', 'args': [[-5, 1.6, 0], [2, 0, 1]], 't': 1}], near(12, 5)),
    ('Foreclosure: charging', [fig('claimbarge', x=-10, y=2, yaw=1.2)], [{'fn': 'foreclosure', 'args': ['fig:0', [10, 0, 4]], 't': 2}], near(26, 12)),
    ('Foreclosure: the shell lands', [fig('claimbarge', x=-10, y=2, yaw=1.2)], [{'fn': 'foreclosure', 'args': ['fig:0', [10, 0, 4]], 't': 3.15}], near(26, 12)),
    ('Relocate (Claim Barge)', [fig('claimbarge', y=2)], [{'fn': 'relocate', 'args': ['fig:0', [14, 0, -6]], 't': .4}], near(26, 12)),
    ('Satchel blast, command view', [fig('sapper', x=-2.5)], [{'fn': 'satchel', 'args': [[1, 0, 0]], 't': 1.75}], up),
    ('Foreclosure warning, command view', [fig('claimbarge', x=-10, y=2, yaw=1.2)], [{'fn': 'foreclosure', 'args': ['fig:0', [10, 0, 4]], 't': 2}], up),
]
shots = [{'name': 'fx%02d' % i, 'w': 640, 'h': 440, 'figs': f, 'fx': e, 'cam': c} for i, (_, f, e, c) in enumerate(FX)]
os.makedirs(out, exist_ok=True)
spec = os.path.join(out, 'fx-spec.json'); json.dump(shots, open(spec, 'w'))
raw = os.path.join(out, 'raw-fx')
subprocess.run(['node', 'tools/ironhold-shots.cjs', 'dist/ironhold-bench.html', spec, raw], check=True)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
cols = 4; rows = (len(FX) + cols - 1) // cols
sheet = Image.new('RGB', (cols * 640, rows * 440 + 50), (14, 13, 20)); d = ImageDraw.Draw(sheet)
d.text((14, 12), 'IRONHOLD ABILITY EFFECTS  -  stream E, on the effect kit', fill=(255, 194, 26), font=font)
for i, (lab, *_rest) in enumerate(FX):
    a = Image.open(os.path.join(raw, 'fx%02d.png' % i)).convert('RGB'); x, y = (i % cols) * 640, 50 + (i // cols) * 440
    sheet.paste(a, (x, y)); g = ImageDraw.Draw(sheet); g.rectangle((x, y, x + 12 + len(lab) * 12, y + 30), fill=(14, 13, 20)); g.text((x + 6, y + 4), lab, fill=(255, 194, 26), font=font)
sheet.save(os.path.join(out, 'effects.jpg'), quality=84); print(os.path.join(out, 'effects.jpg'), sheet.size)
