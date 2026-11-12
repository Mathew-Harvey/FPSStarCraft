"""What Ironhold builds from: scrap sheet, girders, tanks, stacks and poured pads, all of it knocked about.

Nothing here is square on purpose. A wall is whatever sheets were lying about, lapped over each other and screwed down;
a tank has been backed into; a stack leans. The helpers add their parts to a figure directly, because a wall is many
parts (one per sheet, so each sheet carries its own painted skin).
"""
import numpy as np
from . import sdf as S
from .sdf import V, rot, F

PI = np.pi
CORR = ('wallR', 'wallT', 'wallY', 'wallG')                      # skins painted as ribbed iron. The ribs stay in the paint: sculpted ones do not survive a building's triangle budget
FRONT, RIGHT, BACK, LEFT = rot(0, 0, 0), rot(0, PI / 2, 0), rot(0, PI, 0), rot(0, -PI / 2, 0)   # which way a wall faces: +z, +x, -z, -x
FLAT = rot(-PI / 2, 0, 0)                                         # a sheet lying on a roof, its top edge toward -z


def knocked(f, seed, amp=.04, freq=1.0):
    """Knocks and shallow dishes in sheet steel."""
    return S.bump(f, lambda p: -amp * np.clip(1 - np.abs(S.noise(p, freq, seed) - .5) * 5, 0, 1))


def sheet(c, w, h, R=None, t=.06, corr=0.0, pitch=.42, seed=1.0, dent=.035, peel=None, bow=0.0, across=False, studs=.028):
    """A sheet of iron centred on c, standing in its own xy plane (x across, y up, z out). corr waves it, dent knocks it
    about, peel=(sx, sy, amount) curls that corner away from the wall, and studs is the size of the screws along its edges."""
    c = V(c)
    kx = 2 * PI / pitch

    def f(p):
        q = S.local(p, c, R)
        x, y, z = q[..., 0], q[..., 1], q[..., 2]
        if bow:
            z = z - bow * (1 - (2 * y / h) ** 2) * (1 - (2 * x / w) ** 2)
        if corr:
            z = z - corr * np.clip(np.sin((y if across else x) * kx) * 2.4, -1, 1)      # pressed ribs with flat tops, not a sine
        if dent:
            n2 = S.noise(np.stack([x, y, np.zeros_like(x)], -1), 1.1, seed)
            z = z + dent * np.clip((n2 - .66) * 7, 0, 1)             # a few dishes, the rest stays flat plate
        if peel:
            k = np.clip(peel[0] * x / (w / 2) + peel[1] * y / (h / 2) - 1.25, 0, 1)
            z = z - peel[2] * k * k * 4
        d = np.stack([np.abs(x) - w / 2, np.abs(y) - h / 2, np.abs(z) - t / 2], -1) + .012
        o = np.sqrt((np.maximum(d, 0) ** 2).sum(-1)) + np.minimum(d.max(-1), 0) - .012
        if studs:
            sp = w / max(2, round(w / .55))
            xr = np.clip((np.floor(x / sp) + .5) * sp, -(w / 2 - .09), w / 2 - .09)
            yr = np.where(y > 0, h / 2 - .1, -(h / 2 - .1))
            o = np.minimum(o, np.sqrt((x - xr) ** 2 + (y - yr) ** 2 + (z - t / 2) ** 2) - studs)
        return (o * .8).astype(F)
    return f


