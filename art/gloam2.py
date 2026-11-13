"""The Gloam, second brood: the bodies the full-depth roster adds (stream G, 2026-11-13).

Batch 1, the shell line and the keeper:
  keeper     the Bud keeper. Stands tall on four stout legs under a hood of coral gills, a brood of Buds slung under its rump,
             two thin feeding arms in front with glowing mending glands at the tips. Spits from a tube mouth.
  shellback  the armoured spitter. A pill-bug back of ivory bands on six short legs; a puckered spit mouth under a bone brow.
  lobber     a Shellback ripened: bigger, the back split open down the middle and a great bile sac grown up out of it with a
             bone vent at the top, braced on wide legs to throw.
  needler    a Quillback ripened: long and low, a bone drill for a snout, spade claws to dig, and a crest of long spines along
             the back that it lays forward and fires when dug in. Dug in, only the crest shows.
Same kit, same skins and the same painted Gloam brush as art/gloam.py.
Run:  python gloam2.py <kind> [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, gloam as G
from kit.sdf import V, rot

KINDS = ('keeper', 'shellback', 'lobber', 'needler', 'digmound', 'smother', 'seeder', 'husk', 'pup')
KIND = next((a for a in sys.argv[1:] if a in KINDS), 'keeper')
PI = np.pi


def build_keeper():
    fig = B.Figure('keeper', lo=(-1.6, -.1, -1.9), hi=(1.6, 3.0, 1.7), paint=1024, brush=1.25)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, 1.98, .46), 'body')
    fig.group('brood', (0, .78, -.62), 'body')
    for sx, g in ((-1, 'armL'), (1, 'armR')):
        fig.group(g, (sx * .2, 1.5, .5), 'body')
    G.add_legs(fig, [(.22, .62, .38, .3), (-.5, .66, -.36, .32)], .1, .82, thorn=.14)
    # the rump: a heavy pear low behind, and a thick upright trunk rising off it to the shoulders
    rump = S.ellipsoid((0, 1.0, -.52), (.5, .42, .64), rot(.12, 0, 0))
    trunk = S.chain([V(0, 1.0, -.08), V(0, 1.36, .22), V(0, 1.72, .38), V(0, 1.92, .42)], [.4, .34, .26, .2])
    body = S.union(rump, S.squash(trunk, (.95, 1, 1)), k=.16)
    body = S.bump(body, lambda p: .014 * np.sin(p[..., 1] * 26 + p[..., 2] * 9) * np.clip(p[..., 2] * 3 + .6, 0, 1))      # creased where it bends upright
    fig.add('hide', 'body', 'gH', G.hide(body, 21.1, .02, 7), 2300, voxel=.005, uv=('cyl', V(0, 1.2, -.1)))
    belly = G.ribbed(S.union(S.ellipsoid((0, .84, -.4), (.4, .26, .52)), S.chain([V(0, 1.1, .3), V(0, 1.68, .54)], [.2, .14]), k=.08), 0, 34, .009, 1)
    fig.add('belly', 'body', 'gV', belly, 700, voxel=.005, uv=('front',))
    fig.add('plates', 'body', 'gBc', G.back_plates((0, 1.42, -.18), (0, 1.12, -1.02), 4, .62), 1000, voxel=.004, uv=('top',))
    caps, gills = [], []
    for (x, y, z, r, tl, sd) in ((.12, 1.62, .02, .17, (-.4, 0, -.4), 2.0), (-.14, 1.5, -.1, .14, (-.3, 0, .5), 3.0), (.04, 1.38, -.32, .12, (-.6, 0, .1), 4.0)):
        c, g = G.mushroom((x, y, z), r, r * .9, tl, 1.0, sd)
        caps.append(c)
        gills.append(g)
    fig.add('backcaps', 'body', 'gC', S.union(*caps), 700, voxel=.0035, uv=('top',))
    fig.add('backgills', 'body', 'gGb', S.union(*gills), 300, voxel=.0035, uv=('top',))
    # the hood: a great fan of coral gill ribs stood up behind the head, edged with teal cap flesh, so it reads from across the map
    R = rot(-.3, 0, 0)
    HC = V(0, 1.66, .2)
    disc = S.ellipsoid(HC, (.86, .86, .1), R)
    disc = S.cut(disc, S.ellipsoid(HC + R @ V(0, 0, .9), (1.1, 1.1, .92), R), k=.02)                               # dished, so it cups the head
    disc = S.both(disc, S.plane(HC + V(0, -.06, 0), (0, -1, 0)), k=.04)                                              # only the top half
    disc = S.bump(disc, lambda p: .018 * np.clip(np.cos(np.arctan2(p[..., 0], p[..., 1] - HC[1]) * 9), 0, 1) * np.clip(np.hypot(p[..., 0], p[..., 1] - HC[1]) * 2 - .5, 0, 1))   # ribbed like a fan
    disc = S.bump(disc, lambda p: .03 * np.sin(np.arctan2(p[..., 0], p[..., 1] - HC[1]) * 7) * np.clip(np.hypot(p[..., 0], p[..., 1] - HC[1]) * 3 - 2, 0, 1))                # the lip wanders
    back = S.both(disc, S.plane(HC + R @ V(0, 0, -.015), R @ V(0, 0, 1)))
    front = S.both(disc, S.plane(HC + R @ V(0, 0, -.015), R @ V(0, 0, -1)))
    gl = S.bump(front, lambda p: .012 * np.sin(np.arctan2(p[..., 0], p[..., 1] - HC[1]) * 40))                        # fine gill lines on the face of it
    fig.add('hood', 'body', 'gC', back, 1600, voxel=.0035, uv=('front',))
    fig.add('hoodgills', 'body', 'gG', gl, 1400, voxel=.0035, uv=('front',))
    # the brood: Buds slung in a pouch of hide under the rump, glowing through
    pouch = S.cut(S.ellipsoid((0, .76, -.62), (.42, .3, .46)), S.below(.66))
    pouch = S.union(pouch, S.ellipsoid((0, .66, -.62), (.36, .1, .4)), k=.05)
    fig.add('pouch', 'brood', 'gD', G.hide(pouch, 22.4, .01, 10), 700, voxel=.004, uv=('cyl', V(0, .7, -.62)))
    pods, leaves = [], []
    for (x, z, r, sd) in ((.24, -.48, .14, .3), (-.22, -.52, .13, 1.4), (.02, -.86, .15, 2.2), (-.26, -.82, .11, 3.1), (.28, -.82, .11, 4.0), (0, -.34, .1, 5.0)):
        p, l = G.bud(V(x, .58 - r * .4, z), r, sd)
        pods.append(p)
        leaves.append(l)
    fig.add('buds', 'brood', 'gS', S.union(*pods), 900, voxel=.0035, uv=('cyl', V(0, .5, -.62)), glow=.5)
    fig.add('budleaves', 'brood', 'gH', S.union(*leaves), 600, voxel=.0032, uv=('top',))
    # the head: broad and low under the hood, four eyes, a tube mouth that spits
    H0 = V(0, 1.98, .46)
    head = S.union(S.ellipsoid(H0 + V(0, 0, .06), (.2, .15, .19)), S.ellipsoid(H0 + V(0, .07, -.04), (.16, .1, .14)), k=.05)
    for sx in (-1, 1):
        head = S.cut(head, S.sphere(H0 + V(sx * .12, .06, .2), .05), S.sphere(H0 + V(sx * .1, .13, .13), .032), k=.01)
    tube = S.chain([H0 + V(0, -.07, .16), H0 + V(0, -.12, .28), H0 + V(0, -.12, .38)], [.085, .07, .062])
    tube = S.cut(tube, S.cyl(H0 + V(0, -.12, .3), H0 + V(0, -.12, .44), .035))
    head = S.union(head, tube, k=.04)
    fig.add('head', 'head', 'gHn', G.hide(head, 23.3, .008, 15), 1000, voxel=.003, uv=('cyl', H0 + V(0, 0, .1), (0, 0, 1)))
    fig.add('lips', 'head', 'gB', S.union(*[S.torus(H0 + V(0, -.12, z), .066 - (z - .3) * .1, .016, rot(PI / 2, 0, 0)) for z in (.3, .37)]), 220, voxel=.0028)
    fig.add('eyes', 'head', 'gEye', S.union(G.eyes([H0 + V(sx * .12, .06, .19) for sx in (-1, 1)], .045, .5), G.eyes([H0 + V(sx * .1, .13, .12) for sx in (-1, 1)], .028, .7)), 180, voxel=.0025, uv=('front',))
    brow = S.cut(S.ellipsoid(H0 + V(0, .12, .06), (.22, .08, .19), rot(-.45, 0, 0)), S.ellipsoid(H0 + V(0, .08, .07), (.2, .08, .18), rot(-.45, 0, 0)))
    fig.add('brow', 'head', 'gBc', brow, 300, voxel=.003, uv=('top',))
    fig.point('muzzle', H0 + V(0, -.12, .45), 'head')
    # the feeding arms, hanging forward from under the hood: three-jointed, with a glowing mending gland and a bone hook at each tip
    for sx, g in ((-1, 'armL'), (1, 'armR')):
        A = V(sx * .2, 1.5, .5)
        a, wr = G.arm(A, A + V(sx * .16, -.3, .2), A + V(sx * .06, -.6, .36), .055, sx)
        fig.add('arm' + g[3], g, 'gD', a, 500, voxel=.003, uv=('cyl', A + V(sx * .1, -.3, .2), (0, -1, .5)))
        fig.add('gland' + g[3], g, 'gS', S.ellipsoid(wr + V(0, -.05, .03), (.06, .075, .06)), 140, voxel=.0028, glow=.6)
        fig.add('hook' + g[3], g, 'gBn', S.union(G.spine(wr + V(-sx * .03, -.02, .05), (-sx * .3, -.5, 1), .12, .022), G.spine(wr + V(sx * .03, -.03, .04), (sx * .4, -.7, .8), .1, .02)), 120, voxel=.0025)
    return fig, (0, 0, 1.3, 3.4)


def shell_body(fig, s, split=False):
    """The Shellback's hull at size s, shared with the Lobber. split leaves the top bands open down the middle for the sac."""
    Y = .56 * s
    back = G.bands(.6 * s, -.68 * s, 7, .62 * s, .36 * s, Y, lap=1.6, ridge=.045 * s)
    if split:
        back = S.cut(back, S.ellipsoid((0, Y + .38 * s, -.1 * s), (.28 * s, .26 * s, .6 * s)), k=.04 * s)
    back = S.bump(back, lambda p: .02 * s * np.clip((S.noise(p, 7 / s, 31.3) - .6) * 5, 0, 1))                       # nicks and scars on the lapped edges
    fig.add('shell', 'body', 'gBc', back, 3400, voxel=.0045 * s, uv=('top',))
    skirt = S.both(S.ellipsoid((0, Y - .04 * s, -.04 * s), (.66 * s, .2 * s, .8 * s)), S.below(Y + .06 * s))
    fig.add('skirt', 'body', 'gH', G.hide(skirt, 32.2, .014 * s, 8 / s), 1100, voxel=.0045 * s, uv=('cyl', V(0, Y, 0), (0, 0, 1)))
    belly = G.ribbed(S.ellipsoid((0, Y - .14 * s, 0), (.48 * s, .18 * s, .7 * s)), 0, 30 / s, .008 * s)
    fig.add('belly', 'body', 'gV', belly, 600, voxel=.0045 * s, uv=('side',))
    moss = []
    for (x, z, r) in ((.36, .3, .16), (-.4, -.1, .18), (.2, -.48, .14), (-.18, .44, .12)):                            # moss and lichen grown over the bands
        p = V(x * s, Y + .3 * s * np.sqrt(max(0, 1 - (x / .7) ** 2 - (z / .78) ** 2)), z * s)
        moss.append(S.ellipsoid(p, (r * s, .05 * s, r * s * .9)))
    fig.add('moss', 'body', 'gD', S.bump(S.union(*moss, k=.03 * s), lambda p: .02 * s * (S.noise(p, 24 / s, 3.3) - .5)), 600, voxel=.004 * s, uv=('top',))
    return Y


