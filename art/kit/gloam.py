"""Shapes the Gloam grow: jointed legs, chitin plates, mushroom caps, spore sacs, jaws."""
import numpy as np
from . import sdf as S
from . import veyl as Vk
from .sdf import V, rot, F

PI = np.pi


def hide(f, seed, warts=.012, freq=9.0, grain=.004):
    """Skin that has grown rather than been made: scattered warts and a fine unevenness."""
    return S.bump(f, lambda p: warts * np.clip((S.noise(p, freq, seed) - .6) * 5, 0, 1) + grain * (S.noise(p, freq * 3.1, seed + 4.2) - .5))


def spine(p, d, length, r, tip=.06):
    """A bone thorn from p along d."""
    p, d = V(p), V(d)
    d = d / np.linalg.norm(d)
    return S.rcone(p, p + d * length, r, r * tip)


def bug_leg(hip, sx, reach, drop, fwd, r, thorn=0.0):
    """A jointed leg from the hip out to a knee, then down to a hooked bone foot. Returns {part: (skin, shape, triangles, options)}."""
    hip = V(hip)
    knee = hip + V(sx * reach * .62, reach * .22, fwd * .55)
    foot = hip + V(sx * reach * .92, -drop, fwd)
    ankle = foot + V(-sx * r * .2, r * 2.0, -r * .2)
    out = {}
    mid = (hip + knee) / 2 + V(0, reach * .035, 0)
    thigh = S.union(S.rcone(hip, mid, r * 1.3, r * 1.25), S.rcone(mid, knee, r * 1.25, r * .98), S.sphere(hip, r * 1.35), k=r * .5)
    L = S.Limb(hip, knee, (0, 1, 0))
    thigh = S.bump(thigh, lambda p: r * .12 * np.sin(L.coords(p)[0] * 26) * np.clip(np.cos(L.coords(p)[1]), 0, 1))     # ridged along the top
    thigh = hide(thigh, 3.3 + hip[2] * 5 + sx, r * .14, 1.6 / r * .1 + 8, r * .05)
    out['thigh'] = ('gH', thigh, 200, dict(voxel=max(.0025, r * .05), uv=('cyl', (hip + knee) / 2, knee - hip)))
    smid = (knee + ankle) / 2 + V(sx * r * .55, 0, 0)
    shin = S.union(S.rcone(knee, smid, r * 1.0, r * 1.06), S.rcone(smid, ankle, r * 1.06, r * .66), k=r * .4)
    for t in (.3, .5, .7):                                                                                            # bristles down the outside
        q = knee + (ankle - knee) * t + V(sx * r * (.95 + .5 * np.sin(t * 9)), 0, 0)
        shin = S.union(shin, spine(q, V(sx * 1, -.7, 0), r * 1.3, r * .26), k=r * .12)
    out['shin'] = ('gD', shin, 170, dict(voxel=max(.0025, r * .05), uv=('cyl', (knee + ankle) / 2, ankle - knee)))
    cap = S.ellipsoid(knee + V(sx * r * .15, r * .2, 0), (r * 1.35, r * 1.2, r * 1.35))
    claw = S.union(S.rcone(ankle + V(0, r * .3, 0), foot + V(sx * r * .5, r * .35, r * .5), r * .82, r * .4), S.rcone(foot + V(sx * r * .5, r * .35, r * .5), foot + V(sx * r * 1.25, 0, r * 1.3), r * .4, r * .08),
                   S.rcone(ankle + V(0, r * .2, 0), foot + V(sx * r * .2, 0, -r * 1.0), r * .5, r * .08), k=r * .25)
    bone = S.union(cap, claw)
    if thorn:
        bone = S.union(bone, spine(hip + V(sx * reach * .6, reach * .3, fwd * .55), V(sx * .5, 1, 0), thorn, thorn * .17))
    out['bone'] = ('gBn', bone, 190, dict(voxel=max(.0025, r * .05), uv=('side',)))
    return out


def add_legs(fig, hips, r, drop, thorn=0.0, detail=1.0):
    """hips is a list of (z, reach, fwd, x) rows, one per pair; each leg gets its own group named lg<row><L|R>, as the walk code expects."""
    for i, (z, reach, fwd, x) in enumerate(hips):
        for sx in (-1, 1):
            g = 'lg%d%s' % (i, 'L' if sx < 0 else 'R')
            fig.group(g, (sx * x, drop, z))
            for name, (mat, fn, tris, kw) in bug_leg((sx * x, drop, z), sx, reach, drop, fwd, r, thorn).items():
                fig.add(name + g[2:], g, mat, fn, int(tris * detail), **kw)


