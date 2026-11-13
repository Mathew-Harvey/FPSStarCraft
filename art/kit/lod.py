"""Makes the middle and far models of a kind from its near model.

    /home/claude/bl/.venv/bin/python art/kit/lod.py [kind ...]     (no kinds: every assets/mesh/<kind>.bin that lacks a level)

Reads assets/mesh/<kind>.bin and writes <kind>.mid.bin and <kind>.far.bin in the same format (see art/README.md): the same groups and
pivots, every part kept with its skin, UVs carried through so the same painted picture fits. Blender's collapse decimation does the
cutting; UVs, the wear layout and the crease value ride on the corners and are blended where edges collapse.
FORCE=1 rewrites levels that exist (an art stream's own level is kept otherwise). MID= and FAR= override the triangle targets.
"""
import json
import os
import struct
import sys
import numpy as np
import bpy
import bmesh

F = np.float32
HERE = os.path.dirname(os.path.abspath(__file__))
MESH = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'mesh'))


def read(path):
    """The head and, per mesh record, its corners: position, normal, uv, crease, uv2 (or None), and its triangles."""
    u8 = open(path, 'rb').read()
    hl = struct.unpack('<I', u8[:4])[0]
    head = json.loads(u8[4:4 + hl])
    base = 4 + hl
    out = []
    for m in head['meshes']:
        n, ni = m['nv'], m['ni']
        q = np.frombuffer(u8, np.uint16, n * 3, base + m['pos']).reshape(n, 3).astype(F)
        lo, hi = np.array(m['lo'], F), np.array(m['hi'], F)
        pos = lo + q / 65535 * (hi - lo)
        nq = np.frombuffer(u8, np.int8, n * 4, base + m['nrm']).reshape(n, 4).astype(F)
        uv = np.frombuffer(u8, np.uint16, n * 2, base + m['uv']).reshape(n, 2).astype(F) / 65535
        uv2 = np.frombuffer(u8, np.uint16, n * 2, base + m['uv2']).reshape(n, 2).astype(F) / 65535 if 'uv2' in m else None
        idx = np.frombuffer(u8, np.uint16, ni, base + m['idx']).reshape(-1, 3).astype(np.int64)
        out.append(dict(pos=pos, nrm=nq[:, :3] / 127, cq=nq[:, 3] / 15, uv=uv, uv2=uv2, tri=idx))
    return head, out


def decimate(r, want, sharp):
    """One mesh record cut to about `want` triangles. Returns corners and triangles in the same shape as read()."""
    pos, tri = r['pos'], r['tri']
    if len(tri) <= want:
        return r
    # weld corners that share a position, so the mesh is one surface and collapses can cross UV seams' neighbours
    key = np.round(pos * 1e4).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    v = pos[first]
    f = inv[tri]
    keep = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])
    f, ctri = f[keep], tri[keep]
    me = bpy.data.meshes.new('lod')
    me.vertices.add(len(v))
    me.vertices.foreach_set('co', v.ravel())
    me.loops.add(len(f) * 3)
    me.loops.foreach_set('vertex_index', f.ravel())
    me.polygons.add(len(f))
    me.polygons.foreach_set('loop_start', np.arange(0, len(f) * 3, 3))
    me.polygons.foreach_set('loop_total', np.full(len(f), 3))
    corners = ctri.ravel()
    for name, data in (('UVMap', r['uv']), ('cq', np.stack([r['cq'], np.zeros_like(r['cq'])], 1)), ('UV2', r['uv2'])):
        if data is None:
            continue
        layer = me.uv_layers.new(name=name)
        layer.data.foreach_set('uv', data[corners].astype(F).ravel())
    me.update()
    me.validate()
    ob = bpy.data.objects.new('lod', me)
    bpy.context.scene.collection.objects.link(ob)
    md = ob.modifiers.new('cut', 'DECIMATE')
    md.ratio = want / max(1, len(me.polygons))
    md.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    m2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    bm = bmesh.new()
    bm.from_mesh(m2)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(m2)
    bm.free()
    for p in m2.polygons:
        p.use_smooth = True
    m2.set_sharp_from_angle(angle=np.radians(sharp))
    nl = len(m2.loops)
    vi = np.empty(nl, np.int64)
    m2.loops.foreach_get('vertex_index', vi)
    co = np.empty(len(m2.vertices) * 3, F)
    m2.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    cn = np.empty(nl * 3, F)
    m2.corner_normals.foreach_get('vector', cn)
    cn = cn.reshape(-1, 3)

    def layer(name):
        if name not in m2.uv_layers:
            return None
        a = np.empty(nl * 2, F)
        m2.uv_layers[name].data.foreach_get('uv', a)
        return a.reshape(-1, 2)
    uv, cq, uv2 = layer('UVMap'), layer('cq'), layer('UV2')
    bpy.data.meshes.remove(m2)
    return dict(pos=co[vi], nrm=cn, cq=cq[:, 0], uv=uv, uv2=uv2, tri=np.arange(nl).reshape(-1, 3))


