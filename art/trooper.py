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

ROLE = next((a for a in sys.argv[1:] if a in ('linesman', 'breacher', 'longshot', 'patch', 'sapper')), 'linesman')
heavy, long_, patch, sap = ROLE == 'breacher', ROLE == 'longshot', ROLE == 'patch', ROLE == 'sapper'
pl = 'pO' if heavy or sap else 'pW' if patch else 'pD' if long_ else 'pY'            # painted plate
bl = 'bO' if heavy or sap else 'bW' if patch else 'bD' if long_ else 'bY'            # the same colour, battered
hel = 'helmO' if heavy else 'helmR' if patch else 'helmD' if long_ else 'helm'
chestm = 'chestO' if heavy else 'chestR' if patch else 'pD' if long_ else 'chest'
capm = 'hazC' if heavy else 'cW' if patch else 'cD' if long_ else 'cY'
pants = 'fabG' if long_ else 'fabT' if sap else 'fab'
steel = 'bD' if heavy else 'bS'

fig = B.Figure(ROLE, scale=1.2 if heavy else 1.05 if sap else 1.08, detail=.8, paint=1024)
HIP = .93
fig.group('body', (0, 0, 0))
fig.group('legL', (-.105, HIP, 0))
fig.group('legR', (.105, HIP, 0))
fig.group('head', (0, 1.5, 0), 'body', scale=.99)        # a helmet the size of a head, not of a barrel
fig.texel = {'head': 1.25}
AP = V(0, 1.36, .04)
fig.group('arms', AP, 'body')
if heavy:
    fig.group('armL', (-.24, 1.42, 0), 'body')

# ---------------------------------------------------------------- legs
Hu.both_legs(fig, Hu.leg_parts(HIP, pants=pants, boot='leaB', strapm='leaB', pocket=False, plate=bl if heavy else steel, greave='bD', boss='nS'))
# what hangs off the thighs is different each side: a holstered sidearm on the right, a dump bag on the left
TH = lambda sx, y: V(sx * (.111 + (.93 - y) * .03), y, .012 * (.93 - y) / .43)          # the middle of a thigh at height y
hol = S.box((.222, .7, .012), (.03, .1, .056), .016, rot(.06, 0, -.05))
hol = S.union(hol, S.box((.226, .612, .02), (.026, .03, .04), .014, rot(.06, 0, -.05)), k=.01)                    # the muzzle end
hol = S.cut(hol, S.box((.25, .8, .012), (.03, .03, .1), .0, rot(.06, 0, -.35)))                                    # cut away at the top so the gun draws
flapo = S.box((.238, .745, .012), (.03, .034, .06), .01, rot(.06, 0, -.05))
fig.add('holster', 'legR', 'lea', hol, 320, voxel=.003, uv=('side',), sharp=38,
        detail=S.fine(S.outline(S.grow(hol, -.012), .004, .004), S.studs([V(.252, .64, .045), V(.252, .64, -.02), V(.252, .76, .05)], .008, .004),
                      S.only(S.stitch(V(0, .66, 0), (0, 1, 0), .014, .004, .003, along=(0, 0, 1)), lambda p: p[..., 0] > .235)))
pg = S.union(S.box((.228, .835, -.012), (.02, .05, .028), .012, rot(.32, 0, 0)), S.box((.228, .8, .03), (.022, .028, .05), .008), k=.006)
pg = S.bump(pg, lambda p: .003 * np.sin(p[..., 1] * 320) * (p[..., 2] < .01))
fig.add('sidearm', 'legR', 'gunm', pg, 220, voxel=.0025, uv=('side',), sharp=35)
for i, y in enumerate((.775, .64)):
    st = S.torus(TH(1, y), .1 - (.93 - y) * .03, .011, rot(0, 0, .03), squash=2.0)
    fig.add('holsterstrap%d' % i, 'legR', 'leaB', S.union(st, S.box(TH(1, y) + V(.02, 0, .098 - (.93 - y) * .03), (.014, .016, .006), .004)), 110, voxel=.003,
            detail=S.weave(520, .0012))
bag = S.union(S.box((-.228, .69, -.005), (.045, .085, .07), .035), S.box((-.236, .752, -.005), (.042, .034, .074), .02), k=.012)
Bg = S.Limb((-.228, .78, 0), (-.228, .6, 0))
bag = S.bump(bag, Bg.folds([(.35, 1.57, 1.6, .008, .08, .1), (.6, -1.2, 1.4, .008, .08, -.1), (.8, 2.6, 1.4, .007, .07, .1)]))
fig.add('dumpbag', 'legL', 'fabT', bag, 380, voxel=.003, uv=('side',),
        detail=S.fine(S.slit((0, .722, 0), (0, 1, 0), .005, .005), S.stitch((0, .708, 0), (0, 1, 0), .015, .004, .003, along=(0, 0, 1)), S.studs([V(-.283, .705, -.005)], .01, .005)))
