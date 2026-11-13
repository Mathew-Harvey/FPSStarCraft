"""Buildings. A building is sculpted the same way a figure is, only bigger: the box it is searched in, the grid that finds its
parts and the width of an inked crease all grow with it."""
import os
import sys
from . import build as B


def building(name, hx, hz, h, unit=4.0, detail=1.0, coarse=.09, ink=1.0, shade=.72, coat=512, look='yard'):
    """A figure sized for a building that reaches hx and hz either side of its middle and h high."""
    return B.Figure(name, lo=(-hx, -.3, -hz), hi=(hx, h, hz), coarse=coarse, detail=detail, unit=unit, ink=ink, shade=shade, coat=coat, look=look)


def main(makers, file):
    """python <file>.py <kind> [preview.png] [part or group ...]"""
    args = sys.argv[1:]
    kind = args[0]
    png = next((a for a in args[1:] if a.endswith('.png')), None)
    only = [a for a in args[1:] if not a.endswith('.png')]
    fig = makers[kind]()
    if only:
        fig.parts = [p for p in fig.parts if any(p.name.startswith(o) or p.group == o for o in only)]
    here = file.rsplit('/', 1)[0]
    fig.build(here + '/../assets/mesh/' + kind + '.bin' if not only else '/tmp/' + kind + '-part.bin', here + '/out/' + kind + '.blend' if not only else None)
    if png:
        from . import look
        w, h = max(fig.hi[0] - fig.lo[0], fig.hi[2] - fig.lo[2]), fig.hi[1]
        c = [float(x) for x in os.environ['LOOK'].split(',')] if os.environ.get('LOOK') else [0, 0, h * .46, max(h, w * .8) * 1.08]
        look.render(png, views=(('front', 0), ('three', 35), ('back', 200)), centre=(c[0], -c[1], c[2]), height=c[3], px=int(os.environ.get('PX', 560)), dist=80, aspect=max(.5, min(1.4, w / h)))
