"""The last Veyl bodies, from the High Beacon tier: Lyre (the carrier) and its Shards, and the Cantus (the flagship, one a side).

Lyre (a great harp afloat: a keel that sweeps up into two curved gold arms, strings drawn between them, a Shard docked between each pair
of strings, a masked figurehead at the prow and two broad shell fins), Shard (a small cut crystal drone with two glass fins and a gold
ring, made by the Lyre and flown out to fight), Cantus (a giant singer afloat on a long tail: a robe like a cathedral bell, organ pipes
up its back, both arms raised to conduct, a wide singing mask, and a great double halo marked like a clock face for Hold Time).
Same kit as art/veyl.py.
Run:  python high.py lyre|shard|cantus [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, veyl as Vk
from kit.sdf import V, rot
from veyl import filigree, horn
from sky import leaf, vein

KINDS = ('lyre', 'shard', 'cantus')
KIND = next((a for a in sys.argv[1:] if a in KINDS), 'shard')
PI = np.pi
FWD = rot(PI / 2, 0, 0)


def shard_parts(c=V(0, 0, 0), s=1.0):
    """A Shard's shapes about c at size s: (name, material, shape, tris, kw). Used for the Shard itself and for the ones docked in the Lyre."""
    P = lambda *a: c + V(*a) * s
    out = [('core', 'vC', Vk.crystal(P(0, 0, -.55), P(0, 0, .6), .2 * s, 5, .45), 260, dict(sharp=25, glow=.45)),
           ('ring', 'vG', S.torus(P(0, 0, -.05), .26 * s, .025 * s, FWD), 200, {}),
           ('eye', 'teal', S.ellipsoid(P(0, .02, .42), V(.05, .03, .04) * s), 40, dict(glow=.6))]
    out.append(('fins', 'vC', S.union(*[leaf(P(sx * .12, 0, -.05), P(sx * .6, .05, -.4), .2 * s, .006 * s) for sx in (-1, 1)]), 160, dict(glow=.25)))
    return out


# ---------------------------------------------------------------------------------------------------------------- Shard
def build_shard():
    Y = 1.2
    fig = B.Figure('shard', lo=(-.9, -.1, -.9), hi=(.9, 2.0, .9), coarse=.012, detail=1.0, paint=512, brush=.8)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, Y, .42), 'body'), ('halo', (0, Y, -.05), 'body'),
                      ('wingL', (-.12, Y, -.05), 'body'), ('wingR', (.12, Y, -.05), 'body')):
        fig.group(g, p, par)
    c = V(0, Y, 0)
    fig.add('core', 'body', 'vC', Vk.crystal(c + V(0, 0, -.55), c + V(0, 0, .6), .2, 5, .45), 300, voxel=.002, sharp=25, glow=.45, uv=('side',))
    fig.add('spine', 'body', 'vG', S.chain([c + V(0, .17, -.4), c + V(0, .2, 0), c + V(0, .15, .35)], [.02, .025, .015]), 120, voxel=.002)
    fig.add('eye', 'head', 'teal', S.ellipsoid(c + V(0, .02, .42), (.06, .035, .045)), 60, voxel=.002, glow=.6)
    fig.add('eyerim', 'head', 'vG', S.torus(c + V(0, .02, .44), .07, .012, FWD), 80, voxel=.002, uv=('front',))
    fig.add('halo', 'halo', 'vG', S.torus(c + V(0, 0, -.05), .28, .022, FWD), 200, voxel=.002, uv=('front',))
    fig.add('halopts', 'halo', 'mag', S.union(*[Vk.crystal(c + V(np.cos(a) * .27, np.sin(a) * .27, -.05), c + V(np.cos(a) * .38, np.sin(a) * .38, -.1), .025, 4, .3) for a in (PI / 2, PI * 7 / 6, PI * 11 / 6)]), 90, voxel=.002, sharp=25)
    for sx, g in ((-1, 'wingL'), (1, 'wingR')):
        root = c + V(sx * .12, 0, -.05)
        fig.add('fin' + g[-1], g, 'vC', leaf(root, root + V(sx * .55, .06, -.38), .22, .006), 120, voxel=.0015, uv=('top',), glow=.3)
        fig.add('finedge' + g[-1], g, 'vG', vein(root, root + V(sx * .55, .06, -.38), .012, .008), 60, voxel=.0015)
    fig.point('muzzle', (0, Y, .6), 'head')
    return fig, (0, 0, 1.2, 1.6)


