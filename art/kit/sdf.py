"""Sculpting with distance fields.

A shape is a function from points (N, 3) to signed distances (N,), negative inside. Shapes are blended with
smooth unions so forms flow into each other the way clay does, and creases are cut with hard ones. Coordinates are the
game's: x across, y up, z forward, in metres.
"""
import numpy as np

F = np.float32


def V(*a):
    return np.array(a[0] if len(a) == 1 else a, dtype=F)


def length(v):
    return np.sqrt((v * v).sum(-1))


def dot(a, b):
    return (a * b).sum(-1)


def rot(rx=0.0, ry=0.0, rz=0.0):
    """Rotation matrix, applied x then y then z. Columns are the local axes in world space."""
    cx, sx, cy, sy, cz, sz = np.cos(rx), np.sin(rx), np.cos(ry), np.sin(ry), np.cos(rz), np.sin(rz)
    X = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Z = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return (Z @ Y @ X).astype(F)


def local(p, c, R=None):
    q = p - V(c)
    return q if R is None else q @ R


# ---------------------------------------------------------------- primitives
def sphere(c, r):
    c = V(c)
    return lambda p: length(p - c) - r


def ellipsoid(c, r, R=None):
    r = V(r)

    def f(p):
        q = local(p, c, R)
        k0 = length(q / r)
        k1 = length(q / (r * r))
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)
    return f


def box(c, h, r=0.0, R=None):
    h = V(h)

    def f(p):
        q = np.abs(local(p, c, R)) - h + r
        return length(np.maximum(q, 0)) + np.minimum(q.max(-1), 0) - r
    return f


def rcone(a, b, r1, r2=None):
    """A capsule from a to b whose radius runs from r1 to r2."""
    a, b = V(a), V(b)
    r2 = r1 if r2 is None else r2
    ba = b - a
    l2 = float(dot(ba, ba))
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2

    def f(p):
        pa = p - a
        y = dot(pa, ba)
        z = y - l2
        w = pa * l2 - ba * y[..., None]
        x2 = dot(w, w)
        y2 = y * y * l2
        z2 = z * z * l2
        k = np.sign(rr) * rr * rr * x2
        d = (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1
        d = np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1, d)
        d = np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - r2, d)
        return d.astype(F)
    return f


def cyl(a, b, r, rnd=0.0):
    """A capped cylinder from a to b, with its rims rounded by `rnd`."""
    a, b = V(a), V(b)
    ba = b - a
    L = float(length(ba))
    ax = ba / L

    def f(p):
        pa = p - a
        t = dot(pa, ax)
        rad = length(pa - ax * t[..., None])
        dx = rad - r + rnd
        dy = np.abs(t - L * .5) - L * .5 + rnd
        return np.minimum(np.maximum(dx, dy), 0) + np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dy, 0) ** 2) - rnd
    return f


def torus(c, R_, r, R=None, squash=1.0):
    """A ring of radius R_ and thickness r lying in the local xz plane (its axis is local y)."""
    def f(p):
        q = local(p, c, R)
        k = np.sqrt(q[..., 0] ** 2 + q[..., 2] ** 2) - R_
        return np.sqrt(k * k + (q[..., 1] / squash) ** 2) - r
    return f


def plane(c, n):
    """Everything behind the plane through c with normal n is inside."""
    c, n = V(c), V(n)
    n = n / length(n)
    return lambda p: dot(p - c, n)


def chain(pts, rad):
    """A tube through a list of points, as round cones joined end to end."""
    rad = [rad] * len(pts) if np.isscalar(rad) else list(rad)
    fs = [rcone(pts[i], pts[i + 1], rad[i], rad[i + 1]) for i in range(len(pts) - 1)]
    return union(*fs)


def bez(p0, p1, p2, n=8):
    """Points along a quadratic curve."""
    p0, p1, p2 = V(p0), V(p1), V(p2)
    return [((1 - t) ** 2 * p0 + 2 * t * (1 - t) * p1 + t * t * p2) for t in np.linspace(0, 1, n + 1)]