st = S.torus(TH(-1, .74), .098, .012, rot(0, 0, -.03), squash=2.0)
fig.add('bagstrap', 'legL', 'leaB', st, 110, voxel=.003, detail=S.weave(520, .0012))

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
chest = S.ellipsoid((0, 1.32, -.002), (.208, .165, .13))
shoulders = S.union(S.rcone((0, 1.455, -.014), (-.2, 1.41, -.012), .078, .064), S.rcone((0, 1.455, -.014), (.2, 1.41, -.012), .078, .064), k=.03)
belly = S.ellipsoid((0, 1.13, .008), (.16 if not heavy else .175, .15, .118))
back = S.ellipsoid((0, 1.24, -.04), (.185, .21, .105))
torso = S.union(chest, shoulders, belly, back, k=.07)
torso = S.cut(torso, S.below(1.0))
suit = S.bump(torso, lambda p: .005 * np.sin(p[..., 1] * 150) * np.clip((1.2 - p[..., 1]) * 12, 0, 1))          # ribbed where the plate stops
fig.add('undersuit', 'body', 'rib', suit, 620, voxel=.0035, uv=('cyl', V(0, 1.25, 0)))
plate = S.cut(S.grow(torso, .03), S.below(1.19), S.plane((0, 1.235, .13), (0, 1, -.9)))               # the bottom edge lifts at the front, the way a real breastplate clears the belt
plate = S.cut(plate, S.sphere((-.262, 1.4, -.005), .1), S.sphere((.262, 1.4, -.005), .1))                         # arm holes
rim = S.both(S.cut(S.grow(torso, .04), S.grow(torso, .02)), S.slab((0, 1.202, 0), (0, 1, 0), .013))               # a rolled edge along the bottom
rim = S.both(rim, S.plane((0, 0, .02), (0, 0, 1)))
plate = S.union(plate, rim, k=.008)
plate = S.bump(plate, lambda p: -.007 * np.clip(1 - np.abs(S.noise(p, 16, 7.7) - .5) * 7, 0, 1) * (p[..., 2] > -.02))
plate = S.groove(plate, [V(-.17, 1.2, .12), V(-.1, 1.26, .16)], .004, .005)                                       # an old scar
rv = [S.skin(plate, (0, 1.245, -.01), (np.sin(a), 0, np.cos(a))) for a in np.linspace(.75, 2.4, 6)] + [S.skin(plate, (0, 1.245, -.01), (-np.sin(a), 0, np.cos(a))) for a in np.linspace(.75, 2.4, 6)]
plated = S.fine(S.slit((0, 1.3, -.02), (1, 0, 0), .0045, .005) if not heavy else S.slit((0, 1.3, -.02), (1, 0, .1), .0045, .005),         # the join down the back and front
                S.only(S.slit((0, 1.265, 0), (0, 1, 0), .004, .004), lambda p: np.abs(p[..., 0]) > .12), S.studs(rv, .009, .004),
                S.trace([V(.2, 1.3, -.02), V(.21, 1.4, -.02)], .004, .004))
fig.add('cuirass', 'body', steel, plate, 1200, voxel=.0035, uv=('cyl', V(0, 1.3, 0)), detail=plated,
        marks=[(S.only(S.band((0, 1.225, 0), (0, 1, 0), .012), lambda p: p[..., 2] < .0), (.1, .09, .08))])
front = S.grow(torso, .03)
cz = .22 if heavy else .2
badge = S.both(S.cut(S.grow(front, .022), front), S.box((0, 1.34, cz), (.165, .115, .12), .035, rot(-.1, 0, 0)), k=.006)
fig.add('chestplate', 'body', chestm, badge, 440, voxel=.003, uv=('front',), texel=1.5)
bolts = S.union(*[S.sphere(S.skin(badge, (x, y, .09), (0, 0, 1), out=-.002), .012) for x, y in ((-.13, 1.42), (.13, 1.42), (-.135, 1.26), (.135, 1.26))])
fig.add('chestbolts', 'body', 'nS', bolts, 110, voxel=.002, uv=('front',))
# the rig: a band of webbing round the belly with a row of magazine pouches on the front of it
web = S.both(S.cut(S.grow(torso, .017), S.grow(torso, .002)), S.slab((0, 1.11, 0), (0, 1, 0), .036))
fig.add('rigband', 'body', 'leaB', web, 260, voxel=.003, uv=('wrap', V(0, 1.11, 0)), detail=S.fine(S.weave(480, .0012), S.stitch((0, 1.138, 0), (0, 1, 0), .014, .004, .003, along=(1, 0, 0))))
pcs, flaps, tabs = [], [], []
for x in ((-.094, 0, .094) if not patch else (-.094, .094)):
    c = S.skin(torso, (x * .5, 1.105, -.02), (x * 1.6, 0, 1), out=.034)
    R = rot(.05, x * 2.6, 0)
    pcs.append(S.box(c, (.04, .062, .03), .012, R))
    flaps.append(S.box(c + R @ V(0, .04, .004), (.043, .027, .033), .009, R))
    tabs.append(c + R @ V(0, .012, .04))
pouches = S.union(S.union(*pcs), S.union(*flaps), k=.004)
fig.add('rigpouches', 'body', 'fabT' if not heavy else 'lea', pouches, 520, voxel=.0028, uv=('front',), sharp=36,
        detail=S.fine(S.outline(S.grow(S.union(*flaps), -.007), .004, .004), S.studs(tabs, .009, .005), S.only(S.weave(300, .0012, (1, 0, 0)), lambda p: p[..., 1] < 1.105)))
if patch:      # the medic's roll in the middle of the rig, with the cross on it
    c = S.skin(torso, (0, 1.105, -.02), (0, 0, 1), out=.036)
    med = S.box(c, (.05, .066, .034), .014)
    cross = S.union(S.box(c, (.03, .01, .1)), S.box(c, (.01, .03, .1)))
    fig.add('medroll', 'body', 'pW', med, 200, voxel=.003, uv=('front',), marks=[(S.inside(cross), (.72, .12, .09))], detail=S.outline(S.grow(med, -.01), .004, .004))
for sx, nm in ((-1, 'strapL'), (1, 'strapR')):
    o = V(sx * .125, 1.3, -.01)                                  # laid on the plate: up the front, over the shoulder, down the back
    st = S.chain([S.skin(plate, o, (0, np.sin(a), np.cos(a)), out=.004) for a in np.linspace(-.75, 3.6, 14)], .017)
    st = S.squash(st, (1.6, 1, 1), o)
    fig.add(nm, 'body', 'leaB', st, 170, voxel=.003, uv=('front',))
