"""What the Gloam grow instead of building: mounds, stalks, caps and bone, all of it alive and none of it finished.

Everything stands on a lump of the same moss the Bloom is made of. The parts that breathe, sway or ripen are groups of
their own and the game moves them.
Run:  python growths.py <mothercap|sporesac|warren|quillgarden|blisterbed|tuskhollow|oldgrowth|stinger> [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, veyl as Vk, gloam as G, site
from kit.sdf import V, rot

PI = np.pi
TAU = 2 * PI


def hide(f, seed, warts=.07, freq=1.8, grain=.02):
    return G.hide(f, seed, warts, freq, grain)


def lumpy(f, seed, amp, freq):
    return S.bump(f, lambda p: amp * (S.noise(p, freq, seed) - .5) * 2)


def mound(rx, h, rz, seed, amp=.14):
    """The lump of living ground a growth stands on."""
    f = lumpy(S.ellipsoid((0, 0, 0), (rx, h, rz)), seed, amp, .9)
    return S.both(hide(f, seed + 1.7), S.above(-.08))


def bone(a, m, b, r, tip=.06, n=8):
    """A curved thorn of bone from a, bowed through m, to a point at b."""
    return S.chain(S.bez(a, m, b, n), list(np.linspace(r, r * tip, n + 1)))


def rib_out(c, s, r0, y0, reach, rise, r, zs=1.0):
    """A bone rib standing out of the ground at angle (c, s), leaning out and curling back in at the top."""
    a = V(c * r0, y0, s * r0 * zs)
    return bone(a, a + V(c * reach, rise * .45, s * reach * zs), a + V(c * reach * .55, rise, s * reach * .55 * zs), r)


def roots(spots, r, seed=1.0):
    """Roots running out over the ground: spots are (from, to)."""
    fs = []
    for i, (a, b) in enumerate(spots):
        a, b = V(a), V(b)
        m = (a + b) / 2 + V(np.sin(seed + i * 2.1) * .45, max(a[1], b[1]) + r * .7, np.cos(seed + i * 1.7) * .45)
        fs.append(S.chain(S.bez(a, m, b, 8), list(np.linspace(r, r * .22, 9))))
    return hide(S.union(*fs, k=r * .3), seed, r * .2, 3.0, r * .06)


def shroom(fig, tag, group, p, r, h, tilt=(0, 0, 0), seed=1.0, foot=None, sz=1.0, drips=0, tris=1.0, voxel=None):
    """A cap with its gills, and a stalk down to `foot` when it does not sit straight on something."""
    cap, gill = G.mushroom(p, r, h, tilt, sz, seed)
    p = V(p)
    if drips:                                                    # the rim hangs in ragged lobes
        R = rot(*tilt)
        lobes = []
        for i in range(drips):
            a = i * TAU / drips + .3 * np.sin(i * 3.7 + seed)
            q = p + R @ V(np.cos(a) * r * .93, -h * .06, np.sin(a) * r * .93 * sz)
            ln = r * (.07 + .09 * abs(np.sin(i * 2.3 + seed)))
            lobes.append(S.rcone(q, q + V(0, -ln, 0), r * .05, r * .018))
        cap = S.union(cap, S.union(*lobes), k=r * .04)
    vx = voxel or max(.012, r * .016)
    fig.add(tag + 'cap', group, 'gC', cap, int((700 + 260 * r) * tris), voxel=vx, uv=('top',))
    fig.add(tag + 'gills', group, 'gGb', gill, int((300 + 120 * r) * tris), voxel=vx, uv=('top',))
    if foot is not None:
        foot = V(foot)
        st = S.chain(S.bez(foot, (foot + p) / 2 + V(0, 0, 0), p + V(0, -h * .1, 0), 6), list(np.linspace(r * .3, r * .2, 7)))
        fig.add(tag + 'stalk', 'body', 'gH', hide(st, seed, r * .05, 6 / r, r * .02), int(160 * tris), voxel=vx, uv=('cyl',))


def circle(n, phase=0.0):
    return [(np.cos(phase + i * TAU / n), np.sin(phase + i * TAU / n)) for i in range(n)]


# ---------------------------------------------------------------- Mother Cap
def mothercap():
    fig = site.building('mothercap', 9.4, 7.4, 11.4, unit=5)
    fig.group('body')
    base = lumpy(S.ellipsoid((0, 0, 0), (4.5, 1.15, 3.7)), 2.2, .16, .8)
    stalk = Vk.lathe([(2.6, 0), (2.2, 1.6), (1.66, 3.4), (1.82, 5), (2.3, 6.0), (2.45, 6.5)])
    stalk = S.bump(stalk, lambda p: .11 * np.cos(9 * np.arctan2(p[..., 0], p[..., 2]) + .6 * np.sin(p[..., 1] * 1.3)) + .05 * np.sin(p[..., 1] * 5.2))
    fig.add('stalk', 'body', 'gH', S.both(hide(S.union(base, stalk, k=.7), 3.3, .09, 1.5, .025), S.above(-.08)), 3000, voxel=.045, uv=('cyl',))
    ten = [S.chain([(c * 1.95, 5.8, s * 1.95), (c * 2.3, 3.0, s * 2.3), (c * 3.7, .35, s * 3.1)], [.3, .38, .52]) for c, s in circle(7, .3)]
    fig.add('tendons', 'body', 'gD', hide(S.union(*ten), 5.1, .05, 3, .015), 1100, voxel=.04, uv=('cyl',))
    skirt = S.torus((0, 4.75, 0), 2.05, .55, squash=.22)
    skirt = S.bump(skirt, lambda p: .13 * np.sin(11 * np.arctan2(p[..., 0], p[..., 2])) * np.clip((np.sqrt(p[..., 0] ** 2 + p[..., 2] ** 2) - 2.0) * 2.5, 0, 1))
    fig.add('skirt', 'body', 'gV', skirt, 520, voxel=.03, uv=('top',))
    fig.add('ribs', 'body', 'gBn', S.union(*[rib_out(c, s, 2.7, .5, 1.5, 2.9, .32, .9) for c, s in circle(8)]), 900, voxel=.032, uv=('cyl',))
    rt = [((c * 3.5, .4, s * 2.8), (c * 8.6, .02, s * 6.6)) for c, s in circle(6, .5)]
    fig.add('roots', 'body', 'gD', S.both(roots(rt, .46, 2.0), S.above(-.05)), 800, voxel=.04, uv=('top',))
    fig.group('top', (0, 6.2, 0))
    shroom(fig, 'top', 'top', (0, 6.3, 0), 6.2, 3.6, (0, 0, .05), 2.0, drips=17, tris=.95, voxel=.05)
    fig.add('topsacs', 'top', 'gS', G.sacs((0, 9.5, 0), 8, .8, 21), 520, voxel=.03, uv=('top',))
    lamps = [S.union(S.ellipsoid((c * 5.65, 5.55, s * 5.65), (.22, .32, .22)), S.rcone((c * 5.65, 5.8, s * 5.65), (c * 5.6, 6.15, s * 5.6), .07, .05), k=.05) for c, s in circle(10)]
    fig.add('lamps', 'top', 'gS', S.union(*lamps), 420, voxel=.025, uv=('top',))
    for i, (c, s) in enumerate(circle(4, PI / 4)):               # the Buds: units ripen in these, and the game swells each one as it does
        o = V(c * 4.2, .9, s * 3.4)
        fig.group('bud%d' % i, o)
        pod = S.union(S.ellipsoid(o + V(0, .55, 0), (.62, .72, .62)), S.rcone(o + V(0, .9, 0), o + V(0, 1.55, 0), .34, .05), k=.25)
        pod = S.bump(pod, lambda p, o=o: .03 * np.sin(8 * np.arctan2(p[..., 0] - o[0], p[..., 2] - o[2])))
        fig.add('pod%d' % i, 'bud%d' % i, 'gS', pod, 260, voxel=.022, uv=('cyl',))
        fig.add('cup%d' % i, 'bud%d' % i, 'gHn', hide(Vk.lathe([(.5, 0), (.66, .3), (.5, .56), (.2, .62)], c=o + V(0, -.25, 0)), i * 2.0, .03, 6, .01), 160, voxel=.022, uv=('cyl',))
        leaves = [S.chain(S.bez(o + V(a * .34, .1, b * .34), o + V(a * .86, .55, b * .86), o + V(a * .5, 1.32, b * .5), 6), list(np.linspace(.15, .03, 7))) for a, b in circle(4, i * .6)]
        fig.add('sepals%d' % i, 'bud%d' % i, 'gH', S.union(*leaves), 200, voxel=.02, uv=('cyl',))
    return fig


# ---------------------------------------------------------------- Spore Sac
def sporesac():
    fig = site.building('sporesac', 3.2, 3.0, 5.6)
    fig.group('body')
    fig.add('base', 'body', 'gHn', mound(2.35, .62, 2.15, 4.0), 500, voxel=.03, uv=('top',))
    fig.group('bulb', (0, .4, 0))
    bulb = S.union(S.ellipsoid((0, 2.05, 0), (1.82, 1.7, 1.72)), S.ellipsoid((0, 3.05, 0), (1.3, 1.42, 1.25)), k=.6)
    bulb = S.bump(bulb, lambda p: .1 * np.sin(6 * np.arctan2(p[..., 0], p[..., 2])) + .04 * np.sin(p[..., 1] * 6))
    fig.add('bulbskin', 'bulb', 'gH', hide(bulb, 6.1, .06, 2.2, .02), 1500, voxel=.03, uv=('cyl',))
    rb = [S.chain(S.bez((c * .42, 4.42, s * .42), (c * 2.25, 3.3, s * 2.1), (c * 1.7, .55, s * 1.6), 9), list(np.linspace(.12, .17, 10))) for c, s in circle(6)]
    fig.add('bulbribs', 'bulb', 'gB', S.union(*rb), 700, voxel=.024, uv=('cyl',))
    vents, glow = [], []
    for x, z, r in ((.6, .4, .5), (-.5, .6, .38), (0, -.7, .45)):
        vents.append(S.cut(Vk.lathe([(r, 0), (r * .92, .4), (r * .62, .56)], c=(x, 3.95, z)), S.cyl((x, 4.2, z), (x, 4.7, z), r * .42)))
        glow.append(S.ellipsoid((x, 4.42, z), (r * .5, r * .2, r * .5)))
    fig.add('vents', 'bulb', 'gD', S.union(*vents), 300, voxel=.02, uv=('cyl',))
    for c, s in circle(3, .52):
        glow.append(S.ellipsoid((c * 1.75, 2.3, s * 1.66), (.36, .52, .36)))
    fig.add('glow', 'bulb', 'gS', S.union(*glow, G.sacs((0, 1.25, 1.55), 4, .4, 9)), 520, voxel=.022, uv=('top',))
    return fig


# ---------------------------------------------------------------- Warren
def warren():
    fig = site.building('warren', 4.6, 4.0, 5.2)
    fig.group('body')
    hill = S.ellipsoid((0, 0, 0), (3.7, 2.1, 3.0))
    hill = S.bump(hill, lambda p: .22 * np.sin(p[..., 0] * 1.7) * np.cos(p[..., 2] * 1.5) * np.clip(p[..., 1], 0, 1))
    holes = [(1.8, 1.2, 2.0, .7), (-1.6, 1.5, 1.8, .55), (0, 2.25, 1.35, .5), (2.5, 1.0, -1.2, .6), (-2.3, 1.0, -1.4, .55)]
    lips, maws = [], []
    for x, y, z, r in holes:
        P = V(x, y, z)
        n = P / V(3.7, 2.1, 3.0) ** 2
        n = n / np.linalg.norm(n)
        hill = S.cut(hill, S.ellipsoid(P - n * r * .35, (r * .95, r * .95, r * .95)), k=.12)
        t = np.cross(n, V(0, 1, 0))
        lips.append(S.torus(P + n * .04, r * .98, r * .26, S.basis(t, n)))
        maws.append(S.sphere(P - n * r * 1.0, r * .96))
    fig.add('hill', 'body', 'gH', S.both(hide(hill, 7.7, .08, 1.6, .025), S.above(-.08)), 2200, voxel=.036, uv=('cyl',))
    fig.add('lips', 'body', 'gD', hide(S.union(*lips), 2.5, .03, 5, .01), 620, voxel=.024, uv=('top',))
    fig.add('maws', 'body', 'gMaw', S.union(*maws), 260, voxel=.03, uv=('top',))
    props = [rib_out(c, s, 3.05, .25, .8, 2.5 + (i % 3) * .55, .24, .8) for i, (c, s) in enumerate(circle(9, .2))]
    fig.add('props', 'body', 'gBn', S.union(*props), 760, voxel=.026, uv=('cyl',))
    shroom(fig, 'a', 'body', (-1, 2.75, -.6), 1.1, .7, (.1, 0, .2), 1.0, foot=(-1.0, 1.7, -.6))
    shroom(fig, 'b', 'body', (1.2, 2.45, -1.4), .7, .5, (-.2, 0, -.3), 2.0, foot=(1.1, 1.5, -1.3))
    fig.add('sacs', 'body', 'gS', G.sacs((.1, 2.12, .25), 5, .32, 13), 300, voxel=.02, uv=('top',))
    return fig


# ---------------------------------------------------------------- Quill Garden
def quillgarden():
    fig = site.building('quillgarden', 4.8, 4.4, 7.6)
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(3.65, .92, 3.15, 9.0), 800, voxel=.036, uv=('top',))
    quills, collars = [], []
    for i in range(16):
        a = i / 16 * TAU
        d, c, s = 1.2 + (i % 3) * .9, np.cos(a), np.sin(a)
        l = 3.2 + (i % 4) * 1.1 - d * .4
        b = V(c * d, .35, s * d * .85)
        dr = V(c * .34, .94, s * .34)
        quills.append(S.rcone(b, b + dr * l, .27, .012))
        collars.append(S.torus(b + V(0, .32, 0), .3, .13, squash=.9))
    quills.append(S.rcone((0, .3, 0), (.1, 6.9, 0), .5, .015))
    collars.append(S.torus((0, .75, 0), .56, .2))
    q = S.union(*quills)
    q = S.bump(q, lambda p: .028 * np.sin(p[..., 1] * 7.5 + p[..., 0] * 2))                 # growth rings
    fig.add('quills', 'body', 'gBn', q, 2000, voxel=.034, uv=('cyl',))
    fig.add('collars', 'body', 'gD', hide(S.union(*collars), 3.0, .03, 5, .01), 700, voxel=.028, uv=('top',))
    pods, stems = [], []
    for x, z in ((2.4, 1.4), (-2.2, 1.8), (-1.8, -1.9), (2.2, -1.6)):
        pods.append(S.union(S.ellipsoid((x, 1.2, z), (.56, .66, .56)), S.rcone((x, 1.6, z), (x, 2.05, z), .22, .04), k=.2))
        stems.append(Vk.lathe([(.6, 0), (.72, .4), (.45, .8)], c=(x, .05, z)))
    fig.add('pods', 'body', 'gS', S.union(*pods), 420, voxel=.024, uv=('cyl',))
    fig.add('stems', 'body', 'gD', hide(S.union(*stems), 4.0, .03, 5, .01), 320, voxel=.026, uv=('cyl',))
    fins = [G.crescent_fin((np.cos(a) * .42, 1.5 + i * .62, np.sin(a) * .42), .95 - i * .08, .045, rot(0, -a, 0) @ rot(0, 0, -PI / 2 + .3)) for i, a in enumerate(np.arange(5) / 5 * TAU + .6)]
    fig.add('frills', 'body', 'gG', S.union(*fins), 520, voxel=.02, uv=('side',))
    return fig


# ---------------------------------------------------------------- Blister Bed
def blisterbed():
    fig = site.building('blisterbed', 4.9, 4.9, 4.2)
    fig.group('body')
    dish = Vk.lathe([(3.25, 0), (3.66, .6), (3.5, 1.4), (3.1, 1.5), (2.8, 1.46)])
    dish = S.bump(dish, lambda p: .12 * np.sin(8 * np.arctan2(p[..., 0], p[..., 2]) + 1.0) * np.clip(p[..., 1] / 1.4, 0, 1))
    dish = S.cut(dish, S.ellipsoid((0, 1.8, 0), (3.0, .88, 3.0)), k=.08)
    fig.add('dish', 'body', 'gH', S.both(hide(dish, 4.4, .08, 1.7, .025), S.above(-.08)), 1700, voxel=.036, uv=('cyl',))
    spots = [(0, 0, 1.6), (1.6, .8, 1.1), (-1.4, 1.0, 1.0), (-1.0, -1.4, 1.2), (1.3, -1.3, .9), (0, 2.0, .8)]
    cups = []
    for i, (x, z, r) in enumerate(spots):
        o = V(x, 1.0 + r * .4, z)
        fig.group('pod%d' % i, o)
        pod = S.ellipsoid(o, (r * .8, r * .7, r * .8))
        pod = S.bump(pod, lambda p, o=o, r=r: r * .035 * np.sin(7 * np.arctan2(p[..., 0] - o[0], p[..., 2] - o[2]) + (p[..., 1] - o[1]) * 3 / r))
        fig.add('sac%d' % i, 'pod%d' % i, 'gS', pod, int(150 + 130 * r), voxel=.026, uv=('cyl',))
        fig.add('nub%d' % i, 'pod%d' % i, 'gBc', S.union(S.ellipsoid(o + V(0, r * .66, 0), (r * .3, r * .12, r * .3)), S.rcone(o + V(0, r * .7, 0), o + V(0, r * .98, 0), r * .1, r * .02)), 70, voxel=.018, uv=('top',))
        cups.append(S.torus((x, .98, z), r * .72, r * .2, squash=.8))
    fig.add('cups', 'body', 'gD', hide(S.union(*cups), 2.0, .03, 4, .01), 760, voxel=.028, uv=('top',))
    drool = [S.chain([(c * 3.35, 1.4, s * 3.35), (c * 3.85, .8, s * 3.85), (c * 4.3, .02, s * 4.3)], [.2, .18, .06]) for c, s in circle(8)]
    fig.add('drool', 'body', 'gD', S.both(S.union(*drool), S.above(-.05)), 520, voxel=.026, uv=('cyl',))
    th = [rib_out(c, s, 3.2, .9, .5, 1.5, .16) for c, s in circle(5, .4)]
    fig.add('thorns', 'body', 'gBn', S.union(*th), 320, voxel=.022, uv=('cyl',))
    return fig


# ---------------------------------------------------------------- Tusk Hollow
def tuskhollow():
    fig = site.building('tuskhollow', 5.4, 6.2, 7.4)
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(4.75, 1.2, 3.75, 11.0), 800, voxel=.04, uv=('top',))
    den = S.ellipsoid((0, 1.2, 0), (2.35, 1.65, 2.75))
    den = S.cut(den, S.ellipsoid((0, 1.25, 2.75), (1.0, 1.05, .95)), k=.2)
    fig.add('den', 'body', 'gD', S.both(hide(den, 12.3, .08, 1.9, .025), S.above(0)), 1100, voxel=.036, uv=('cyl',))
    fig.add('denmaw', 'body', 'gMaw', S.ellipsoid((0, 1.25, 1.95), (.95, 1.0, .6)), 120, voxel=.03, uv=('top',))
    ribs = []
    for i in range(5):
        z, h = -2.6 + i * 1.3, 5.6 - abs(i - 2) * .6
        for sx in (-1, 1):
            pts = Vk.curve([(sx * 3.55, .15, z), (sx * 3.75, h * .58, z), (sx * 1.75, h, z * .9), (sx * .2, h + .32, z * .8)], 12)
            ribs.append(Vk.horn(pts, Vk.radii([.44, .37, .28, .17], len(pts)), plates=6, lip=.035))
    fig.add('ribs', 'body', 'gB', S.union(*ribs), 2400, voxel=.036, uv=('cyl',))
    sp = S.chain(S.bez((0, 5.6, -3.3), (0, 6.5, 0), (0, 5.35, 3.3), 10), .42)
    sp = S.bump(sp, lambda p: .12 * np.maximum(np.cos(p[..., 2] * 4.83), 0) ** 2)                 # the knuckles of a backbone
    fig.add('spine', 'body', 'gBp', sp, 520, voxel=.032, uv=('side',))
    tusks = [Vk.horn(Vk.curve([(sx * 1.4, .5, 3.3), (sx * 2.65, 1.4, 4.6), (sx * 2.45, 3.2, 5.45), (sx * 1.35, 4.3, 5.05)], 12), Vk.radii([.56, .48, .3, .04], 13), plates=5, lip=.03) for sx in (-1, 1)]
    fig.add('tusks', 'body', 'gB', S.union(*tusks), 700, voxel=.03, uv=('cyl',))
    fig.add('sacs', 'body', 'gS', G.sacs((0, 2.65, .5), 7, .7, 17), 520, voxel=.028, uv=('top',))
    shroom(fig, 'a', 'body', (2.75, 5.0, -2.0), .9, .6, (0, 0, -.4), 4.0, foot=(2.5, 4.3, -1.9))
    return fig


# ---------------------------------------------------------------- Old Growth
def oldgrowth():
    fig = site.building('oldgrowth', 4.6, 4.6, 11.2)
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(3.25, 1.0, 3.25, 13.0), 600, voxel=.036, uv=('top',))
    tp = Vk.curve([(0, 0, 0), (.4, 3, .2), (-.2, 6, 0), (.2, 9.1, -.2)], 14)
    trunk = Vk.horn(tp, Vk.radii([1.42, 1.02, .82, .52], len(tp)), flutes=7, flute=.07, turn=.5)
    arms = []
    tops = []
    for y, a, l, r in ((3.4, .4, 2.6, 1.2), (5.2, 2.6, 2.2, 1.0), (6.8, 4.4, 2.0, .9), (8.2, 1.4, 1.6, .8)):
        ex, ez = np.cos(a) * l, np.sin(a) * l
        arms.append(S.chain([(0, y, 0), (ex * .6, y + .5, ez * .6), (ex, y + 1.05, ez)], [.44, .32, .22]))
        tops.append((V(ex, y + 1.1, ez), r))
    fig.add('trunk', 'body', 'gH', hide(S.union(trunk, *arms, k=.25), 14.1, .08, 1.8, .025), 2400, voxel=.036, uv=('cyl',))
    for i, (p, r) in enumerate(tops):
        fig.group('cap%d' % i, p)
        shroom(fig, 'c%d' % i, 'cap%d' % i, p, r, r * .6, (0, 0, 0), i + 1.0, drips=7, tris=.8)
    fig.group('cap4', (.2, 9.2, -.2))
    shroom(fig, 'c4', 'cap4', (.2, 9.2, -.2), 1.8, 1.1, (0, 0, 0), 6.0, drips=11)
    fig.add('c4lamps', 'cap4', 'gS', S.union(*[S.ellipsoid((.2 + c * 1.6, 8.95, -.2 + s * 1.6), (.1, .17, .1)) for c, s in circle(6, .3)]), 180, voxel=.018, uv=('top',))
    sh = []
    for i, (t, a) in enumerate(((.16, 2.0), (.3, 4.6), (.42, 1.0), (.55, 3.4), (.68, 5.6))):
        c, d, r = Vk.along(tp, Vk.radii([1.42, 1.02, .82, .52], len(tp)), t)
        o = V(np.cos(a), 0, np.sin(a))
        sh.append(S.ellipsoid(c + o * (r + .22), (.62 - i * .05, .13, .62 - i * .05), rot(.12 * np.sin(a), 0, -.12 * np.cos(a))))
    fig.add('shelves', 'body', 'gCn', S.union(*sh), 420, voxel=.024, uv=('top',))
    fig.add('sacs', 'body', 'gS', G.sacs((0, 1.5, 1.25), 6, .5, 23), 380, voxel=.024, uv=('top',))
    rt = [((c * 1.0, .4, s * 1.0), (c * 4.1, .02, s * 4.1)) for c, s in circle(5)]
    fig.add('roots', 'body', 'gD', S.both(roots(rt, .42, 5.0), S.above(-.05)), 560, voxel=.032, uv=('top',))
    return fig


# ---------------------------------------------------------------- Stinger Stalk
def stinger():
    fig = site.building('stinger', 2.4, 3.0, 8.8)
    fig.group('body')
    fig.add('bed', 'body', 'gHn', mound(1.62, .62, 1.62, 15.0, .08), 360, voxel=.026, uv=('top',))
    sp = Vk.curve([(0, 0, 0), (.2, 2.4, 0), (-.1, 4.8, .1), (0, 6.45, 0)], 14)
    rs = Vk.radii([.72, .5, .42, .36], len(sp))
    fig.add('stalk', 'body', 'gH', hide(Vk.horn(sp, rs, plates=6, lip=.05), 16.0, .04, 3.4, .012), 1200, voxel=.024, uv=('cyl',))
    fig.add('rings', 'body', 'gB', S.union(*[Vk.band(sp, rs, t, .1, .03) for t in (.2, .4, .6, .8)]), 520, voxel=.022, uv=('cyl',))
    th = []
    for i in range(7):
        c, d, r = Vk.along(sp, rs, .14 + i * .11)
        a = i * 2.4
        o = V(np.cos(a), .5, np.sin(a))
        o = o / np.linalg.norm(o)
        th.append(S.rcone(c + o * r * .6, c + o * (r + .55), .09, .012))
    fig.add('thorns', 'body', 'gBn', S.union(*th), 260, voxel=.018, uv=('cyl',))
    fig.group('tip', (0, 6.4, 0))
    O = V(0, 6.4, 0)
    tp = Vk.curve([O, O + V(0, .9, .3), O + V(0, 1.4, 1.1), O + V(0, 1.1, 1.8)], 12)
    fig.add('tail', 'tip', 'gH', hide(Vk.horn(tp, Vk.radii([.37, .3, .2, .12], len(tp)), plates=5, lip=.04), 17.0, .03, 4, .01), 620, voxel=.02, uv=('side',))
    pl = []
    for i in range(4):
        c, d, r = Vk.along(tp, Vk.radii([.37, .3, .2, .12], len(tp)), .15 + i * .22)
        up = np.cross(d, V(1, 0, 0))
        up = up / np.linalg.norm(up)
        pl.append(S.cut(S.ellipsoid(c + up * r * .55, (r * 1.05, r * .62, r * 1.05), S.basis(d, up)), S.plane(c + up * r * .2, up)))
    fig.add('plates', 'tip', 'gBc', S.union(*pl), 360, voxel=.016, uv=('top',))
    E = O + V(0, 1.1, 1.8)
    fig.add('barb', 'tip', 'gBn', bone(E + V(0, .05, -.1), E + V(0, -.1, .55), E + V(0, -.8, .7), .15, .04), 160, voxel=.014, uv=('cyl',))
    fig.add('gland', 'tip', 'gS', S.union(S.sphere(O + V(0, .1, -.12), .27), S.sphere(E + V(0, -.02, .08), .15)), 200, voxel=.016, uv=('top',))
    return fig


MAKERS = dict(mothercap=mothercap, sporesac=sporesac, warren=warren, quillgarden=quillgarden, blisterbed=blisterbed, tuskhollow=tuskhollow, oldgrowth=oldgrowth, stinger=stinger)
if __name__ == '__main__':
    site.main(MAKERS, __file__)