def build_shellback():
    s = 1.0
    fig = B.Figure('shellback', lo=(-1.3, -.1, -1.4), hi=(1.3, 1.6, 1.5), paint=1024, brush=1.15)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, .5, .74), 'body', scale=1.3)
    G.add_legs(fig, [(.38, .4, .26, .36), (0, .46, 0, .42), (-.38, .42, -.26, .36)], .075, .42, detail=.9)
    Y = shell_body(fig, s)
    vents = S.union(*[S.torus(V(x, Y + .33, z), .05, .02, rot(-.2, 0, 0)) for x, z in ((.12, .1), (-.14, -.18), (.04, -.4))])
    fig.add('vents', 'body', 'gS', vents, 220, voxel=.003, glow=.55)
    H0 = V(0, .5, .74)
    head = S.ellipsoid(H0 + V(0, 0, .02), (.22, .15, .18))
    mouth = S.chain([H0 + V(0, -.04, .12), H0 + V(0, -.06, .24)], [.1, .085])
    mouth = S.cut(mouth, S.cyl(H0 + V(0, -.06, .18), H0 + V(0, -.06, .3), .042))
    head = S.union(head, mouth, k=.04)
    head = S.bump(head, lambda p: .006 * np.sin(np.arctan2(p[..., 0] - H0[0], p[..., 1] - H0[1] + .06) * 14) * np.clip((p[..., 2] - H0[2] - .14) * 20, 0, 1))   # puckered round the mouth
    fig.add('head', 'head', 'gHn', G.hide(head, 33.4, .008, 14), 800, voxel=.003, uv=('cyl', H0, (0, 0, 1)))
    brow = S.cut(S.ellipsoid(H0 + V(0, .1, -.02), (.3, .1, .26), rot(-.35, 0, 0)), S.ellipsoid(H0 + V(0, .05, .0), (.28, .1, .24), rot(-.35, 0, 0)))
    brow = S.union(brow, *[G.spine(H0 + V(sx * .2, .1, .1), (sx * .6, .2, 1), .14, .03) for sx in (-1, 1)], k=.01)
    fig.add('brow', 'head', 'gBc', brow, 500, voxel=.003, uv=('top',))
    stalks = S.union(*[S.chain([H0 + V(sx * .1, .06, .12), H0 + V(sx * .16, .16, .18)], [.025, .02]) for sx in (-1, 1)])
    fig.add('stalks', 'head', 'gD', stalks, 120, voxel=.0025)
    fig.add('eyes', 'head', 'gEye', G.eyes([H0 + V(sx * .17, .18, .2) for sx in (-1, 1)], .04, .6), 120, voxel=.0025, uv=('front',))
    fig.add('lip', 'head', 'gS', S.torus(H0 + V(0, -.06, .26), .06, .018, rot(PI / 2, 0, 0)), 100, voxel=.0025, glow=.6)
    fig.point('muzzle', H0 + V(0, -.06, .32), 'head')
    return fig, (0, 0, .6, 2.6)


