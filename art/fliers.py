"""Ironhold's new fliers (stream E of the full-depth build): the Hopper, the Flak Kite, the Gadfly, the Surveyor and the Claim Barge.

Same yard, same rules: everything is a work machine first. The Hopper is a crew bus with jet pods, the Flak Kite a crop duster with flak
guns and legs to land on, the Gadfly a spraying rig turned gunship, the Surveyor a survey balloon with a searchlight, and the Claim Barge
an ore barge that flies, carrying the company's bailiffs and their big gun. Each is sculpted standing on the ground (origin under its
feet or gear); the game lifts fliers to their height. Run:  python fliers.py hopper|flakkite|gadfly|surveyor|claimbarge [preview.png] [part ...]
"""
import os
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B
from kit.sdf import V, rot
from rigs import xcan, ycan, zcan, dents, rivets

PI = np.pi


def duct(c, R_, axis_rot, r=.06):
    """A fan duct: a fat ring with a lip, lying across the axis turned by axis_rot (identity: axis up)."""
    return S.union(S.torus(V(c), R_, r, axis_rot, squash=1.7), S.torus(V(c) + axis_rot @ V(0, -r * 1.1, 0), R_ + r * .2, r * .6, axis_rot), k=r * .5)


def blades(c, n, length, width, R=None, pitch=.3, hub=.05):
    """A fan of n flat blades about local y (turned by R) through c."""
    R = np.eye(3, dtype=np.float32) if R is None else R
    c = V(c)
    bs = [S.box(c + R @ rot(0, a, 0) @ V(0, 0, length * .5 + hub), (width, .006 + width * .08, length * .5), .005, R @ rot(0, a, 0) @ rot(0, 0, pitch)) for a in np.linspace(0, 2 * PI, n + 1)[:-1]]
    return S.union(*bs, S.cyl(c - R @ V(0, .03, 0), c + R @ V(0, .04, 0), hub, .01), k=.008)


def stripes(c, n, pitch, where=None, col=(.1, .09, .08)):
    return (S.chevrons(V(c), V(n), pitch, where), col)


