"""Turns a figure rendered in game light (colour plus a white-on-black mask) into a 128 px command-card icon: colour flattened to a few
inked tones, ink drawn along the sharp changes inside, a bold outline round the outside, transparent behind.
Run:  python icons.py <raw dir> <kind> [kind ...]   reads <kind>-raw.png and <kind>-mask.png, writes ../assets/icons/<kind>.webp
"""
import sys
import os
import numpy as np
from PIL import Image
from scipy import ndimage as nd

INK = np.array([26, 20, 16], float)


def icon(raw, mask, size=128, outline=3.2, levels=5):
    col = np.asarray(Image.open(raw).convert('RGB'), float)
    m = np.asarray(Image.open(mask).convert('L'), float) / 255
    m = (m > .5).astype(float)
    # flatten: smooth then quantise the light (keep the hue), so it reads as cel paint and not a photo
    sm = nd.median_filter(col, size=(3, 3, 1))
    lum = sm.mean(-1, keepdims=True) + 1e-3
    q = np.round(np.clip(lum / 255, 0, 1) * levels) / levels * 255
    flat = np.clip(sm / lum * (q * .55 + lum * .45) * 1.08, 0, 255)
    # ink inside: where the light or the colour jumps
    g = sum(np.hypot(nd.sobel(flat[..., i], 0), nd.sobel(flat[..., i], 1)) for i in range(3)) / 3
    inner = np.clip((g - 90) / 120, 0, 1) * nd.binary_erosion(m > 0, iterations=3)
    # outline: the mask grown, drawn in ink behind the colour
    dist = nd.distance_transform_edt(1 - m)
    edge = np.clip(outline + .5 - dist, 0, 1)
    rgb = flat * (1 - inner[..., None] * .85) + INK * inner[..., None] * .85
    rgb = rgb * m[..., None] + INK * (1 - m[..., None])
    a = np.maximum(m, edge)
    img = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')
    bb = img.getbbox()
    if bb:
        img = img.crop(bb)
    w, h = img.size
    s = (size - 6) / max(w, h)
    img = img.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, ((size - img.width) // 2, size - 3 - img.height))
    return out


if __name__ == '__main__':
    src = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, '..', 'assets', 'icons'), exist_ok=True)
    for k in sys.argv[2:]:
        out = icon(os.path.join(src, k + '-raw.png'), os.path.join(src, k + '-mask.png'))
        out.save(os.path.join(here, '..', 'assets', 'icons', k + '.webp'), quality=88, method=6)
        print('icon', k)