def clad(fig, tag, o, R, w, h, mats, seed, holes=(), group='body', voxel=.028, out=-.085, rows=True, wide=(1.5, 2.7), corr=0.0, tris=1.0):
    """Covers a wall with lapped sheets of scrap. o is the middle of the wall's bottom edge, R the way it faces, and the
    sheets fill w across and h up. holes are (x0, x1, y0, y1) openings in the wall's own coordinates (x from the middle,
    y from the bottom). The sheets stop just short of the wall's nominal face, so what the game hangs there still shows."""
    o = V(o)
    rng = np.random.default_rng(int(seed * 1000) + 7)
    xs = [-w / 2]
    while xs[-1] < w / 2 - .01:
        step = rng.uniform(*wide)
        if w / 2 - (xs[-1] + step) < wide[0] * .6:
            step = w / 2 - xs[-1]
        xs.append(xs[-1] + step)
    n = 0
    for i in range(len(xs) - 1):
        x0, x1 = xs[i], xs[i + 1]
        cuts = [0, h * rng.uniform(.42, .62), h] if rows and h > 2.6 and rng.random() < .55 else [0, h]
        for j in range(len(cuts) - 1):
            y0, y1 = cuts[j], cuts[j + 1]
            if any(x0 >= a - .05 and x1 <= b + .05 and y0 >= c0 - .05 and y1 <= c1 + .05 for a, b, c0, c1 in holes):
                continue                                         # a door swallowed this sheet whole
            sw, sh = x1 - x0 + .16, y1 - y0 + (.14 if j < len(cuts) - 2 else 0)
            mat = mats[int(rng.integers(len(mats)))]
            lift = out + .03 * ((i + j) % 2) + rng.uniform(0, .01)
            Rs = (R @ rot(0, 0, rng.uniform(-.022, .022))).astype(F)
            c = o + R @ V((x0 + x1) / 2, y0 + sh / 2, lift)
            peel = (int(rng.choice([-1, 1])), int(rng.choice([-1, 1])), float(rng.uniform(.03, .07))) if rng.random() < .3 else None
            wavy = mat in CORR
            f = sheet(c, sw, sh, Rs, corr=corr if wavy else 0, seed=seed * 7 + n, dent=float(rng.uniform(.04, .08)), peel=peel)
            for a, b, c0, c1 in holes:
                if a < x1 and b > x0 and c0 < y1 and c1 > y0:
                    f = S.cut(f, S.box(o + R @ V((a + b) / 2, (c0 + c1) / 2, 0), ((b - a) / 2, (c1 - c0) / 2, .7), 0, R))
            ext = np.abs(Rs) @ V(sw / 2 + .12, sh / 2 + .12, .26)
            fig.add('%s%d' % (tag, n), group, mat, f, int((90 if peel else 64) * tris), voxel=voxel, uv=('plane', c, Rs[:, 0], Rs[:, 1], sw, sh), sharp=35, lo=c - ext, hi=c + ext, planar=4)
            n += 1


def strip(fig, tag, a, b, hgt, thick, mat, seed=1.0, seg=2.4, group='body', up=(0, 1, 0), voxel=.026, tris=40):
    """A band of plate from a to b (a hazard stripe round a roof, a kick board), in short lengths so each carries its own skin."""
    a, b = V(a), V(b)
    L = float(np.linalg.norm(b - a))
    n = max(1, int(round(L / seg)))
    R = S.basis(np.cross(b - a, V(up)), up)                      # local z faces out of the band, local x runs along it
    if float(np.dot(R[:, 0], b - a)) < 0:
        R = (R @ rot(0, PI, 0)).astype(F)
    rng = np.random.default_rng(int(seed * 1000) + 3)
    for i in range(n):
        c = a + (b - a) * ((i + .5) / n) + V(0, rng.uniform(-.02, .02), 0)
        Rs = (R @ rot(0, 0, rng.uniform(-.015, .015))).astype(F)
        ln = L / n + .03
        f = knocked(S.box(c, (ln / 2, hgt / 2, thick / 2), .02, Rs), seed + i, .02, 1.3)
        ext = np.abs(Rs) @ V(ln / 2 + .08, hgt / 2 + .08, thick / 2 + .08)
        fig.add('%s%d' % (tag, i), group, mat, f, tris, voxel=voxel, uv=('plane', c, Rs[:, 0], Rs[:, 1], ln, hgt), sharp=35, lo=c - ext, hi=c + ext, planar=4)