fig.add('neckring', 'body', 'rib', ring((0, 1.5, -.005), .1, .1, .03, .03, .012), 150, voxel=.003)
# a dust wrap bunched round the neck with its tail thrown over the off shoulder: nobody out here is in clean kit
bare = long_ or patch                                        # two of them show their faces, so their wrap sits low on the collar instead of up over the chin
wrap = S.torus((0, 1.492, -.004), .116, .036, squash=1.05) if bare else S.torus((0, 1.525, .0), .118, .046, squash=1.05)
if not bare:
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
fig.add('pack', 'body', 'pD', pack, 420, voxel=.004, uv=('front',), texel=.8,
        detail=S.fine(S.outline(S.grow(pack, -.02), .005, .005), S.only(S.stitch((0, 1.2, 0), (0, 1, 0), .018, .005, .003, along=(1, 0, 0)), lambda p: p[..., 2] < -.3)))
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
dome = S.bump(dome, lambda p: -.004 * np.clip(1 - np.abs(S.noise(p, 9, 12.5) - .5) * 9, 0, 1))
for a in (-2.2, -1.2, 1.2, 2.2):
    dome = S.union(dome, S.sphere(HC + V(np.sin(a) * .16, .01, np.cos(a) * .18), .01))
hrv = [HC + V(np.sin(a) * .15, .004, np.cos(a) * .17) for a in np.linspace(0, 2 * np.pi, 13)[:-1] + .26]
tally = S.fine(*[S.trace([HC + V(.17, .05 + .0, -.06 + i * .016), HC + V(.17, .1, -.055 + i * .016)], .003, .004) for i in range(4)],
               S.trace([HC + V(.17, .06, -.075), HC + V(.17, .09, .0)], .003, .004))
fig.add('helmet', 'head', hel, dome, 1300, voxel=.0028, uv=('cyl', HC), texel=1.15,
        detail=S.fine(S.only(S.slit(HC + V(0, .045, 0), (0, 1, .12), .004, .004), lambda p: np.abs(p[..., 0]) > .03), S.studs(hrv, .008, .004), tally),
        marks=[(S.band(HC, (1, 0, 0), .02), (.1, .09, .08))][:(1 if not long_ else 0)])
neck = S.rcone((0, 1.46, -.015), (0, 1.62, -.01), .062, .06)
neck = S.bump(neck, lambda p: .004 * np.sin(p[..., 1] * 180))
skull = S.union(neck, S.ellipsoid(HC + V(0, -.03, 0), (.138, .13, .155)), k=.03)
fig.add('hood', 'head', 'rib', skull, 380, voxel=.0035, uv=('cyl', V(0, 1.55, 0)))
mask = S.both(S.cut(S.ellipsoid(HC + V(0, -.06, .01), (.15, .13, .178)), S.above(1.64 + .02)), S.plane(HC + V(0, 0, .04), (0, 0, -1)), k=.01)
mask = S.union(mask, S.both(S.ellipsoid(HC + V(0, -.12, .1), (.085, .07, .09)), S.plane(HC + V(0, 0, .06), (0, 0, -1))), k=.03)   # the snout
mask = S.groove(mask, [HC + V(-.11, -.1, .13), HC + V(-.05, -.15, .16)], .004, .005)
mask = S.groove(mask, [HC + V(.11, -.1, .13), HC + V(.05, -.15, .16)], .004, .005)
fig.add('mask', 'head', 'gunB', mask, 560, voxel=.003, uv=('front',), detail=S.fine(S.only(S.slit(HC, (1, 0, 0), .004, .004), lambda p: p[..., 1] < HC[1] - .09), S.studs([HC + V(sx * .125, -.1, .1) for sx in (-1, 1)], .009, .004)))
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
    vh = .026 if heavy else .04
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
fig.add('filters', 'head', bl if heavy else 'bS', S.union(*fl), 420, voxel=.0025, uv=('front',), sharp=45)
fig.add('earcups', 'head', bl if heavy else 'bD', S.union(*ears), 300, voxel=.003, uv=('side',), sharp=45)
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