def build_lobber():
    s = 1.3
    fig = B.Figure('lobber', lo=(-1.8, -.1, -1.8), hi=(1.8, 2.9, 1.9), paint=1024, brush=1.4)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, .66, .92), 'body')
    fig.group('halo', (0, 1.25, -.1), 'body')
    G.add_legs(fig, [(.5, .62, .44, .46), (0, .7, .02, .54), (-.5, .64, -.4, .48)], .1, .56, thorn=.16, detail=1.0)
    Y = shell_body(fig, s, split=True)
    # the bile sac, grown up out of the split back: a lumpy balloon on a neck, a bone vent at the top tipped forward
    C = V(0, 1.42, -.14)
    sac = S.union(S.ellipsoid(C, (.5, .56, .58)), S.ellipsoid(C + V(0, -.42, .04), (.32, .3, .4)), k=.18)
    sac = S.union(sac, S.rcone(C + V(0, .42, .1), C + V(0, .78, .3), .22, .13), k=.12)
    sac = S.bump(sac, lambda p: .025 * (S.noise(p, 4.5, 41.1) - .5) + .02 * np.clip((S.noise(p, 9, 4.7) - .62) * 5, 0, 1))
    fig.add('sac', 'halo', 'gS', sac, 1600, voxel=.005, uv=('cyl', C), glow=.46)
    veins = []
    for i in range(6):
        a = i / 6 * 2 * PI + .4
        pts = [S.skin(sac, C, V(np.cos(a) * np.sin(t), np.cos(t), np.sin(a) * np.sin(t)), tmax=.9, n=300, out=.004) for t in np.linspace(.5, 2.4, 8)]
        veins.append(S.chain(pts, list(np.linspace(.026, .016, 8))))
    fig.add('veins', 'halo', 'gD', S.union(*veins), 700, voxel=.0035)
    vent = S.union(S.torus(C + V(0, .8, .32), .14, .045, rot(.5, 0, 0)), *[G.spine(C + V(np.cos(a) * .15, .82 + np.sin(a) * .05, .32 + np.sin(a) * .1), (np.cos(a) * .6, 1, .5), .14, .03) for a in np.linspace(0, 2 * PI, 7)[:-1]], k=.02)
    fig.add('vent', 'halo', 'gB', vent, 500, voxel=.003)
    fig.add('ventglow', 'halo', 'gS', S.ellipsoid(C + V(0, .79, .31), (.1, .03, .1), rot(.5, 0, 0)), 80, voxel=.003, glow=.9)
    lips = []
    for sx in (-1, 1):                                                                                             # the torn edges of the back, folded out round the sac
        lips.append(S.ellipsoid(V(sx * .3, Y + .36 * s * .9, -.1 * s), (.1, .1, .6 * s), rot(0, 0, sx * .5)))
    fig.add('splitlips', 'body', 'gHn', G.hide(S.union(*lips), 42.2, .016, 10), 500, voxel=.004, uv=('side',))
    fig.point('muzzle', C + V(0, .86, .38), 'halo')
    H0 = V(0, .66, .92)
    head = S.union(S.ellipsoid(H0 + V(0, 0, .04), (.28, .2, .24)), S.ellipsoid(H0 + V(0, -.1, .18), (.2, .1, .16)), k=.06)
    for sx in (-1, 1):
        head = S.cut(head, S.sphere(H0 + V(sx * .18, .08, .22), .055), k=.012)
    fig.add('head', 'head', 'gHn', G.hide(head, 43.4, .01, 12), 900, voxel=.0035, uv=('cyl', H0, (0, 0, 1)))
    brow = S.cut(S.ellipsoid(H0 + V(0, .14, -.02), (.38, .13, .32), rot(-.35, 0, 0)), S.ellipsoid(H0 + V(0, .08, .0), (.36, .13, .3), rot(-.35, 0, 0)))
    brow = S.union(brow, *[G.spine(H0 + V(sx * .26, .14, .12), (sx * .7, .3, 1), .22, .045) for sx in (-1, 1)], G.spine(H0 + V(0, .24, -.1), (0, .7, -1), .2, .05), k=.012)
    fig.add('brow', 'head', 'gBc', brow, 600, voxel=.0035, uv=('top',))
    lip, maw, teeth = G.jaw(H0 + V(0, -.14, .22), .36, .3, 7, 1, 2.3)
    fig.add('jaw', 'head', 'gHn', lip, 300, voxel=.003, uv=('top',))
    fig.add('maw', 'head', 'gMaw', maw, 100, voxel=.003, uv=('top',))
    fig.add('teeth', 'head', 'gBn', teeth, 300, voxel=.0025)
    fig.add('eyes', 'head', 'gEye', G.eyes([H0 + V(sx * .18, .08, .22) for sx in (-1, 1)], .05, .5), 140, voxel=.0028, uv=('front',))
    return fig, (0, 0, 1.2, 3.6)


