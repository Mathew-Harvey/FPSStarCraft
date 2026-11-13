"""Ironhold's second wave of sheds: the pump on a Flux vent, the two bolt-on bays, the Dugout, the Flak Tower, the Hangar,
head office's own Annex, the two things a Headframe can be turned into, the skids a building crawls on and the lid over a
sunk Depot.

As in yard.py these are hulls: the game bolts on doors, lit windows, signs and lamps, and turns the moving parts, which
come out as their own groups (beam, crank, pitman and rod on the Pump Jack, fan on the Lab Bay, gun, barrels and dish on
the Flak Tower, doorL and doorR on the Hangar, dish on the Annex, scan on the Survey Rig, gun on the Bastion Head).
The Survey Rig and Bastion Head are only what is added to a Headframe: the game draws the Headframe and puts them on top.
Skids are made for a block 8 by 6; the game stretches them under each building that crawls.
Run:  python yard2.py <pumpjack|twinbay|labbay|dugout|flaktower|hangar|annex|surveyrig|bastion|skids|depotsunk> [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, veyl as Vk, yard as Y, site
from kit.sdf import V, rot, F
from yard import boxes, slab, gable, falsefront

PI = np.pi


def arc(c, r0, r1, a0, a1, t):
    """A thick curved plate in the xy plane round c, from radius r0 to r1 and angle a0 to a1, t either side of c in z."""
    c = V(c)

    def f(p):
        q = p - c
        rr = np.sqrt(q[..., 0] ** 2 + q[..., 1] ** 2)
        a = np.arctan2(q[..., 1], q[..., 0])
        d = np.maximum(np.abs(rr - (r0 + r1) / 2) - (r1 - r0) / 2, np.abs(q[..., 2]) - t)
        return np.maximum(d, np.maximum(a0 - a, a - a1) * rr).astype(F)
    return f


def rivets(pts, r=.045):
    return S.union(*[S.sphere(p, r) for p in pts])


def shift(fig, tag, d):
    """Slide the parts whose names start with tag by d (the yard kit builds some things round the middle only)."""
    for p in fig.parts:
        if p.name.startswith(tag):
            p.fn, p.true = (lambda f: lambda q: f(q - d))(p.fn), (lambda f: lambda q: f(q - d))(p.true)
            if p.lo is not None:
                p.lo, p.hi = V(p.lo) + d, V(p.hi) + d


def sandbags(fig, tag, ring, y0, rows, seed, mat='fabT', size=(.36, .13, .2), gaps=(), tris=900, group='body'):
    """Sandbags laid in courses along a closed or open path of points, each course set half a bag along, each bag a
    little off true. gaps are (from, to) distances along the path left open (firing slots, a way in)."""
    ring = [V(p) for p in ring]
    segs = list(zip(ring[:-1], ring[1:]))
    rng = np.random.default_rng(int(seed * 100))
    bags = []
    for k in range(rows):
        s0 = 0.0
        for a, b in segs:
            L = float(np.linalg.norm(b - a))
            n = max(1, int(L / (size[0] * 2 - .04)))
            ax = (b - a) / L
            ry = float(np.arctan2(ax[0], ax[2])) - PI / 2
            for i in range(n):
                u = (i + .5 + (k % 2) * .5) / n
                if u > 1:
                    continue
                dist = s0 + u * L
                if any(g0 <= dist <= g1 for g0, g1 in gaps) and k >= 1:
                    continue
                p = a + ax * u * L + V(rng.uniform(-.03, .03), y0 + size[1] * 1.7 * k + size[1], rng.uniform(-.03, .03))
                bags.append(S.ellipsoid(p, (size[0], size[1], size[2]), rot(rng.uniform(-.06, .06), ry + rng.uniform(-.12, .12), rng.uniform(-.05, .05))))
            s0 += L
    f = S.union(*bags, k=.03)
    fig.add(tag, group, mat, Y.knocked(f, seed, .02, 2.5), tris, voxel=.03, uv=('box',))


# ---------------------------------------------------------------- Pump Jack (stands on a Flux vent)
def pumpjack():
    fig = site.building('pumpjack', 2.9, 2.0, 5.6, ink=0)
    fig.group('body')
    PV = V(0, 3.72, 0)                                           # the saddle the walking beam rocks on
    fig.group('beam', PV)
    fig.group('crank', (-1.75, 1.3, 0))
    fig.group('pitman', (-2.3, 3.72, 0))
    fig.group('rod', (2.42, 2.4, 0))
    Y.pads(fig, 5.6, 3.6, 2, 1, 81.0, .22)
    # the samson post: an A-frame each side, braced, with the saddle bearing on top
    legs = []
    for z in (-.95, .95):
        legs += [Y.beam((-.75, .22, z), (0, 3.5, z * .25), .2), Y.beam((.75, .22, z), (0, 3.5, z * .25), .2), Y.beam((-.5, 1.3, z * .9), (.5, 1.3, z * .9), .12)]
    legs += [Y.beam((-.22, 2.4, -.65), (.22, 2.4, .65), .1), Y.beam((.22, 2.4, -.65), (-.22, 2.4, .65), .1)]
    fig.add('samson', 'body', 'bY', Y.knocked(S.union(*legs), 82.0, .02, 1.6), 380, voxel=.028, uv=('box',), sharp=35)
    fig.add('saddle', 'body', 'gunm', S.union(S.box(PV + V(0, -.12, 0), (.3, .14, .38), .03), S.cyl(PV + V(0, 0, -.42), PV + V(0, 0, .42), .13, .02)), 90, voxel=.022, uv=('box',), sharp=35)
    fig.add('samfeet', 'body', 'conc', Y.knocked(boxes([((sx * .75, .3, sz * .95), (.26, .1, .26)) for sx in (-1, 1) for sz in (-1, 1)]), 83.0, .03, 2), 80, voxel=.03, uv=('box',))
    # gearbox, motor and belt guard at the back end
    gb = S.union(S.box((-1.75, .95, 0), (.5, .7, .42), .05), S.box((-1.75, .3, 0), (.7, .1, .6), .03), S.cyl((-1.75, 1.3, -.5), (-1.75, 1.3, .5), .2, .03))
    fig.add('gearbox', 'body', 'bD', Y.knocked(gb, 84.0, .02, 2), 200, voxel=.026, uv=('box',), sharp=35)
    fig.add('motor', 'body', 'bS', S.union(S.cyl((-2.55, .75, .05), (-2.55, .75, .95), .32, .04), S.box((-2.55, .42, .5), (.3, .08, .4), .02), *[S.box((-2.55 + .33 * np.cos(a), .75 + .33 * np.sin(a), .5), (.03, .03, .4), .01, rot(0, 0, a)) for a in np.linspace(0, PI, 6)]), 220, voxel=.022, uv=('box',), sharp=35)
    guard = S.union(S.box((-2.15, .95, .78), (.62, .5, .08), .04, rot(0, 0, .28)))
    fig.add('beltguard', 'body', 'pY', Y.knocked(guard, 85.0, .02, 2), 60, voxel=.024, uv=('box',), sharp=35)
    # crank: an arm each side of the gearbox and a counterweight on each, turning about z
    C = V(-1.75, 1.3, 0)
    crank = []
    for z in (-.6, .6):
        crank += [S.box(C + V(-.42, 0, z), (.52, .12, .06), .03), S.box(C + V(-.8, 0, z), (.32, .5, .1), .05), S.cyl(C + V(-.85, 0, z), C + V(-.85, 0, z * 1.35), .07)]
    fig.add('crankarms', 'crank', 'pD', Y.knocked(S.union(*crank), 86.0, .02, 2), 200, voxel=.022, uv=('box',), sharp=35)
    # walking beam with the horse head on the well end, and the equaliser on the tail
    beam = S.union(Y.beam(PV + V(-2.45, .05, 0), PV + V(1.95, .05, 0), .34, .26), S.box(PV + V(0, .12, 0), (.3, .12, .3), .02))
    for i in range(6):
        beam = S.cut(beam, S.cyl(PV + V(-1.9 + i * .65, .05, -.3), PV + V(-1.9 + i * .65, .05, .3), .07))
    fig.add('walkbeam', 'beam', 'bY', Y.knocked(beam, 87.0, .02, 1.5), 260, voxel=.024, uv=('box',), sharp=35)
    fig.add('horsehead', 'beam', 'pY', Y.knocked(S.union(arc(PV, 2.05, 2.5, -.6, .22, .2), S.box(PV + V(2.05, .05, 0), (.22, .3, .22), .03)), 88.0, .025, 1.6), 260, voxel=.024, uv=('box',), sharp=35)
    fig.add('equaliser', 'beam', 'gunm', S.union(S.box(PV + V(-2.38, -.12, 0), (.14, .12, .72), .03), *[S.cyl(PV + V(-2.38, -.12, z), PV + V(-2.38, -.12, z * 1.15), .07) for z in (-.62, .62)]), 90, voxel=.022, uv=('box',))
    # pitman arms: hang from the equaliser down to the crank pins; the game swings them to follow
    fig.add('pitmanarms', 'pitman', 'bD', S.union(*[Y.beam(V(-2.3, 3.6, z), V(-2.6, 1.3, z), .1) for z in (-.74, .74)]), 90, voxel=.022, uv=('box',))
    # bridle and polished rod: hang straight down off the horse head into the wellhead
    rod = S.union(S.cyl((2.42, 1.5, 0), (2.42, 3.1, 0), .045), S.box((2.42, 1.9, 0), (.06, .06, .22), .02), *[S.cyl((2.42, 1.95, z), (2.42, 3.3, z), .018) for z in (-.18, .18)])
    fig.add('rodparts', 'rod', 'nS', rod, 120, voxel=.016, uv=('box',), cull=False)
    # wellhead on the vent: flanged spool, valve wheel, the run to the flux tank and its sight glass
    wh = S.union(S.cyl((2.42, .2, 0), (2.42, 1.35, 0), .2), *[S.cyl((2.42, y - .05, 0), (2.42, y + .05, 0), .3, .02) for y in (.35, .85, 1.3)], S.cyl((2.42, .85, 0), (2.42, .85, -.5), .1), S.cyl((2.42, .85, -.48), (2.42, .85, -.58), .18))
    fig.add('wellhead', 'body', 'bS', Y.knocked(wh, 89.0, .02, 2), 280, voxel=.02, uv=('box',), planar=5)
    fig.add('valve', 'body', 'cO', S.union(S.torus((2.42, .85, -.65), .28, .035, rot(PI / 2, 0, 0)), S.cyl((2.42, .85, -.6), (2.42, .85, -.7), .05)), 80, voxel=.016, uv=('box',), cull=False)
    fig.add('fluxpipe', 'body', 'bD', Y.pipe([(2.62, .7, 0), (2.62, .7, -1.3), (1.9, .55, -1.45)], .1), 220, voxel=.022, uv=('box',), planar=5, cull=False)
    Y.tank(fig, 'tk', (1.1, .22, -1.35), .55, 1.5, ('bS', 'cY', 'nD'), 90.0, dome=.5, tris=.6, voxel=.026)
    fig.add('sightglass', 'body', 'teal', S.cyl((1.1, .6, -.78), (1.1, 1.5, -.78), .07), 60, voxel=.016, uv=('box',))
    fig.add('sightcage', 'body', 'nD', S.union(*[S.cyl((1.1 + .1 * np.cos(a), .55, -.78 + .1 * np.sin(a)), (1.1 + .1 * np.cos(a), 1.55, -.78 + .1 * np.sin(a)), .014) for a in np.linspace(0, 2 * PI, 5)[:-1]], S.box((1.1, .55, -.78), (.14, .03, .14)), S.box((1.1, 1.55, -.78), (.14, .03, .14))), 120, voxel=.014, uv=('box',), cull=False)
    fig.add('rail', 'body', 'cY', S.union(*[S.cyl((x, .22, 1.65), (x, 1.15, 1.65), .04) for x in (1.2, 2.0, 2.8)], S.cyl((1.2, 1.1, 1.65), (2.8, 1.1, 1.65), .035), S.cyl((2.8, 1.1, 1.65), (2.8, 1.1, -.9), .035), S.cyl((2.8, .22, -.9), (2.8, 1.15, -.9), .04)), 160, voxel=.018, uv=('box',), cull=False)
    return fig


# ---------------------------------------------------------------- the two bolt-on bays
def stub(fig, seed):
    """The covered way that joins a bay to the building it is bolted to, off its +x side (the game turns a bay so +x faces its host)."""
    def f(p):
        q = p - V(2.15, .2, 0)
        rad = np.sqrt(q[..., 1] ** 2 + q[..., 2] ** 2)
        return (np.maximum(np.maximum(np.abs(rad - 1.25) - .06, np.abs(q[..., 0]) - .45), -q[..., 1]) * .8).astype(F)
    fig.add('stub', 'body', 'wallD', Y.knocked(f, seed, .04, 1.2), 160, voxel=.03, uv=('cyl', (2.15, .2, 0), (1, 0, 0), 'swap'), sharp=40)
    fig.add('stubribs', 'body', 'nD', S.both(S.union(*[S.torus((x, .2, 0), 1.3, .06, rot(0, 0, PI / 2), squash=1.3) for x in (2.55, 1.75)]), S.above(.2)), 140, voxel=.022, uv=('box',))


def twinbay():
    fig = site.building('twinbay', 2.7, 2.5, 4.2, ink=0)
    fig.group('body')
    Y.pads(fig, 4.4, 4.8, 2, 2, 91.0, .2)
    Y.walls(fig, 'w', (0, .2, 0), 3.9, 2.9, 4.2, ('wallY', 'wallS', 'wallY', 'wallD'), 92.0,
            front=[(-1.75, -.2, 0, 2.3), (.2, 1.75, 0, 2.3)], left=[(-.6, .6, 1.4, 2.2)])
    Y.band(fig, 'haz', (0, 2.55, 0), 4.1, 4.4, .5, .14, 'haz', 93.0)
    slab(fig, 'roofbed', (0, 3.15, 0), (2.05, .14, 2.2), 'wallD', 94.0)
    Y.roof(fig, 'rf', (0, 3.29, 0), 4.3, 4.6, ('wallD', 'wallS', 'wallY'), 95.0, pitch=.12, over=.1)
    # a pillar between the doors and a hoist rail across the front over both
    fig.add('mullion', 'body', 'bD', Y.knocked(S.box((0, 1.35, 2.14), (.18, 1.18, .12), .03), 96.0, .02, 2), 50, voxel=.026, uv=('box',), sharp=35)
    rail = S.union(Y.beam((-2.1, 2.95, 2.75), (2.1, 2.95, 2.75), .2, .26), *[Y.beam((x, 2.95, 2.75), (x, 2.8, 2.12), .1) for x in (-1.9, 0, 1.9)])
    fig.add('hoistrail', 'body', 'bY', Y.knocked(rail, 97.0, .02, 1.5), 160, voxel=.022, uv=('box',), sharp=35)
    for i, x in enumerate((-.95, .95)):                          # a block and chain over each door
        fig.add('hoist%d' % i, 'body', 'haz', S.union(S.box((x, 2.72, 2.75), (.14, .1, .12), .03), S.cyl((x, 2.62, 2.75), (x, 2.0 + .25 * i, 2.75), .022), S.box((x, 1.93 + .25 * i, 2.75), (.07, .08, .06), .02)), 80, voxel=.016, uv=('box',), cull=False)
    stub(fig, 98.0)
    Y.stack(fig, 'v1', (-.9, 3.3, -1.2), .2, 1.1, ('wallR', 'nD'), (.03, 0), 99.0, n=2)
    Y.stack(fig, 'v2', (.9, 3.4, -1.2), .2, 1.1, ('wallR', 'nD'), (-.02, .02), 99.5, n=2)
    return fig


def labbay():
    fig = site.building('labbay', 2.7, 2.5, 5.4, ink=0)
    fig.group('body')
    fig.group('fan', (.95, 4.15, -.9))
    Y.pads(fig, 4.4, 4.8, 2, 2, 101.0, .2)
    Y.walls(fig, 'w', (0, .2, 0), 3.9, 2.9, 4.2, ('wallT', 'wallS', 'wallT', 'wallD'), 102.0,
            front=[(-1.6, -.4, 0, 2.2), (.2, 1.6, 1.15, 2.2)], left=[(-.9, .9, 1.3, 2.2)])
    Y.band(fig, 'fas', (0, 2.95, 0), 4.1, 4.4, .3, .14, 'wallD', 103.0)
    slab(fig, 'roofbed', (0, 3.15, 0), (2.05, .14, 2.2), 'wallD', 104.0)
    Y.roof(fig, 'rf', (.9, 3.29, 0), 2.2, 4.5, ('wallD', 'wallS', 'wallT'), 105.0, over=0)
    # a glazed lantern over the bench end: a glass roof on a frame, the clever bit everyone can see
    fr = S.union(*[Y.beam((x, 3.3, z), (x, 4.1, z), .08) for x in (-1.95, -.15) for z in (-2.0, 2.0)], *[Y.beam((x, 4.1, -2.05), (x, 4.6, 0), .07) for x in (-1.95, -1.05, -.15)], *[Y.beam((x, 4.1, 2.05), (x, 4.6, 0), .07) for x in (-1.95, -1.05, -.15)],
                 Y.beam((-2.0, 4.6, 0), (-.1, 4.6, 0), .1), Y.beam((-2.0, 4.1, 2.05), (-.1, 4.1, 2.05), .08), Y.beam((-2.0, 4.1, -2.05), (-.1, 4.1, -2.05), .08))
    fig.add('lanframe', 'body', 'nD', fr, 360, voxel=.02, uv=('box',), cull=False)
    for i, s in enumerate((-1, 1)):
        n = V(0, 2.05, s * .5)
        glass = S.both(S.box((-1.05, 4.35, s * 1.02), (.92, .3, 1.05), .0), S.plane(V(-1.05, 4.6, 0) + V(0, .02, 0), n))
        glass = S.cut(glass, S.plane(V(-1.05, 4.6, 0) + V(0, -.04, 0), n))
        fig.add('glass%d' % i, 'body', 'lens', glass, 80, voxel=.02, uv=('box',), planar=4)
    fig.add('lanwall', 'body', 'wallS', S.union(S.box((-1.05, 3.7, 2.0), (.92, .4, .05), .02), S.box((-1.05, 3.7, -2.0), (.92, .4, .05), .02), S.box((-1.95, 3.7, 0), (.05, .4, 2.0), .02)), 80, voxel=.026, uv=('box',), planar=4)
    # fume stack with a cowl, the extractor fan in its ring, and two chemical bottles in a cage by the door
    Y.stack(fig, 'fs', (1.3, 3.3, 1.2), .26, 2.0, ('bS', 'nD'), (.02, .01), 106.0, n=3)
    fig.add('cowl', 'body', 'nD', S.union(S.cyl((1.34, 5.3, 1.22), (1.34, 5.45, 1.22), .3, .02), S.rcone((1.34, 5.45, 1.22), (1.34, 5.62, 1.22), .32, .04)), 80, voxel=.02, uv=('box',))
    fig.add('fanring', 'body', 'bD', S.union(S.cut(S.cyl((.95, 3.35, -.9), (.95, 4.0, -.9), .55), S.cyl((.95, 3.3, -.9), (.95, 4.1, -.9), .47)), S.box((.95, 3.34, -.9), (.62, .05, .62), .02)), 140, voxel=.02, uv=('box',), planar=5, cull=False)
    fig.add('fanblades', 'fan', 'bS', S.union(S.cyl((.95, 3.85, -.9), (.95, 4.0, -.9), .1), *[S.box(V(.95, 3.92, -.9) + rot(0, a, 0) @ V(.25, 0, 0), (.21, .015, .08), .01, rot(0, a, .35)) for a in np.linspace(0, 2 * PI, 6)[:-1]]), 120, voxel=.014, uv=('box',), cull=False)
    for i, (x, z, m) in enumerate(((-2.25, 1.4, 'cO'), (-2.25, .75, 'teal'))):
        Y.tank(fig, 'bt%d' % i, (x, .2, z), .26, 1.1, ('bS', m, 'nD'), 107.0 + i, dome=.5, tris=.3, voxel=.02)
    stub(fig, 108.0)
    return fig


# ---------------------------------------------------------------- Dugout: four beds fire from inside
def dugout():
    fig = site.building('dugout', 2.9, 2.9, 2.4, ink=0)
    fig.group('body')
    # an earth bank round a pit, sandbags on top of it with four slots, a tin roof on posts over the lot
    def berm(p):
        r = np.sqrt(p[..., 0] ** 2 + p[..., 2] ** 2) + .1 * (S.noise(p, 1.4, 109.0) - .5)
        d = np.maximum(np.abs(r - 2.15) - .65 + p[..., 1] * .9, p[..., 1] - .5)
        return np.maximum(d, -p[..., 1] - .2).astype(F)
    fig.add('berm', 'body', 'conc', berm, 520, voxel=.04, uv=('box',))
    ring = [V(2.05 * np.cos(a), 0, 2.05 * np.sin(a)) for a in np.linspace(0, 2 * PI, 17)]
    L = 2 * PI * 2.05
    gaps = [(L * (k / 4 + 1 / 8) - .45, L * (k / 4 + 1 / 8) + .45) for k in range(4)]
    sandbags(fig, 'bags', ring, .42, 3, 110.0, gaps=gaps + [(L * .75 - .7, L * .75 + .7)], tris=1600)
    posts = S.union(*[Y.beam((1.55 * sx, .3, 1.55 * sz), (1.5 * sx, 1.75, 1.5 * sz), .14) for sx in (-1, 1) for sz in (-1, 1)])
    fig.add('posts', 'body', 'wood', Y.knocked(posts, 111.0, .015, 3), 120, voxel=.024, uv=('box',))
    fig.add('bearers', 'body', 'wood', S.union(*[Y.beam((-1.7, 1.78, z), (1.7, 1.82, z), .16) for z in (-1.5, 1.5)]), 80, voxel=.024, uv=('box',))
    for i, (sx, m) in enumerate(((-1, 'wallR'), (1, 'wallS'))):   # two sheets of roofing iron, one lapped on the other, sandbags to hold them down
        R = (rot(0, 0, sx * .06) @ Y.FLAT).astype(F)
        fig.add('roof%d' % i, 'body', m, Y.sheet((sx * .85, 1.95 + i * .03, 0), 1.9, 3.9, R, seed=112.0 + i, dent=.08, studs=0, peel=(1, 1, .05) if i else None), 90, voxel=.026, uv=('box',), sharp=35, planar=4)
    sandbags(fig, 'roofbags', [V(-1.2, 0, -1.4), V(-1.2, 0, 1.4)], 1.95, 1, 113.0, mat='fabG', tris=220)
    sandbags(fig, 'roofbags2', [V(1.3, 0, -.6), V(1.3, 0, .9)], 1.98, 1, 114.0, mat='fabT', tris=160)
    # the way in at the back: a ladder down into the pit between two posts
    fig.add('ladder', 'body', 'nD', S.union(*[S.cyl((x, -.3, -2.4), (x, .9, -2.05), .03) for x in (-.25, .25)], *[S.cyl((-.25, y, -2.4 + (y + .3) * .29), (.25, y, -2.4 + (y + .3) * .29), .022) for y in (-.1, .2, .5, .8)]), 120, voxel=.014, uv=('box',), cull=False)
    return fig


# ---------------------------------------------------------------- Flak Tower: hits fliers and spots the hidden
def flaktower():
    fig = site.building('flaktower', 2.2, 2.2, 8.4, ink=0)
    fig.group('body')
    G = V(0, 5.15, 0)
    fig.group('gun', G)
    fig.group('barrels', G + V(0, .45, .2), 'gun')
    fig.group('dish', (-1.2, 7.3, -1.2))
    base = S.both(S.box((0, .9, 0), (1.55, .9, 1.55), .08), S.plane(V(0, 1.8, 0) + V(1.55, 0, 0), (1, .25, 0)))
    base = S.union(base, S.box((0, .1, 0), (1.75, .12, 1.75), .04))
    base = S.cut(base, *[S.box(V(1.55 * np.cos(a), 1.3, 1.55 * np.sin(a)), (.12, .07, .3), .02, rot(0, -a, 0)) for a in np.linspace(0, 2 * PI, 5)[:-1]])
    fig.add('base', 'body', 'conc', Y.knocked(base, 121.0, .035, 1.4), 260, voxel=.032, uv=('box',), sharp=35)
    fig.add('basedoor', 'body', 'pD', S.box((0, .75, 1.56), (.42, .65, .06), .03), 40, voxel=.024, uv=('box',), sharp=35)
    Y.tower(fig, 'tw', 1.8, 1.15, 1.15, 4.7, .95, .95, (.5,), .2, mats=('bD', 'nD', 'nD'), voxel=.026, seed=122.0, tris=(380, 240, 260))
    deck = S.box((0, 4.78, 0), (1.35, .1, 1.35), .03)
    fig.add('deck', 'body', 'wallS', Y.knocked(deck, 123.0, .02, 1.3), 80, voxel=.028, uv=('box',), sharp=35)
    for i, (a, b) in enumerate((((-1.3, 1.3), (1.3, 1.3)), ((1.3, 1.3), (1.3, -1.3)), ((1.3, -1.3), (-1.3, -1.3)), ((-1.3, -1.3), (-1.3, 1.3)))):
        Y.strip(fig, 'rail%d_' % i, (a[0], 5.15, a[1]), (b[0], 5.15, b[1]), .55, .1, 'haz' if i % 2 == 0 else 'pY', 124.0 + i, seg=2.8, tris=50)
    # the mount: a ring, a turntable, a curved shield and two long barrels with their ammunition drums
    fig.add('ring', 'gun', 'gunm', S.union(S.cyl(G + V(0, -.25, 0), G + V(0, .05, 0), .7, .03), S.cyl(G + V(0, .05, 0), G + V(0, .3, 0), .5, .03)), 160, voxel=.02, uv=('box',), sharp=35, planar=5)
    sh = lambda p: (lambda q: np.maximum(np.abs(np.sqrt(q[..., 0] ** 2 + q[..., 2] ** 2) - .95) - .04, np.maximum(np.abs(q[..., 1] - .55) - .5, -(q[..., 2] + .3 * np.abs(q[..., 0])) - .05)).astype(F))(p - G)
    fig.add('shield', 'gun', 'pY', Y.knocked(S.cut(sh, S.box(G + V(0, .9, 1.0), (.42, .2, .3))), 125.0, .025, 1.8), 220, voxel=.022, uv=('box',), sharp=35)
    fig.add('seat', 'gun', 'leaB', S.union(S.box(G + V(0, .55, -.45), (.22, .05, .2), .03), S.box(G + V(0, .78, -.65), (.22, .22, .04), .03)), 50, voxel=.016, uv=('box',))
    B0 = G + V(0, .45, .2)
    brl = []
    for sx in (-1, 1):
        brl += [S.box(B0 + V(sx * .3, 0, 0), (.13, .16, .45), .03), S.cyl(B0 + V(sx * .3, .02, .3), B0 + V(sx * .3, .02, 2.1), .055), S.cyl(B0 + V(sx * .3, .02, 1.75), B0 + V(sx * .3, .02, 2.1), .085, .01),
                S.cyl(B0 + V(sx * .3, .02, .4), B0 + V(sx * .3, .02, .9), .09, .01)]
    fig.add('barrelset', 'barrels', 'gunB', S.union(*brl), 260, voxel=.016, uv=('box',), planar=5, cull=False)
    fig.add('drums', 'barrels', 'cY', S.union(*[S.cyl(B0 + V(sx * .58, -.05, -.2), B0 + V(sx * .58, -.05, .2), .2, .03) for sx in (-1, 1)]), 120, voxel=.016, uv=('box',))
    fig.add('sight', 'barrels', 'nD', S.union(S.torus(B0 + V(0, .3, .5), .14, .012, rot(PI / 2, 0, 0)), S.cyl(B0 + V(0, .1, .5), B0 + V(0, .16, .5), .01)), 40, voxel=.01, uv=('box',), cull=False)
    for sx in (-1, 1):
        fig.point('muzzle' + ('L' if sx < 0 else 'R'), V(sx * .3, .02, 2.15), 'barrels')
    # the spotter: a mast on the back corner with a dish that turns all the time
    fig.add('dishmast', 'body', 'bS', S.union(S.cyl((-1.2, 4.85, -1.2), (-1.2, 7.25, -1.2), .07), Y.beam((-1.2, 6.2, -1.2), (-.95, 4.88, -.95), .05)), 100, voxel=.016, uv=('box',), planar=5, cull=False)
    D = V(-1.2, 7.3, -1.2)
    dish = S.cut(S.sphere(D + V(0, 0, -.42), .62), S.sphere(D + V(0, 0, -.5), .62), S.plane(D + V(0, 0, .02), (0, 0, -1)))
    dish = S.union(dish, S.cyl(D + V(0, -.05, 0), D + V(0, .05, 0), .1), S.cyl(D + V(0, 0, .1), D + V(0, 0, .5), .02), S.sphere(D + V(0, 0, .52), .05))
    fig.add('dishbowl', 'dish', 'wallS', dish, 160, voxel=.014, uv=('box',), cull=False)
    return fig


# ---------------------------------------------------------------- Hangar
def hangar():
    fig = site.building('hangar', 6.2, 5.2, 7.6, ink=0)
    fig.group('body')
    fig.group('doorL', (-2.6, 0, 3.9))
    fig.group('doorR', (2.6, 0, 3.9))
    Y.pads(fig, 11.2, 10.0, 3, 3, 131.0, .22)
    O = V(0, .2, 0)
    RV = 4.4

    def vault(z0, z1, seed):
        def f(p):
            q = p - O
            rad = np.sqrt(q[..., 0] ** 2 / 1.12 + q[..., 1] ** 2)
            r = RV - .1 * np.clip((S.noise(p, .7, seed) - .64) * 6, 0, 1)
            return (np.maximum(np.maximum(np.abs(rad - r) - .06, np.abs(q[..., 2] - (z0 + z1) / 2) - (z1 - z0) / 2 - .05), -q[..., 1]) * .8).astype(F)
        return f
    zs = (-3.9, -2.0, 0, 2.0, 3.9)
    for i, (z0, z1) in enumerate(zip(zs[:-1], zs[1:])):
        fig.add('bay%d' % i, 'body', 'wallS' if i != 1 else 'wallG', vault(z0, z1, 132.0 + i), int(150 * (z1 - z0)), voxel=.04, uv=('cyl', (0, .2, (z0 + z1) / 2), (0, 0, 1), 'swap'), sharp=40, lo=(-5.2, .1, z0 - .2), hi=(5.2, 4.8, z1 + .2))
    ribs = S.union(*[(lambda z: (lambda p: (lambda q: np.maximum(np.abs(np.sqrt(q[..., 0] ** 2 / 1.12 + q[..., 1] ** 2) - RV - .05) - .1, np.abs(q[..., 2] - z) - .12).astype(F))(p - O)))(z) for z in zs])
    fig.add('ribs', 'body', 'bD', S.both(ribs, S.above(.2)), 640, voxel=.03, uv=('box',))
    # the back closed, the front a tall square frame with the door opening; the doors stand slid half open
    def endwall(z, holes):
        def f(p):
            q = p - O
            d = np.maximum(np.sqrt(q[..., 0] ** 2 / 1.12 + q[..., 1] ** 2) - RV, np.abs(q[..., 2] - z) - .08)
            d = np.maximum(d, -q[..., 1])
            for x0, x1, y1 in holes:
                d = np.maximum(d, -np.maximum(np.maximum(x0 - q[..., 0], q[..., 0] - x1), q[..., 1] - y1))
            return d.astype(F)
        return f
    fig.add('back', 'body', 'wallD', Y.knocked(endwall(-3.95, []), 133.0, .05, 1.0), 200, voxel=.035, uv=('plane', (0, 2.4, -3.95), (1, 0, 0), (0, 1, 0), 9.6, 4.6), sharp=35)
    fig.add('front', 'body', 'wallR', Y.knocked(endwall(3.95, [(-3.2, 3.2, 3.7)]), 134.0, .05, 1.0), 200, voxel=.035, uv=('plane', (0, 2.4, 3.95), (1, 0, 0), (0, 1, 0), 9.6, 4.6), sharp=35)
    frame = S.union(Y.beam((-3.35, .2, 4.1), (-3.35, 4.0, 4.1), .32), Y.beam((3.35, .2, 4.1), (3.35, 4.0, 4.1), .32), Y.beam((-3.6, 3.95, 4.1), (3.6, 3.95, 4.1), .36, .32))
    fig.add('doorframe', 'body', 'bY', Y.knocked(frame, 135.0, .02, 1.5), 180, voxel=.026, uv=('box',), sharp=35)
    Y.strip(fig, 'haz', (-3.2, 3.6, 4.2), (3.2, 3.6, 4.2), .3, .1, 'haz', 136.0, seg=2.2, tris=60)
    fig.add('doortrack', 'body', 'nD', Y.beam((-4.8, 4.1, 4.32), (4.8, 4.1, 4.32), .12, .14), 50, voxel=.022, uv=('box',))
    for sx, g in ((-1, 'doorL'), (1, 'doorR')):
        for j, (x, z) in enumerate(((sx * 3.55, 4.42), (sx * 3.85, 4.56))):     # two leaves, slid open and stacked behind the frame posts
            fig.add('door%s%d' % (g[-1], j), g, ('wallD', 'wallT')[j] if sx < 0 else ('wallT', 'wallS')[j], Y.knocked(S.union(Y.sheet((x, 2.0, z), 1.7, 3.7, Y.FRONT, seed=137.0 + sx + j, dent=.06, studs=.02), S.box((x, .14, z), (.88, .1, .08), .02), S.box((x, 3.9, z), (.88, .08, .08), .02)), 137.5 + sx + j, .02, 1.2), 100, voxel=.026, uv=('plane', (x, 2.0, z), (1, 0, 0), (0, 1, 0), 1.7, 3.7), sharp=35, planar=4)
    # a glassed control box on stilts by the door, a windsock, a landing lamp on the crown
    Y.walls(fig, 'cb', (4.45, 3.3, 2.2), 1.5, 1.2, 1.7, ('wallY', 'wallS'), 138.0, rows=False, wide=(.8, 1.4), front=[(-.6, .6, .35, .95)], right=[(-.65, .65, .35, .95)])
    slab(fig, 'cbroof', (4.45, 4.55, 2.2), (.9, .08, 1.0), 'wallD', 139.0, 40, amp=.03)
    fig.add('cbstilts', 'body', 'bD', S.union(*[Y.beam((4.45 + sx * .6, .2, 2.2 + sz * .7), (4.45 + sx * .6, 3.3, 2.2 + sz * .7), .12) for sx in (-1, 1) for sz in (-1, 1)], Y.beam((3.85, 1.6, 2.9), (5.05, 2.6, 2.9), .07)), 160, voxel=.022, uv=('box',))
    fig.add('cbstair', 'body', 'nS', S.union(*[S.box((5.35, .35 + i * .37, 1.0 + i * .28), (.32, .03, .12), .01) for i in range(8)], Y.beam((5.65, .3, .9), (5.65, 3.3, 3.2), .05)), 120, voxel=.014, uv=('box',), cull=False)
    fig.add('sockpole', 'body', 'nD', S.cyl((-5.0, .2, 3.0), (-5.0, 6.6, 3.0), .06), 40, voxel=.016, uv=('box',), planar=5, cull=False)
    sock = S.rcone((-5.0, 6.45, 3.0), (-5.0 + .25, 6.15, 3.0 - 1.1), .2, .1)
    fig.add('sock', 'body', 'haz', S.cut(sock, S.rcone((-5.0, 6.45, 3.0), (-5.0 + .25, 6.15, 3.0 - 1.15), .16, .07)), 80, voxel=.014, uv=('box',), cull=False)
    fig.add('crownlamp', 'body', 'gunm', S.union(S.box((0, 4.62, 0), (.3, .1, .3), .03), S.cyl((0, 4.7, 0), (0, 4.95, 0), .12)), 50, voxel=.016, uv=('box',))
    Y.stack(fig, 'st', (-4.5, 0, -3.0), .3, 5.4, ('wallR', 'nD'), (.02, 0), 140.0, n=3)
    return fig


# ---------------------------------------------------------------- Head Office Annex
def annex():
    fig = site.building('annex', 4.2, 3.8, 10.6, ink=0)
    fig.group('body')
    fig.group('dish', (2.1, 9.15, -1.3))
    Y.pads(fig, 8.0, 7.2, 3, 2, 151.0, .22)
    # two floors, the lower in better plate than anything else in the yard
    Y.walls(fig, 'g', (0, .22, -.2), 6.0, 3.0, 4.6, ('wallT', 'wallT', 'wallS'), 152.0, rows=False, wide=(1.4, 2.4),
            front=[(-.8, .8, 0, 2.5), (-2.65, -1.55, 1.1, 2.4), (1.55, 2.65, 1.1, 2.4)], left=[(-1.2, 1.2, 1.2, 2.3)], right=[(-1.2, 1.2, 1.2, 2.3)])
    Y.band(fig, 'cor', (0, 3.25, -.2), 6.3, 4.9, .25, .16, 'wallD', 153.0)
    Y.walls(fig, 'u', (0, 3.38, -.4), 5.4, 2.4, 4.0, ('wallY', 'wallT', 'wallY'), 154.0, rows=False, wide=(1.2, 2.2),
            front=[(-2.2, -1.3, .6, 1.8), (-.45, .45, .6, 1.8), (1.3, 2.2, .6, 1.8)], back=[(-.45, .45, .6, 1.8)])
    Y.band(fig, 'cor2', (0, 5.82, -.4), 5.7, 4.3, .25, .16, 'wallD', 155.0)
    slab(fig, 'roofbed', (0, 5.82, -.4), (2.75, .14, 2.05), 'wallD', 156.0)
    Y.roof(fig, 'rf', (0, 5.96, -.4), 5.7, 4.3, ('wallD', 'wallS'), 157.0, over=0)
    # the porch: four posts in good steel, steps, and a pediment with the clock where the company can see it
    fig.add('posts', 'body', 'bS', S.union(*[S.union(S.cyl((x, .3, 2.7), (x, 3.1, 2.7), .14), S.box((x, .38, 2.7), (.2, .08, .2), .02), S.box((x, 3.05, 2.7), (.2, .06, .2), .02)) for x in (-2.0, -.75, .75, 2.0)]), 240, voxel=.02, uv=('box',), planar=5)
    fig.add('steps', 'body', 'conc', Y.knocked(S.union(*[S.box((0, .25 + i * .12, 2.6 + (2 - i) * .3), (1.4, .06 + i * 0, .3 + (2 - i) * .0), .02) for i in range(3)]), 158.0, .02, 2), 80, voxel=.026, uv=('box',), sharp=35)
    fig.add('porchroof', 'body', 'wallD', Y.knocked(S.box((0, 3.2, 2.55), (2.4, .1, .55), .03), 159.0, .03, 1.5), 60, voxel=.026, uv=('box',), sharp=35)
    falsefront(fig, 'ff', (0, 5.95, 1.65), Y.FRONT, 5.6, 1.3, ('wallT', 'wallY', 'wallT'), 160.0, crown=(2.6, 1.2), depth=1.1)
    C = V(0, 7.95, 1.78)
    fig.add('clockrim', 'body', 'cY', S.union(S.torus(C, .62, .07, rot(PI / 2, 0, 0)), S.cyl(C + V(0, 0, -.06), C + V(0, 0, .01), .58)), 140, voxel=.016, uv=('box',))
    fig.add('clockface', 'body', 'nW', S.cyl(C + V(0, 0, -.02), C + V(0, 0, .04), .55), 60, voxel=.014, uv=('plane', C, (1, 0, 0), (0, 1, 0), 1.1, 1.1))
    # the strongroom: a riveted drum on the right with a round door, where the money sleeps
    Y.tank(fig, 'vault', (3.35, .22, -1.2), 1.0, 2.6, ('pD', 'pD', 'nD'), 161.0, dome=.3, tris=.8)
    fig.add('vaultdoor', 'body', 'gunm', S.union(S.cyl((4.2, 1.3, -1.2), (4.38, 1.3, -1.2), .6, .04), S.cyl((4.36, 1.3, -1.2), (4.46, 1.3, -1.2), .14), *[S.box((4.42, 1.3, -1.2), (.03, .28, .03), .01, rot(a, 0, 0)) for a in (0, PI / 3, 2 * PI / 3)]), 160, voxel=.016, uv=('box',), sharp=35)
    fig.add('vaultriv', 'body', 'nS', rivets([V(3.35 + 1.02 * np.cos(a), y, -1.2 + 1.02 * np.sin(a)) for y in (.5, 2.5) for a in np.linspace(0, 2 * PI, 19)[:-1]], .04), 260, voxel=.012, uv=('box',))
    # the line to head office: a lattice mast on the roof with a dish and a flag
    Y.tower(fig, 'mt', 5.96, .5, .5, 8.9, .2, .2, (.4, .75), .12, mats=('bS', 'nD', 'nD'), voxel=.02, seed=162.0, tris=(260, 160, 160))
    fig.add('mtcap', 'body', 'nD', S.box((0, 8.95, 0), (.3, .06, .3), .02), 20, voxel=.016, uv=('box',))
    Dd = V(2.1, 9.15, -1.3)
    fig.add('dishpole', 'body', 'bS', S.cyl((2.1, 5.96, -1.3), (2.1, 9.1, -1.3), .06), 40, voxel=.016, uv=('box',), planar=5, cull=False)
    dish = S.cut(S.sphere(Dd + V(0, .1, .55), .7), S.sphere(Dd + V(0, .1, .62), .7), S.plane(Dd + V(0, .1, -.05), (0, 0, 1)))
    fig.add('dishbowl', 'dish', 'wallS', S.union(dish, S.cyl(Dd + V(0, .1, -.1), Dd + V(0, .1, -.6), .02), S.box(Dd, (.12, .12, .12), .02)), 160, voxel=.014, uv=('box',), cull=False)
    fig.add('flagpole', 'body', 'nD', S.cyl((-2.4, 5.96, -2.0), (-2.4, 10.3, -2.0), .045), 40, voxel=.014, uv=('box',), planar=5, cull=False)
    fig.add('flag', 'body', 'fabR', lambda p: np.maximum(np.maximum(np.abs(p[..., 0] + 1.75) - .62, np.abs(p[..., 1] - 9.8 - .08 * np.sin((p[..., 0] + 2.4) * 4)) - .38), np.abs(p[..., 2] + 2.0 - .1 * np.sin((p[..., 0] + 2.4) * 3.2)) - .03).astype(F), 120, voxel=.014, uv=('plane', (-1.75, 9.8, -2.0), (1, 0, 0), (0, 1, 0), 1.3, .8))
    return fig


# ---------------------------------------------------------------- Headframe forms (only what is added to the Headframe)
def surveyrig():
    fig = site.building('surveyrig', 7.8, 5.6, 16.8, ink=0)
    fig.group('body')
    SC = V(-3.5, 10.4, 2.0)
    fig.group('scan', SC)
    RF = 4.86                                                    # the Headframe's roof
    # a scanning dish on a lattice mast at the front left corner of the roof
    Y.tower(fig, 'mt', RF, .7, .7, 9.9, .26, .26, (.25, .55, .8), .16, mats=('bY', 'nD', 'nD'), voxel=.022, seed=171.0, tris=(300, 180, 180))
    shift(fig, 'mt', V(SC[0], 0, SC[2]))
    fig.add('mtfeet', 'body', 'pD', boxes([((SC[0] + sx * .7, RF + .1, SC[2] + sz * .7), (.16, .08, .16)) for sx in (-1, 1) for sz in (-1, 1)]), 60, voxel=.02, uv=('box',))
    dish = S.cut(S.sphere(SC + V(0, .3, -2.0), 2.3), S.sphere(SC + V(0, .3, -2.16), 2.3), S.plane(SC + V(0, .3, .02), (0, 0, -1)))
    dish = S.cut(dish, S.plane(SC + V(0, .3, -.95), (0, 0, -1)))
    fig.add('dishbowl', 'scan', 'wallS', Y.knocked(dish, 172.0, .015, 2), 420, voxel=.018, uv=('box',), cull=False)
    feed = S.union(*[S.cyl(SC + V(1.55 * np.cos(a), .3 + 1.55 * np.sin(a), -.2), SC + V(0, .3, 1.3), .03) for a in (PI / 2, PI * 7 / 6, PI * 11 / 6)], S.cyl(SC + V(0, .3, 1.25), SC + V(0, .3, 1.55), .13, .02))
    fig.add('dishfeed', 'scan', 'nD', feed, 120, voxel=.014, uv=('box',), cull=False)
    fig.add('dishyoke', 'scan', 'bY', S.union(S.cyl(SC + V(0, -.5, -.4), SC + V(0, .05, -.4), .22), S.box(SC + V(0, .1, -.5), (.4, .26, .2), .03)), 80, voxel=.018, uv=('box',), sharp=35)
    # the drone pad on the front right of the roof: a raised deck with a painted ring, a charging post and a cradle
    P = V(3.2, RF, 1.9)
    fig.add('pad', 'body', 'wallS', Y.knocked(S.union(S.box(P + V(0, .35, 0), (1.45, .08, 1.35), .03), *[Y.beam(P + V(sx * 1.3, 0, sz * 1.2), P + V(sx * 1.3, .3, sz * 1.2), .12) for sx in (-1, 1) for sz in (-1, 1)]), 173.0, .02, 1.5), 140, voxel=.024, uv=('box',), sharp=35)
    fig.add('padring', 'body', 'haz', S.both(S.cyl(P + V(0, .42, 0), P + V(0, .46, 0), 1.1), lambda q: (-(np.sqrt((q[..., 0] - P[0]) ** 2 + (q[..., 2] - P[2]) ** 2) - .85)).astype(F)), 120, voxel=.014, uv=('box',))
    fig.add('charger', 'body', 'gunm', S.union(S.box(P + V(1.25, .9, -1.15), (.16, .5, .12), .03), S.cyl(P + V(1.25, 1.35, -1.15), P + V(.8, 1.1, -.7), .03)), 80, voxel=.016, uv=('box',), cull=False)
    # whip aerials on the headframe's tower cap
    fig.add('aerials', 'body', 'nD', S.union(*[S.cyl((x, 15.1, z), (x * 1.1, 16.6, z), .025) for x, z in ((-.7, .7), (.7, -.7))], S.box((0, 15.2, 0), (.25, .1, .25), .02)), 80, voxel=.014, uv=('box',), planar=5, cull=False)
    return fig


def bastion():
    fig = site.building('bastion', 8.4, 6.4, 10.4, ink=0)
    fig.group('body')
    GN = V(0, 7.0, 1.4)
    fig.group('gun', GN)
    # armour: thick plates stood against the walls, bolted at the top and propped at the foot, gaps left for the doors
    plates = []
    for i, x in enumerate((-4.4, -3.3, -1.0, .9, 2.0, 3.1, 4.3)):     # front, round the door (-.3..3.5 is the big door)
        if -.5 < x < 3.6:
            continue
        plates.append((V(x, 2.1, 3.75), Y.FRONT, 1.1, 3.9, i))
    for s, R in ((-1, Y.LEFT), (1, Y.RIGHT)):
        for i, z in enumerate((-2.6, -1.3, 0, 1.3, 2.6)):
            plates.append((V(s * 5.25, 2.1, z), R, 1.25, 3.9, 10 + i + (5 if s > 0 else 0)))
    for i, (c, R, w, h, k) in enumerate(plates):
        fig.add('plate%d' % i, 'body', 'pD' if k % 3 else 'haz', Y.knocked(S.box(c, (w / 2 - .03, h / 2, .1), .03, (R @ rot(-.06, 0, 0)).astype(F)), 180.0 + k, .03, 1.4), 40, voxel=.03, uv=('box',), sharp=35, planar=4)
    bolts = [c + R @ V(sx * (w / 2 - .18), h / 2 - .2, .12) for c, R, w, h, k in plates for sx in (-1, 1)]
    fig.add('bolts', 'body', 'nS', rivets(bolts, .06), 400, voxel=.014, uv=('box',))
    # sandbags along the roof edge and round the gun
    sandbags(fig, 'roofbags', [V(-5.1, 0, 3.5), V(5.1, 0, 3.5), V(5.1, 0, -3.4)], 4.86, 2, 181.0, tris=1200)
    sandbags(fig, 'roofbags2', [V(-5.1, 0, -3.4), V(-5.1, 0, 3.4)], 4.86, 2, 182.0, mat='fabG', tris=600)
    # the gun: raised on an armoured drum so it clears the roof board, a heavy plated box on a ring with two short fat barrels
    fig.add('pedestal', 'body', 'pD', Y.knocked(S.union(S.cyl((0, 4.86, 1.4), (0, 7.0, 1.4), 1.3, .05), S.cyl((0, 4.86, 1.4), (0, 5.1, 1.4), 1.55, .04)), 185.0, .03, 1.5), 220, voxel=.024, uv=('cyl', (0, 5.5, 1.4), (0, 1, 0)), sharp=40, planar=5)
    fig.add('pedriv', 'body', 'nS', rivets([V(1.32 * np.cos(a), y, 1.4 + 1.32 * np.sin(a)) for y in (5.4, 6.7) for a in np.linspace(0, 2 * PI, 17)[:-1]], .05), 220, voxel=.012, uv=('box',))
    fig.add('pedband', 'body', 'haz', S.cyl((0, 6.0, 1.4), (0, 6.35, 1.4), 1.34, .02), 120, voxel=.016, uv=('cyl', (0, 6.2, 1.4), (0, 1, 0)), planar=5)
    fig.add('gunring', 'gun', 'cY', S.cyl(GN, GN + V(0, .35, 0), 1.25, .04), 120, voxel=.02, uv=('box',), planar=5)
    box = S.both(S.box(GN + V(0, 1.0, 0), (1.15, .65, 1.3), .07), S.plane(GN + V(0, 1.65, .8), (0, .6, .4)))
    fig.add('gunbox', 'gun', 'pD', Y.knocked(box, 183.0, .03, 1.5), 240, voxel=.024, uv=('box',), sharp=35)
    fig.add('gunhaz', 'gun', 'haz', S.box(GN + V(0, .5, 1.31), (1.1, .14, .04), .01), 40, voxel=.016, uv=('box',))
    fig.add('gunbarrels', 'gun', 'gunB', S.union(*[S.union(S.cyl(GN + V(sx * .48, .95, 1.0), GN + V(sx * .48, .95, 3.5), .18), S.cyl(GN + V(sx * .48, .95, 3.05), GN + V(sx * .48, .95, 3.6), .26, .02), S.cyl(GN + V(sx * .48, .95, 1.2), GN + V(sx * .48, .95, 1.7), .25, .02)) for sx in (-1, 1)]), 240, voxel=.018, uv=('box',), planar=5, cull=False)
    fig.add('gunslit', 'gun', 'gunm', S.box(GN + V(0, 1.45, 1.05), (.5, .06, .12), .02), 30, voxel=.016, uv=('box',))
    for sx in (-1, 1):
        fig.point('muzzle' + ('L' if sx < 0 else 'R'), V(sx * .48, .95, 3.65), 'gun')
    # tank traps at the front corners: three girders welded across each other
    for i, (x, z) in enumerate(((-6.6, 4.9), (6.6, 4.9), (-7.2, 2.4), (7.2, 2.4))):
        R = rot(0, i * .7, 0)
        h = S.union(*[Y.beam(V(x, .7, z) + R @ rot(*a) @ V(0, -.85, 0), V(x, .7, z) + R @ rot(*a) @ V(0, .85, 0), .16) for a in ((.95, 0, 0), (0, 0, .95), (.6, .0, -.6))])
        fig.add('trap%d' % i, 'body', 'bD', Y.knocked(h, 186.0 + i, .02, 1.5), 90, voxel=.022, uv=('box',), sharp=35)
    # steel shutters bolted over the side windows of the office
    fig.add('shutters', 'body', 'pD', Y.knocked(S.union(S.box((-2.7, 2.6, 3.62), (1.15, .38, .06), .02), S.box((-2.7, 1.2, 3.62), (1.15, .38, .06), .02)), 184.0, .02, 2), 60, voxel=.022, uv=('box',), sharp=35)
    return fig


# ---------------------------------------------------------------- skids for a crawling building (made for 8 by 6)
def skids():
    fig = site.building('skids', 4.6, 3.4, 1.0, ink=0)
    fig.group('body')
    for i, z in enumerate((-2.55, 2.55)):
        def runner(p, z=z):
            q = p - V(0, 0, z)
            x, y = q[..., 0], q[..., 1]
            nose = np.clip((np.abs(x) - 3.6) / .7, 0, 1)
            yb = .02 + .35 * nose ** 2                               # the runner's foot curls up at each end
            d = np.maximum(np.maximum(np.abs(x) - 4.3, np.abs(q[..., 2]) - .22), np.maximum(yb - y, y - (yb + .32)))
            return (d * .8).astype(F)
        fig.add('runner%d' % i, 'body', 'bD', Y.knocked(runner, 191.0 + i, .025, 1.3), 160, voxel=.026, uv=('box',), sharp=35)
        fig.add('shoe%d' % i, 'body', 'nS', S.box((0, .03, z), (3.6, .03, .25), .01), 30, voxel=.02, uv=('box',))
        fig.add('eye%d' % i, 'body', 'cY', S.union(*[S.torus((sx * 4.45, .55, z), .14, .045, rot(0, 0, 0)) for sx in (-1, 1)]), 80, voxel=.012, uv=('box',), cull=False)
    bear = S.union(*[S.box((x, .45, 0), (.16, .1, 2.8), .02) for x in (-3.0, -1.5, 0, 1.5, 3.0)])
    fig.add('bearers', 'body', 'bY', Y.knocked(bear, 193.0, .02, 1.5), 140, voxel=.024, uv=('box',), sharp=35)
    fig.add('jacks', 'body', 'gunm', S.union(*[S.union(S.cyl((sx * 3.8, .1, sz * 2.0), (sx * 3.8, .62, sz * 2.0), .12), S.cyl((sx * 3.8, .08, sz * 2.0), (sx * 3.8, .14, sz * 2.0), .25)) for sx in (-1, 1) for sz in (-1, 1)]), 160, voxel=.016, uv=('box',), planar=5)
    fig.add('chains', 'body', 'nD', S.union(*[S.cyl((sx * 4.45, .55, z), (sx * 4.9, .12, z * .3), .03) for sx in (-1, 1) for z in (-2.55, 2.55)]), 80, voxel=.012, uv=('box',), cull=False)
    return fig


# ---------------------------------------------------------------- the lid over a sunk Depot, flush with the ground
def depotsunk():
    fig = site.building('depotsunk', 3.2, 3.0, .8, ink=0)
    fig.group('body')
    rim = S.cut(S.box((0, .1, 0), (3.0, .12, 2.8), .04), S.box((0, .1, 0), (2.7, .3, 2.5)))
    fig.add('rim', 'body', 'conc', Y.knocked(rim, 201.0, .03, 1.5), 140, voxel=.03, uv=('box',), sharp=35)
    Y.band(fig, 'haz', (0, .2, 0), 5.5, 5.1, .06, .12, 'haz', 202.0)
    for i in range(3):                                           # three tread plates, one a little proud of the rest
        z = -1.65 + i * 1.65
        fig.add('lid%d' % i, 'body', ('pD', 'pS', 'pD')[i], Y.knocked(S.box((0, .09 + .015 * (i == 1), z), (2.68, .05, .8), .02), 203.0 + i, .015, 1.8), 50, voxel=.022, uv=('box',), sharp=35, planar=4)
    grate = S.union(S.cut(S.box((1.5, .15, -1.65), (.7, .04, .55), .01), S.box((1.5, .15, -1.65), (.62, .1, .47))), *[S.box((1.5 + x, .15, -1.65), (.025, .035, .5)) for x in np.linspace(-.5, .5, 7)])
    fig.add('grate', 'body', 'nD', grate, 160, voxel=.012, uv=('box',), cull=False)
    fig.add('hatch', 'body', 'cY', S.union(S.cyl((-1.4, .12, 1.65), (-1.4, .2, 1.65), .55, .02), S.torus((-1.4, .22, 1.65), .32, .03, rot(0, 0, 0))), 120, voxel=.014, uv=('box',))
    fig.add('bollards', 'body', 'cY', S.union(*[S.cyl((sx * 2.85, .1, sz * 2.65), (sx * 2.85, .75, sz * 2.65), .1, .03) for sx in (-1, 1) for sz in (-1, 1)]), 120, voxel=.016, uv=('box',), planar=5)
    return fig


MAKERS = dict(pumpjack=pumpjack, twinbay=twinbay, labbay=labbay, dugout=dugout, flaktower=flaktower, hangar=hangar, annex=annex, surveyrig=surveyrig, bastion=bastion, skids=skids, depotsunk=depotsunk)
if __name__ == '__main__':
    site.main(MAKERS, __file__)