# ---------------------------------------------------------------- two of them show their faces
# The Longshot has never liked a helmet: a bush hat, a scarf, one eye shut and the other behind a glass. The Patch keeps the
# white helmet with the cross on it, but a medic who cannot be seen to smile is no use, so the mask hangs under the chin.
if long_:
    fig.parts = [q for q in fig.parts if q.name not in ('helmet', 'hood', 'mask', 'scopecups', 'scopeglass', 'eyeglass', 'respirator', 'grille', 'filters', 'earcups', 'eardiscs', 'antenna', 'antennatip', 'lamp', 'lampglass', 'scrimhood')]
    FS, FC = 1.12, HC + V(0, -.03, 0)
    Fp = lambda x, y, z: FC + V(x, y, z) * FS
    fc, skl = Hu.face(FC, FS, jaw=.9, long=.012, cheek=.7, nose=(1.28, .72, 1.0), brow=1.15, lip=.8, lines=1.7, squint=(-1,), sockets=(1,))
    stub = lambda p: np.clip((FC[1] - .062 * FS - p[..., 1]) * 45, 0, 1) * np.clip((p[..., 2] - FC[2] - .0) * 40, 0, 1) * np.clip((p[..., 1] - FC[1] + .2 * FS) * 40, 0, 1) * .5
    fig.add('face', 'head', 'skinF', fc, 2400, voxel=.0023, uv=('cyl', FC), marks=[(stub, (.5, .48, .47))])
    fig.add('hair', 'head', 'hairG', Hu.cropped(skl, FC, FS, .03), 300, voxel=.0025, uv=('cyl', FC))
    brows = S.union(*[S.ellipsoid(Fp(sx * .045, .047, .094), (.036 * FS, .012 * FS, .014 * FS), rot(0, sx * .3, sx * -.3)) for sx in (-1, 1)])
    fig.add('brows', 'head', 'hairG', S.bump(brows, lambda p: (S.noise(p, 160, 2.2) - .5) * .004), 160, voxel=.0018, uv=('front',))
    HT, HRb = FC + V(0, .05 * FS, -.006), rot(-.12, 0, .07)
    crown = S.cut(S.both(S.ellipsoid(HT + V(0, .0, 0), (.126, .13, .14)), S.below(HT[1] + .092)), S.below(HT[1]))
    brim = S.ellipsoid(HT + V(0, .004, .004), (.232, .012, .242))

    def flop(p):                                                 # a brim that has been slept on: down at the sides, up at the back, never level
        q = p - HT
        th, rr = np.arctan2(q[..., 0], q[..., 2]), np.sqrt(q[..., 0] ** 2 + q[..., 2] ** 2)
        k = np.clip((rr - .11) / .12, 0, 1)
        return k * (-.026 * np.sin(th) ** 2 + .016 * np.sin(th * 3 + .6) + .02 * np.clip(-np.cos(th), 0, 1)) + .0025 * np.sin(rr * 230) * k
    brim = lambda p, b=brim: b(p + np.stack([np.zeros_like(p[..., 0]), -flop(p), np.zeros_like(p[..., 0])], -1))
    hat = S.bump(S.union(crown, brim, k=.014), lambda p: (S.noise(p, 26, 8.8) - .5) * .006)
    hs = lambda f: S.moved(f, R=HRb, c=HT)
    fig.add('bushhat', 'head', 'fabG', hs(hat), 1500, voxel=.003, uv=('top',), texel=1.1)
    fig.add('hatband', 'head', 'leaB', hs(S.torus(HT + V(0, .016, 0), .131, .011, squash=1.7)), 240, voxel=.0025, uv=('cyl', HT))
    rounds = S.union(*[S.union(S.cyl(HT + V(-np.cos(a) * .141, .008, np.sin(a) * .148), HT + V(-np.cos(a) * .141, .05, np.sin(a) * .148), .009, .002), S.rcone(HT + V(-np.cos(a) * .141, .05, np.sin(a) * .148), HT + V(-np.cos(a) * .141, .068, np.sin(a) * .148), .008, .003)) for a in (-.25, 0, .25)])
    fig.add('hatrounds', 'head', 'nY', hs(rounds), 150, voxel=.0018, uv=('side',), sharp=40)
    cord = S.union(*[S.chain([HT + V(sx * .118, -.0, .03), Fp(sx * .095, -.09, .05), Fp(sx * .03, -.19, .07), Fp(0, -.2, .075)], .005) for sx in (-1, 1)], S.sphere(Fp(0, -.2, .078), .011))
    fig.add('hatcord', 'head', 'leaB', cord, 120, voxel=.002)
    E = Fp(.04, .001, .108)
    cups = S.union(S.cyl(E, E + V(.004, -.004, .092), .041, .007), S.torus(E + V(.004, -.004, .09), .038, .007, rot(np.pi / 2, 0, 0)), S.cyl(E + V(.04, .0, .03), E + V(.06, .0, .03), .012, .003), S.torus(E + V(.002, -.002, .045), .042, .005, rot(np.pi / 2, 0, 0)), k=.003)
    fig.add('scopecups', 'head', 'gunB', cups, 420, voxel=.0022, uv=('front',), sharp=50)
    fig.add('scopeglass', 'head', 'lens', S.both(S.sphere(E + V(.003, -.003, .065), .05), S.cyl(E + V(.004, -.004, .076), E + V(.004, -.004, .1), .033)), 90, voxel=.0022, uv=('front',))
    strap = S.both(S.cut(S.grow(skl, .007), skl), S.slab(FC + V(0, .004, 0), (.22, 1, .05), .011))
    fig.add('scopestrap', 'head', 'leaB', S.cut(strap, S.above(HT[1] + .0)), 160, voxel=.0025, uv=('cyl', FC))
    wrap = S.torus((0, 1.512, -.03), .082, .034, rot(-.3, 0, 0), squash=1.05)                                             # high at the back of the neck, low under the chin
    wrap = S.union(wrap, S.ellipsoid((.035, 1.415, .098), (.05, .075, .03), rot(.12, 0, -.14)), k=.03)                   # the end of it hangs down the chest
    wrap = S.bump(wrap, lambda p: .009 * np.sin(p[..., 1] * 70 + np.arctan2(p[..., 0], p[..., 2]) * 3) + (S.noise(p, 22, 6.1) - .5) * .008)
    fig.add('scarf', 'head', 'fabG', wrap, 700, voxel=.003, uv=('cyl', V(0, 1.48, 0)))
if patch:
    fig.parts = [q for q in fig.parts if q.name not in ('hood', 'mask', 'gogglecups', 'goggleglass', 'respirator', 'grille', 'filters')]
    FS, FC = 1.2, HC + V(0, -.055, .004)
    Fp = lambda x, y, z: FC + V(x, y, z) * FS
    fc, skl = Hu.face(FC, FS, jaw=1.06, long=-.004, cheek=1.14, nose=(.88, .94, 0), brow=.9, lip=1.4, lines=.5, sockets=(-1, 1), ears=False)
    fig.add('face', 'head', 'skinD', fc, 2400, voxel=.0024, uv=('cyl', FC))
    fig.add('hair', 'head', 'stache', Hu.cropped(skl, FC, FS, .0, 5.5), 260, voxel=.0028, uv=('cyl', FC))
    strap = S.both(S.cut(S.grow(fc, .006), fc), S.slab(FC + V(0, 0, .012), (0, .2, 1), .013))
    strap = S.cut(strap, S.below(FC[1] - .158 * FS), S.above(HC[1] - .02))
    fig.add('chinstrap', 'head', 'leaB', S.union(strap, S.ellipsoid(Fp(0, -.166, .05), (.03, .012, .03)), k=.004), 220, voxel=.0025, uv=('front',))
    rims, glass = [], []
    for sx in (-1, 1):                                                                                           # round spectacles, mended at the bridge
        c = Fp(sx * .041, .0, .124)
        rims += [S.torus(c, .036, .0045, rot(np.pi / 2, 0, 0)), S.chain([c + V(sx * .036, 0, 0), c + V(sx * .068, .004, -.05), Fp(sx * .1, .0, .0)], .0035)]
        glass.append(S.cyl(c + V(0, 0, -.004), c + V(0, 0, .003), .034, .001))
    rims.append(S.union(S.rcone(Fp(-.012, .004, .13), Fp(.012, .004, .13), .004), S.sphere(Fp(0, .004, .131), .008)))
    fig.add('gogglecups', 'head', 'nS', S.union(*rims), 320, voxel=.0018, uv=('front',))
    fig.add('goggleglass', 'head', 'lens', S.union(*glass), 90, voxel=.002, uv=('front',))
    hang = lambda f: S.moved(f, d=V(0, -.118, -.046), R=rot(.5, 0, 0), c=HC + V(0, -.125, .12))                 # the mask, pulled down under the chin
    fig.add('respirator', 'head', 'pD', hang(resp), 300, voxel=.0025, uv=('front',), sharp=45)
    fig.add('grille', 'head', 'rib', hang(gr), 110, voxel=.002, uv=('front',))
    fig.add('maskstrap', 'head', 'leaB', S.torus((0, 1.475, -.0), .068, .011, rot(.3, 0, 0), squash=1.6), 140, voxel=.0025, uv=('cyl', V(0, 1.47, 0)))