def build_needler():
    fig = B.Figure('needler', lo=(-1.6, -.1, -2.2), hi=(1.6, 2.4, 2.0), paint=1024, brush=1.3)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, .58, 1.0), 'body')
    fig.group('arms', (0, .9, -.1), 'body')                                                                         # the crest: tips forward to fire
    G.add_legs(fig, [(.62, .5, .3, .28), (.05, .46, .02, .3), (-.55, .42, -.28, .26)], .085, .5, detail=.9)
    spinep = [V(0, .62, .9), V(0, .7, .5), V(0, .72, 0), V(0, .66, -.5), V(0, .56, -.98), V(0, .42, -1.42), V(0, .32, -1.8)]
    body = S.squash(S.chain(spinep, [.26, .34, .36, .32, .24, .14, .05]), (1.08, .9, 1))
    body = S.bump(body, lambda p: .016 * np.sin(p[..., 2] * 16) * np.clip((p[..., 1] - .5) * 6, 0, 1))                 # segmented like a grub
    fig.add('hide', 'body', 'gH', G.hide(body, 51.1, .018, 8), 2200, voxel=.0045, uv=('cyl', V(0, .62, -.3), (0, 0, 1)))
    belly = G.ribbed(S.squash(S.chain([V(0, .46, .8), V(0, .44, 0), V(0, .38, -.9)], [.18, .22, .14]), (1.1, .8, 1)), 0, 30, .008)
    fig.add('belly', 'body', 'gV', belly, 600, voxel=.0045, uv=('side',))
    fig.add('plates', 'body', 'gBc', G.back_plates((0, 1.0, .7), (0, .8, -1.2), 6, .56), 1400, voxel=.0035, uv=('top',))
    # the crest: two rows of long spines laid back along the spine, longest over the shoulders, set in a bed of coral gill
    q, beds = [], []
    for row, sx in ((0, -1), (1, 1)):
        for i in range(8):
            t = i / 7
            z = .55 - t * 1.45
            ln = (1.5 - abs(t - .3) * 1.1) * (.92 if row else 1)
            base = V(sx * .1, .98 - t * .22 + .02 * row, z)
            d = rot(-1.05 - t * .2, 0, sx * .22) @ V(0, 1, 0)
            q.append(G.spine(base, d, ln, .045, .04))
            beds.append(S.ellipsoid(base, (.06, .05, .09)))
    fig.add('crest', 'arms', 'gBn', S.union(*q), 1600, voxel=.0035, uv=('side',))
    fig.add('crestbed', 'arms', 'gG', S.union(*beds, k=.03), 500, voxel=.0035, uv=('top',))
    fig.add('crestglow', 'arms', 'gS', S.union(*[S.sphere(V(sx * .13, .93 - t * .22, .5 - t * 1.4), .035) for sx in (-1, 1) for t in (.1, .4, .7)]), 160, voxel=.003, glow=.6)
    fig.point('muzzle', V(0, 1.3, .9), 'arms')
    # the head: a bone drill for burrowing, grooved in a spiral, two small eyes set back, spade claws either side of the jaw
    H0 = V(0, .58, 1.0)
    head = S.ellipsoid(H0 + V(0, 0, .02), (.24, .2, .22))
    fig.add('head', 'head', 'gHn', G.hide(head, 52.4, .01, 12), 700, voxel=.0032, uv=('cyl', H0, (0, 0, 1)))
    drill = S.rcone(H0 + V(0, -.02, .12), H0 + V(0, -.06, .62), .2, .02)
    drill = S.bump(drill, lambda p: .016 * np.sin(np.arctan2(p[..., 0] - H0[0], p[..., 1] - H0[1]) * 3 + p[..., 2] * 40))   # spiral flutes
    fig.add('drill', 'head', 'gBc', drill, 800, voxel=.003, uv=('cyl', H0 + V(0, -.04, .4), (0, 0, 1)))
    fig.add('drillring', 'head', 'gD', S.torus(H0 + V(0, -.02, .14), .19, .035, rot(PI / 2, 0, 0)), 200, voxel=.003)
    fig.add('eyes', 'head', 'gEye', G.eyes([H0 + V(sx * .18, .1, .08) for sx in (-1, 1)], .035, .9), 100, voxel=.0025, uv=('front',))
    fig.add('spades', 'head', 'gB', S.union(*[G.spade(H0 + V(sx * .2, -.12, .08), (sx * .45, -.35, 1), .1, .36, sx) for sx in (-1, 1)]), 600, voxel=.003, uv=('side',))
    return fig, (0, 0, .9, 3.8)


