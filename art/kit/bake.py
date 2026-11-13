"""Paints one picture for a whole figure, from its sculpt.

The mesh the game draws is thin on triangles; the shapes it was cut from are not. So every part is laid flat into one
picture (the way a tailor lays out a pattern), and each dot of that picture looks up the true surface under it and is
painted from what it finds: ink where two surfaces meet or a fold closes, a darker tone in the hollows, bare metal and
worn thread on the proud edges, scratches, dust on the boots. The colour underneath is the game's own skin for that part.
The result is the figure's texture: detail far finer than its triangles could carry.
"""
import json
import os
import numpy as np
from PIL import Image
from scipy import ndimage
import xatlas
from . import sdf as S

F = np.float32
SKINS = os.path.join(os.path.dirname(__file__), '..', 'out', 'skins')
_skins = None
_pics = {}


def skins():
    global _skins
    if _skins is None:
        p = os.path.join(SKINS, 'skins.json')
        if not os.path.exists(p):
            raise SystemExit('no skins: run `npm run build && node tools/dump-skins.cjs` first')
        _skins = json.load(open(p))
    return _skins


def pic(name):
    if name not in _pics:
        _pics[name] = np.asarray(Image.open(os.path.join(SKINS, name + '.png')).convert('RGB'), F) / 255
    return _pics[name]


def tint(hexs):
    h = hexs.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], F)


