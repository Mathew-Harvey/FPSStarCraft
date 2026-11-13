"""The new Veyl voices for the full roster: casters, the Mute and the joined Chord.

Tuner (support caster: lays glass panes, hums a ward, throws false copies of itself), Mute (a blade nobody sees: no glow, no
voice, a stitched face), Choirmaster (area caster: organ pipes up its back, an open singing mouth), Chord (two Choirmasters
grown into one tail, sharing one orb and one halo). Same kit as art/veyl.py: a plated tail where legs would be, a turned
shell chest, a mask, a halo behind the head, gold and cut crystal.
Run:  python chorus.py tuner|mute|choirmaster|chord [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, veyl as Vk
from kit.sdf import V, rot
from veyl import tabard, cords, filigree, horn

KINDS = ('tuner', 'mute', 'choirmaster', 'chord')
KIND = next((a for a in sys.argv[1:] if a in KINDS), 'tuner')
PI = np.pi
FWD = rot(PI / 2, 0, 0)


def blade(pts, rad, flat, n=(1, 0, 0)):
    """A curved blade: a horn grown along pts, ground flat across n to `flat` thick, so it has an edge."""
    return S.both(Vk.horn(pts, rad), lambda p: np.abs(((p - V(pts[0])) * V(n)).sum(-1)) - flat, k=.004)


def bell(c, r0, r1, h, t, flare=.25):
    """A cast bell, mouth down: r0 across at the crown, r1 at the lip, h tall, walls t thick. Hollow underneath."""
    c = V(c)
    out = Vk.lathe([(r1, 0), (r1 * .96, h * .06), (r1 * (1 - flare), h * .3), (r0 * 1.04, h * .75), (r0 * .8, h * .95), (0, h)], c=c)
    inn = Vk.lathe([(r1 - t, -.05), (r1 * .96 - t, h * .06), (r1 * (1 - flare) - t, h * .3), (r0 * 1.04 - t, h * .75), (0, h - t)], c=c)
    return S.cut(out, inn, k=t * .3)


# ------------------------------------------------------------------------------------------------------------- Tuner
def build_tuner():
    """Support caster. Reads at a glance by the tall fork standing off its head, the bell-mouthed skirt, and the framed pane of
    glass it carries in one hand (the Glass Wall it sets down). Two thin rings turn round its head like a gyroscope."""
    fig = B.Figure('tuner', scale=1.12, lo=(-1.3, -.1, -1.2), hi=(1.3, 3.4, 1.4), detail=1.0, paint=1024, brush=1.25)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, 1.84, .02), 'body'), ('halo', (0, 2.1, -.05), 'body'),
                      ('armL', (-.31, 1.66, 0), 'body'), ('armR', (.31, 1.66, 0), 'body')):
        fig.group(g, p, par)
    sw = Vk.tail_sweep(1.0, .5)
    tail = Vk.lathe([(0, 0), (.03, .1), (.075, .36), (.11, .66), (.12, .84), (.1, .95)], sweep=sw, plates=(6, .013))
    fig.add('tail', 'body', 'vD', Vk.pits(tail, 2.1), 1000, voxel=.0033, uv=('cyl', V(0, .5, -.06)))
    fig.add('tailbands', 'body', 'vG', S.union(*[Vk.ring((0, y, sw(y)), r, .016, (.3, 0, 0)) for y, r in ((.26, .06), (.48, .095))]), 240, voxel=.003, uv=('cyl', V(0, .4, -.1)))
    # a bell for a skirt: cast shell, mouth down, ringed with gold at the lip and scored with the bands a bell has
    sk = Vk.lathe([(.44, 0), (.42, .03), (.31, .15), (.21, .38), (.16, .48), (0, .5)], c=(0, .66, 0))                  # cast solid: a thin bell wall tears when it is thinned
    sk = S.cut(sk, Vk.lathe([(.38, -.05), (.3, .05), (0, .12)], c=(0, .66, 0)), k=.02)                               # a shallow mouth underneath
    sk = S.bump(sk, lambda p: .004 * np.sin(p[..., 1] * 70) * np.clip((.95 - p[..., 1]) * 8, 0, 1))
    sk = S.groove(sk, [S.skin(sk, (np.sin(a) * .5, .9, np.cos(a) * .5), (-np.sin(a), 0, -np.cos(a)), tmax=1) for a in np.linspace(0, 2 * PI, 33)], .004, .005)
    fig.add('skirt', 'body', 'vIp', Vk.pits(sk, 1.7), 1200, voxel=.003, uv=('cyl', V(0, .9, 0)))
    fig.add('skirtlip', 'body', 'vG', Vk.ring((0, .675, 0), .435, .026), 360, voxel=.003, uv=('cyl', V(0, .67, 0)))
    fig.add('clapper', 'body', 'vC', Vk.crystal((0, .8, 0), (0, .5, 0), .07, 5, .3), 80, voxel=.003, sharp=25)      # hanging out of the bell's mouth
    fig.add('waist', 'body', 'vD', Vk.spine(1.13, 1.3, .09, 3), 260, voxel=.003, uv=('cyl', V(0, 1.2, 0)))
    chest = Vk.lathe([(.09, 1.26), (.16, 1.31), (.27, 1.47), (.26, 1.62), (.15, 1.75), (.08, 1.81)], zs=.74)
    chest = S.bump(chest, lambda p: .005 * np.sin(p[..., 1] * 60) * np.clip((1.4 - p[..., 1]) * 8, 0, 1))
    for y in (1.4, 1.52, 1.64):                                                                                    # three small sockets in a row: it hums three notes
        chest = S.cut(chest, S.sphere((0, y, .215), .042), k=.01)
    chest = filigree(chest, (0, 1.6, 0), .28, 1.2, zs=.74, y_rise=.08)
    fig.add('chest', 'body', 'vL', Vk.pits(chest, 2.4), 1500, voxel=.0032, uv=('cyl', V(0, 1.5, 0)))
    fig.add('notes', 'body', 'vM', S.union(*[S.sphere((0, y, .19), .036) for y in (1.4, 1.52, 1.64)]), 150, voxel=.0025, uv=('front',))
    fig.add('noterings', 'body', 'vG', S.union(*[S.torus((0, y, .2), .044, .011, FWD) for y in (1.4, 1.52, 1.64)]), 240, voxel=.0022, uv=('front',))
    fig.add('tabard', 'body', 'vG', tabard((0, 1.3, .2), .06, .52, tilt=.1), 180, voxel=.003, uv=('front',), sharp=35)
    sh = S.mirror(S.union(S.ellipsoid((.27, 1.66, -.01), (.12, .1, .12)), Vk.ring((.27, 1.62, 0), .11, .015, (0, 0, -.5)), k=.01))
    fig.add('shoulders', 'body', 'vI', Vk.pits(sh, 3.4), 520, voxel=.003, uv=('top',))
    # a high collar of plates standing up round the neck, open at the front
    col = Vk.petals(1.74, 1.93, .13, .19, 9, .11, .013, skip=(0, 1, 8, 2, 7), wave=.03, zs=.9, belly=.55)
    fig.add('collar', 'body', 'vIp', Vk.pits(S.union(*col), 3.9), 520, voxel=.003, uv=('cyl', V(0, 1.85, 0)), sharp=35)
    H0 = V(0, 1.84, .02)
    head = Vk.lathe([(.05, 0), (.1, .06), (.14, .2), (.13, .33), (.06, .41), (0, .43)], c=H0, zs=.9)
    fig.add('skull', 'head', 'vD', Vk.pits(head, 4.4), 600, voxel=.0028, uv=('cyl', H0 + V(0, .2, 0)))
    mask = S.both(S.grow(head, .015), S.plane(H0 + V(0, 0, .04), (0, 0, -1)), k=.015)                             # a smooth plate over the face
    mask = S.cut(mask, S.plane(H0 + V(0, .06, .1), (0, -1, .5)))                                                    # open below the nose
    mask = S.cut(mask, S.ecyl(H0 + V(0, .24, .15), .085, .06, .015, .01), k=.006)                                    # one wide slot for both eyes
    mask = S.groove(mask, [H0 + V(0, .43, .06), H0 + V(0, .3, .15)], .004, .005)
    fig.add('mask', 'head', 'vL', Vk.pits(mask, 4.9, .003), 700, voxel=.0026, uv=('front',))
    fig.add('eyes', 'head', 'teal', S.ellipsoid(H0 + V(0, .24, .12), (.075, .02, .04)), 80, voxel=.0024, uv=('front',))
    fig.add('jaw', 'head', 'vG', S.mirror(S.chain([H0 + V(.07, .14, .1), H0 + V(.06, .05, .12), H0 + V(.02, -.02, .11)], [.018, .015, .01])), 120, voxel=.0022)
    # the fork: a stem off the crown splitting into two tines taller than the head, a gold collar where it splits
    st = H0 + V(0, .4, -.04)
    fork = S.union(S.rcone(st, st + V(0, .16, -.02), .028, .024),
                   *[S.chain([st + V(0, .16, -.02), st + V(sx * .11, .27, -.03), st + V(sx * .12, .74, -.06)], [.024, .022, .007]) for sx in (-1, 1)], k=.015)
    fork = S.both(fork, S.slab(st + V(0, .3, -.03), (0, 0, 1), .02), k=.004)
    fig.add('fork', 'head', 'vC', fork, 360, voxel=.0026, uv=('front',), sharp=28)
    fig.add('forkcollar', 'head', 'vG', S.torus(st + V(0, .14, -.02), .04, .014), 90, voxel=.0024)
    fig.add('forkhum', 'head', 'mag', S.union(*[S.sphere(st + V(sx * .12, .76, -.06), .022) for sx in (-1, 1)]), 60, voxel=.0024)
    # two rings round the head on different tilts, like a gyroscope
    c = V(0, 2.1, -.05)
    fig.add('halo', 'halo', 'teal', S.torus(c, .34, .02, rot(.35, 0, .3)), 380, voxel=.0035, uv=('front',))
    fig.add('haloinner', 'halo', 'mag', S.torus(c, .27, .016, rot(-.5, 0, -.4)), 320, voxel=.0035, uv=('front',))
    fig.add('halopoints', 'halo', 'vC', S.union(*[Vk.crystal(c + rot(.35, 0, .3) @ V(np.cos(a) * .3, 0, np.sin(a) * .3), c + rot(.35, 0, .3) @ V(np.cos(a) * .44, 0, np.sin(a) * .44), .03, 4, .35) for a in (.3, 2.4, 4.5)]), 90, voxel=.003, sharp=25)
    # left arm: holds up the pane, a frame of gold with cut glass in it, held out to the side like a shield
    ShL, ElL, WrL = V(-.31, 1.66, 0), V(-.48, 1.42, .1), V(-.44, 1.3, .38)
    fig.add('armL', 'armL', 'vD', Vk.arm(ShL, ElL, WrL, .055, .04, .033), 360, voxel=.003, uv=('cyl', ElL))
    fig.add('vambL', 'armL', 'vI', Vk.pits(Vk.vambrace(ElL, ElL + (WrL - ElL) * .8, .062, .042), 5.1), 320, voxel=.003, uv=('cyl', (ElL + WrL) / 2))
    fig.add('clawL', 'armL', 'vL', Vk.claw(V(-.43, 1.27, .42), S.basis((.1, .1, 1), (1, .2, 0)), .07, curl=.9, thumb=1), 380, voxel=.0025, uv=('front',))
    Rp = rot(0, -.5, .08)
    pc = V(-.5, 1.33, .52)
    frame = S.cut(S.box(pc, (.2, .3, .02), .012, Rp), S.box(pc, (.165, .265, .05), .006, Rp), k=.006)
    frame = S.union(frame, *[S.sphere(pc + Rp @ V(sx * .2, sy * .3, 0), .03) for sx in (-1, 1) for sy in (-1, 1)], k=.008)
    fig.add('paneframe', 'armL', 'vG', frame, 420, voxel=.0028, uv=('front',), sharp=40)
    glass = S.box(pc, (.17, .27, .006), .002, Rp)
    glass = S.groove(glass, [pc + Rp @ V(-.17, .1, .006), pc + Rp @ V(.04, -.02, .006), pc + Rp @ V(.17, -.2, .006)], .003, .003)
    fig.add('pane', 'armL', 'vC', glass, 160, voxel=.0024, uv=('front',), sharp=30, glow=.5)
    # right arm: raised, open hand, a small shard turning over the palm (the Ward Hum)
    ShR, ElR, WrR = V(.31, 1.66, 0), V(.5, 1.5, .02), V(.52, 1.72, .22)
    fig.add('armR', 'armR', 'vD', Vk.arm(ShR, ElR, WrR, .055, .04, .033), 360, voxel=.003, uv=('cyl', ElR))
    fig.add('vambR', 'armR', 'vI', Vk.pits(Vk.vambrace(ElR, ElR + (WrR - ElR) * .8, .062, .042, spur=.26, side=1), 6.1), 320, voxel=.003, uv=('cyl', (ElR + WrR) / 2))
    fig.add('bangleR', 'armR', 'vG', S.torus(ElR + (WrR - ElR) * .86, .04, .013, S.basis((0, 0, 1), WrR - ElR)), 90, voxel=.0025)
    fig.add('clawR', 'armR', 'vL', Vk.claw(V(.53, 1.76, .25), S.basis((0, .6, .5), (0, -.5, .7)), .07, curl=.25, spread=1.3, thumb=-1), 380, voxel=.0025, uv=('front',))
    fig.add('wardshard', 'armR', 'mag', Vk.crystal((.55, 1.98, .34), (.55, 2.2, .34), .045, 5, .5), 60, voxel=.0024, sharp=25)
    fig.point('cast', (.55, 2.1, .34), 'armR')
    fig.point('pane', tuple(pc), 'armL')
    return fig, (0, 0, 1.45, 3.2)


# -------------------------------------------------------------------------------------------------------------- Mute
def build_mute():
    """The blade nobody sees. Lean, bent forward, wrapped in long dark strips that trail behind it. No orb, no lit eyes: a
    smooth mask with its mouth sewn shut and a broken halo that does not glow. Its forearms end in curved crystal blades."""
    fig = B.Figure('mute', lo=(-1.4, -.1, -1.6), hi=(1.4, 2.8, 1.8), detail=1.0, paint=1024, brush=1.25, grade=(.8, .82))
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, 1.66, .3), 'body'), ('halo', (0, 1.96, -.02), 'body'),
                      ('armL', (-.3, 1.5, .16), 'body'), ('armR', (.3, 1.5, .16), 'body')):
        fig.group(g, p, par)
    L = rot(.32, 0, 0)                                                                                             # the whole upper body leans forward over the tail
    lean = lambda f: S.moved(f, R=L, c=(0, 1.0, 0))
    lp = lambda *a: V(0, 1.0, 0) + L @ (V(*a) - V(0, 1.0, 0))
    sw = Vk.tail_sweep(1.0, 1.05)
    tail = Vk.lathe([(0, 0), (.026, .1), (.07, .4), (.11, .74), (.12, .9), (.1, 1.0)], sweep=sw, plates=(8, .012))
    fig.add('tail', 'body', 'vD', Vk.pits(tail, 3.1), 1100, voxel=.0033, uv=('cyl', V(0, .5, -.3)))
    fig.add('tailspines', 'body', 'vC', S.union(*[Vk.crystal(V(0, y, sw(y) - .07), V(0, y + .02, sw(y) - .3), .032, 4, .25) for y in (.3, .5, .7)]), 120, voxel=.003, sharp=25)
    # strips of dark cloth-shell wound round the hips and trailing out behind
    wraps = []
    for i, (a, y, ln) in enumerate(((.4, .98, 1.1), (-.5, .94, 1.3), (1.9, 1.02, .9), (-2.1, .97, 1.0), (PI, 1.0, 1.45))):
        p0 = V(np.sin(a) * .16, y, np.cos(a) * .14)
        p1 = p0 + V(np.sin(a) * .18, -.25, -.35)
        p2 = p0 + V(np.sin(a) * .1 + .06 * (i % 2 - .5), -.45 - .1 * i, -ln)
        wraps.append(S.both(S.chain(S.bez(p0, p1, p2, 10), list(np.linspace(.04, .012, 11))), S.slab(p0, (np.cos(a), 0, -np.sin(a)), .012), k=.004))
    fig.add('wraps', 'body', 'vDp', Vk.pits(S.union(*wraps), 2.7), 900, voxel=.003, uv=('side',))
    hips = S.union(S.ellipsoid((0, 1.0, 0), (.19, .1, .16)), *[Vk.ring((0, y, 0), .17 - abs(y - 1.0), .016, squash=1.1) for y in (.95, 1.02)], k=.015)
    fig.add('hips', 'body', 'vD', Vk.pits(hips, 1.4), 400, voxel=.003, uv=('cyl', V(0, 1.0, 0)))
    fig.add('waist', 'body', 'vD', lean(Vk.spine(1.05, 1.2, .085, 3)), 240, voxel=.003, uv=('cyl', V(0, 1.12, .03)))
    chest = Vk.lathe([(.08, 1.16), (.14, 1.2), (.23, 1.33), (.22, 1.46), (.13, 1.56), (.07, 1.6)], zs=.7)
    chest = S.cut(chest, S.ellipsoid((0, 1.38, .19), (.08, .1, .05)), k=.02)                                       # where an orb would sit, an empty socket
    chest = S.groove(chest, [V(x, y, .2) for x, y in ((-.15, 1.48), (-.07, 1.42), (-.1, 1.33), (-.03, 1.25))], .004, .006)
    fig.add('chest', 'body', 'vD', lean(Vk.pits(chest, 2.9)), 1300, voxel=.0032, uv=('cyl', lp(0, 1.38, 0)))
    fig.add('socket', 'body', 'vG', lean(S.torus((0, 1.38, .17), .08, .014, FWD)), 120, voxel=.0024, uv=('front',))
    # a hooded mantle of overlapping strips over the shoulders, ragged at the edge
    man = Vk.petals(1.55, 1.18, .12, .3, 11, .15, .012, skip=(0,), back=.15, wave=.08, zs=.9, belly=.5)
    fig.add('mantle', 'body', 'vDp', lean(Vk.pits(S.union(*man), 3.3)), 900, voxel=.003, uv=('cyl', lp(0, 1.4, 0)), sharp=35)
    H0 = V(0, 1.66, .3)
    head = S.ellipsoid(H0 + V(0, .17, 0), (.12, .17, .14), rot(.25, 0, 0))                                        # an egg tipped forward
    head = S.groove(head, [H0 + V(0, .02, .12), H0 + V(0, .1, .145)], .006, .006)                                 # the mouth, sewn up
    fig.add('mask', 'head', 'vL', Vk.pits(head, 5.2, .003), 800, voxel=.0026, uv=('front',),
            detail=S.fine(S.stitch(H0 + V(0, .06, .14), (1, 0, 0), pitch=.016, along=(0, 1, .2)), S.trace([H0 + V(-.09, .2, .1), H0 + V(-.05, .17, .13), H0 + V(-.02, .22, .14)])))
    hood = S.cut(S.ellipsoid(H0 + V(0, .2, -.03), (.17, .23, .2), rot(.25, 0, 0)), S.ellipsoid(H0 + V(0, .16, .05), (.135, .2, .19), rot(.25, 0, 0)), k=.01)
    hood = S.cut(hood, S.plane(H0 + V(0, 0, .09), (0, -.3, -1)))
    hood = S.bump(hood, lambda p: .005 * np.sin(np.arctan2(p[..., 0], p[..., 2] - .3) * 7))
    fig.add('hood', 'head', 'vDp', Vk.pits(hood, 4.6), 700, voxel=.0028, uv=('cyl', H0 + V(0, .2, 0)))
    fig.add('stitches', 'head', 'vG', S.union(*[S.rcone(H0 + V(-.02, y, .142), H0 + V(.02, y, .142), .005) for y in (.03, .055, .08, .105)]), 120, voxel=.0018)
    # a broken halo: two arcs of a dark ring, the gap where it snapped
    c = V(0, 1.96, -.02)
    ring = S.torus(c, .3, .026, rot(PI / 2 - .3, 0, 0), squash=.55)
    ring = S.cut(ring, S.both(S.plane(c, (1, -.2, 0)), S.plane(c, (-.6, 1, 0))), S.both(S.plane(c, (-1, .3, 0)), S.plane(c + V(0, -.05, 0), (.4, -1, 0))))
    fig.add('halo', 'halo', 'vD', ring, 300, voxel=.0035, uv=('front',))
    fig.add('halopoints', 'halo', 'vG', S.union(*[Vk.crystal(c + rot(-.3, 0, 0) @ V(np.cos(a) * .24, np.sin(a) * .24, 0), c + rot(-.3, 0, 0) @ V(np.cos(a) * .4, np.sin(a) * .4, 0), .024, 4, .35) for a in (2.3, 5.3)]), 60, voxel=.003, sharp=25)
    for sx, g in ((-1, 'armL'), (1, 'armR')):
        Sh = V(sx * .3, 1.5, .16)
        El, Wr = Sh + V(sx * .14, -.26, -.08), Sh + V(sx * .12, -.36, .22)
        fig.add('arm' + g[-1], g, 'vD', Vk.arm(Sh, El, Wr, .05, .038, .03), 300, voxel=.003, uv=('cyl', El))
        fig.add('vamb' + g[-1], g, 'vDp', Vk.pits(Vk.vambrace(El, El + (Wr - El) * .9, .06, .044, spur=.2, side=sx), 6.3 + sx), 320, voxel=.003, uv=('cyl', (El + Wr) / 2))
        # the blade grows out of the wrist and sweeps forward and down in a long curve, flat across the arm
        b0 = Wr
        # a mantis hook: up and out past the hand, over the top, then down and back in, the edge on the inside of the curve
        pts = [b0, b0 + V(sx * .02, .22, .16), b0 + V(sx * .04, .38, .46), b0 + V(sx * .05, .3, .78), b0 + V(sx * .05, .02, .9), b0 + V(sx * .04, -.2, .78)]
        fig.add('blade' + g[-1], g, 'vC', blade(pts, [.05, .06, .055, .045, .03, .004], .011, (1, 0, 0)), 320, voxel=.0024, uv=('side',), sharp=24, glow=.25)
        fig.add('bladespur' + g[-1], g, 'vC', Vk.crystal(b0 + V(sx * .02, .2, .14), b0 + V(sx * .03, .02, .34), .03, 4, .3), 60, voxel=.0024, sharp=24, glow=.25)
        fig.add('bladeroot' + g[-1], g, 'vG', S.torus(b0 + V(0, .01, .03), .045, .013, S.basis((0, 0, 1), V(0, .25, 1))), 90, voxel=.0024)
    fig.point('bladeL', (-.47, 1.44, 1.06), 'armL')
    fig.point('bladeR', (.47, 1.44, 1.06), 'armR')
    return fig, (0, 0, 1.35, 3.0)


# ------------------------------------------------------------------------------------------------------- Choirmaster
def master_parts(o=V(0, 0, 0), R=None, tag='', scale=1.0, tail=True, solo=True):
    """The Choirmaster above the tail, as a list of parts, so the Chord can grow two of them out of one tail.
    o and R put the waist where it belongs; tag names a second copy's groups (headB, armLB ...)."""
    Rm = np.eye(3, dtype=np.float32) if R is None else R
    P = lambda *a: o + Rm @ (V(*a) * scale)
    mv = lambda f: f if R is None and not o.any() and scale == 1 else S.moved(S.moved(f, s=scale), d=o, R=Rm)
    out = []
    add = lambda name, grp, mat, fn, tris, **kw: out.append((name + tag, grp, mat, mv(fn), tris, kw))
    hd, al, ar, hl = 'head' + tag, 'armL' + tag, 'armR' + tag, 'halo' + tag
    # a long robe of shell plates almost to the ground
    pl = Vk.petals(1.3, .5, .2, .74, 11, .24, .017, skip=(0,), back=.22, wave=.16, zs=.86, belly=.42)        # a robe that flares out like a bell, open at the front over the tail
    add('robe', 'body', 'vIp', Vk.pits(S.union(*pl[0::2]), 1.5), 1000, voxel=.0035, uv=('cyl', V(0, .8, 0)), sharp=35)
    add('robeunder', 'body', 'vDp', Vk.pits(S.union(*[S.moved(q, (0, .04, 0)) for q in pl[1::2]]), 2.2), 900, voxel=.0035, uv=('cyl', V(0, .8, 0)), sharp=35)
    add('robeband', 'body', 'vG', Vk.ring((0, 1.31, 0), .22, .025, squash=1.2), 260, voxel=.003, uv=('cyl', V(0, 1.3, 0)))
    add('waist', 'body', 'vD', Vk.spine(1.33, 1.5, .1, 3), 260, voxel=.003, uv=('cyl', V(0, 1.42, 0)))
    # the chest is an open throat: a hollow bell turned forward, a lit orb deep in it
    chest = Vk.lathe([(.1, 1.46), (.18, 1.52), (.34, 1.7), (.34, 1.86), (.2, 2.0), (.1, 2.06)], zs=.74)
    chest = S.cut(chest, S.ellipsoid((0, 1.76, .26), (.15, .15, .2)), k=.02)
    chest = filigree(chest, (0, 1.88, 0), .34, 1.3, zs=.74, y_rise=.06)
    add('chest', 'body', 'vI', Vk.pits(chest, 2.6), 1700, voxel=.0035, uv=('cyl', V(0, 1.75, 0)))
    add('throat', 'body', 'vG', S.torus((0, 1.76, .245), .15, .028, rot(PI / 2 - .1, 0, 0)), 280, voxel=.003, uv=('front',))
    add('orb', 'body', 'vM', S.sphere((0, 1.76, .16), .085), 140, voxel=.003, uv=('front',))
    add('cords', 'body', 'vG', cords(1.55, .22, .22, .1, .017, 2, .08), 260, voxel=.003, uv=('front',))
    # organ pipes up the back, graded tall to short from the middle out, open at the top
    pipes, lips = [], []
    for i, x in enumerate((-.3, -.18, -.06, .06, .18, .3)):                                                        # fanned out, tallest in the middle, standing well above the head
        h = 3.3 - abs(x) * 2.6 + (.08 if i % 2 else 0)
        r = .06 - abs(x) * .05
        a, b = V(x, 1.6, -.22 - abs(x) * .2), V(x * 2.1, h, -.34 - abs(x) * .3)
        pipes.append(S.cut(S.rcone(a, b, r, r * 1.05), S.rcone(b - (b - a) * .04, b + (b - a) * .05, r * .7, r * .7)))
        lips.append(S.torus(b - (b - a) * .25, r * 1.08, r * .25, S.basis((0, 0, 1), b - a)))
        lips.append(S.box(b - (b - a) * .25 + V(0, -.04, r * .9), (r * .5, .02, .01), .004))                     # the cut mouth in each pipe
    add('pipes', 'body', 'vG', S.union(*pipes), 900, voxel=.003, uv=('cyl', V(0, 2.1, -.3)), sharp=50, cull=False, planar=4)
    add('pipelips', 'body', 'vD', S.union(*lips), 400, voxel=.0025, uv=('side',))
    add('pipeyoke', 'body', 'vIp', S.box((0, 1.7, -.26), (.36, .07, .07), .03), 240, voxel=.003, uv=('side',))
    sh = S.mirror(S.union(S.ellipsoid((.32, 1.92, -.02), (.13, .11, .13)), Vk.ring((.32, 1.87, 0), .12, .016, (0, 0, -.5)), k=.01))
    add('shoulders', 'body', 'vIp', Vk.pits(sh, 3.6), 520, voxel=.003, uv=('top',))
    H0 = V(0, 2.08, .02)
    # a wide flat mask with the mouth open to sing, a ring of short crystals for a crown
    face = Vk.lathe([(.06, 0), (.13, .06), (.17, .2), (.16, .32), (.08, .4), (0, .42)], c=H0, zs=.8, xs=1.15)
    face = S.cut(face, S.ellipsoid(H0 + V(0, .1, .14), (.06, .07, .08)), k=.015)                                  # the singing mouth, round and open
    for sx in (-1, 1):
        face = S.cut(face, S.ellipsoid(H0 + V(sx * .07, .26, .14), (.04, .016, .05), rot(0, 0, -sx * .25)), k=.006)
    add('mask', hd, 'vL', Vk.pits(face, 4.2, .003), 1000, voxel=.0026, uv=('front',))
    add('mouth', hd, 'vM', S.ellipsoid(H0 + V(0, .1, .09), (.05, .06, .03)), 80, voxel=.0024, uv=('front',))
    add('eyes', hd, 'teal', S.union(*[S.ellipsoid(H0 + V(sx * .07, .26, .12), (.035, .013, .02), rot(0, 0, -sx * .25)) for sx in (-1, 1)]), 80, voxel=.0022, uv=('front',))
    crown = S.union(*[Vk.crystal(H0 + V(np.sin(a) * .13, .36, np.cos(a) * .1 - .02), H0 + V(np.sin(a) * .2, .58 - abs(np.sin(a)) * .08, np.cos(a) * .14 - .05), .03, 4, .3) for a in np.linspace(-1.6, 1.6, 7)])
    add('crown', hd, 'vC', crown, 300, voxel=.0026, sharp=25)
    add('crownband', hd, 'vG', S.torus(H0 + V(0, .36, -.01), .13, .016, squash=1.0), 160, voxel=.0024)
    if solo:
        c = V(0, 2.62, -.42)
        r1, pts = Vk.halo(c, .58, .045, 7, .2, .045, PI / 2)
        add('halo', hl, 'teal', r1, 520, voxel=.0045, uv=('front',))
        add('halopoints', hl, 'mag', pts, 160, voxel=.0045, sharp=25)
    # right arm up with a long thin baton of crystal, left arm held out palm forward
    ShR, ElR, WrR = V(.36, 1.94, 0), V(.58, 2.06, .08), V(.62, 2.38, .22)
    add('armR', ar, 'vD', Vk.arm(ShR, ElR, WrR, .06, .045, .035), 380, voxel=.003, uv=('cyl', ElR))
    add('vambR', ar, 'vIp', Vk.pits(Vk.vambrace(ElR, ElR + (WrR - ElR) * .82, .07, .046, spur=.3, side=1), 6.4), 360, voxel=.003, uv=('cyl', (ElR + WrR) / 2))
    add('handR', ar, 'vL', S.union(S.ellipsoid(WrR + V(0, .05, .02), (.05, .055, .05)), *[S.torus(WrR + V(0, .05 + i * .03, .03), .026, .012) for i in (0, 1)], k=.01), 240, voxel=.0024, uv=('front',))
    add('baton', ar, 'vC', Vk.crystal(WrR + V(0, -.06, .02), WrR + V(-.02, .62, .1), .022, 5, .2), 90, voxel=.0024, sharp=25)
    add('batonring', ar, 'mag', S.torus(WrR + V(0, .14, .03), .03, .01), 60, voxel=.002)
    ShL, ElL, WrL = V(-.36, 1.94, 0), V(-.6, 1.78, .1), V(-.72, 1.82, .38)
    add('armL', al, 'vD', Vk.arm(ShL, ElL, WrL, .06, .045, .035), 380, voxel=.003, uv=('cyl', ElL))
    add('vambL', al, 'vIp', Vk.pits(Vk.vambrace(ElL, ElL + (WrL - ElL) * .82, .07, .046), 5.4), 360, voxel=.003, uv=('cyl', (ElL + WrL) / 2))
    add('clawL', al, 'vL', Vk.claw(V(-.74, 1.84, .43), S.basis((-.3, .2, .9), (.1, .98, 0)), .08, curl=.15, spread=1.4, thumb=1), 420, voxel=.0025, uv=('front',))
    if tail:
        sw = Vk.tail_sweep(1.25, .7)
        t = Vk.lathe([(0, 0), (.04, .14), (.1, .5), (.15, .9), (.17, 1.15), (.15, 1.3)], sweep=sw, plates=(7, .016))
        add('tail', 'body', 'vD', Vk.pits(t, 1.9), 1100, voxel=.0035, uv=('cyl', V(0, .6, -.1)))
    return out