def band(fig, tag, c, w, d, hgt, thick, mat, seed=1.0, group='body'):
    """A strip right round a block w by d, centred on c."""
    c = V(c)
    for i, (p, q) in enumerate((((-w / 2, d / 2), (w / 2, d / 2)), ((w / 2, d / 2), (w / 2, -d / 2)), ((w / 2, -d / 2), (-w / 2, -d / 2)), ((-w / 2, -d / 2), (-w / 2, d / 2)))):
        strip(fig, '%s%d_' % (tag, i), c + V(p[0], 0, p[1]), c + V(q[0], 0, q[1]), hgt, thick, mat, seed + i, group=group)


def pads(fig, w, d, nx, nz, seed=1.0, h=.22, c=(0, 0, 0), group='body', mat='conc'):
    """A concrete pad poured in bays: each bay settles a little differently, cracks its own way and has its own chipped edges."""
    c = V(c)
    rng = np.random.default_rng(int(seed * 1000) + 11)
    for i in range(nx):
        for j in range(nz):
            bw, bd = w / nx, d / nz
            o = c + V(-w / 2 + bw * (i + .5), 0, -d / 2 + bd * (j + .5))
            hh = h + rng.uniform(-.03, .03)
            R = rot(rng.uniform(-.008, .008), 0, rng.uniform(-.008, .008))
            f = S.box(o + V(0, hh / 2, 0), (bw / 2 - .025, hh / 2, bd / 2 - .025), .035, R)
            sd = seed * 3 + i * 5 + j
            f = S.bump(f, lambda p, sd=sd: -.06 * np.clip((S.noise(p, .9, sd) - .68) * 6, 0, 1))        # spalled patches
            x, z = o[0] + rng.uniform(-bw * .3, bw * .3), o[2] - bd / 2
            pts = [V(x, hh, z)]
            for _ in range(4):
                x, z = x + rng.uniform(-.5, .5), z + bd * rng.uniform(.18, .3)
                pts.append(V(x, hh, z))
            f = S.groove(f, pts, .04, .05)
            if rng.random() < .5:                                 # a corner knocked off
                sx, sz = (1 if i == nx - 1 else -1), (1 if j == nz - 1 else -1)
                k = o + V(sx * (bw / 2 - rng.uniform(.3, .7)), 0, sz * bd / 2)
                f = S.cut(f, S.plane(k, V(-sx, -.4, -sz * rng.uniform(.6, 1.2))))
            ext = V(bw / 2 + .1, hh + .1, bd / 2 + .1)
            fig.add('pad%d%d' % (i, j), group, mat, f, 110, voxel=.035, uv=('box',), sharp=40, lo=o - ext, hi=o + ext, planar=4)


def beam(a, b, w, d=None, up=(0, 1, 0), r=.015):
    """A box girder from a to b."""
    a, b = V(a), V(b)
    ax = b - a
    u = V(up)
    if abs(float(np.dot(ax / np.linalg.norm(ax), u))) > .95:
        u = V(1, 0, 0)
    return S.box((a + b) / 2, (w / 2, (d or w) / 2, float(np.linalg.norm(ax)) / 2 + w * .3), r, S.basis(ax, u))