def sample(img, u, v):
    """The skin at (u, v), v up, the way the game's atlas reads it (clamped at the border)."""
    H, W = img.shape[:2]
    x = np.clip(u, 0, 1) * (W - 1)
    y = (1 - np.clip(v, 0, 1)) * (H - 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    x1, y1 = np.minimum(x0 + 1, W - 1), np.minimum(y0 + 1, H - 1)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    return (img[y0, x0] * (1 - fx) + img[y0, x1] * fx) * (1 - fy) + (img[y1, x0] * (1 - fx) + img[y1, x1] * fx) * fy


def sphere_dirs(n):
    i = np.arange(n) + .5
    ph, th = np.arccos(1 - 2 * i / n), np.pi * (1 + 5 ** .5) * i
    return np.stack([np.cos(th) * np.sin(ph), np.sin(th) * np.sin(ph), np.cos(ph)], -1)


def seen(meshes, n=80):
    """How much of the world each triangle can see. Per mesh: (own, open). own is False where nothing outside the triangle's own
    joint can ever see it (the joint is rigid, so nobody ever will: such faces are thrown away). open is the share of the sky it sees
    with the whole figure standing at rest, which decides how much of the picture it is worth."""
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector

    def tree(idx):
        vs, fs, o = [], [], 0
        for i in idx:
            vs.append(meshes[i]['pos'])
            fs.append(meshes[i]['tri'] + o)
            o += len(meshes[i]['pos'])
        return BVHTree.FromPolygons(np.concatenate(vs).tolist(), np.concatenate(fs).tolist())
    groups = {}
    for i, m in enumerate(meshes):
        groups.setdefault(m['part'].group, []).append(i)
    world = tree(range(len(meshes)))
    D = sphere_dirs(n)
    Dv = [Vector(d.tolist()) for d in D]
    out = [None] * len(meshes)
    for idx in groups.values():
        mine = tree(idx)
        for i in idx:
            pos, tri = meshes[i]['pos'], meshes[i]['tri']
            a = pos[tri]
            nr = np.cross(a[:, 1] - a[:, 0], a[:, 2] - a[:, 0])
            nr /= np.maximum(np.linalg.norm(nr, axis=1), 1e-12)[:, None]
            c = a.mean(1)
            facing = nr @ D.T
            own, opn = np.zeros(len(tri), bool), np.zeros(len(tri), F)
            for t in range(len(tri)):
                ks = np.nonzero(facing[t] > .06)[0]
                if not len(ks):
                    own[t] = True
                    continue
                o = Vector((c[t] + nr[t] * 2e-4).tolist())
                free = 0
                for k in ks:
                    if mine.ray_cast(o, Dv[k], 4.0)[0] is None:
                        own[t] = True
                        free += world.ray_cast(o, Dv[k], 4.0)[0] is None
                opn[t] = free / len(ks)
                if not own[t]:                   # the middle is buried: look from nearer each corner before giving the face up
                    for j in range(3):
                        o = Vector((c[t] * .3 + a[t, j] * .7 + nr[t] * 2e-4).tolist())
                        if any(mine.ray_cast(o, Dv[k], 4.0)[0] is None for k in ks):
                            own[t] = True
                            break
            out[i] = (own, opn)
    return out


def sky(meshes, lift=.2, reach=3.5, n=96, ground=0.0):
    """How shut in each corner of a building is: the share of the open air above it that something close by blocks (an eave, the
    tank beside it, the ground it stands on). Looked at from a hand's width off the surface, so sheets lapped over each other do
    not count as shade. Per mesh, one value per vertex, 0 in the open to 1 walled in."""
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    vs, fs, o = [], [], 0
    for m in meshes:
        vs.append(m['pos'])
        fs.append(m['tri'] + o)
        o += len(m['pos'])
    vs.append(np.array([[-90, ground, -90], [90, ground, -90], [90, ground, 90], [-90, ground, 90]], F))        # the ground it stands on
    fs.append(np.array([[0, 2, 1], [0, 3, 2]]) + o)
    world = BVHTree.FromPolygons(np.concatenate(vs).tolist(), np.concatenate(fs).tolist())
    D = sphere_dirs(n)
    Dv = [Vector(d.tolist()) for d in D]
    out = []
    for m in meshes:
        pos, tri = m['pos'], m['tri']
        a = pos[tri]
        fn = np.cross(a[:, 1] - a[:, 0], a[:, 2] - a[:, 0])
        vn = np.zeros_like(pos)
        for k in range(3):
            np.add.at(vn, tri[:, k], fn)
        vn /= np.maximum(np.linalg.norm(vn, axis=1), 1e-12)[:, None]
        facing = vn @ D.T
        occ = np.zeros(len(pos), F)
        for v in range(len(pos)):
            ks = np.nonzero(facing[v] > .12)[0]
            if not len(ks):
                continue
            o3 = Vector((pos[v] + vn[v] * lift).tolist())
            tot = got = 0.0
            for k in ks:
                w = facing[v, k]
                hit = world.ray_cast(o3, Dv[k], reach)
                tot += w
                if hit[0] is not None:
                    got += w * (1 - hit[3] / reach) ** .7
            occ[v] = got / tot
        out.append(occ)
    return out


def charts(pos, tri, limit=52.0):
    """Cuts one part into pieces that each face one way and lays each flat by looking straight at it (what Blender calls a smart
    project). Returns each triangle's piece, each corner's place on its piece in metres (T,3,2), and each corner's welded point."""
    T = len(tri)
    corners = np.round(pos[tri.reshape(-1)] / 2e-5).astype(np.int64)
    _, vid = np.unique(corners, axis=0, return_inverse=True)
    vid = vid.reshape(-1, 3)
    a = pos[tri]
    nr = np.cross(a[:, 1] - a[:, 0], a[:, 2] - a[:, 0])
    area = .5 * np.linalg.norm(nr, axis=1)
    nr = nr / np.maximum(2 * area, 1e-12)[:, None]
    e = np.sort(np.stack([vid, np.roll(vid, -1, 1)], -1).reshape(-1, 2), 1)
    _, eid = np.unique(e, axis=0, return_inverse=True)
    order = np.argsort(eid, kind='stable')
    nb = [[] for _ in range(T)]
    es, fs = eid[order], order // 3
    same = np.nonzero(es[1:] == es[:-1])[0]
    for k in same:
        f0, f1 = int(fs[k]), int(fs[k + 1])
        if f0 != f1:
            nb[f0].append(f1)
            nb[f1].append(f0)
    cl, cw = np.cos(np.radians(limit)), np.cos(np.radians(limit + 22))
    piece = np.full(T, -1, np.int32)
    sums = []
    for seed in np.argsort(-area):
        if piece[seed] >= 0:
            continue
        k = len(sums)
        piece[seed] = k
        N = nr[seed] * max(area[seed], 1e-12)
        todo = [int(seed)]
        while todo:
            f = todo.pop()
            for g in nb[f]:
                if piece[g] < 0 and nr[g] @ nr[seed] > cw and nr[g] @ N > cl * np.linalg.norm(N):
                    piece[g] = k
                    N = N + nr[g] * area[g]
                    todo.append(g)
        sums.append(N)
    # scraps of one or two faces go to whichever neighbour looks most nearly the same way
    count = np.bincount(piece, minlength=len(sums))
    for f in np.argsort(area):
        if count[piece[f]] > 2:
            continue
        best, bd = -1, np.cos(np.radians(80)) if area[f] > 1e-9 else -2
        for g in nb[f]:
            if piece[g] != piece[f] and count[piece[g]] > 2:
                d = nr[f] @ sums[piece[g]] / max(np.linalg.norm(sums[piece[g]]), 1e-12)
                if d > bd:
                    best, bd = piece[g], d
        if best >= 0:
            count[piece[f]] -= 1
            piece[f] = best
            count[best] += 1
    _, piece = np.unique(piece, return_inverse=True)
    K = piece.max() + 1
    N = np.zeros((K, 3))
    np.add.at(N, piece, nr * np.maximum(area, 1e-12)[:, None])
    N /= np.maximum(np.linalg.norm(N, axis=1), 1e-12)[:, None]
    up = np.where(np.abs(N[:, 1:2]) < .9, np.array([[0, 1, 0]]), np.array([[0, 0, 1]]))
    U = np.cross(up, N)
    U /= np.maximum(np.linalg.norm(U, axis=1), 1e-12)[:, None]
    W = np.cross(N, U)
    flat = np.stack([(a * U[piece][:, None, :]).sum(-1), (a * W[piece][:, None, :]).sum(-1)], -1)
    return piece.astype(np.int32), flat.astype(F), vid


def unwrap(parts, res, pad=1, log=print):
    """Lays every part out flat in one square. parts: [(pos (V,3), tri (T,3), weight per triangle)]. Returns per part the (T,3,2) layout in dots."""
    uvs, idx, base, n_pieces = [], [], 0, 0
    for pos, tri, w in parts:
        piece, flat, vid = charts(pos, tri, float(os.environ.get('XLIM', 60)))
        K = piece.max() + 1
        wk = np.zeros(K)
        ar = np.zeros(K)
        a = pos[tri]
        area = .5 * np.linalg.norm(np.cross(a[:, 1] - a[:, 0], a[:, 2] - a[:, 0]), axis=1) + 1e-12
        np.add.at(wk, piece, w * area)
        np.add.at(ar, piece, area)
        wk = wk / ar                                             # a piece is as fine as the faces on it deserve, on average
        key = piece[:, None].astype(np.int64) * (vid.max() + 1) + vid          # a corner is shared only inside its own piece
        _, first, inv = np.unique(key.reshape(-1), return_index=True, return_inverse=True)
        uvs.append((flat * wk[piece][:, None, None]).reshape(-1, 2)[first])
        idx.append(inv.reshape(-1, 3) + base)
        base += len(first)
        n_pieces += K
    uvs, idx = np.ascontiguousarray(np.concatenate(uvs), F), np.ascontiguousarray(np.concatenate(idx), np.uint32)

    def lay(tpu):
        atlas = xatlas.Atlas()
        atlas.add_uv_mesh(uvs, idx)
        po = xatlas.PackOptions()
        po.resolution, po.padding, po.bilinear, po.rotate_charts, po.texels_per_unit, po.bruteForce = res, int(os.environ.get('XPAD', pad)), os.environ.get('XBIL', '1') == '1', True, tpu, True
        atlas.generate(xatlas.ChartOptions(), po)
        return atlas
    # the packer is told a scale and either fits the square or spills into a second one: home in on the largest scale that fits
    d1, d2 = uvs[idx[:, 1]] - uvs[idx[:, 0]], uvs[idx[:, 2]] - uvs[idx[:, 0]]
    area2 = .5 * np.abs(d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]).sum()
    tpu = res / np.sqrt(area2) * .75
    lo, hi, best = None, None, None
    for go in range(12):
        atlas = lay(tpu)
        if atlas.atlas_count == 1 and max(atlas.width, atlas.height) <= res:
            lo, best = tpu, atlas
        else:
            hi = tpu
        if lo and hi and hi / lo < 1.015:
            break
        tpu = (lo * hi) ** .5 if lo and hi else lo * 1.2 if lo else hi * .8
    atlas = best
    vmap, ix, uv = atlas[0]
    if not np.array_equal(vmap[ix], idx):
        raise ValueError('the packer reordered the triangles')
    px = (uv[ix] * np.array([atlas.width, atlas.height], F)).astype(F)
    log('unwrap: %d pieces, %.0f dots a metre (%.1f mm a dot)' % (n_pieces, lo, 1000 / lo))
    out, o = [], 0
    for pos, tri, w in parts:
        out.append(px[o:o + len(tri)])
        o += len(tri)
    return out