# ---------------------------------------------------------------------------------------------------------------- Lyre
def build_lyre():
    """A great harp afloat, prow forward. The keel is a long shell hull; from its stern two gold arms sweep up and forward in a curve,
    and strings are drawn from the arms down to the hull. Between the strings the Shards hang docked, lit. A masked figurehead leans
    out of the prow; two broad shell fins stand off the hull; a halo turns slowly under the stern."""
    Y = 2.6
    fig = B.Figure('lyre', lo=(-3.6, -.1, -4.0), hi=(3.6, 7.0, 4.0), coarse=.045, detail=1.0, paint=1536, brush=2.6)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, Y + .6, 3.3), 'body'), ('halo', (0, Y - 1.1, -1.5), 'body'),
                      ('wingL', (-.8, Y + .1, 0), 'body'), ('wingR', (.8, Y + .1, 0), 'body')):
        fig.group(g, p, par)
    # the hull: long, shallow, a keel ridge under it
    pts = [V(0, Y + .2, -3.4), V(0, Y, -2.2), V(0, Y - .1, -.4), V(0, Y - .05, 1.4), V(0, Y + .25, 2.9), V(0, Y + .55, 3.4)]
    rad = [.2, .62, .95, .9, .55, .22]
    hull = Vk.horn(pts, rad, plates=8, lip=.018)
    hull = S.squash(hull, (1.0, .62, 1.0), c=(0, Y, 0))
    hull = S.bump(hull, lambda p: -.025 * np.clip(1 - np.abs(S.noise(p, 1.4, 3.7) - .5) * 5, 0, 1))
    fig.add('hull', 'body', 'vI', Vk.pits(hull, 4.1, .007, 10), 3600, voxel=.012, uv=('side',))
    fig.add('hullbands', 'body', 'vG', S.union(*[Vk.band(pts, rad, t, .04, .01) for t in (.2, .45, .7)]), 900, voxel=.01)
    kl = Vk.curve([V(0, Y - .5, -2.8), V(0, Y - .72, -.6), V(0, Y - .66, 1.6), V(0, Y - .2, 3.1)], 12)
    fig.add('keel', 'body', 'vD', Vk.pits(S.chain(kl, Vk.radii([.08, .14, .12, .07], len(kl))), 2.2, .006, 14), 600, voxel=.01, uv=('side',))
    fig.add('keelshards', 'body', 'vC', S.union(*[Vk.crystal(kl[i], kl[i] + V(0, -.5 + abs(i - 6) * .03, -.15), .09, 5, .3) for i in (2, 4, 6, 8, 10)]), 300, voxel=.008, sharp=25)
    # the harp: two gold arms rising from the stern, curving up and forward, a cross bar joining their tops
    arms, tops = [], []
    for sx in (-1, 1):
        a = Vk.curve([V(sx * .55, Y + .3, -2.6), V(sx * .8, Y + 2.4, -2.4), V(sx * .7, Y + 3.9, -1.2), V(sx * .45, Y + 4.1, .4), V(sx * .3, Y + 3.3, 1.4)], 20)
        arms.append(a)
        tops.append(a[-1])
    fig.add('harp', 'body', 'vG', S.union(*[S.chain(a, Vk.radii([.13, .12, .1, .09, .07], len(a))) for a in arms], S.chain([arms[0][12], arms[1][12]], [.07, .07])), 1800, voxel=.01, uv=('side',))
    fig.add('harpends', 'body', 'vC', S.union(*[Vk.crystal(t, t + V(0, -.2, .45), .09, 5, .3) for t in tops]), 120, voxel=.008, sharp=25)
    fig.add('harpfil', 'body', 'vM', S.union(*[S.sphere(a[i], .1) for a in arms for i in (6, 12, 17)]), 300, voxel=.008, glow=.4)
    # the strings: from points along each arm straight down to the hull's top line, and the Shards docked between them
    strings, docked = [], []
    for sx in (-1, 1):
        for i, j in enumerate((4, 7, 10, 13, 16)):
            top = arms[0 if sx < 0 else 1][j]
            bot = V(top[0] * .7, Y + .45, top[2])
            strings.append(S.chain([top, bot], [.018, .018]))
    fig.add('strings', 'body', 'vC', S.union(*strings), 900, voxel=.006, glow=.5)
    for k, z in enumerate((-1.7, -.6, .5)):
        for sx in (-1, 1):
            for nm, mat, f, tris, kw in shard_parts(V(sx * .62, Y + 1.6 + (.3 if k == 1 else 0), z), .7):
                docked.append((nm, mat, f, kw))
    by = {}
    for nm, mat, f, kw in docked:
        by.setdefault((nm, mat), []).append((f, kw))
    for (nm, mat), L in by.items():
        fig.add('dock' + nm, 'body', mat, S.union(*[f for f, _ in L]), 600, voxel=.006, uv=('side',), **L[0][1])
    # the figurehead: a mask leaning out of the prow, arms folded back along the hull like a ship's carving
    H0 = V(0, Y + .6, 3.3)
    face = S.ellipsoid(H0 + V(0, .15, .25), (.28, .36, .22))
    for x in (-.1, .1):
        face = S.cut(face, S.ellipsoid(H0 + V(x, .22, .46), (.07, .022, .05), rot(0, 0, -x * 3)), k=.01)
    face = S.cut(face, S.ellipsoid(H0 + V(0, -.02, .46), (.07, .05, .05)), k=.02)
    fig.add('mask', 'head', 'vL', Vk.pits(face, 5.5, .004, 18), 700, voxel=.005, uv=('front',))
    fig.add('eyes', 'head', 'teal', S.union(*[S.ellipsoid(H0 + V(x, .22, .43), (.06, .018, .04), rot(0, 0, -x * 3)) for x in (-.1, .1)]), 100, voxel=.004, glow=.5)
    fig.add('hood', 'head', 'vD', S.cut(S.ellipsoid(H0 + V(0, .25, .1), (.38, .48, .32)), S.ellipsoid(H0 + V(0, .15, .45), (.3, .38, .3)), k=.03), 700, voxel=.005, uv=('cyl', H0))
    fig.add('crown', 'head', 'vC', S.union(*[Vk.crystal(H0 + V(x, .6, .05), H0 + V(x * 1.6, 1.05 - abs(x), -.1), .05, 4, .3) for x in (-.2, -.1, 0, .1, .2)]), 250, voxel=.004, sharp=25)
    # the stern halo
    c = V(0, Y - 1.1, -1.5)
    fig.add('halo', 'halo', 'teal', S.torus(c, 1.3, .055, squash=1.0), 700, voxel=.01, uv=('top',))
    fig.add('haloinner', 'halo', 'mag', S.torus(c + V(0, -.04, 0), .9, .035), 500, voxel=.01, uv=('top',))
    # the fins
    for sx, g in ((-1, 'wingL'), (1, 'wingR')):
        root = V(sx * .8, Y + .1, 0)
        for k, (tip, w) in enumerate(((root + V(sx * 2.6, .5, -1.3), 1.2), (root + V(sx * 1.9, -.7, -1.9), .8))):
            fig.add('fin%d%s' % (k, g[-1]), g, 'vD', Vk.pits(leaf(root, tip, w, .03, up=(0, 1, .2)), 13 + k, .005, 14), 500, voxel=.007, uv=('top',))
            fig.add('finvein%d%s' % (k, g[-1]), g, 'vG', vein(root, tip, .04, .05), 200, voxel=.007)
    fig.point('launch', (0, Y + 1.6, -.6), 'body')
    return fig, (0, 0, 3.2, 7.4)


