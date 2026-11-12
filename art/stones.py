"""What the Veyl raise: grown shell, pale bone and cut crystal, none of it built and none of it straight.

Every one is a horn or a ring of horns standing out of a plated mound, bound in gold where it was mended, with crystal
where it sings. The parts that float or turn are groups of their own, and the game moves them.
Run:  python stones.py <choir|reedgate|broodpit|thornspire|wardpylon|hushwell> [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, veyl as Vk, site
from kit.sdf import V, rot

PI = np.pi
TAU = 2 * PI
UP = rot(PI / 2, 0, 0)                                           # stands a flat ring up to face along z


def mound(pts, plates=3, lip=.09, seed=1.0, zs=1.0, ribs=0, rib=.06):
    """The plated foot every Veyl building stands on."""
    f = Vk.lathe(pts, plates=(plates, lip), zs=zs)
    if ribs:
        f = S.bump(f, lambda p: rib * np.cos(ribs * np.arctan2(p[..., 0], p[..., 2])) * np.clip(1 - p[..., 1] / pts[-1][1], 0, 1))
    return Vk.pits(f, seed, .022, 4.5)


def shards(fig, name, group, spots, mat='vC', tris=60, voxel=.03):
    """Loose crystals standing in the ground: spots are (x, z, height, lean_x, lean_z)."""
    fs = []
    for i, (x, z, h, lx, lz) in enumerate(spots):
        up = V(lx, 1, lz)
        up = up / np.linalg.norm(up)
        b = V(x, 0, z)
        fs.append(Vk.crystal(b - up * h * .2, b + up * h, h * .19, 5 + i % 2, .3, i * 1.3))
    fig.add(name, group, mat, S.union(*fs), tris * len(spots), voxel=voxel, uv=('cyl',), sharp=25)


def ring_of(n, r, y=0.0, phase=0.0, zs=1.0):
    return [(np.cos(phase + i * TAU / n) * r, y, np.sin(phase + i * TAU / n) * r * zs) for i in range(n)]


def floater(fig, name, at, R_, r, mat, n=0, slen=.5, smat='teal', upright=False, squash=.55, tris=260):
    """A ring that hangs in the air and turns: its own group, lying flat round its pivot (or standing, facing z)."""
    fig.group(name, at)
    c = V(at)
    Rm = UP if upright else None
    fig.add(name + 'band', name, mat, S.torus(c, R_, r, Rm, squash=squash if not upright else 1.0), tris, voxel=max(.02, r * .3), uv=('wrap',), sharp=50)
    if n:
        fs = []
        for i in range(n):
            a = i * TAU / n
            d = V(np.cos(a), np.sin(a), 0) if upright else V(np.cos(a), 0, np.sin(a))
            fs.append(Vk.crystal(c + d * (R_ - slen * .45), c + d * (R_ + slen * .55), slen * .22, 4, .5))
        fig.add(name + 'pts', name, smat, S.union(*fs), 40 * n, voxel=.022, uv=('cyl',), sharp=25)


# ---------------------------------------------------------------- Choir Stone
def choir():
    fig = site.building('choir', 3.2, 3.2, 15.0)
    fig.group('body')
    fig.add('base', 'body', 'vD', mound([(2.3, 0), (2.25, .22), (1.95, .55), (1.4, .86), (1.1, 1.12)], 3, .1, 3.1, ribs=5), 800, voxel=.035, uv=('cyl',))
    sp = Vk.curve([(0, .5, 0), (.24, 3, .1), (-.22, 6, -.12), (.18, 9, .06), (0, 12.1, 0)], 18)
    rs = Vk.radii([1.16, 1.02, .78, .46, .05], len(sp))
    spire = Vk.horn(sp, rs, plates=10, lip=.075, flutes=5, flute=.04, turn=.85)
    spire = S.cut(spire, S.ellipsoid((.1, 2.75, 1.0), (.46, .82, .62)), k=.08)                 # the niche the heart sits in
    fig.add('spire', 'body', 'vI', Vk.pits(spire, 7.7, .018, 5), 2600, voxel=.032, uv=('cyl',), sharp=38)
    fig.add('heart', 'body', 'vM', Vk.crystal((.1, 2.05, .66), (.1, 3.4, .66), .3, 6, .45), 90, voxel=.02, uv=('cyl',), sharp=25)
    lip = S.cut(S.ellipsoid((.1, 2.75, .93), (.56, .94, .2)), S.ellipsoid((.1, 2.75, 1.0), (.44, .8, .62)))
    fig.add('niche', 'body', 'vG', S.both(lip, S.above(0)), 260, voxel=.022, uv=('front',))
    fig.add('bands', 'body', 'vG', S.union(*[Vk.band(sp, rs, t, .085, .05) for t in (.17, .36, .55, .72)]), 520, voxel=.025, uv=('cyl',))
    # three bone fingers that hold the spire up, and the two young horns beside it
    for i, (a, top, r) in enumerate(((.5, 5.4, .46), (2.6, 4.3, .4), (4.5, 6.2, .44))):
        c, s = np.cos(a), np.sin(a)
        pts = Vk.curve([(c * 1.75, .35, s * 1.75), (c * 2.05, top * .5, s * 2.05), (c * 1.25, top * .86, s * 1.25), (c * .62, top, s * .62)], 12)
        f = Vk.horn(pts, Vk.radii([r, r * .86, r * .5, .03], len(pts)), plates=5, lip=.03)
        fig.add('finger%d' % i, 'body', 'vL', f, 420, voxel=.026, uv=('cyl', (c * 1.6, top / 2, s * 1.6), (0, 1, 0)))
    crown = [Vk.crystal((0, 11.1, 0), (0, 14.2, 0), .36, 6, .2)]
    for i in range(4):
        a = i * TAU / 4 + .5
        d = V(np.cos(a), .9, np.sin(a))
        d = d / np.linalg.norm(d)
        crown.append(Vk.crystal(V(0, 10.9, 0) + d * .05, V(0, 10.9, 0) + d * 1.25, .15, 5, .3))
    fig.add('crown', 'body', 'vC', S.union(*crown), 300, voxel=.022, uv=('cyl',), sharp=25)
    shards(fig, 'crystals', 'body', [(np.cos(a) * 2.0, np.sin(a) * 2.0, h, np.cos(a) * .45, np.sin(a) * .45) for a, h in ((1.5, 1.5), (3.5, 1.1), (5.4, 1.7), (.1, .9), (4.1, .8))])
    floater(fig, 'ring0', (0, 4.2, 0), 1.72, .14, 'mag', 4, .55)
    floater(fig, 'ring1', (0, 7.4, 0), 1.22, .12, 'mag', 3, .45)
    return fig


# ---------------------------------------------------------------- Reed Gate
def reedgate():
    fig = site.building('reedgate', 6.2, 4.6, 11.5)
    fig.group('body')
    fig.add('base', 'body', 'vD', mound([(3.7, 0), (3.6, .3), (3.1, .62), (2.7, .86), (2.3, .96)], 2, .09, 5.2, zs=.72), 800, voxel=.04, uv=('cyl',))
    gold = []
    for sx in (-1, 1):
        pts = Vk.curve([(sx * 3.05, .4, 0), (sx * 4.25, 3.3, 0), (sx * 4.05, 6.4, 0), (sx * 2.3, 9.0, 0), (sx * .75, 9.75, 0)], 18)
        rs = Vk.radii([.9, .78, .6, .34, .05], len(pts))
        f = Vk.horn(pts, rs, plates=9, lip=.065, flutes=4, flute=.03, turn=sx * .6)
        if sx < 0:
            fig.add('hornL', 'body', 'vI', Vk.pits(f, 2.2, .018, 5), 1500, voxel=.034, uv=('cyl', (-3.6, 5, 0), (0, 1, 0)), sharp=38)
        else:
            fig.add('hornR', 'body', 'vI', Vk.pits(f, 6.4, .018, 5), 1500, voxel=.034, uv=('cyl', (3.6, 5, 0), (0, 1, 0)), sharp=38)
        gold += [Vk.band(pts, rs, t, .08, .05) for t in (.16, .4, .62)]
        for j, (z0, z1, top) in enumerate(((.95, 1.6, 5.4), (-.95, -1.8, 4.5))):
            q = Vk.curve([(sx * 3.5, .3, z0), (sx * 4.5, top * .55, z1 * .9), (sx * 4.6, top, z1)], 10)
            fig.add('reed%s%d' % ('L' if sx < 0 else 'R', j), 'body', 'vL', Vk.horn(q, Vk.radii([.42, .3, .03], len(q)), plates=4, lip=.025), 300, voxel=.028, uv=('cyl', (sx * 4.2, top / 2, z1), (0, 1, 0)))
    fig.add('bands', 'body', 'vG', S.union(*gold, S.torus((0, .9, 0), 2.6, .1, squash=1.0)), 800, voxel=.026, uv=('cyl',))
    key = S.union(Vk.crystal((0, 9.9, 0), (0, 7.6, 0), .34, 6, .25), *[Vk.crystal((sx * 3.55, 6.6, 0), (sx * 4.9, 8.3, 0), .3, 6, .25) for sx in (-1, 1)])
    fig.add('keystone', 'body', 'vC', key, 240, voxel=.024, uv=('cyl',), sharp=25)
    shards(fig, 'crystals', 'body', [(np.cos(a) * 3.75, np.sin(a) * 2.7, h, np.cos(a) * .4, np.sin(a) * .4) for a, h in ((.5, 1.5), (1.4, 1.0), (2.5, 1.8), (3.6, 1.2), (4.4, 1.6), (5.3, .9), (5.9, 1.3))])
    floater(fig, 'ring', (0, 4.6, 0), 2.8, .2, 'mag', 6, .9, upright=True, tris=420)
    fig.add('ringgold', 'ring', 'vG', S.torus((0, 4.6, 0), 2.48, .07, UP), 220, voxel=.024, uv=('wrap',))
    return fig


# ---------------------------------------------------------------- Brood Pit
def broodpit():
    fig = site.building('broodpit', 4.6, 4.6, 6.0)
    fig.group('body')
    pit = mound([(3.85, 0), (3.7, .45), (3.1, 1.05), (2.66, 1.36), (2.36, 1.44)], 3, .11, 4.4, ribs=7, rib=.1)
    pit = S.cut(pit, S.ellipsoid((0, 1.62, 0), (2.3, .86, 2.3)), k=.05)
    fig.add('pit', 'body', 'vD', pit, 1500, voxel=.036, uv=('cyl',))
    for i in range(7):
        a = i / 7 * TAU + .2
        c, s, h = np.cos(a), np.sin(a), (4.7 if i % 2 else 3.5)
        pts = Vk.curve([(c * 3.15, .5, s * 3.15), (c * 3.55, h * .5, s * 3.55), (c * 2.7, h * .88, s * 2.7), (c * 1.55, h, s * 1.55)], 12)
        f = Vk.horn(pts, Vk.radii([.46, .38, .22, .03], len(pts)), plates=5 if i % 2 else 6, lip=.035)
        fig.add('rib%d' % i, 'body', 'vL' if i % 2 else 'vI', f, 380, voxel=.028, uv=('cyl', (c * 3.2, h / 2, s * 3.2), (0, 1, 0)))
    eggs = [[], []]
    for i in range(5):
        a = i / 5 * TAU + .9
        e = S.ellipsoid((np.cos(a) * 1.5, 1.3, np.sin(a) * 1.5), (.33, .44, .33), rot(.25 * np.cos(a), 0, .25 * np.sin(a)))
        eggs[i % 2].append(Vk.pits(e, i * 3.1, .02, 9))
    fig.add('eggsC', 'body', 'vC', S.union(*eggs[0]), 260, voxel=.022, uv=('cyl',))
    fig.add('eggsM', 'body', 'vM', S.union(*eggs[1]), 180, voxel=.022, uv=('cyl',))
    fig.add('rim', 'body', 'vG', S.torus((0, 1.4, 0), 2.56, .12), 360, voxel=.028, uv=('wrap',))
    fig.add('hum', 'body', 'mag', S.torus((0, 1.62, 0), 1.85, .1, squash=.5), 240, voxel=.024, uv=('wrap',))
    shards(fig, 'crystals', 'body', [(np.cos(a) * 3.95, np.sin(a) * 3.95, h, np.cos(a) * .5, np.sin(a) * .5) for a, h in ((.65, 1.1), (2.45, 1.4), (4.25, .9), (5.6, 1.2))])
    return fig


# ---------------------------------------------------------------- Thorn Spire
def thornspire():
    fig = site.building('thornspire', 2.2, 2.2, 8.6)
    fig.group('body')
    fig.add('base', 'body', 'vD', mound([(1.42, 0), (1.34, .22), (.95, .46), (.6, .62)], 2, .06, 2.7, ribs=4, rib=.04), 420, voxel=.028, uv=('cyl',))
    sp = Vk.curve([(0, .3, 0), (.22, 1.8, .1), (-.18, 3.4, -.1), (.1, 5.0, .06), (0, 6.05, 0)], 16)
    rs = Vk.radii([.62, .56, .44, .3, .1], len(sp))
    fig.add('spike', 'body', 'vI', Vk.pits(Vk.horn(sp, rs, plates=8, lip=.05, flutes=4, flute=.025, turn=1.4), 1.9, .014, 6), 1300, voxel=.024, uv=('cyl',), sharp=38)
    fig.add('bands', 'body', 'vG', S.union(*[Vk.band(sp, rs, t, .055, .035) for t in (.22, .48, .72)]), 300, voxel=.02, uv=('cyl',))
    th = []
    for i in range(6):
        a = i / 6 * TAU
        t = .28 + (i % 3) * .2
        c, d, r = Vk.along(sp, rs, t)
        o = V(np.cos(a), .45, np.sin(a))
        o = o / np.linalg.norm(o)
        th.append(Vk.crystal(c + o * r * .5, c + o * (r + 1.05), .12, 4, .2))
    fig.add('thorns', 'body', 'vM', S.union(*th), 240, voxel=.02, uv=('cyl',), sharp=25)
    for i in range(3):                                           # bone prongs that cradle the eye
        a = i / 3 * TAU + .4
        c, s = np.cos(a), np.sin(a)
        q = Vk.curve([(c * .2, 5.3, s * .2), (c * .95, 6.1, s * .95), (c * 1.0, 6.9, s * 1.0), (c * .62, 7.7, s * .62)], 10)
        fig.add('prong%d' % i, 'body', 'vL', Vk.horn(q, Vk.radii([.16, .14, .1, .02], len(q))), 150, voxel=.02, uv=('cyl', (c * .8, 6.5, s * .8), (0, 1, 0)))
    fig.group('eye', (0, 6.9, 0))
    fig.add('eyestone', 'eye', 'teal', Vk.crystal((0, 6.38, 0), (0, 7.5, 0), .32, 6, .46), 80, voxel=.018, uv=('cyl',), sharp=25)
    floater(fig, 'halo', (0, 6.9, 0), .76, .045, 'vG', 3, .3, tris=160)
    return fig


# ---------------------------------------------------------------- Ward Pylon
def wardpylon():
    fig = site.building('wardpylon', 3.0, 3.0, 8.0)
    fig.group('body')
    fig.add('base', 'body', 'vD', mound([(1.75, 0), (1.66, .28), (1.2, .5), (.8, .62)], 2, .07, 6.1, ribs=3, rib=.07), 480, voxel=.03, uv=('cyl',))
    gold = [S.torus((0, .6, 0), 1.0, .07)]
    for i in range(3):
        a = i / 3 * TAU
        c, s = np.cos(a), np.sin(a)
        pts = Vk.curve([(c * 1.2, .3, s * 1.2), (c * 2.05, 2.5, s * 2.05), (c * 2.0, 4.7, s * 2.0), (c * 1.25, 6.0, s * 1.25), (c * .5, 6.5, s * .5)], 14)
        rs = Vk.radii([.42, .36, .27, .16, .03], len(pts))
        fig.add('claw%d' % i, 'body', 'vL' if i % 2 else 'vI', Vk.pits(Vk.horn(pts, rs, plates=7, lip=.04, flutes=3, flute=.02, turn=1.0), i * 2.3, .012, 6), 760, voxel=.026, uv=('cyl', (c * 1.8, 3.3, s * 1.8), (0, 1, 0)), sharp=38)
        gold += [Vk.band(pts, rs, t, .05, .03) for t in (.26, .58)]
    fig.add('bands', 'body', 'vG', S.union(*gold), 520, voxel=.022, uv=('cyl',))
    shards(fig, 'crystals', 'body', [(np.cos(a) * 1.55, np.sin(a) * 1.55, h, np.cos(a) * .5, np.sin(a) * .5) for a, h in ((1.05, .9), (3.14, 1.2), (5.2, .8))])
    fig.group('core', (0, 4.6, 0))
    core = S.both(Vk.crystal((0, 3.62, 0), (0, 5.58, 0), .82, 8, .5), S.sphere((0, 4.6, 0), .93))
    fig.add('corestone', 'core', 'cyan', core, 140, voxel=.024, uv=('cyl',), sharp=22)
    floater(fig, 'r1', (0, 4.6, 0), 1.32, .055, 'vG', 4, .34, tris=220)
    floater(fig, 'r2', (0, 4.6, 0), 1.04, .045, 'teal', 0, tris=160, squash=1.0)
    return fig


# ---------------------------------------------------------------- Hush Well
def hushwell():
    fig = site.building('hushwell', 3.4, 3.4, 5.6)
    fig.group('body')
    well = mound([(2.42, 0), (2.34, .36), (2.0, .84), (1.72, 1.1), (1.5, 1.16)], 2, .08, 8.3, ribs=4, rib=.06)
    well = S.cut(well, S.ellipsoid((0, 1.3, 0), (1.46, .62, 1.46)), k=.04)
    fig.add('well', 'body', 'vD', well, 900, voxel=.03, uv=('cyl',))
    fig.add('rim', 'body', 'vG', S.torus((0, 1.12, 0), 1.64, .1), 300, voxel=.026, uv=('wrap',))
    for i in range(4):
        a = i / 4 * TAU + .4
        c, s = np.cos(a), np.sin(a)
        pts = Vk.curve([(c * 2.05, .5, s * 2.05), (c * 2.5, 2.3, s * 2.5), (c * 1.75, 3.9, s * 1.75), (c * .5, 4.4, s * .5)], 12)
        fig.add('reed%d' % i, 'body', 'vL' if i % 2 else 'vI', Vk.horn(pts, Vk.radii([.28, .23, .14, .03], len(pts)), plates=6, lip=.03), 420, voxel=.024, uv=('cyl', (c * 2.1, 2.4, s * 2.1), (0, 1, 0)))
    shards(fig, 'crystals', 'body', [(np.cos(a) * 2.3, np.sin(a) * 2.3, .7, np.cos(a) * .5, np.sin(a) * .5) for a in (1.2, 2.75, 4.3, 5.9)] + [(np.cos(a) * 1.0, np.sin(a) * 1.0, 1.55, np.cos(a) * .4, np.sin(a) * .4) for a in (0, 2.1, 4.2)])
    fig.group('orb', (0, 2.7, 0))
    fig.add('orbstone', 'orb', 'vM', Vk.pits(S.sphere((0, 2.7, 0), .56), 3.3, .03, 6), 260, voxel=.022, uv=('cyl',))
    cage = S.union(S.torus((0, 2.7, 0), .6, .035, rot(0, 0, PI / 2)), S.torus((0, 2.7, 0), .6, .035, rot(PI / 2, 0, 0)))
    fig.add('orbcage', 'orb', 'vG', cage, 220, voxel=.016, uv=('cyl',))
    floater(fig, 'halo', (0, 2.7, 0), .82, .05, 'teal', 0, tris=160, squash=1.0)
    return fig


MAKERS = dict(choir=choir, reedgate=reedgate, broodpit=broodpit, thornspire=thornspire, wardpylon=wardpylon, hushwell=hushwell)
if __name__ == '__main__':
    site.main(MAKERS, __file__)