# ================================================================ Hopper
def hopper():
    """The crew bus: a slab-sided cabin with a ramp at the back, a glazed nose, and a jet pod on each stub wing that swivels down to
    lift and back to fly. Afterburn lights the pods' tails."""
    fig = B.Figure('hopper', lo=(-2.8, -.1, -3.2), hi=(2.8, 3.2, 3.4), coarse=.04, detail=1.6, paint=1536, brush=1.9)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, 1.6, 2.2), 'body')                  # the cockpit
    fig.group('podL', (-1.75, 1.85, .2), 'body')              # jet pods swivel about x
    fig.group('podR', (1.75, 1.85, .2), 'body')
    fig.group('ramp', (0, .4, -2.22), 'body')                 # the back ramp hinges at its foot and drops open about x
    fig.group('pack', (0, 0, 0), 'body')                      # landing legs: shown down when it sits on the ground
    C = V(0, 1.55, 0)
    cab = S.box(C, (.95, .8, 2.2), .25)
    cab = S.union(cab, S.ellipsoid(C + V(0, .55, -.1), (.85, .3, 2.0)), k=.15)
    cab = S.cut(cab, S.plane(C + V(0, -.4, 2.0), (0, -.6, -1)))                              # the nose chin cut up
    cab = S.cut(cab, S.box(C + V(0, -.2, -2.25), (.75, .62, .12), .05))                       # the ramp opening
    cab = dents(cab, 1.1, .02, 2.2)
    for z in (-1.2, -.2, .8):
        cab = S.groove(cab, [C + V(-1.0, -.85, z), C + V(-1.0, .85, z)], .01, .012)
        cab = S.groove(cab, [C + V(1.0, -.85, z), C + V(1.0, .85, z)], .01, .012)
    win = [S.box(C + V(sx * .96, .3, z), (.06, .16, .22), .05) for sx in (-1, 1) for z in (-.9, .1)]
    cab = S.cut(cab, *win)
    fig.add('cabin', 'body', 'pY', cab, 2400, voxel=.012, uv=('box',), sharp=40,
            detail=S.fine(rivets([C + V(sx * .96, y, z) for sx in (-1, 1) for y in (-.6, .62) for z in np.linspace(-1.9, 1.7, 9)], .025, .01)),
            marks=[stripes(C + V(0, -.62, 0), (0, .3, 1), .32, lambda p: p[..., 1] < 1.0), (S.inside(S.box(C + V(0, .2, 0), (1.2, .16, .4))), (.1, .09, .08))])
    fig.add('portholes', 'body', 'visG', S.union(*[S.box(C + V(sx * .93, .3, z), (.03, .14, .2), .04) for sx in (-1, 1) for z in (-.9, .1)]), 200, voxel=.008, uv=('side',), glow=.4)
    fig.add('belly', 'body', 'gunm', S.box(C + V(0, -.85, -.1), (.8, .08, 1.9), .06), 400, voxel=.012, uv=('box',))
    # the glazed nose and the pilot behind it
    N = V(0, 1.6, 2.2)
    nose = S.both(S.ellipsoid(N, (.8, .62, .55)), S.plane(N, (0, 0, -1)))                      # the front half of the dome
    frames = S.both(S.cut(S.grow(nose, .02), nose), S.union(*[S.slab(N, (np.sin(a), 0, np.cos(a)), .025) for a in (-.6, 0, .6)], S.slab(N + V(0, .15, 0), (0, 1, 0), .025)))
    fig.add('noseglass', 'head', 'lens', nose, 500, voxel=.01, uv=('front',), glow=.25)
    fig.add('noseframes', 'head', 'gunm', S.union(frames, S.both(S.cut(S.grow(nose, .05), nose), S.slab(N, (0, 0, 1), .04)), k=.01), 700, voxel=.008, uv=('front',))
    fig.add('pilot', 'head', 'hard', S.union(S.sphere(N + V(-.25, .1, .05), .14), S.ellipsoid(N + V(-.25, -.2, -.05), (.2, .15, .14)), k=.05), 300, voxel=.008, uv=('front',))
    # stub wings and the swivelling jet pods
    wings = S.union(*[S.box(V(sx * 1.35, 1.85, .2), (.45, .07, .45), .04, rot(0, 0, sx * -.05)) for sx in (-1, 1)])
    fig.add('stubwings', 'body', 'bD', dents(wings, 4.4, .012, 4), 500, voxel=.01, uv=('top',), sharp=40, marks=[stripes((0, 1.9, .2), (1, 0, .4), .2)])
    for sx, g in ((-1, 'podL'), (1, 'podR')):
        P = V(sx * 1.75, 1.85, .2)
        pod = S.union(zcan(P, .42, .75, .1), S.torus(P + V(0, 0, .7), .42, .06, rot(PI / 2, 0, 0)), k=.04)
        pod = S.cut(pod, zcan(P + V(0, 0, .7), .34, .2, 0))
        pod = dents(pod, 3.0 + sx, .012, 4)
        fig.add('pod' + g[-1], g, 'bS', pod, 900, voxel=.01, uv=('side',), sharp=40, marks=[(S.band(P + V(0, 0, .3), (0, 0, 1), .06), (.95, .72, .12))])
        fig.add('fan' + g[-1], g, 'gunB', blades(P + V(0, 0, .55), 9, .3, .05, rot(PI / 2, 0, 0), .5, .1), 400, voxel=.006, uv=('front',))
        fig.add('nozzle' + g[-1], g, 'rust', S.cut(S.rcone(P + V(0, 0, -.7), P + V(0, 0, -1.05), .36, .26), zcan(P + V(0, 0, -.95), .2, .3, 0)), 400, voxel=.01, uv=('side',))
        fig.add('burner' + g[-1], g, 'fireD', zcan(P + V(0, 0, -.95), .2, .04, .02), 80, voxel=.01, glow=.6)
        fig.point('jet' + g[-1], P + V(0, 0, -1.1), g)
    # the ramp, closed: a slab with treads, its hinge at the top
    rp = S.box(V(0, .95, -2.22), (.72, .58, .08), .03)
    rp = S.bump(rp, lambda p: .012 * (np.sin(p[..., 1] * 30) > .6) * (p[..., 2] < -2.25))
    fig.add('rampplate', 'ramp', 'bD', rp, 400, voxel=.01, uv=('front',), marks=[stripes((0, .5, -2.3), (1, 1, 0), .22, lambda p: p[..., 1] < .6, (.95, .72, .12))])
    fig.add('ramphinge', 'body', 'nS', xcan((0, .4, -2.22), .07, .7, .02), 120, voxel=.01)
    # four landing legs with pads (hidden in flight)
    legs = S.union(*[S.union(S.rcone(C + V(sx * .8, -.75, sz * 1.5), V(sx * 1.05, .12, sz * 1.65), .07, .06), S.cyl(V(sx * 1.05, 0, sz * 1.65), V(sx * 1.05, .1, sz * 1.65), .2, .03), k=.03) for sx in (-1, 1) for sz in (-1, 1)])
    fig.add('legs', 'pack', 'gunm', legs, 600, voxel=.01, uv=('side',), sharp=40)
    fig.add('beacons', 'body', 'red', S.union(*[S.sphere(V(sx * 1.75, 2.3, .2), .06) for sx in (-1, 1)], S.sphere(C + V(0, .88, -1.6), .07)), 80, voxel=.01)
    return fig


