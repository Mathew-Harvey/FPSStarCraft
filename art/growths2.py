"""The Gloam's second growths: the Cap's two ripened forms, and every new building of the full roster.

Same rules as growths.py: everything stands on a lump of living moss, the parts that breathe, sway or ripen are groups of their
own, and each growth carries one bold lime mark on top so it still reads from the command view.
Run:  python growths2.py <kind> [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, veyl as Vk, gloam as G, site
from kit.sdf import V, rot
from growths import hide, lumpy, mound, bone, rib_out, roots, shroom, circle

PI = np.pi
TAU = 2 * PI


def buds(fig, n, rx, rz, y=.9, r=.62, phase=PI / 4):
    """The Buds round a Cap's foot: units ripen in these and the game swells each one (groups bud0..)."""
    for i, (c, s) in enumerate(circle(n, phase)):
        o = V(c * rx, y, s * rz)
        fig.group('bud%d' % i, o)
        pod = S.union(S.ellipsoid(o + V(0, r * .9, 0), (r, r * 1.16, r)), S.rcone(o + V(0, r * 1.45, 0), o + V(0, r * 2.5, 0), r * .55, r * .08), k=r * .4)
        pod = S.bump(pod, lambda p, o=o: .03 * np.sin(8 * np.arctan2(p[..., 0] - o[0], p[..., 2] - o[2])))
        fig.add('pod%d' % i, 'bud%d' % i, 'gS', pod, 260, voxel=.022, uv=('cyl',))
        fig.add('cup%d' % i, 'bud%d' % i, 'gHn', hide(Vk.lathe([(r * .8, 0), (r * 1.06, r * .48), (r * .8, r * .9), (r * .32, r)], c=o + V(0, -.25, 0)), i * 2.0, .03, 6, .01), 160, voxel=.022, uv=('cyl',))
        leaves = [S.chain(S.bez(o + V(a * r * .55, .1, b * r * .55), o + V(a * r * 1.4, r * .9, b * r * 1.4), o + V(a * r * .8, r * 2.1, b * r * .8), 6), list(np.linspace(r * .24, r * .05, 7))) for a, b in circle(4, i * .6)]
        fig.add('sepals%d' % i, 'bud%d' % i, 'gH', S.union(*leaves), 200, voxel=.02, uv=('cyl',))


def buttress(c, s, r0, r1, h, w, seed):
    """A root flare: a thick fin of hide running from up the stalk out and down into the ground."""
    pts = [(c * r0, h, s * r0), (c * (r0 + (r1 - r0) * .35), h * .45, s * (r0 + (r1 - r0) * .35)), (c * r1, .05, s * r1)]
    return S.chain(S.bez(*[V(p) for p in pts], 8), list(np.linspace(w, w * .45, 9)))


# ---------------------------------------------------------------- Elder Cap
def eldercap():
    """The Mother Cap ripened once: the stalk thickens and splits into root flares, a second ring of shelf caps grows half way
    up, and the great cap stacks a smaller crown cap on top of itself, ringed with bone horns."""
    fig = site.building('eldercap', 10.4, 8.4, 13.6, unit=5, look='growth')
    fig.group('body')
    base = lumpy(S.ellipsoid((0, 0, 0), (5.0, 1.3, 4.1)), 3.2, .18, .8)
    stalk = Vk.lathe([(3.0, 0), (2.5, 1.6), (1.95, 3.6), (2.0, 5.4), (2.5, 6.6), (2.7, 7.2)])
    stalk = S.bump(stalk, lambda p: .14 * np.cos(11 * np.arctan2(p[..., 0], p[..., 2]) + .5 * np.sin(p[..., 1] * 1.1)) + .05 * np.sin(p[..., 1] * 4.6))
    flares = [buttress(c, s, 2.0, 5.2, 4.2, .62, i) for i, (c, s) in enumerate(circle(6, .25))]
    fig.add('stalk', 'body', 'gH', S.both(hide(S.union(base, stalk, *flares, k=.6), 4.3, .1, 1.4, .025), S.above(-.08)), 3600, voxel=.05, uv=('cyl',))
    fig.add('ribs', 'body', 'gBn', S.union(*[rib_out(c, s, 3.1, .5, 1.8, 3.4, .36, .9) for c, s in circle(9, .1)]), 1000, voxel=.034, uv=('cyl',))
    rt = [((c * 4.0, .4, s * 3.2), (c * 9.6, .02, s * 7.6)) for c, s in circle(7, .5)]
    fig.add('roots', 'body', 'gD', S.both(roots(rt, .5, 3.0), S.above(-.05)), 900, voxel=.042, uv=('top',))
    sh = []                                                           # the shelf caps half way up, like bracket fungus on a trunk
    for i, (c, s) in enumerate(circle(5, .9)):
        o = V(c * 2.3, 3.6 + (i % 2) * .7, s * 2.2)
        sh.append(S.ellipsoid(o + V(c * .6, 0, s * .6), (1.25, .3, 1.25), rot(.22 * s, 0, -.22 * c)))
    fig.add('shelves', 'body', 'gC', hide(S.union(*sh), 5.5, .03, 3, .01), 900, voxel=.03, uv=('top',))
    fig.add('shelfgill', 'body', 'gGb', S.union(*[S.ellipsoid(V(c * 2.9, 3.35 + (i % 2) * .7, s * 2.8), (1.05, .12, 1.05)) for i, (c, s) in enumerate(circle(5, .9))]), 360, voxel=.026, uv=('top',))
    fig.group('top', (0, 7.0, 0))
    shroom(fig, 'top', 'top', (0, 7.1, 0), 7.0, 3.9, (0, 0, .04), 3.0, drips=19, tris=1.0, voxel=.055)
    shroom(fig, 'crown', 'top', (0, 10.9, 0), 3.0, 2.1, (0, 0, -.06), 4.0, drips=11, tris=.8)
    horns = [bone(V(c * 5.2, 9.0, s * 5.2), V(c * 6.6, 10.8, s * 6.6), V(c * 6.0, 12.2, s * 6.0), .34, .05) for c, s in circle(8, .2)]
    fig.add('horns', 'top', 'gB', S.union(*horns), 1100, voxel=.032, uv=('cyl',))
    fig.add('topsacs', 'top', 'gS', G.sacs((0, 12.6, 0), 9, .7, 31), 560, voxel=.03, uv=('top',), glow=.8)
    lamps = [S.union(S.ellipsoid((c * 6.4, 6.2, s * 6.4), (.24, .36, .24)), S.rcone((c * 6.4, 6.5, s * 6.4), (c * 6.3, 6.9, s * 6.3), .08, .05), k=.05) for c, s in circle(12)]
    fig.add('lamps', 'top', 'gS', S.union(*lamps), 480, voxel=.025, uv=('top',))
    buds(fig, 4, 4.8, 3.9)
    return fig


