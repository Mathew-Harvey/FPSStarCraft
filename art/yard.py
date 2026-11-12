"""What Ironhold puts up: sheds, tanks and towers made of whatever came off the last ship.

These are the hulls only: pads, walls, roofs, tanks, stacks, towers. The game still bolts the hand-made things onto
them (doors, lit windows, signs, posters, awnings, washing lines) and still turns the wheel, the dish and the crane hook,
so every hull here keeps the sizes the game's own code expects.
Run:  python yard.py <headframe|bunkhouse|depot|watchpost|assay|mast|machineshop|foundry> [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, veyl as Vk, yard as Y, site
from kit.sdf import V, rot, F

PI = np.pi


def boxes(spots, r=.03):
    """Plain blocks: (centre, half sizes)."""
    return S.union(*[S.box(c, h, r) for c, h in spots])


def slab(fig, name, c, half, mat, seed=1.0, tris=60, group='body', amp=.03):
    c, half = V(c), V(half)
    fig.add(name, group, mat, Y.knocked(S.box(c, half, .03), seed, amp, 1.0), tris, voxel=.04, uv=('box',), sharp=35, lo=c - half - .1, hi=c + half + .1, planar=4)


# ---------------------------------------------------------------- Headframe
def headframe():
    fig = site.building('headframe', 7.8, 5.6, 16.8, ink=0)
    fig.group('body')
    Y.pads(fig, 13, 9, 3, 2, 1.0, .24)
    Y.walls(fig, 'w', (0, .1, 0), 10, 4.4, 7, ('wallS', 'wallS', 'wallS', 'wallD', 'wallR'), 2.0, clad_h=3.7,
            front=[(-.3, 3.5, 0, 3.4), (-3.67, -1.73, 2.08, 3.12), (-3.67, -1.73, .68, 1.72)])
    Y.band(fig, 'haz', (0, 4.1, 0), 10.2, 7.2, .7, .14, 'haz', 3.0)
    Y.band(fig, 'fas', (0, 4.7, 0), 10.5, 7.5, .4, .14, 'wallD', 4.0)
    slab(fig, 'roofbed', (0, 4.68, 0), (5.2, .2, 3.7), 'wallD', 5.0)
    Y.roof(fig, 'rf', (0, 4.86, 0), 10.5, 7.5, ('wallD', 'wallS', 'wallD', 'wallR'), 6.0, over=0)
    Y.tank(fig, 'tkL', (-3.2, 4.8, -1.6), 1.2, 1.6, ('bS', 'cY', 'nD'), 5.0, dome=.82)
    Y.tank(fig, 'tkR', (3.2, 4.8, -1.6), 1.2, 1.6, ('bS', 'cY', 'nD'), 6.0, dome=.82)
    fig.add('pipes', 'body', 'bD', Y.pipe([(-3.2, 7.1, -1.6), (-3.2, 7.52, -1.6), (0, 7.44, -1.6), (3.2, 7.52, -1.6), (3.2, 7.1, -1.6)], .12), 420, voxel=.03, uv=('box',))
    fig.add('pipeY', 'body', 'bY', Y.pipe([(-4.4, 5.4, -1.6), (-5.3, 5.4, -1.6), (-5.3, 2.5, -1.6), (-4.95, 2.2, -1.6)], .14), 320, voxel=.03, uv=('box',))
    Y.tower(fig, 'tw', 4.8, 2.6, 2.2, 14.2, .6, .6, (.3, .6), .34, seed=7.0)
    feet = [((sx * 2.6, 4.95, sz * 2.2), (.36, .16, .36)) for sx in (-1, 1) for sz in (-1, 1)] + [((0, 15.08, 0), (1.1, .08, 1.1))]
    fig.add('feet', 'body', 'pD', boxes(feet), 120, voxel=.035, uv=('box',), sharp=35)
    slab(fig, 'cab', (0, 14.5, 0), (.95, .5, .95), 'chest', 8.0, 80)
    Y.stack(fig, 'ch', (3.4, 4.7, -2), .46, 3.4, ('wallR', 'nD'), (.03, -.015), 9.0)
    return fig


# ---------------------------------------------------------------- Bunkhouse
def bunkhouse():
    fig = site.building('bunkhouse', 4.6, 3.6, 4.4, ink=0)
    fig.group('body')
    Y.pads(fig, 7.6, 5.8, 2, 2, 11.0, .2)
    O = V(0, .2, 0)

    def bay(x0, x1, seed):
        def f(p):
            q = p - O
            rad = np.sqrt(q[..., 1] ** 2 + q[..., 2] ** 2)
            r = 2.6 - .09 * np.clip((S.noise(p, .9, seed) - .64) * 6, 0, 1)
            return (np.maximum(np.maximum(rad - r, np.abs(q[..., 0] - (x0 + x1) / 2) - (x1 - x0) / 2 - .05), -q[..., 1]) * .8).astype(F)
        return f
    for i, (x0, x1, mat) in enumerate(((-3.38, -2.4, 'wallG'), (-2.4, 0, 'wallG'), (0, 2.4, 'wallG'), (2.4, 3.38, 'wallG'))):
        fig.add('bay%d' % i, 'body', mat, bay(x0, x1, 12.0 + i), int(110 * (x1 - x0)), voxel=.035, uv=('cyl', ((x0 + x1) / 2, .2, 0), (1, 0, 0), 'swap'), sharp=40, lo=(x0 - .15, .1, -2.8), hi=(x1 + .15, 3.0, 2.8))
    ribs = S.union(*[S.torus((x, .2, 0), 2.63, .09, rot(0, 0, PI / 2), squash=1.3) for x in (-2.4, 0, 2.4)])
    fig.add('ribs', 'body', 'bD', S.both(ribs, S.above(.2)), 420, voxel=.03, uv=('box',))
    arch = S.cyl((-4, .2, 0), (4, .2, 0), 2.56)
    endR = Y.sheet((3.5, 1.5, 0), 5.3, 2.7, Y.RIGHT, seed=13.0, dent=.07)
    endR = S.cut(S.both(endR, arch), S.box((3.5, 1.25, 0), (.6, 1.1, .78)), S.box((3.5, 2.9, 0), (.6, .28, .48)))
    fig.add('endR', 'body', 'wallS', endR, 160, voxel=.028, uv=('plane', (3.5, 1.5, 0), Y.RIGHT[:, 0], Y.RIGHT[:, 1], 5.3, 2.7), sharp=35)
    endL = S.both(Y.sheet((-3.5, 1.5, 0), 5.3, 2.7, Y.LEFT, seed=14.0, dent=.08, peel=(1, 1, .04)), arch)
    fig.add('endL', 'body', 'wallD', endL, 120, voxel=.028, uv=('plane', (-3.5, 1.5, 0), Y.LEFT[:, 0], Y.LEFT[:, 1], 5.3, 2.7), sharp=35)
    Y.strip(fig, 'kickRa', (3.56, .5, 2.65), (3.56, .5, .9), .8, .14, 'wallD', 15.0)
    Y.strip(fig, 'kickRb', (3.56, .5, -.9), (3.56, .5, -2.65), .8, .14, 'wallD', 16.0)
    Y.strip(fig, 'kickL', (-3.56, .5, -2.65), (-3.56, .5, 2.65), .8, .14, 'wallD', 17.0)
    return fig


# ---------------------------------------------------------------- Depot
def container(fig, tag, c, ry, mat, seed):
    """A shipping box 5 long: ribbed panels set into a frame, corner castings, bars on the door end. Made in two halves so each carries the skin square."""
    c, R = V(c), rot(0, ry, 0)
    k = 2 * PI / .42

    def half(sx):
        def f(p):
            q = (p - c) @ R
            x, y, z = q[..., 0], q[..., 1], q[..., 2]
            wave = 0.0
            mxy = np.clip((2.33 - np.abs(x)) / .06, 0, 1) * np.clip((1.0 - np.abs(y)) / .06, 0, 1)
            mxz = np.clip((2.33 - np.abs(x)) / .06, 0, 1) * np.clip((1.0 - np.abs(z)) / .06, 0, 1)
            myz = np.clip((1.0 - np.abs(y)) / .06, 0, 1) * np.clip((1.0 - np.abs(z)) / .06, 0, 1) * (x < 0)
            dent = .09 * np.clip((S.noise(q, .8, seed) - .64) * 6, 0, 1)
            d = np.stack([np.abs(x) - 2.5 + myz * .05, np.abs(y) - 1.15 + mxz * (.025 + .025 * wave) + dent * (y > 0), np.abs(z) - 1.15 + mxy * (.035 + .03 * wave) + dent], -1) + .03
            o = np.sqrt((np.maximum(d, 0) ** 2).sum(-1)) + np.minimum(d.max(-1), 0) - .03
            return (np.maximum(o, np.abs(x - sx * 1.22) - 1.29) * .8).astype(F)
        return f
    ext = np.abs(R) @ V(2.6, 1.25, 1.25)
    for sx in (-1, 1):
        fig.add('%s%s' % (tag, 'a' if sx < 0 else 'b'), 'body', mat, half(sx), 260, voxel=.026, uv=('box',), sharp=35, lo=c - ext, hi=c + ext, planar=4)
    cast = [S.box(c + R @ V(sx * 2.42, sy * 1.07, sz * 1.07), (.11, .11, .11), .03, R) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    cast += [S.box(c + R @ V(2.56, 0, z), (.04, .06, .15), .015, R) for z in (-.5, .5)]
    fig.add(tag + 'cast', 'body', 'pD', S.union(*cast), 200, voxel=.022, uv=('box',), sharp=35, planar=4, lo=c - ext - .1, hi=c + ext + .1)
    bars = [S.rcone(c + R @ V(2.54, -1.0, z), c + R @ V(2.54, 1.0, z), .035) for z in (-.5, .5)] + [S.box(c + R @ V(2.52, 0, 0), (.02, 1.12, .02), .0, R)]
    fig.add(tag + 'bars', 'body', 'nS', S.union(*bars), 120, voxel=.018, uv=('box',), lo=c - ext - .1, hi=c + ext + .1)


def depot():
    fig = site.building('depot', 3.6, 3.4, 5.4, ink=0)
    fig.group('body')
    container(fig, 'r', (0, 1.15, -1.2), 0, 'wallR', 21.0)
    container(fig, 't', (.2, 1.15, 1.25), .06, 'wallT', 22.0)
    container(fig, 'y', (.1, 3.45, 0), -.12, 'wallY', 23.0)
    return fig


# ---------------------------------------------------------------- Watchpost
def watchpost():
    fig = site.building('watchpost', 2.6, 2.6, 8.6, ink=0)
    fig.group('body')
    Y.tower(fig, 'tw', 0, 1.2, 1.2, 4.5, .9, .9, (.18, .58), .2, mats=('bD', 'nD', 'nD'), voxel=.026, seed=31.0, tris=(420, 260, 300))
    fig.add('feet', 'body', 'conc', Y.knocked(boxes([((sx * 1.2, .1, sz * 1.2), (.26, .11, .26)) for sx in (-1, 1) for sz in (-1, 1)]), 32.0, .03, 2), 120, voxel=.03, uv=('box',))
    deck = S.box((0, 4.6, 0), (1.45, .15, 1.45), .03)
    for x in (-.87, -.29, .29, .87):
        deck = S.groove(deck, [(x, 4.75, -1.5), (x + .02, 4.75, 1.5)], .03, .04)
    fig.add('deck', 'body', 'wallS', Y.knocked(deck, 33.0, .03, 1.2), 160, voxel=.03, uv=('box',), sharp=35)
    for i, (a, b, mat) in enumerate((((-1.4, 1.4), (1.4, 1.4), 'pY'), ((1.4, 1.4), (1.4, -1.4), 'pY'), ((1.4, -1.4), (-1.4, -1.4), 'wallS'), ((-1.4, -1.4), (-1.4, 1.4), 'pY'))):
        Y.strip(fig, 'par%d_' % i, (a[0], 5.2, a[1]), (b[0], 5.2, b[1]), .9, .14, mat, 34.0 + i, seg=3.2, tris=60)
    posts = S.union(*[Y.beam((sx * 1.3, 5.55, sz * 1.3), (sx * 1.3 + .03 * sx, 6.95, sz * 1.3), .11) for sx in (-1, 1) for sz in (-1, 1)])
    fig.add('posts', 'body', 'nD', posts, 120, voxel=.024, uv=('box',))
    a = np.arctan2(1.3, 1.9)
    L = float(np.hypot(1.9, 1.3))
    for i in range(4):                                           # four sheets of roofing iron leaning on each other
        Ry = rot(0, i * PI / 2, 0)
        R = (Ry @ rot(-(PI / 2 - a), 0, 0)).astype(F)
        c = Ry @ V(0, 6.85, 1.9) + R @ V(0, L / 2, 0) + V(0, .02 * (i % 2), 0)
        f = Y.sheet(c, 4.0, L + .12, R, seed=36.0 + i, dent=.07, studs=0, peel=(1, -1, .05) if i == 1 else None)
        n1, n2 = Ry @ V(1, 0, -1), Ry @ V(-1, 0, -1)
        f = S.both(f, lambda p, n1=n1, n2=n2: np.maximum(p @ n1, p @ n2) * .7 - .03)
        fig.add('roof%d' % i, 'body', 'wallR', f, 90, voxel=.026, uv=('plane', c, R[:, 0], R[:, 1], 4.0, L), sharp=35, planar=4)
    fig.add('finial', 'body', 'nD', S.union(S.sphere((0, 8.12, 0), .16), S.cyl((0, 7.9, 0), (0, 8.1, 0), .22, .03)), 60, voxel=.02, uv=('box',))
    return fig


# ---------------------------------------------------------------- Assay Office
def assay():
    fig = site.building('assay', 4.4, 4.0, 7.2, ink=0)
    fig.group('body')
    Y.pads(fig, 7.2, 6.4, 2, 2, 41.0, .2)
    Y.walls(fig, 'w', (0, .2, -.3), 5.8, 3.0, 4.6, ('wallT', 'wallT', 'wallT', 'wallS', 'wallD'), 42.0,
            front=[(-2.3, -.9, 0, 2.3), (-.07, 2.07, 1.18, 2.42)], right=[(-.87, .87, 1.23, 2.37)], left=[(-.87, .87, 1.23, 2.37)])
    Y.band(fig, 'fas', (0, 3.35, -.3), 6.2, 5.0, .3, .14, 'wallD', 43.0)
    slab(fig, 'roofbed', (0, 3.3, -.3), (3.0, .16, 2.4), 'wallD', 44.0)
    Y.roof(fig, 'rf', (0, 3.46, -.3), 6.2, 5.0, ('wallD', 'wallS', 'wallT'), 45.0, over=0)
    Y.tank(fig, 'st', (2.1, 3.4, -1.7), .55, 2.6, ('bS', 'cO', 'nD'), 46.0, dome=.46, tris=.7, voxel=.026)
    return fig


# ---------------------------------------------------------------- Signal Mast
def mast():
    fig = site.building('mast', 3.2, 3.2, 14.0, ink=0)
    fig.group('body')
    Y.pads(fig, 4.6, 4.6, 2, 2, 51.0, .2)
    Y.tower(fig, 'tw', 0, 1.7, 1.7, 10, .42, .42, (.16, .38, .59, .78, .94), .36, mats=('bY', 'bY', 'bS'), seed=52.0, tris=(900, 620, 700))
    fig.add('feet', 'body', 'conc', Y.knocked(boxes([((sx * 1.7, .14, sz * 1.7), (.3, .13, .3)) for sx in (-1, 1) for sz in (-1, 1)]), 53.0, .03, 2), 120, voxel=.03, uv=('box',))
    top = S.union(S.box((0, 10.1, 0), (.75, .13, .75), .03), *[Y.beam((sx * .7, 10.2, sz * .7), (sx * .7, 10.95, sz * .7), .06) for sx in (-1, 1) for sz in (-1, 1)],
                  *[Y.beam((-s * .7, 10.9, s2 * .7), (s * .7, 10.9, s2 * .7), .05) for s in (1,) for s2 in (-1, 1)], *[Y.beam((s2 * .7, 10.9, -.7), (s2 * .7, 10.9, .7), .05) for s2 in (-1, 1)])
    fig.add('top', 'body', 'wallS', top, 260, voxel=.022, uv=('box',), sharp=35)
    fig.add('pole', 'body', 'bS', S.rcone((0, 10.2, 0), (.04, 13.25, 0), .1, .07), 80, voxel=.024, uv=('cyl',))
    Y.walls(fig, 'hut', (0, .2, 0), 2.0, 1.7, 1.6, ('wallR', 'wallR', 'wallS'), 54.0, front=[(-.57, .57, .68, 1.42)], rows=False, wide=(1.2, 2.2))
    slab(fig, 'hutroof', (0, 2.0, 0), (1.1, .1, .9), 'wallD', 55.0, 60, amp=.04)
    return fig


# ---------------------------------------------------------------- Machine Shop
def machineshop():
    fig = site.building('machineshop', 5.4, 4.4, 6.4, ink=0)
    fig.group('body')
    Y.pads(fig, 9, 7, 3, 2, 61.0, .2)
    Y.walls(fig, 'w', (-.6, .1, -.4), 6.4, 3.6, 5, ('wallR', 'wallR', 'wallR', 'wallS', 'wallD', 'wallY'), 62.0, front=[(-1.75, 1.75, 0, 2.85), (-3.17, -2.03, 2.08, 2.92)])
    Y.band(fig, 'fas', (-.6, 3.85, -.4), 6.8, 5.4, .3, .14, 'wallD', 63.0)
    slab(fig, 'roofbed', (-.6, 3.8, -.4), (3.3, .16, 2.6), 'wallD', 64.0)
    Y.roof(fig, 'rf', (-.6, 3.96, -.4), 6.8, 5.4, ('wallD', 'wallS', 'wallR', 'wallD'), 65.0, over=0)
    Y.tank(fig, 'silo', (3.4, 0, -1.2), .8, 4.4, ('bS', 'cO', 'nD'), 66.0, dome=.6)
    fig.add('pipe', 'body', 'bD', Y.pipe([(3.4, 3.6, -.5), (3.4, 3.6, .6), (2.5, 3.25, .9)], .1), 260, voxel=.026, uv=('box',))
    crane = S.union(Y.beam((3.4, 0, 2.2), (3.42, 5.6, 2.2), .3), Y.beam((3.5, 5.5, 2.2), (-1.7, 5.5, 2.2), .26, .3), S.box((3.4, 5.5, 2.2), (.26, .3, .22), .03), S.box((3.4, 2.6, 2.2), (.19, .26, .19), .02))
    fig.add('crane', 'body', 'bY', Y.knocked(crane, 67.0, .025, 1.4), 320, voxel=.03, uv=('box',), sharp=35)
    fig.add('stay', 'body', 'nD', S.union(Y.beam((3.4, 4.2, 2.2), (1.6, 5.45, 2.2), .12), Y.beam((3.4, 5.6, 2.2), (2.2, 6.3, 2.2), .08), Y.beam((2.2, 6.3, 2.2), (-.4, 5.6, 2.2), .08)), 160, voxel=.024, uv=('box',))
    fig.add('foot', 'body', 'conc', Y.knocked(S.box((3.4, .15, 2.2), (.38, .16, .38), .03), 68.0, .03, 2), 50, voxel=.03, uv=('box',))
    return fig


# ---------------------------------------------------------------- Foundry
def foundry():
    fig = site.building('foundry', 5.2, 4.6, 8.6, ink=0)
    fig.group('body')
    Y.pads(fig, 8.8, 7.6, 3, 2, 71.0, .2)
    Y.walls(fig, 'w', (-.8, .1, -.6), 5.8, 4.2, 5.2, ('wallD', 'wallD', 'wallD', 'wallS', 'wallR'), 72.0, front=[(-2.15, .55, 0, 2.85), (.75, 2.65, .22, 2.18)])
    Y.band(fig, 'fas', (-.8, 4.5, -.6), 6.2, 5.6, .4, .14, 'wallR', 73.0)
    slab(fig, 'roofbed', (-.8, 4.48, -.6), (3.0, .2, 2.7), 'wallD', 74.0)
    Y.walls(fig, 'cl', (-.8, 4.66, -.6), 4.6, .92, 4.2, ('wallS', 'wallS', 'wallD'), 75.0, rows=False, out=-.03)
    Y.roof(fig, 'rf', (-.8, 5.56, -.6), 4.6, 4.2, ('wallD', 'wallS', 'wallR'), 76.0, over=.12)
    Y.stack(fig, 'st', (3.2, 0, -1.8), .75, 7.4, ('wallR', 'nY'), (.02, .015), 77.0, n=4, tris=1.3)
    pot = Vk.lathe([(.7, 0), (.95, .12), (.99, .9), (.98, 1.4), (.9, 1.5)], c=(3.1, .15, 1.6))
    pot = S.cut(pot, S.cyl((3.1, 1.5, 1.6), (3.1, 1.9, 1.6), .8))
    pot = S.union(pot, S.torus((3.1, 1.6, 1.6), .95, .07), *[S.cyl((3.1 + sx * .95, 1.0, 1.6), (3.1 + sx * 1.2, 1.0, 1.6), .1, .02) for sx in (-1, 1)])
    fig.add('pot', 'body', 'bS', Y.knocked(pot, 78.0, .04, 1.6), 420, voxel=.026, uv=('cyl', (3.1, .9, 1.6), (0, 1, 0)), sharp=40)
    fig.add('pipe', 'body', 'bD', Y.pipe([(2.5, 4.0, -1.8), (1.4, 4.9, -1.6), (.6, 5.5, -1.2)], .12), 260, voxel=.028, uv=('box',))
    fig.add('pipeY', 'body', 'bY', Y.pipe([(3.2, 1.6, -1.0), (3.2, 2.2, .2), (3.1, 2.0, .8)], .1), 220, voxel=.026, uv=('box',))
    return fig


MAKERS = dict(headframe=headframe, bunkhouse=bunkhouse, depot=depot, watchpost=watchpost, assay=assay, mast=mast, machineshop=machineshop, foundry=foundry)
if __name__ == '__main__':
    site.main(MAKERS, __file__)