def raster(uvpx, res):
    """Which triangle owns each dot, and where in it. uvpx: (T,3,2) in dots. Dots just outside an edge are claimed too, so seams have no gaps."""
    tid = np.full((res, res), -1, np.int32)
    bary = np.zeros((res, res, 3), F)
    solid = np.zeros((res, res), bool)
    for t in range(len(uvpx)):
        a, b, c = uvpx[t].astype(np.float64)
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-9:
            continue
        x0, x1 = int(max(0, np.floor(min(a[0], b[0], c[0]) - 1))), int(min(res - 1, np.ceil(max(a[0], b[0], c[0]) + 1)))
        y0, y1 = int(max(0, np.floor(min(a[1], b[1], c[1]) - 1))), int(min(res - 1, np.ceil(max(a[1], b[1], c[1]) + 1)))
        if x1 < x0 or y1 < y0:
            continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        w0 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / den
        w1 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / den
        w2 = 1 - w0 - w1
        area2 = abs(den)
        e0, e1, e2 = (.9 * np.hypot(*(q - r)) / area2 for q, r in ((b, c), (c, a), (a, b)))
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        near = (w0 >= -e0) & (w1 >= -e1) & (w2 >= -e2) & ~inside
        sub_t, sub_s = tid[y0:y1 + 1, x0:x1 + 1], solid[y0:y1 + 1, x0:x1 + 1]
        take = inside | (near & ~sub_s & (sub_t < 0))
        if not take.any():
            continue
        sub_t[take] = t
        sub_s[inside] = True
        bary[y0:y1 + 1, x0:x1 + 1][take] = np.stack([w0, w1, w2], -1)[take]
    return tid, bary


