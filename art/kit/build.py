"""Turns sculpted shapes into game meshes.

Each part is meshed from its distance field, cleaned up in Blender (decimated to its triangle budget, creases marked sharp),
given UVs for the game's inked skins and a per-vertex crease value, then written two ways: a .blend file to open and
edit, and a compact .bin the game loads.
"""
import json
import os
import struct
import time
import numpy as np
from skimage import measure
import bpy
from mathutils import Matrix
import bmesh
from . import sdf

F = np.float32
# flat stand-ins for the game's inked skins, so the .blend reads at a glance
TINT = {'fabT': '#a8744a', 'fab': '#4d577c', 'fabG': '#6f7a55', 'fabR': '#b3362b', 'lea': '#6a4230', 'leaB': '#6a4230', 'leaN': '#6a4230', 'glove': '#f2b21c', 'gloveN': '#f2b21c',
        'skinF': '#e2a680', 'skinD': '#9c6444', 'hairG': '#8d8a88', 'stache': '#3a2a20', 'vestB': '#f08a1c', 'hard': '#f7b516', 'nY': '#f7b516', 'pY': '#f7b516', 'bY': '#f7b516', 'nS': '#8d95a6', 'bS': '#8d95a6', 'pS': '#8d95a6',
        'nD': '#4a4f60', 'bD': '#4a4f60', 'pD': '#4a4f60', 'gunm': '#3a3d4a', 'gunB': '#3a3d4a', 'sole': '#22222c', 'rib': '#2a2a34', 'lens': '#5fd0ff', 'visG': '#ffe27a', 'drill': '#9aa2b0',
        'nW': '#e8e2d0', 'pW': '#e8e2d0', 'haz': '#f7b516', 'hazB': '#f7b516', 'chest': '#f7b516', 'tank': '#d8452c', 'rubber': '#22222c', 'red': '#ff4b3a',
        'vD': '#4636b4', 'vDp': '#4636b4', 'vI': '#6a55e6', 'vIp': '#6a55e6', 'vL': '#d9d2f4', 'vG': '#f2c14a', 'vC': '#7ff0e4', 'vM': '#ff4f9a', 'teal': '#3fe0d0', 'mag': '#ff4fd0',
        'helm': '#e8e2d0', 'helmO': '#f08a1c', 'helmR': '#e8e2d0', 'helmD': '#4a4f60', 'cY': '#f7b516', 'cW': '#e8e2d0', 'cD': '#4a4f60', 'hazC': '#f7b516', 'pO': '#f08a1c', 'bO': '#f08a1c', 'bW': '#e8e2d0', 'shield': '#8d95a6',
        'gH': '#6f8f3a', 'gHn': '#6f8f3a', 'gHp': '#6f8f3a', 'gD': '#41582a', 'gDn': '#41582a', 'gV': '#d8e0a0', 'gB': '#e8dcc0', 'gBn': '#e8dcc0', 'gBc': '#e8dcc0', 'gBp': '#e8dcc0',
        'gC': '#8a3d2e', 'gCn': '#8a3d2e', 'gCb': '#8a3d2e', 'gG': '#ff8a6a', 'gGb': '#ff8a6a', 'gS': '#d8ff6a', 'gEye': '#ffb43a', 'gMaw': '#3a1420',
        'cyan': '#5fe8ff', 'violet': '#a070ff', 'wallS': '#9aa2b0', 'wallR': '#b8452c', 'wallT': '#3f8f8a', 'wallY': '#e0a820', 'wallD': '#4a4f60', 'wallG': '#7d8a5a', 'conc': '#9a8f86', 'wood': '#8a6a48', 'rust': '#8a4a2c', 'cO': '#f08a1c'}