def build_digmound():
    """What a dug-in Gloam body leaves on the ground, one metre across (the game scales it to the body). 'ring' is the churned earth round the hole,
    always shown; 'hump' closes over the top when nothing of the body shows, with a breathing slit that glows a little so its owner can find it.
    It wears the game's shared skins, not a painted picture: the clods take the map's own rock colour."""
    fig = B.Figure('digmound', lo=(-1.4, -.2, -1.4), hi=(1.4, .8, 1.4))
    fig.group('ring', (0, 0, 0))
    fig.group('hump', (0, 0, 0))
    clods = []
    rs = np.random.RandomState(7)
    for i in range(16):
        a = i / 16 * 2 * PI + rs.uniform(-.15, .15)
        d = .86 + rs.uniform(-.08, .1)
        r = rs.uniform(.12, .2)
        clods.append(S.ellipsoid((np.cos(a) * d, r * .3, np.sin(a) * d), (r, r * .7, r * 1.1), rot(rs.uniform(-.3, .3), -a, rs.uniform(-.3, .3))))
    for i in range(10):
        a, d, r = rs.uniform(0, 2 * PI), rs.uniform(1.0, 1.25), rs.uniform(.04, .08)
        clods.append(S.sphere((np.cos(a) * d, r * .2, np.sin(a) * d), r))
    lip = S.both(S.torus((0, -.02, 0), .8, .16, squash=.7), S.above(0))
    ring = S.union(lip, *clods, k=.05)
    ring = S.bump(ring, lambda p: .03 * (S.noise(p, 9, 2.2) - .5))
    fig.add('clods', 'ring', 'rock', S.both(ring, S.above(-.02)), 900, voxel=.008, uv=('top',))
    roots = []
    for i in range(5):
        a = i / 5 * 2 * PI + .5
        pts = [V(np.cos(a) * .7, -.05, np.sin(a) * .7), V(np.cos(a + .2) * 1.05, .14, np.sin(a + .2) * 1.05), V(np.cos(a + .35) * 1.3, -.05, np.sin(a + .35) * 1.3)]
        roots.append(S.chain(S.bez(*pts, 5), list(np.linspace(.05, .015, 6))))
    fig.add('roots', 'ring', 'gD', S.both(S.union(*roots), S.above(-.02)), 400, voxel=.006)
    hump = S.both(S.ellipsoid((0, 0, 0), (.82, .36, .82)), S.above(-.02))
    hump = S.cut(hump, S.ellipsoid((0, .36, .1), (.3, .05, .06)), k=.03)                                            # the breathing slit
    hump = S.bump(hump, lambda p: .04 * (S.noise(p, 5, 3.1) - .5) + .025 * np.clip((S.noise(p, 12, 8.8) - .6) * 5, 0, 1))
    fig.add('soil', 'hump', 'rock', hump, 900, voxel=.008, uv=('top',))
    moss = S.both(S.union(*[S.ellipsoid((x, .3 - abs(x) * .3, z), (.22, .07, .18)) for x, z in ((-.3, -.2), (.25, -.3), (.1, .35))], k=.05), S.above(.05))
    fig.add('moss', 'hump', 'gH', moss, 300, voxel=.006, uv=('top',))
    fig.add('slit', 'hump', 'gS', S.ellipsoid((0, .325, .1), (.24, .02, .035)), 80, voxel=.005, glow=.5)
    return fig, (0, 0, .2, 2.6)


