"""The Gloam: what grows where the ore rots. Five bodies off one kit of legs, plates, caps and sacs.

Grazer (the worker), Snapper (the biter), Quillback (the spitter), Blister (the walking bomb), Mulcher (the truck-sized
beetle). Mossy hide, a pale ribbed belly, bone where it bites, mushroom caps where it has stood still too long.
Run:  python gloam.py grazer|snapper|quillback|blister|mulcher [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, veyl as Vk, gloam as G
from kit.sdf import V, rot

KIND = next((a for a in sys.argv[1:] if a in ('grazer', 'snapper', 'quillback', 'blister', 'mulcher')), 'grazer')
PI = np.pi


def ribbed(f, c, n, amp, ax=2):
    """A belly in soft bands."""
    return S.bump(f, lambda p: amp * np.sin((p[..., ax] - c) * n))


def eyes(pts, r, look=.4):
    """Amber eyes: each a bead set in a socket, turned a little outward."""
    return S.union(*[S.ellipsoid(q, (r, r * .95, r * .8), rot(0, np.sign(q[0]) * look, 0)) for q in pts])


def build_grazer():
    fig = B.Figure('grazer', lo=(-1.2, -.1, -1.2), hi=(1.2, 1.6, 1.2))
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, .5, .38), 'body')
    G.add_legs(fig, [(.22, .36, .15, .24), (-.04, .4, .02, .24), (-.28, .36, -.1, .24)], .062, .4)
    body = S.ellipsoid((0, .52, -.04), (.41, .27, .5))
    body = S.union(body, S.ellipsoid((0, .5, -.42), (.28, .2, .22)), k=.08)                                         # a rump
    body = S.bump(body, lambda p: .012 * np.sin(p[..., 2] * 34) * np.clip((p[..., 1] - .5) * 6, 0, 1))                # creased across the back
    fig.add('hide', 'body', 'gH', G.hide(body, 1.1, .016, 8), 1500, voxel=.004, uv=('cyl', V(0, .5, -.05), (0, 0, 1)))
    belly = ribbed(S.ellipsoid((0, .37, -.02), (.34, .19, .42)), 0, 44, .008)
    fig.add('belly', 'body', 'gV', belly, 500, voxel=.004, uv=('side',))
    cap, gill = G.mushroom((0, .72, -.12), .52, .34, (-.12, 0, 0), 1.1, 1.0)
    cap = S.cut(cap, S.sphere((.4, .78, .32), .13), k=.02)                                                           # a bite out of the lip
    fig.add('cap', 'body', 'gC', cap, 1500, voxel=.004, uv=('top',))
    fig.add('gills', 'body', 'gGb', gill, 600, voxel=.004, uv=('top',))
    small, sg = G.mushroom((-.26, .68, -.52), .14, .12, (-.5, 0, .5), 1.0, 2.0)
    fig.add('capsmall', 'body', 'gC', small, 260, voxel=.003, uv=('top',))
    fig.add('gillssmall', 'body', 'gGb', sg, 120, voxel=.003, uv=('top',))
    fig.add('sacs', 'body', 'gS', G.sacs((0, .74, -.5), 4, .08, 3), 320, voxel=.003, uv=('top',))
    H0 = V(0, .5, .38)
    head = S.ellipsoid(H0 + V(0, .02, .08), (.23, .18, .21))
    head = S.union(head, S.ellipsoid(H0 + V(0, -.05, .2), (.15, .1, .12)), k=.05)                                    # a blunt muzzle
    for sx in (-1, 1):
        head = S.cut(head, S.sphere(H0 + V(sx * .15, .1, .23), .055), k=.012)
    fig.add('head', 'head', 'gHn', G.hide(head, 2.2, .01, 12), 900, voxel=.0032, uv=('cyl', H0 + V(0, 0, .08), (0, 0, 1)))
    shield = S.cut(S.ellipsoid(H0 + V(0, .12, .04), (.215, .1, .2), rot(-.4, 0, 0)), S.ellipsoid(H0 + V(0, .08, .05), (.2, .1, .19), rot(-.4, 0, 0)))
    shield = S.union(shield, G.spine(H0 + V(0, .2, -.02), (0, .6, -1), .12, .03), k=.01)
    fig.add('headshield', 'head', 'gBc', shield, 360, voxel=.003, uv=('top',))
    mand = []
    for sx in (-1, 1):                                                                                             # grinding plates that meet in the middle
        m = S.cut(S.ellipsoid(H0 + V(sx * .07, -.09, .27), (.085, .035, .11), rot(0, sx * .3, sx * .2)), S.sphere(H0 + V(sx * .0, -.09, .36), .06))
        mand.append(S.union(m, *[G.spine(H0 + V(sx * (.03 + i * .03), -.1, .33 + i * .01), (-sx * .4, -.6, .5), .035, .012) for i in range(3)], k=.006))
    fig.add('mandibles', 'head', 'gBn', S.union(*mand), 420, voxel=.0028, uv=('top',))
    fig.add('eyes', 'head', 'gEye', eyes([H0 + V(sx * .14, .1, .22) for sx in (-1, 1)], .05), 160, voxel=.0028, uv=('front',))
    fe = S.union(*[S.chain(S.bez(H0 + V(sx * .08, .16, .2), H0 + V(sx * .18, .38, .28), H0 + V(sx * .27, .42, .5), 6), list(np.linspace(.018, .008, 7))) for sx in (-1, 1)])
    fig.add('feelers', 'head', 'gD', fe, 180, voxel=.0025)
    fig.add('feelertips', 'head', 'gS', S.union(*[S.sphere(H0 + V(sx * .27, .42, .5), .028) for sx in (-1, 1)]), 80, voxel=.003)
    return fig, (0, 0, .55, 1.5)


def build_snapper():
    fig = B.Figure('snapper', lo=(-1.2, -.1, -1.5), hi=(1.2, 1.4, 1.4))
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, .6, .48), 'body')
    G.add_legs(fig, [(.3, .3, .42, .17), (-.26, .34, -.34, .17)], .07, .44)
    spinep = [V(0, .58, .36), V(0, .6, .05), V(0, .56, -.3), V(0, .46, -.66), V(0, .36, -1.0)]
    body = S.chain(spinep, [.24, .27, .22, .12, .03])
    body = S.squash(body, (.9, 1, 1))
    body = S.bump(body, lambda p: .012 * np.sin(p[..., 2] * 40) * np.clip((p[..., 1] - .55) * 8, 0, 1))
    fig.add('hide', 'body', 'gH', G.hide(body, 4.1, .014, 10), 1500, voxel=.0035, uv=('cyl', V(0, .55, -.3), (0, 0, 1)))
    belly = ribbed(S.squash(S.chain([V(0, .47, .32), V(0, .45, -.3), V(0, .38, -.6)], [.13, .15, .07]), (.8, 1, 1)), 0, 50, .007)
    fig.add('belly', 'body', 'gV', belly, 420, voxel=.0035, uv=('side',))
    fig.add('plates', 'body', 'gBc', G.back_plates((0, .76, .3), (0, .52, -.76), 6, .36), 1100, voxel=.003, uv=('top',))
    fig.add('sacs', 'body', 'gS', S.union(*[S.sphere(((.07 if i % 2 else -.07), .74 - i * .06, -.12 - i * .2), .045) for i in range(3)]), 180, voxel=.003)
    frill = S.union(*[G.crescent_fin(V(sx * .1, .62, .34), .3, .012, rot(.2, sx * 1.2, sx * .5) @ rot(0, 0, -sx * 1.0)) for sx in (-1, 1)])
    fig.add('frill', 'body', 'gG', frill, 520, voxel=.003, uv=('side',))
    tailsp = S.union(*[G.spine(spinep[3] + (spinep[4] - spinep[3]) * t + V(0, .06 - t * .04, 0), (0, 1, -.7), .12 - t * .05, .022) for t in (.0, .3, .6)])
    fig.add('tailspines', 'body', 'gBn', tailsp, 120, voxel=.003)
    H0 = V(0, .6, .48)
    skull = S.ellipsoid(H0 + V(0, .05, .06), (.17, .13, .22))
    for sx in (-1, 1):
        skull = S.cut(skull, S.sphere(H0 + V(sx * .12, .14, .21), .045), k=.01)
    fig.add('skull', 'head', 'gHn', G.hide(skull, 5.2, .008, 14), 620, voxel=.003, uv=('cyl', H0, (0, 0, 1)))
    cap = S.cut(S.ellipsoid(H0 + V(0, .13, .0), (.18, .08, .2), rot(-.5, 0, 0)), S.ellipsoid(H0 + V(0, .09, .01), (.165, .08, .19), rot(-.5, 0, 0)))
    cap = S.union(cap, G.spine(H0 + V(0, .2, -.1), (0, .5, -1), .1, .025), k=.01)
    fig.add('skullcap', 'head', 'gBc', cap, 300, voxel=.003, uv=('top',))
    lip1, maw1, t1 = G.jaw(H0 + V(0, -.1, .2), .32, .42, 7, 1, .3)                                                    # lower, hanging open
    lip2, maw2, t2 = G.jaw(H0 + V(0, .0, .22), .3, .4, 7, -1, 1.7)
    low = S.moved(S.union(lip1), R=rot(.22, 0, 0), c=H0 + V(0, -.08, .0))
    fig.add('jaws', 'head', 'gHn', S.union(low, lip2), 520, voxel=.003, uv=('top',))
    fig.add('maw', 'head', 'gMaw', S.union(S.moved(maw1, R=rot(.22, 0, 0), c=H0 + V(0, -.08, .0)), maw2), 160, voxel=.003, uv=('top',))
    fig.add('teeth', 'head', 'gBn', S.union(S.moved(t1, R=rot(.22, 0, 0), c=H0 + V(0, -.08, .0)), t2), 520, voxel=.0025)
    fig.add('eyes', 'head', 'gEye', eyes([H0 + V(sx * .11, .14, .2) for sx in (-1, 1)], .04, .5), 140, voxel=.0025, uv=('front',))
    return fig, (0, 0, .5, 1.5)


def build_quillback():
    fig = B.Figure('quillback', scale=1.22, lo=(-1.4, -.1, -1.6), hi=(1.4, 2.6, 1.5))
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, 1.64, .4), 'body')
    fig.group('arms', (0, 1.6, .5), 'body')
    G.add_legs(fig, [(.3, .46, .33, .26), (-.3, .5, -.33, .26)], .1, .72)
    body = S.ellipsoid((0, .98, -.02), (.36, .33, .55), rot(-.28, 0, 0))
    neck = S.chain([V(0, .98, .22), V(0, 1.3, .36), V(0, 1.62, .38)], [.27, .24, .2])
    body = S.union(body, S.squash(neck, (.92, 1, 1)), k=.08)
    body = S.bump(body, lambda p: .012 * np.sin(p[..., 1] * 30 + p[..., 2] * 12) * np.clip(p[..., 2] * 3 + .2, 0, 1))
    fig.add('hide', 'body', 'gH', G.hide(body, 6.1, .018, 8), 1900, voxel=.0045, uv=('cyl', V(0, 1.1, .1)))
    belly = ribbed(S.union(S.ellipsoid((0, .84, .02), (.28, .2, .45)), S.chain([V(0, 1.1, .4), V(0, 1.47, .52)], [.16, .13]), k=.06), 0, 40, .008, 1)
    fig.add('belly', 'body', 'gV', belly, 600, voxel=.0045, uv=('front',))
    hoodf = S.union(*[G.crescent_fin(V(sx * .12, 1.44, .3), .42, .016, rot(.3, sx * 1.1, sx * .3) @ rot(0, 0, -sx * 1.1)) for sx in (-1, 1)])
    fig.add('hood', 'body', 'gG', hoodf, 620, voxel=.004, uv=('side',))
    q = []
    for row in range(3):                                                                                           # the fan of quills, longest in the middle
        for i in range(7):
            a = (i - 3) * .26
            ln = (.95 - abs(i - 3) * .1) * (1 - row * .2)
            d = rot(-.9 - row * .2, 0, -a * 1.4) @ V(0, 1, 0)
            q.append(G.spine(V(np.sin(a) * .2, 1.18 - row * .08, -.1 - row * .2), d, ln, .04, .04))
    fig.add('quills', 'body', 'gBn', S.union(*q), 1300, voxel=.004, uv=('side',))
    fig.add('sacs', 'body', 'gS', G.sacs((0, 1.2, -.34), 5, .12, 7), 380, voxel=.004)
    H0 = V(0, 1.64, .4)
    cap, gill = G.mushroom(H0 + V(0, .16, -.02), .3, .2, (-.3, 0, 0), 1.1, 3.0)
    fig.add('headcap', 'head', 'gC', cap, 900, voxel=.0035, uv=('top',))
    fig.add('headgills', 'head', 'gGb', gill, 360, voxel=.0035, uv=('top',))
    face = S.ellipsoid(H0 + V(0, .02, .06), (.15, .15, .17))
    for sx in (-1, 1):
        face = S.cut(face, S.sphere(H0 + V(sx * .11, .08, .21), .05), k=.01)
    fig.add('face', 'head', 'gHn', G.hide(face, 7.2, .008, 14), 520, voxel=.003, uv=('front',))
    fig.add('eyes', 'head', 'gEye', eyes([H0 + V(sx * .1, .08, .2) for sx in (-1, 1)], .045, .5), 140, voxel=.0028, uv=('front',))
    A = V(0, 1.6, .5)
    tube = S.chain([A + V(0, -.06, -.02), A + V(0, -.08, .2), A + V(0, -.06, .4)], [.1, .085, .07])
    tube = S.cut(tube, S.cyl(A + V(0, -.06, .3), A + V(0, -.06, .5), .04))                                           # bored through
    fig.add('spittube', 'arms', 'gH', G.hide(tube, 8.3, .006, 16), 320, voxel=.003, uv=('cyl', A, (0, 0, 1)))
    fig.add('tuberings', 'arms', 'gB', S.union(*[S.torus(A + V(0, -.07, z), .083 - z * .03, .022, rot(PI / 2, 0, 0)) for z in (.1, .22, .34)]), 300, voxel=.003)
    fig.add('tubeglow', 'arms', 'gS', S.torus(A + V(0, -.06, .4), .058, .02, rot(PI / 2, 0, 0)), 100, voxel=.003)
    fig.point('muzzle', A + V(0, -.06, .48), 'arms')
    return fig, (0, 0, 1.1, 2.6)


def build_blister():
    fig = B.Figure('blister', lo=(-1.0, -.1, -1.0), hi=(1.0, 1.5, 1.0))
    fig.group('body', (0, 0, 0))
    fig.group('halo', (0, .64, -.06), 'body')
    fig.group('head', (0, .36, .28), 'body')
    G.add_legs(fig, [(.16, .24, .13, .17), (-.04, .24, -.03, .17), (-.22, .24, -.18, .17)], .045, .3, detail=.8)
    body = S.ellipsoid((0, .34, .02), (.2, .13, .25))
    fig.add('hide', 'body', 'gH', G.hide(body, 9.1, .008, 14), 500, voxel=.003, uv=('cyl', V(0, .34, 0), (0, 0, 1)))
    C = V(0, .64, -.06)
    sac = S.ellipsoid(C, (.38, .35, .4))
    sac = S.bump(sac, lambda p: .02 * np.sin(p[..., 0] * 9) + .03 * (S.noise(p, 5, 3.3) - .5) + .025 * np.clip((S.noise(p, 9, 7.7) - .62) * 5, 0, 1))   # stretched tight and lumpy
    fig.add('sac', 'halo', 'gS', sac, 1300, voxel=.0045, uv=('cyl', C))
    veins = []
    for i in range(5):                                                                                             # dark veins holding it down
        a = i / 5 * 2 * PI + .3
        pts = [S.skin(sac, C, V(np.cos(a) * np.sin(t), np.cos(t), np.sin(a) * np.sin(t)), tmax=.7, n=300, out=.004) for t in np.linspace(.25, 2.3, 8)]
        veins.append(S.chain(pts, list(np.linspace(.02, .012, 8))))
    fig.add('veins', 'halo', 'gD', S.union(*veins), 520, voxel=.003)
    knot = S.union(S.ellipsoid(C + V(0, .34, 0), (.1, .045, .1)), G.spine(C + V(0, .36, 0), (.2, 1, 0), .1, .03), k=.01)
    fig.add('sacknot', 'halo', 'gBc', knot, 160, voxel=.003, uv=('top',))
    H0 = V(0, .36, .28)
    head = S.ellipsoid(H0, (.12, .1, .11))
    fig.add('head', 'head', 'gHn', G.hide(head, 9.6, .006, 16), 360, voxel=.0028, uv=('front',))
    fig.add('eyes', 'head', 'gEye', eyes([H0 + V(sx * .07, .05, .09) for sx in (-1, 1)], .03, .5), 110, voxel=.0022, uv=('front',))
    fig.add('fangs', 'head', 'gBn', S.union(*[G.spine(H0 + V(sx * .06, -.05, .09), (sx * -.2, -.8, .6), .1, .02) for sx in (-1, 1)]), 80, voxel=.0022)
    return fig, (0, 0, .5, 1.3)


def build_mulcher():
    fig = B.Figure('mulcher', lo=(-3.2, -.1, -3.4), hi=(3.2, 4.0, 4.6), coarse=.04)
    Y = -.42                                                     # the old figure's body hung this far below its own numbers
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, 1.85 + Y, 1.62), 'body')
    fig.group('arms', (0, 1.75 + Y, 2.12), 'head')
    G.add_legs(fig, [(1.0, 1.5, 1.6, .9), (-.1, 1.7, .1, .9), (-1.1, 1.6, -1.6, .9)], .2, 1.25, thorn=.7, detail=1.3)
    body = S.ellipsoid((0, 1.9 + Y, -.1), (1.3, .8, 1.8))
    body = S.union(body, S.ellipsoid((0, 2.05 + Y, .9), (1.05, .7, .9)), k=.3)                                       # humped over the shoulders
    body = S.bump(body, lambda p: .04 * np.sin(p[..., 2] * 9) * np.clip((p[..., 1] - 1.4) * 2, 0, 1))
    body = S.bump(body, lambda p: -.05 * np.clip(1 - np.abs(S.noise(p, 1.6, 2.2) - .5) * 5, 0, 1))                    # old scars
    fig.add('hide', 'body', 'gH', G.hide(body, 10.1, .05, 2.6, .012), 3000, voxel=.014, uv=('cyl', V(0, 1.45, 0), (0, 0, 1)))
    belly = ribbed(S.ellipsoid((0, 1.36 + Y, 0), (1.1, .5, 1.5)), 0, 12, .03)
    fig.add('belly', 'body', 'gV', belly, 700, voxel=.014, uv=('side',))
    fig.add('plates', 'body', 'gBc', G.back_plates((0, 2.72 + Y, 1.1), (0, 2.12 + Y, -1.8), 6, 1.9), 2200, voxel=.012, uv=('top',))
    cap, gill = G.mushroom((.1, 2.68 + Y, -.5), 1.15, .7, (-.18, 0, .08), 1.15, 5.0)
    cap = S.cut(cap, S.sphere((1.1, 2.5 + Y, .3), .3), k=.04)
    fig.add('cap', 'body', 'gC', cap, 2200, voxel=.011, uv=('top',))
    fig.add('gills', 'body', 'gGb', gill, 900, voxel=.011, uv=('top',))
    c2, g2 = G.mushroom((-.65, 2.45 + Y, -1.3), .48, .34, (-.3, 0, .5), 1.0, 6.0)
    c3, g3 = G.mushroom((.7, 2.35 + Y, -1.45), .36, .26, (-.2, 0, -.6), 1.0, 7.0)
    fig.add('capssmall', 'body', 'gC', S.union(c2, c3), 900, voxel=.008, uv=('top',))
    fig.add('gillssmall', 'body', 'gGb', S.union(g2, g3), 420, voxel=.008, uv=('top',))
    fig.add('sacs', 'body', 'gS', S.union(G.sacs((.2, 2.4 + Y, .7), 6, .22, 11), G.sacs((-.5, 2.2 + Y, -1.9), 4, .18, 5)), 760, voxel=.008)
    gl = []
    for sx in (-1, 1):
        for i in range(4):
            gl.append(G.crescent_fin(V(sx * 1.0, 1.95 + Y - i * .06, .6 - i * .5), .5, .02, rot(0, sx * 1.4, sx * .3) @ rot(0, 0, -sx * 1.2), n=6))
    fig.add('sidegills', 'body', 'gG', S.union(*gl), 1100, voxel=.008, uv=('side',))
    H0 = V(0, 1.85 + Y, 1.62)
    skull = S.ellipsoid(H0 + V(0, 0, .2), (.65, .5, .55))
    skull = S.union(skull, S.ellipsoid(H0 + V(0, -.12, .55), (.45, .32, .36)), k=.12)
    for sx in (-1, 1):
        skull = S.cut(skull, S.sphere(H0 + V(sx * .36, .22, .66), .12), S.sphere(H0 + V(sx * .52, .06, .6), .08), k=.03)
    fig.add('skull', 'head', 'gHn', G.hide(skull, 11.2, .03, 4, .01), 1500, voxel=.009, uv=('cyl', H0 + V(0, 0, .2), (0, 0, 1)))
    brow = S.cut(S.ellipsoid(H0 + V(0, .24, .1), (.72, .3, .62), rot(-.5, 0, 0)), S.ellipsoid(H0 + V(0, .14, .12), (.66, .3, .58), rot(-.5, 0, 0)))
    brow = S.union(brow, *[G.spine(H0 + V(x, .5 - abs(x) * .3, -.2), (x * .6, .7, -1), .4 - abs(x) * .3, .08) for x in (-.4, 0, .4)], k=.03)
    fig.add('brow', 'head', 'gBc', brow, 800, voxel=.008, uv=('top',))
    fig.add('eyes', 'head', 'gEye', S.union(eyes([H0 + V(sx * .34, .2, .64) for sx in (-1, 1)], .1, .5), eyes([H0 + V(sx * .5, .05, .58) for sx in (-1, 1)], .06, .7)), 280, voxel=.006, uv=('front',))
    lip, maw, teeth = G.jaw(H0 + V(0, -.34, .62), .7, .6, 7, 1, .9)
    fig.add('jaw', 'head', 'gHn', lip, 360, voxel=.007, uv=('top',))
    fig.add('maw', 'head', 'gMaw', maw, 120, voxel=.007, uv=('top',))
    fig.add('teeth', 'head', 'gBn', teeth, 320, voxel=.005)
    A = V(0, 1.75 + Y, 2.12)
    tusks, bands = [], []
    for sx in (-1, 1):                                                                                             # two raking tusks that sweep up and out
        pts = [A + V(sx * .4, 0, 0), A + V(sx * .8, -.3, .5), A + V(sx * .95, -.1, 1.2), A + V(sx * .7, .4, 1.8)]
        dense = S.bez(pts[0], pts[1], pts[2], 5)[:-1] + S.bez(pts[2], (pts[2] + pts[3]) / 2 + V(sx * .05, -.08, 0), pts[3], 4)
        tusks.append(S.chain(dense, list(np.linspace(.2, .02, len(dense)))))
        for t in (.25, .5):
            c = A + V(sx * (.5 + t * .5), -.24 + t * .1, .3 + t * .9)
            bands.append(S.torus(c, .19 - t * .1, .035, rot(PI / 2 - .4, 0, 0)))
    tk = S.bump(S.union(*tusks), lambda p: .012 * np.sin(p[..., 2] * 24))                                             # grown in rings
    fig.add('tusks', 'arms', 'gB', tk, 900, voxel=.008, uv=('side',))
    fig.add('tuskbands', 'arms', 'gD', S.union(*bands), 320, voxel=.007)
    return fig, (0, 0, 1.5, 4.2)


if __name__ == '__main__':
    fig, look_at = {'grazer': build_grazer, 'snapper': build_snapper, 'quillback': build_quillback, 'blister': build_blister, 'mulcher': build_mulcher}[KIND]()
    args = [a for a in sys.argv[1:] if a != KIND]
    png = args[0] if args and args[0].endswith('.png') else None
    only = [a for a in args if not a.endswith('.png')]
    if only:
        fig.parts = [p for p in fig.parts if any(p.name.startswith(o) or p.group == o for o in only)]
    here = __file__.rsplit('/', 1)[0]
    fig.build(here + '/../assets/mesh/%s.bin' % KIND if not only else '/tmp/%s-part.bin' % KIND, here + '/out/%s.blend' % KIND if not only else None)
    if png:
        from kit import look
        import os
        c = [float(x) for x in os.environ.get('LOOK', '%g,%g,%g,%g' % look_at).split(',')]
        look.render(png, centre=(c[0], -c[1], c[2]), height=c[3], px=int(os.environ.get('PX', 640)))
