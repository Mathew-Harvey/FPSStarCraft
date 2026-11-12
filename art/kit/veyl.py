"""Shapes the Veyl are made of: turned shells, a plated tail that sweeps back to a point, cut crystal, long claws, halos."""
import numpy as np
from . import sdf as S
from .sdf import V, rot, F


def spline(pts, n=96):
    """A smooth curve through (radius, height) pairs, as dense samples."""
    P = np.array(pts, float)
    P = np.vstack([P[0], P, P[-1]])
    out = []
    per = max(2, n // (len(P) - 3))
    for i in range(1, len(P) - 2):
        a, b, c, d = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, per, endpoint=False):
            out.append(.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3))
    out.append(P[-2])
    return np.array(out)


def lathe(pts, c=(0, 0, 0), zs=1.0, sweep=None, plates=None, xs=1.0):
    """A turned shape. pts are (radius, height) pairs from the bottom up. zs and xs squash it front to back or side to side,
    sweep(y) slides each height back (a tail curving away), plates=(n, lip) cuts it into n overlapping plates."""
    prof = spline(pts)
    ys, rs = prof[:, 1].astype(F), np.maximum(prof[:, 0], 0).astype(F)
    c = V(c)
    y0, y1 = float(ys[0]), float(ys[-1])

    def f(p):
        q = p - c
        y = q[..., 1]
        z = q[..., 2] - (sweep(y) if sweep else 0)
        R = np.interp(y, ys, rs).astype(F)
        if plates:
            t = np.clip((y - y0) / (y1 - y0), 0, 1) * plates[0]
            R = R + plates[1] * (1 - (t - np.floor(t))) * np.clip(np.minimum(t, plates[0] - t) * 2, 0, 1)
        rho = np.sqrt((q[..., 0] / xs) ** 2 + (z / zs) ** 2)
        d = (rho - R) * .72 * min(zs, xs, 1.0)
        return np.maximum(d, np.maximum(y0 - y, y - y1))
    return f


def tail_sweep(h, sweep):
    return lambda y: -(1 - np.clip(y / h, 0, 1)) ** 2 * sweep


def crystal(a, b, r, n=5, base=.22, spin=0.0):
    """A cut shard from a to b: an n-sided spindle, fattest `base` of the way along, pointed at both ends (the far end sharper)."""
    a, b = V(a), V(b)
    L = float(np.linalg.norm(b - a))
    ax = (b - a) / L
    R = S.basis(ax, (0, 1, 0) if abs(ax[1]) < .9 else (1, 0, 0))
    angs = spin + np.arange(n) * 2 * np.pi / n
    inr = np.cos(np.pi / n)

    def f(p):
        q = (p - a) @ R
        z = q[..., 2] / L
        Rz = r * np.where(z < base, .25 + .75 * np.clip(z / base, -1, 1), np.clip((1 - z) / (1 - base), -1, 1))
        d = np.full(z.shape, -1e9, F)
        for t in angs:
            d = np.maximum(d, q[..., 0] * np.cos(t) + q[..., 1] * np.sin(t) - Rz * inr)
        return np.maximum(d * .8, np.maximum(-q[..., 2], q[..., 2] - L))
    return f


def claw(at, R, s, curl=.5, spread=1.0, thumb=1):
    """A long three-fingered Veyl hand. Local z is the way the fingers reach, local y the back of the hand."""
    k = lambda *a: V(*a) * s
    parts = [S.ellipsoid(k(0, 0, .15), k(.62, .42, .7))]
    for i in (-1, 0, 1):
        kn, mid, tip = k(i * .42, .05, .62), k(i * .7 * spread, -.3 * curl, 1.55), k(i * .78 * spread, -1.2 * curl, 2.35)
        parts += [S.rcone(kn, mid, .25 * s, .19 * s), S.rcone(mid, tip, .19 * s, .035 * s), S.sphere(mid, .21 * s)]
    t0, t1, t2 = k(thumb * .5, -.1, .1), k(thumb * .95, -.5 * curl, .75), k(thumb * .8, -1.1 * curl, 1.3)
    parts += [S.rcone(t0, t1, .22 * s, .16 * s), S.rcone(t1, t2, .16 * s, .03 * s)]
    return S.moved(S.union(*parts, k=.1 * s), d=at, R=R)


def ring(c, R_, r, tilt=(0, 0, 0), squash=1.0):
    """A band lying flat (round the body), tipped by tilt."""
    return S.torus(c, R_, r, rot(*tilt), squash=squash)


def halo(c, R_, r, shards, slen, sr, phase=0.0):
    """An upright ring behind the head with crystal points standing off it. Returns (ring, points)."""
    c = V(c)
    ringf = S.torus(c, R_, r, rot(np.pi / 2, 0, 0), squash=.55)
    pts = []
    for i in range(shards):
        a = phase + i * 2 * np.pi / shards
        d = V(np.cos(a), np.sin(a), 0)
        pts.append(crystal(c + d * (R_ - slen * .3), c + d * (R_ + slen * .7), sr, 4, .35))
    return ringf, S.union(*pts)