# ---------------------------------------------------------------- Ancient Cap
def ancientcap():
    """The Mother Cap at its oldest: a gnarled, hollowed trunk on great root arches, three stacked caps, veils of gill
    hanging from the lowest, and a crown of tall bone tusks with a glowing seed heart held between them."""
    fig = site.building('ancientcap', 11.4, 9.4, 17.4, unit=5, look='growth')
    fig.group('body')
    base = lumpy(S.ellipsoid((0, 0, 0), (5.6, 1.4, 4.6)), 7.2, .2, .8)
    tp = Vk.curve([(0, 0, 0), (.3, 3, .2), (-.2, 6, -.1), (0, 8.4, 0)], 14)
    trunk = Vk.horn(tp, Vk.radii([3.1, 2.3, 2.0, 2.6], len(tp)), flutes=9, flute=.12, turn=.7)
    arches = []                                                       # the trunk stands on root arches: daylight shows under them
    for i, (c, s) in enumerate(circle(5, .6)):
        arches.append(S.chain(S.bez(V(c * 1.6, 3.6, s * 1.6), V(c * 4.6, 2.6, s * 4.0), V(c * 6.0, 0, s * 5.0), 10), list(np.linspace(.85, .55, 11))))
    body = S.union(base, trunk, *arches, k=.7)
    for c, s in circle(5, .6 + TAU / 10):                            # cut the gaps between the arches
        body = S.cut(body, S.ellipsoid((c * 3.6, .6, s * 3.0), (1.1, 1.5, 1.1)), k=.3)
    fig.add('trunk', 'body', 'gH', S.both(hide(body, 8.3, .12, 1.3, .03), S.above(-.08)), 4400, voxel=.055, uv=('cyl',))
    fig.add('heart', 'body', 'gMaw', S.ellipsoid((0, 1.6, 0), (1.5, 1.4, 1.5)), 200, voxel=.04, uv=('top',))
    fig.add('heartglow', 'body', 'gS', G.sacs((0, 1.1, 0), 7, .5, 41), 300, voxel=.03, uv=('top',), glow=.9)
    rt = [((c * 5.0, .4, s * 4.0), (c * 10.8, .02, s * 8.6)) for c, s in circle(8, .2)]
    fig.add('roots', 'body', 'gD', S.both(roots(rt, .56, 6.0), S.above(-.05)), 1000, voxel=.045, uv=('top',))
    fig.add('ribs', 'body', 'gBn', S.union(*[rib_out(c, s, 3.6, .5, 2.0, 3.8, .4, .9) for c, s in circle(10, .3)]), 1100, voxel=.036, uv=('cyl',))
    fig.group('top', (0, 8.2, 0))
    shroom(fig, 'low', 'top', (0, 8.3, 0), 7.6, 3.4, (0, 0, .03), 5.0, drips=21, tris=1.0, voxel=.06)
    veils = []
    for c, s in circle(14, .1):                                       # ragged gill veils hanging from the low cap's rim
        q = V(c * 6.9, 7.5, s * 6.9)
        veils.append(S.both(S.shell(S.ellipsoid(q + V(0, -1.2, 0), (.9, 1.6, .9)), .05), S.below(7.4)))
    fig.add('veils', 'top', 'gG', S.union(*veils), 900, voxel=.03, uv=('side',))
    shroom(fig, 'mid', 'top', (0, 11.4, 0), 4.6, 2.6, (0, 0, -.05), 6.0, drips=13, tris=.85)
    shroom(fig, 'crown', 'top', (0, 13.7, 0), 2.4, 1.7, (.05, 0, 0), 7.0, drips=9, tris=.7)
    stem = S.union(S.rcone((0, 8.6, 0), (0, 11.6, 0), 1.7, 1.1), S.rcone((0, 11.6, 0), (0, 13.9, 0), 1.0, .6), k=.3)
    fig.add('stems', 'top', 'gH', hide(stem, 9.9, .05, 2.2, .02), 600, voxel=.04, uv=('cyl',))
    tusks = [Vk.horn(Vk.curve([(c * 2.8, 12.6, s * 2.8), (c * 4.6, 14.0, s * 4.6), (c * 4.0, 15.6, s * 4.0), (c * 2.6, 16.4, s * 2.6)], 12), Vk.radii([.5, .42, .26, .04], 13), plates=5, lip=.03) for c, s in circle(6, .3)]
    fig.add('tusks', 'top', 'gB', S.union(*tusks), 1500, voxel=.034, uv=('cyl',))
    fig.add('seed', 'top', 'gS', S.union(S.ellipsoid((0, 15.9, 0), (.9, 1.1, .9)), G.sacs((0, 15.2, 0), 6, .45, 43)), 420, voxel=.03, uv=('top',), glow=1.0)
    lamps = [S.ellipsoid((c * 7.3, 6.9, s * 7.3), (.28, .42, .28)) for c, s in circle(14, .05)]
    fig.add('lamps', 'top', 'gS', S.union(*lamps), 500, voxel=.026, uv=('top',))
    buds(fig, 4, 5.4, 4.4, r=.68)
    return fig