# ---------------------------------------------------------------- the Sapper: a padded blast apron, charges on the chest, a reel of firing cord on the back
# The yard's blaster. No plate: plate turns into shrapnel next to a charge, so he wears a quilted apron as thick as a mattress, split up
# the front so he can kneel, and a leather crash cap with the goggles pushed up. He carries the charges where he can count them.
if sap:
    drop = ('cuirass', 'chestplate', 'chestbolts', 'rigband', 'rigpouches', 'strapL', 'strapR', 'bedroll', 'rollstraps', 'packplate', 'hose', 'pouchR', 'wrap',
            'helmet', 'hood', 'mask', 'visor', 'visorframe', 'respirator', 'grille', 'filters', 'earcups', 'eardiscs', 'antenna', 'antennatip', 'lamp', 'lampglass')
    fig.parts = [q for q in fig.parts if q.name not in drop]
    quilt = lambda p: .008 * np.sqrt(np.abs(np.sin(p[..., 1] * 50))) + .004 * np.sqrt(np.abs(np.sin(np.arctan2(p[..., 0], p[..., 2]) * 7)))   # pillows of padding
    vest = S.cut(S.grow(torso, .045), S.below(1.0))
    vest = S.cut(vest, S.sphere((-.275, 1.4, -.005), .11), S.sphere((.275, 1.4, -.005), .11))
    skirt = S.both(S.cut(S.ecyl((0, .87, .015), .245, .19, .16, .03), S.ecyl((0, .87, .015), .2, .148, .4, 0)), S.plane((0, 0, .0), (0, 0, -1)))
    skirt = S.cut(skirt, S.slab((0, 0, 0), (1, 0, 0), .014), S.below(.7))                                       # split up the front so the knees can work
    skirt = S.cut(skirt, lambda p: p[..., 1] - (.71 + .012 * np.sin(p[..., 0] * 60)))
    apron = S.union(S.bump(vest, quilt), S.bump(skirt, quilt), k=.03)
    apron = S.bump(apron, lambda p: (S.noise(p, 18, 4.4) - .5) * .008)
    fig.add('apron', 'body', 'vestB', apron, 1400, voxel=.0035, uv=('cyl', V(0, 1.1, 0)),
            detail=S.fine(S.only(S.slit((0, 1.3, 0), (1, 0, 0), .004, .004), lambda p: p[..., 2] > .0), S.stitch((0, 1.02, 0), (0, 1, 0), .016, .004, .003, along=(1, 0, 0))),
            marks=[(S.chevrons((0, .75, 0), (1, 0, .0), .07, lambda p: (p[..., 1] < .79) * (p[..., 2] > .0)), (.1, .09, .08))])
    collar = S.union(S.torus((0, 1.49, -.012), .118, .052, squash=1.15), S.torus((0, 1.535, -.03), .1, .04, rot(.18, 0, 0)), k=.03)
    collar = S.bump(collar, lambda p: .008 * np.sqrt(np.abs(np.sin(np.arctan2(p[..., 0], p[..., 2]) * 6))))
    fig.add('collar', 'body', 'vestB', collar, 700, voxel=.0032, uv=('cyl', V(0, 1.5, 0)))
    # three charges on a sash from the left shoulder to the right hip, each taped and tagged
    sash = S.chain([S.skin(apron, (x, y, -.02), (x * .8, 0, 1), out=.006) for x, y in ((-.2, 1.47), (-.12, 1.37), (-.04, 1.28), (.05, 1.18), (.13, 1.1), (.2, 1.03))], .024)
    sash = S.squash(sash, (1, 1, .55), (0, 1.25, .25))
    fig.add('sash', 'body', 'leaB', sash, 260, voxel=.003, uv=('front',), detail=S.weave(500, .0012, (1, 1, 0)))
    bricks, tape = [], []
    for x, y in ((-.1, 1.36), (-.02, 1.27), (.065, 1.18)):
        c = S.skin(apron, (x, y, -.02), (x * .8, 0, 1), out=.032)
        R = rot(0, x * 1.5, .75)
        bricks.append(S.box(c, (.062, .036, .028), .008, R))
        tape += [S.box(c + R @ V(dx, 0, 0), (.009, .039, .031), .003, R) for dx in (-.034, .034)]
    fig.add('charges', 'body', 'tank', S.union(*bricks), 380, voxel=.0026, uv=('front',), sharp=35)
    fig.add('chargetape', 'body', 'haz', S.union(*tape), 200, voxel=.0024, uv=('front',))
    # the firing box on his right hip: a squat case with a T-handle plunger, cord running back to the reel
    dc = V(.16, .97, .15)
    det = S.cut(S.box(dc, (.05, .055, .04), .012), S.box(dc + V(0, .058, 0), (.035, .01, .025), .004))
    fig.add('detonator', 'body', 'pY', det, 260, voxel=.0025, uv=('front',), sharp=35, marks=[(S.band(dc + V(0, -.02, 0), (0, 1, 0), .01), (.1, .09, .08))])
    plg = S.union(S.cyl(dc + V(0, .05, 0), dc + V(0, .13, 0), .008, .002), S.rcone(dc + V(-.045, .13, 0), dc + V(.045, .13, 0), .012), k=.004)
    fig.add('plunger', 'body', 'gunm', plg, 120, voxel=.002, uv=('side',))
    # the reel of firing cord on top of the pack, with a spade strapped across the back
    RC = V(0, 1.585, -.255)
    reel = S.bump(S.cyl(RC - V(.13, 0, 0), RC + V(.13, 0, 0), .074, .01), lambda p: .006 * np.abs(np.sin((p[..., 0] * 1.0 + np.arctan2(p[..., 1] - RC[1], p[..., 2] - RC[2]) * .0) * 210)))
    fig.add('cordreel', 'body', 'rubber', reel, 320, voxel=.003, uv=('side',))
    fl = S.union(*[S.cut(S.cyl(RC + V(sx * .13, 0, 0), RC + V(sx * .152, 0, 0), .102, .006), *[S.sphere(RC + V(sx * .14, np.sin(a) * .06, np.cos(a) * .06), .018) for a in np.linspace(0, 6.28, 6)[:-1]]) for sx in (-1, 1)])
    fl = S.union(fl, S.cyl(RC - V(.18, 0, 0), RC + V(.18, 0, 0), .016, .004), k=.004)
    fig.add('reelflanges', 'body', 'pY', fl, 420, voxel=.0028, uv=('side',), sharp=40)
    frame = S.union(*[S.chain([RC + V(sx * .17, 0, 0), RC + V(sx * .17, -.1, -.02), RC + V(sx * .17, -.15, .06)], .012) for sx in (-1, 1)])
    fig.add('reelframe', 'body', 'gunm', frame, 140, voxel=.0025)
    cord = S.chain([RC + V(.06, -.07, .03), V(.2, 1.42, -.2), V(.27, 1.2, -.08), V(.25, 1.04, .06), dc + V(.04, .0, -.02)], .009)
    fig.add('firecord', 'body', 'red', cord, 160, voxel=.0022, glow=.25)
    sa, sb = V(-.2, 1.06, -.47), V(.17, 1.7, -.43)
    sax = (sb - sa) / np.linalg.norm(sb - sa)
    shaft = S.union(S.rcone(sa + sax * .18, sb, .017), S.rcone(sb - V(.06, 0, 0) * 1, sb + V(.06, .0, 0), .015), k=.006)
    fig.add('spadeshaft', 'body', 'wood', shaft, 200, voxel=.0025, uv=('side',))
    Rb = S.basis(-sax, (0, 0, -1))
    blade = S.box(sa + sax * .08, (.085, .012, .11), .008, Rb)
    blade = S.cut(blade, S.box(sa + sax * -.07, (.2, .03, .05), 0, rot(0, 0, .0) @ Rb if False else Rb))
    blade = S.union(blade, S.rcone(sa + sax * .12, sa + sax * .2, .026, .02), k=.01)
    blade = S.bump(blade, lambda p: -.004 * np.clip(1 - np.abs(S.noise(p, 30, 2.7) - .5) * 6, 0, 1))
    fig.add('spadeblade', 'body', 'bD', blade, 260, voxel=.0025, uv=('front',), sharp=40)
    sst = S.union(*[S.torus(sa + sax * t, .03, .008, S.basis(sax, (0, 0, 1)), squash=1.3) for t in (.3, .62)])
    fig.add('spadestraps', 'body', 'leaB', sst, 120, voxel=.0025)
    # a bare face under a leather crash cap: ear flaps down, goggles up on the brow, a moustache he is proud of
    FS, FC = 1.18, HC + V(0, -.05, .004)
    Fp = lambda x, y, z: FC + V(x, y, z) * FS
    fc, skl = Hu.face(FC, FS, jaw=1.12, long=.0, cheek=1.0, nose=(1.2, 1.15, .4), brow=1.05, lip=.9, lines=1.3, sockets=(-1, 1), ears=False)
    stub = lambda p: np.clip((FC[1] - .07 * FS - p[..., 1]) * 45, 0, 1) * np.clip((p[..., 2] - FC[2]) * 40, 0, 1) * np.clip((p[..., 1] - FC[1] + .2 * FS) * 40, 0, 1) * .45
    fig.add('face', 'head', 'skinF', fc, 2400, voxel=.0023, uv=('cyl', FC), marks=[(stub, (.48, .4, .36))])
    eyes = S.union(*[S.sphere(Fp(sx * .04, .0, .1), .021 * FS) for sx in (-1, 1)])                               # goggles up, so his eyes show: narrowed, under heavy lids
    fig.add('eyes', 'head', 'nW', eyes, 160, voxel=.0018, uv=('front',))
    fig.add('pupils', 'head', 'gunm', S.union(*[S.ellipsoid(Fp(sx * .037, -.003, .121), (.009 * FS, .01 * FS, .004)) for sx in (-1, 1)]), 80, voxel=.0012, uv=('front',))
    lids = S.union(*[S.both(S.sphere(Fp(sx * .04, .0, .1), .025 * FS), S.plane(Fp(0, .009, 0), (0, -1, -.15))) for sx in (-1, 1)])
    fig.add('lids', 'head', 'skinF', lids, 200, voxel=.0018, uv=('front',))
    cap = S.both(S.grow(skl, .018), S.plane(FC + V(0, .006, 0), (0, -1, .5)))
    cap = S.union(cap, S.both(S.cut(S.grow(skl, .03), S.grow(skl, .012)), S.slab(FC + V(0, .02, 0), (0, 1, -.5), .012)), k=.006)       # a padded roll round the rim
    for sx in (-1, 1):
        cap = S.union(cap, S.both(S.box(Fp(sx * .1, -.06, -.02), (.03, .07, .055), .025), S.cut(S.grow(skl, .03), S.grow(skl, -.03))), k=.012)     # the ear flaps
    cap = S.bump(cap, lambda p: .004 * np.sqrt(np.abs(np.sin((p[..., 0] - FC[0]) * 70))) + (S.noise(p, 24, 5.5) - .5) * .005)
    fig.add('crashcap', 'head', 'lea', cap, 1200, voxel=.0028, uv=('cyl', FC), texel=1.1,
            detail=S.fine(S.slit(FC, (1, 0, 0), .004, .004), S.studs([Fp(sx * .118, -.1, .0) for sx in (-1, 1)], .009, .004)))
    gup, gls = [], []
    for sx in (-1, 1):
        d = V(sx * .22, .55, 1)
        d = d / np.linalg.norm(d)
        c = Fp(sx * .046, .098, .094)
        gup += [S.cyl(c, c + d * .04, .036, .007), S.torus(c + d * .038, .033, .007, S.basis((0, 1, 0), d))]
        gls.append(S.both(S.sphere(c + d * .022, .037), S.cyl(c + d * .028, c + d * .05, .028)))
    gup.append(S.rcone(Fp(-.012, .1, .108), Fp(.012, .1, .108), .006))
    fig.add('goggles', 'head', 'gunB', S.union(*gup), 420, voxel=.0022, uv=('front',), sharp=50)
    fig.add('goggleglass', 'head', 'lens', S.union(*gls), 110, voxel=.002, uv=('front',))
    gst = S.both(S.cut(S.grow(skl, .03), S.grow(skl, .016)), S.slab(Fp(0, .085, 0), (0, 1, .4), .011))
    fig.add('gogglestrap', 'head', 'leaB', gst, 200, voxel=.0025, uv=('cyl', FC))
    st = S.union(*[S.ellipsoid(Fp(sx * .03, -.062, .118), (.034, .013, .016), rot(0, sx * .35, sx * .3)) for sx in (-1, 1)], S.ellipsoid(Fp(0, -.058, .122), (.016, .012, .012)), k=.01)
    st = S.union(st, *[S.rcone(Fp(sx * .058, -.07, .108), Fp(sx * .072, -.1, .1), .009, .004) for sx in (-1, 1)], k=.008)          # the ends waxed down past the lip
    fig.add('moustache', 'head', 'stache', S.bump(st, lambda p: (S.noise(p, 150, 3.1) - .5) * .004), 260, voxel=.0018, uv=('front',))