# ================================================================ Flak Kite
def flakkite():
    """A one-seat crop duster with a box kite for a wing and two flak guns under it. Landed, the wings fold up over the back and two
    bird legs take its weight, and it walks with the guns still under its chin."""
    fig = B.Figure('flakkite', lo=(-2.6, -.1, -2.2), hi=(2.6, 3.0, 2.4), coarse=.03, detail=1.2, paint=1536, brush=1.6)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, 1.75, .55), 'body')
    fig.group('wingL', (-.4, 2.0, 0), 'body')                # the wings fold about z for landing
    fig.group('wingR', (.4, 2.0, 0), 'body')
    fig.group('arms', (0, 1.35, .6), 'body')                 # the guns
    fig.group('rotor', (0, 1.75, -1.55), 'body')             # pusher prop
    fig.group('legL', (-.32, 1.35, -.1))
    fig.group('legR', (.32, 1.35, -.1))
    C = V(0, 1.7, 0)
    fus = S.union(S.ellipsoid(C + V(0, 0, .2), (.38, .38, 1.0)), S.rcone(C + V(0, .05, -.6), C + V(0, .1, -1.4), .3, .14), k=.15)
    fus = S.cut(fus, S.ellipsoid(C + V(0, .32, .55), (.25, .2, .35)))                           # the open cockpit
    fus = dents(fus, 6.2, .01, 5)
    fig.add('fuselage', 'body', 'pR', fus, 1800, voxel=.008, uv=('cyl', C), sharp=40,
            detail=S.fine(*[S.slit(C + V(0, 0, z), (0, 0, 1), .006, .006) for z in (-.8, -.3, .3)]),
            marks=[(S.band(C + V(0, 0, -.55), (0, 0, 1), .07), (.95, .72, .12)), (S.inside(S.sphere(C + V(.38, 0, -.1), .17)), (.95, .9, .8))])
    fig.add('cowl', 'body', 'bS', S.union(zcan(C + V(0, 0, 1.08), .3, .12, .05), S.torus(C + V(0, 0, 1.18), .26, .04, rot(PI / 2, 0, 0)), k=.02), 500, voxel=.008, uv=('front',))
    fig.add('windshield', 'head', 'lens', S.both(S.box(C + V(0, .42, .82), (.22, .12, .02), .01, rot(-.5, 0, 0)), S.sphere(C + V(0, .3, .8), .3)), 80, voxel=.006, glow=.2)
    fig.add('pilothead', 'head', 'helm', S.union(S.sphere(C + V(0, .43, .5), .13), S.ellipsoid(C + V(0, .25, .48), (.18, .12, .12)), k=.04), 300, voxel=.006, uv=('front',))
    fig.add('pilotgoggles', 'head', 'gunB', S.union(*[zcan(C + V(sx * .05, .45, .61), .04, .02, .01) for sx in (-1, 1)]), 120, voxel=.004)
    # the box kite wing: a frame of spars with canvas cells, sculpted for the right side and mirrored
    for sx, g in ((-1, 'wingL'), (1, 'wingR')):
        x0, x1 = sx * .4, sx * 2.25
        spars = S.union(*[S.rcone(V(x0, y, z), V(x1, y + .1, z - .1), .03) for y in (1.85, 2.5) for z in (.5, -.4)])
        spars = S.union(spars, *[S.rcone(V(x, 1.85, z), V(x, 2.5 + .1 * abs(x) / 2.25, z), .025) for x in np.linspace(x0, x1, 4) for z in (.5, -.4)])
        fig.add('spars' + g[-1], g, 'wood', spars, 700, voxel=.006, uv=('side',))
        cloth = S.union(*[S.box(V((x0 + x1) / 2, y + .05, .05), (abs(x1 - x0) / 2, .012, .45), .01, rot(0, 0, sx * .035)) for y in (1.85, 2.5)])
        cloth = S.bump(cloth, lambda p: .01 * np.sin(p[..., 0] * 8) * np.sin(p[..., 2] * 6))
        fig.add('canvas' + g[-1], g, 'fabT', cloth, 800, voxel=.008, uv=('top',), marks=[(S.chevrons((0, 2.2, 0), (1, 0, 0), .5, lambda p: np.abs(p[..., 2] - .44) < .08), (.85, .2, .12))])
        fig.add('wires' + g[-1], g, 'nS', S.union(*[S.rcone(V(x0, 1.85, z), V(x1, 2.6, z), .008) for z in (.5, -.4)]), 120, voxel=.004)
    fig.add('wingroot', 'body', 'gunm', S.union(S.box(C + V(0, .25, .05), (.42, .06, .5), .03), S.box(C + V(0, .82, .05), (.42, .04, .5), .02), *[S.rcone(C + V(sx * .38, .3, z), C + V(sx * .38, .8, z), .03) for sx in (-1, 1) for z in (.5, -.4)], k=.01), 500, voxel=.008, uv=('top',))
    # tail
    tail = S.union(S.box(C + V(0, .35, -1.35), (.02, .35, .22), .02), S.box(C + V(0, .08, -1.38), (.6, .02, .2), .02), k=.02)
    fig.add('tail', 'body', 'pY', tail, 400, voxel=.006, uv=('side',), marks=[stripes(C + V(0, .3, -1.35), (0, 1, 1), .14)])
    fig.add('prop', 'rotor', 'gunB', blades(C + V(0, .05, -1.6), 3, .55, .07, rot(PI / 2, 0, 0), .4, .07), 300, voxel=.005, uv=('front',))
    # two flak guns under the chin, ammo drums on the sides
    for sx in (-1, 1):
        G = V(sx * .26, 1.32, .7)
        gun = S.union(S.box(G + V(0, 0, -.1), (.08, .1, .22), .03), S.cyl(G + V(0, .02, .1), G + V(0, .02, .95), .04, .01), k=.02)
        for z in (.4, .6, .8):
            gun = S.union(gun, zcan(G + V(0, .02, z), .055, .02, .01))
        fig.add('gun' + ('R' if sx > 0 else 'L'), 'arms', 'gunm', gun, 500, voxel=.005, uv=('side',), sharp=40)
        fig.add('drum' + ('R' if sx > 0 else 'L'), 'arms', 'pY', xcan(G + V(sx * .16, -.02, -.1), .13, .06, .02), 200, voxel=.006, uv=('side',))
        fig.point('muzzle' + ('R' if sx > 0 else 'L'), G + V(0, .02, 1.0), 'arms')
    # bird legs (shown down: the game folds them up in flight)
    for sx, g in ((-1, 'legL'), (1, 'legR')):
        hip, knee, ank = V(sx * .32, 1.35, -.1), V(sx * .4, .78, .25), V(sx * .42, .16, -.05)
        leg = S.union(S.sphere(hip, .1), S.rcone(hip, knee, .08, .06), S.sphere(knee, .08), S.rcone(knee, ank, .055, .045), k=.02)
        fig.add('leg' + g[-1], g, 'bD', leg, 500, voxel=.006, uv=('side',), sharp=40)
        fig.add('ram' + g[-1], g, 'nS', S.cyl(hip + V(0, -.08, -.1), knee + V(0, .05, -.1), .025, .006), 80, voxel=.005)
        foot = S.union(*[S.rcone(ank, ank + V(np.sin(a) * .28, -.14, np.cos(a) * .28), .04, .025) for a in (-.6, 0, .6, PI)], S.sphere(ank, .07), k=.02)
        fig.add('foot' + g[-1], g, 'gunm', foot, 300, voxel=.005, uv=('top',))
    return fig