def grad(fn, p, e):
    g = np.empty_like(p)
    for k in range(3):
        d = np.zeros(3, F)
        d[k] = e
        g[:, k] = fn(p + d) - fn(p - d)
    return g / (2 * e)


def chunks(fn, p, n=150_000):
    return np.concatenate([fn(p[i:i + n]) for i in range(0, len(p), n)]) if len(p) > n else fn(p)


class Around:
    """The nearest surface among a set of parts, asking each part only about the points near its own box."""

    def __init__(self, parts, reach):
        self.parts, self.reach = parts, reach

    def __call__(self, q):
        out = np.full(len(q), 1e3, F)
        for o in self.parts:
            m = np.all(q > np.asarray(o.lo, F) - self.reach, 1) & np.all(q < np.asarray(o.hi, F) + self.reach, 1)
            if m.any():
                out[m] = np.minimum(out[m], chunks(o.true, q[m]))
        return out


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def cells(p, seed=0.0):
    """Scattered points, one to a unit cube: for each p the distance to the nearest, to the next nearest, and a number 0..1 that
    belongs to the nearest. Their difference is small along the walls between cells, which is where a glaze cracks."""
    q = p + seed
    i = np.floor(q)
    f1 = np.full(p.shape[:-1], 9.0, F)
    f2 = np.full(p.shape[:-1], 9.0, F)
    cid = np.zeros(p.shape[:-1], F)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = i + np.array([dx, dy, dz], F)
                h = np.stack([S._hash(c + k * 17.3) for k in (1.0, 2.0, 3.0)], -1)
                d = np.linalg.norm(c + h - q, axis=-1).astype(F)
                closer = d < f1
                f2 = np.where(closer, f1, np.minimum(f2, d))
                cid = np.where(closer, S._hash(c + 5.5), cid)
                f1 = np.where(closer, d, f1)
    return f1, f2, cid


def kind_of(mat, sk):
    """What a skin is made of, as far as the brush cares."""
    if mat == 'gS':
        return 'sac'
    if sk.get('emis', 0) > .3:
        return 'glow'
    if mat.startswith(('fab', 'vest', 'cloth')):
        return 'cloth'
    if mat.startswith(('lea', 'glove', 'sole', 'rubber', 'rib')):
        return 'hide'
    if mat.startswith(('skin', 'stache', 'hair')):
        return 'flesh'
    if mat[0] == 'v' and mat[1:2].isupper():        # the Veyl's skins are v and a capital, the Gloam's g and a capital (gunm and visG are neither)
        return 'shell'
    if mat[0] == 'g' and mat[1:2].isupper():
        return 'growth'
    return 'plate'


# how each kind of stuff takes the brush: ink in creases, tone in hollows, light on proud edges, scratches, how far dust climbs
BRUSH = {
    'plate': dict(ink=1.0, tone=.5, hatch=.7, wear=.9, chip=.95, scratch=.55, stain=.0, dust=.5, bare=(.72, .74, .8)),
    'cloth': dict(ink=.95, tone=.62, hatch=1.0, wear=.35, chip=.0, scratch=0, stain=1.0, dust=.85, bare=None),
    'hide': dict(ink=1.0, tone=.58, hatch=.9, wear=.6, chip=.5, scratch=.3, stain=.6, dust=.95, bare=None),
    'flesh': dict(ink=.8, tone=.36, hatch=.15, wear=0, chip=0, scratch=0, stain=0, dust=0, bare=None),
    'shell': dict(ink=1.0, tone=.6, hatch=.75, wear=.8, chip=.4, scratch=.3, stain=0, dust=.3, bare=None, craze=1.0),
    'growth': dict(ink=1.0, tone=.6, hatch=.8, wear=.45, chip=0, scratch=0, stain=.5, dust=.3, bare=None, mottle=1.0),
    'glow': dict(ink=.3, tone=.12, hatch=0, wear=0, chip=0, scratch=0, stain=0, dust=0, bare=None),
    'sac': dict(ink=.85, tone=.36, hatch=.3, wear=0, chip=0, scratch=0, stain=0, dust=0, bare=None, veins=1.0),
}