# ---------------------------------------------------------------- arms and the weapon
GX, GY = (.2 if heavy else .135), 1.2                                              # the bore line: low on the right side, level, pointing ahead


def gun_parts():
    out = []
    if sap:        # a cut-down carbine with a drum: short enough to carry crawling, a drum because he will not stop to reload under a wall
        rec = S.box((GX, GY, .14), (.042, .066, .17), .014)
        rec = S.cut(rec, S.box((GX + .045, GY + .012, .15), (.012, .022, .05), .005))
        out.append(('receiver', 'gunm', rec, 380, dict(voxel=.003, uv=('side',), sharp=35)))
        out.append(('barrel', 'gunB', S.cyl((GX, GY + .022, .28), (GX, GY + .022, .62), .03, .003), 150, dict(voxel=.0025, uv=('side',), sharp=50)))
        sh = S.cyl((GX, GY + .022, .3), (GX, GY + .022, .52), .046, .01)
        for i in range(3):
            for a in (0, 1.57, 3.14, 4.71):
                sh = S.cut(sh, S.sphere((GX + np.sin(a) * .048, GY + .022 + np.cos(a) * .048, .34 + i * .06), .014))
        out.append(('shroud', 'pO', sh, 380, dict(voxel=.0026, uv=('side',), sharp=40)))
        out.append(('brake', 'bS', S.cyl((GX, GY + .022, .6), (GX, GY + .022, .66), .04, .008), 120, dict(voxel=.0022, uv=('side',), sharp=40)))
        drum = S.union(S.cyl((GX - .045, GY - .1, .22), (GX + .045, GY - .1, .22), .082, .012), S.cyl((GX - .05, GY - .1, .22), (GX + .05, GY - .1, .22), .02, .004), k=.004)
        out.append(('drum', 'pS', drum, 320, dict(voxel=.0026, uv=('side',), sharp=40)))
        out.append(('grip', 'lea', S.box((GX, GY - .115, .07), (.028, .07, .034), .015, rot(.3, 0, 0)), 130, dict(voxel=.003, uv=('side',))))
        wire = S.union(S.chain([V(GX - .02, GY + .01, .0), V(GX - .02, GY - .02, -.22), V(GX + .02, GY - .02, -.22), V(GX + .02, GY + .01, .0)], .009), S.box((GX, GY - .03, -.235), (.034, .06, .012), .006), k=.004)
        out.append(('stock', 'gunm', wire, 200, dict(voxel=.0025, uv=('side',))))
        out.append(('sights', 'pS', S.union(S.box((GX, GY + .08, .12), (.012, .014, .02), .004), S.box((GX, GY + .075, .5), (.006, .03, .01), .003)), 90, dict(voxel=.0022, uv=('side',), sharp=30)))
        return out, V(GX, GY + .022, .68), .9
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
    big = sx < 0 or heavy
    k = 1.0 if big else .84
    R = rot(0, 0, -sx * .5)
    c = Sh + V(sx * .034, .034, -.005)
    lames, rvs = [], []
    for j in range(3 if big else 2):                         # each lame sits lower and further out than the one above, which laps over it
        cj = c + V(sx * .017 * j, -.04 * j, 0)
        e = V(.112 + .005 * j, .086, .122 + .006 * j) * k
        ell = S.ellipsoid(cj, e, R)
        lam = S.both(ell, S.plane(cj + R @ V(0, -.03, 0), R @ V(0, -1, 0)))                                 # a straight lower edge, standing proud of the lame below
        lam = S.both(lam, S.slab(cj, (0, 0, 1), e[2] * (.88 - .03 * j)), k=.004)                            # squared off front and back
        lam = S.both(lam, S.plane(cj + V(0, 0, e[2] * .5), V(0, -.62, 1)), k=.004)                          # the lower corners clipped at an angle
        lam = S.both(lam, S.plane(cj - V(0, 0, e[2] * .5), V(0, -.62, -1)), k=.004)
        lames.append(lam)
        rvs += [S.skin(ell, cj, R @ V(sx * .5, .16 if j == 0 else -.02, z)) for z in (-.8, .8)]
    pd = S.union(*lames)
    pd = S.cut(pd, S.grow(S.union(*[S.moved(l, d=(-sx * .012, -.014, 0)) for l in lames]), -.004), k=.003)          # hollow underneath: plates, not blocks
    pd = S.cut(pd, S.below(c[1] - (.135 if big else .1)), k=.004)                                                   # the tails trimmed level
    top = S.skin(S.ellipsoid(c, V(.118, .09, .13) * k, R), c, R @ V(0, 1, 0))
    pd = S.union(pd, S.cyl(top - R @ V(0, .01, 0), top + R @ V(0, .014, 0), .02, .005), k=.004)                     # the pivot bolt on top
    det = S.fine(S.studs(rvs, .009, .004), S.outline(S.sphere(top, .034), .004, .003))
    marks = []
    if big and not long_:
        lo = c + V(sx * .06, -.104, 0)
        marks = [(S.chevrons(lo, (0, .5, 1), .05, lambda p: (p[..., 1] < lo[1] + .012) * (p[..., 1] > lo[1] - .05)), (.1, .09, .08))]
    elif not long_:
        marks = [(S.band(c, (0, 0, 1), .016), tuple(np.array((.86, .62, .12)) if not patch else (.8, .78, .72)))]
    pauls.append((sx, pd, det, marks, big))