# ---------------------------------------------------------------- combining
def _smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k * .25


def union(*fs, k=0.0):
    def f(p):
        d = fs[0](p)
        for g in fs[1:]:
            e = g(p)
            d = _smin(d, e, k) if k > 0 else np.minimum(d, e)
        return d
    return f


def cut(a, *bs, k=0.0):
    """a with every b carved out of it."""
    def f(p):
        d = a(p)
        for b in bs:
            e = -b(p)
            d = -_smin(-d, -e, k) if k > 0 else np.maximum(d, e)
        return d
    return f


def both(a, b, k=0.0):
    """Only where a and b overlap."""
    def f(p):
        d, e = a(p), b(p)
        return -_smin(-d, -e, k) if k > 0 else np.maximum(d, e)
    return f


def shell(a, t):
    """A skin of thickness t on the inside of a."""
    return lambda p: np.abs(a(p) + t * .5) - t * .5


def grow(a, t):
    return lambda p: a(p) - t


def moved(a, d=(0, 0, 0), R=None, c=(0, 0, 0), s=1.0):
    """a turned by R about c, scaled by s about c, then shifted by d."""
    d, c = V(d), V(c)

    def f(p):
        q = p - d - c
        if R is not None:
            q = q @ R
        return a(q / s + c) * s
    return f


def mirror(a):
    """a and its reflection across x = 0."""
    def f(p):
        q = p.copy()
        q[..., 0] = np.abs(q[..., 0])
        return a(q)
    return f


def squash(a, s, c=(0, 0, 0)):
    """a stretched by s on each axis about c. The distance is rough, so keep s near 1."""
    s, c = V(s), V(c)
    m = float(s.min())
    return lambda p: a((p - c) / s + c) * m


def bump(a, fn):
    """a pushed out by fn(p) metres."""
    return lambda p: a(p) - fn(p)


def groove(a, pts, w, depth):
    """A line scored into a along a path: the pen line a seam or a wrinkle leaves."""
    g = chain(pts, w)
    return lambda p: a(p) + depth * np.clip(1 - np.maximum(g(p), 0) / w, 0, 1) ** 2


# ---------------------------------------------------------------- noise and folds
def _hash(i):
    x = np.sin(i[..., 0] * 127.1 + i[..., 1] * 311.7 + i[..., 2] * 74.7) * 43758.5453
    return x - np.floor(x)


def noise(p, f=1.0, seed=0.0):
    """Smooth value noise in 0..1."""
    q = p * f + seed
    i = np.floor(q)
    u = q - i
    u = u * u * (3 - 2 * u)
    o = np.zeros(p.shape[:-1], F)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[..., 0] if dx else 1 - u[..., 0]) * (u[..., 1] if dy else 1 - u[..., 1]) * (u[..., 2] if dz else 1 - u[..., 2])
                o += w * _hash(i + V(dx, dy, dz))
    return o


class Limb:
    """Coordinates along and around a line from a to b: t runs 0..1 along it, th is the angle around it (0 faces `front`)."""

    def __init__(self, a, b, front=(0, 0, 1)):
        self.a, self.b = V(a), V(b)
        ba = self.b - self.a
        self.L = float(length(ba))
        self.ax = ba / self.L
        f = V(front)
        f = f - self.ax * float(dot(f, self.ax))
        self.e1 = f / length(f)
        self.e2 = np.cross(self.ax, self.e1).astype(F)

    def coords(self, p):
        pa = p - self.a
        t = dot(pa, self.ax) / self.L
        x, y = dot(pa, self.e1), dot(pa, self.e2)
        return t, np.arctan2(y, x), np.sqrt(x * x + y * y)

    def folds(self, spec, sharp=1.0):
        """Cloth folds as a push along the surface normal.

        Each fold is (t0, th0, half_width_angle, amp, thickness, tilt): a welt centred at t0 along the limb and th0
        around it, reaching `half_width_angle` either side, `amp` metres proud, `thickness` (in t) across, and leaning
        by `tilt` (in t) from one end to the other. Under each welt the cloth tucks in, which is where the ink goes.
        """
        def fn(p):
            t, th, _ = self.coords(p)
            o = np.zeros(t.shape, F)
            for (t0, th0, hw, amp, th_k, tilt) in spec:
                d = np.arctan2(np.sin(th - th0), np.cos(th - th0))
                w = np.clip(1 - (d / hw) ** 2, 0, 1) ** 1.5
                s = (t - (t0 + tilt * d / hw)) / th_k
                crest = np.exp(-s * s)
                tuck = np.exp(-((s + 1.25) / .55) ** 2)
                o += amp * w * (crest - .75 * sharp * tuck)
            return o
        return fn


