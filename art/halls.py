"""The new Veyl buildings from the full-depth plan, in the same grown-shell way as art/stones.py.

Siphon Bell (a bell hung over a Flux vent from three bent horns, drinking it up), Mending Pool (a basin held in four cupped shell
hands, a crystal drop turning over it), Dusk Hall (a long hall of bone ribs with lanterns hung between them and a dusk-red window),
Kiln (a fat shell furnace with a lit mouth and three horn chimneys), Skyloft (a perch: a stem rising to a wide landing dish ringed
with petals, rings turning under it), Tuning Fork (a great two-tined fork, a note floating between the tines), Quiet House (a dark
hooded dome hung with veils, its door stitched shut, a broken dark ring over it), Song Archive (tiers of shelves with glass tablets
round them and leaves of song circling), High Beacon (a tall spire carrying a great upright lens in a gold ring).
Run:  python halls.py <kind> [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, veyl as Vk, site
from kit.sdf import V, rot
from stones import mound, shards, ring_of, floater, UP

PI = np.pi
TAU = 2 * PI


def horn_up(fig, name, base, top, r, mat='vL', plates=5, bend=.4, tris=420):
    """A bone horn from base to top, bowed outward on the way."""
    base, top = V(base), V(top)
    mid = (base + top) / 2 + V(base[0], 0, base[2]) * bend / max(.1, np.hypot(base[0], base[2]))
    pts = Vk.curve([base, mid, top], 12)
    fig.add(name, 'body', mat, Vk.horn(pts, Vk.radii([r, r * .8, r * .25], len(pts)), plates=plates, lip=.03), tris, voxel=.024, uv=('cyl', tuple(mid), (0, 1, 0)))


# ---------------------------------------------------------------- Siphon Bell
def siphonbell():
    fig = site.building('siphonbell', 2.6, 2.6, 6.4, look='stone')
    fig.group('body')
    vent = mound([(2.3, 0), (2.2, .2), (1.7, .42), (1.2, .5)], 2, .07, 4.4, ribs=6)
    vent = S.cut(vent, S.ellipsoid((0, .55, 0), (1.05, .35, 1.05)), k=.05)
    fig.add('vent', 'body', 'vD', vent, 700, voxel=.03, uv=('cyl',))
    fig.add('flux', 'body', 'teal', S.ellipsoid((0, .32, 0), (1.0, .12, 1.0)), 200, voxel=.025, uv=('top',), glow=.8)
    for i, (x, _, z) in enumerate(ring_of(3, 2.0, phase=.5)):
        horn_up(fig, 'leg%d' % i, (x, .2, z), (x * .12, 5.7, z * .12), .26, 'vL' if i % 2 else 'vI', bend=.9)
    fig.add('crown', 'body', 'vG', S.torus((0, 5.6, 0), .45, .09), 220, voxel=.02, uv=('wrap',))
    fig.group('bell', (0, 5.5, 0))
    shell = Vk.lathe([(1.15, 2.25), (1.1, 2.4), (.92, 2.75), (.72, 3.5), (.66, 4.3), (.5, 4.9), (.2, 5.15), (0, 5.2)])
    shell = S.cut(shell, Vk.lathe([(1.0, 2.1), (.82, 2.6), (.6, 3.6), (0, 4.4)]), k=.03)
    fig.add('bellshell', 'bell', 'vI', Vk.pits(shell, 6.6, .015, 6), 1400, voxel=.025, uv=('cyl',))
    fig.add('belllip', 'bell', 'vG', S.torus((0, 2.3, 0), 1.13, .07), 400, voxel=.02, uv=('wrap',))
    fig.add('bellbands', 'bell', 'vG', S.union(S.torus((0, 3.6, 0), .7, .045), S.torus((0, 4.6, 0), .58, .04)), 360, voxel=.02, uv=('wrap',))
    fig.add('clapper', 'bell', 'teal', Vk.crystal((0, 4.2, 0), (0, 1.7, 0), .22, 6, .3), 120, voxel=.02, sharp=25, glow=.7)
    fig.add('chain', 'bell', 'vG', S.chain([(0, 5.2, 0), (0, 5.55, 0)], [.06, .06]), 60, voxel=.02)
    shards(fig, 'crystals', 'body', [(x * 1.1, z * 1.1, .9, x * .3, z * .3) for x, _, z in ring_of(5, 2.0, phase=1.1)])
    return fig


# ---------------------------------------------------------------- Mending Pool
def mendingpool():
    fig = site.building('mendingpool', 2.8, 2.8, 4.6, look='stone')
    fig.group('body')
    basin = mound([(2.2, 0), (2.25, .3), (2.0, .7), (1.75, .9)], 2, .07, 5.1)
    basin = S.cut(basin, S.ellipsoid((0, 1.05, 0), (1.7, .55, 1.7)), k=.04)
    fig.add('basin', 'body', 'vD', basin, 800, voxel=.03, uv=('cyl',))
    fig.add('water', 'body', 'vM', S.ellipsoid((0, .62, 0), (1.62, .1, 1.62)), 300, voxel=.025, uv=('top',), glow=.5)
    fig.add('rim', 'body', 'vG', S.torus((0, .92, 0), 1.78, .08), 400, voxel=.02, uv=('wrap',))
    for i, (x, _, z) in enumerate(ring_of(4, 1.0, phase=PI / 4)):
        # a cupped hand of shell rising from the rim, fingers curling inward over the water
        R = S.basis(V(x, 0, z), V(-x * .3, 1, -z * .3))
        fig.add('hand%d' % i, 'body', 'vL', Vk.claw(V(x * 2.0, .9, z * 2.0), R, .55, 1.0, 1.1), 700, voxel=.022)
    fig.group('drop', (0, 2.8, 0))
    fig.add('dropstone', 'drop', 'vC', Vk.crystal((0, 2.2, 0), (0, 3.5, 0), .38, 6, .5), 200, voxel=.02, sharp=25, glow=.6)
    floater(fig, 'halo', (0, 2.8, 0), .9, .05, 'teal', 4, .35, tris=200, squash=1.0)
    return fig


# ---------------------------------------------------------------- Dusk Hall
def duskhall():
    fig = site.building('duskhall', 3.4, 4.2, 6.6, look='stone')
    fig.group('body')
    floor = mound([(3.3, 0), (3.2, .25), (2.7, .55), (2.2, .7)], 2, .07, 2.7, zs=1.25)
    fig.add('floor', 'body', 'vD', floor, 900, voxel=.034, uv=('cyl',))
    ribs = []
    for k, z in enumerate(np.linspace(-3.0, 3.0, 6)):
        h = 5.6 - abs(z) * .35
        for sx in (-1, 1):
            pts = Vk.curve([(sx * 2.5, .4, z), (sx * 2.7, h * .55, z * 1.02), (sx * 1.4, h * .95, z), (sx * .12, h, z)], 14)
            ribs.append(Vk.horn(pts, Vk.radii([.24, .2, .14, .08], len(pts)), plates=4, lip=.02))
    fig.add('ribs', 'body', 'vL', S.union(*ribs), 3200, voxel=.026, uv=('side',))
    spine = Vk.curve([(0, 5.0, -3.4), (0, 5.7, -1.5), (0, 5.8, 1.5), (0, 5.1, 3.4)], 14)
    fig.add('spine', 'body', 'vI', Vk.horn(spine, Vk.radii([.15, .3, .3, .15], len(spine)), plates=8, lip=.03), 800, voxel=.026, uv=('side',))
    # the dusk window: a tall pointed pane at the front, red-violet, in a gold frame
    win = S.both(S.ellipsoid((0, 2.6, 3.3), (1.2, 2.4, .12)), S.above(.6))
    fig.add('window', 'body', 'mag', win, 400, voxel=.02, uv=('front',), glow=.6)
    fig.add('windowframe', 'body', 'vG', S.cut(S.both(S.ellipsoid((0, 2.6, 3.32), (1.38, 2.6, .16)), S.above(.55)), S.ellipsoid((0, 2.6, 3.3), (1.18, 2.38, .4))), 500, voxel=.02, uv=('front',))
    # lanterns hung under the spine
    fig.add('lanterns', 'body', 'vC', S.union(*[Vk.crystal((0, 4.5, z), (0, 3.7, z), .2, 5, .5) for z in (-2.4, -1.2, 0, 1.2, 2.4)]), 400, voxel=.02, sharp=25, glow=.7)
    fig.add('lanterncords', 'body', 'vG', S.union(*[S.chain([(0, 5.6, z), (0, 4.5, z)], [.025, .025]) for z in (-2.4, -1.2, 0, 1.2, 2.4)]), 200, voxel=.02)
    return fig


# ---------------------------------------------------------------- Kiln
def kiln():
    fig = site.building('kiln', 3.8, 3.8, 7.4, look='stone')
    fig.group('body')
    fig.add('base', 'body', 'vD', mound([(3.5, 0), (3.4, .25), (3.0, .55), (2.6, .7)], 3, .08, 9.1, ribs=6), 900, voxel=.034, uv=('cyl',))
    dome = Vk.lathe([(2.6, .6), (2.9, 1.4), (2.85, 2.6), (2.3, 3.8), (1.4, 4.7), (.5, 5.1), (0, 5.15)], plates=(4, .07))
    dome = S.cut(dome, S.ellipsoid((0, 1.6, 2.6), (1.15, 1.25, 1.1)), k=.08)
    fig.add('dome', 'body', 'vI', Vk.pits(dome, 3.9, .018, 5), 2600, voxel=.032, uv=('cyl',), sharp=38)
    fig.add('mouth', 'body', 'vM', S.ellipsoid((0, 1.5, 2.15), (1.0, 1.05, .4)), 300, voxel=.022, uv=('front',), glow=.9)
    fig.add('mouthrim', 'body', 'vG', S.cut(S.torus((0, 1.55, 2.62), 1.12, .1, UP, squash=1.0), S.below(.55)), 400, voxel=.02, uv=('front',))
    fig.add('bands', 'body', 'vG', S.union(*[S.torus((0, y, 0), r, .07) for y, r in ((2.0, 2.92), (3.4, 2.5))]), 600, voxel=.022, uv=('wrap',))
    for i, (x, _, z) in enumerate(ring_of(3, 1.5, phase=PI / 2 + PI / 3)):
        horn_up(fig, 'chimney%d' % i, (x, 3.8, z), (x * 1.5, 7.0 - i * .4, z * 1.5 - .3), .42, 'vL', plates=6, bend=.3, tris=500)
    fig.add('smokecaps', 'body', 'vC', S.union(*[Vk.crystal(V(x * 1.5, 6.6 - i * .4, z * 1.5 - .3), V(x * 1.55, 7.3 - i * .4, z * 1.55 - .3), .14, 5, .4) for i, (x, _, z) in enumerate(ring_of(3, 1.5, phase=PI / 2 + PI / 3))]), 180, voxel=.02, sharp=25, glow=.5)
    shards(fig, 'crystals', 'body', [(x, z, 1.0, x * .15, z * .15) for x, _, z in ring_of(6, 3.2, phase=.3)])
    floater(fig, 'ring0', (0, 6.0, 0), 1.1, .09, 'mag', 4, .4)
    return fig


# ---------------------------------------------------------------- Skyloft
def skyloft():
    fig = site.building('skyloft', 3.8, 3.8, 9.6, look='stone')
    fig.group('body')
    fig.add('base', 'body', 'vD', mound([(2.6, 0), (2.5, .25), (2.0, .6), (1.3, .9)], 3, .08, 1.9, ribs=5), 800, voxel=.032, uv=('cyl',))
    sp = Vk.curve([(0, .6, 0), (.25, 2.5, .1), (-.15, 5, -.1), (0, 7.2, 0)], 14)
    rs = Vk.radii([.95, .65, .5, .7], len(sp))
    fig.add('stem', 'body', 'vI', Vk.pits(Vk.horn(sp, rs, plates=7, lip=.05, flutes=4, flute=.03, turn=.7), 5.5, .016, 5), 1600, voxel=.03, uv=('cyl',), sharp=38)
    dish = Vk.lathe([(.6, 7.0), (2.0, 7.5), (3.3, 7.9), (3.5, 8.05), (3.2, 8.1), (0, 7.85)])
    fig.add('dish', 'body', 'vL', Vk.pits(dish, 6.2, .014, 6), 1400, voxel=.028, uv=('top',))
    fig.add('dishrim', 'body', 'vG', S.torus((0, 8.05, 0), 3.42, .09), 600, voxel=.022, uv=('wrap',))
    pl = Vk.petals(8.0, 9.2, 3.3, 3.7, 10, .9, .04, belly=.5)
    fig.add('petals', 'body', 'vI', S.union(*pl), 1400, voxel=.024, uv=('cyl',))
    fig.add('perch', 'body', 'vC', S.union(*[Vk.crystal((x, 8.0, z), (x * 1.05, 8.9, z * 1.05), .12, 5, .3) for x, _, z in ring_of(5, 1.6)]), 300, voxel=.02, sharp=25, glow=.4)
    fig.add('bands', 'body', 'vG', S.union(*[Vk.band(sp, rs, t, .07, .04) for t in (.3, .6)]), 400, voxel=.022)
    floater(fig, 'ring0', (0, 4.0, 0), 1.6, .1, 'teal', 5, .45)
    floater(fig, 'ring1', (0, 6.0, 0), 1.25, .08, 'mag', 3, .4)
    return fig


# ---------------------------------------------------------------- Tuning Fork
def tuningfork():
    fig = site.building('tuningfork', 2.8, 2.8, 11.0, look='stone')
    fig.group('body')
    fig.add('base', 'body', 'vD', mound([(2.5, 0), (2.4, .25), (2.0, .55), (1.3, .85)], 3, .08, 6.6, ribs=4), 800, voxel=.03, uv=('cyl',))
    sp = Vk.curve([(0, .6, 0), (0, 2.5, 0), (0, 4.2, 0)], 8)
    stem = Vk.horn(sp, Vk.radii([.7, .5, .74], len(sp)), plates=4, lip=.05)
    fig.add('stem', 'body', 'vI', Vk.pits(stem, 2.1, .015, 6), 900, voxel=.028, uv=('cyl',))
    tines = []
    for sx in (-1, 1):
        pts = Vk.curve([(0, 4.0, 0), (sx * 1.0, 4.7, 0), (sx * 1.25, 6.5, 0), (sx * 1.2, 10.4, 0)], 16)
        tines.append(Vk.horn(pts, Vk.radii([.6, .42, .36, .3], len(pts)), plates=6, lip=.03, flutes=3, flute=.02))
    fig.add('tines', 'body', 'vL', S.union(*tines), 2000, voxel=.028, uv=('side',))
    fig.add('tinecaps', 'body', 'vC', S.union(*[Vk.crystal((sx * 1.2, 10.2, 0), (sx * 1.15, 11.0, 0), .28, 5, .3) for sx in (-1, 1)]), 200, voxel=.02, sharp=25, glow=.4)
    fig.add('bands', 'body', 'vG', S.union(*[S.torus((sx * 1.22, y, 0), .36, .05) for sx in (-1, 1) for y in (6.0, 8.0)], S.torus((0, 3.4, 0), .58, .06)), 600, voxel=.02, uv=('wrap',))
    fig.group('note', (0, 7.4, 0))
    fig.add('notestone', 'note', 'vM', Vk.crystal((0, 6.6, 0), (0, 8.2, 0), .42, 6, .5), 260, voxel=.02, sharp=25, glow=.7)
    floater(fig, 'halo', (0, 7.4, 0), .8, .05, 'teal', 0, tris=180, upright=True)
    shards(fig, 'crystals', 'body', [(x, z, 1.0, x * .2, z * .2) for x, _, z in ring_of(4, 2.1, phase=.6)])
    return fig


# ---------------------------------------------------------------- Quiet House
def quiethouse():
    fig = site.building('quiethouse', 3.0, 3.0, 6.2, look='stone')
    fig.group('body')
    fig.add('base', 'body', 'vD', mound([(2.8, 0), (2.7, .2), (2.3, .45)], 2, .06, 4.8), 600, voxel=.03, uv=('cyl',))
    hood = Vk.lathe([(2.3, .4), (2.4, 1.6), (2.1, 3.2), (1.5, 4.4), (.6, 5.2), (0, 5.4)], plates=(5, .08))
    hood = S.moved(hood, R=rot(-.12, 0, 0), c=(0, 0, 0))
    fig.add('hood', 'body', 'vD', Vk.pits(hood, 7.1, .018, 5), 2200, voxel=.032, uv=('cyl',), sharp=38)
    door = S.both(S.ellipsoid((0, 1.6, 2.3), (.7, 1.4, .15)), S.above(.4))
    fig.add('door', 'body', 'vL', door, 300, voxel=.02, uv=('front',))
    fig.add('stitches', 'body', 'vG', S.union(*[S.box((0, y, 2.42), (.38, .035, .04)) for y in np.linspace(.8, 2.6, 7)]), 300, voxel=.015, uv=('front',))
    veils = Vk.petals(4.6, .5, 1.3, 2.6, 9, .9, .03, skip=(0,), wave=.3, belly=.5)
    fig.add('veils', 'body', 'vDp', S.union(*veils), 1600, voxel=.024, uv=('cyl',))
    fig.add('eye', 'body', 'teal', S.ellipsoid((0, 4.1, 1.55), (.3, .06, .1)), 80, voxel=.015, glow=.6)
    fig.group('halo', (0, 6.0, 0))
    ring = S.cut(S.torus((0, 6.0, 0), 1.0, .07, squash=1.0), S.box((.8, 6.0, .6), (.4, .3, .4)))
    fig.add('haloring', 'halo', 'vD', ring, 300, voxel=.02, uv=('wrap',))
    return fig


# ---------------------------------------------------------------- Song Archive
def songarchive():
    fig = site.building('songarchive', 3.2, 3.2, 8.0, look='stone')
    fig.group('body')
    fig.add('base', 'body', 'vD', mound([(3.0, 0), (2.9, .25), (2.5, .5)], 2, .07, 3.3, ribs=6), 700, voxel=.03, uv=('cyl',))
    tiers = Vk.lathe([(2.4, .4), (2.5, 1.6), (2.0, 1.7), (2.1, 3.0), (1.6, 3.1), (1.7, 4.3), (1.15, 4.4), (1.2, 5.4), (.6, 5.6), (0, 5.7)], plates=(4, .06))
    fig.add('tiers', 'body', 'vI', Vk.pits(tiers, 8.8, .016, 5), 2200, voxel=.03, uv=('cyl',), sharp=38)
    tabs = []
    for k, (y, r, n) in enumerate(((1.0, 2.5, 10), (2.35, 2.1, 8), (3.7, 1.7, 7), (4.9, 1.2, 5))):
        for i in range(n):
            a = i * TAU / n + k * .3
            d = V(np.cos(a), 0, np.sin(a))
            tabs.append(S.box(d * (r + .02) + V(0, y, 0), (.16, .38, .03), .02, S.basis(d, V(0, 1, 0))))
    fig.add('tablets', 'body', 'vC', S.union(*tabs), 1400, voxel=.016, uv=('cyl',), glow=.45)
    fig.add('bands', 'body', 'vG', S.union(*[S.torus((0, y, 0), r, .05) for y, r in ((1.62, 2.02), (3.02, 1.62), (4.32, 1.17))]), 600, voxel=.02, uv=('wrap',))
    fig.add('crown', 'body', 'vC', Vk.crystal((0, 5.5, 0), (0, 7.2, 0), .32, 6, .3), 150, voxel=.02, sharp=25, glow=.4)
    fig.group('pages', (0, 6.4, 0))
    pages = []
    for i in range(6):
        a = i * TAU / 6
        d = V(np.cos(a), 0, np.sin(a))
        pages.append(S.box(d * 1.4 + V(0, 6.4 + (i % 2) * .3, 0), (.32, .22, .015), .02, S.basis(d + V(0, .4, 0), V(0, 1, 0))))
    fig.add('pageleaves', 'pages', 'vL', S.union(*pages), 400, voxel=.015, uv=('cyl',))
    floater(fig, 'halo', (0, 6.4, 0), 1.4, .04, 'mag', 0, tris=160, squash=1.0)
    return fig


# ---------------------------------------------------------------- High Beacon
def highbeacon():
    fig = site.building('highbeacon', 3.2, 3.2, 15.0, look='stone')
    fig.group('body')
    fig.add('base', 'body', 'vD', mound([(3.0, 0), (2.9, .3), (2.4, .7), (1.6, 1.0)], 3, .09, 2.2, ribs=6), 900, voxel=.034, uv=('cyl',))
    sp = Vk.curve([(0, .6, 0), (.2, 3.5, .05), (-.15, 7, -.05), (0, 10.6, 0)], 18)
    rs = Vk.radii([1.25, .95, .6, .4], len(sp))
    fig.add('spire', 'body', 'vI', Vk.pits(Vk.horn(sp, rs, plates=9, lip=.07, flutes=5, flute=.04, turn=.9), 4.4, .018, 5), 2400, voxel=.032, uv=('cyl',), sharp=38)
    fig.add('bands', 'body', 'vG', S.union(*[Vk.band(sp, rs, t, .08, .05) for t in (.2, .45, .7)]), 600, voxel=.024, uv=('cyl',))
    for i, (x, _, z) in enumerate(ring_of(3, 1.9, phase=.4)):
        horn_up(fig, 'buttress%d' % i, (x, .5, z), (x * .25, 6.0, z * .25), .4, 'vL', bend=.6, tris=500)
    # the lens: a great upright disc of crystal in a gold ring, held in a cradle of two horns at the top
    fig.group('lens', (0, 12.3, 0))
    fig.add('lensglass', 'lens', 'vC', S.ellipsoid((0, 12.3, 0), (1.5, 1.5, .18)), 500, voxel=.022, uv=('front',), glow=.7)
    fig.add('lensring', 'lens', 'vG', S.torus((0, 12.3, 0), 1.6, .13, UP, squash=1.0), 700, voxel=.022, uv=('front',))
    fig.add('lenscore', 'lens', 'vM', S.ellipsoid((0, 12.3, 0), (.35, .35, .26)), 160, voxel=.018, glow=.9)
    for sx in (-1, 1):
        horn_up(fig, 'cradle%s' % ('L' if sx < 0 else 'R'), (sx * .3, 10.3, 0), (sx * 1.75, 12.3, 0), .2, 'vL', plates=4, bend=.5, tris=300)
    fig.add('tip', 'body', 'vC', Vk.crystal((0, 13.8, 0), (0, 15.0, 0), .22, 5, .3), 100, voxel=.02, sharp=25)
    floater(fig, 'ring0', (0, 5.0, 0), 1.5, .1, 'mag', 5, .45)
    floater(fig, 'ring1', (0, 8.4, 0), 1.0, .08, 'teal', 4, .4)
    return fig


MAKERS = dict(siphonbell=siphonbell, mendingpool=mendingpool, duskhall=duskhall, kiln=kiln, skyloft=skyloft, tuningfork=tuningfork,
              quiethouse=quiethouse, songarchive=songarchive, highbeacon=highbeacon)
if __name__ == '__main__':
    site.main(MAKERS, __file__)