PM = lambda big: capm if big else steel
if heavy:   # the off arm carries a slab of a shield
    fig.add('pauldronR', 'arms', capm, pauls[0][1], 900, voxel=.0026, uv=('top',), sharp=36, detail=pauls[0][2], marks=pauls[0][3])
    fig.add('pauldronL', 'armL', capm, pauls[1][1], 900, voxel=.0026, uv=('top',), sharp=36, detail=pauls[1][2], marks=pauls[1][3])
    ShL, ElL = V(-.24, 1.42, -.01), V(-.36, 1.2, .02)
    RhL = S.basis(V(.55, .05, .83), (-1, 0, .4))
    SR = rot(0, .12, 0)
    sc = V(-.32, .96, .46)
    gripL = sc + V(.02, .14, -.12)
    WrL = Hu.wrist_for(gripL, RhL, ElL)
    armL, _ = Hu.armoured_arm(-1, ShL, ElL, WrL, RhL, 1, sleeve=pants, guard=steel)
    Hu.add_arm(fig, 'armL', 'L', armL)
    slab = S.box(sc, (.42, .58, .03), .06, SR)
    slab = S.bump(slab, lambda p: .02 * (1 - ((p[..., 0] - sc[0]) / .42) ** 2))                                        # bowed across its width
    slab = S.cut(slab, S.box(sc + SR @ V(0, .4, 0), (.2, .045, .1), .02, SR))                                      # the view slot
    slab = S.bump(slab, lambda p: -.008 * np.clip(1 - np.abs(S.noise(p, 9, 21.5) - .5) * 7, 0, 1))
    fig.add('shield', 'armL', 'shield', slab, 900, voxel=.005, uv=('front',))
    fig.add('shieldglass', 'armL', 'visG', S.box(sc + SR @ V(0, .4, .0), (.19, .035, .008), .004, SR), 40, voxel=.004, uv=('front',))
    fig.add('shieldslot', 'armL', 'gunm', S.cut(S.box(sc + SR @ V(0, .4, .01), (.24, .075, .03), .02, SR), S.box(sc + SR @ V(0, .4, .01), (.19, .04, .06), .01, SR)), 160, voxel=.004, uv=('front',))
    fig.add('shieldfoot', 'armL', 'haz', S.box(sc + SR @ V(0, -.43, .02), (.39, .095, .03), .025, SR), 160, voxel=.005, uv=('front',))
    bs = [S.sphere(sc + SR @ V(x, y, .045 - x * x * .12), .03) for x, y in ((-.31, .47), (.31, .47), (-.31, -.27), (.31, -.27))]
    fig.add('shieldbolts', 'armL', 'nS', S.union(*bs), 160, voxel=.004, uv=('front',))
    fig.add('shieldboss', 'armL', 'nO', S.ellipsoid(sc + SR @ V(0, .05, .04), (.1, .1, .04), SR), 120, voxel=.004, uv=('front',))
    fig.add('shieldbrace', 'armL', 'gunm', S.chain([sc + SR @ V(-.2, .12, -.04), sc + SR @ V(-.07, .04, -.12), sc + SR @ V(.1, .12, -.04)], .016), 90, voxel=.004)
else:       # the off hand under the fore-end
    for sx, pd, det, marks, big in pauls:
        if sap:     # quilted rolls on the shoulders, the same padding as the apron
            c = (ShR if sx > 0 else V(-.24, 1.42, -.01)) + V(sx * .03, .035, -.005)
            roll = S.bump(S.ellipsoid(c, (.1, .075, .115), rot(0, 0, -sx * .45)), lambda p: .008 * np.sqrt(np.abs(np.sin(p[..., 2] * 48))))
            fig.add('pauldron' + ('R' if sx > 0 else 'L'), 'arms', 'vestB', roll, 600, voxel=.003, uv=('top',))
            continue
        fig.add('pauldron' + ('R' if sx > 0 else 'L'), 'arms', PM(big), pd, 900 if big else 620, voxel=.0026, uv=('top',), sharp=36, detail=det, marks=marks)
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