# ================================================================ Gadfly
def gadfly():
    """A crop sprayer refitted as a gunship: a pot-bellied cabin under one big rotor, a chin gun, spray booms that now lay smoke, and a
    long tail with a fan."""
    fig = B.Figure('gadfly', lo=(-3.4, -.1, -4.0), hi=(3.4, 3.0, 2.6), coarse=.04, detail=1.6, paint=1536, brush=1.8)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, 1.4, 1.2), 'body')
    fig.group('rotor', (0, 2.55, 0), 'body')
    fig.group('rotorT', (.18, 1.9, -3.4), 'body')
    fig.group('arms', (0, .78, 1.35), 'body')                # the chin gun turns and lifts
    C = V(0, 1.35, 0)
    cab = S.union(S.ellipsoid(C, (.9, .85, 1.45)), S.ellipsoid(C + V(0, -.3, -.2), (.95, .6, 1.2)), k=.3)
    cab = S.cut(cab, S.plane(C + V(0, 0, .6), (0, -.2, -1)) if False else S.ellipsoid(C + V(0, .3, 1.35), (.7, .5, .3)))
    cab = dents(cab, 2.2, .02, 2.5)
    fig.add('cabin', 'body', 'pO', cab, 2200, voxel=.012, uv=('cyl', C), sharp=40,
            detail=S.fine(*[S.slit(C + V(0, 0, z), (0, 0, 1), .008, .008) for z in (-.7, 0, .5)], rivets([C + V(np.sin(a) * .9, np.cos(a) * .82, 0) for a in np.linspace(-2.4, 2.4, 10)], .02, .01)),
            marks=[stripes(C + V(0, -.5, 0), (1, 0, .5), .3, lambda p: p[..., 1] < .95), (S.inside(S.sphere(C + V(.9, .2, -.3), .26)), (.1, .09, .08))])
    glass = S.both(S.ellipsoid(C + V(0, .25, 1.0), (.75, .55, .55)), S.plane(C + V(0, 0, .9), (0, 0, -1)))
    fig.add('canopy', 'head', 'lens', glass, 500, voxel=.01, uv=('front',), glow=.25)
    fig.add('canopyframe', 'head', 'gunm', S.both(S.cut(S.grow(glass, .03), glass), S.union(S.slab(C, (1, 0, 0), .03), S.slab(C + V(0, .25, 0), (0, 1, -.3), .03))), 400, voxel=.008)
    tail = S.union(S.rcone(C + V(0, .4, -1.2), V(0, 1.9, -3.3), .35, .12), S.box(V(0, 2.2, -3.4), (.04, .45, .3), .03), S.box(V(0, 1.85, -3.0), (.7, .03, .2), .02), k=.08)
    fig.add('tail', 'body', 'pY', dents(tail, 5.5, .01, 4), 900, voxel=.01, uv=('side',), sharp=40, marks=[stripes((0, 2.2, -3.4), (0, 1, 1), .16)])
    fig.add('tailfan', 'rotorT', 'gunB', blades((.18, 1.9, -3.4), 4, .3, .05, rot(0, 0, PI / 2), .3, .05), 200, voxel=.006, uv=('side',))
    mast = S.union(ycan((0, 2.3, 0), .12, .25, .03), S.box((0, 2.12, 0), (.45, .12, .5), .1), k=.06)
    fig.add('mast', 'body', 'gunm', mast, 500, voxel=.01, uv=('top',), sharp=40)
    fig.add('rotorblades', 'rotor', 'gunB', blades((0, 2.6, 0), 3, 3.2, .14, None, .08, .14), 500, voxel=.012, uv=('top',), marks=[(S.band((0, 2.6, 0), (1, 0, 0), 4.0), (.1, .09, .08))])
    fig.add('rotortips', 'rotor', 'haz', S.union(*[S.box(rot(0, a, 0) @ V(0, 2.61, 3.2), (.15, .02, .1), .01, rot(0, a, 0)) for a in np.linspace(0, 2 * PI, 4)[:-1]]), 150, voxel=.01)
    # spray booms on each side, their nozzles now smoke pots
    booms = S.union(*[S.union(S.rcone(C + V(sx * .8, -.4, .1), V(sx * 2.4, 1.0, .1), .05), *[S.rcone(V(sx * x, .98 + x * .0, .1), V(sx * x, .78, .1), .03) for x in (1.3, 1.8, 2.3)], k=.02) for sx in (-1, 1)])
    fig.add('booms', 'body', 'bS', booms, 600, voxel=.008, uv=('side',))
    pots = S.union(*[ycan(V(sx * x, .72, .1), .08, .07, .02) for sx in (-1, 1) for x in (1.3, 1.8, 2.3)])
    fig.add('smokepots', 'body', 'tank', pots, 400, voxel=.008, uv=('side',))
    fig.add('tank', 'body', 'pY', S.union(xcan(C + V(0, -.85, -.3), .3, .7, .1), k=.01), 500, voxel=.01, uv=('side',), marks=[(S.band(C + V(0, -.85, -.3), (1, 0, 0), .05), (.1, .09, .08))])
    sk = S.union(*[S.union(S.rcone(V(sx * .9, .05, -1.0), V(sx * .9, .05, 1.1), .06), S.rcone(V(sx * .9, .05, 1.1), V(sx * .9, .2, 1.35), .06), *[S.rcone(V(sx * .9, .05, z), C + V(sx * .6, -.6, z), .05) for z in (-.6, .6)], k=.03) for sx in (-1, 1)])
    fig.add('skids', 'body', 'gunm', sk, 500, voxel=.01, uv=('side',))
    # the chin gun: a short rotary in a ball mount
    G = V(0, .78, 1.35)
    gun = S.union(S.sphere(G, .22), *[S.cyl(G + V(np.sin(a) * .06, np.cos(a) * .06, .1), G + V(np.sin(a) * .06, np.cos(a) * .06, .9), .03, .006) for a in np.linspace(0, 2 * PI, 7)[:-1]], zcan(G + V(0, 0, .75), .12, .04, .02), k=.01)
    fig.add('chingun', 'arms', 'gunm', gun, 800, voxel=.006, uv=('side',), sharp=40)
    fig.point('muzzle', G + V(0, 0, .95), 'arms')
    fig.add('beacons', 'body', 'red', S.union(S.sphere((0, 2.65, -3.4), .06), S.sphere(C + V(0, .9, -.4), .06)), 60, voxel=.01)
    return fig