def pits(f, seed, amp=.004, freq=26):
    """The fine pitting of old shell."""
    return S.bump(f, lambda p: -amp * np.clip(1 - np.abs(S.noise(p, freq, seed) - .5) * 6, 0, 1))


def arm(Sh, El, Wr, r0, r1, r2, fat=1.28):
    """A thin jointed arm: shoulder, elbow knob, wrist."""
    Sh, El, Wr = V(Sh), V(El), V(Wr)
    r0, r1, r2 = r0 * fat, r1 * fat, r2 * fat
    return S.union(S.rcone(Sh, El, r0, r1), S.rcone(El, Wr, r1 * .92, r2), S.sphere(El, r1 * 1.22), S.sphere(Sh, r0 * 1.1), k=r1 * .3)


def curve(pts, n=14):
    """A smooth line through points in space, as a list of points."""
    return [V(q) for q in spline(pts, n)]


def radii(rs, m):
    """m radii spread evenly along a list of them."""
    return list(np.interp(np.linspace(0, 1, m), np.linspace(0, 1, len(rs)), rs))


def horn(pts, rad, plates=0, lip=0.0, flutes=0, flute=0.0, turn=0.0):
    """A horn grown along a line of points, its radius following `rad`. `plates` rings it with that many overlapping plates,
    each standing `lip` proud at its lower edge; `flutes` runs that many ridges up it, winding by `turn` radians a metre."""
    pts = [V(q) for q in pts]
    L = np.concatenate([[0], np.cumsum([float(np.linalg.norm(pts[i + 1] - pts[i])) for i in range(len(pts) - 1)])])

    def f(p):
        best = tb = cb = None
        for i in range(len(pts) - 1):
            a, ba = pts[i], pts[i + 1] - pts[i]
            h = np.clip(((p - a) * ba).sum(-1) / float((ba * ba).sum()), 0, 1)
            c = a + ba * h[..., None]
            d = np.sqrt(((p - c) ** 2).sum(-1)) - (rad[i] + (rad[i + 1] - rad[i]) * h)
            t = (L[i] + h * (L[i + 1] - L[i])) / L[-1]
            if best is None:
                best, tb, cb = d, t, c
            else:
                m = d < best
                tb, cb, best = np.where(m, t, tb), np.where(m[..., None], c, cb), np.minimum(best, d)
        if plates:
            s = tb * plates
            best = best - lip * (1 - (s - np.floor(s))) * np.clip(np.minimum(s, plates - s) * 2, 0, 1)
        if flutes:
            q = p - cb
            best = best - flute * np.sin(flutes * np.arctan2(q[..., 0], q[..., 2]) + turn * p[..., 1]) * np.clip((1 - tb) * 4, 0, 1)
        return (best * .8).astype(F)
    return f


def along(pts, rad, t):
    """The point a fraction t of the way along a line of points, the way it is heading there, and its radius."""
    pts = [V(q) for q in pts]
    L = np.concatenate([[0], np.cumsum([float(np.linalg.norm(pts[i + 1] - pts[i])) for i in range(len(pts) - 1)])])
    s = t * L[-1]
    i = int(np.clip(np.searchsorted(L, s) - 1, 0, len(pts) - 2))
    h = (s - L[i]) / max(L[i + 1] - L[i], 1e-6)
    d = pts[i + 1] - pts[i]
    return pts[i] + d * h, d / np.linalg.norm(d), rad[i] + (rad[i + 1] - rad[i]) * h


def band(pts, rad, t, r, out=.0):
    """A gold band round a horn, a fraction t of the way up it."""
    c, d, R_ = along(pts, rad, t)
    z = V(0, 0, 1) - d * d[2]
    if np.linalg.norm(z) < .05:
        z = V(1, 0, 0) - d * d[0]
    return S.torus(c, R_ + out, r, S.basis(z, d))


def cluster(c, n, r, h, seed=1.0, spread=.5, sides=5):
    """A clump of crystals grown out of one spot, the tallest in the middle."""
    c = V(c)
    fs = []
    for i in range(n):
        a = seed * 2.4 + i * 2.39996
        k = 1 - .5 * i / max(1, n - 1)
        lean = V(np.cos(a), 0, np.sin(a)) * (spread * (0 if i == 0 else 1))
        up = V(0, 1, 0) + lean
        up = up / np.linalg.norm(up)
        b = c + lean * r * 1.6
        fs.append(crystal(b - up * h * k * .15, b + up * h * k, r * k, sides + (i % 2), .25, a))
    return S.union(*fs)