def paint(fig, meshes, res=1024, log=print, unit=1.0):
    """meshes: one dict per part with pos (V,3), tri (T,3), suv (T,3,2) skin UVs, part. Returns the picture (res,res,3 uint8)
    and, per part, its (T,3,2) place in that picture."""
    sk = skins()
    names = {m['part'].name: i for i, m in enumerate(meshes)}
    own = [i for i, m in enumerate(meshes) if not (m['part'].twin and m['part'].twin in names)]

    def worth(m):                           # how fine a face is painted: its part's say, less where the figure at rest hides it
        e = m.get('open')
        return m['part'].texel * (1.0 if e is None else np.where(e < .02, .5, .72 + .28 * np.clip(e / .25, 0, 1)))
    got = unwrap([(meshes[i]['pos'], meshes[i]['tri'], worth(meshes[i])) for i in own], res, log=log)
    lay = [None] * len(meshes)
    for i, u in zip(own, got):
        lay[i] = u / res
    for i, m in enumerate(meshes):          # a mirrored part lies on the very same piece of the picture, its corners in the opposite order
        if lay[i] is None:
            lay[i] = lay[names[m['part'].twin]][:, ::-1]
    full, meshes = meshes, [meshes[i] for i in own]
    lay_own = [lay[i] for i in own]
    T = sum(len(m['tri']) for m in meshes)
    uvpx = np.concatenate([u * res for u in lay_own])
    owner = np.concatenate([np.full(len(m['tri']), i, np.int32) for i, m in enumerate(meshes)])
    local = np.concatenate([np.arange(len(m['tri']), dtype=np.int32) for m in meshes])
    tid, bary = raster(uvpx, res)
    filled = tid >= 0
    ys, xs = np.nonzero(filled)
    t = tid[ys, xs]
    w = bary[ys, xs]
    N = len(t)
    log(f'paint: {T} triangles, {N / res / res * 100:.0f}% of the picture used')
    col = np.zeros((N, 3), F)
    by_group = {}
    for p in fig.parts:
        by_group.setdefault(p.group, []).append(p)
    everything = Around(fig.parts, .06 * unit)
    for i, m in enumerate(meshes):
        sel = np.nonzero(owner[t] == i)[0]
        if not len(sel):
            continue
        part = m['part']
        lt, lw = local[t[sel]], w[sel]
        P = np.einsum('nk,nkd->nd', lw, m['pos'][m['tri'][lt]])
        UV = np.einsum('nk,nkd->nd', lw, m['suv'][lt])
        s = sk.get(part.mat) or sk.get('nS')
        base = (sample(pic(s['pic']), UV[:, 0] * s['rep'][0] % 1.0001, UV[:, 1] * s['rep'][1] % 1.0001) if s['pic'] else np.ones((len(sel), 3), F)) * tint(s['color'])
        br = BRUSH[kind_of(part.mat, s)]
        for where, rgb in part.marks:                # company paint: stripes, bands, numbers. It goes on first and takes the wear with everything else
            mk = np.clip(where(P), 0, 1)[:, None]
            base = base * (1 - mk) + np.array(rgb, F) * mk
        # the true surface under each dot, and which way it faces
        e = .0012 * unit
        for _ in range(2):
            g = grad(part.true, P, e)
            P = P - (chunks(part.true, P) / np.maximum((g * g).sum(1), 1e-6))[:, None] * g
        n = grad(part.true, P, e)
        steep = np.clip(np.linalg.norm(n, axis=1), .2, 3)      # few of these shapes measure true distance: this is how fast this one counts, so a step off the surface is judged against it
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
        near = Around(by_group[part.group], .06 * unit)
        occ = []
        for h in (.003, .007, .018, .045):
            h *= unit
            occ.append(np.clip(1 - near(P + n * h) / (h * steep), 0, 1))
        far = np.clip(1 - everything(P + n * .045 * unit) / (.045 * unit * steep), 0, 1)
        edge = []
        for h in (.003, .008):
            h *= unit
            edge.append(np.clip(1 + near(P - n * h) / (h * steep), 0, 1))
        wob = S.noise(P, 38 / unit, 5.1) * .6 + S.noise(P, 110 / unit, 1.7) * .4            # a hand that presses harder here than there
        big = S.noise(P, 7 / unit, 3.3)
        glow = br is BRUSH['glow'] or bool(br.get('veins'))
        # the colour itself: knocked back a little, never quite the same twice across a surface
        if not glow:
            grey = base @ np.array([.3, .59, .11], F)
            base = (grey[:, None] + (base - grey[:, None]) * fig.grade[0]) * (fig.grade[1] + (big[:, None] - .5) * .14)
        if br.get('craze') and part.mat != 'vG':     # the Veyl: old lacquer crazed into plates, each a touch its own shade, the widest cracks mended with gold
            f1, f2, cid = cells(P / (.075 * unit), 4.2)
            wall = f2 - f1
            base = base * (1 + (cid[:, None] - .5) * .2)
            hair = (1 - smooth(.0, .05, wall)) * .55
            base = base * (1 - hair[:, None] * .7)
            mend = (1 - smooth(.02, .085, wall)) * smooth(.5, .62, S.noise(P, 3.2 / unit, 9.7) + (cid - .5) * .25) * br['craze']
            base = base * (1 - mend[:, None]) + np.array([.86, .63, .2], F) * mend[:, None]
        if br.get('veins'):                          # a Gloam sac: a taut skin over something bright, each cell its own strength, veined dark where the skin is thick
            f1, f2, cid = cells(P / (.07 * unit), 3.9)
            wall = f2 - f1
            base = np.minimum(base * (.78 + cid[:, None] * .34) * (1 + (1 - smooth(.0, .45, f1))[:, None] * .22), 1)
            vein = (1 - smooth(.025, .1, wall + (wob - .5) * .05)) * br['veins']
            twig = (1 - smooth(.0, .03, np.abs(S.noise(P, 26 / unit, 6.1) - .5))) * smooth(.1, .3, wall) * .55 * br['veins']      # hair veins wandering across the cells
            vein = np.maximum(vein, twig)
            base = base * (1 - vein[:, None] * .84) + np.array([.06, .2, .05], F) * vein[:, None] * .84
        if br.get('mottle') and part.mat[:2] in ('gH', 'gD'):                         # the Gloam: hide blotched darker in patches and dotted with pale warts
            f1, f2, cid = cells(P / (.045 * unit), 7.7)
            blot = smooth(.48, .66, S.noise(P, 8 / unit, 4.4)) * br['mottle']
            base = base * (1 - blot[:, None] * np.array([.3, .22, .34], F))
            wart = (1 - smooth(.16, .26, f1)) * (cid > .6) * br['mottle']
            ring = (smooth(.2, .28, f1) - smooth(.3, .4, f1)) * (cid > .6) * br['mottle']
            base = base * (1 - ring[:, None] * .35)
            base = base * (1 - wart[:, None] * .6) + np.minimum(base * 1.5 + .16, 1) * wart[:, None] * .6
        # tone: light falls from above, hollows go darker and cooler, in soft steps like a second and third cel
        hollow = np.maximum(occ[2] * .8 + occ[3] * .55, far * .5)
        under = np.clip(.35 - n[:, 1], 0, 1.35) / 1.35                                # how far a surface is turned from the sky
        shade = hollow + under * .42 + (wob - .5) * .18
        tone = smooth(.2, .42, shade) * .5 + smooth(.58, .82, shade) * .5
        c = base * (1 - br['tone'] * tone[:, None] * np.array([.88, .92, .76], F)) + br['tone'] * tone[:, None] * np.array([.012, .0, .04], F)
        # feathering: short pen strokes across the edge of each shadow, the way an inker turns a form
        if br['hatch']:
            d = P @ np.array([.58, .74, .34], F)
            st = np.abs(((d / (.011 * unit) + (S.noise(P, 16 / unit, 8.1) - .5) * 1.3) % 1.0) - .5) * 2      # 0 on a stroke's middle, 1 between strokes
            band = smooth(.14, .34, shade) * (1 - smooth(.5, .72, shade))
            stroke = (1 - smooth(.0, .5 + .3 * band, st / np.maximum(band * 1.1, 1e-3))) * band * br['hatch']
            c = c * (1 - stroke[:, None] * .78) + np.array([.03, .025, .05], F) * stroke[:, None] * .78
        # proud edges: a pale line where paint and thread catch the light, then chips rubbed through to what is underneath
        proud = np.maximum(edge[0], edge[1] * .85) * (1 - occ[1])
        if br['wear']:
            rim = smooth(.2, .42, proud + (wob - .5) * .2) * br['wear']
            c = c * (1 - rim[:, None] * .6) + np.minimum(base * 1.5 + .13, 1) * rim[:, None] * .6
            chip = smooth(.42, .6, proud * (.5 + wob * 1.2) + (big - .5) * .25) * br['chip']
            bare = np.array(br['bare'], F) if br['bare'] else np.minimum(base * 1.7 + .16, 1)
            c = c * (1 - chip[:, None]) + bare * chip[:, None]
        if br['scratch']:
            a = S.noise(P @ np.array([[1, .2, 0], [-.3, 1, .1], [0, .15, .25]], F).T, 60 / unit, 9.3)
            b = S.noise(P @ np.array([[.2, 1, 0], [1, -.3, .1], [.1, 0, .25]], F).T, 75 / unit, 2.9)
            sc = (smooth(.014, .0, np.abs(a - .5)) + smooth(.012, .0, np.abs(b - .47))) * smooth(.4, .66, S.noise(P, 9 / unit, 4.4)) * br['scratch']
            c = c * (1 - sc[:, None] * .6) + np.minimum(base * 1.6 + .14, 1) * sc[:, None] * .6
        if br['stain']:                                                               # oil and sweat: dark blots that soak into cloth and hide
            blot = smooth(.6, .78, S.noise(P, 11 / unit, 6.6) * .7 + S.noise(P, 31 / unit, 2.4) * .3) * br['stain']
            c = c * (1 - blot[:, None] * .34)
        # dust climbs the boots and settles on whatever faces up
        if br['dust'] and fig.dust:
            d = (smooth(.5 * unit, .03 * unit, P[:, 1]) * .85 + smooth(.5, 1, n[:, 1]) * .16) * smooth(.25, .65, S.noise(P, 14 / unit, 7.7) * .6 + wob * .4) * br['dust']
            c = c * (1 - d[:, None] * .6) + np.array(fig.dust, F) * d[:, None] * .6
        # spot blacks: the deepest hollows are simply filled
        deep = smooth(.8, .98, hollow + (wob - .5) * .12) * br['ink']
        # ink: where surfaces meet and where a fold closes, a line that swells and thins
        line = np.maximum(smooth(.22, .44, occ[0] + (wob - .5) * .26), smooth(.36, .6, occ[1] + (wob - .5) * .3))
        line = np.maximum(line, deep) * br['ink']
        c = c * (1 - line[:, None]) + np.array([.03, .026, .046], F) * line[:, None]
        col[sel] = c
    img = np.zeros((res, res, 3), F)
    img[ys, xs] = col
    # spread the paint a little way out of every piece, so the gaps between them never show at a seam
    idx = ndimage.distance_transform_edt(~filled, return_distances=False, return_indices=True)
    img = img[idx[0], idx[1]]
    out = np.clip(img * 255 + .5, 0, 255).astype(np.uint8)[::-1]            # row 0 of a picture is its top; v = 1 is up
    return out, [u.astype(F) for u in lay]