# ---------------------------------------------------------------- Vent Bladder
def ventbladder():
    """Sits over a Flux vent and drinks it: a fat bladder clamped to the vent's rock lip by gripping roots, a neck with
    puckered lips at the top that puffs, and glowing veins where the gas runs through it."""
    fig = site.building('ventbladder', 3.4, 3.4, 5.4, look='growth')
    fig.group('body')
    lip = Vk.lathe([(2.5, 0), (2.7, .4), (2.3, .9), (1.7, 1.0)])
    lip = lumpy(lip, 2.2, .16, 1.4)
    fig.add('ventrock', 'body', 'rock', S.both(lip, S.above(-.08)), 700, voxel=.034, uv=('cyl',))
    grip = [S.chain(S.bez(V(c * 1.3, 2.0, s * 1.3), V(c * 2.6, 1.6, s * 2.6), V(c * 2.9, .1, s * 2.9), 8), list(np.linspace(.26, .12, 9))) for c, s in circle(7, .3)]
    fig.add('grip', 'body', 'gD', hide(S.union(*grip), 3.1, .04, 4, .01), 700, voxel=.026, uv=('cyl',))
    fig.group('bulb', (0, 1.0, 0))
    b = S.union(S.ellipsoid((0, 2.3, 0), (1.85, 1.45, 1.85)), S.rcone((0, 3.2, 0), (0, 4.5, 0), .9, .55), k=.6)
    b = S.bump(b, lambda p: .1 * np.clip(np.cos(7 * np.arctan2(p[..., 0], p[..., 2])) * 3 - 2.2, 0, 1) * -1)
    fig.add('skin', 'bulb', 'gH', hide(b, 4.1, .05, 2.4, .02), 1500, voxel=.028, uv=('cyl',))
    veins = [S.chain(S.bez(V(c * .6, 4.4, s * .6), V(c * 1.95, 2.8, s * 1.95), V(c * 1.35, 1.1, s * 1.35), 9), [.07] * 10) for c, s in circle(7, .3 + TAU / 14)]
    fig.add('veins', 'bulb', 'gS', S.union(*veins), 600, voxel=.018, uv=('cyl',), glow=.8)
    mouth = S.cut(S.torus((0, 4.55, 0), .55, .24, squash=.7), S.cyl((0, 4.2, 0), (0, 5.0, 0), .3))
    mouth = S.bump(mouth, lambda p: .05 * np.sin(9 * np.arctan2(p[..., 0], p[..., 2])))
    fig.add('mouth', 'bulb', 'gV', mouth, 300, voxel=.016, uv=('top',))
    fig.add('throat', 'bulb', 'gS', S.ellipsoid((0, 4.45, 0), (.33, .16, .33)), 80, voxel=.016, uv=('top',), glow=1.0)
    fig.add('belly', 'bulb', 'gV', S.ellipsoid((0, 1.5, 0), (1.4, .5, 1.4)), 300, voxel=.024, uv=('top',))
    return fig