def write(path, head, recs):
    """Same layout as Figure.build in art/kit/build.py: distinct corners, 16-bit quantised, 4-byte aligned blocks after a JSON head."""
    head = json.loads(json.dumps(head))
    blob = bytearray()
    total = 0
    for m, r in zip(head['meshes'], recs):
        tri = r['tri']
        rec = np.concatenate([r['pos'][tri].reshape(-1, 3), r['nrm'][tri].reshape(-1, 3), r['uv'][tri].reshape(-1, 2), r['cq'][tri].reshape(-1, 1)] + ([r['uv2'][tri].reshape(-1, 2)] if r['uv2'] is not None else []), 1)
        key = np.round(rec * np.array([1e4, 1e4, 1e4, 60, 60, 60, 2e4, 2e4, 15] + ([4e3, 4e3] if r['uv2'] is not None else []), F))
        _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
        rec, idx = rec[first], inv.reshape(-1).astype(np.uint16)
        lo, hi = rec[:, :3].min(0), rec[:, :3].max(0)
        q = np.round((rec[:, :3] - lo) / np.maximum(hi - lo, 1e-6) * 65535).astype(np.uint16)
        nn = rec[:, 3:6] / np.maximum(np.linalg.norm(rec[:, 3:6], axis=1, keepdims=True), 1e-6)
        nq = np.clip(np.round(nn * 127), -127, 127).astype(np.int8)
        cq = np.clip(np.round(rec[:, 8:9] * 15), -15, 15).astype(np.int8)
        uq = np.round(np.clip(rec[:, 6:8], 0, 1) * 65535).astype(np.uint16)
        m.update(nv=int(len(rec)), ni=int(len(idx)), lo=[float(x) for x in lo], hi=[float(x) for x in hi])
        m.pop('uv2', None)
        for k, arr in (('pos', q), ('nrm', np.concatenate([nq, cq], 1)), ('uv', uq), ('idx', idx)) + ((('uv2', np.round(np.clip(rec[:, 9:11], 0, 1) * 65535).astype(np.uint16)),) if r['uv2'] is not None else ()):
            while len(blob) % 4:
                blob.append(0)
            m[k] = len(blob)
            blob += arr.tobytes()
        total += len(idx) // 3
    js = json.dumps(head, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<I', len(js)))
        fh.write(js)
        fh.write(blob)
    return total


def merge(head, recs, drop):
    """Joins the parts of a group that wear the same skin and glow into one record, so a level has a few big shapes to cut instead of
    many small ones. Parts smaller than `drop` metres across are left out (at far zoom a buckle is under a pixel)."""
    head = json.loads(json.dumps(head))
    out, metas, at = [], [], {}
    for m, r in zip(head['meshes'], recs):
        if drop and np.linalg.norm(r['pos'].max(0) - r['pos'].min(0)) * (head.get('scale') or 1) < drop:
            continue
        k = (m['group'], m['mat'], m.get('glow'))
        if k not in at:
            at[k] = len(out)
            metas.append(dict(m, part=m['group'] + '.' + m['mat']))
            out.append(dict(r))
            continue
        a = out[at[k]]
        if (a['uv2'] is None) != (r['uv2'] is None):
            raise ValueError('parts of one skin disagree on the wear layout')
        a['tri'] = np.concatenate([a['tri'], r['tri'] + len(a['pos'])])
        for f in ('pos', 'nrm', 'cq', 'uv') + (('uv2',) if a['uv2'] is not None else ()):
            a[f] = np.concatenate([a[f], r[f]])
    head['meshes'] = metas
    return head, out


def level(head, recs, target, sharp, floor):
    """Shares `target` triangles across the parts by their size, each keeping at least `floor` (a small part stays a shape)."""
    sizes = np.array([len(r['tri']) for r in recs], F)
    share = np.maximum(floor, np.floor(sizes / sizes.sum() * target)).astype(int)
    return [decimate(r, int(w), sharp) for r, w in zip(recs, share)]


def surface_area(P, T):
    return float(np.linalg.norm(np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]]), axis=1).sum()) / 2