def build_smother():
    """The caster: a great soft puffball carried high on four stilt legs, a lace veil hanging round it, a long feeling snout under it.
    Its pores glow where the spores come out; it squeezes the ball (halo) to cast."""
    fig = B.Figure('smother', lo=(-1.6, -.1, -1.6), hi=(1.6, 3.1, 1.6), paint=1024, brush=1.2)
    fig.group('body', (0, 0, 0))
    fig.group('halo', (0, 2.0, -.05), 'body')
    fig.group('head', (0, 1.5, .3), 'body')
    G.add_legs(fig, [(.28, .55, .34, .2), (-.3, .55, -.36, .2)], .06, 1.3, detail=.9)
    hub = S.union(S.ellipsoid((0, 1.4, 0), (.3, .22, .34)), S.chain([V(0, 1.4, 0), V(0, 1.7, -.02)], [.2, .24]), k=.08)
    fig.add('hub', 'body', 'gH', G.hide(hub, 61.1, .012, 10), 700, voxel=.004, uv=('cyl', V(0, 1.5, 0)))
    C = V(0, 2.0, -.05)
    ball = S.ellipsoid(C, (.72, .62, .72))
    ball = S.bump(ball, lambda p: .03 * np.sin(np.arctan2(p[..., 0] - C[0], p[..., 2] - C[2]) * 8) * np.clip((p[..., 1] - C[1]) * 2 + 1, 0, 1) + .02 * (S.noise(p, 6, 2.3) - .5))
    pores = [C + V(np.cos(a) * np.sin(b), np.cos(b), np.sin(a) * np.sin(b)) * .66 for a, b in ((.3, .6), (1.6, .9), (2.8, .5), (4.0, .8), (5.2, .6), (.9, 1.3), (2.2, 1.4), (3.5, 1.2), (4.8, 1.4), (0, 0.05))]
    ball = S.cut(ball, *[S.sphere(q, .075) for q in pores], k=.03)
    fig.add('ball', 'halo', 'gC', ball, 2200, voxel=.005, uv=('top',))
    fig.add('pores', 'halo', 'gS', S.union(*[S.sphere(q - (q - C) * .04, .06) for q in pores]), 400, voxel=.004, glow=.7)
    veil = S.shell(S.ellipsoid(C + V(0, -.32, 0), (.7, .72, .7)), .018)                                              # a lace skirt hanging from under the ball
    veil = S.both(veil, S.below(C[1] - .3))
    veil = S.both(veil, S.above(C[1] - 1.0))
    def holes(p):
        a = np.arctan2(p[..., 0] - C[0], p[..., 2] - C[2]) * 7
        y = (p[..., 1] - C[1]) * 14
        return np.minimum(np.abs(np.sin(a + np.floor(y) * 1.57)), np.abs(np.sin(y * 1.57)))
    veil = S.cut(veil, lambda p: .03 - holes(p) * .08)
    fig.add('veil', 'halo', 'gV', veil, 2000, voxel=.004, uv=('cyl', C + V(0, -.6, 0)))
    H0 = V(0, 1.5, .3)
    head = S.ellipsoid(H0 + V(0, 0, .04), (.16, .13, .16))
    snout = S.chain(S.bez(H0 + V(0, -.04, .14), H0 + V(0, -.22, .38), H0 + V(0, -.5, .46), 5), list(np.linspace(.07, .025, 6)))
    snout = S.bump(snout, lambda p: .006 * np.sin(p[..., 1] * 90))
    fig.add('head', 'head', 'gHn', G.hide(S.union(head, snout, k=.04), 62.4, .006, 16), 700, voxel=.003, uv=('cyl', H0, (0, 0, 1)))
    fig.add('feelers', 'head', 'gS', S.union(*[S.sphere(H0 + V(sx * .03, -.52, .46), .03) for sx in (-1, 1)]), 80, voxel=.0025, glow=.6)
    fig.add('eyes', 'head', 'gEye', G.eyes([H0 + V(sx * .11, .06, .12) for sx in (-1, 1)], .03, .7), 80, voxel=.0025, uv=('front',))
    fig.point('muzzle', C + V(0, .64, 0), 'halo')
    return fig, (0, 0, 1.5, 3.4)