# ---------------------------------------------------------------- Shell Pit
def shellpit():
    """Where Shellbacks grow: a ring of overlapping shell scales round a pit of wet dark brood, three pale eggs half sunk
    in it, and bone hooks holding the rim open."""
    fig = site.building('shellpit', 4.8, 4.8, 3.4, look='growth')
    fig.group('body')
    rim = Vk.lathe([(3.6, 0), (4.0, .5), (3.6, 1.35), (2.6, 1.5), (2.2, 1.2)])
    rim = S.cut(rim, S.ellipsoid((0, 1.25, 0), (2.4, .9, 2.4)), k=.15)
    fig.add('rim', 'body', 'gH', S.both(hide(rim, 6.6, .07, 1.8, .02), S.above(-.08)), 1300, voxel=.032, uv=('cyl',))
    scales = []
    for ring_, (r0, y, n, sz) in enumerate(((3.55, .7, 13, 1.0), (3.0, 1.35, 11, .8))):
        for i in range(n):
            a = (i + ring_ * .5) / n * TAU
            c, s = np.cos(a), np.sin(a)
            o = V(c * r0, y, s * r0)
            B_ = S.basis(V(c, .45, s), V(-c * .45, 1, -s * .45))          # each scale stands up round the rim, leaning out, dished on its inner face
            sc = S.ellipsoid(o + V(0, .35 * sz, 0), (1.05 * sz, .85 * sz, .22 * sz), B_)
            sc = S.cut(sc, S.ellipsoid(o + V(0, .4 * sz, 0) - V(c, .45, s) * .2 * sz, (.92 * sz, .75 * sz, .2 * sz), B_))
            scales.append(sc)
    fig.add('scales', 'body', 'gB', S.union(*scales), 2200, voxel=.022, uv=('cyl',))
    fig.add('brood', 'body', 'gMaw', S.ellipsoid((0, .55, 0), (2.4, .4, 2.4)), 260, voxel=.03, uv=('top',))
    eggs = []
    for i, (x, z, r) in enumerate(((.8, .4, .62), (-.9, .6, .55), (.1, -1.0, .66))):
        e = S.ellipsoid((x, .7, z), (r, r * .78, r * 1.1), rot(0, i * 1.3, 0))
        e = S.bump(e, lambda p, x=x, z=z: .03 * np.sin((p[..., 2] - z) * 18))       # the ridges a shell starts with
        eggs.append(e)
    fig.add('eggs', 'body', 'gV', S.union(*eggs), 700, voxel=.02, uv=('cyl',))
    fig.add('glow', 'body', 'gS', G.sacs((0, .72, 0), 9, .32, 51), 300, voxel=.02, uv=('top',), glow=.9)
    hooks = [bone(V(c * 3.5, 1.2, s * 3.5), V(c * 3.2, 2.9, s * 3.2), V(c * 2.2, 2.6, s * 2.2), .22, .05) for c, s in circle(5, .2)]
    fig.add('hooks', 'body', 'gBn', S.union(*hooks), 520, voxel=.022, uv=('cyl',))
    return fig


# ---------------------------------------------------------------- Puffball
def puffball_parts(fig, legs=False):
    """A stalk with a great pale puffball for a head, rows of glowing pores it spits spores at fliers from, and a ring of
    eyes under the ball that sees what hides. `legs` gives the walking form: the roots lift into six stilt legs."""
    fig.group('body')
    if not legs:
        fig.add('bed', 'body', 'gHn', mound(1.9, .6, 1.9, 61.0, .08), 420, voxel=.028, uv=('top',))
        rt = [((c * .7, .4, s * .7), (c * 2.7, .02, s * 2.7)) for c, s in circle(5)]
        fig.add('roots', 'body', 'gD', S.both(roots(rt, .26, 7.0), S.above(-.05)), 420, voxel=.024, uv=('top',))
    sp = Vk.curve([(0, .2 if not legs else 1.4, 0), (.15, 2.0, 0), (-.1, 3.3, .05)], 12)
    fig.add('stalk', 'body', 'gH', hide(Vk.horn(sp, Vk.radii([.62, .46, .5], len(sp)), plates=5, lip=.04), 62.0, .04, 3.2, .012), 900, voxel=.024, uv=('cyl',))
    fig.add('collar', 'body', 'gG', S.torus((0, 3.15, 0), .78, .16, squash=.6), 260, voxel=.02, uv=('top',))
    fig.group('head', (0, 3.4, 0), 'body')
    C = V(0, 4.45, 0)
    ball = S.ellipsoid(C, (1.45, 1.3, 1.45))
    ball = S.bump(ball, lambda p: .05 * np.sin(np.arctan2(p[..., 0], p[..., 2]) * 9) * np.clip(p[..., 1] - 3.6, 0, 1) + .03 * (S.noise(p, 2.4, 6.3) - .5))
    pores = []
    for row, (b, n) in enumerate(((.35, 6), (.8, 9), (1.25, 11))):
        for i in range(n):
            a = i / n * TAU + row * .4
            pores.append(C + V(np.cos(a) * np.sin(b) * 1.45, np.cos(b) * 1.3, np.sin(a) * np.sin(b) * 1.45))
    pores.append(C + V(0, 1.3, 0))
    ball = S.cut(ball, *[S.sphere(q, .13) for q in pores], k=.04)
    fig.add('ball', 'head', 'gV', ball, 2000, voxel=.016, uv=('top',))
    fig.add('pores', 'head', 'gS', S.union(*[S.sphere(q - (q - C) * .05, .1) for q in pores]), 600, voxel=.012, glow=.9)
    eyes = [V(np.cos(a) * 1.25, 3.55, np.sin(a) * 1.25) for a in np.arange(7) / 7 * TAU + .2]
    fig.add('lids', 'head', 'gD', S.union(*[S.ellipsoid(e, (.26, .2, .26)) for e in eyes]), 360, voxel=.014, uv=('top',))
    fig.add('eyes', 'head', 'gEye', S.union(*[S.sphere(e + (e - V(0, 3.55, 0)) * .09, .15) for e in eyes]), 300, voxel=.012, uv=('top',))
    if legs:
        G.add_legs(fig, [(.45, 1.4, .3, .5), (0, 1.5, 0, .55), (-.45, 1.4, -.3, .5)], .13, 1.45, thorn=.3)
    return fig