def tower(fig, tag, y0, bx, bz, y1, tx, tz, levels, leg, mats=('bY', 'bD', 'bD'), group='body', voxel=.035, seed=1.0, tris=(700, 420, 380)):
    """A lattice tower on four legs, from a base bx by bz (half widths) at y0 in to tx by tz at y1, with a ring of rails at
    each of `levels` (fractions of the way up) and one diagonal across every bay. Gusset plates sit where they meet."""
    at = lambda sx, sz, k: V(sx * (bx + (tx - bx) * k), y0 + (y1 - y0) * k, sz * (bz + (tz - bz) * k))
    legs, rails, braces, plates = [], [], [], []
    for sx in (-1, 1):
        for sz in (-1, 1):
            legs.append(beam(at(sx, sz, 0), at(sx, sz, 1), leg))
    ks = [0.0] + list(levels) + [1.0]
    for n, k in enumerate(ks[1:-1]):
        for s in (-1, 1):
            rails.append(beam(at(-1, s, k), at(1, s, k), leg * .6))
            rails.append(beam(at(s, -1, k), at(s, 1, k), leg * .6))
        for sx in (-1, 1):
            for sz in (-1, 1):
                plates.append(S.box(at(sx, sz, k), (leg * .8, leg * 1.1, leg * .8), .02))
    for n in range(len(ks) - 1):
        k0, k1 = ks[n], ks[n + 1]
        f = 1 if n % 2 == 0 else -1
        for s in (-1, 1):
            braces.append(beam(at(-f, s, k0), at(f, s, k1), leg * .42))
            braces.append(beam(at(s, f * s, k0), at(s, -f * s, k1), leg * .42))
    lo, hi = V(-bx - .4, y0 - .2, -bz - .4), V(bx + .4, y1 + .4, bz + .4)
    fig.add(tag + 'legs', group, mats[0], knocked(S.union(*legs, *plates), seed, .02, 1.5), tris[0], voxel=voxel, uv=('box',), sharp=35, lo=lo, hi=hi, planar=4)
    fig.add(tag + 'rails', group, mats[1], S.union(*rails), tris[1], voxel=voxel, uv=('box',), sharp=35, lo=lo, hi=hi, planar=4)
    fig.add(tag + 'braces', group, mats[2], S.union(*braces), tris[2], voxel=voxel, uv=('box',), sharp=35, lo=lo, hi=hi, planar=4)


def tank(fig, tag, c, r, h, mats=('bS', 'cY', 'nD'), seed=1.0, dome=.75, group='body', tris=1.0, voxel=.032):
    """An upright tank standing on c: a dented shell with a weld seam, a domed lid and two bands."""
    c = V(c)
    shell = knocked(S.cyl(c, c + V(0, h, 0), r, .04), seed, .06, .9)
    shell = S.groove(shell, [c + V(0, 0, r), c + V(0, h, r)], .035, .035)
    fig.add(tag + 'shell', group, mats[0], shell, int(360 * tris), voxel=voxel, uv=('cyl', c + V(0, h / 2, 0), (0, 1, 0)), sharp=40)
    if dome:
        lid = S.both(S.ellipsoid(c + V(0, h - .02, 0), (r * 1.04, dome, r * 1.04)), S.above(c[1] + h - .04))
        lid = S.union(knocked(lid, seed + 3, .04, 1.2), S.cyl(c + V(r * .3, h + dome * .8, 0), c + V(r * .3, h + dome * 1.12, 0), r * .2, .02))   # a filler cap
        fig.add(tag + 'lid', group, mats[1], lid, int(260 * tris), voxel=voxel, uv=('top',), sharp=40)
    bands = S.union(*[S.torus(c + V(0, h * k, 0), r + .012, .055, squash=1.4) for k in (.16, .84)])
    fig.add(tag + 'bands', group, mats[2], bands, int(260 * tris), voxel=voxel * .8, uv=('cyl',), sharp=40)