def flipx(a):
    """a reflected across x = 0 (the other side of the body)."""
    def f(p):
        q = p.copy()
        q[..., 0] = -q[..., 0]
        return a(q)
    return f


def ecyl(c, rx, rz, h, rnd=.01):
    """An upright can with an oval plan: half widths rx and rz, half height h."""
    c = V(c)
    k = rz / rx

    def f(p):
        q = p - c
        rad = np.sqrt((q[..., 0] * k) ** 2 + q[..., 2] ** 2)
        dx = (rad - rz) * min(1.0, 1.0 / k) + rnd
        dy = np.abs(q[..., 1]) - h + rnd
        return np.minimum(np.maximum(dx, dy), 0) + np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dy, 0) ** 2) - rnd
    return f


def slab(c, n, h):
    """The band within h of the plane through c with normal n."""
    c, n = V(c), V(n)
    n = n / length(n)
    return lambda p: np.abs(dot(p - c, n)) - h


def frame(z, up=(0, 1, 0)):
    """A rotation whose local z looks along `z` and whose local y leans toward `up`."""
    z = V(z)
    z = z / length(z)
    x = np.cross(V(up), z)
    x = x / length(x)
    y = np.cross(z, x)
    return np.stack([x, y, z], 1).astype(F)


def below(y):
    """Everything under height y."""
    return lambda p: p[..., 1] - y


def above(y):
    return lambda p: y - p[..., 1]


def basis(z, y):
    """A rotation whose local z looks along `z` and whose local y is as near `y` as it can be."""
    z = V(z)
    z = z / length(z)
    y = V(y)
    y = y - z * float(dot(y, z))
    y = y / length(y)
    x = np.cross(y, z)
    return np.stack([x, y, z], 1).astype(F)


def fist(at, R, s=1.0, thumb=1, fat=.0):
    """A hand closed round a grip. Local z runs from the wrist to the knuckles, local y is the back of the hand, and the
    grip lies along local x. `thumb` is the side of local x the thumb is on."""
    k = lambda *a: V(*a) * s
    parts = [box(k(0, .002, .052), k(.046, .019, .046), .017 * s)]
    for i, x in enumerate((-.036, -.012, .012, .036)):
        l = .9 if i in (0, 3) else 1.0
        sp = 1 + .03 * (i - 1.5)                                    # the fingers splay a touch
        kn = k(x, .012, .097)
        a = k(x * sp, -.03 * l, .112 * l)
        b = k(x * sp, -.052 * l, .074)
        c = k(x * sp, -.034, .05)
        parts += [sphere(kn, .0165 * s), rcone(kn, a, .0155 * s, .014 * s), rcone(a, b, .014 * s, .0125 * s), rcone(b, c, .0125 * s, .011 * s)]
    t0, t1, t2 = k(thumb * .044, -.004, .03), k(thumb * .056, -.03, .072), k(thumb * .026, -.054, .098)
    parts += [rcone(t0, t1, .019 * s, .0165 * s), rcone(t1, t2, .0165 * s, .013 * s)]
    f = union(*parts, k=.009 * s)
    if fat:
        f = grow(f, fat)
    return moved(f, d=at, R=R)


def skin(fn, o, d, tmax=1.0, n=800, out=.0):
    """Where a ray from o (inside the shape) along d first leaves it, pushed `out` metres further: for laying a strap or a bolt on a surface."""
    o, d = V(o), V(d)
    d = d / length(d)
    ts = np.linspace(0, tmax, n).astype(F)
    v = fn(o[None, :] + ts[:, None] * d[None, :])
    i = np.argmax(v > 0) if (v > 0).any() else n - 1
    return o + d * (ts[i] + out)