def back_plates(a, b, n, w, tilt=-.35):
    """A row of overlapping chitin plates from a to b, widest in the middle."""
    a, b = V(a), V(b)
    fs = []
    for i in range(n):
        t = i / (n - 1) if n > 1 else .5
        k = np.sin(PI * (.15 + t * .7))
        p = a + (b - a) * t
        R = rot(tilt, 0, 0)
        dome = S.ellipsoid(p, (w * k * .52, w * k * .25, w * k * .5), R)
        dome = S.cut(dome, S.ellipsoid(p + V(0, -w * k * .08, 0), (w * k * .47, w * k * .23, w * k * .46), R))
        dome = S.cut(dome, S.plane(p, R @ V(0, 1, 0)))                                                                 # only the top
        dome = S.union(dome, spine(p + R @ V(0, w * k * .22, -w * k * .2), R @ V(0, .5, -1), w * k * .3, w * k * .06), k=w * k * .04)   # a keel ending in a point
        fs.append(dome)
    return S.union(*fs)


def sacs(p, n, r, seed=1):
    """A cluster of spore sacs, placed the same way the game's own clusters are."""
    p = V(p)
    s = [seed]

    def rr():
        s[0] = (s[0] * 9301 + 49297) % 233280
        return s[0] / 233280
    fs = []
    for _ in range(n):
        a, d, k = rr() * 2 * PI, rr() * r * 1.2, r * (.55 + rr() * .6)
        fs.append(S.ellipsoid(p + V(np.cos(a) * d, rr() * r * .5, np.sin(a) * d), (k * .5, k * .45, k * .5)))
    return S.union(*fs, k=r * .08)


def mushroom(p, r, h, tilt=(0, 0, 0), sz=1.0, seed=1.0):
    """A cap grown on a back: a dome with a wavy lip, pale gills under it. Returns (cap, gills)."""
    R = rot(*tilt)
    dome = Vk.lathe([(r * .86, -h * .12), (r, -h * .01), (r * .985, h * .08), (r * .88, h * .45), (r * .58, h * .85), (0, h * 1.0)], zs=sz)
    dome = S.bump(dome, lambda q: r * .035 * np.sin(np.arctan2(q[..., 0], q[..., 2]) * 5 + seed) * np.clip(1 - q[..., 1] / (h * .5), 0, 1)        # the lip wanders
                  + r * .05 * np.clip((S.noise(q, 2.2 / r, seed * 3.7) - .62) * 5, 0, 1))                                                          # pale spots stand proud
    dome = S.cut(dome, S.ellipsoid((0, -h * .16, 0), (r * .9, h * .22, r * .9 * sz)), k=r * .03)                                                    # hollow underneath
    gill = S.both(S.ellipsoid((0, -h * .06, 0), (r * .88, h * .2, r * .88 * sz)), S.below(-h * .02))
    gill = S.bump(gill, lambda q: r * .018 * np.sin(np.arctan2(q[..., 0], q[..., 2]) * 26))
    stem = S.rcone((0, -h * .5, 0), (0, -h * .05, 0), r * .2, r * .26)
    gill = S.union(gill, stem, k=r * .05)
    return S.moved(dome, d=p, R=R), S.moved(gill, d=p, R=R)


def jaw(p, w, l, n, up=1, seed=0.0):
    """Half a mouth lying along +z: the lip, the dark inside, a ragged row of teeth. Returns (lip, maw, teeth)."""
    p = V(p)
    lip = S.ellipsoid(p, (w * .5, w * .17, l * .5))
    lip = S.cut(lip, S.plane(p + V(0, up * w * .05, 0), (0, -up, 0)))                                                   # flat on the biting side
    maw = S.ellipsoid(p + V(0, up * w * .035, l * .02), (w * .43, w * .06, l * .45))
    teeth = []
    for i in range(n):
        t = i / (n - 1)
        a = -1.1 + t * 2.2
        ln = w * .22 * (.7 + .6 * abs(np.sin(i * 2.3 + seed)))
        teeth.append(spine(p + V(np.sin(a) * w * .42, up * w * .03, np.cos(a) * l * .44), V(np.sin(a) * .15, up, .1), ln, w * .05))
    return lip, maw, S.union(*teeth)


def crescent_fin(c, r, t, R, a0=-.9, a1=.9, n=7):
    """A gill frill: a fan of soft ribs joined by a web."""
    c = V(c)
    ribs = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        ribs.append(S.rcone(c, c + R @ V(np.sin(a) * r, np.cos(a) * r, 0) * (.8 + .2 * np.cos(a * 1.3)), t * 1.6, t * .5))
    web = S.both(S.both(S.sphere(c, r * .8), S.slab(c, R @ V(0, 0, 1), t * .45)), S.plane(c, R @ V(0, -1, 0)))
    return S.union(S.union(*ribs), web, k=t)