class Part:
    def __init__(self, name, group, mat, fn, tris, voxel=.003, uv=('cyl',), sharp=42.0, lo=None, hi=None, planar=0.0, cull=True, detail=None, texel=1.0, twin=None, marks=(), glow=None):
        """planar (degrees) is for flat-sided things: faces that lie within that angle of each other are merged first, so plate stays plate.
        cull=False keeps the faces a neighbour buries: a pipe cut into open lengths under its own collars falls apart when it is thinned."""
        self.name, self.group, self.mat, self.fn, self.tris, self.voxel, self.uv, self.sharp, self.lo, self.hi, self.planar, self.cull = name, group, mat, fn, tris, voxel, uv, sharp, lo, hi, planar, cull
        # detail is cut into the surface for the painted picture only (seams, stitches, panel lines: things too fine for triangles);
        # texel gives a part more or less of the picture than its size earns (a face more, a boot sole less)
        self.true = fn if detail is None else sdf.bump(fn, detail)
        self.texel = texel
        self.marks = marks                     # paint laid on the part for the picture: [(where(p) -> 0..1, (r, g, b)), ...], worn like the rest
        self.glow = glow                       # how strongly this part glows, where that is not its skin's own strength (a big sac at full strength bleaches to white)
        self.twin = twin                       # the name of the part this one is the mirror image of (a left leg of a right one): it takes that part's mesh and its place in the picture


def field(fn, lo, hi, voxel):
    """The shape sampled on a grid, in slabs so a big grid does not need all its points at once."""
    lo, hi = np.asarray(lo, F), np.asarray(hi, F)
    n = np.maximum(2, np.ceil((hi - lo) / voxel).astype(int) + 1)
    xs, ys, zs = [lo[i] + np.arange(n[i], dtype=F) * voxel for i in range(3)]
    vol = np.empty(n, F)
    step = max(1, int(2_000_000 // (n[1] * n[2])))
    for i in range(0, n[0], step):
        X, Y, Z = np.meshgrid(xs[i:i + step], ys, zs, indexing='ij')
        P = np.stack([X, Y, Z], -1).reshape(-1, 3)
        vol[i:i + step] = fn(P).reshape(X.shape)
    return vol, lo


def bounds(fn, lo=(-1.2, -.2, -1.2), hi=(1.2, 2.5, 1.2), coarse=.02, pad=.012):
    vol, lo0 = field(fn, lo, hi, coarse)
    idx = np.argwhere(vol < coarse * 1.2)
    if not len(idx):
        raise ValueError('empty shape')
    a = lo0 + idx.min(0) * coarse - coarse - pad
    b = lo0 + idx.max(0) * coarse + coarse + pad
    return a, b


def surface(part):
    if part.lo is None:
        part.lo, part.hi = bounds(part.fn)
    vol, lo = field(part.fn, part.lo, part.hi, part.voxel)
    v, f, _, _ = measure.marching_cubes(vol, 0.0, spacing=(part.voxel,) * 3)
    return (v + lo).astype(F), f.astype(np.int32)


def to_blender(v):
    """Game (x across, y up, z forward) to Blender (z up, facing -y)."""
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], -1)


def to_game(v):
    return np.stack([v[:, 0], v[:, 2], -v[:, 1]], -1)


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    h = TINT.get(name, '#999999').lstrip('#')
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    rgb = [c ** 2.2 for c in rgb]
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    if b:
        b.inputs['Base Color'].default_value = (*rgb, 1)
        b.inputs['Roughness'].default_value = .75
    return m


def mesh_object(part, v, f, thin=True):
    me = bpy.data.meshes.new(part.name)
    bv = to_blender(v)
    me.vertices.add(len(bv))
    me.vertices.foreach_set('co', bv.ravel())
    me.loops.add(len(f) * 3)
    me.loops.foreach_set('vertex_index', f.ravel())
    me.polygons.add(len(f))
    me.polygons.foreach_set('loop_start', np.arange(0, len(f) * 3, 3))
    me.polygons.foreach_set('loop_total', np.full(len(f), 3))
    me.update()
    me.validate()
    ob = bpy.data.objects.new(part.name, me)
    bpy.context.scene.collection.objects.link(ob)
    ntri = len(me.polygons)
    if thin and part.tris and ntri > part.tris:
        # two passes: a first cut that keeps the form, then the budget
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=part.voxel * .2)
        bm.to_mesh(me)
        bm.free()
        def apply():
            nonlocal me
            dg = bpy.context.evaluated_depsgraph_get()
            me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
            ob.modifiers.clear()
            ob.data = me2
            bpy.data.meshes.remove(me)
            me = me2
            me.name = part.name
        if part.planar:
            md = ob.modifiers.new('flat', 'DECIMATE')
            md.decimate_type = 'DISSOLVE'
            md.angle_limit = np.radians(part.planar)
            ob.modifiers.new('tri', 'TRIANGULATE')
            apply()
        if len(me.polygons) > part.tris:
            md = ob.modifiers.new('budget', 'DECIMATE')
            md.ratio = part.tris / max(1, len(me.polygons))
            md.use_collapse_triangulate = True
            apply()
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=np.radians(part.sharp))
    me.materials.append(material(part.mat))
    return ob