def survives(r, voxel):
    """How much of a part's surface is left after a voxel remesh, 0 to 1 and more. A thin part (a halo, a staff) comes back with little."""
    me = bpy.data.meshes.new('t')
    me.from_pydata(r['pos'].tolist(), [], r['tri'].tolist())
    ob = bpy.data.objects.new('t', me)
    bpy.context.scene.collection.objects.link(ob)
    md = ob.modifiers.new('fuse', 'REMESH')
    md.mode = 'VOXEL'
    md.voxel_size = voxel
    m2 = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    co = np.empty(len(m2.vertices) * 3, F)
    m2.vertices.foreach_get('co', co)
    tris = [list(p.vertices) for p in m2.polygons]
    bpy.data.meshes.remove(m2)
    if not tris:
        return 0.0
    co = co.reshape(-1, 3)
    a = sum(float(np.linalg.norm(np.cross(co[t[1]] - co[t[0]], co[t[2]] - co[t[0]]))) / 2 + (float(np.linalg.norm(np.cross(co[t[2]] - co[t[0]], co[t[3]] - co[t[0]]))) / 2 if len(t) == 4 else 0) for t in tris)
    return a / max(surface_area(r['pos'], r['tri']), 1e-9)


def far_remesh(head, recs, target, voxel, sharp=55):
    """The far model of a painted figure: each group's parts are fused into one closed skin (Blender voxel remesh), cut to its share of
    `target`, and painted from the near model: every new triangle takes the near triangle nearest its middle and reads the picture
    through it, so a triangle never straddles two islands of the picture. Small cut-down shells look like torn shards; this does not."""
    from mathutils.bvhtree import BVHTree
    head = json.loads(json.dumps(head))
    S = head.get('scale') or 1
    by, thin = {}, []
    for m, r in zip(head['meshes'], recs):
        ext = (r['pos'].max(0) - r['pos'].min(0)) * S
        if ext.max() > voxel * 3 and survives(r, voxel / S) < .45:
  # a halo, a staff, an aerial: thinner than the fused skin can hold, but long
            thin.append((m, r))                                    # enough to read, so it stays a part of its own (and keeps its glow)
        else:
            by.setdefault(m['group'], []).append((m, r))
    area = {g: sum(float(np.linalg.norm(np.cross(r['pos'][r['tri'][:, 1]] - r['pos'][r['tri'][:, 0]], r['pos'][r['tri'][:, 2]] - r['pos'][r['tri'][:, 0]]), axis=1).sum()) for _, r in L) for g, L in by.items()}
    tot = sum(area.values()) or 1
    metas, outs = [], []
    for g, L in by.items():
        P = np.concatenate([r['pos'] for _, r in L])
        T, UV, CQ, off = [], [], [], 0
        for _, r in L:
            T.append(r['tri'] + off)
            UV.append(r['uv'])
            CQ.append(r['cq'])
            off += len(r['pos'])
        T, UV, CQ = np.concatenate(T), np.concatenate(UV), np.concatenate(CQ)
        me = bpy.data.meshes.new('src')
        me.from_pydata(P.tolist(), [], T.tolist())
        me.update()
        ob = bpy.data.objects.new('src', me)
        bpy.context.scene.collection.objects.link(ob)
        rm = ob.modifiers.new('fuse', 'REMESH')
        rm.mode = 'VOXEL'
        rm.voxel_size = voxel / S
        rm.use_smooth_shade = True
        want = max(12, int(target * area[g] / tot))
        dg = bpy.context.evaluated_depsgraph_get()
        m1 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        ob.modifiers.clear()
        ob.data = m1
        if len(m1.polygons) == 0:                       # everything in the group was thinner than a voxel: keep the cut-down parts
            bpy.data.objects.remove(ob)
            continue
        dm = ob.modifiers.new('cut', 'DECIMATE')
        dm.ratio = min(1, want / max(1, len(m1.polygons) * 2))   # remesh gives quads, two triangles each
        dm.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        m2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob)
        bm = bmesh.new()
        bm.from_mesh(m2)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(m2)
        bm.free()
        for p in m2.polygons:
            p.use_smooth = True
        m2.set_sharp_from_angle(angle=np.radians(sharp))
        nl = len(m2.loops)
        vi = np.empty(nl, np.int64)
        m2.loops.foreach_get('vertex_index', vi)
        co = np.empty(len(m2.vertices) * 3, F)
        m2.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)[vi]
        cn = np.empty(nl * 3, F)
        m2.corner_normals.foreach_get('vector', cn)
        cn = cn.reshape(-1, 3)
        bpy.data.meshes.remove(m2)
        # paint: nearest near triangle to each new triangle's middle, corners read through it
        bvh = BVHTree.FromPolygons(P.tolist(), T.tolist(), epsilon=0.0)
        tri3 = co.reshape(-1, 3, 3)
        uv = np.zeros((nl, 2), F)
        cq = np.zeros(nl, F)
        for i, t in enumerate(tri3):
            hit = bvh.find_nearest(t.mean(0).tolist())
            f = hit[2] if hit[2] is not None else 0
            a, b, c = P[T[f]]
            v0, v1 = b - a, c - a
            d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
            den = d00 * d11 - d01 * d01 or 1e-12
            for k in range(3):
                v2 = t[k] - a
                d20, d21 = v2 @ v0, v2 @ v1
                w1 = (d11 * d20 - d01 * d21) / den
                w2 = (d00 * d21 - d01 * d20) / den
                w = np.clip(np.array([1 - w1 - w2, w1, w2]), 0, None)
                w /= w.sum() or 1
                uv[i * 3 + k] = w @ UV[T[f]]
                cq[i * 3 + k] = w @ CQ[T[f]]
        m0 = dict(L[0][0], part=g + '.far', glow=0)
        m0.pop('uv2', None)
        metas.append(m0)
        outs.append(dict(pos=co, nrm=cn, cq=cq, uv=uv, uv2=None, tri=np.arange(nl).reshape(-1, 3)))
    if thin:
        th, tr = {'meshes': [m for m, _ in thin], 'groups': head['groups'], 'scale': head.get('scale')}, [r for _, r in thin]
        th, tr = merge(th, tr, 0)
        for m, r in zip(th['meshes'], level(th, tr, max(24 * len(tr), target // 6), sharp, 12)):
            metas.append(m)
            outs.append(r)
    head['meshes'] = metas
    return head, outs


def main(kinds):
    force = os.environ.get('FORCE') == '1'
    if not kinds:
        kinds = sorted(f[:-4] for f in os.listdir(MESH) if f.endswith('.bin') and not f.endswith(('.mid.bin', '.far.bin')) and os.path.exists(os.path.join(MESH, f[:-4] + '.webp')))
        # only painted figures (bodies) switch levels in the game for now; a building's skins are shared with its maker's extras
    for kind in kinds:
        src = os.path.join(MESH, kind + '.bin')
        head, recs = read(src)
        near = sum(len(r['tri']) for r in recs)
        figure = bool(head.get('tex'))                     # a painted figure (a body); otherwise a building or a growth
        mid_t = int(os.environ.get('MID', 4000 if figure else max(1500, near // 4)))
        far_t = int(os.environ.get('FAR', 600 if figure else 1000))
        allp = np.concatenate([r['pos'] for r in recs]) * (head.get('scale') or 1)
        tall = float(allp[:, 1].max() - allp[:, 1].min())
        for tag, target, sharp, floor, drop in (('mid', mid_t, 42, 12, 0), ('far', far_t, 55, 8, .06 * tall)):
            out = os.path.join(MESH, f'{kind}.{tag}.bin')
            if os.path.exists(out) and not force:
                print(f'{kind}.{tag}: kept (exists)')
                continue
            if tag == 'far' and figure:
                n = write(out, *far_remesh(head, recs, target, max(.04, tall * .022)))
            else:
                h2, r2 = merge(head, recs, drop)
                n = write(out, h2, level(h2, r2, target, sharp, floor))
            print(f'{kind}.{tag}: {near} -> {n} triangles, {os.path.getsize(out) / 1024:.0f} KB')


if __name__ == '__main__':
    main(sys.argv[1:])