# ================================================================ Surveyor
def surveyor():
    """A survey balloon with a gondola: a patched gas bag, a gondola full of instruments, a searchlight that sees what hides, a pair of
    pusher props, and a stake gun slung underneath."""
    fig = B.Figure('surveyor', lo=(-2.2, -.1, -3.2), hi=(2.2, 4.4, 3.0), coarse=.04, detail=1.6, paint=1536, brush=1.8)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, .95, 1.0), 'body')                 # the searchlight turns and tips
    fig.group('arms', (0, .6, -.2), 'body')                  # the stake gun
    fig.group('rotorL', (-1.1, 1.3, -1.0), 'body')
    fig.group('rotorR', (1.1, 1.3, -1.0), 'body')
    B_ = V(0, 3.0, 0)
    bag = S.union(S.ellipsoid(B_, (1.3, 1.1, 2.6)), S.ellipsoid(B_ + V(0, 0, -2.2), (.5, .5, .6)), k=.5)
    bag = S.bump(bag, lambda p: .03 * np.abs(np.sin(np.arctan2(p[..., 0], p[..., 1] - B_[1]) * 6)) ** .5 - .02)        # the gores between seams
    bag = S.bump(bag, lambda p: (S.noise(p, 2.5, 1.7) - .5) * .05)
    fig.add('gasbag', 'body', 'fabT', bag, 2400, voxel=.016, uv=('cyl', B_), sharp=50,
            detail=S.fine(*[S.raised(S.box(B_ + V(x, y, z), (.25, .2, .3), .05), .01) for x, y, z in ((.9, .5, .6), (-.7, .6, -.9), (.3, .95, -.3))]),
            marks=[(S.band(B_, (0, 0, 1), .25), (.85, .2, .12)), (S.inside(S.box(B_ + V(1.3, 0, 0), (.3, .35, .8))), (.95, .9, .8))])
    fins = S.union(*[S.box(B_ + V(0, 0, -2.6) + rot(0, 0, a) @ V(0, .65, 0), (.03, .35, .35), .03, rot(0, 0, a)) for a in (0, PI / 2, PI, -PI / 2)])
    fig.add('fins', 'body', 'pY', fins, 400, voxel=.012, uv=('side',), marks=[stripes(B_ + V(0, 0, -2.6), (0, 1, 1), .2)])
    rig = S.union(*[S.rcone(V(sx * .55, 1.3, z), B_ + V(sx * 1.0, -.6, z * 1.4), .015) for sx in (-1, 1) for z in (-.8, .8)])
    fig.add('rigging', 'body', 'leaB', rig, 200, voxel=.006)
    G = V(0, .95, 0)
    gon = S.cut(S.box(G, (.6, .35, 1.0), .08), S.box(G + V(0, .38, 0), (.52, .2, .9), .02))
    gon = S.cut(gon, *[S.box(G + V(sx * .6, .1, z), (.05, .12, .2), .03) for sx in (-1, 1) for z in (-.4, .3)])
    fig.add('gondola', 'body', 'pY', dents(gon, 7.7, .015, 4), 1000, voxel=.01, uv=('box',), sharp=40,
            detail=S.fine(rivets([G + V(sx * .6, .3, z) for sx in (-1, 1) for z in np.linspace(-.9, .9, 7)], .02, .01)),
            marks=[stripes(G + V(0, -.25, 0), (0, .3, 1), .25, lambda p: p[..., 1] < G[1] - .15)])
    fig.add('gondolaroof', 'body', 'bD', S.box(G + V(0, .62, 0), (.66, .04, 1.05), .02), 200, voxel=.01, uv=('top',))
    fig.add('posts', 'body', 'gunm', S.union(*[S.rcone(G + V(sx * .58, .33, z), G + V(sx * .58, .62, z), .025) for sx in (-1, 1) for z in (-.95, .95)]), 200, voxel=.008)
    fig.add('surveyorman', 'body', 'hard', S.union(S.sphere(G + V(.2, .55, .3), .12), S.ellipsoid(G + V(.2, .35, .3), (.18, .15, .13)), k=.04), 200, voxel=.008)
    mast = S.union(S.rcone(G + V(-.3, .4, -.5), G + V(-.3, 1.3, -.5), .03), S.box(G + V(-.3, 1.3, -.5), (.25, .015, .015)), k=.01)
    fig.add('surveymast', 'body', 'nS', mast, 200, voxel=.006)
    fig.add('pennant', 'body', 'fabR', S.box(G + V(-.3, 1.2, -.68), (.01, .06, .15), .01), 40, voxel=.006)
    # the searchlight: a big drum with a lit face on a yoke at the bow
    L = V(0, .95, 1.0)
    lamp = S.union(zcan(L + V(0, .1, .25), .3, .2, .05), S.torus(L + V(0, .1, .45), .3, .04, rot(PI / 2, 0, 0)), xcan(L + V(0, .1, .2), .06, .36, .02), k=.02)
    fig.add('lamp', 'head', 'bS', lamp, 600, voxel=.008, uv=('front',), sharp=40)
    fig.add('lampface', 'head', 'visG', S.both(S.sphere(L + V(0, .1, .3), .3), zcan(L + V(0, .1, .48), .26, .03, 0)), 120, voxel=.008, glow=1.0)
    fig.point('light', L + V(0, .1, .5), 'head')
    # pusher props on outriggers
    for sx, g in ((-1, 'rotorL'), (1, 'rotorR')):
        P = V(sx * 1.1, 1.3, -1.0)
        fig.add('outrigger' + g[-1], 'body', 'gunm', S.union(S.rcone(G + V(sx * .55, .2, -.6), P + V(0, 0, .2), .04), zcan(P + V(0, 0, .25), .12, .2, .04), k=.02), 300, voxel=.008)
        fig.add('prop' + g[-1], g, 'gunB', blades(P, 3, .45, .06, rot(PI / 2, 0, 0), .4, .06), 300, voxel=.006)
    # the stake gun underneath
    SG = V(0, .55, -.2)
    sg = S.union(S.box(SG, (.12, .1, .3), .03), S.cyl(SG + V(0, 0, .2), SG + V(0, 0, .8), .05, .01), S.box(SG + V(0, -.12, -.15), (.18, .06, .1), .03), k=.02)
    fig.add('stakegun', 'arms', 'gunm', sg, 400, voxel=.006, uv=('side',))
    fig.add('stakes', 'arms', 'wood', S.union(*[S.rcone(SG + V(x, .12, -.25), SG + V(x, .12, .35), .025, .01) for x in (-.06, 0, .06)]), 200, voxel=.006)
    fig.point('muzzle', SG + V(0, 0, .85), 'arms')
    return fig