def uv_for(part, pos, tri):
    """UVs per triangle corner, in 0..1, laid out for the game's skins (which shade darker toward v = 0)."""
    kind = part.uv[0]
    lo, hi = pos.min(0), pos.max(0)
    span = np.maximum(hi - lo, 1e-5)
    P = pos[tri]                                   # (T, 3, 3)
    if kind == 'cyl' or kind == 'wrap':
        # around the up axis through the part's middle (or a given axis); 'cyl' mirrors left and right so there is no seam
        o = (lo + hi) / 2 if len(part.uv) < 2 else np.asarray(part.uv[1], F)
        ax = np.asarray(part.uv[2], F) if len(part.uv) > 2 else np.array([0, 1, 0], F)
        ax = ax / np.linalg.norm(ax)
        fr = np.array([0, 0, 1], F) - ax * ax[2]
        if np.linalg.norm(fr) < 1e-3:
            fr = np.array([0, 1, 0], F) - ax * ax[1]
        fr /= np.linalg.norm(fr)
        sd = np.cross(ax, fr)
        q = P - o
        h = q @ ax
        th = np.arctan2(q @ sd, q @ fr)            # 0 at the front
        hh = (pos - o) @ ax
        v = (h - hh.min()) / max(hh.max() - hh.min(), 1e-5)
        if kind == 'cyl':
            u = np.abs(th) / np.pi
        else:
            u = th / (2 * np.pi) + .5
            m = np.median(u, 1, keepdims=True)     # a triangle that straddles the seam at the back is pinned to one side of it
            u = np.where(u - m > .5, 0.0, np.where(m - u > .5, 1.0, u))
        return np.stack([u, v], -1)
    if kind == 'front':                             # looking along -z: x across, y up
        return np.stack([(P[..., 0] - lo[0]) / span[0], (P[..., 1] - lo[1]) / span[1]], -1)
    if kind == 'top':
        return np.stack([(P[..., 0] - lo[0]) / span[0], (P[..., 2] - lo[2]) / span[2]], -1)
    if kind == 'side':
        return np.stack([(P[..., 2] - lo[2]) / span[2], (P[..., 1] - lo[1]) / span[1]], -1)
    if kind == 'box':                               # each face is looked at square on, along whichever axis it faces most (walls, sheets, slabs)
        n = np.abs(np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]))
        ax = np.argmax(n, 1)[:, None]
        Q = (P - lo) / span
        u = np.where(ax == 0, Q[..., 2], Q[..., 0])
        v = np.where(ax == 1, Q[..., 2], Q[..., 1])
        return np.stack([u, v], -1)
    if kind == 'plane':                             # ('plane', origin, across, up, width, height): a flat picture laid on a turned sheet
        o, ua, va = (np.asarray(a, F) for a in part.uv[1:4])
        return np.stack([((P - o) @ ua) / part.uv[4] + .5, ((P - o) @ va) / part.uv[5] + .5], -1)
    raise ValueError(kind)


def crease(whole, pos, nrm, unit=1.0):
    """How tucked in (+) or how exposed (-) each point is, from the whole figure's field: the dark an inker lays into a fold.
    `unit` is the size of the thing being inked: 1 for a figure a couple of metres tall, more for a building."""
    occ = np.zeros(len(pos), F)
    for h, w in ((.012, .55), (.03, .35), (.06, .1)):
        h *= unit
        occ += w * np.clip(1 - whole(pos + nrm * h) / h, 0, 1)
    edge = np.zeros(len(pos), F)
    for h, w in ((.008, .6), (.018, .4)):
        h *= unit
        edge += w * np.clip(1 + whole(pos - nrm * h) / h, 0, 1)
    return np.clip(occ * 1.6 - .08, 0, 1) - np.clip(edge * 1.5 - .25, 0, 1) * (occ < .15)