def build_choirmaster():
    """Area caster. Read from far off by the organ pipes standing up its back and the tall robe; up close by the open mouth and
    the lit orb in its open chest. One hand holds a thin crystal baton high (Shatter Note comes down where it points)."""
    fig = B.Figure('choirmaster', scale=1.12, lo=(-1.6, -.1, -1.5), hi=(1.6, 3.8, 1.4), detail=1.0, paint=1024, brush=1.35)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, 2.08, .02), 'body'), ('halo', (0, 2.62, -.42), 'body'),
                      ('armL', (-.36, 1.94, 0), 'body'), ('armR', (.36, 1.94, 0), 'body')):
        fig.group(g, p, par)
    for name, grp, mat, fn, tris, kw in master_parts():
        fig.add(name, grp, mat, fn, tris, **kw)
    fig.point('cast', (.6, 3.0, .32), 'armR')
    return fig, (0, 0, 1.55, 3.3)


# ------------------------------------------------------------------------------------------------------------- Chord
def build_chord():
    """Two Choirmasters that sang together until they grew into one: a single great tail, two upper bodies leaning apart from a
    shared hip, one orb hanging between them and one halo round both heads. Bigger than either (four beds)."""
    fig = B.Figure('chord', lo=(-2.4, -.1, -1.8), hi=(2.4, 4.4, 1.8), coarse=.025, detail=1.0, paint=1536, brush=1.8)
    lean = .32
    tags = (('', 1), ('B', -1))
    sc = .95
    # the two halves sit on a yoke at the top of one tail, each tipped out to its own side and a little turned
    for tag, sx in tags:
        R = rot(0, sx * .25, -sx * lean)
        o = V(sx * .3, .45, 0)
        piv = lambda *a: tuple(o + R @ (V(*a) * sc))
        fig.group('body' if not tag else 'bodyB', (0, 0, 0) if not tag else piv(0, 1.3, 0), None if not tag else 'body')
    for tag, sx in tags:
        R = rot(0, sx * .25, -sx * lean)
        o = V(sx * .3, .45, 0)
        piv = lambda *a: tuple(o + R @ (V(*a) * sc))
        b = 'body' if not tag else 'bodyB'
        fig.group('head' + tag, piv(0, 2.08, .02), b)
        fig.group('armL' + tag, piv(-.36, 1.94, 0), b)
        fig.group('armR' + tag, piv(.36, 1.94, 0), b)
    fig.group('halo', (0, 3.75, -.5), 'body')
    fig.group('orb', (0, 2.25, .55), 'body')
    for tag, sx in tags:
        R = rot(0, sx * .25, -sx * lean)
        o = V(sx * .3, .45, 0)
        for name, grp, mat, fn, tris, kw in master_parts(o, R, tag, sc, tail=False, solo=False):
            grp = 'bodyB' if (tag and grp == 'body') else grp
            fig.add(name, grp, mat, fn, tris, **kw)
    # one tail, wider than a Choirmaster's, with a gold yoke where the two waists come out of it
    sw = Vk.tail_sweep(1.85, .9)
    t = Vk.lathe([(0, 0), (.06, .2), (.18, .7), (.3, 1.25), (.36, 1.6), (.32, 1.8)], sweep=sw, plates=(8, .022), xs=1.35)
    fig.add('tail', 'body', 'vD', Vk.pits(t, 2.3), 1600, voxel=.005, uv=('cyl', V(0, .9, -.15)))
    fig.add('tailbands', 'body', 'vG', S.union(*[Vk.ring((0, y, sw(y)), r, .028, (.25, 0, 0), squash=1.0) for y, r in ((.5, .13), (.95, .24))]), 360, voxel=.004, uv=('cyl', V(0, .7, -.2)))
    yoke = S.union(S.ellipsoid((0, 1.72, 0), (.62, .2, .34)), Vk.ring((0, 1.78, 0), .5, .04, squash=1.0), k=.04)
    fig.add('yoke', 'body', 'vIp', Vk.pits(yoke, 1.6), 700, voxel=.004, uv=('cyl', V(0, 1.72, 0)))
    fig.add('yokeband', 'body', 'vG', S.squash(Vk.ring((0, 1.66, 0), .52, .035), (1.15, 1, .65)), 360, voxel=.004)
    # a skirt of plates hanging off the yoke so the tail does not show bare where the two robes part
    pl = Vk.petals(1.68, .6, .4, .75, 12, .3, .02, skip=(), back=.2, wave=.12, zs=.66, belly=.5)
    fig.add('skirt', 'body', 'vIp', Vk.pits(S.union(*pl[0::2]), 1.8), 1100, voxel=.004, uv=('cyl', V(0, 1.1, 0)), sharp=35)
    fig.add('skirtunder', 'body', 'vDp', Vk.pits(S.union(*[S.moved(q, (0, .05, 0)) for q in pl[1::2]]), 2.4), 900, voxel=.004, uv=('cyl', V(0, 1.1, 0)), sharp=35)
    # the shared orb hangs between the two chests in a cage of gold ribs, and is what the Chord fires from
    oc = V(0, 2.25, .55)
    fig.add('orbcore', 'orb', 'vM', S.sphere(oc, .2), 260, voxel=.004, uv=('front',))
    cage = S.union(*[S.torus(oc, .27, .018, rot(0, a, PI / 2)) for a in (0, PI / 3, 2 * PI / 3)])
    fig.add('orbcage', 'orb', 'vG', cage, 520, voxel=.0032, uv=('front',))
    fig.add('orbshards', 'orb', 'vC', S.union(*[Vk.crystal(oc + V(0, sy * .26, 0), oc + V(0, sy * .52, 0), .04, 4, .3) for sy in (-1, 1)]), 100, voxel=.0035, sharp=25)
    fig.point('muzzle', tuple(oc + V(0, 0, .3)), 'orb')
    # one halo round both heads
    c = V(0, 3.75, -.5)
    r1, pts = Vk.halo(c, 1.25, .07, 9, .34, .07, PI / 2)
    fig.add('halo', 'halo', 'teal', r1, 760, voxel=.007, uv=('front',))
    fig.add('haloinner', 'halo', 'mag', S.torus(c, .98, .045, FWD, squash=.55), 520, voxel=.007, uv=('front',))
    fig.add('halopoints', 'halo', 'mag', pts, 220, voxel=.006, sharp=25)
    return fig, (0, 0, 2.1, 4.4)


if __name__ == '__main__':
    fig, look_at = {'tuner': build_tuner, 'mute': build_mute, 'choirmaster': build_choirmaster, 'chord': build_chord}[KIND]()
    args = [a for a in sys.argv[1:] if a != KIND]
    png = args[0] if args and args[0].endswith('.png') else None
    only = [a for a in args if not a.endswith('.png')]
    if only:
        fig.parts = [p for p in fig.parts if any(p.name.startswith(o) or p.group == o for o in only)]
    here = __file__.rsplit('/', 1)[0]
    import os
    side = os.environ.get('OUT', here + '/../assets/mesh')
    os.makedirs(side, exist_ok=True)
    fig.build(side + '/%s.bin' % KIND if not only else '/tmp/%s-part.bin' % KIND, here + '/out/%s.blend' % KIND if not only else None)
    if png:
        from kit import look
        c = [float(x) for x in os.environ.get('LOOK', '%g,%g,%g,%g' % look_at).split(',')]
        look.render(png, centre=(c[0], -c[1], c[2]), height=c[3], px=int(os.environ.get('PX', 640)))
