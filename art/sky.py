"""The Veyl bodies that fly: Ferry (from the Kiln), Swift, Prism and Omen (from the Skyloft).

Ferry (a long glass seed pod carried on a flat halo, six shell leaves folded down its back that open out flat into a song field),
Swift (a small swallow-tailed dart with two swept glass blades for wings), Prism (a three-sided crystal as long as a house, held in a
gold cage, two cloth sails and a lens in front for the beam), Omen (a hooded caster on moth wings, the eye marks on its wings lit,
a dark stone held between its hands for the Still Stone trap). Same kit as art/veyl.py.
Run:  python sky.py ferry|swift|prism|omen [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, veyl as Vk
from kit.sdf import V, rot
from veyl import filigree, horn

KINDS = ('ferry', 'swift', 'prism', 'omen')
KIND = next((a for a in sys.argv[1:] if a in KINDS), 'ferry')
PI = np.pi
FWD = rot(PI / 2, 0, 0)


def leaf(root, tip, w, t=.006, up=(0, 1, 0)):
    """A thin flat leaf from root to tip, `w` across, its flat face turned as close to `up` as it can be."""
    root, tip = V(root), V(tip)
    ax = (tip - root) / np.linalg.norm(tip - root)
    n = V(up) - ax * float(np.dot(V(up), ax))
    if np.linalg.norm(n) < 1e-3:
        n = V(0, 0, 1) - ax * ax[2]
    n = n / np.linalg.norm(n)
    side = np.cross(ax, n)
    R = np.stack([side, ax, n], 1)
    return S.ellipsoid((root + tip) / 2, (w / 2, float(np.linalg.norm(tip - root)) / 2, t), R)


def vein(root, tip, r=.016, lift=.02, up=(0, 1, 0)):
    root, tip = V(root), V(tip)
    return S.chain([root, (root + tip) / 2 + V(up) * lift, tip], [r, r * .7, r * .25])


# ---------------------------------------------------------------------------------------------------------------- Ferry
def build_ferry():
    """A long seed pod of pale shell, nose forward, carried on a flat halo. Gold ribs hoop it, three lit portholes a side show the
    voices it carries, a crystal keel hangs under it. Six shell leaves lie folded down its back, three a side, each on its own
    hinge: when it unfolds they swing out flat round it and the halo under it spreads into a song field."""
    Y = 2.1
    fig = B.Figure('ferry', lo=(-2.6, -.1, -2.8), hi=(2.6, 3.6, 2.8), coarse=.035, detail=1.0, paint=1536, brush=2.0)
    fig.group('body', (0, 0, 0), None)
    fig.group('head', (0, Y + .05, 2.0), 'body')
    fig.group('halo', (0, Y - .95, 0), 'body')
    hinges = []
    for i, (sx, z) in enumerate(((-1, 1.0), (1, 1.0), (-1, 0), (1, 0), (-1, -1.0), (1, -1.0))):
        h = V(sx * .5, Y + .6 - abs(z) * .1, z)
        hinges.append((sx, z, h))
        fig.group('leaf%d' % i, tuple(h), 'body')
    # the pod: fat behind the middle, drawn to a blunt nose and a long tapered stern
    pts = [V(0, Y + .25, -2.5), V(0, Y + .12, -1.8), V(0, Y, -.8), V(0, Y, .4), V(0, Y + .02, 1.4), V(0, Y + .05, 2.05)]
    rad = [.06, .38, .74, .78, .55, .22]
    pod = Vk.horn(pts, rad, plates=7, lip=.014)
    pod = S.bump(pod, lambda p: -.02 * np.clip(1 - np.abs(S.noise(p, 1.8, 7.3) - .5) * 5, 0, 1))
    fig.add('pod', 'body', 'vI', Vk.pits(pod, 3.1, .006, 12), 3400, voxel=.009, uv=('side',))
    fig.add('ribs', 'body', 'vG', S.union(*[Vk.band(pts, rad, t, .032, .012) for t in (.22, .42, .6, .78)]), 1000, voxel=.008)
    fig.add('keelband', 'body', 'vG', S.chain(Vk.curve([V(0, Y - .5, -1.6), V(0, Y - .78, -.4), V(0, Y - .74, .8), V(0, Y - .4, 1.7)], 10), [.035] * 10), 400, voxel=.008)
    # the voices inside, seen through lit portholes
    ports = []
    for sx in (-1, 1):
        for z in (-.7, .1, .9):
            r = .74 if z < .5 else .62
            ports.append(S.ellipsoid((sx * (r + .03), Y - .12, z), (.08, .15, .19)))
    fig.add('ports', 'body', 'vC', S.union(*ports), 500, voxel=.006, glow=.6, uv=('side',))
    rims = [S.torus((sx * ((.74 if z < .5 else .62) + .05), Y - .12, z), .19, .03, rot(0, 0, PI / 2), squash=1.0) for sx in (-1, 1) for z in (-.7, .1, .9)]
    fig.add('portrims', 'body', 'vG', S.union(*rims), 600, voxel=.006, uv=('side',))
    # the crystal keel: a row of shards hanging under the pod, biggest in the middle
    fig.add('keel', 'body', 'vC', S.union(*[Vk.crystal((0, Y - .6, z), (0, Y - .6 - L, z - .15), .1, 5, .3) for z, L in ((-1.2, .35), (-.4, .6), (.4, .55), (1.1, .3))]), 400, voxel=.006, sharp=25)
    # the stern: a gold spike and two trailing cords
    fig.add('stern', 'body', 'vG', Vk.crystal((0, Y + .22, -2.3), (0, Y + .4, -2.8), .07, 5, .3), 120, voxel=.006, sharp=25)
    # the prow: a small mask set in the nose, looking ahead, a fork above it
    H0 = V(0, Y + .05, 2.0)
    face = S.both(S.ellipsoid(H0 + V(0, 0, .06), (.3, .3, .16)), S.plane(H0 + V(0, 0, .02), (0, 0, -1)), k=.02)
    for sx in (-1, 1):
        face = S.cut(face, S.ellipsoid(H0 + V(sx * .11, .06, .21), (.075, .025, .06), rot(0, 0, sx * .25)), k=.01)
    fig.add('mask', 'head', 'vL', Vk.pits(face, 5.2, .004, 18), 500, voxel=.004, uv=('front',))
    fig.add('eyes', 'head', 'teal', S.union(*[S.ellipsoid(H0 + V(sx * .11, .06, .19), (.06, .02, .04), rot(0, 0, sx * .25)) for sx in (-1, 1)]), 80, voxel=.004)
    fig.add('fork', 'head', 'vG', S.union(*[horn(H0 + V(sx * .06, .16, -.04), H0 + V(sx * .14, .38, -.08), H0 + V(sx * .1, .58, -.22), .035, .008) for sx in (-1, 1)]), 300, voxel=.004, uv=('side',))
    # the halo it rides on: a broad flat ring under the pod, a magenta ring inside it
    c = V(0, Y - .95, 0)
    fig.add('halo', 'halo', 'teal', S.torus(c, 1.35, .05, squash=1.0), 700, voxel=.008, uv=('top',))
    fig.add('haloinner', 'halo', 'mag', S.torus(c + V(0, -.04, 0), .95, .03), 500, voxel=.008, uv=('top',))
    fig.add('halostays', 'halo', 'teal', S.union(*[Vk.crystal(c + V(np.sin(a) * .95, 0, np.cos(a) * .95), c + V(np.sin(a) * 1.62, .02, np.cos(a) * 1.62), .05, 4, .4) for a in np.linspace(0, 2 * PI, 7)[:-1]]), 200, voxel=.006, sharp=25)
    # the six folded leaves: each lies down the pod's flank from its hinge, the tip low, gold veined
    for i, (sx, z, h) in enumerate(hinges):
        tip = h + V(sx * .78, -.95, -.12)
        fig.add('leaf%d' % i, 'leaf%d' % i, 'vD', Vk.pits(leaf(h, tip, 1.0, .026, up=(sx, .6, 0)), 6 + i, .004, 18), 300, voxel=.005, uv=('side',))
        fig.add('leafvein%d' % i, 'leaf%d' % i, 'vG', vein(h, tip, .02, .03, up=(sx, .6, 0)), 120, voxel=.005)
        fig.add('leafgem%d' % i, 'leaf%d' % i, 'teal', S.sphere(h + V(sx * .03, .04, 0), .06), 60, voxel=.005)
    fig.point('door', (0, Y - .7, -.3), 'body')
    return fig, (0, 0, 1.8, 3.8)


# ---------------------------------------------------------------------------------------------------------------- Swift
def build_swift():
    """A small, quick dart. A narrow shell body, nose forward, a forked swallow's tail behind; two long glass blades swept back
    for wings, gold along their leading edge; a slit-eyed mask at the nose, and a ring round its waist like the wake of its speed."""
    Y = 1.7
    fig = B.Figure('swift', lo=(-2.0, -.1, -2.0), hi=(2.0, 2.6, 2.0), coarse=.02, detail=1.0, paint=1024, brush=1.2)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, Y + .02, .85), 'body'), ('halo', (0, Y, -.1), 'body'),
                      ('wingL', (-.14, Y + .04, .15), 'body'), ('wingR', (.14, Y + .04, .15), 'body')):
        fig.group(g, p, par)
    pts = [V(0, Y + .06, -1.0), V(0, Y + .02, -.6), V(0, Y, -.1), V(0, Y, .45), V(0, Y + .02, .95)]
    rad = [.03, .12, .19, .17, .07]
    body = Vk.horn(pts, rad, plates=5, lip=.01)
    fig.add('body', 'body', 'vD', Vk.pits(body, 2.7, .004, 22), 1200, voxel=.0035, uv=('side',))
    fig.add('bands', 'body', 'vG', S.union(*[Vk.band(pts, rad, t, .016, .006) for t in (.35, .62)]), 300, voxel=.003)
    fig.add('spine', 'body', 'vC', S.union(*[Vk.crystal((0, Y + .14, z), (0, Y + .32, z - .2), .04, 4, .3) for z in (-.3, 0, .28)]), 200, voxel=.003, sharp=25)
    # the swallow's tail: two long forked blades
    fig.add('tail', 'body', 'vC', S.union(*[Vk.crystal((sx * .04, Y + .04, -.85), (sx * .42, Y + .1, -1.8), .07, 4, .2) for sx in (-1, 1)]), 300, voxel=.003, sharp=25, glow=.25)
    # the mask at the nose
    H0 = V(0, Y + .02, .85)
    face = S.both(S.ellipsoid(H0 + V(0, 0, .04), (.12, .1, .14)), S.plane(H0, (0, 0, -1)), k=.015)
    face = S.cut(face, S.box(H0 + V(0, .02, .16), (.08, .01, .06)), k=.006)
    fig.add('mask', 'head', 'vL', Vk.pits(face, 4.6, .003, 22), 400, voxel=.003, uv=('front',))
    fig.add('eye', 'head', 'teal', S.box(H0 + V(0, .02, .13), (.07, .008, .03)), 60, voxel=.003)
    fig.add('crest', 'head', 'vG', horn(H0 + V(0, .08, -.02), H0 + V(0, .2, -.2), H0 + V(0, .22, -.5), .03, .006), 200, voxel=.003, uv=('side',))
    # the waist ring, standing round the body crosswise
    fig.add('halo', 'halo', 'teal', S.torus((0, Y, -.1), .38, .022, FWD), 400, voxel=.003, uv=('front',))
    fig.add('halopts', 'halo', 'mag', S.union(*[Vk.crystal(V(np.cos(a) * .36, Y + np.sin(a) * .36, -.1), V(np.cos(a) * .52, Y + np.sin(a) * .52, -.18), .03, 4, .3) for a in np.linspace(0, 2 * PI, 7)[:-1] + .26]), 160, voxel=.003, sharp=25)
    for sx, g in ((-1, 'wingL'), (1, 'wingR')):
        root = V(sx * .14, Y + .04, .15)
        for k, (tip, w) in enumerate(((root + V(sx * 1.55, .12, -.85), .36), (root + V(sx * .85, -.05, -.95), .22))):
            fig.add('blade%d%s' % (k, g[-1]), g, 'vC', leaf(root, tip, w, .008), 240, voxel=.0025, uv=('top',), glow=.3)
            fig.add('edge%d%s' % (k, g[-1]), g, 'vG', vein(root + V(0, 0, w * .35), tip + V(0, 0, .05), .02, .01), 140, voxel=.0025)
    fig.point('muzzle', (0, Y, 1.05), 'head')
    return fig, (0, 0, 1.6, 2.4)


# ---------------------------------------------------------------------------------------------------------------- Prism
def build_prism():
    """A beam ship: one long three-sided crystal lying nose forward, held in a gold cage of hoops and a spine. Two cloth sails hang
    off the spine like fins, a big lens with a gold rim sits in the nose where the beam comes out, and an upright halo stands at the
    stern. The crystal glows from inside."""
    Y = 2.4
    fig = B.Figure('prism', lo=(-2.8, -.1, -2.8), hi=(2.8, 4.4, 2.8), coarse=.035, detail=1.0, paint=1536, brush=2.0)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, Y, 1.9), 'body'), ('halo', (0, Y, -2.0), 'body'),
                      ('wingL', (-.3, Y + .7, 0), 'body'), ('wingR', (.3, Y + .7, 0), 'body')):
        fig.group(g, p, par)
    core = Vk.crystal((0, Y, -2.0), (0, Y, 2.0), .82, 3, .5, spin=PI / 2)
    fig.add('core', 'body', 'vC', core, 900, voxel=.008, sharp=25, glow=.55, uv=('side',))
    # the cage: hoops round the crystal, a spine along its top and a keel along its foot
    fig.add('hoops', 'body', 'vG', S.union(*[S.torus((0, Y, z), .7 - abs(z) * .16, .045, FWD) for z in (-1.2, -.4, .4, 1.2)]), 1400, voxel=.008, uv=('front',))
    sp = Vk.curve([V(0, Y + .62, -1.7), V(0, Y + .78, -.4), V(0, Y + .78, .6), V(0, Y + .55, 1.6)], 12)
    fig.add('spine', 'body', 'vD', Vk.pits(S.chain(sp, Vk.radii([.07, .12, .12, .08], len(sp))), 3.3, .005, 18), 600, voxel=.008, uv=('side',))
    fig.add('spines', 'body', 'vC', S.union(*[Vk.crystal(sp[i], sp[i] + V(0, .4 - abs(i - 6) * .03, -.2), .06, 4, .3) for i in (2, 4, 6, 8, 10)]), 300, voxel=.006, sharp=25)
    kl = Vk.curve([V(0, Y - .52, -1.6), V(0, Y - .62, 0), V(0, Y - .5, 1.6)], 10)
    fig.add('keel', 'body', 'vG', S.chain(kl, [.04] * len(kl)), 300, voxel=.008)
    fig.add('drop', 'body', 'vC', Vk.crystal((0, Y - .6, 0), (0, Y - 1.4, -.1), .12, 5, .3), 160, voxel=.006, sharp=25)
    # the lens in the nose
    H0 = V(0, Y, 1.9)
    fig.add('lens', 'head', 'vM', S.ellipsoid(H0 + V(0, 0, .12), (.42, .42, .14)), 500, voxel=.006, uv=('front',), glow=.5)
    fig.add('lensrim', 'head', 'vG', S.torus(H0 + V(0, 0, .12), .46, .05, FWD), 600, voxel=.006, uv=('front',))
    fig.add('lensfork', 'head', 'vG', S.union(*[horn(H0 + V(sx * .36, .3, .08), H0 + V(sx * .5, .55, .2), H0 + V(sx * .4, .82, .45), .045, .01) for sx in (-1, 1)]), 300, voxel=.005, uv=('side',))
    # the stern halo
    ringf, pts_ = Vk.halo((0, Y, -2.0), .95, .045, 8, .38, .05)
    fig.add('halo', 'halo', 'teal', ringf, 700, voxel=.008, uv=('front',))
    fig.add('halopts', 'halo', 'mag', pts_, 300, voxel=.006, sharp=25)
    # the sails: cloth hung from the spine, swept back and down like fins
    for sx, g in ((-1, 'wingL'), (1, 'wingR')):
        root = V(sx * .3, Y + .7, 0)
        for k, (tip, w) in enumerate(((root + V(sx * 1.9, -.5, -.9), .95), (root + V(sx * 1.2, -1.0, -1.3), .55))):
            fig.add('sail%d%s' % (k, g[-1]), g, 'vD', Vk.pits(leaf(root, tip, w, .016, up=(0, 1, .3)), 8 + k, .004, 16), 400, voxel=.005, uv=('top',))
            fig.add('mast%d%s' % (k, g[-1]), g, 'vG', vein(root, tip, .03, .04), 160, voxel=.005)
    fig.point('beam', (0, Y, 2.1), 'head')
    return fig, (0, 0, 2.4, 4.6)


# ---------------------------------------------------------------------------------------------------------------- Omen
def build_omen():
    """A hooded caster on moth wings. A long robe tapering to a tail, a deep hood with three slit eyes, two thin arms holding a dark
    stone between them (the Still Stone it sets down as a trap), and four broad wings, each with a lit eye mark that warns what it is."""
    Y = 1.3
    fig = B.Figure('omen', lo=(-2.4, -.1, -2.0), hi=(2.4, 3.6, 2.0), coarse=.025, detail=1.0, paint=1024, brush=1.5)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, Y + 1.25, .1), 'body'), ('halo', (0, Y + 1.5, -.3), 'head'),
                      ('armL', (-.3, Y + 1.0, .05), 'body'), ('armR', (.3, Y + 1.0, .05), 'body'), ('orb', (0, Y + .6, .55), 'body'),
                      ('wingL', (-.2, Y + 1.0, -.25), 'body'), ('wingR', (.2, Y + 1.0, -.25), 'body')):
        fig.group(g, p, par)
    sw = Vk.tail_sweep(1.0, .5)
    robe = Vk.lathe([(0, 0), (.05, .15), (.16, .5), (.3, .85), (.36, 1.05), (.3, 1.2), (.0, 1.3)], c=(0, Y - .1, 0), sweep=lambda y: sw(y - (Y - .1)), plates=(6, .02), zs=.85)
    fig.add('robe', 'body', 'vD', Vk.pits(robe, 2.9, .005, 18), 1600, voxel=.005, uv=('cyl', V(0, Y + .5, 0)))
    fig.add('belt', 'body', 'vG', Vk.ring((0, Y + .9, 0), .35, .025, squash=.85), 300, voxel=.004)
    fig.add('chestgem', 'body', 'vM', S.ellipsoid((0, Y + 1.0, .3), (.08, .1, .04)), 100, voxel=.004, glow=.5)
    # the hood and the face deep in it
    H0 = V(0, Y + 1.25, .1)
    hood = Vk.lathe([(.08, 0), (.24, .1), (.27, .3), (.2, .5), (.0, .62)], c=H0, zs=1.0)
    hood = S.moved(hood, R=rot(-.25, 0, 0), c=H0)
    hood = S.cut(hood, S.ellipsoid(H0 + V(0, .22, .26), (.17, .2, .2)), k=.03)
    fig.add('hood', 'head', 'vD', Vk.pits(hood, 4.1, .004, 20), 900, voxel=.004, uv=('cyl', H0 + V(0, .3, 0)))
    face = S.ellipsoid(H0 + V(0, .2, .1), (.13, .16, .1))
    for x, y in ((-.06, .24), (.06, .24), (0, .32)):
        face = S.cut(face, S.ellipsoid(H0 + V(x, y, .2), (.035, .012, .04)), k=.006)
    fig.add('face', 'head', 'vL', face, 400, voxel=.003, uv=('front',))
    fig.add('eyes', 'head', 'teal', S.union(*[S.ellipsoid(H0 + V(x, y, .18), (.03, .01, .03)) for x, y in ((-.06, .24), (.06, .24), (0, .32))]), 80, voxel=.003, glow=.5)
    fig.add('hoodtip', 'head', 'vG', horn(H0 + V(0, .55, -.05), H0 + V(0, .72, -.25), H0 + V(0, .7, -.55), .05, .01), 200, voxel=.004, uv=('side',))
    # a broken halo, tipped back behind the hood
    c = V(0, Y + 1.5, -.3)
    fig.add('halo', 'halo', 'mag', S.cut(S.torus(c, .45, .025, rot(PI / 2 - .4, 0, 0), squash=.7), S.box(c + V(.35, .3, 0), (.15, .15, .3))), 400, voxel=.004, uv=('front',))
    # the arms, reaching forward to hold the stone
    for sx, g in ((-1, 'armL'), (1, 'armR')):
        Sh, El, Wr = V(sx * .3, Y + 1.0, .05), V(sx * .42, Y + .7, .3), V(sx * .16, Y + .62, .52)
        fig.add('arm' + g[-1], g, 'vD', Vk.arm(Sh, El, Wr, .06, .045, .035), 400, voxel=.003, uv=('side',))
        fig.add('cuff' + g[-1], g, 'vG', Vk.vambrace(El, Wr, .055, .04, 1.4, .16, sx), 300, voxel=.003, sharp=25)
        fig.add('hand' + g[-1], g, 'vL', Vk.claw(Wr, S.basis(V(-sx, 0, .3), V(0, -1, .4)), .1, .6), 300, voxel=.0025)
    stone = S.box((0, Y + .6, .55), (.11, .11, .11), .03, rot(.6, .6, .3))
    fig.add('stone', 'orb', 'vD', Vk.pits(stone, 9.1, .006, 30), 200, voxel=.003)
    fig.add('stoneglow', 'orb', 'teal', S.union(*[S.box((0, Y + .6, .55), (.125, .012, .125), 0, rot(.6, .6, .3))]), 120, voxel=.003, glow=.6)
    # the moth wings: two pairs, broad and rounded, each upper wing with a lit eye mark
    for sx, g in ((-1, 'wingL'), (1, 'wingR')):
        root = V(sx * .2, Y + 1.0, -.25)
        for k, (tip, w) in enumerate(((root + V(sx * 1.6, .7, -.5), .9), (root + V(sx * 1.15, -.6, -.55), .6))):
            fig.add('wing%d%s' % (k, g[-1]), g, 'vD', Vk.pits(leaf(root, tip, w, .012, up=(0, .2, 1)), 11 + k, .004, 18), 400, voxel=.004, uv=('front',))
            fig.add('wvein%d%s' % (k, g[-1]), g, 'vG', vein(root, tip, .02, .02, up=(0, .2, 1)), 140, voxel=.003)
            if k == 0:
                c2 = root + (tip - root) * .62
                fig.add('wingeye' + g[-1], g, 'mag', S.ellipsoid(c2 + V(0, 0, .02), (.16, .16, .03), rot(0, 0, sx * .5)), 160, voxel=.003, glow=.6)
                fig.add('wingeye2' + g[-1], g, 'teal', S.ellipsoid(c2 + V(0, 0, -.02), (.16, .16, .03), rot(0, 0, sx * .5)), 160, voxel=.003, glow=.4)
    fig.point('beam', (0, Y + .6, .7), 'orb')
    return fig, (0, 0, 1.9, 3.4)


if __name__ == '__main__':
    fig, look_at = {'ferry': build_ferry, 'swift': build_swift, 'prism': build_prism, 'omen': build_omen}[KIND]()
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