class Figure:
    def __init__(self, name, scale=1.0, lo=(-1.2, -.2, -1.2), hi=(1.2, 2.5, 1.2), coarse=.02, detail=1.0, unit=1.0, ink=1.0, paint=0, dust=(.78, .6, .44), grade=(.86, .9), brush=None, shade=0.0, coat=0, look='yard'):
        """lo and hi box in everything the figure could reach; coarse is the grid that finds each part inside it.
        unit is how big the thing is next to a person (a building is 4 or 5): it widens the creases and the buried-face test to suit."""
        self.name, self.parts, self.groups, self.scale, self.points, self.unit = name, [], {}, scale, {}, unit
        self.lo, self.hi, self.coarse, self.detail = lo, hi, coarse, detail      # detail scales every part's triangle budget
        paint = int(os.environ['PAINT']) if 'PAINT' in os.environ else paint
        self.brush = brush or unit             # how big the painter's hand is: a machine four metres tall is inked with a broader pen than a man
        self.texel = {}                        # group name: how much more of the painted picture its parts get (set before adding parts)
        self.grade = grade                     # (how much colour, how much light) the painted picture keeps of the game's skins
        self.paint, self.dust = paint, dust      # paint: the size of the figure's own painted picture (0 = wear the game's shared skins); dust: what settles on it
        self.coat, self.look = (int(os.environ['COAT']) if 'COAT' in os.environ else coat), look      # buildings: the size of their own picture of wear, laid over the tiled skins (bake.coat), and what kind of wear
        self.shade = shade                     # buildings: how dark a corner goes for being shut in by eaves, neighbours and the ground (see bake.sky)
        self.ink = ink                         # how strongly creases are inked. Flat plate cut down to a few big triangles has corners only, and a corner is always tucked under its neighbour, so plate buildings turn it off

    def group(self, name, pivot=(0, 0, 0), parent=None, scale=1.0):
        """scale swells a whole group about its pivot (a bigger head, say); the game applies it, so only use it on a group with no children."""
        self.groups[name] = {'pivot': [float(x) for x in pivot], 'parent': parent, 'scale': float(scale)}

    def hidden(self, part, v, f, margin=.005):
        margin *= self.unit
        """Drop the faces buried inside a neighbour in the same group: nobody sees them and they eat the triangle budget."""
        deep = np.full(len(v), 1.0, F)
        for o in self.parts:
            if o is part or o.group != part.group or o.lo is None:
                continue
            if np.any(np.asarray(o.lo) > np.asarray(part.hi)) or np.any(np.asarray(o.hi) < np.asarray(part.lo)):
                continue
            for i in range(0, len(v), 400_000):
                deep[i:i + 400_000] = np.minimum(deep[i:i + 400_000], o.fn(v[i:i + 400_000]))
        keep = (deep[f] > -margin).any(1)
        return f[keep] if keep.sum() > 8 else f

    def point(self, name, at, group='body'):
        """A named spot the game needs (a muzzle, say). It comes out in the group's own space."""
        self.points[name] = (group, [float(x) for x in at])

    def add(self, name, group, mat, fn, tris, **kw):
        kw['texel'] = kw.get('texel', 1.0) * self.texel.get(group, 1.0)
        self.parts.append(Part(name, group, mat, fn, max(24, int(tris * self.detail)), **kw))

    def whole(self):
        fs = [p.fn for p in self.parts]
        return lambda q: np.min([f(q) for f in fs], 0)

    def build(self, out_bin, out_blend=None, log=print):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        whole = self.whole()
        empties = {}
        for g, d in self.groups.items():
            e = bpy.data.objects.new(g, None)
            e.empty_display_size = .05
            bpy.context.scene.collection.objects.link(e)
            empties[g] = e
        for g, d in self.groups.items():
            piv = np.asarray(d['pivot'], F)
            if d['parent']:
                empties[g].parent = empties[d['parent']]
                piv = piv - np.asarray(self.abs_pivot(d['parent']), F)
            empties[g].location = to_blender(piv[None])[0]
            empties[g].scale = (d['scale'],) * 3
        head = {'name': self.name, 'scale': self.scale, 'groups': [], 'meshes': []}
        for g, d in self.groups.items():
            head['groups'].append({'name': g, 'parent': d['parent'], 'pivot': d['pivot'], 'scale': d['scale']})
        head['points'] = {k: {'group': g, 'at': [float(x) for x in (np.asarray(at, F) - np.asarray(self.abs_pivot(g), F))]} for k, (g, at) in self.points.items()}
        for part in self.parts:                      # every part's box is needed before any part can ask who buries it
            if part.lo is None:
                part.lo, part.hi = bounds(part.fn, self.lo, self.hi, self.coarse, .012 * self.unit)
        blob = bytearray()
        total = 0
        done = []
        cache = os.path.join(os.path.dirname(__file__), '..', 'out', self.name + '.cache.npz')
        again = os.environ.get('REPAINT') and os.path.exists(cache)      # only the picture is being worked on: reuse the meshes from the last full build
        if again:
            z = np.load(cache)
            for i, part in enumerate(self.parts):
                done.append(dict(part=part, ob=None, me=None, pos=z[f'pos{i}'], tri=z[f'tri{i}'], cnrm=z[f'cnrm{i}'], suv=z[f'suv{i}'], cav=z[f'cav{i}'] if f'cav{i}' in z else np.zeros(len(z[f'pos{i}']), F), n=len(z[f'pos{i}']), raw=0, t0=0))
        for part in ([] if again else self.parts):
            t0 = time.time()
            src = next((d for d in done if d['part'].name == part.twin), None) if part.twin else None
            if src:                                   # the other side's mesh, turned over
                v, f = src['pos'] * np.array([-1, 1, 1], F), src['tri'][:, ::-1]
            else:
                v, f = surface(part)
                if part.cull and not self.paint:      # a painted figure is thinned whole and loses its unseen faces afterwards (bake.seen): cutting first leaves torn edges for the thinning to chew on
                    f = self.hidden(part, v, f)
            ob = mesh_object(part, v, f, thin=not src)
            me = ob.data
            if part.cull and self.paint and not src:              # thinning leaves some faces wholly inside a neighbour (the underside of a strap, say): they would only waste paint
                n = len(me.vertices)
                co = np.empty(n * 3, F)
                me.vertices.foreach_get('co', co)
                pos = to_game(co.reshape(-1, 3))
                tri = np.empty(len(me.polygons) * 3, np.int32)
                me.loops.foreach_get('vertex_index', tri)
                tri = tri.reshape(-1, 3)
                q = np.concatenate([pos, pos[tri].mean(1)])
                deep = np.full(len(q), 1.0, F)
                for o in self.parts:
                    if o is part or o.group != part.group or np.any(np.asarray(o.lo) > np.asarray(part.hi)) or np.any(np.asarray(o.hi) < np.asarray(part.lo)):
                        continue
                    deep = np.minimum(deep, o.fn(q))
                gone = (deep[tri] < -.0005 * self.unit).all(1) & (deep[n:] < -.0005 * self.unit)
                if gone.any() and (~gone).sum() > 8:
                    bm = bmesh.new()
                    bm.from_mesh(me)
                    bm.faces.ensure_lookup_table()
                    bmesh.ops.delete(bm, geom=[bm.faces[int(k)] for k in np.nonzero(gone)[0]], context='FACES')
                    bm.to_mesh(me)
                    bm.free()
                    me.update()
            n = len(me.vertices)
            co = np.empty(n * 3, F)
            me.vertices.foreach_get('co', co)
            pos = to_game(co.reshape(-1, 3))
            vn = np.empty(n * 3, F)
            me.vertices.foreach_get('normal', vn)
            vnrm = to_game(vn.reshape(-1, 3))
            T = len(me.polygons)
            tri = np.empty(T * 3, np.int32)
            me.loops.foreach_get('vertex_index', tri)
            tri = tri.reshape(-1, 3)
            cn = np.empty(T * 9, F)
            me.corner_normals.foreach_get('vector', cn)
            cnrm = to_game(cn.reshape(-1, 3)).reshape(-1, 3, 3)
            uv = uv_for(part, pos, tri).astype(F)
            if isinstance(part.uv[-1], str) and part.uv[-1] == 'swap':                 # the skin's stripes run the other way on this part
                uv = np.ascontiguousarray(uv[..., ::-1])
            cav = crease(whole, pos, vnrm, self.unit) * self.ink if self.ink and not self.paint else np.zeros(len(pos), F)
            if src and len(tri) != len(src['tri']):
                raise ValueError(part.name + ' lost faces when it was mirrored')
            done.append(dict(part=part, ob=ob, me=me, pos=pos, tri=tri, cnrm=cnrm, suv=uv, cav=cav, n=n, raw=len(f), t0=time.time() - t0))
        if not again and not os.environ.get('NOCACHE'):
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            np.savez(cache, **{f'{k}{i}': d[k] for i, d in enumerate(done) for k in ('pos', 'tri', 'cnrm', 'suv', 'cav')})
        if self.shade:                  # a building: how shut in each corner is, on top of whatever its creases gave
            from . import bake
            t0 = time.time()
            for d, occ in zip(done, bake.sky(done)):
                d['cav'] = np.maximum(d['cav'], np.clip((occ - .1) * 1.35, 0, 1) * self.shade).astype(F)
                d['occ'] = occ
            log(f'shade from what stands around each corner in {time.time() - t0:.0f}s')
        if self.paint:                                # one painted picture for the whole figure; every part's UVs become its place in it
            from . import bake
            t0 = time.time()
            # faces nothing outside their own joint can ever see are dropped: they cost triangles and room in the picture for nothing
            see = bake.seen(done)
            byname = {d['part'].name: i for i, d in enumerate(done)}
            lost = 0
            for i, d in enumerate(done):
                j = byname.get(d['part'].twin) if d['part'].twin else None
                keep = see[i][0] if j is None else (see[i][0] | see[j][0][: len(see[i][0])]) if j < i else None
                if j is not None and j > i:
                    raise ValueError('a mirrored part must come after the part it mirrors')
                if j is not None:
                    op = np.maximum(see[i][1], see[j][1])
                    see[i], see[j] = (keep, op), (keep, op)
            for i, d in enumerate(done):
                keep = see[i][0]
                if keep.sum() < 4:
                    keep = np.ones(len(keep), bool)
                d['open'] = see[i][1][keep]
                if keep.all():
                    continue
                lost += int((~keep).sum())
                if d['me'] is not None:
                    bm = bmesh.new()
                    bm.from_mesh(d['me'])
                    bm.faces.ensure_lookup_table()
                    bmesh.ops.delete(bm, geom=[bm.faces[int(k)] for k in np.nonzero(~keep)[0]], context='FACES_ONLY')
                    bm.to_mesh(d['me'])
                    bm.free()
                    d['me'].update()
                    chk = np.empty(len(d['me'].polygons) * 3, np.int32)
                    d['me'].loops.foreach_get('vertex_index', chk)
                    if not np.array_equal(chk.reshape(-1, 3), d['tri'][keep]):
                        raise ValueError(d['part'].name + ': faces moved when the unseen ones were dropped')
                d['tri'], d['cnrm'], d['suv'] = d['tri'][keep], d['cnrm'][keep], d['suv'][keep]
            log(f'{lost} faces nobody can ever see dropped in {time.time() - t0:.0f}s')
            picture, lay = bake.paint(self, done, self.paint, log, self.brush)
            for d, u in zip(done, lay):
                d['suv'] = u
            from PIL import Image
            Image.fromarray(picture).save(out_bin[:-4] + '.webp', quality=78, method=6)       # the page that carries the game has a size limit, and 78 cannot be told from 88 in play
            head['tex'] = 1
            log(f'painted {self.paint}x{self.paint} in {time.time() - t0:.0f}s, {os.path.getsize(out_bin[:-4] + ".webp") / 1024:.0f} KB')
        if self.coat and not self.paint:              # a building's own wear, on a second layout that covers the whole of it once
            from . import bake
            from PIL import Image
            t0 = time.time()
            picture, lay2 = bake.coat(self, done, self.coat, log, self.look)
            for d, u in zip(done, lay2):
                d['uv2'] = u
            Image.fromarray(picture).save(out_bin[:-4] + '.wear.webp', quality=int(os.environ.get('COATQ', 72)), method=6)
            head['wear'] = 1
            log(f'wear {self.coat}x{self.coat} in {time.time() - t0:.0f}s, {os.path.getsize(out_bin[:-4] + ".wear.webp") / 1024:.0f} KB')
        for d in done:
            part, ob, me, pos, tri, cnrm, uv, cav, n, t0 = (d[k] for k in ('part', 'ob', 'me', 'pos', 'tri', 'cnrm', 'suv', 'cav', 'n', 't0'))
            uv2 = d.get('uv2')
            T = len(tri)
            if me is not None:                        # the .blend keeps the UVs and the crease value too
                layer = me.uv_layers.new(name='UVMap')
                layer.data.foreach_set('uv', uv.reshape(-1, 2).ravel())
                col = me.color_attributes.new('crease', 'FLOAT_COLOR', 'POINT')
                c4 = np.stack([.5 - cav * .5] * 3 + [np.ones(n, F)], -1)
                col.data.foreach_set('color', c4.ravel())
            # one record per distinct corner
            piv = np.asarray(self.abs_pivot(part.group), F)
            rec = np.concatenate([(pos[tri] - piv).reshape(-1, 3), cnrm.reshape(-1, 3), uv.reshape(-1, 2), cav[tri].reshape(-1, 1)] + ([uv2.reshape(-1, 2)] if uv2 is not None else []), 1)
            key = np.round(rec * np.array([1e4, 1e4, 1e4, 60, 60, 60, 2e4, 2e4, 15] + ([4e3, 4e3] if uv2 is not None else []), F))
            _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
            rec = rec[first]
            idx = inv.reshape(-1).astype(np.uint32)
            if len(rec) > 65535:
                raise ValueError(part.name + ' has too many vertices for 16-bit indices')
            lo, hi = rec[:, :3].min(0), rec[:, :3].max(0)
            q = np.round((rec[:, :3] - lo) / np.maximum(hi - lo, 1e-6) * 65535).astype(np.uint16)
            nq = np.clip(np.round(rec[:, 3:6] * 127), -127, 127).astype(np.int8)
            cq = np.clip(np.round(rec[:, 8:9] * 15), -15, 15).astype(np.int8)
            uq = np.round(np.clip(rec[:, 6:8], 0, 1) * 65535).astype(np.uint16)
            m = {'part': part.name, 'group': part.group, 'mat': part.mat, 'nv': int(len(rec)), 'ni': int(len(idx)), 'lo': [float(x) for x in lo], 'hi': [float(x) for x in hi]}
            if part.glow is not None:
                m['glow'] = float(part.glow)
            for k, arr in (('pos', q), ('nrm', np.concatenate([nq, cq], 1)), ('uv', uq), ('idx', idx.astype(np.uint16))) + ((('uv2', np.round(np.clip(rec[:, 9:11], 0, 1) * 65535).astype(np.uint16)),) if uv2 is not None else ()):
                while len(blob) % 4:
                    blob.append(0)
                m[k] = len(blob)
                blob += arr.tobytes()
            head['meshes'].append(m)
            if ob is not None:
                ob.parent = empties[part.group]
            total += T
            log(f'{part.name:14s} {part.mat:7s} {d["raw"]:7d} -> {T:5d} tris  {len(rec):5d} verts  {t0:4.1f}s')
        js = json.dumps(head, separators=(',', ':')).encode()
        while len(js) % 4:
            js += b' '
        with open(out_bin, 'wb') as fh:
            fh.write(struct.pack('<I', len(js)))
            fh.write(js)
            fh.write(blob)
        log(f'{self.name}: {total} triangles, {(4 + len(js) + len(blob)) / 1024:.0f} KB')
        # objects were made in world space; hang them on their pivots without moving them
        bpy.context.view_layer.update()
        for ob in bpy.data.objects:
            if ob.type == 'MESH' and ob.parent:
                ob.matrix_parent_inverse = Matrix.Translation(-ob.parent.matrix_world.translation)   # keeps the group's own scale
        if out_blend and not again:
            bpy.ops.wm.save_as_mainfile(filepath=out_blend)
        return total

    def abs_pivot(self, g):
        return self.groups[g]['pivot']