# ---------------------------------------------------------------- fine work for the painted picture only
# These return how far to push a surface out (+) or in (-) at each point, for Part(detail=...): seams, stitching, rivets and
# panel lines that are far too fine for the mesh but that the painter (kit/bake.py) inks, shades and wears like anything else.
def fine(*fs):
    """Several pieces of fine work added together."""
    return lambda p: sum(f(p) for f in fs)


def only(f, where):
    """Fine work kept to where `where(p)` is true (or 0..1)."""
    return lambda p: f(p) * where(p)


def slit(c, n, w=.0035, depth=.004):
    """A scored line where the plane through c facing n crosses the surface: a seam, a panel join."""
    c, n = V(c), V(n) / np.linalg.norm(V(n))
    return lambda p: -depth * np.clip(1 - np.abs((p - c) @ n) / w, 0, 1) ** 2


def trace(pts, w=.0035, depth=.004):
    """A scored line along a path through space (it only shows where the path runs along the surface)."""
    g = chain([V(q) for q in pts], .0004)
    return lambda p: -depth * np.clip(1 - np.maximum(g(p), 0) / w, 0, 1) ** 2


def outline(shape, w=.0035, depth=.004):
    """A scored line round wherever another shape would break through the surface: the edge of a patch, a hatch, a plate."""
    return lambda p: -depth * np.clip(1 - np.abs(shape(p)) / w, 0, 1) ** 2


def raised(shape, h=.003, soft=.004):
    """Everything inside another shape stands proud by h: a patch sewn on, a plate riveted over."""
    return lambda p: h * np.clip(-shape(p) / soft, 0, 1)


def stitch(c, n, pitch=.011, w=.0028, h=.0028, along=(0, 1, 0), gap=.4):
    """A row of stitches where the plane through c facing n crosses the surface, running roughly along `along`."""
    c, n, a = V(c), V(n) / np.linalg.norm(V(n)), V(along) / np.linalg.norm(V(along))
    return lambda p: h * np.clip(1 - np.abs((p - c) @ n) / w, 0, 1) * (((p - c) @ a / pitch) % 1.0 > gap)


def studs(points, r=.007, h=.004):
    """Rivet heads at these points (points on or near the surface)."""
    pts = [V(q) for q in points]

    def f(p):
        o = np.zeros(p.shape[:-1], F)
        for q in pts:
            d = np.linalg.norm(p - q, axis=-1)
            o = np.maximum(o, h * np.sqrt(np.clip(1 - (d / r) ** 2, 0, 1)) - h * .6 * np.clip(1 - np.abs(d - r * 1.25) / (r * .3), 0, 1))
        return o
    return f


def weave(freq=420.0, h=.0012, axis=(0, 1, 0)):
    """A ribbed weave across everything (webbing, a canvas strap)."""
    a = V(axis) / np.linalg.norm(V(axis))
    return lambda p: h * np.sin((p @ a) * freq)


# marks: paint laid on a surface. Each returns 0..1, how much paint is there, for Part(marks=[(mark, (r, g, b)), ...]).
def band(c, n, half):
    """A stripe: everything within `half` of the plane through c facing n."""
    c, n = V(c), V(n) / np.linalg.norm(V(n))
    return lambda p: np.clip((half - np.abs((p - c) @ n)) / .002, 0, 1)


def chevrons(c, n, pitch, where=None):
    """Hazard stripes marching along n from c, half paint and half not."""
    c, n = V(c), V(n) / np.linalg.norm(V(n))
    return lambda p: (np.clip((.25 - np.abs(((p - c) @ n / pitch) % 1.0 - .5)) / .02, 0, 1)) * (where(p) if where else 1)


def inside(shape):
    """Paint wherever the surface lies inside another shape."""
    return lambda p: np.clip(-shape(p) / .002, 0, 1)
