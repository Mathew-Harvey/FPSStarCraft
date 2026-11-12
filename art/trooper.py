"""Ironhold's line troops, four of them off one body: the Linesman, the Breacher, the Longshot and the Patch.

A company militia in pressed-steel plate over a padded undersuit: a pot helmet with a lit visor and a twin-can respirator,
a breastplate with the company colour bolted on, a pack with air and a bedroll, and a rifle carried low on the right side.
Run with the Python that has bpy installed:  python trooper.py linesman|breacher|longshot|patch [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, human as Hu
from kit.sdf import V, rot

ROLE = next((a for a in sys.argv[1:] if a in ('linesman', 'breacher', 'longshot', 'patch')), 'linesman')
heavy, long_, patch = ROLE == 'breacher', ROLE == 'longshot', ROLE == 'patch'
pl = 'pO' if heavy else 'pW' if patch else 'pD' if long_ else 'pY'            # painted plate
bl = 'bO' if heavy else 'bW' if patch else 'bD' if long_ else 'bY'            # the same colour, battered
hel = 'helmO' if heavy else 'helmR' if patch else 'helmD' if long_ else 'helm'
chestm = 'chestO' if heavy else 'chestR' if patch else 'pD' if long_ else 'chest'
capm = 'hazC' if heavy else 'cW' if patch else 'cD' if long_ else 'cY'
pants = 'fabG' if long_ else 'fab'
steel = 'bD' if heavy else 'bS'

fig = B.Figure(ROLE, scale=1.2 if heavy else 1.08)
HIP = .93
fig.group('body', (0, 0, 0))
fig.group('legL', (-.105, HIP, 0))
fig.group('legR', (.105, HIP, 0))
fig.group('head', (0, 1.5, 0), 'body')
AP = V(0, 1.36, .04)
fig.group('arms', AP, 'body')
if heavy:
    fig.group('armL', (-.24, 1.42, 0), 'body')

# ---------------------------------------------------------------- legs
Hu.both_legs(fig, Hu.leg_parts(HIP, pants=pants, boot='leaB', strapm='leaB', pocket=False, plate=bl, greave='bD', boss='nS'))

# ---------------------------------------------------------------- hips and belt
ring = Hu.ring
pelvis = S.union(S.ellipsoid((0, .93, -.005), (.2, .13, .135)), S.ellipsoid((0, .9, -.07), (.17, .11, .1)), k=.05)
pelvis = S.cut(pelvis, S.above(1.03))
pelvis = S.bump(pelvis, lambda p: (S.noise(p, 20, 1.7) - .5) * .006)
fig.add('pelvis', 'body', pants, pelvis, 420, voxel=.0035, uv=('cyl', V(0, .93, 0)))
belt = ring((0, 1.03, .0), .203, .146, .032, .02)
fig.add('belt', 'body', 'leaB', belt, 340, voxel=.003, uv=('wrap', V(0, 1.03, 0)))
buckle = S.cut(S.box((0, 1.03, .148), (.045, .036, .01), .008), S.box((0, 1.03, .158), (.028, .02, .008), .004))
fig.add('buckle', 'body', 'pS', buckle, 110, voxel=.002, uv=('front',), sharp=30)
for sx, nm in ((-1, 'pouchL'), (1, 'pouchR')):
    R = rot(0, sx * .5, 0)
    pch = S.union(S.box((sx * .135, .975, .125), (.045, .06, .032), .02, R), S.box((sx * .135, 1.012, .132), (.048, .024, .034), .012, R), k=.004)
    pch = S.union(pch, S.sphere((sx * .143, .992, .166), .008))
    fig.add(nm, 'body', 'lea', pch, 220, voxel=.0025, uv=('front',))
flask = S.union(S.rcone((-.225, .9, .01), (-.235, 1.03, .02), .04), S.cyl((-.236, 1.06, .021), (-.238, 1.085, .022), .018, .004), k=.008)
fig.add('flask', 'body', 'tank', flask, 180, voxel=.0025, uv=('cyl', V(-.23, .97, .015)))
side = S.union(S.box((.225, .955, -.03), (.034, .08, .06), .022), S.box((.232, 1.005, -.03), (.03, .03, .064), .012), k=.004)
fig.add('sidepouch', 'body', 'lea', side, 200, voxel=.0028, uv=('side',))

# ---------------------------------------------------------------- torso: undersuit, breastplate, the company colour
chest = S.ellipsoid((0, 1.31, -.005), (.2, .165, .125))
shoulders = S.union(S.rcone((0, 1.455, -.014), (-.2, 1.41, -.012), .078, .064), S.rcone((0, 1.455, -.014), (.2, 1.41, -.012), .078, .064), k=.03)
belly = S.ellipsoid((0, 1.13, .01), (.178, .15, .125))
back = S.ellipsoid((0, 1.24, -.04), (.185, .21, .105))
torso = S.union(chest, shoulders, belly, back, k=.07)
torso = S.cut(torso, S.below(1.0))
suit = S.bump(torso, lambda p: .005 * np.sin(p[..., 1] * 150) * np.clip((1.2 - p[..., 1]) * 12, 0, 1))          # ribbed where the plate stops
fig.add('undersuit', 'body', 'rib', suit, 620, voxel=.0035, uv=('cyl', V(0, 1.25, 0)))
plate = S.cut(S.grow(torso, .03), S.below(1.135))
plate = S.cut(plate, S.sphere((-.262, 1.4, -.005), .1), S.sphere((.262, 1.4, -.005), .1))                         # arm holes
rim = S.both(S.cut(S.grow(torso, .04), S.grow(torso, .02)), S.slab((0, 1.148, 0), (0, 1, 0), .014))               # a rolled edge along the bottom
plate = S.union(plate, rim, k=.008)
plate = S.bump(plate, lambda p: -.007 * np.clip(1 - np.abs(S.noise(p, 16, 7.7) - .5) * 7, 0, 1) * (p[..., 2] > -.02))
plate = S.groove(plate, [V(-.17, 1.2, .12), V(-.1, 1.26, .16)], .004, .005)                                       # an old scar
fig.add('cuirass', 'body', steel, plate, 1200, voxel=.0035, uv=('cyl', V(0, 1.3, 0)))
front = S.grow(torso, .03)
cz = .22 if heavy else .2
badge = S.both(S.cut(S.grow(front, .022), front), S.box((0, 1.34, cz), (.165, .115, .12), .035, rot(-.1, 0, 0)), k=.006)
fig.add('chestplate', 'body', chestm, badge, 440, voxel=.003, uv=('front',))
bolts = S.union(*[S.sphere(S.skin(badge, (x, y, .09), (0, 0, 1), out=-.002), .012) for x, y in ((-.13, 1.42), (.13, 1.42), (-.135, 1.26), (.135, 1.26))])
fig.add('chestbolts', 'body', 'nS', bolts, 110, voxel=.002, uv=('front',))
gut = S.both(S.cut(S.grow(torso, .028), S.grow(torso, .004)), S.box((0, 1.085, .15), (.13, .045, .1), .02, rot(.12, 0, 0)), k=.006)
fig.add('gutplate', 'body', 'pS' if bl == 'bY' else pl, gut, 220, voxel=.003, uv=('front',))
for sx, nm in ((-1, 'strapL'), (1, 'strapR')):
    o = V(sx * .125, 1.3, -.01)                                  # laid on the plate: up the front, over the shoulder, down the back
    st = S.chain([S.skin(plate, o, (0, np.sin(a), np.cos(a)), out=.004) for a in np.linspace(-.75, 3.6, 14)], .017)
    st = S.squash(st, (1.6, 1, 1), o)
    fig.add(nm, 'body', 'leaB', st, 170, voxel=.003, uv=('front',))
fig.add('neckring', 'body', 'rib', ring((0, 1.5, -.005), .1, .1, .03, .03, .012), 150, voxel=.003)
# a dust wrap bunched round the neck with its tail thrown over the off shoulder: nobody out here is in clean kit
wrap = S.torus((0, 1.525, .0), .118, .046, squash=1.05)
wrap = S.union(wrap, S.torus((0, 1.558, -.005), .1, .036, rot(.1, 0, .08)), k=.02)
Wl = S.Limb((0, 1.47, 0), (0, 1.62, 0))
wrap = S.bump(wrap, Wl.folds([(.3, .4, 1.2, .012, .1, .25), (.45, -1.2, 1.4, .012, .1, -.3), (.6, 2.2, 1.5, .012, .1, .3), (.35, 3.0, 1.2, .01, .09, -.2), (.7, -.3, 1.0, .009, .08, .2), (.52, 1.3, 1.0, .01, .09, -.25)]))
tail = S.chain([V(-.1, 1.53, .1)] + [S.skin(plate if y > 1.15 else torso, (x, y, 0), (0, 0, 1), out=.022) for x, y in ((-.15, 1.44), (-.15, 1.31), (-.17, 1.22))], [.05, .05, .042, .02])
tailb = S.chain([V(-.11, 1.53, -.1)] + [S.skin(plate, (x, y, 0), (0, 0, -1), out=.02) for x, y in ((-.16, 1.42), (-.14, 1.31))], [.045, .045, .018])
Tl = S.Limb((-.12, 1.5, .14), (-.18, 1.22, .215))
tail = S.bump(tail, Tl.folds([(.3, 0, 1.6, .008, .09, .2), (.55, .5, 1.4, .008, .09, -.2), (.8, -.3, 1.4, .007, .08, .15)]))
wrap = S.union(wrap, tail, tailb, k=.015)
wrap = S.bump(wrap, lambda p: (S.noise(p, 26, 2.2) - .5) * .006)
fig.add('wrap', 'body', 'fabT', wrap, 900, voxel=.003, uv=('cyl', V(0, 1.45, 0)))
if heavy:   # a shell belt slung across the breastplate
    pts = [S.skin(badge, (x, 1.3 + x * .62, .0), (0, 0, 1), out=.012) for x in np.linspace(.24, -.24, 9)]
    fig.add('shellbelt', 'body', 'leaB', S.squash(S.chain(pts, .024), (1, 1.6, 1), (0, 1.3, .2)), 220, voxel=.003, uv=('front',))
    sh = [S.rcone(q + V(.028, .045, .026), q + V(-.028, -.045, .026), .02) for q in pts[2:7]]
    fig.add('shells', 'body', 'pY', S.union(*sh), 240, voxel=.0025, uv=('front',))

# ---------------------------------------------------------------- pack: frame, air, bedroll, a hose round to the chest
pack = S.box((0, 1.28, -.25), (.2, .22, .095), .05)
pack = S.union(pack, S.box((0, 1.4, -.33), (.15, .07, .05), .03), k=.02)                                         # the lid pocket
pack = S.groove(pack, [V(-.2, 1.33, -.345), V(.2, 1.33, -.345)], .005, .006)
pack = S.bump(pack, lambda p: (S.noise(p, 14, 6.1) - .5) * .008)
fig.add('pack', 'body', 'pD', pack, 420, voxel=.004, uv=('front',))
tank = S.union(S.rcone((.115, 1.13, -.385), (.115, 1.44, -.385), .072), S.cyl((.115, 1.5, -.385), (.115, 1.54, -.385), .03, .006), S.torus((.115, 1.3, -.385), .073, .009), k=.008)
fig.add('airtank', 'body', 'tankT' if patch else 'tank', tank, 320, voxel=.003, uv=('cyl', V(.115, 1.3, -.385)))
can = S.union(S.rcone((-.115, 1.14, -.375), (-.115, 1.4, -.375), .058), S.cyl((-.115, 1.44, -.375), (-.115, 1.475, -.375), .024, .005), k=.008)
fig.add('aircan', 'body', 'bS', can, 220, voxel=.003, uv=('cyl', V(-.115, 1.28, -.375)))
fig.add('packplate', 'body', pl, S.box((-.11, 1.1, -.36), (.08, .045, .03), .014, rot(.1, 0, .06)), 90, voxel=.003, uv=('front',))
hose = S.chain([V(.17, 1.44, -.3), V(.275, 1.47, -.16), V(.3, 1.4, .0), V(.26, 1.28, .1), S.skin(plate, (.15, 1.2, 0), (0, 0, 1), out=.01)], .024)
hose = S.bump(hose, lambda p: .004 * np.sin((p[..., 1] * 1.0 + p[..., 2] * 1.3) * 230))
fig.add('hose', 'body', 'rib', hose, 260, voxel=.0028, uv=('side',))
if not long_:
    roll = S.rcone((-.19, 1.575, -.25), (.19, 1.575, -.25), .078)
    roll = S.bump(roll, lambda p: .006 * np.sin(np.arctan2(p[..., 1] - 1.575, p[..., 2] + .25) * 5 + p[..., 0] * 6) + (S.noise(p, 20, 3.3) - .5) * .008)
    fig.add('bedroll', 'body', 'fabT', roll, 400, voxel=.0035, uv=('side',))
    rs = S.union(*[S.torus((sx * .115, 1.575, -.25), .08, .012, rot(0, 0, np.pi / 2), squash=1.8) for sx in (-1, 1)])
    fig.add('rollstraps', 'body', 'leaB', rs, 140, voxel=.003)
if heavy:
    top = S.box((0, 1.5, -.36), (.26, .12, .08), .05)
    fig.add('packtop', 'body', 'pD', top, 220, voxel=.004, uv=('front',))
    tk = S.union(*[S.rcone((sx * .17, 1.6, -.37), (sx * .17, 1.78, -.37), .058) for sx in (-1, 1)])
    fig.add('toptanks', 'body', 'tank', tk, 260, voxel=.003, uv=('front',))
if long_:   # a scrim cloak down the back, ragged at the hem
    cl = S.cut(S.grow(S.union(torso, pack, k=.1), .05), S.grow(S.union(torso, pack, k=.1), .03))
    cl = S.both(cl, S.plane((0, 0, -.06), (0, 0, 1)))
    cl = S.cut(cl, S.above(1.5))
    cl = S.union(cl, S.both(S.cut(S.ecyl((0, .95, -.14), .36, .3, .22, .02), S.ecyl((0, .95, -.14), .34, .28, .4, .0)), S.plane((0, 0, -.12), (0, 0, 1))), k=.12)
    cl = S.cut(cl, lambda p: p[..., 1] - (.78 + .05 * np.sin(p[..., 0] * 40) + .03 * np.sin(p[..., 0] * 97)))
    cl = S.bump(cl, lambda p: .012 * np.sin(p[..., 0] * 34 + p[..., 1] * 3) * np.clip((1.45 - p[..., 1]) * 2, 0, 1))
    fig.add('cloak', 'body', 'fabG', cl, 900, voxel=.004, uv=('cyl', V(0, 1.1, 0)))

# ---------------------------------------------------------------- head: pot helmet, mask, lit visor, respirator
HC = V(0, 1.7, -.005)                                           # the middle of the skull
dome = S.ellipsoid(HC + V(0, .02, 0), (.158, .17, .178))
dome = S.cut(dome, S.below(1.672))
ridge = S.both(S.torus(HC + V(0, .02, 0), .158, .014, rot(0, 0, np.pi / 2), squash=1.0), S.above(1.66))          # a pressed crest front to back
dome = S.union(dome, ridge, k=.012)
brimr = S.cut(S.ecyl(HC + V(0, -.024, 0), .172, .192, .016, .008), S.ecyl(HC + V(0, -.024, 0), .14, .16, .05, .0))
dome = S.union(dome, brimr, k=.01)
dome = S.bump(dome, lambda p: -.006 * np.clip(1 - np.abs(S.noise(p, 15, 12.5) - .5) * 8, 0, 1))
for a in (-2.2, -1.2, 1.2, 2.2):
    dome = S.union(dome, S.sphere(HC + V(np.sin(a) * .16, .01, np.cos(a) * .18), .01))
fig.add('helmet', 'head', hel, dome, 1000, voxel=.003, uv=('cyl', HC))
neck = S.rcone((0, 1.46, -.015), (0, 1.62, -.01), .062, .06)
neck = S.bump(neck, lambda p: .004 * np.sin(p[..., 1] * 180))
skull = S.union(neck, S.ellipsoid(HC + V(0, -.03, 0), (.138, .13, .155)), k=.03)
fig.add('hood', 'head', 'rib', skull, 380, voxel=.0035, uv=('cyl', V(0, 1.55, 0)))
mask = S.both(S.cut(S.ellipsoid(HC + V(0, -.06, .01), (.15, .13, .178)), S.above(1.64 + .02)), S.plane(HC + V(0, 0, .04), (0, 0, -1)), k=.01)
mask = S.union(mask, S.both(S.ellipsoid(HC + V(0, -.12, .1), (.085, .07, .09)), S.plane(HC + V(0, 0, .06), (0, 0, -1))), k=.03)   # the snout
mask = S.groove(mask, [HC + V(-.11, -.1, .13), HC + V(-.05, -.15, .16)], .004, .005)
mask = S.groove(mask, [HC + V(.11, -.1, .13), HC + V(.05, -.15, .16)], .004, .005)
fig.add('mask', 'head', 'gunB', mask, 560, voxel=.003, uv=('front',))
if long_:      # one big glass for the shooting eye, a small one for the other
    cups = S.union(S.cyl(HC + V(.06, -.045, .12), HC + V(.06, -.04, .225), .058, .008), S.cyl(HC + V(-.07, -.045, .13), HC + V(-.07, -.043, .19), .03, .006), S.torus(HC + V(.06, -.04, .222), .054, .008, rot(np.pi / 2, 0, 0)))
    fig.add('scopecups', 'head', 'gunB', cups, 420, voxel=.0025, uv=('front',), sharp=50)
    fig.add('scopeglass', 'head', 'lens', S.both(S.sphere(HC + V(.06, -.04, .19), .06), S.cyl(HC + V(.06, -.04, .2), HC + V(.06, -.04, .236), .048)), 90, voxel=.0025, uv=('front',))
    fig.add('eyeglass', 'head', 'visG', S.both(S.sphere(HC + V(-.07, -.043, .165), .04), S.cyl(HC + V(-.07, -.043, .17), HC + V(-.07, -.043, .2), .023)), 60, voxel=.002, uv=('front',))
elif patch:    # a medic wants to see what his hands are doing: two round glasses
    cups, gl = [], []
    for sx in (-1, 1):
        d = V(sx * .22, 0, 1)
        d = d / np.linalg.norm(d)
        c = HC + V(sx * .068, -.042, .135)
        cups += [S.cyl(c, c + d * .06, .052, .008), S.torus(c + d * .058, .048, .008, S.basis((0, 1, 0), d))]
        gl.append(S.both(S.sphere(c + d * .03, .055), S.cyl(c + d * .04, c + d * .075, .042)))
    fig.add('gogglecups', 'head', 'bW', S.union(*cups), 460, voxel=.0025, uv=('front',), sharp=50)
    fig.add('goggleglass', 'head', 'lens', S.union(*gl), 130, voxel=.0025, uv=('front',))
else:          # a slit of lit glass wrapped round the front
    vh = .022 if heavy else .034
    vis = S.both(S.cut(S.ellipsoid(HC + V(0, -.048, .012), (.158, .1, .186)), S.ellipsoid(HC + V(0, -.048, .012), (.14, .2, .168))), S.slab(HC + V(0, -.05, 0), (0, 1, -.12), vh))
    vis = S.both(vis, S.plane(HC + V(0, 0, .075), (0, 0, -1)))
    fig.add('visor', 'head', 'visG', vis, 240, voxel=.0025, uv=('front',))
    fr = S.both(S.cut(S.ellipsoid(HC + V(0, -.048, .012), (.166, .1, .194)), S.ellipsoid(HC + V(0, -.048, .012), (.15, .2, .18))), S.cut(S.slab(HC + V(0, -.05, 0), (0, 1, -.12), vh + .016), S.slab(HC + V(0, -.05, 0), (0, 1, -.12), vh - .002)))
    fr = S.both(fr, S.plane(HC + V(0, 0, .06), (0, 0, -1)))
    fig.add('visorframe', 'head', 'gunB', fr, 300, voxel=.0025, uv=('front',))
resp = S.union(S.cyl(HC + V(0, -.125, .12), HC + V(0, -.13, .21), .056, .01), S.torus(HC + V(0, -.13, .205), .05, .011, rot(np.pi / 2, 0, 0)), k=.006)
fig.add('respirator', 'head', 'pD', resp, 300, voxel=.0025, uv=('front',), sharp=45)
gr = S.both(S.sphere(HC + V(0, -.13, .17), .06), S.cyl(HC + V(0, -.13, .19), HC + V(0, -.13, .225), .042))
gr = S.bump(gr, lambda p: .004 * np.sin(p[..., 1] * 260))
fig.add('grille', 'head', 'rib', gr, 110, voxel=.002, uv=('front',))
fl, ears, eard = [], [], []
for sx in (-1, 1):
    a, b = HC + V(sx * .05, -.135, .13), HC + V(sx * .15, -.165, .185)
    fl += [S.cyl(a, b, .04, .008), S.cyl(b - (b - a) * .12, b + (b - a) * .08, .045, .006)]
    ears.append(S.cyl(HC + V(sx * .135, -.045, -.005), HC + V(sx * .178, -.045, -.005), .062, .012))
    eard.append(S.cyl(HC + V(sx * .176, -.045, -.005), HC + V(sx * .19, -.045, -.005), .04, .005))
fig.add('filters', 'head', bl, S.union(*fl), 420, voxel=.0025, uv=('front',), sharp=45)
fig.add('earcups', 'head', bl, S.union(*ears), 300, voxel=.003, uv=('side',), sharp=45)
fig.add('eardiscs', 'head', 'rib', S.union(*eard), 120, voxel=.0025, uv=('side',))
ant = S.chain([HC + V(.17, .0, -.03), HC + V(.185, .22, -.05), HC + V(.192, .44, -.085)], [.009, .007, .005])
fig.add('antenna', 'head', 'rubber', ant, 70, voxel=.002)
fig.add('antennatip', 'head', 'red', S.sphere(HC + V(.192, .455, -.087), .02), 40, voxel=.003)
lampc = HC + V(-.1, .1, .125)
ld = V(-.25, .45, 1) / np.linalg.norm(V(-.25, .45, 1))
fig.add('lamp', 'head', 'pD', S.union(S.cyl(lampc, lampc + ld * .05, .034, .008), S.box(lampc - ld * .01, (.022, .02, .02), .006)), 170, voxel=.0022, uv=('front',), sharp=45)
fig.add('lampglass', 'head', 'visG', S.both(S.sphere(lampc + ld * .03, .036), S.cyl(lampc + ld * .04, lampc + ld * .066, .026)), 60, voxel=.002, uv=('front',))
if heavy:      # a bolted jaw guard and a fin on the crown
    jaw = S.both(S.cut(S.ellipsoid(HC + V(0, -.1, .012), (.176, .1, .2)), S.ellipsoid(HC + V(0, -.1, .012), (.158, .2, .182))), S.plane(HC + V(0, 0, .03), (0, 0, -1)))
    jaw = S.both(jaw, S.slab(HC + V(0, -.13, 0), (0, 1, 0), .05))
    fig.add('jawguard', 'head', 'pO', jaw, 320, voxel=.003, uv=('front',))
    fin = S.box(HC + V(0, .2, -.03), (.011, .045, .15), .008)
    fin = S.cut(fin, S.plane(HC + V(0, .2, .1), (0, -.6, -1)))
    fig.add('crest', 'head', 'pO', fin, 110, voxel=.003, uv=('side',), sharp=35)
if long_:      # a hood of the same scrim over the helmet
    hd = S.cut(S.ellipsoid(HC + V(0, .03, -.02), (.19, .2, .21)), S.ellipsoid(HC + V(0, .02, -.01), (.174, .186, .194)))
    hd = S.cut(hd, S.plane(HC + V(0, 0, .02), (0, .35, -1)), S.below(1.56))
    hd = S.bump(hd, lambda p: .008 * np.sin(p[..., 0] * 45 + p[..., 1] * 20) + (S.noise(p, 18, 8.8) - .5) * .008)
    fig.add('scrimhood', 'head', 'fabG', hd, 600, voxel=.0035, uv=('cyl', HC))

# ---------------------------------------------------------------- arms and the weapon
GX, GY = (.2 if heavy else .135), 1.2                                              # the bore line: low on the right side, level, pointing ahead


def gun_parts():
    out = []
    if heavy:      # a twin-barrelled scatter gun, short and fat
        rec = S.box((GX, GY, .16), (.06, .075, .2), .02)
        rec = S.cut(rec, S.box((GX + .062, GY + .01, .14), (.012, .03, .07), .006))
        out.append(('receiver', 'gunm', rec, 420, dict(voxel=.003, uv=('side',), sharp=35)))
        brl = S.union(*[S.cyl((GX + sx * .034, GY + .028, .34), (GX + sx * .034, GY + .028, .76), .05, .004) for sx in (-1, 1)])
        out.append(('barrels', 'gunB', brl, 300, dict(voxel=.003, uv=('side',), sharp=50)))
        bands = S.union(*[S.box((GX, GY + .028, z), (.092, .058, .016), .012) for z in (.5, .73)])
        out.append(('bands', 'bS', bands, 160, dict(voxel=.003, uv=('side',), sharp=40)))
        out.append(('pump', 'pO', S.bump(S.box((GX, GY - .05, .5), (.07, .04, .11), .025), lambda p: .004 * np.sin(p[..., 2] * 180)), 260, dict(voxel=.003, uv=('side',))))
        out.append(('grip', 'lea', S.box((GX, GY - .12, .07), (.03, .075, .036), .016, rot(.3, 0, 0)), 130, dict(voxel=.003, uv=('side',))))
        out.append(('stock', 'lea', S.union(S.box((GX, GY - .02, -.12), (.034, .06, .11), .02), S.box((GX, GY - .025, -.235), (.038, .075, .014), .008), k=.006), 200, dict(voxel=.003, uv=('side',))))
        out.append(('rail', 'pS', S.box((GX, GY + .086, .2), (.016, .014, .13), .005), 70, dict(voxel=.0025, uv=('side',), sharp=30)))
        return out, V(GX, GY + .028, .8), 1.5
    if long_:      # a long rifle: a heavy barrel, a fat glass on top, a wrapped fore-end
        rec = S.box((GX, GY, .12), (.04, .062, .26), .014)
        out.append(('receiver', 'gunm', rec, 380, dict(voxel=.003, uv=('side',), sharp=35)))
        out.append(('barrel', 'gunB', S.cyl((GX, GY + .02, .36), (GX, GY + .02, 1.2), .022, .003), 180, dict(voxel=.0025, uv=('side',), sharp=50)))
        mz = S.cyl((GX, GY + .02, 1.18), (GX, GY + .02, 1.34), .04, .006)
        for i in range(3):
            mz = S.cut(mz, S.box((GX, GY + .02, 1.215 + i * .04), (.06, .012, .009)))
        out.append(('brake', 'bS', mz, 220, dict(voxel=.0022, uv=('side',), sharp=40)))
        sc = S.union(S.cyl((GX, GY + .135, -.04), (GX, GY + .135, .34), .036, .006), S.cyl((GX, GY + .135, .28), (GX, GY + .135, .38), .05, .008), S.cyl((GX, GY + .135, -.07), (GX, GY + .135, .0), .042, .008), k=.006)
        out.append(('scope', 'gunB', sc, 320, dict(voxel=.0025, uv=('side',), sharp=50)))
        out.append(('scopeglass2', 'lens', S.both(S.sphere((GX, GY + .135, .35), .052), S.cyl((GX, GY + .135, .36), (GX, GY + .135, .392), .042)), 60, dict(voxel=.0025, uv=('front',))))
        out.append(('mounts', 'pS', S.union(*[S.box((GX, GY + .082, z), (.016, .03, .02), .005) for z in (.02, .24)]), 90, dict(voxel=.0025, uv=('side',), sharp=30)))
        fe = S.bump(S.box((GX, GY - .005, .52), (.042, .045, .15), .022), lambda p: .005 * np.sin((p[..., 2] + p[..., 1] * .6) * 120))    # rag wound round the fore-end
        out.append(('foreend', 'fabG', fe, 300, dict(voxel=.003, uv=('side',))))
        out.append(('grip', 'lea', S.box((GX, GY - .11, .07), (.028, .07, .034), .015, rot(.3, 0, 0)), 130, dict(voxel=.003, uv=('side',))))
        out.append(('stock', 'lea', S.union(S.box((GX, GY - .015, -.25), (.03, .055, .13), .02), S.box((GX, GY - .02, -.385), (.034, .07, .014), .008), k=.006), 220, dict(voxel=.003, uv=('side',))))
        out.append(('magazine', 'pS', S.box((GX, GY - .1, .22), (.024, .055, .04), .008), 80, dict(voxel=.003, uv=('side',), sharp=30)))
        return out, V(GX, GY + .02, 1.36), 1.2
    rec = S.box((GX, GY, .15), (.042, .068, .19), .014)
    rec = S.cut(rec, S.box((GX + .045, GY + .012, .16), (.012, .022, .06), .005))                                 # ejection port
    rec = S.union(rec, S.box((GX + .046, GY + .015, .07), (.008, .008, .02), .004))                                # charging handle
    out.append(('receiver', 'gunm', rec, 420, dict(voxel=.003, uv=('side',), sharp=35)))
    sh = S.box((GX, GY - .004, .46), (.052, .058, .135), .022)
    for i in range(4):
        sh = S.cut(sh, S.box((GX, GY + .012, .37 + i * .058), (.07, .02, .013), .006))                             # cooling slots
    out.append(('shroud', 'pR' if patch else 'pY', sh, 440, dict(voxel=.003, uv=('side',), sharp=38)))
    out.append(('barrel', 'gunB', S.cyl((GX, GY + .022, .3), (GX, GY + .022, .84), .028, .003), 170, dict(voxel=.0025, uv=('side',), sharp=50)))
    mz = S.cyl((GX, GY + .022, .82), (GX, GY + .022, .94), .045, .008)
    for i in range(2):
        mz = S.cut(mz, S.box((GX, GY + .022, .86 + i * .04), (.06, .012, .009)))
    out.append(('brake', 'bS', mz, 200, dict(voxel=.0022, uv=('side',), sharp=40)))
    mag = S.box((GX, GY - .135, .25), (.026, .085, .045), .008, rot(-.22, 0, 0))
    mag = S.bump(mag, lambda p: .003 * np.sin(p[..., 1] * 200))
    out.append(('magazine', 'pS', mag, 150, dict(voxel=.003, uv=('side',), sharp=30)))
    out.append(('grip', 'lea', S.box((GX, GY - .115, .07), (.028, .07, .034), .015, rot(.3, 0, 0)), 130, dict(voxel=.003, uv=('side',))))
    stock = S.union(S.box((GX, GY - .012, -.14), (.032, .058, .1), .02), S.box((GX, GY - .02, -.245), (.036, .075, .014), .008), k=.006)
    stock = S.cut(stock, S.box((GX, GY - .01, -.13), (.06, .022, .05), .012))
    out.append(('stock', 'lea', stock, 220, dict(voxel=.003, uv=('side',))))
    rail = S.box((GX, GY + .078, .14), (.016, .012, .16), .004)
    rail = S.union(rail, S.torus((GX, GY + .112, .22), .022, .007, rot(np.pi / 2, 0, 0)), S.box((GX, GY + .09, .22), (.006, .02, .008)), S.box((GX, GY + .075, .56), (.006, .03, .01), .003))
    out.append(('sights', 'pS', rail, 190, dict(voxel=.0022, uv=('side',), sharp=30)))
    return out, V(GX, GY + .022, .96), 1.0


guns, MUZ, MS = gun_parts()
for name, mat, fn, tris, kw in guns:
    fig.add(name, 'arms', mat, fn, tris, **kw)
fig.point('muzzle', MUZ, 'arms')

# the firing hand on the grip
RhR = S.basis(V(-.42, -.1, .9), (1, .15, 0))
ShR, ElR = V(.24, 1.42, -.01), V(.34 + (.05 if heavy else 0), 1.22, -.2)
gripR = V(GX, GY - .1, .075)
WrR = Hu.wrist_for(gripR, RhR, ElR)
armR, _ = Hu.armoured_arm(1, ShR, ElR, WrR, RhR, -1, sleeve=pants, guard=steel)
Hu.add_arm(fig, 'arms', 'R', armR)
pauls = []
for sx, Sh in ((1, ShR), (-1, V(-.24, 1.42, -.01))):
    R = rot(0, 0, -sx * .42)
    c = Sh + V(sx * .03, .03, -.005)
    pd = S.cut(S.ellipsoid(c, (.118, .092, .125), R), S.ellipsoid(c + V(-sx * .012, -.022, 0), (.1, .084, .108), R))
    pd = S.cut(pd, S.plane(c + V(-sx * .02, -.035, 0), V(-sx * .5, -1, 0) * -1))
    pd = S.union(pd, S.both(S.cut(S.ellipsoid(c, (.125, .098, .132), R), S.ellipsoid(c, (.108, .092, .115), R)), S.slab(c + V(-sx * .02, -.03, 0), V(sx * .5, 1, 0), .012)), k=.006)   # rolled rim
    pd = S.union(pd, S.sphere(c + R @ V(sx * .02, .092, .0), .013))
    pauls.append((sx, pd))
if heavy:   # the off arm carries a slab of a shield
    fig.add('pauldronR', 'arms', capm, pauls[0][1], 340, voxel=.003, uv=('top',))
    fig.add('pauldronL', 'armL', capm, pauls[1][1], 340, voxel=.003, uv=('top',))
    ShL, ElL = V(-.24, 1.42, -.01), V(-.36, 1.2, .02)
    RhL = S.basis(V(.55, .05, .83), (-1, 0, .4))
    SR = rot(0, .12, 0)
    sc = V(-.3, 1.06, .46)
    gripL = sc + V(0, .04, -.12)
    WrL = Hu.wrist_for(gripL, RhL, ElL)
    armL, _ = Hu.armoured_arm(-1, ShL, ElL, WrL, RhL, 1, sleeve=pants, guard=steel)
    Hu.add_arm(fig, 'armL', 'L', armL)
    slab = S.box(sc, (.42, .62, .03), .06, SR)
    slab = S.bump(slab, lambda p: .02 * (1 - ((p[..., 0] - sc[0]) / .42) ** 2))                                        # bowed across its width
    slab = S.cut(slab, S.box(sc + SR @ V(0, .44, 0), (.2, .045, .1), .02, SR))                                      # the view slot
    slab = S.bump(slab, lambda p: -.008 * np.clip(1 - np.abs(S.noise(p, 9, 21.5) - .5) * 7, 0, 1))
    fig.add('shield', 'armL', 'shield', slab, 900, voxel=.005, uv=('front',))
    fig.add('shieldglass', 'armL', 'visG', S.box(sc + SR @ V(0, .44, .0), (.19, .035, .008), .004, SR), 40, voxel=.004, uv=('front',))
    fig.add('shieldslot', 'armL', 'gunm', S.cut(S.box(sc + SR @ V(0, .44, .01), (.24, .075, .03), .02, SR), S.box(sc + SR @ V(0, .44, .01), (.19, .04, .06), .01, SR)), 160, voxel=.004, uv=('front',))
    fig.add('shieldfoot', 'armL', 'haz', S.box(sc + SR @ V(0, -.47, .02), (.39, .095, .03), .025, SR), 160, voxel=.005, uv=('front',))
    bs = [S.sphere(sc + SR @ V(x, y, .045 - x * x * .12), .03) for x, y in ((-.31, .5), (.31, .5), (-.31, -.3), (.31, -.3))]
    fig.add('shieldbolts', 'armL', 'nS', S.union(*bs), 160, voxel=.004, uv=('front',))
    fig.add('shieldboss', 'armL', 'nO', S.ellipsoid(sc + SR @ V(0, .05, .04), (.1, .1, .04), SR), 120, voxel=.004, uv=('front',))
    fig.add('shieldbrace', 'armL', 'gunm', S.chain([sc + SR @ V(-.2, .12, -.04), sc + SR @ V(-.07, .04, -.12), sc + SR @ V(.1, .12, -.04)], .016), 90, voxel=.004)
else:       # the off hand under the fore-end
    for sx, pd in pauls:
        fig.add('pauldron' + ('R' if sx > 0 else 'L'), 'arms', capm, pd, 340, voxel=.003, uv=('top',))
    ShL, ElL = V(-.24, 1.42, -.01), V(-.16, 1.2, .17)
    RhL = S.basis((1, .12, 0), (0, -1, .1))
    gripL = V(GX - .012, GY - .085, .36)
    WrL = Hu.wrist_for(gripL, RhL, ElL)
    armL, _ = Hu.armoured_arm(-1, ShL, ElL, WrL, RhL, 1, sleeve=pants, guard=steel)
    Hu.add_arm(fig, 'arms', 'L', armL)
    # a red rag knotted round the off arm: how the line tells its own from a distance
    ra = ShL + (ElL - ShL) * .5
    axl = (ElL - ShL) / np.linalg.norm(ElL - ShL)
    rag = S.torus(ra, .078, .02, S.basis((0, 0, 1) - axl * axl[2], axl), squash=1.9)
    rag = S.union(rag, S.chain([ra + V(-.07, 0, -.03), ra + V(-.12, -.09, -.06), ra + V(-.1, -.18, -.08)], [.026, .03, .01]), S.chain([ra + V(-.075, 0, -.01), ra + V(-.15, -.05, -.02), ra + V(-.17, -.13, -.04)], [.024, .026, .01]), k=.012)
    fig.add('armrag', 'arms', 'fabR', rag, 280, voxel=.003, uv=('side',))

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != ROLE]
    png = args[0] if args and args[0].endswith('.png') else None
    only = [a for a in args if not a.endswith('.png')]
    if only:
        fig.parts = [p for p in fig.parts if any(p.name.startswith(o) or p.group == o for o in only)]
    here = __file__.rsplit('/', 1)[0]
    fig.build(here + '/../assets/mesh/%s.bin' % ROLE if not only else '/tmp/%s-part.bin' % ROLE, here + '/out/%s.blend' % ROLE if not only else None)
    if png:
        from kit import look
        import os
        c = [float(x) for x in os.environ.get('LOOK', '0,0,1.05,2.3').split(',')]
        look.render(png, centre=(c[0], -c[1], c[2]), height=c[3], px=int(os.environ.get('PX', 640)))