# ---------------------------------------------------------------- a building's own wear
# Buildings wear the game's tiled skins, which is what keeps a wall crisp from a hand's width away but also what makes two sheds look
# like the same shed. A building's own picture is laid over those skins at a coarse grain: what years in one spot have done to it.
# Mid grey leaves the skin alone, darker stains it, lighter bleaches it, and a tint rusts or mosses it.
LOOKS = {
    # scrap sheds: rust running down from every seam, soot up high, dust blown up the foot of the walls, roofs bleached and pooled
    'yard': dict(streak=(.62, .42, .30), streaks=.5, soot=.22, foot=(1.3, 1.14, .94), foot_h=1.5, bleach=.2, pool=(.6, .56, .56), blotch=.16, tint=(1.08, .96, .86), corner=.5),
    # sung stone: pale mineral runs, a bloom of verdigris low down, the tops bleached by the sky
    'stone': dict(streak=(1.22, 1.2, 1.1), streaks=.35, soot=.06, foot=(.84, 1.02, .98), foot_h=2.2, bleach=.22, pool=(.78, .86, .9), blotch=.14, tint=(.92, 1.04, 1.06), corner=.42),
    # growth: wet dark runs, pale spore dust settled on every ledge, the foot stained by the bloom it stands in
    'growth': dict(streak=(.58, .66, .5), streaks=.42, soot=.1, foot=(.78, .98, .7), foot_h=1.8, bleach=.3, pool=(1.22, 1.24, 1.02), blotch=.2, tint=(1.06, 1.0, .88), corner=.5),
}


