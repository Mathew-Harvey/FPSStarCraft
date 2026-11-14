"""Brings a Veyl figure's near model and painted picture under the art size limits (tools/artsize.mjs).

    /home/claude/bl/.venv/bin/python tools/veyl/thin.py <kind>=<keep>[,<quality>[,<px>]] ...
    /home/claude/bl/.venv/bin/python tools/veyl/thin.py far <kind>=<cell> ...

keep: the share of the near model's triangles kept (1 leaves the model alone), cut part by part with art/kit/lod.py's decimate, so the
groups, pivots and UVs stay as they were. quality and px: the picture is saved again as webp at that quality and size (default 80, 1024).
far: thins the far model lod.py made (<kind>.far.bin) by snapping its larger parts' corners to a grid of <cell> metres, keeping its stamp
so lod.py leaves it be. For a figure of open, thin shells (the Chord's glass), which Blender's decimation will not cut, so lod.py's far
model stays over 80 KB whatever FAR asks for. From far off a cell of 5 cm is under a pixel.
Run art/kit/lod.py <kind> afterwards (FORCE=1) so the middle and far models are made from the new near model.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'art', 'kit'))
import numpy as np
from PIL import Image
import lod



def snap(r, c):
    """Corners in one grid cell move to the cell's middle; triangles that fold flat, or repeat, go. Each corner keeps its own UV."""
    P = r['pos']
    _, inv = np.unique(np.floor(P / c).astype(np.int64), axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    mid = np.zeros((inv.max() + 1, 3))
    np.add.at(mid, inv, P)
    mid /= np.bincount(inv)[:, None]
    f = inv[r['tri']]
    ok = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])
    _, u = np.unique(np.sort(f[ok], 1), axis=0, return_index=True)
    return dict(r, pos=mid[inv].astype(np.float32), tri=r['tri'][ok][np.sort(u)])


args = sys.argv[1:]
if args and args[0] == 'far':
    for arg in args[1:]:
        kind, keep = arg.split('=')
        path = os.path.join(lod.MESH, kind + '.far.bin')
        head, recs = lod.read(path)
        n0 = sum(len(r['tri']) for r in recs)
        n = lod.write(path, head, [snap(r, float(keep)) if len(r['tri']) > 200 else r for r in recs])
        print(f'{kind}.far: {n0} -> {n} triangles, {os.path.getsize(path) / 1024:.0f} KB')
    args = []
for arg in args:
    kind, spec = arg.split('=')
    bits = spec.split(',')
    keep = float(bits[0])
    q = int(bits[1]) if len(bits) > 1 else 80
    px = int(bits[2]) if len(bits) > 2 else 1024
    src = os.path.join(lod.MESH, kind + '.bin')
    if keep < 1:
        head, recs = lod.read(src)
        n0 = sum(len(r['tri']) for r in recs)
        out = [lod.decimate(r, max(16, int(len(r['tri']) * keep)), 60) if len(r['tri']) > 40 else r for r in recs]
        n = lod.write(src, head, out)
        print(f'{kind}: {n0} -> {n} triangles, {os.path.getsize(src) / 1024:.0f} KB')
    pic = os.path.join(lod.MESH, kind + '.webp')
    im = Image.open(pic).convert('RGB')
    if im.width != px:
        im = im.resize((px, px), Image.LANCZOS)
    im.save(pic, 'WEBP', quality=q, method=6)
    print(f'{kind}.webp: {px} px, quality {q}, {os.path.getsize(pic) / 1024:.0f} KB')