def puffball():
    fig = site.building('puffball', 3.0, 3.0, 6.0, look='growth')
    return puffball_parts(fig)


# ---------------------------------------------------------------- Needle Den
def needleden():
    """Where Quillbacks ripen into Needlers: a long low den like a buried back, combed with rows of long needles that all
    sweep one way, a glowing seam down the spine, and a dug mouth at the front."""
    fig = site.building('needleden', 5.0, 4.6, 6.6, look='growth')
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(4.4, .8, 3.9, 71.0), 700, voxel=.036, uv=('top',))
    den = S.ellipsoid((0, .6, -.2), (2.8, 2.1, 3.4))
    den = S.cut(den, S.ellipsoid((0, .9, 3.2), (1.25, 1.15, 1.0)), k=.25)
    den = S.bump(den, lambda p: .12 * np.sin(p[..., 2] * 3.1) * np.clip(p[..., 1], 0, 1))
    fig.add('den', 'body', 'gH', S.both(hide(den, 72.3, .07, 1.9, .02), S.above(0)), 1500, voxel=.034, uv=('cyl',))
    fig.add('maw', 'body', 'gMaw', S.ellipsoid((0, .95, 2.45), (1.1, 1.0, .5)), 120, voxel=.03, uv=('top',))
    fig.add('mawlips', 'body', 'gD', S.torus((0, .95, 2.75), 1.12, .2, S.basis(V(1, 0, 0), V(0, 0, 1)), squash=.9), 300, voxel=.022, uv=('cyl',))
    ndl = []
    for row in range(6):
        z = -2.9 + row * 1.05
        for sx in (-1, 1):
            for k in range(3):
                x = sx * (.5 + k * .8)
                y = .6 + 2.1 * np.sqrt(max(0, 1 - (x / 2.8) ** 2 - ((z + .2) / 3.4) ** 2))
                b = V(x, y - .1, z)
                d = V(sx * (.25 + k * .2), 1.0, -.55)
                d = d / np.linalg.norm(d)
                ndl.append(S.rcone(b, b + d * (3.6 - k * .7 - abs(row - 2.5) * .25), .15, .012))
    fig.add('needles', 'body', 'gBn', S.union(*ndl), 2600, voxel=.02, uv=('cyl',))
    fig.add('seam', 'body', 'gS', S.chain(S.bez(V(0, 2.55, -2.6), V(0, 2.9, -.2), V(0, 2.2, 2.2), 10), [.16] * 11), 300, voxel=.02, uv=('side',), glow=.9)
    th = [rib_out(c, s, 3.2, .4, .7, 1.8, .2) for c, s in circle(6, .3)]
    fig.add('thorns', 'body', 'gB', S.union(*th), 420, voxel=.024, uv=('cyl',))
    return fig


