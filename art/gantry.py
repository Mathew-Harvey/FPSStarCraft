"""The Gantry: Ironhold's walker. A yard crane's cab on two back-bent legs, with a cannon hung off each side.

Nothing on it was built for war. The cab is a loader's, dented and re-plated, the legs are lifting gear with the guards
bolted back on, and the guns sit where the grab arms used to be. Run:  python gantry.py [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, human as Hu
from kit.sdf import V, rot

fig = B.Figure('gantry', lo=(-1.85, -.1, -1.5), hi=(1.85, 4.6, 2.0), coarse=.03, detail=.9, paint=1536, brush=2.0)
HIPY = 1.55
fig.group('body', (0, 0, 0))
fig.group('legL', (-.78, HIPY, 0))
fig.group('legR', (.78, HIPY, 0))
fig.group('head', (0, 2.86, 0), 'body')
fig.group('arms', (0, 2.25, .1), 'body')
PI = np.pi
AX = rot(0, 0, PI / 2)                                          # turns an upright can to lie along x


def xcan(c, r, half, rnd=.02):
    c = V(c)
    return S.cyl(c - V(half, 0, 0), c + V(half, 0, 0), r, rnd)


def dents(f, seed, amp=.012, freq=3.0):
    """Knocks and shallow dishes in sheet steel."""
    return S.bump(f, lambda p: -amp * np.clip(1 - np.abs(S.noise(p, freq, seed) - .5) * 5, 0, 1))


def bolts(pts, r):
    return S.union(*[S.sphere(q, r) for q in pts])


# ---------------------------------------------------------------- legs (sculpted for +x, mirrored)
def leg():
    x = .78
    hip, knee, ank = V(x, HIPY, 0), V(x, .93, -.3), V(x, .23, .08)
    out = {}
    drum = xcan(hip, .3, .19, .03)
    for i in range(8):
        a = i * PI / 4
        drum = S.cut(drum, S.sphere(hip + V(.2, np.sin(a) * .22, np.cos(a) * .22), .03))
    out['hipdrum'] = ('bY', drum, 520, dict(voxel=.007, uv=('side',), sharp=40))
    out['hipcap'] = ('nS', S.union(S.ellipsoid(hip + V(.2, 0, 0), (.05, .17, .17)), xcan(hip + V(.25, 0, 0), .05, .02, .01), k=.01), 180, dict(voxel=.006, uv=('side',)))
    T = S.basis(knee - hip, (0, 0, 1))                          # local z down the thigh, local y its front face
    tl = float(np.linalg.norm(knee - hip))
    beam = S.box((hip + knee) / 2, (.1, .15, tl / 2 + .05), .03, T)
    for t in (.3, .5, .7):
        beam = S.cut(beam, S.cyl(hip + (knee - hip) * t - V(.2, 0, 0), hip + (knee - hip) * t + V(.2, 0, 0), .065, .01))   # lightening holes
    out['thigh'] = ('bD', beam, 520, dict(voxel=.007, uv=('side',), sharp=38))
    gp = S.box((hip + knee) / 2 + T @ V(.03, .17, .0), (.17, .035, tl / 2 - .02), .03, T)                                     # the guard bolted back on the front
    gp = dents(gp, 3.3, .014, 5)
    gp = S.groove(gp, [(hip + knee) / 2 + T @ V(-.12, .2, -.1), (hip + knee) / 2 + T @ V(.16, .2, -.1)], .006, .008)
    out['thighguard'] = ('pY', gp, 420, dict(voxel=.007, uv=('front',), sharp=38))
    out['thighbolts'] = ('nS', bolts([(hip + knee) / 2 + T @ V(sx * .13, .208, sz * (tl / 2 - .07)) for sx in (-1, 1) for sz in (-1, 1)], .026), 120, dict(voxel=.005))
    out['kneedrum'] = ('bS', xcan(knee, .2, .17, .025), 300, dict(voxel=.007, uv=('side',), sharp=40))
    out['kneecap'] = ('nD', S.ellipsoid(knee + V(.18, 0, 0), (.04, .11, .11)), 100, dict(voxel=.006, uv=('side',)))
    Sb = S.basis(ank - knee, (0, 0, 1))
    sl = float(np.linalg.norm(ank - knee))
    shin = S.box((knee + ank) / 2, (.085, .12, sl / 2 + .03), .03, Sb)
    shin = S.union(shin, S.box((knee + ank) / 2 + Sb @ V(0, -.1, 0), (.03, .05, sl / 2 - .06), .015, Sb), k=.02)             # a web down the back
    out['shin'] = ('bS', shin, 460, dict(voxel=.007, uv=('side',), sharp=38))
    sp = S.box((knee + ank) / 2 + Sb @ V(0, .14, .02), (.15, .03, sl / 2 - .1), .03, Sb)
    sp = dents(sp, 8.1, .012, 6)
    out['shinguard'] = ('haz', sp, 300, dict(voxel=.007, uv=('front',), sharp=38))
    # the ram that works the knee, its sleeve, and a hose that has been patched more than once
    a, b = hip + V(.13, -.14, -.3), ank + V(.13, .3, -.33)
    out['ramrod'] = ('nS', S.cyl(a, b, .034, .006), 110, dict(voxel=.006, uv=('side',), sharp=50))
    out['ramsleeve'] = ('bD', S.union(S.cyl(a + (b - a) * .42, b, .06, .012), S.sphere(b, .07), S.sphere(a, .06), k=.01), 220, dict(voxel=.006, uv=('side',), sharp=45))
    hose = S.chain([knee + V(-.1, .22, -.14), knee + V(-.13, -.02, -.2), ank + V(-.12, .4, -.2), ank + V(-.09, .1, -.14)], .032)
    hose = S.bump(hose, lambda p: .006 * np.sin(p[..., 1] * 120))
    out['leghose'] = ('rib', hose, 220, dict(voxel=.006, uv=('side',)))
    out['ankle'] = ('nD', S.sphere(ank + V(0, -.02, 0), .17), 160, dict(voxel=.007, uv=('side',)))
    foot = S.box((x, .12, .12), (.28, .1, .43), .05)
    foot = S.cut(foot, S.plane((x, .22, .4), (0, -1, -.5)))                                                                   # sloped toward the toes
    foot = dents(foot, 5.5, .012, 5)
    out['foot'] = ('pD', foot, 420, dict(voxel=.008, uv=('top',), sharp=38))
    toes = S.union(*[S.box((x + tx * .15, .1, .6), (.11, .085, .18), .04) for tx in (-1, 1)])
    toes = S.cut(toes, S.plane((x, .2, .72), (0, -1, -1)))
    out['toes'] = ('pY', toes, 360, dict(voxel=.007, uv=('top',), sharp=38))
    out['heel'] = ('pS', S.box((x, .1, -.36), (.15, .08, .1), .03), 140, dict(voxel=.007, uv=('top',), sharp=38))
    sole = S.box((x, .03, .14), (.31, .035, .5), .02)
    for i in range(7):
        sole = S.cut(sole, S.box((x, -.005, -.26 + i * .13), (.4, .02, .022)))
    out['solepad'] = ('sole', sole, 360, dict(voxel=.008, uv=('top',), sharp=30))
    return out


Hu.both_legs(fig, leg())

# ---------------------------------------------------------------- hull: turntable, cab, glass, engine, stacks
fig.add('turntable', 'body', 'bD', S.cyl((0, 1.47, 0), (0, 1.77, 0), .5, .03), 260, voxel=.009, uv=('cyl', V(0, 1.6, 0)), sharp=40)
slew = S.cyl((0, 1.71, 0), (0, 1.81, 0), .58, .03)
for i in range(16):
    a = i * PI / 8
    slew = S.union(slew, S.sphere((np.sin(a) * .54, 1.815, np.cos(a) * .54), .028))
fig.add('slewring', 'body', 'hazB', slew, 420, voxel=.008, uv=('wrap', V(0, 1.76, 0)), sharp=40)
cab = S.box((0, 2.26, -.05), (.75, .51, .75), .14)
cab = S.cut(cab, S.plane((0, 1.98, .7), (0, .66, -.75)))                                                          # the chin is cut back under the glass
cab = S.cut(cab, S.plane((0, 2.6, .7), (0, -.66, -.75)))                                                            # and the brow leans in
cab = S.cut(cab, S.box((0, 2.44, .78), (.5, .2, .1), .05, rot(-.16, 0, 0)), k=.02)                               # the window well
cab = dents(cab, 1.1, .02, 2.2)
cab = dents(cab, 9.4, .008, 7)
for sx in (-1, 1):                                                                                               # a door each side: a scored outline and a grab handle
    d = [V(sx * .752, 1.95, -.38), V(sx * .752, 2.6, -.38), V(sx * .752, 2.6, .2), V(sx * .752, 1.95, .2), V(sx * .752, 1.95, -.38)]
    cab = S.groove(cab, d, .008, .012)
cab = S.groove(cab, [V(-.75, 2.02, .705), V(.75, 2.02, .705)], .008, .01)
cab = S.groove(cab, [V(-.4, 2.775, -.5), V(-.4, 2.775, .4)], .008, .01)
fig.add('cab', 'body', 'pY', cab, 2400, voxel=.009, uv=('cyl', V(0, 2.26, -.05)), sharp=36)
hand = S.mirror(S.union(S.chain([V(.77, 2.2, .1), V(.83, 2.22, .1), V(.83, 2.42, .1), V(.77, 2.44, .1)], .018), S.box((.77, 2.32, -.3), (.012, .05, .03), .008)))
fig.add('doorhandles', 'body', 'nS', hand, 160, voxel=.005, uv=('side',))
rv = [V(sx * .757, y, z) for sx in (-1, 1) for y in (1.98, 2.57) for z in np.linspace(-.6, .5, 7)] + [V(x, 2.06, .71) for x in np.linspace(-.62, .62, 8)]
fig.add('rivets', 'body', 'nS', bolts(rv, .02), 520, voxel=.006)
bump = S.box((0, 1.86, .68), (.71, .12, .09), .04)
bump = dents(bump, 4.2, .015, 4)
bump = S.cut(bump, S.box((.35, 1.86, .78), (.06, .04, .05), .01), S.box((-.35, 1.86, .78), (.06, .04, .05), .01))   # tow eyes
fig.add('bumper', 'body', 'haz', bump, 380, voxel=.008, uv=('front',), sharp=38)
W = rot(-.16, 0, 0)
wc = V(0, 2.44, .7)
frame = S.cut(S.box(wc, (.53, .23, .045), .04, W), S.box(wc + W @ V(0, 0, .03), (.45, .16, .06), .03, W))
fig.add('windowframe', 'body', 'gunm', frame, 300, voxel=.007, uv=('front',), sharp=38)
fig.add('glass', 'body', 'visG', S.box(wc + W @ V(0, 0, .002), (.45, .16, .012), .008, W), 60, voxel=.007, uv=('front',))
bars = S.union(*[S.box(wc + W @ V(x, 0, .05), (.018, .19, .02), .008, W) for x in (-.16, .16)])
fig.add('windowbars', 'body', 'gunm', bars, 90, voxel=.006, uv=('front',))
hood = S.box((0, 2.71, .64), (.6, .05, .17), .03, rot(.28, 0, 0))
hood = dents(hood, 6.6, .012, 5)
fig.add('visorhood', 'body', 'pD', hood, 200, voxel=.008, uv=('top',), sharp=38)
fig.add('numberplate', 'body', 'chest', S.box((0, 2.07, .715), (.23, .13, .02), .02, rot(.0, 0, .03)), 90, voxel=.007, uv=('front',))
lamps = S.mirror(S.union(S.cyl((.54, 2.04, .62), (.54, 2.04, .78), .11, .02), S.torus((.54, 2.04, .775), .1, .02, rot(PI / 2, 0, 0)), S.box((.54, 2.17, .68), (.03, .04, .05), .01)))
fig.add('headlamps', 'body', 'gunB', lamps, 380, voxel=.006, uv=('front',), sharp=45)
fig.add('lampglass', 'body', 'visG', S.mirror(S.both(S.sphere((.54, 2.04, .72), .11), S.cyl((.54, 2.04, .74), (.54, 2.04, .81), .088))), 120, voxel=.006, uv=('front',))
eng = S.box((0, 2.24, -.92), (.61, .42, .22), .08)
eng = dents(eng, 2.8, .018, 3)
for i in range(5):
    eng = S.cut(eng, S.box((0, 1.98 + i * .12, -1.15), (.42, .028, .05), .012))                                   # louvres
fig.add('engine', 'body', 'pD', eng, 760, voxel=.009, uv=('front',), sharp=38)
slats = S.union(*[S.box((0, 2.04 + i * .12, -1.13), (.45, .014, .035), .008, rot(.5, 0, 0)) for i in range(4)])
fig.add('slats', 'body', 'pS', slats, 200, voxel=.007, uv=('front',))
stack = S.union(S.cyl((.42, 2.5, -.88), (.42, 3.4, -.88), .11, .01), S.torus((.42, 3.4, -.88), .112, .03), S.torus((.42, 2.74, -.88), .115, .024), k=.008)
stack = S.cut(stack, S.cyl((.42, 3.3, -.88), (.42, 3.5, -.88), .08))
stack = dents(stack, 7.3, .005, 6)
fig.add('stacks', 'body', 'tank', S.mirror(stack), 620, voxel=.007, uv=('cyl', V(.42, 3.0, -.88)), sharp=45)
flap = S.mirror(S.cyl((.42, 3.47, -.9), (.44, 3.5, -.84), .1, .008))                                              # rain flaps, tipped open
fig.add('rainflaps', 'body', 'nD', flap, 100, voxel=.006, uv=('top',))
sidebox = S.box((.83, 2.56, -.5), (.09, .21, .25), .04)
sidebox = S.groove(sidebox, [V(.925, 2.6, -.72), V(.925, 2.6, -.28)], .007, .008)
sidebox = S.union(sidebox, S.box((.925, 2.52, -.5), (.012, .03, .04), .008))
fig.add('lockers', 'body', 'pO', S.mirror(dents(sidebox, 3.9, .012, 5)), 420, voxel=.007, uv=('side',), sharp=38)
hoses = S.mirror(S.chain([V(.5, 2.5, -.96), V(.8, 2.42, -.75), V(.86, 2.3, -.3), V(.8, 2.2, .0)], .04))
hoses = S.bump(hoses, lambda p: .006 * np.sin((p[..., 2] + p[..., 0]) * 110))
fig.add('hullhoses', 'body', 'rib', hoses, 320, voxel=.007, uv=('side',))
roof = S.box((0, 2.8, -.1), (.47, .06, .47), .04)
roof = S.union(roof, S.cyl((.2, 2.84, -.22), (.2, 2.93, -.22), .26, .02), k=.01)
roof = S.union(roof, S.chain([V(.02, 2.94, -.3), V(.02, 2.99, -.22), V(.02, 2.94, -.14)], .02))                   # hatch handle
fig.add('roof', 'body', 'pD', dents(roof, 5.1, .01, 5), 460, voxel=.008, uv=('top',), sharp=38)
bar = S.union(S.chain([V(-.46, 2.86, .36), V(-.46, 2.92, .36), V(.46, 2.92, .36), V(.46, 2.86, .36)], .035), *[S.cyl((x, 2.92, .34), (x, 2.92, .45), .08, .015) for x in (-.3, 0, .3)])
fig.add('lightbar', 'body', 'gunB', bar, 360, voxel=.006, uv=('front',), sharp=45)
fig.add('barglass', 'body', 'visG', S.union(*[S.both(S.sphere((x, 2.92, .41), .08), S.cyl((x, 2.92, .43), (x, 2.92, .48), .062)) for x in (-.3, 0, .3)]), 120, voxel=.006, uv=('front',))
# what a crew leaves on a machine: a rolled tarp lashed to the engine deck, a jerry can, a chain looped off a tow eye
tarp = S.rcone((-.5, 2.74, -.9), (.3, 2.76, -.94), .1)
tarp = S.bump(tarp, lambda p: .012 * np.sin(np.arctan2(p[..., 1] - 2.75, p[..., 2] + .92) * 4 + p[..., 0] * 9) + (S.noise(p, 12, 4.4) - .5) * .02)
fig.add('tarp', 'body', 'fabT', tarp, 380, voxel=.008, uv=('side',))
lash = S.union(*[S.torus((x, 2.75, -.92), .105, .016, AX, squash=1.6) for x in (-.3, .1)])
fig.add('lashings', 'body', 'leaB', lash, 120, voxel=.007)
jerry = S.box((-.83, 2.1, -.62), (.07, .16, .12), .03, rot(0, 0, -.06))
jerry = S.union(jerry, S.cyl((-.83, 2.27, -.56), (-.83, 2.31, -.56), .03, .008), S.chain([V(-.83, 2.27, -.7), V(-.83, 2.31, -.65), V(-.83, 2.27, -.6)], .014), k=.008)
jerry = S.groove(jerry, [V(-.905, 2.2, -.7), V(-.905, 2.0, -.54)], .008, .01)
jerry = S.groove(jerry, [V(-.905, 2.0, -.7), V(-.905, 2.2, -.54)], .008, .01)
fig.add('jerrycan', 'body', 'tank', jerry, 240, voxel=.006, uv=('side',), sharp=40)
ch = [V(.35, 1.84, .78) + V(.0 + .02 * np.sin(i * 1.7), -.045 * i, .01 * (i % 2)) for i in range(7)]
links = S.union(*[S.torus(q, .026, .009, rot(PI / 2, (i % 2) * PI / 2, 0), squash=1.0) for i, q in enumerate(ch)])
fig.add('chain', 'body', 'nD', links, 260, voxel=.004)

# ---------------------------------------------------------------- the spotter's head on the roof
HP = V(0, 2.86, 0)
post = S.cyl(HP + V(-.2, -.04, -.1), HP + V(-.2, .14, -.1), .12, .02)
fig.add('headpost', 'head', 'bD', post, 140, voxel=.006, uv=('side',), sharp=45)
hb = S.box(HP + V(-.2, .25, -.06), (.17, .1, .15), .035)
hb = S.union(hb, S.cyl(HP + V(-.2, .25, .05), HP + V(-.2, .25, .13), .095, .015), S.box(HP + V(-.2, .36, -.06), (.19, .016, .17), .012, rot(.08, 0, 0)), k=.01)
fig.add('headbox', 'head', 'pS', dents(hb, 2.2, .008, 8), 320, voxel=.005, uv=('front',), sharp=40)
fig.add('headlens', 'head', 'lens', S.both(S.sphere(HP + V(-.2, .25, .08), .09), S.cyl(HP + V(-.2, .25, .1), HP + V(-.2, .25, .15), .075)), 70, voxel=.005, uv=('front',))
ant = S.chain([HP + V(-.32, .3, -.16), HP + V(-.36, .7, -.2), HP + V(-.38, 1.0, -.26)], [.018, .013, .009])
fig.add('antenna', 'head', 'rubber', ant, 70, voxel=.004)
fig.add('antennatip', 'head', 'red', S.sphere(HP + V(-.38, 1.03, -.262), .042), 40, voxel=.006)

# ---------------------------------------------------------------- the guns, one hung off each side
AC = V(0, 2.25, .1)
gx = 1.14
shoulder = xcan(AC + V(.86, 0, 0), .2, .17, .025)
fig.add('gunmounts', 'arms', 'bS', S.mirror(shoulder), 420, voxel=.007, uv=('side',), sharp=40)
house = S.box(AC + V(gx, 0, .1), (.21, .24, .55), .06)
house = S.cut(house, S.box(AC + V(gx + .21, .03, .2), (.03, .09, .2), .02))                                       # feed port
for i in range(5):
    house = S.cut(house, S.box(AC + V(gx, .24, -.28 + i * .07), (.14, .03, .018), .008))                           # vents along the top
house = dents(house, 6.1, .014, 4)
fig.add('gunhousing', 'arms', 'gunm', S.mirror(house), 1300, voxel=.008, uv=('side',), sharp=38)
cover = S.box(AC + V(gx, .265, .26), (.17, .04, .25), .03, rot(-.04, 0, 0))
fig.add('guncovers', 'arms', 'pO', S.mirror(dents(cover, 4.7, .01, 6)), 300, voxel=.007, uv=('top',), sharp=38)
barrel = S.cyl(AC + V(gx, .02, .6), AC + V(gx, .02, 1.6), .1, .01)
fig.add('barrels', 'arms', 'gunB', S.mirror(barrel), 240, voxel=.006, uv=('side',), sharp=50)
jacket = S.cyl(AC + V(gx, .02, .6), AC + V(gx, .02, 1.0), .16, .02)
for i in range(6):
    a = i * PI / 3
    for z in (.72, .88):
        jacket = S.cut(jacket, S.sphere(AC + V(gx + np.sin(a) * .16, .02 + np.cos(a) * .16, z), .04))
fig.add('jackets', 'arms', 'bD', S.mirror(jacket), 620, voxel=.006, uv=('side',), sharp=42)
brake = S.cyl(AC + V(gx, .02, 1.38), AC + V(gx, .02, 1.56), .15, .02)
for z in (1.43, 1.5):
    brake = S.cut(brake, S.box(AC + V(gx, .02, z), (.2, .04, .022), .01))
fig.add('brakes', 'arms', 'bS', S.mirror(brake), 420, voxel=.006, uv=('side',), sharp=42)
drum = xcan(AC + V(gx, -.3, -.12), .2, .15, .025)
drum = S.union(drum, S.box(AC + V(gx, -.14, -.02), (.08, .1, .1), .02), k=.02)
fig.add('ammodrums', 'arms', 'hazB', S.mirror(drum), 460, voxel=.007, uv=('side',), sharp=40)
side = S.box(AC + V(gx + .225, 0, .1), (.02, .13, .3), .015)
fig.add('gunplates', 'arms', 'haz', S.mirror(side), 120, voxel=.007, uv=('side',))
belt = S.chain([AC + V(gx + .2, .03, .2), AC + V(gx + .3, -.08, .12), AC + V(gx + .26, -.24, .0), AC + V(gx + .14, -.3, -.08)], .04)
belt = S.bump(belt, lambda p: .012 * np.sin((p[..., 1] * 1.2 + p[..., 2]) * 90))
fig.add('feedbelts', 'arms', 'nY', S.mirror(S.squash(belt, (.6, 1, 1), AC + V(gx + .25, -.1, .1))), 300, voxel=.006, uv=('side',))
fig.point('muzzle', AC + V(gx, .02, 1.62), 'arms')

# ---------------------------------------------------------------- the jib: it was a crane before it was a walker, and nobody took the crane off
# A box boom off the right of the roof, raised by its own ram, a sheave at the tip and the hook block still hanging from it.
JX = .64
J0, J1 = V(JX, 2.9, -.62), V(JX, 4.12, 1.02)
JB = S.basis(J1 - J0, (0, 1, 0))                                 # local z up the boom
JL = float(np.linalg.norm(J1 - J0))
jd = (J1 - J0) / JL
boom = S.box((J0 + J1) / 2, (.055, .1, JL / 2), .02, JB)
boom = S.cut(boom, S.plane(J1 - jd * .5, JB @ V(0, -1, -.16)))                                                    # tapering to the tip
for i in range(6):                                                                                                # lightening holes down its length
    c = J0 + jd * (.3 + i * .28)
    boom = S.cut(boom, S.cyl(c - V(.2, 0, 0), c + V(.2, 0, 0), .06 - i * .005, .008))
boom = dents(boom, 12.3, .01, 5)
fig.add('jib', 'body', 'bY', boom, 900, voxel=.007, uv=('side',), sharp=38)
fig.add('jibband', 'body', 'haz', S.box(J0 + jd * (JL - .42), (.062, .1, .16), .02, JB), 160, voxel=.007, uv=('side',), sharp=38)
foot = S.union(S.box((JX, 2.84, -.6), (.12, .1, .2), .03), xcan(J0, .1, .1, .02), k=.01)
fig.add('jibfoot', 'body', 'bD', foot, 300, voxel=.007, uv=('side',), sharp=40)
r0, r1 = V(JX, 2.84, -.05), J0 + jd * JL * .5 + JB @ V(0, -.1, 0)
fig.add('jibram', 'body', 'nS', S.cyl(r0, r1, .03, .006), 100, voxel=.006, uv=('side',), sharp=50)
fig.add('jibsleeve', 'body', 'bD', S.union(S.cyl(r0, r0 + (r1 - r0) * .56, .055, .012), S.sphere(r0, .075), S.sphere(r1, .06), k=.01), 240, voxel=.006, uv=('side',), sharp=45)
fig.add('sheave', 'body', 'nS', S.union(xcan(J1 - jd * .06, .13, .035, .012), xcan(J1 - jd * .06, .05, .09, .01)), 260, voxel=.006, uv=('side',), sharp=45)
HK = J1 + V(0, -.86, .1)
cable = S.union(S.cyl(J1 + V(0, -.1, .1), HK + V(0, .16, 0), .012), S.cyl(J0 + jd * .3 + JB @ V(0, .12, 0), J1 - jd * .1 + JB @ V(0, .12, 0), .01))
fig.add('jibcable', 'body', 'rubber', cable, 90, voxel=.004, cull=False)
block = S.union(S.box(HK + V(0, .06, 0), (.045, .1, .09), .03), xcan(HK + V(0, .08, 0), .075, .03, .01), k=.01)
fig.add('hookblock', 'body', 'haz', dents(block, 2.9, .006, 9), 240, voxel=.005, uv=('side',), sharp=40)
hookf = S.cut(S.torus(HK + V(0, -.16, 0), .075, .026, rot(0, 0, PI / 2)), S.box(HK + V(0, -.1, .09), (.1, .05, .05)))
fig.add('hook', 'body', 'nD', S.union(hookf, S.cyl(HK + V(0, -.09, -.0), HK + V(0, -.02, 0), .024), k=.01), 220, voxel=.004, uv=('side',))

if __name__ == '__main__':
    args = sys.argv[1:]
    png = args[0] if args and args[0].endswith('.png') else None
    only = [a for a in args if not a.endswith('.png')]
    if only:
        fig.parts = [p for p in fig.parts if any(p.name.startswith(o) or p.group == o for o in only)]
    here = __file__.rsplit('/', 1)[0]
    fig.build(here + '/../assets/mesh/gantry.bin' if not only else '/tmp/gantry-part.bin', here + '/out/gantry.blend' if not only else None)
    if png:
        from kit import look
        import os
        c = [float(x) for x in os.environ.get('LOOK', '0,0,2.0,4.4').split(',')]
        look.render(png, centre=(c[0], -c[1], c[2]), height=c[3], px=int(os.environ.get('PX', 640)))
