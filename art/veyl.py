"""The Veyl: shell-priests who float, sing ore loose and wear their dead as masks. Four bodies off one kit.

Tender (the worker), Cantor (glaive), Lancer (crystal lance) and Warden (the giant). Each is a plated tail that sweeps
back to a point where legs would be, a turned chest shell with a lit orb, a bone mask, a halo standing behind the head.
Run:  python veyl.py tender|cantor|lancer|warden [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, veyl as Vk
from kit.sdf import V, rot

KIND = next((a for a in sys.argv[1:] if a in ('tender', 'cantor', 'lancer', 'warden')), 'cantor')
PI = np.pi
FWD = rot(PI / 2, 0, 0)                                         # turns a flat ring to face forward


def tabard(c, w, h, t=.012, point=.25, tilt=.05):
    """A gold plate hanging down the front, cut to a point at the bottom."""
    c = V(c)
    R = rot(tilt, 0, 0)
    f = S.box(c + V(0, -h / 2, 0), (w, h / 2, t), .008, R)
    for sx in (-1, 1):
        f = S.cut(f, S.plane(c + V(0, -h, 0), (sx * h * point, w, 0)))
    for i in range(1, 4):                                       # scored across like the plates of a tail
        f = S.groove(f, [c + R @ V(-w, -h * i / 4.2, t), c + R @ V(w, -h * i / 4.2, t)], .004, .005)
    return f


def cords(y0, half, z_mid, z_side, r, n=2, gap=.09):
    """Gold cords slung across the chest."""
    return S.union(*[S.chain(S.bez((-half, y0 + i * gap + .03, z_side), (0, y0 + i * gap - .05, z_mid * 1.12), (half, y0 + i * gap + .03, z_side), 8), r) for i in range(n)])


def horn(base, mid, tip, r0, r1):
    return S.chain(S.bez(base, mid, tip, 8), list(np.linspace(r0, r1, 9)))


def filigree(f, c, r, turns=1.6, w=.004, depth=.005, zs=1.0, n=40, y_rise=.0):
    """A spiral scored into a shell, the Veyl's maker's mark."""
    c = V(c)
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = t * turns * 2 * PI
        d = V(np.sin(a), 0, np.cos(a) * zs)
        pts.append(S.skin(f, c + V(0, y_rise * t, 0), d + V(0, .0, 0), tmax=r * 3, n=300))
    return S.groove(f, pts, w, depth)


def build_tender():
    fig = B.Figure('tender', hi=(1.2, 2.8, 1.2), detail=1.0)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, 1.46, 0), 'body'), ('halo', (0, 1.95, -.26), 'body'), ('armL', (-.27, 1.26, 0), 'body'), ('armR', (.27, 1.26, 0), 'body')):
        fig.group(g, p, par)
    sw = Vk.tail_sweep(.84, .3)
    tail = Vk.lathe([(0, 0), (.045, .1), (.115, .35), (.185, .64), (.2, .77), (.16, .84)], sweep=sw, plates=(5, .016))
    fig.add('tail', 'body', 'vD', Vk.pits(tail, 1.5), 1300, voxel=.003, uv=('cyl', V(0, .5, -.05)))
    bands = S.union(Vk.ring((0, .36, sw(.36)), .125, .018, (.2, 0, 0)), Vk.ring((0, .58, sw(.58)), .172, .018, (.14, 0, 0)))
    fig.add('tailbands', 'body', 'vG', bands, 300, voxel=.003, uv=('cyl', V(0, .45, -.05)))
    chest = Vk.lathe([(.15, .76), (.2, .88), (.27, 1.1), (.25, 1.28), (.15, 1.42), (.08, 1.47)], zs=.8)
    chest = S.bump(chest, lambda p: .005 * np.sin(p[..., 1] * 60) * np.clip((1.0 - p[..., 1]) * 8, 0, 1))
    chest = filigree(chest, (0, 1.2, 0), .3, 1.3, zs=.8, y_rise=.12)
    fig.add('chest', 'body', 'vL', Vk.pits(chest, 2.5), 1300, voxel=.003, uv=('cyl', V(0, 1.1, 0)))
    fig.add('tabard', 'body', 'vG', tabard((0, 1.3, .214), .07, .5), 180, voxel=.003, uv=('front',), sharp=35)
    fig.add('cords', 'body', 'vG', cords(1.0, .22, .22, .1, .015), 200, voxel=.003, uv=('front',))
    sh = S.mirror(S.union(S.ellipsoid((.24, 1.33, 0), (.115, .095, .115)), Vk.ring((.24, 1.3, 0), .105, .014, (0, 0, -.5)), k=.01))
    fig.add('shoulders', 'body', 'vI', Vk.pits(sh, 3.5), 520, voxel=.003, uv=('top',))
    fig.add('shouldershards', 'body', 'vC', S.mirror(Vk.crystal((.3, 1.38, -.03), (.48, 1.56, -.06), .05, 4)), 120, voxel=.003, uv=('side',), sharp=25)
    H0 = V(0, 1.46, 0)
    head = Vk.lathe([(.06, 0), (.12, .06), (.17, .2), (.155, .33), (.07, .41), (.0, .425)], c=H0 + V(0, 0, .01), zs=.94)
    head = S.cut(head, S.sphere(H0 + V(0, .23, .19), .095), k=.02)                                                # the socket the eye sits in
    head = S.groove(head, [H0 + V(-.02, .41, .02), H0 + V(.03, .33, .12), H0 + V(.0, .32, .14)], .004, .005)      # an old crack
    fig.add('head', 'head', 'vI', Vk.pits(head, 4.5), 900, voxel=.0028, uv=('cyl', H0 + V(0, .2, 0)))
    fig.add('eyering', 'head', 'vG', S.torus(H0 + V(0, .23, .145), .09, .02, FWD), 220, voxel=.0025, uv=('front',))
    fig.add('eye', 'head', 'vM', S.ellipsoid(H0 + V(0, .23, .125), (.08, .08, .045)), 120, voxel=.003, uv=('front',))
    st = S.mirror(horn(H0 + V(.08, .34, -.02), H0 + V(.2, .5, -.06), H0 + V(.15, .68, -.17), .03, .008))
    fig.add('stalks', 'head', 'vD', st, 260, voxel=.0028, uv=('side',))
    fig.add('stalktips', 'head', 'teal', S.mirror(Vk.crystal(H0 + V(.155, .64, -.15), H0 + V(.14, .82, -.2), .035, 4, .4)), 80, voxel=.0028, sharp=25)
    fig.add('feelers', 'head', 'vG', S.mirror(S.chain([H0 + V(.04, .06, .12), H0 + V(.052, -.04, .15), H0 + V(.056, -.14, .13)], [.012, .009, .004])), 100, voxel=.0022)
    ringf, pts = Vk.halo((0, 1.95, -.26), .34, .04, 2, .18, .04)
    fig.add('halo', 'halo', 'teal', ringf, 360, voxel=.004, uv=('front',))
    fig.add('halopoints', 'halo', 'mag', pts, 80, voxel=.004, sharp=25)
    for sx, g in ((-1, 'armL'), (1, 'armR')):
        Sh, El, Wr = V(sx * .27, 1.26, 0), V(sx * .37, 1.06, .06), V(sx * .35 + (.02 if sx > 0 else 0), .87, .23)
        fig.add('arm' + g[-1], g, 'vD', Vk.arm(Sh, El, Wr, .05, .038, .03), 320, voxel=.003, uv=('cyl', El))
        fig.add('bangle' + g[-1], g, 'vG', S.torus(El + (Wr - El) * .55, .042, .012, S.basis((0, 0, 1), Wr - El)), 90, voxel=.0025)
    Rl = S.basis((0, -.3, .9), (0, .9, .3))
    fig.add('clawL', 'armL', 'vL', Vk.claw(V(-.35, .85, .25), Rl, .07, curl=.6, thumb=1), 420, voxel=.0025, uv=('front',))
    hx = V(.37, .845, .25)
    fig.add('fistR', 'armR', 'vL', S.union(S.ellipsoid(hx, (.055, .05, .06)), *[S.rcone(hx + V(i * .028, .03, .03), hx + V(i * .03, -.04, .05), .017, .014) for i in (-1, 0, 1)], k=.012), 240, voxel=.0025, uv=('front',))
    # the tuning fork he hums ore loose with
    fig.add('forkstem', 'armR', 'vG', S.union(S.rcone(hx + V(0, -.01, -.06), hx + V(0, -.01, .24), .02, .018), S.sphere(hx + V(0, -.01, -.07), .028)), 100, voxel=.0025, uv=('side',))
    fig.add('forkring', 'armR', 'mag', S.torus(hx + V(0, -.01, .24), .04, .014, FWD), 80, voxel=.0025)
    tines = S.union(*[S.chain([hx + V(0, -.01, .24), hx + V(sx * .06, -.01, .32), hx + V(sx * .06, -.01, .6)], [.016, .018, .008]) for sx in (-1, 1)])
    fig.add('forktines', 'armR', 'vC', tines, 160, voxel=.0025, uv=('side',))
    return fig, (0, 0, 1.0, 2.4)


def build_cantor():
    fig = B.Figure('cantor', lo=(-1.4, -.1, -1.2), hi=(1.4, 3.3, 1.2), detail=1.0)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, 1.96, 0), 'body'), ('halo', (0, 2.44, -.32), 'body'), ('armL', (-.37, 1.76, 0), 'body'), ('armR', (.37, 1.76, 0), 'body')):
        fig.group(g, p, par)
    sw = Vk.tail_sweep(1.14, .38)
    tail = Vk.lathe([(0, 0), (.06, .14), (.157, .48), (.248, .87), (.27, 1.05), (.216, 1.14)], sweep=sw, plates=(6, .02))
    fig.add('tail', 'body', 'vD', Vk.pits(tail, 1.1), 1700, voxel=.0035, uv=('cyl', V(0, .6, -.08)))
    bands = S.union(*[Vk.ring((0, y, sw(y)), r, .022, (.16, 0, 0)) for y, r in ((.5, .185), (.74, .24), (.96, .275))])
    fig.add('tailbands', 'body', 'vG', bands, 460, voxel=.0035, uv=('cyl', V(0, .7, -.05)))
    fig.add('tabard', 'body', 'vG', tabard((0, 1.12, .268), .1, .88, .014), 260, voxel=.0035, uv=('front',), sharp=35)
    tass = []
    for sx in (-1, 1):                                                                                           # side plates hanging off the hips
        R = rot(.05, sx * .9, sx * .12)
        t = S.box(V(sx * .22, .78, .1), (.085, .34, .011), .008, R)
        t = S.cut(t, S.plane(V(sx * .22, .44, .1), R @ V(.12, .08, 0)), S.plane(V(sx * .22, .44, .1), R @ V(-.12, .08, 0)))
        tass.append(t)
    fig.add('tassets', 'body', 'vDp', S.union(*tass), 240, voxel=.0035, uv=('front',), sharp=35)
    chest = Vk.lathe([(.2, 1.04), (.235, 1.18), (.33, 1.5), (.3, 1.72), (.17, 1.86), (.09, 1.93)], zs=.74)
    chest = S.bump(chest, lambda p: .006 * np.sin(p[..., 1] * 52) * np.clip((1.32 - p[..., 1]) * 6, 0, 1))        # ribbed below the orb
    chest = S.cut(chest, S.sphere((0, 1.56, .28), .1), k=.02)
    chest = filigree(chest, (0, 1.72, 0), .34, 1.2, zs=.74, y_rise=.1)
    fig.add('chest', 'body', 'vI', Vk.pits(chest, 2.1), 1800, voxel=.0035, uv=('cyl', V(0, 1.45, 0)))
    fig.add('orbring', 'body', 'vG', S.torus((0, 1.56, .228), .112, .026, rot(PI / 2 - .1, 0, 0)), 260, voxel=.003, uv=('front',))
    fig.add('orb', 'body', 'vM', S.ellipsoid((0, 1.56, .205), (.098, .098, .055)), 140, voxel=.003, uv=('front',))
    fig.add('cords', 'body', 'vG', cords(1.3, .24, .25, .1, .02, 2, .1), 240, voxel=.003, uv=('front',))
    paul, shards = [], []
    for sx in (-1, 1):                                                                                           # crescent pauldrons sweeping up and out
        c = V(sx * .36, 1.52, -.04)
        cr = S.cut(S.ellipsoid(c + V(sx * .12, .06, 0), (.34, .2, .15), rot(0, 0, sx * .5)), S.ellipsoid(c + V(sx * .02, -.1, 0), (.32, .2, .3), rot(0, 0, sx * .5)), k=.02)
        cr = S.union(cr, S.ellipsoid(c + V(-sx * .02, .12, 0), (.13, .1, .13)), k=.04)
        paul.append(cr)
        shards += [Vk.crystal(V(sx * .62, 1.74, -.04), V(sx * .98, 2.0, -.06), .075, 5), Vk.crystal(V(sx * .46, 1.86, -.06), V(sx * .58, 2.22, -.1), .055, 5)]
    fig.add('pauldrons', 'body', 'vIp', Vk.pits(S.union(*paul), 3.1), 900, voxel=.0035, uv=('top',))
    fig.add('pauldronshards', 'body', 'vC', S.union(*shards), 280, voxel=.0035, uv=('side',), sharp=25)
    fig.add('neckrings', 'body', 'vG', S.union(Vk.ring((0, 1.9, 0), .1, .024), Vk.ring((0, 1.96, 0), .082, .022)), 200, voxel=.003)
    H0 = V(0, 1.96, 0)
    mask = Vk.lathe([(.035, 0), (.075, .1), (.15, .3), (.172, .42), (.13, .56), (.0, .6)], c=H0 + V(0, .02, .02), zs=1.0, sweep=lambda y: (.32 - y) * .28)   # a long bone face, chin thrust forward
    mask = S.both(mask, S.plane(H0 + V(0, 0, -.02), (0, 0, -1)), k=.02)                                           # a mask, not a head: only the front
    mask = S.union(mask, S.ellipsoid(H0 + V(0, .43, .15), (.15, .035, .05)), k=.03)                              # brow ridge
    mask = S.union(mask, S.rcone(H0 + V(0, .4, .17), H0 + V(0, .18, .17), .022, .012), k=.025)                   # the ridge of the nose
    for sx in (-1, 1):
        mask = S.cut(mask, S.ellipsoid(H0 + V(sx * .078, .37, .18), (.062, .022, .05), rot(0, sx * .3, sx * .45)), k=.008)
    mask = S.groove(mask, [H0 + V(.05, .56, .1), H0 + V(.02, .47, .17), H0 + V(.05, .42, .17)], .004, .006)
    mask = S.groove(mask, [H0 + V(-.02, .14, .1), H0 + V(-.035, .22, .13), H0 + V(-.02, .27, .15)], .003, .005)
    fig.add('mask', 'head', 'vL', Vk.pits(mask, 4.1, .003), 1300, voxel=.0028, uv=('front',))
    skull = S.ellipsoid(H0 + V(0, .36, -.06), (.15, .2, .16))
    fig.add('skull', 'head', 'vD', Vk.pits(skull, 4.6), 360, voxel=.0035, uv=('cyl', H0 + V(0, .3, 0)))
    eyes = S.union(*[S.ellipsoid(H0 + V(sx * .078, .37, .15), (.055, .018, .03), rot(0, sx * .3, sx * .45)) for sx in (-1, 1)])
    fig.add('eyes', 'head', 'teal', eyes, 100, voxel=.0025, uv=('front',))
    horns = S.union(*[horn(H0 + V(sx * .12, .46, .0), H0 + V(sx * .3, .62, -.1), H0 + V(sx * .21, .9, -.27), .05, .008) for sx in (-1, 1)])
    horns = S.bump(horns, lambda p: .004 * np.sin((p[..., 1] + p[..., 2] * .6) * 110))                           # ringed like a ram's
    fig.add('horns', 'head', 'vD', horns, 520, voxel=.003, uv=('side',))
    crest = S.box(H0 + V(0, .78, -.1), (.012, .32, .1), .008, rot(-.22, 0, 0))
    crest = S.cut(crest, S.plane(H0 + V(0, 1.1, -.2), (0, -.22, -.6)))                                            # a fin, tallest at the back
    fig.add('crest', 'head', 'vG', crest, 160, voxel=.003, uv=('side',), sharp=35)
    fl = S.union(*[S.chain([H0 + V(x, .1, .13), H0 + V(x * 1.4, -.05, .17), H0 + V(x * 1.6, -.2 - abs(x), .15)], [.016, .012, .004]) for x in (-.05, 0, .05)])
    fig.add('feelers', 'head', 'vG', fl, 150, voxel=.0022)
    ringf, pts = Vk.halo((0, 2.44, -.32), .62, .055, 3, .26, .06, PI / 2)
    fig.add('halo', 'halo', 'mag', ringf, 520, voxel=.005, uv=('front',))
    fig.add('halopoints', 'halo', 'teal', pts, 120, voxel=.005, sharp=25)
    ShL, ElL, WrL = V(-.37, 1.76, 0), V(-.52, 1.46, .08), V(-.5, 1.16, .32)
    fig.add('armL', 'armL', 'vD', Vk.arm(ShL, ElL, WrL, .07, .05, .04), 420, voxel=.003, uv=('cyl', ElL))
    fig.add('bangleL', 'armL', 'vG', S.torus(ElL + (WrL - ElL) * .4, .056, .018, S.basis((0, 0, 1), WrL - ElL)), 110, voxel=.003)
    fig.add('clawL', 'armL', 'vL', Vk.claw(V(-.5, 1.12, .35), S.basis((0, -.3, .9), (0, .9, .3)), .1, curl=.6, thumb=1), 520, voxel=.003, uv=('front',))
    ShR, ElR, WrR = V(.37, 1.76, 0), V(.52, 1.46, .08), V(.52, 1.18, .34)
    fig.add('armR', 'armR', 'vD', Vk.arm(ShR, ElR, WrR, .07, .05, .04), 420, voxel=.003, uv=('cyl', ElR))
    fig.add('bangleR', 'armR', 'vG', S.torus(ElR + (WrR - ElR) * .4, .056, .018, S.basis((0, 0, 1), WrR - ElR)), 110, voxel=.003)
    gx, gz = .53, .38
    hand = S.union(S.ellipsoid((gx, 1.14, gz - .01), (.075, .065, .08)), *[S.torus((gx, 1.11 + i * .034, gz), .04, .017, rot(0, 0, .0)) for i in (0, 1, 2)], k=.012)   # fingers wrapped round the shaft
    fig.add('handR', 'armR', 'vL', hand, 380, voxel=.0028, uv=('front',))
    # the glaive: a staff taller than he is, a tuning fork of cut crystal at the top, a spike at the foot
    shaft = S.cyl((gx, .3, gz), (gx, 2.5, gz), .03, .004)
    shaft = S.bump(shaft, lambda p: .006 * np.exp(-((np.mod(p[..., 1], .36) - .18) / .02) ** 2))                  # jointed like cane
    fig.add('shaft', 'armR', 'vG', shaft, 300, voxel=.003, uv=('cyl', V(gx, 1.4, gz)), sharp=50)
    fig.add('buttspike', 'armR', 'vC', Vk.crystal((gx, .36, gz), (gx, .0, gz), .07, 4, .3), 60, voxel=.003, sharp=25)
    fork = S.union(S.chain([V(gx, 2.5, gz), V(gx - .17, 2.74, gz), V(gx - .15, 3.26, gz)], [.05, .05, .012]), S.chain([V(gx, 2.5, gz), V(gx + .17, 2.74, gz), V(gx + .15, 3.26, gz)], [.05, .05, .012]), k=.02)
    fork = S.both(fork, S.slab((gx, 2.8, gz), (0, 0, 1), .022), k=.006)                                           # ground flat like a blade
    fig.add('fork', 'armR', 'vC', fork, 360, voxel=.003, uv=('front',), sharp=28)
    fig.add('forkring', 'armR', 'mag', S.torus((gx, 2.46, gz), .06, .02), 110, voxel=.003)
    return fig, (0, 0, 1.6, 3.6)


def build_lancer():
    fig = B.Figure('lancer', lo=(-1.2, -.1, -1.4), hi=(1.2, 3.0, 2.6), detail=1.0)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, 1.74, 0), 'body'), ('halo', (0, 2.2, -.36), 'body'), ('arms', (0, 1.52, .05), 'body')):
        fig.group(g, p, par)
    sw = Vk.tail_sweep(1.0, .5)
    tail = Vk.lathe([(0, 0), (.048, .12), (.128, .42), (.202, .76), (.22, .92), (.176, 1.0)], sweep=sw, plates=(6, .017))
    fig.add('tail', 'body', 'vD', Vk.pits(tail, 1.7), 1500, voxel=.0033, uv=('cyl', V(0, .5, -.1)))
    bands = S.union(*[Vk.ring((0, y, sw(y)), r, .02, (.24, 0, 0)) for y, r in ((.42, .14), (.66, .192))])
    fig.add('tailbands', 'body', 'vG', bands, 320, voxel=.0033, uv=('cyl', V(0, .55, -.1)))
    chest = Vk.lathe([(.16, .92), (.2, 1.06), (.27, 1.34), (.24, 1.56), (.13, 1.7), (.08, 1.75)], c=(0, 0, .02), zs=.74)
    chest = S.bump(chest, lambda p: .005 * np.sin(p[..., 1] * 56) * np.clip((1.24 - p[..., 1]) * 6, 0, 1))
    chest = filigree(chest, (0, 1.52, .02), .3, 1.4, zs=.74, y_rise=.1)
    fig.add('chest', 'body', 'vL', Vk.pits(chest, 2.7), 1500, voxel=.0033, uv=('cyl', V(0, 1.3, 0)))
    fig.add('tabard', 'body', 'vG', tabard((0, 1.5, .214), .07, .7), 220, voxel=.003, uv=('front',), sharp=35)
    quills = S.union(*[Vk.crystal((0, 1.62 - i * .22, -.17 - i * .02), V(0, 1.62 - i * .22, -.17 - i * .02) + V(0, np.cos(1.0 + i * .12), -np.sin(1.0 + i * .12)) * (.5 - i * .07), .07 - i * .008, 5, .2) for i in range(4)])
    fig.add('quills', 'body', 'vC', quills, 260, voxel=.003, uv=('side',), sharp=25)
    cowl, sh = [], []
    for sx in (-1, 1):
        c = V(sx * .22, 1.42, -.06)
        cr = S.cut(S.ellipsoid(c + V(sx * .08, .06, 0), (.25, .2, .14), rot(-.25, 0, sx * .45)), S.ellipsoid(c + V(sx * .0, -.08, .02), (.24, .2, .3), rot(-.25, 0, sx * .45)), k=.02)
        cowl.append(cr)
        sh.append(S.ellipsoid((sx * .27, 1.6, 0), (.11, .09, .11)))
    fig.add('cowl', 'body', 'vIp', Vk.pits(S.union(*cowl), 3.7), 560, voxel=.0033, uv=('top',))
    fig.add('shoulders', 'body', 'vI', Vk.pits(S.union(*sh), 3.9), 360, voxel=.0033, uv=('top',))
    H0 = V(0, 1.74, 0)
    hood = Vk.lathe([(.1, 0), (.2, .1), (.25, .32), (.2, .56), (.08, .74), (.0, .79)], c=H0 + V(0, 0, .02), zs=1.1)
    hood = S.cut(hood, Vk.lathe([(.07, -.05), (.17, .1), (.215, .32), (.17, .54), (.05, .7)], c=H0 + V(0, 0, .02), zs=1.1))
    hood = S.cut(hood, S.both(S.plane(H0 + V(0, 0, .02), (0, .25, -1)), S.ecyl(H0 + V(0, .3, .2), .19, .4, .32, .05)), k=.02)   # open at the face
    hood = S.bump(hood, lambda p: .006 * np.sin(np.arctan2(p[..., 0], p[..., 2] - .02) * 9) * np.clip((p[..., 1] - 1.8) * 4, 0, 1))
    fig.add('hood', 'head', 'vI', Vk.pits(hood, 4.3), 1100, voxel=.003, uv=('cyl', H0 + V(0, .3, 0)))
    face = S.ellipsoid(H0 + V(0, .32, -.0), (.17, .24, .15))
    fig.add('face', 'head', 'vD', Vk.pits(face, 4.7), 420, voxel=.0033, uv=('front',))
    fig.add('eyering', 'head', 'vG', S.torus(H0 + V(0, .33, .15), .12, .026, FWD), 260, voxel=.0028, uv=('front',))
    fig.add('eye', 'head', 'vM', S.ellipsoid(H0 + V(0, .33, .125), (.11, .11, .055)), 140, voxel=.003, uv=('front',))
    fig.add('crestshard', 'head', 'vC', Vk.crystal(H0 + V(0, .66, -.08), H0 + V(0, 1.22, -.3), .07, 5, .15), 70, voxel=.003, sharp=25)
    fig.add('feelers', 'head', 'vG', S.mirror(S.chain([H0 + V(.1, .08, .12), H0 + V(.13, -.1, .16), H0 + V(.11, -.28, .12)], [.02, .014, .004])), 120, voxel=.0022)
    ringf, pts = Vk.halo((0, 2.2, -.36), .45, .045, 2, .24, .055)
    fig.add('halo', 'halo', 'teal', ringf, 420, voxel=.0045, uv=('front',))
    fig.add('halopoints', 'halo', 'mag', pts, 80, voxel=.0045, sharp=25)
    A = V(0, 1.52, .05)
    a1 = Vk.arm(A + V(.3, .08, -.05), A + V(.37, -.14, .1), A + V(.28, -.22, .3), .055, .04, .034)
    a2 = Vk.arm(A + V(-.3, .08, -.05), A + V(-.31, -.14, .3), A + V(-.1, -.16, .68), .055, .04, .034)
    fig.add('armsboth', 'arms', 'vD', S.union(a1, a2), 700, voxel=.003, uv=('side',))
    c1 = Vk.claw(A + V(.28, -.22, .32), S.basis((-.5, -.5, .7), (.3, .8, .5)), .07, curl=.8, thumb=-1)
    c2 = Vk.claw(A + V(-.1, -.16, .7), S.basis((.6, -.4, .7), (-.3, .8, .5)), .07, curl=.8, thumb=1)
    fig.add('claws', 'arms', 'vL', S.union(c1, c2), 760, voxel=.0028, uv=('side',))
    p0, p1 = A + V(.36, -.24, -.6), A + V(.02, -.16, 1.5)
    shaft = S.rcone(p0, p1, .028, .036)
    fig.add('lanceshaft', 'arms', 'vG', shaft, 220, voxel=.003, uv=('side',), sharp=50)
    d = (p1 - p0) / np.linalg.norm(p1 - p0)
    fig.add('lancetip', 'arms', 'vC', Vk.crystal(p1 - d * .1, p1 + d * .84, .1, 6, .16), 90, voxel=.003, sharp=22)
    fig.add('lancering', 'arms', 'mag', S.torus(p1 - d * .06, .11, .02, S.basis((0, 1, 0), d)), 130, voxel=.003)
    R = S.basis(d, (0, 1, 0))
    barbs = S.union(*[Vk.crystal(p1 - d * .14 + R @ V(np.cos(a) * .1, np.sin(a) * .1, 0), p1 + d * .2 + R @ V(np.cos(a) * .15, np.sin(a) * .15, 0), .04, 4, .2) for a in (0, 2.1, 4.2)])
    fig.add('lancebarbs', 'arms', 'vC', barbs, 110, voxel=.003, sharp=25)
    fig.add('lancebutt', 'arms', 'vC', Vk.crystal(p0 + d * .04, p0 - d * .3, .05, 4, .2), 50, voxel=.003, sharp=25)
    fig.point('muzzle', A + V(-.1, -.13, 2.2), 'arms')
    return fig, (0, 0, 1.4, 3.2)


def build_warden():
    fig = B.Figure('warden', lo=(-2.9, -.1, -2.2), hi=(2.9, 6.1, 2.2), coarse=.04, detail=1.0)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, 3.7, .25), 'body'), ('halo', (0, 4.4, -.75), 'body'), ('armL', (-1.6, 3.3, 0), 'body'), ('armR', (1.6, 3.3, 0), 'body')):
        fig.group(g, p, par)
    sw = Vk.tail_sweep(2.0, .7)
    tail = Vk.lathe([(0, 0), (.21, .24), (.55, .84), (.875, 1.52), (.95, 1.84), (.76, 2.0)], sweep=sw, plates=(7, .06))
    tail = S.bump(tail, lambda p: -.02 * np.clip(1 - np.abs(S.noise(p, 2.4, 6.6) - .5) * 5, 0, 1))
    fig.add('tail', 'body', 'vD', Vk.pits(tail, 1.3, .008, 9), 2600, voxel=.011, uv=('cyl', V(0, 1.0, -.2)))
    bands = S.union(*[Vk.ring((0, y, sw(y)), r, .06, (.14, 0, 0)) for y, r in ((.7, .5), (1.2, .77), (1.7, .95))])
    fig.add('tailbands', 'body', 'vG', bands, 700, voxel=.01, uv=('cyl', V(0, 1.2, -.1)))

    def chestf(p):                                               # a barrel that widens to the shoulders and flattens on top
        q = p - V(0, 2.75, 0)
        k = np.clip(q[..., 1] / 2.3 + .5, 0, 1.2)
        y = np.where(q[..., 1] > .69, .69 + (q[..., 1] - .69) / .6, q[..., 1])
        r = np.sqrt((q[..., 0] / (1.45 * (.62 + k * .62))) ** 2 + (y / 1.15) ** 2 + (q[..., 2] / (1.05 * (.8 + k * .3))) ** 2)
        return (r - 1) * .8
    chest = S.bump(chestf, lambda p: .02 * np.sin(p[..., 1] * 16) * np.clip((2.4 - p[..., 1]) * 2, 0, 1))
    chest = S.cut(chest, S.sphere((0, 2.8, 1.12), .42), k=.06)
    chest = S.bump(chest, lambda p: -.03 * np.clip(1 - np.abs(S.noise(p, 1.8, 8.8) - .5) * 5, 0, 1))
    chest = S.groove(chest, [S.skin(chest, (x, y, 0), (0, 0, 1), tmax=2, out=-.004) for x, y in ((-.9, 3.3), (-.55, 3.05), (-.6, 2.7), (-.35, 2.45))], .014, .02)   # a crack that was never mended
    fig.add('chest', 'body', 'vI', Vk.pits(chest, 2.3, .008, 9), 3000, voxel=.012, uv=('cyl', V(0, 2.75, 0)))
    fig.add('tabard', 'body', 'vG', tabard((0, 2.0, .82), .2, 1.15, .035, tilt=.1), 320, voxel=.009, uv=('front',), sharp=35)
    fig.add('orbring', 'body', 'vG', S.torus((0, 2.8, .93), .5, .09, rot(PI / 2 - .08, 0, 0)), 520, voxel=.009, uv=('front',))
    fig.add('orb', 'body', 'vM', S.ellipsoid((0, 2.8, .88), (.43, .43, .2)), 260, voxel=.01, uv=('front',))
    rs = S.union(*[Vk.crystal(V(np.cos(a) * .52, 2.8 + np.sin(a) * .52, .93), V(np.cos(a) * .86, 2.8 + np.sin(a) * .86, .9), .08, 4, .3) for a in (.6, 1.57, 2.54, 3.74, 4.71, 5.68)])
    fig.add('orbshards', 'body', 'vC', rs, 200, voxel=.008, sharp=25)
    fig.add('cords', 'body', 'vG', S.union(*[S.chain(S.bez((-.82, y + .16, .52), (0, y - .2, 1.2), (.82, y + .16, .52), 8), .05) for y in (2.1, 2.3)]), 360, voxel=.009, uv=('front',))
    sh, cres, cry = [], [], []
    for sx in (-1, 1):
        s0 = S.ellipsoid((sx * 1.45, 3.45, 0), (.78, .62, .76), rot(0, 0, sx * .25))
        s0 = S.union(s0, Vk.ring((sx * 1.5, 3.2, 0), .7, .07, (0, 0, -sx * .3), squash=1.0), k=.05)
        sh.append(s0)
        c = V(sx * 1.3, 3.3, -.3)
        cres.append(S.cut(S.ellipsoid(c + V(sx * .3, .2, 0), (.85, .5, .34), rot(0, 0, sx * .45)), S.ellipsoid(c + V(sx * .05, -.2, .05), (.8, .5, .7), rot(0, 0, sx * .45)), k=.04))
        cry += [Vk.crystal(V(sx * 1.6, 3.6, -.1), V(sx * 2.15, 4.8, -.1), .26, 5, .22), Vk.crystal(V(sx * 1.2, 3.7, -.4), V(sx * 1.4, 4.6, -.68), .18, 5, .22), Vk.crystal(V(sx * 1.8, 3.5, .15), V(sx * 2.32, 3.98, .36), .14, 5, .22)]
    shf = S.bump(S.union(*sh), lambda p: -.03 * np.clip(1 - np.abs(S.noise(p, 2.2, 3.3) - .5) * 5, 0, 1))
    fig.add('shoulders', 'body', 'vL', Vk.pits(shf, 3.3, .008, 9), 2000, voxel=.011, uv=('top',))
    fig.add('crescents', 'body', 'vIp', Vk.pits(S.union(*cres), 3.6, .008, 9), 900, voxel=.011, uv=('top',))
    fig.add('shouldershards', 'body', 'vC', S.union(*cry), 420, voxel=.009, uv=('side',), sharp=25)
    H0 = V(0, 3.7, .25)
    head = Vk.lathe([(.1, -.2), (.22, 0), (.4, .3), (.38, .52), (.2, .68), (0, .71)], c=H0, zs=1.0)
    fig.add('head', 'head', 'vD', Vk.pits(head, 4.4, .006, 12), 700, voxel=.007, uv=('cyl', H0 + V(0, .25, 0)))
    fp = S.both(S.grow(head, .035), S.plane(H0 + V(0, 0, .16), (0, 0, -1)), k=.02)
    fp = S.both(fp, S.box(H0 + V(0, .22, .3), (.3, .36, .3), .1), k=.03)
    fp = S.cut(fp, S.plane(H0 + V(0, -.12, .3), (.9, 1, 0)), S.plane(H0 + V(0, -.12, .3), (-.9, 1, 0)))           # pointed at the chin
    for sx in (-1, 1):
        fp = S.cut(fp, S.ellipsoid(H0 + V(sx * .15, .34, .4), (.11, .04, .1), rot(0, 0, sx * .4)), k=.01)
    fp = S.groove(fp, [H0 + V(0, .5, .38), H0 + V(0, .1, .42)], .008, .012)
    fig.add('faceplate', 'head', 'vG', fp, 700, voxel=.006, uv=('front',))
    fig.add('eyes', 'head', 'teal', S.union(*[S.ellipsoid(H0 + V(sx * .15, .34, .34), (.1, .035, .06), rot(0, 0, sx * .4)) for sx in (-1, 1)]), 120, voxel=.006, uv=('front',))
    hn = S.union(*[horn(H0 + V(sx * .3, .5, 0), H0 + V(sx * .62, .8, -.1), H0 + V(sx * .46, 1.24, -.34), .1, .014) for sx in (-1, 1)])
    hn = S.bump(hn, lambda p: .008 * np.sin((p[..., 1] + p[..., 2] * .6) * 60))
    fig.add('horns', 'head', 'vL', hn, 620, voxel=.006, uv=('side',))
    fig.add('crestshard', 'head', 'vC', Vk.crystal(H0 + V(0, .56, -.05), H0 + V(0, 1.4, -.05), .1, 5, .15), 70, voxel=.006, sharp=25)
    c = V(0, 4.4, -.75)
    r1, pts = Vk.halo(c, 1.3, .1, 5, .46, .1, PI / 2)
    r2 = S.torus(c, .95, .07, FWD, squash=.55)
    fig.add('halo', 'halo', 'mag', r1, 700, voxel=.011, uv=('front',))
    fig.add('haloinner', 'halo', 'teal', r2, 460, voxel=.011, uv=('front',))
    fig.add('halopoints', 'halo', 'teal', pts, 200, voxel=.009, sharp=25)
    for sx, g in ((-1, 'armL'), (1, 'armR')):
        P = V(sx * 1.6, 3.3, 0)
        El, Wr = P + V(sx * .3, -1.0, .3), P + V(sx * .2, -1.9, .8)
        up = S.union(S.rcone(P, El, .3, .24), S.sphere(P, .33), k=.06)
        fig.add('upper' + g[-1], g, 'vD', Vk.pits(up, 5.1 + sx, .008, 9), 520, voxel=.01, uv=('cyl', (P + El) / 2))
        fig.add('elbow' + g[-1], g, 'vL', Vk.pits(S.sphere(El + V(0, -.04, 0), .33), 5.4 + sx, .008, 9), 300, voxel=.01, uv=('top',))
        fore = S.rcone(El, Wr, .2, .32)
        fore = S.bump(fore, lambda p: -.02 * np.clip(1 - np.abs(S.noise(p, 2.6, 7.1) - .5) * 5, 0, 1))
        fig.add('fore' + g[-1], g, 'vI', Vk.pits(fore, 5.7 + sx, .008, 9), 620, voxel=.01, uv=('cyl', (El + Wr) / 2))
        d = (Wr - El) / np.linalg.norm(Wr - El)
        Rb = S.basis((1, 0, 0), d)
        fig.add('bangles' + g[-1], g, 'vG', S.union(*[S.torus(El + (Wr - El) * t, .25 + t * .07, .045, Rb) for t in (.25, .6)]), 360, voxel=.009)
        fc = P + V(sx * .2, -2.1, .9)
        fig.add('fist' + g[-1], g, 'vIp', Vk.pits(S.sphere(fc, .45), 6.2 + sx, .008, 9), 420, voxel=.01, uv=('top',))
        kn = []
        for (x, y, z, rx, rz, s) in ((0, -.2, .3, 1.3, 0, 1), (.3, -.1, .1, .9, -.7, .8), (-.3, -.1, .1, .9, .7, .8), (0, -.5, 0, 2.2, 0, .9), (0, .1, .3, .5, 0, .7)):
            dirv = rot(rx, 0, rz) @ V(0, 1, 0)
            a = fc + V(x, y, z) - dirv * .12 * s
            kn.append(Vk.crystal(a, a + dirv * .98 * s, .24 * s, 5, .25))
        fig.add('knuckles' + g[-1], g, 'vC', S.union(*kn), 360, voxel=.009, uv=('side',), sharp=25)
    return fig, (0, 0, 2.8, 6.4)


if __name__ == '__main__':
    fig, look_at = {'tender': build_tender, 'cantor': build_cantor, 'lancer': build_lancer, 'warden': build_warden}[KIND]()
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