# ---------------------------------------------------------------- Rot Den
def rotden():
    """Where Smothers and Seeders grow: the rotting ribcage of something huge, slumped on its side, a pool of glowing rot
    under it, pale fungus fringes hanging off the ribs, and husks hanging in clusters to dry."""
    fig = site.building('rotden', 5.2, 4.8, 6.2, look='growth')
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(4.6, .7, 4.1, 81.0), 700, voxel=.036, uv=('top',))
    fig.add('pool', 'body', 'gMaw', S.ellipsoid((0, .45, .2), (3.0, .3, 2.6)), 200, voxel=.03, uv=('top',))
    fig.add('rot', 'body', 'gS', S.union(G.sacs((0, .55, .2), 13, .45, 83), S.ellipsoid((0, .55, .2), (2.0, .12, 1.7))), 500, voxel=.022, uv=('top',), glow=.75)
    sp = S.chain(S.bez(V(-3.9, .5, -2.4), V(0, 1.2, -3.4), V(3.9, .6, -2.2), 12), .5)
    sp = S.bump(sp, lambda p: .14 * np.maximum(np.cos(p[..., 0] * 3.4), 0) ** 2)
    fig.add('spine', 'body', 'gBp', sp, 600, voxel=.03, uv=('side',))
    ribs, fringe = [], []
    for i in range(6):
        x = -3.2 + i * 1.28
        h = 5.4 - abs(i - 2.5) * .7
        pts = Vk.curve([(x, .8, -2.7), (x * .95, h, -1.6), (x * .85, h * .9, 1.0), (x * .8, h * .35, 2.9)], 12)
        ribs.append(Vk.horn(pts, Vk.radii([.38, .3, .22, .1], len(pts)), plates=5, lip=.03))
        c, d, r = Vk.along(pts, Vk.radii([.38, .3, .22, .1], len(pts)), .45)
        for k in range(3):
            q = c + V(0, -.1, k * .35 - .35)
            fringe.append(S.rcone(q, q + V(np.sin(i + k) * .1, -.9 - .5 * ((i + k) % 3), 0), .12, .03))
    fig.add('ribs', 'body', 'gB', S.union(*ribs), 2400, voxel=.03, uv=('cyl',))
    fig.add('fringe', 'body', 'gV', S.union(*fringe), 600, voxel=.018, uv=('cyl',))
    husks = []
    for i, (x, z) in enumerate(((-1.9, .3), (.7, -.4), (2.3, .9))):
        top = V(x, 4.6 - abs(x) * .3, z)
        husks.append(S.chain([top, top + V(0, -.7, 0)], [.04, .04]))
        for k in range(3):
            o = top + V(np.cos(k * 2.1 + i) * .32, -1.1 - k * .15, np.sin(k * 2.1 + i) * .32)
            husks.append(S.ellipsoid(o, (.26, .46, .26)))
    fig.add('husks', 'body', 'gD', S.union(*husks), 600, voxel=.018, uv=('cyl',))
    shroom(fig, 'a', 'body', (-3.0, 3.3, -2.0), .9, .5, (0, 0, .4), 8.0, tris=.6)
    shroom(fig, 'b', 'body', (2.9, 2.6, -2.0), .7, .4, (0, 0, -.4), 9.0, tris=.5)
    return fig


# ---------------------------------------------------------------- Wing Spire
def spire_trunk(fig, h, seed, r0=.9):
    tp = Vk.curve([(0, 0, 0), (.3, h * .3, .1), (-.25, h * .62, -.1), (.1, h, 0)], 16)
    rs = Vk.radii([r0, r0 * .75, r0 * .55, r0 * .3], len(tp))
    trunk = Vk.horn(tp, rs, flutes=5, flute=.08, turn=2.2)
    return tp, rs, trunk


def wingspire():
    """Where fliers grow: a tall twisted spire with wing membranes spiralling up it like the fins of a seed, roost hooks
    the fliers hang from, and a lime bud at the tip."""
    fig = site.building('wingspire', 4.2, 4.2, 11.0, look='growth')
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(3.4, .9, 3.4, 91.0), 600, voxel=.034, uv=('top',))
    tp, rs, trunk = spire_trunk(fig, 9.4, 91)
    flares = [buttress(c, s, .6, 2.9, 2.2, .34, i) for i, (c, s) in enumerate(circle(4, .4))]
    fig.add('trunk', 'body', 'gH', S.both(hide(S.union(trunk, *flares, k=.3), 92.1, .06, 2.4, .02), S.above(-.08)), 2000, voxel=.03, uv=('cyl',))
    fins = []
    for i in range(7):
        t = .18 + i * .1
        c, d, r = Vk.along(tp, rs, t)
        a = i * 2.1
        out = V(np.cos(a), 0, np.sin(a))
        span = 2.2 - i * .17
        fins.append(G.crescent_fin(c + out * (r + span * .45), span, .05, rot(0, -a, 0) @ rot(0, 0, -.35)))
    fig.add('fins', 'body', 'gG', S.union(*fins), 1500, voxel=.022, uv=('side',))
    hooks = []
    for i in range(5):
        c, d, r = Vk.along(tp, rs, .25 + i * .13)
        a = i * 2.1 + 1.05
        o = V(np.cos(a), 0, np.sin(a))
        hooks.append(bone(c + o * r * .7, c + o * (r + .8) + V(0, .5, 0), c + o * (r + 1.0) + V(0, -.2, 0), .12, .1))
    fig.add('hooks', 'body', 'gBn', S.union(*hooks), 500, voxel=.018, uv=('cyl',))
    fig.add('rings', 'body', 'gB', S.union(*[Vk.band(tp, rs, t, .09, .03) for t in (.12, .3, .5, .7)]), 500, voxel=.02, uv=('cyl',))
    fig.group('tip', (0, 9.2, 0))
    pod, leaves = G.bud((0, 9.5, 0), .75, 1.0)
    fig.add('tipbud', 'tip', 'gS', pod, 300, voxel=.02, uv=('cyl',), glow=.9)
    fig.add('tipleaves', 'tip', 'gH', leaves, 300, voxel=.02, uv=('cyl',))
    return fig