def build_seeder():
    """The thrower: a squat wide body dug in on six legs, a pouch of Husks on its back and a long bone sling curled over it that flings them."""
    fig = B.Figure('seeder', lo=(-1.8, -.1, -2.0), hi=(1.8, 3.0, 1.9), paint=1024, brush=1.4)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, .62, 1.0), 'body')
    fig.group('arms', (0, 1.0, -.7), 'body')                                                                        # the sling: swings forward over the back to throw
    fig.group('pack', (0, 1.1, -.1), 'body')
    G.add_legs(fig, [(.55, .62, .36, .5), (0, .7, 0, .58), (-.55, .62, -.34, .5)], .1, .52, thorn=.14)
    body = S.union(S.ellipsoid((0, .74, 0), (.78, .42, 1.0)), S.ellipsoid((0, .66, .66), (.5, .32, .44)), k=.18)
    body = S.bump(body, lambda p: .02 * np.sin(p[..., 2] * 12) * np.clip((p[..., 1] - .7) * 4, 0, 1))
    fig.add('hide', 'body', 'gH', G.hide(body, 71.1, .024, 6), 2200, voxel=.0055, uv=('cyl', V(0, .7, 0), (0, 0, 1)))
    fig.add('belly', 'body', 'gV', G.ribbed(S.ellipsoid((0, .5, 0), (.66, .22, .9)), 0, 22, .01), 600, voxel=.0055, uv=('side',))
    fig.add('plates', 'body', 'gBc', G.back_plates((0, 1.08, .78), (0, 1.0, -.8), 5, .9), 1400, voxel=.0045, uv=('top',))
    pods, leaves = [], []
    for (x, z, r, sd) in ((.28, .1, .2, .1), (-.26, .02, .19, 1.1), (0, -.3, .22, 2.1), (.3, -.36, .16, 3.1), (-.3, -.4, .17, 4.1)):
        q, l = G.bud(V(x, 1.12, z), r, sd)
        pods.append(S.bump(q, lambda p: .01 * np.sin(p[..., 1] * 60)))
        leaves.append(l)
    fig.add('husks', 'pack', 'gB', S.union(*pods), 1000, voxel=.004, uv=('cyl', V(0, 1.2, -.1)))
    fig.add('huskleaves', 'pack', 'gH', S.union(*leaves), 500, voxel=.004, uv=('top',))
    A = V(0, 1.0, -.7)
    sling = S.chain(S.bez(A, A + V(0, 1.2, -.4), A + V(0, 1.7, .5), 6), list(np.linspace(.16, .07, 7)))
    sling = S.bump(sling, lambda p: .012 * np.sin(p[..., 1] * 30))
    fig.add('sling', 'arms', 'gB', sling, 900, voxel=.004, uv=('side',))
    cup = S.cut(S.ellipsoid(A + V(0, 1.68, .62), (.3, .16, .3)), S.ellipsoid(A + V(0, 1.78, .64), (.26, .14, .26)))
    fig.add('cup', 'arms', 'gHn', G.hide(cup, 72.2, .01, 12), 500, voxel=.004, uv=('top',))
    fig.add('cuphusk', 'arms', 'gS', S.ellipsoid(A + V(0, 1.76, .62), (.16, .14, .16)), 200, voxel=.004, glow=.5)
    fig.add('slingrings', 'arms', 'gD', S.union(*[S.torus(A + V(0, .3 + i * .35, -.1 + i * .02), .15 - i * .02, .03, rot(-.2 - i * .3, 0, 0)) for i in range(3)]), 300, voxel=.0035)
    fig.point('muzzle', A + V(0, 1.8, .62), 'arms')
    H0 = V(0, .62, 1.0)
    head = S.ellipsoid(H0 + V(0, 0, .06), (.3, .2, .24))
    fig.add('head', 'head', 'gHn', G.hide(head, 73.3, .01, 12), 700, voxel=.0035, uv=('cyl', H0, (0, 0, 1)))
    lip, maw, teeth = G.jaw(H0 + V(0, -.1, .22), .4, .3, 7, 1, 1.3)
    fig.add('jaw', 'head', 'gHn', lip, 300, voxel=.003, uv=('top',))
    fig.add('maw', 'head', 'gMaw', maw, 100, voxel=.003, uv=('top',))
    fig.add('teeth', 'head', 'gBn', teeth, 300, voxel=.0025)
    fig.add('eyes', 'head', 'gEye', G.eyes([H0 + V(sx * .2, .1, .2) for sx in (-1, 1)], .045, .5), 120, voxel=.0028, uv=('front',))
    fig.add('brow', 'head', 'gBc', S.union(*[G.spine(H0 + V(sx * .2, .16, .1), (sx * .5, .6, .6), .26, .05) for sx in (-1, 1)]), 300, voxel=.003)
    return fig, (0, 0, 1.2, 3.6)