def coat(fig, meshes, res=512, log=print, look='yard', seed=0.0):
    """meshes: one dict per part with pos, tri, cnrm and occ (how shut in each vertex is). Returns the picture (res,res,3 uint8,
    128 = no change) and, per part, each corner's place in it (T,3,2)."""
    L = dict(LOOKS[look if isinstance(look, str) else 'yard'])
    if isinstance(look, dict):
        L.update(look)
    got = unwrap([(m['pos'], m['tri'], np.ones(len(m['tri']), F)) for m in meshes], res, pad=2, log=log)
    lay = [u / res for u in got]
    owner = np.concatenate([np.full(len(m['tri']), i, np.int32) for i, m in enumerate(meshes)])
    local = np.concatenate([np.arange(len(m['tri']), dtype=np.int32) for m in meshes])
    tid, bary = raster(np.concatenate(got), res)
    filled = tid >= 0
    ys, xs = np.nonzero(filled)
    t, w = tid[ys, xs], bary[ys, xs]
    N = len(t)
    P, Nn, occ = np.zeros((N, 3), F), np.zeros((N, 3), F), np.zeros(N, F)
    for i, m in enumerate(meshes):
        sel = np.nonzero(owner[t] == i)[0]
        if not len(sel):
            continue
        lt, lw = local[t[sel]], w[sel]
        P[sel] = np.einsum('nk,nkd->nd', lw, m['pos'][m['tri'][lt]])
        Nn[sel] = np.einsum('nk,nkd->nd', lw, m['cnrm'][lt])
        o = m.get('occ')
        if o is not None:
            occ[sel] = np.einsum('nk,nk->n', lw, o[m['tri'][lt]])
    Nn /= np.maximum(np.linalg.norm(Nn, axis=1), 1e-6)[:, None]
    top = float(max(m['pos'][:, 1].max() for m in meshes))
    up, wall = np.clip(Nn[:, 1], 0, 1), 1 - np.abs(Nn[:, 1])
    sd = seed + (sum(ord(c) for c in fig.name) % 97) * 1.37
    col = np.ones((N, 3), F)
    # big slow patches: one sheet weathered more than its neighbour
    b = S.noise(P, .28, sd) * .6 + S.noise(P, .75, sd + 9) * .4
    col *= (1 + (b - .5) * 2 * L['blotch'])[:, None]
    col *= 1 + (S.noise(P, .16, sd + 31)[:, None] - .5) * (np.array(L['tint'], F) - 1) * 2
    # runs: whatever washes off the top comes down the wall in streaks, each its own length, strongest just under where it starts
    h = P[:, 0] * Nn[:, 2] - P[:, 2] * Nn[:, 0]                       # along the wall
    q = np.stack([h * 2.6, P[:, 1] * .16, np.zeros(N, F) + sd], -1)
    run = smooth(.52, .8, S.noise(q, 1.0, 3.0) * .7 + S.noise(q * np.array([2.3, 1.0, 1.0], F), 1.0, 17.0) * .3)
    run *= smooth(.25, .6, S.noise(np.stack([h * .5, P[:, 1] * .5, np.zeros(N, F) + sd], -1), 1.0, 40.0)) * smooth(.3, .75, wall)
    k = (run * L['streaks'])[:, None]
    col = col * (1 - k) + col * np.array(L['streak'], F) * k
    # soot and weather settle on the upper part and under whatever overhangs
    col *= (1 - L['soot'] * smooth(.45, 1.0, P[:, 1] / max(top, 1e-3)) * (.4 + .6 * S.noise(P, .5, sd + 50)) * wall)[:, None]
    # the foot of the wall: dust blown up it or damp drawn up it, in a ragged line
    fh = L['foot_h'] * (.55 + .9 * S.noise(np.stack([h * .7, np.zeros(N, F), np.zeros(N, F) + sd], -1), 1.0, 70.0))
    k = ((1 - smooth(0, 1, P[:, 1] / np.maximum(fh, .05))) * (.5 + .5 * wall) * .75)[:, None]
    col = col * (1 - k) + col * np.array(L['foot'], F) * k
    # anything that looks at the sky is bleached, with pools where the wet sat
    pool = smooth(.56, .74, S.noise(P, .55, sd + 80) * .65 + S.noise(P, 1.5, sd + 85) * .35)
    k = up[:, None]
    col = col * (1 - k) + col * ((1 + L['bleach']) * (1 - pool[:, None]) + np.array(L['pool'], F) * pool[:, None]) * k
    # shut-in corners hold the dirt
    col *= (1 - L['corner'] * smooth(.12, .8, occ))[:, None]
    col *= 1 + (S.noise(P, 5.0, sd + 99)[:, None] - .5) * .08
    img = np.full((res, res, 3), 1.0, F)
    img[ys, xs] = col
    idx = ndimage.distance_transform_edt(~filled, return_distances=False, return_indices=True)
    img = img[idx[0], idx[1]]
    img = ndimage.gaussian_filter(img, (.6, .6, 0))
    log(f'wear: {N / res / res * 100:.0f}% of the picture used, mean {img.mean():.2f}')
    return np.clip(img * 127.5 + .5, 0, 255).astype(np.uint8)[::-1], [u.astype(F) for u in lay]