# ---------------------------------------------------------------- Tall Spire
def tallspire():
    """The Wing Spire ripened: the spire runs much taller and splits into three prongs at the top with sails of membrane
    strung between them, and gas bladders hang from the prongs like fruit (where Sowers ripen)."""
    fig = site.building('tallspire', 4.6, 4.6, 14.6, look='growth')
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(3.8, 1.0, 3.8, 101.0), 600, voxel=.036, uv=('top',))
    tp, rs, trunk = spire_trunk(fig, 10.0, 101, 1.1)
    flares = [buttress(c, s, .7, 3.4, 2.6, .4, i) for i, (c, s) in enumerate(circle(5, .4))]
    fig.add('trunk', 'body', 'gH', S.both(hide(S.union(trunk, *flares, k=.35), 102.1, .06, 2.2, .02), S.above(-.08)), 2200, voxel=.032, uv=('cyl',))
    fins = []
    for i in range(6):
        c, d, r = Vk.along(tp, rs, .15 + i * .11)
        a = i * 2.1
        fins.append(G.crescent_fin(c + V(np.cos(a), 0, np.sin(a)) * (r + 1.0), 2.3 - i * .2, .05, rot(0, -a, 0) @ rot(0, 0, -.35)))
    fig.add('fins', 'body', 'gG', S.union(*fins), 1300, voxel=.022, uv=('cyl',))
    fig.group('crown', (0, 10.0, 0))
    O = V(.1, 10.0, 0)
    tips, prongs = [], []
    for c, s in circle(3, .5):
        T = O + V(c * 2.6, 4.3, s * 2.6)
        tips.append(T)
        pts = Vk.curve([O, O + V(c * .9, 1.6, s * .9), O + V(c * 2.2, 3.0, s * 2.2), T], 12)
        prongs.append(Vk.horn(pts, Vk.radii([.6, .45, .3, .08], len(pts)), plates=5, lip=.03))
    fig.add('prongs', 'crown', 'gB', S.union(*prongs), 1400, voxel=.028, uv=('cyl',))
    sails = []
    for i in range(3):
        a, b = tips[i], tips[(i + 1) % 3]
        m = (a + b) / 2 * .55 + O * .45 + V(0, -.6, 0)
        n = np.cross(b - a, m - a)
        n = n / np.linalg.norm(n)
        sails.append(S.both(S.shell(S.sphere(m + n * 4.0, 4.0), .05), S.both(S.ellipsoid((a + b + m) / 3, (2.3, 2.0, 2.3)), S.above(O[1] + .6))))
    fig.add('sails', 'crown', 'gG', S.union(*sails), 1200, voxel=.026, uv=('side',))
    bl = []
    for i, T in enumerate(tips):
        q = T + V(0, -1.7, 0)
        bl.append(S.chain([T + V(0, -.2, 0), q + V(0, .6, 0)], [.05, .05]))
        bl.append(S.bump(S.ellipsoid(q, (.62, .7, .62)), lambda p, q=q: -.04 * np.clip(np.cos(np.arctan2(p[..., 0] - q[0], p[..., 2] - q[2]) * 7) * 3 - 2, 0, 1)))
    fig.add('bladders', 'crown', 'gS', S.union(*bl), 600, voxel=.02, uv=('cyl',), glow=.6)
    fig.add('heart', 'crown', 'gS', S.ellipsoid(O + V(0, .9, 0), (.55, .8, .55)), 200, voxel=.02, uv=('top',), glow=1.0)
    return fig


# ---------------------------------------------------------------- Deep Root and Tunnel Root
def throat(fig, group, r, depth, n_teeth, seed):
    """A mouth in the ground: a ring of fat lips, hooked teeth leaning in, and a glowing throat going down."""
    lips = S.bump(S.torus((0, .35, 0), r, r * .32, squash=.75), lambda p: r * .06 * np.sin(np.arctan2(p[..., 0], p[..., 2]) * 7 + seed))
    fig.add('lips', group, 'gH', hide(lips, seed, .04, 3.0 / r, .012), 1200, voxel=max(.018, r * .016), uv=('cyl',))
    fig.add('gullet', group, 'gMaw', S.ellipsoid((0, .15, 0), (r * .85, depth, r * .85)), 160, voxel=max(.018, r * .02), uv=('top',))
    fig.add('throat', group, 'gS', S.union(*[S.torus((0, .05 - k * .3, 0), r * (.66 - k * .1), r * .05) for k in range(3)]), 300, voxel=max(.014, r * .012), uv=('cyl',), glow=.9)
    teeth = []
    for c, s in circle(n_teeth, seed):
        a = V(c * r * 1.05, .45, s * r * 1.05)
        teeth.append(bone(a, a + V(c * .1, r * .45, s * .1), a + V(-c * r * .35, r * .55, -s * r * .35), r * .1, .06))
    fig.add('teeth', group, 'gBn', S.union(*teeth), 600, voxel=max(.014, r * .012), uv=('cyl',))