# ================================================================ Claim Barge
def claimbarge():
    """An ore barge that flies: a long steel hull riveted from plate, four lift fans in its gunwales, a wheelhouse at the stern, and
    the Foreclosure gun along the keel, a barrel as long as the hull that the bailiffs fire on a building after a three second charge."""
    fig = B.Figure('claimbarge', lo=(-3.6, -.2, -6.6), hi=(3.6, 5.2, 7.4), coarse=.06, detail=1.8, paint=1536, brush=2.8, unit=2.0)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, 2.6, -3.6), 'body')                # the wheelhouse
    fig.group('arms', (0, .9, 1.0), 'body')                  # the Foreclosure gun lifts a little
    FN = [(-2.4, 2.0, 3.2), (2.4, 2.0, 3.2), (-2.4, 2.0, -2.6), (2.4, 2.0, -2.6)]
    for i, c in enumerate(FN):
        fig.group('rotor%d' % i, c, 'body')
    C = V(0, 1.9, .2)
    hull = S.box(C, (2.4, .8, 5.6), .3)
    hull = S.cut(hull, S.plane(C + V(0, -.2, 5.0), (0, -.6, -1)), S.plane(C + V(0, -.4, -5.2), (0, -.5, 1)))
    hull = S.cut(hull, *[S.plane(V(sx * 2.4, 0, 2.5), (-sx, 0, -.6)) for sx in (-1, 1)])                  # a blunt prow, so it reads as a ship from above
    hull = S.cut(hull, S.box(C + V(0, .75, 0), (2.1, .3, 5.0), .1))                           # an open hold
    for (x, y, z) in FN:
        hull = S.cut(hull, ycan((x * .98, 2.0, z), .95, 1.2, 0))
        hull = S.union(hull, S.cut(ycan((x * .98, 2.0, z), 1.08, .8, .1), ycan((x * .98, 2.0, z), .95, 1.2, 0)), k=.05)
    for z in np.linspace(-4.5, 4.5, 7):
        hull = S.groove(hull, [C + V(-2.5, -.8, z), C + V(-2.5, .8, z)], .02, .02)
        hull = S.groove(hull, [C + V(2.5, -.8, z), C + V(2.5, .8, z)], .02, .02)
    hull = dents(hull, 1.4, .03, 1.4)
    fig.add('hull', 'body', 'pY', hull, 4000, voxel=.02, uv=('box',), sharp=40,
            detail=S.fine(rivets([C + V(sx * 2.42, y, z) for sx in (-1, 1) for y in (-.6, .65) for z in np.linspace(-5, 5, 21)], .04, .015)),
            marks=[stripes(C + V(0, -.55, 0), (0, .4, 1), .6, lambda p: p[..., 1] < 1.5), (S.inside(S.box(C + V(0, .2, 0), (2.6, .25, 1.2))), (.1, .09, .08))])
    fig.add('keel', 'body', 'gunm', S.box(C + V(0, -.85, 0), (1.6, .12, 4.6), .08), 500, voxel=.02, uv=('box',))
    # the hold: a tarp roped down over most of the load, two heaps of ore showing at the ends (the ore glows, so it is kept small)
    tarp = S.bump(S.box(C + V(0, .5, .3), (2.0, .22, 2.6), .35), lambda p: .06 * np.sin(p[..., 2] * 2.2) + (S.noise(p, 3.0, 2.2) - .5) * .12)
    fig.add('tarp', 'body', 'fabT', tarp, 1200, voxel=.025, uv=('top',), marks=[(S.band(C + V(0, 0, .3), (0, 0, 1), 1.2), (.1, .09, .08))])
    fig.add('ropes', 'body', 'leaB', S.union(*[S.box(C + V(0, .74, z), (2.05, .035, .035), .02) for z in (-1.6, -.4, .9, 2.1)]), 300, voxel=.015, uv=('top',))
    fig.add('ore', 'body', 'ore', S.union(*[S.bump(S.ellipsoid(C + V(x, .5, z), (.7, .45, .6)), lambda p: (S.noise(p, 4.0, 5.1) - .5) * .3) for x, z in ((-.9, 3.4), (1.0, -2.8))]), 500, voxel=.025, uv=('top',))
    for i, (x, y, z) in enumerate(FN):
        c = V(x * .98, 2.2, z)
        fig.add('fan%d' % i, 'rotor%d' % i, 'gunB', blades(c, 7, .85, .12, None, .5, .2), 500, voxel=.012, uv=('top',))
        fig.add('fanguard%d' % i, 'body', 'nS', S.both(S.union(*[S.box(c + V(0, .55, 0), (.95, .02, .03), 0, rot(0, a, 0)) for a in np.linspace(0, PI, 5)[:-1]]), ycan(c + V(0, .55, 0), .95, .05, 0)), 300, voxel=.01)
    # the wheelhouse at the stern: a tall cab with a band of glass, a funnel and a company flag
    W = V(0, 3.4, -3.6)
    wh = S.cut(S.box(W, (1.1, .85, .9), .12), S.plane(W + V(0, .5, .9), (0, -.6, -1)))
    fig.add('wheelhouse', 'head', 'pY', dents(wh, 3.3, .02, 3), 1000, voxel=.015, uv=('box',), sharp=40, marks=[(S.inside(S.box(W + V(0, -.45, 0), (1.2, .15, 1.0))), (.1, .09, .08))])
    fig.add('bridgeglass', 'head', 'visG', S.box(W + V(0, .25, 0), (1.12, .16, .92), .05), 300, voxel=.012, uv=('box',), glow=.35)
    fig.add('funnel', 'head', 'rust', S.union(ycan(W + V(.55, 1.3, -.4), .25, .5, .05), S.torus(W + V(.55, 1.78, -.4), .25, .05), k=.03), 400, voxel=.012)
    fig.add('flagpole', 'head', 'nS', S.rcone(W + V(-.7, .8, -.6), W + V(-.7, 2.2, -.6), .03), 60, voxel=.01)
    fig.add('flag', 'head', 'fabR', S.bump(S.box(W + V(-.7, 1.95, -.95), (.01, .22, .35), .01), lambda p: .03 * np.sin(p[..., 2] * 9)), 100, voxel=.01, marks=[(S.inside(S.sphere(W + V(-.7, 1.95, -.95), .12)), (.95, .78, .2))])
    # the Foreclosure gun: a long barrel along the keel in cradle bands, a charging coil at the breech that glows as it charges
    GA, GB = V(0, .85, -2.0), V(0, .85, 6.9)
    brl = S.union(S.cyl(GA, GB, .36, .05), zcan(GB - V(0, 0, .3), .5, .35, .06), k=.08)
    brl = S.cut(brl, S.cyl(GB - V(0, 0, 1.2), GB + V(0, 0, .5), .22))
    for z in (0, 1.5, 3.0, 4.5):
        brl = S.union(brl, zcan(V(0, .85, z), .44, .1, .03), k=.02)
    fig.add('foreclosure', 'arms', 'gunB', brl, 1500, voxel=.015, uv=('side',), sharp=40, marks=[(S.band(V(0, .85, 6.2), (0, 0, 1), .15), (.95, .72, .12))])
    coil = S.union(*[S.torus(V(0, .85, z), .5, .06, rot(PI / 2, 0, 0)) for z in np.linspace(-1.8, -.6, 6)])
    fig.add('chargecoil', 'arms', 'cyan', coil, 600, voxel=.012, glow=.5)
    fig.add('cradle', 'body', 'gunm', S.union(*[S.box(V(0, 1.15, z), (.6, .35, .15), .05) for z in (-1.2, 2.2)]), 300, voxel=.015, uv=('box',))
    fig.point('muzzle', GB + V(0, 0, .2), 'arms')
    # bailiffs' walkway rails and a few lamps
    fig.add('rails', 'body', 'nS', S.union(*[S.rcone(V(sx * 2.4, 2.95, -4.5), V(sx * 2.4, 2.95, 4.6), .035) for sx in (-1, 1)], *[S.rcone(V(sx * 2.4, 2.7, z), V(sx * 2.4, 2.95, z), .03) for sx in (-1, 1) for z in np.linspace(-4.5, 4.5, 8)]), 600, voxel=.01)
    fig.add('lamps', 'body', 'red', S.union(*[S.sphere(V(sx * 2.45, 3.0, z), .08) for sx in (-1, 1) for z in (-4.5, 4.6)]), 80, voxel=.012)
    return fig


MAKERS = {'hopper': hopper, 'flakkite': flakkite, 'gadfly': gadfly, 'surveyor': surveyor, 'claimbarge': claimbarge}


def main():
    args = sys.argv[1:]
    kind = args[0]
    png = next((a for a in args[1:] if a.endswith('.png')), None)
    only = [a for a in args[1:] if not a.endswith('.png')]
    fig = MAKERS[kind]()
    if only:
        fig.parts = [p for p in fig.parts if any(p.name.startswith(o) or p.group == o for o in only)]
    here = __file__.rsplit('/', 1)[0]
    fig.build(here + '/../assets/mesh/' + kind + '.bin' if not only else '/tmp/' + kind + '-part.bin', here + '/out/' + kind + '.blend' if not only else None)


if __name__ == '__main__':
    main()