def stack(fig, tag, c, r, h, mats=('wallR', 'nD'), lean=(0.0, 0.0), seed=1.0, group='body', n=3, cap=False, tris=1.0, voxel=.03):
    """A chimney standing on c, in n lengths that do not quite line up, open at the top."""
    c = V(c)
    pts = [c + V(lean[0] * (i / n) ** 1.6 * h + (.03 if i % 2 else 0), h * i / n, lean[1] * (i / n) ** 1.6 * h) for i in range(n + 1)]
    rr = [r * (1 - .045 * i) for i in range(n + 1)]
    pipe = S.union(*[S.cyl(pts[i], pts[i + 1] + (pts[i + 1] - pts[i]) * .03, rr[i], .02) for i in range(n)])
    top = pts[-1]
    pipe = S.cut(pipe, S.cyl(top - V(0, .8, 0), top + V(0, .4, 0), rr[n - 1] * .8))
    fig.add(tag + 'pipe', group, mats[0], knocked(pipe, seed, .05, 1.1), int(420 * tris), voxel=voxel, uv=('cyl', c + V(0, h / 2, 0), (0, 1, 0)), sharp=40)
    collars = [S.torus(pts[i], rr[i] + .02, .07, squash=1.3) for i in range(1, n)] + [S.torus(top - V(0, .07, 0), rr[n - 1] + .04, .09)]
    if cap:                                                       # a rain cap on three stays
        collars.append(S.both(S.ellipsoid(top + V(0, .42, 0), (r * 1.5, .3, r * 1.5)), S.above(top[1] + .4)))
        collars += [S.rcone(top + V(np.cos(a) * r * .9, -.05, np.sin(a) * r * .9), top + V(np.cos(a) * r * 1.1, .44, np.sin(a) * r * 1.1), .03) for a in (0, 2.1, 4.2)]
    fig.add(tag + 'rings', group, mats[1], S.union(*collars), int(300 * tris), voxel=voxel * .8, uv=('cyl',), sharp=40)


def pipe(pts, r, flange=1.7):
    """A run of pipe through points, with a flange at each end and a collar at every bend."""
    pts = [V(q) for q in pts]
    fs = [S.chain(pts, r)]
    for i in (0, len(pts) - 1):
        d = pts[1] - pts[0] if i == 0 else pts[-1] - pts[-2]
        d = d / np.linalg.norm(d)
        fs.append(S.cyl(pts[i] - d * r * .35, pts[i] + d * r * .35, r * flange, .01))
    for q in pts[1:-1]:
        fs.append(S.sphere(q, r * 1.3))
    return S.union(*fs)


def hull(fig, tag, c, w, h, d, mat='wallD', inset=.2, group='body'):
    """The dark box behind a building's cladding: what shows through the gaps. c is the middle of its floor."""
    c = V(c)
    f = S.box(c + V(0, h / 2, 0), (w / 2 - inset, h / 2 - .02, d / 2 - inset), .03)
    ext = V(w / 2, h / 2 + .1, d / 2)
    fig.add(tag, group, mat, f, 40, voxel=.05, uv=('box',), lo=c + V(0, h / 2, 0) - ext, hi=c + V(0, h / 2, 0) + ext)


def walls(fig, tag, c, w, h, d, mats, seed, front=(), back=(), left=(), right=(), group='body', clad_h=None, **kw):
    """Hull and cladding for a plain block: c is the middle of its floor; front, back, left and right list each face's openings."""
    c = V(c)
    hull(fig, tag + 'hull', c, w, h, d, group=group)
    ch = clad_h or h
    for name, R, o, ww, holes in (('f', FRONT, V(0, 0, d / 2), w, front), ('r', RIGHT, V(w / 2, 0, 0), d, right), ('b', BACK, V(0, 0, -d / 2), w, back), ('l', LEFT, V(-w / 2, 0, 0), d, left)):
        clad(fig, tag + name, c + o, R, ww, ch, mats, seed + ord(name) * .37, holes, group=group, **kw)


def roof(fig, tag, c, w, d, mats, seed, pitch=0.0, sag=.0, group='body', over=.25, **kw):
    """Sheets laid over a flat or leaning roof: c is the middle of the roof's top face, and pitch tips its back edge up."""
    c = V(c)
    R = (rot(pitch, 0, 0) @ FLAT).astype(F)
    o = c + R @ V(0, -(d / 2 + over), 0)
    clad(fig, tag, o, R, w + over * 2, d + over * 2, mats, seed, group=group, out=.04, rows=True, **kw)