def deeproot():
    """A knot of great roots that dives into the ground: the roots coil up from the earth into a hollow crown and plunge
    down a gaping throat in the middle, which is where Tunnel Roots set out from."""
    fig = site.building('deeproot', 5.7, 5.7, 5.4, look='growth')
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(4.4, .7, 4.4, 111.0), 700, voxel=.036, uv=('top',))
    coils = []
    for i, (c, s) in enumerate(circle(7, .2)):
        a = V(c * 4.6, .1, s * 4.6)
        top = V(np.cos(i * .9 + 1) * 2.4, 4.4 - (i % 3) * .7, np.sin(i * .9 + 1) * 2.4)
        dn = V(c * .6, -.4, s * .6)
        coils.append(S.chain(S.bez(a, a * .55 + V(0, 3.6, 0), top, 10) + S.bez(top, top * .4 + V(0, 1.2, 0), dn, 8)[1:], list(np.linspace(.75, .55, 11)) + list(np.linspace(.55, .3, 8))))
    fig.add('coils', 'body', 'gD', S.both(hide(S.union(*coils, k=.35), 112.0, .06, 2.4, .02), S.above(-.05)), 3000, voxel=.032, uv=('cyl',))
    fig.group('mouth', (0, .6, 0))
    throat(fig, 'mouth', 1.4, 1.0, 9, 113.0)
    fig.add('bands', 'body', 'gB', S.union(*[S.torus(V(c * 3.2, 2.7, s * 3.2), .62, .12, S.basis(V(-s, 0, c), V(c, .6, s))) for c, s in circle(4, .55)]), 400, voxel=.02, uv=('cyl',))
    fig.add('sacs', 'body', 'gS', G.sacs((0, 4.2, 0), 7, .5, 117), 360, voxel=.024, uv=('top',), glow=.8)
    return fig


def tunnelroot():
    """Either end of a Tunnel Root: a mouth in the ground, the same throat as the Deep Root's, with roots running off."""
    fig = site.building('tunnelroot', 2.6, 2.6, 2.2, look='growth')
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(2.2, .5, 2.2, 121.0, .08), 420, voxel=.026, uv=('top',))
    rt = [((c * 1.4, .3, s * 1.4), (c * 2.5, .02, s * 2.5)) for c, s in circle(6, .3)]
    fig.add('roots', 'body', 'gD', S.both(roots(rt, .28, 12.0), S.above(-.05)), 520, voxel=.024, uv=('top',))
    fig.group('mouth', (0, .4, 0))
    throat(fig, 'mouth', 1.15, .8, 7, 123.0)
    return fig


# ---------------------------------------------------------------- Spore Pod
def sporepod():
    """What a Keeper plants to spread Bloom: a fat lime pod on a short stalk in a cup of leaves, its top split in a star
    that puffs spores, and a few roots already running."""
    fig = site.building('sporepod', 1.4, 1.4, 2.4, unit=2, look='growth')
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(1.0, .3, 1.0, 131.0, .05), 260, voxel=.016, uv=('top',))
    rt = [((c * .5, .15, s * .5), (c * 1.35, .02, s * 1.35)) for c, s in circle(5, .3)]
    fig.add('roots', 'body', 'gD', S.both(roots(rt, .1, 13.0), S.above(-.03)), 300, voxel=.012, uv=('top',))
    fig.add('stalk', 'body', 'gH', S.rcone((0, .1, 0), (0, .7, 0), .2, .16), 160, voxel=.012, uv=('cyl',))
    fig.group('pod', (0, .7, 0))
    pod = S.ellipsoid((0, 1.25, 0), (.55, .66, .55))
    pod = S.bump(pod, lambda p: .03 * np.sin(np.arctan2(p[..., 0], p[..., 2]) * 6))
    pod = S.cut(pod, *[S.rcone(V(0, 1.95, 0), V(c * .35, 1.55, s * .35), .14, .02) for c, s in circle(5)], k=.03)
    fig.add('pod', 'pod', 'gS', pod, 600, voxel=.01, uv=('cyl',), glow=.3)
    leaves = [S.ellipsoid(V(c * .42, .95, s * .42), (.42, .5, .1), rot(0, -np.arctan2(s, c) + PI / 2, 0) @ rot(.45, 0, 0)) for c, s in circle(5, .6)]
    fig.add('leaves', 'pod', 'gH', hide(S.union(*leaves), 133.0, .02, 6, .006), 420, voxel=.01, uv=('cyl',))
    return fig


MAKERS = dict(eldercap=eldercap, ancientcap=ancientcap, ventbladder=ventbladder, shellpit=shellpit, puffball=puffball, needleden=needleden,
              rotden=rotden, wingspire=wingspire, tallspire=tallspire, deeproot=deeproot, tunnelroot=tunnelroot, sporepod=sporepod)
if __name__ == '__main__':
    site.main(MAKERS, __file__)