def build_husk():
    """What a Seeder throws: a dry split seed pod that stands up on six twig legs and walks at the foe, a glowing core showing through the split."""
    fig = B.Figure('husk', lo=(-.8, -.1, -.8), hi=(.8, 1.1, .8), paint=512)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, .42, .26), 'body')
    G.add_legs(fig, [(.14, .26, .18, .14), (-.02, .28, 0, .15), (-.18, .26, -.16, .14)], .03, .32, detail=.6)
    C = V(0, .5, -.02)
    pod = S.ellipsoid(C, (.24, .3, .3), rot(.3, 0, 0))
    pod = S.cut(pod, S.ellipsoid(C, (.2, .26, .26), rot(.3, 0, 0)))
    pod = S.cut(pod, S.slab(C, (1, 0, 0), .045))                                                                    # split down the middle
    pod = S.bump(pod, lambda p: .008 * np.sin(np.arctan2(p[..., 0], p[..., 2] - C[2]) * 18))                          # ribbed and dry
    fig.add('pod', 'body', 'gB', pod, 1000, voxel=.0025, uv=('cyl', C, (0, 1, 0)))
    fig.add('core', 'body', 'gS', S.ellipsoid(C + V(0, -.02, 0), (.13, .18, .17)), 300, voxel=.0025, glow=.7)
    fig.add('stem', 'body', 'gD', S.chain([C + V(0, .28, -.1), C + V(0, .4, -.16), C + V(.04, .46, -.12)], [.03, .02, .012]), 100, voxel=.002)
    H0 = V(0, .42, .26)
    fig.add('head', 'head', 'gHn', G.hide(S.ellipsoid(H0, (.09, .07, .08)), 81.1, .004, 20), 200, voxel=.002, uv=('front',))
    fig.add('fangs', 'head', 'gBn', S.union(*[G.spine(H0 + V(sx * .04, -.03, .06), (sx * -.2, -.8, .6), .07, .014) for sx in (-1, 1)]), 80, voxel=.0018)
    fig.add('eyes', 'head', 'gEye', G.eyes([H0 + V(sx * .05, .03, .06) for sx in (-1, 1)], .02, .5), 60, voxel=.0018, uv=('front',))
    return fig, (0, 0, .45, 1.2)


def build_pup():
    """What a Sower drops: a fat grub on four short legs that is mostly jaw, its back glowing where it hatched."""
    fig = B.Figure('pup', lo=(-.7, -.1, -.8), hi=(.7, .9, .8), paint=512)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, .26, .24), 'body', scale=1.3)
    G.add_legs(fig, [(.1, .22, .14, .12), (-.12, .22, -.12, .12)], .035, .22, detail=.6)
    body = S.squash(S.chain([V(0, .26, .2), V(0, .3, 0), V(0, .26, -.22), V(0, .18, -.38)], [.15, .19, .16, .07]), (1.1, 1, 1))
    body = S.bump(body, lambda p: .01 * np.sin(p[..., 2] * 40))
    fig.add('hide', 'body', 'gH', G.hide(body, 91.1, .008, 16), 700, voxel=.0025, uv=('cyl', V(0, .26, 0), (0, 0, 1)))
    fig.add('glow', 'body', 'gS', S.both(S.ellipsoid((0, .4, -.04), (.1, .06, .16)), S.above(.36)), 160, voxel=.0022, glow=.6)
    H0 = V(0, .26, .24)
    fig.add('skull', 'head', 'gHn', G.hide(S.ellipsoid(H0 + V(0, .02, .03), (.11, .09, .1)), 92.2, .004, 20), 300, voxel=.0022, uv=('cyl', H0, (0, 0, 1)))
    lip1, maw1, t1 = G.jaw(H0 + V(0, -.04, .1), .2, .18, 5, 1, .4)
    lip2, maw2, t2 = G.jaw(H0 + V(0, .02, .11), .19, .17, 5, -1, 1.9)
    fig.add('jaws', 'head', 'gHn', S.union(lip1, lip2), 200, voxel=.002, uv=('top',))
    fig.add('maw', 'head', 'gMaw', S.union(maw1, maw2), 80, voxel=.002, uv=('top',))
    fig.add('teeth', 'head', 'gBn', S.union(t1, t2), 200, voxel=.0016)
    fig.add('eyes', 'head', 'gEye', G.eyes([H0 + V(sx * .07, .07, .08) for sx in (-1, 1)], .022, .5), 60, voxel=.0018, uv=('front',))
    return fig, (0, 0, .3, 1.0)


if __name__ == '__main__':
    fig, look_at = {'keeper': build_keeper, 'shellback': build_shellback, 'lobber': build_lobber, 'needler': build_needler, 'digmound': build_digmound, 'smother': build_smother, 'seeder': build_seeder, 'husk': build_husk, 'pup': build_pup}[KIND]()
    args = [a for a in sys.argv[1:] if a != KIND]
    png = args[0] if args and args[0].endswith('.png') else None
    only = [a for a in args if not a.endswith('.png')]
    if only:
        fig.parts = [p for p in fig.parts if any(p.name.startswith(o) or p.group == o for o in only)]
    here = __file__.rsplit('/', 1)[0]
    fig.build(here + '/../assets/mesh/%s.bin' % KIND if not only else '/tmp/%s-part.bin' % KIND, here + '/out/%s.blend' % KIND if not only else None)
    if png:
        from kit import look
        import os
        c = [float(x) for x in os.environ.get('LOOK', '%g,%g,%g,%g' % look_at).split(',')]
        look.render(png, centre=(c[0], -c[1], c[2]), height=c[3], px=int(os.environ.get('PX', 640)))