# ---------------------------------------------------------------------------------------------------------------- Cantus
def build_cantus():
    """The flagship, one to a side: a giant singer afloat on a long plated tail. Its robe is a cathedral bell of shell plates with lit
    windows, organ pipes rise up its back like a spire, both long arms are raised to conduct, its mask is wide and singing, and behind
    its head stands a great double halo marked round like a clock (Hold Time) with a slow hand."""
    fig = B.Figure('cantus', lo=(-3.6, -.1, -3.0), hi=(3.6, 8.6, 3.0), coarse=.05, detail=1.0, paint=1536, brush=2.8)
    W = 3.2   # waist height
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, W + 2.4, .2), 'body'), ('halo', (0, W + 3.0, -.9), 'head'),
                      ('armL', (-1.05, W + 1.7, .05), 'body'), ('armR', (1.05, W + 1.7, .05), 'body')):
        fig.group(g, p, par)
    # the tail, plated, sweeping back
    sw = Vk.tail_sweep(1.6, .8)
    tail = Vk.lathe([(0, 0), (.08, .2), (.22, .7), (.32, 1.2), (.36, 1.6)], sweep=sw, plates=(6, .03))
    fig.add('tail', 'body', 'vD', Vk.pits(tail, 2.2, .007, 12), 900, voxel=.012, uv=('cyl', V(0, .8, 0)))
    # the robe: a cathedral bell of plates, flaring to a lip, with lit windows round it
    pl = Vk.petals(W + .2, .9, .95, 2.4, 15, .8, .035, back=.35, wave=.3, zs=.86, belly=.42)
    fig.add('robe', 'body', 'vIp', Vk.pits(S.union(*pl[0::2]), 1.5, .007, 10), 2600, voxel=.012, uv=('cyl', V(0, 2.2, 0)), sharp=35)
    fig.add('robeunder', 'body', 'vDp', Vk.pits(S.union(*[S.moved(q, (0, .08, 0)) for q in pl[1::2]]), 2.2, .007, 10), 2200, voxel=.012, uv=('cyl', V(0, 2.2, 0)), sharp=35)
    fig.add('windows', 'body', 'vC', S.union(*[S.ellipsoid(V(np.sin(a) * 1.62, 2.0, np.cos(a) * 1.4), (.16, .38, .1), S.basis(V(np.sin(a), 0, np.cos(a)), V(0, 1, 0))) for a in np.linspace(-PI * .8, PI * .8, 7)]), 500, voxel=.008, glow=.7)
    fig.add('robeband', 'body', 'vG', Vk.ring((0, W + .2, 0), .98, .06, squash=1.15), 500, voxel=.008, uv=('cyl', V(0, W, 0)))
    # the chest: a broad lathe with an open throat and a great lit orb
    chest = Vk.lathe([(.3, W + .1), (.5, W + .3), (.95, W + .9), (1.0, W + 1.4), (.7, W + 1.9), (.3, W + 2.2)], zs=.72)
    chest = S.cut(chest, S.ellipsoid((0, W + 1.0, .7), (.4, .4, .4)), k=.04)
    chest = filigree(chest, (0, W + 1.3, 0), .95, 1.5, w=.01, depth=.01, zs=.72, y_rise=.2)
    fig.add('chest', 'body', 'vI', Vk.pits(chest, 2.6, .007, 12), 2800, voxel=.01, uv=('cyl', V(0, W + 1.1, 0)))
    fig.add('throat', 'body', 'vG', S.torus((0, W + 1.0, .62), .42, .06, rot(PI / 2 - .1, 0, 0)), 600, voxel=.008, uv=('front',))
    fig.add('orb', 'body', 'vM', S.sphere((0, W + 1.0, .4), .26), 400, voxel=.008, uv=('front',), glow=.6)
    # the pipes up its back: a spire of them, tallest in the middle
    pipes, lips = [], []
    for i, x in enumerate(np.linspace(-.9, .9, 9)):
        h = W + 5.2 - abs(x) * 2.6 + (.2 if i % 2 else 0)
        r = .14 - abs(x) * .06
        a, b = V(x * .7, W + 1.4, -.6 - abs(x) * .2), V(x * 1.5, h, -.9 - abs(x) * .4)
        pipes.append(S.cut(S.rcone(a, b, r, r * 1.05), S.rcone(b - (b - a) * .04, b + (b - a) * .05, r * .7, r * .7)))
        lips.append(S.torus(b - (b - a) * .2, r * 1.1, r * .25, S.basis((0, 0, 1), b - a)))
    fig.add('pipes', 'body', 'vG', S.union(*pipes), 2400, voxel=.01, uv=('side',))
    fig.add('pipelips', 'body', 'vD', S.union(*lips), 900, voxel=.008)
    # the head: a wide singing mask in a tall hood, a crown of crystals
    H0 = V(0, W + 2.4, .2)
    hood = Vk.lathe([(.25, 0), (.55, .2), (.6, .6), (.45, 1.0), (0, 1.25)], c=H0, zs=.95)
    hood = S.cut(hood, S.ellipsoid(H0 + V(0, .5, .45), (.42, .5, .4)), k=.04)
    fig.add('hood', 'head', 'vD', Vk.pits(hood, 4.4, .006, 14), 1200, voxel=.008, uv=('cyl', H0 + V(0, .5, 0)))
    face = S.ellipsoid(H0 + V(0, .5, .3), (.4, .48, .28))
    for x in (-.15, .15):
        face = S.cut(face, S.ellipsoid(H0 + V(x, .66, .56), (.1, .03, .06), rot(0, 0, -x * 2)), k=.01)
    face = S.cut(face, S.ellipsoid(H0 + V(0, .3, .56), (.13, .16, .1)), k=.03)        # the singing mouth, open
    fig.add('mask', 'head', 'vL', Vk.pits(face, 5.9, .005, 16), 1000, voxel=.006, uv=('front',))
    fig.add('eyes', 'head', 'teal', S.union(*[S.ellipsoid(H0 + V(x, .66, .53), (.09, .025, .05), rot(0, 0, -x * 2)) for x in (-.15, .15)]), 120, voxel=.005, glow=.6)
    fig.add('mouth', 'head', 'vM', S.ellipsoid(H0 + V(0, .3, .48), (.1, .13, .06)), 150, voxel=.005, glow=.6)
    fig.add('crown', 'head', 'vC', S.union(*[Vk.crystal(H0 + V(np.sin(a) * .45, 1.0, np.cos(a) * .4), H0 + V(np.sin(a) * .7, 1.6 - abs(a) * .2, np.cos(a) * .55), .07, 4, .3) for a in np.linspace(-1.2, 1.2, 7)]), 400, voxel=.006, sharp=25)
    # the clock halo: two rings, twelve marks, one hand
    c = V(0, W + 3.0, -.9)
    fig.add('halo', 'halo', 'teal', S.torus(c, 1.9, .07, FWD), 1000, voxel=.01, uv=('front',))
    fig.add('haloinner', 'halo', 'vG', S.torus(c + V(0, 0, .05), 1.45, .05, FWD), 800, voxel=.01, uv=('front',))
    fig.add('marks', 'halo', 'mag', S.union(*[Vk.crystal(c + V(np.cos(a) * 1.5, np.sin(a) * 1.5, .05), c + V(np.cos(a) * (2.15 if i % 3 == 0 else 1.95), np.sin(a) * (2.15 if i % 3 == 0 else 1.95), .05), .06, 4, .4) for i, a in enumerate(np.linspace(0, 2 * PI, 13)[:-1])]), 600, voxel=.008, sharp=25)
    fig.add('hand', 'halo', 'vG', S.union(S.chain([c + V(0, 0, .08), c + V(.55, 1.15, .08)], [.06, .03]), S.sphere(c + V(0, 0, .08), .1)), 200, voxel=.008)
    # the arms: long and raised, open hands up as if conducting
    for sx, g in ((-1, 'armL'), (1, 'armR')):
        Sh, El, Wr = V(sx * 1.05, W + 1.7, .05), V(sx * 1.75, W + 2.3, .35), V(sx * 1.95, W + 3.25, .5)
        fig.add('arm' + g[-1], g, 'vD', Vk.arm(Sh, El, Wr, .22, .17, .12), 900, voxel=.008, uv=('side',))
        fig.add('cuff' + g[-1], g, 'vG', Vk.vambrace(El, Wr, .15, .1, 1.4, .45, sx), 600, voxel=.008, sharp=25)
        fig.add('hand' + g[-1], g, 'vL', Vk.claw(Wr, S.basis(V(sx * .3, .3, 1), V(0, 1, .2)), .3, .3, 1.2), 600, voxel=.006)
        fig.add('pauldron' + g[-1], g, 'vI', Vk.pits(S.ellipsoid(Sh + V(sx * .05, .15, 0), (.32, .22, .3)), 7 + sx, .006, 14), 400, voxel=.008, uv=('top',))
    fig.point('muzzle', (0, W + 1.0, .7), 'body')
    return fig, (0, 0, 4.2, 8.6)


if __name__ == '__main__':
    fig, look_at = {'lyre': build_lyre, 'shard': build_shard, 'cantus': build_cantus}[KIND]()
    args = [a for a in sys.argv[1:] if a != KIND]
    png = args[0] if args and args[0].endswith('.png') else None
    only = [a for a in args if not a.endswith('.png')]
    if only:
        fig.parts = [p for p in fig.parts if any(p.name.startswith(o) or p.group == o for o in only)]
    here = __file__.rsplit('/', 1)[0]
    import os
    side = os.environ.get('OUT', here + '/../assets/mesh')
    fig.build(side + '/%s.bin' % KIND if not only else '/tmp/%s-part.bin' % KIND, here + '/out/%s.blend' % KIND if not only else None)
    if png:
        from kit import look
        c = [float(x) for x in os.environ.get('LOOK', '%g,%g,%g,%g' % look_at).split(',')]
        look.render(png, centre=(c[0], -c[1], c[2]), height=c[3], px=int(os.environ.get('PX', 640)))
