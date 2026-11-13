"""Ironhold's new machines: the Haul Drone, the Dustbike and the Pile Driver (stream E of the full-depth build).

Same rules as the Gantry: nothing here was built for war. The drone is a hired lifting rig, the bike is a yard runabout with a burner on
the bars, the Pile Driver is a post driver from the claim fences with a gun where the hammer was.
Run:  python rigs.py hauldrone|dustbike|piledriver [preview.png] [part or group ...]
"""
import os
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, human as Hu
from kit.sdf import V, rot

PI = np.pi


def xcan(c, r, half, rnd=.02):
    c = V(c)
    return S.cyl(c - V(half, 0, 0), c + V(half, 0, 0), r, rnd)


def zcan(c, r, half, rnd=.02):
    c = V(c)
    return S.cyl(c - V(0, 0, half), c + V(0, 0, half), r, rnd)


def ycan(c, r, half, rnd=.02):
    c = V(c)
    return S.cyl(c - V(0, half, 0), c + V(0, half, 0), r, rnd)


def dents(f, seed, amp=.01, freq=4.0):
    """Knocks and shallow dishes in sheet steel."""
    return S.bump(f, lambda p: -amp * np.clip(1 - np.abs(S.noise(p, freq, seed) - .5) * 5, 0, 1))


def bolts(pts, r):
    return S.union(*[S.sphere(q, r) for q in pts])


def rivets(pts, r=.012, h=.006):
    return S.studs([V(q) for q in pts], r, h)


# ================================================================ Haul Drone
def hauldrone():
    """A hired lifting rig the Survey Rig calls down: four ducted fans round a squat yellow tub, a drill boom under the nose, a bin
    at the back, and a big lease clock on top that counts down the 64 seconds the yard is paying for."""
    fig = B.Figure('hauldrone', lo=(-1.1, -.1, -1.0), hi=(1.1, 1.8, 1.2), coarse=.025, detail=.9, paint=1024, brush=1.3)
    fig.group('body', (0, 0, 0))
    fig.group('head', (0, 1.05, .52), 'body')
    fig.group('arms', (0, .86, .42), 'body')                 # the drill boom swings down from here
    fig.group('pack', (0, .9, -.5), 'body')                  # the load of ore in the bin: shown while it carries
    DU = [(-.68, 1.2, .46), (.68, 1.2, .46), (-.68, 1.2, -.46), (.68, 1.2, -.46)]
    for i, c in enumerate(DU):
        fig.group('rotor%d' % i, c, 'body')
    HC = V(0, 1.08, 0)
    hull = S.box(HC, (.4, .24, .5), .12)
    hull = S.union(hull, S.ellipsoid(HC + V(0, .2, -.02), (.36, .14, .44)), k=.06)                          # the crowned lid
    hull = S.cut(hull, S.box(HC + V(0, -.28, 0), (.5, .06, .6)))                                            # flat underneath
    hull = S.groove(hull, [HC + V(-.45, .05, .52), HC + V(.45, .05, .52)], .008, .01)                       # where the lid sits on the tub
    hull = S.groove(hull, [HC + V(-.45, .05, -.52), HC + V(.45, .05, -.52)], .008, .01)
    hull = dents(hull, 2.2, .012, 4)
    rv = [HC + V(x, .06, .5) for x in np.linspace(-.3, .3, 6)] + [HC + V(.4, .06, z) for z in np.linspace(-.38, .38, 6)] + [HC + V(-.4, .06, z) for z in np.linspace(-.38, .38, 6)]
    fig.add('tub', 'body', 'pY', hull, 1800, voxel=.008, uv=('box',), sharp=40,
            detail=S.fine(rivets(rv, .014, .006), S.slit(HC + V(0, -.1, 0), (0, 1, 0), .005, .005), S.outline(S.box(HC + V(.41, -.06, 0), (.1, .1, .22), .03), .005, .005)),
            marks=[(S.chevrons(HC + V(0, -.16, 0), (1, 0, .6), .12, lambda p: (p[..., 1] < HC[1] - .1)), (.1, .09, .08)),
                   (S.inside(S.box(HC + V(0, .1, .48), (.16, .05, .1))), (.1, .09, .08))])
    # the lease clock on the lid: a fat dial in a steel bezel, its face painted with the 64 marks of a paid minute
    CC = HC + V(0, .345, -.08)
    bez = S.union(ycan(CC, .2, .035, .02), S.torus(CC + V(0, .03, 0), .19, .022), k=.01)
    fig.add('clockbezel', 'body', 'bS', bez, 500, voxel=.005, uv=('top',), sharp=40)
    ticks = lambda p: np.clip(1 - np.abs(((np.arctan2(p[..., 0] - CC[0], p[..., 2] - CC[2]) / (2 * PI)) * 16) % 1 - .5) * 10, 0, 1) * np.clip((np.hypot(p[..., 0] - CC[0], p[..., 2] - CC[2]) - .1) * 30, 0, 1)
    face = ycan(CC + V(0, .02, 0), .165, .025, .006)
    fig.add('clockface', 'body', 'nW', face, 200, voxel=.004, uv=('top',), marks=[(ticks, (.1, .09, .08)), (S.inside(S.box(CC + V(0, .04, .07), (.012, .1, .07), 0, rot(0, .6, 0))), (.85, .15, .1))])
    fig.add('clockhand', 'body', 'red', S.box(CC + V(.03, .05, .05), (.012, .008, .07), .004, rot(0, .55, 0)), 40, voxel=.003, glow=.5)
    # the ducts, each on two struts, with a guard grille
    ducts, struts, grills, motors = [], [], [], []
    for (x, y, z) in DU:
        c = V(x, y, z)
        ducts.append(S.union(S.torus(c, .3, .055, squash=1.6), S.torus(c + V(0, -.06, 0), .31, .035), k=.03))
        for dz in (-.12, .12):
            a = c + V(-np.sign(x) * .26, -.02, dz)
            struts.append(S.rcone(a, HC + V(np.sign(x) * .36, .05 + (y - 1.2), z * .82 + dz), .03, .036))
        grills.append(S.both(S.union(*[S.box(c + V(0, .08, 0), (.3, .006, .012), 0, rot(0, a, 0)) for a in (0, PI / 3, 2 * PI / 3)]), S.cyl(c, c + V(0, .2, 0), .3)))
        motors.append(S.union(ycan(c + V(0, -.02, 0), .08, .07, .02), ycan(c + V(0, -.1, 0), .05, .03, .01), k=.01))
    duct = dents(S.union(*ducts), 7.1, .01, 5)
    fig.add('ducts', 'body', 'bD', duct, 1600, voxel=.007, uv=('top',), sharp=40, marks=[(S.chevrons(V(0, 1.2, 0), (1, 0, 1), .09, lambda p: (p[..., 1] > 1.22)), (.95, .7, .1))])
    fig.add('struts', 'body', 'gunm', S.union(*struts), 500, voxel=.006, uv=('side',), sharp=45)
    fig.add('grilles', 'body', 'nS', S.union(*grills), 400, voxel=.004, uv=('top',), sharp=45)
    fig.add('motors', 'body', 'gunm', S.union(*motors), 400, voxel=.005, uv=('side',), sharp=40)
    for i, (x, y, z) in enumerate(DU):
        c = V(x, y, z)
        bl = S.union(*[S.box(c + rot(0, a, 0) @ V(0, .03, .14), (.04, .008, .13), .006, rot(0, a, 0) @ rot(0, 0, .3)) for a in (0, 2 * PI / 3, 4 * PI / 3)])
        bl = S.union(bl, ycan(c + V(0, .03, 0), .045, .02, .01), k=.008)
        fig.add('blades%d' % i, 'rotor%d' % i, 'gunB', bl, 220, voxel=.003, uv=('top',), sharp=40)
    # the eye: a camera housing on a short neck under the nose, its lens lit
    E = V(0, 1.05, .6)
    eye = S.union(S.sphere(E, .12), zcan(E + V(0, 0, .1), .08, .05, .02), S.box(E + V(0, .1, -.06), (.1, .03, .08), .02), k=.02)
    fig.add('eye', 'head', 'pD', eye, 500, voxel=.004, uv=('front',), sharp=40)
    fig.add('lens', 'head', 'visG', S.both(S.sphere(E + V(0, 0, .12), .07), zcan(E + V(0, 0, .17), .06, .03, .0)), 120, voxel=.003, uv=('front',))
    fig.add('hood', 'head', 'bS', S.cut(S.both(S.sphere(E + V(0, .02, .08), .13), S.plane(E + V(0, .03, 0), (0, -1, 0))), S.sphere(E + V(0, .0, .08), .11)), 200, voxel=.004, uv=('front',))
    # the drill boom: an elbowed arm under the nose with a ram and a fluted bit
    A0, A1, A2 = V(0, .86, .42), V(0, .62, .62), V(0, .42, .9)
    boom = S.union(S.rcone(A0, A1, .065, .055), S.rcone(A1, A2, .055, .045), S.sphere(A1, .075), xcan(A0, .08, .09, .02), k=.02)
    fig.add('boom', 'arms', 'pY', dents(boom, 3.3, .008, 8), 600, voxel=.004, uv=('side',), sharp=40)
    fig.add('boomram', 'arms', 'nS', S.cyl(A0 + V(0, -.08, .02), A1 + V(0, -.05, .1), .022, .006), 120, voxel=.004, uv=('side',))
    ax = (A2 - A1) / np.linalg.norm(A2 - A1)
    bit = S.rcone(A2, A2 + ax * .32, .07, .006)
    bit = S.bump(bit, lambda p: .012 * np.sin(np.arctan2(p[..., 0], p[..., 1] - A2[1]) * 3 + np.dot(p - A2, ax) * 60))
    fig.add('bit', 'arms', 'drill', bit, 500, voxel=.003, uv=('side',), sharp=35)
    fig.add('chuck', 'arms', 'gunm', S.cyl(A2 - ax * .03, A2 + ax * .06, .08, .015), 180, voxel=.004, uv=('side',))
    fig.point('drill', A2 + ax * .3, 'arms')
    # the bin at the back and the ore riding in it
    BC = V(0, .9, -.62)
    bin_ = S.cut(S.box(BC, (.3, .16, .2), .04), S.box(BC + V(0, .1, 0), (.26, .2, .16), .02))
    bin_ = S.union(bin_, S.box(BC + V(0, .14, -.21), (.32, .03, .02), .01), k=.01)
    fig.add('bin', 'body', 'bS', dents(bin_, 5.5, .012, 6), 600, voxel=.005, uv=('box',), sharp=40, marks=[(S.band(BC + V(0, .04, 0), (0, 1, 0), .03), (.95, .7, .1))])
    lumps = S.union(*[S.sphere(BC + V(x, .1 + y, z), r) for x, y, z, r in ((-.14, .02, .04, .1), (.06, .05, -.02, .12), (.18, .0, .06, .08), (-.02, .0, .1, .09), (-.18, .0, -.08, .08))], k=.03)
    lumps = S.bump(lumps, lambda p: (S.noise(p, 14, 3.3) - .5) * .05)
    fig.add('load', 'pack', 'ore', lumps, 400, voxel=.006, uv=('top',))
    # skids to land on, and a red lamp on a whip
    SY = .56                                                     # it never lands in a fight: short skids, and the game holds it off the ground
    sk = S.union(*[S.union(S.rcone(V(sx * .36, SY, -.5), V(sx * .36, SY, .5), .03), S.rcone(V(sx * .36, SY, .5), V(sx * .36, SY + .1, .6), .03),
                           S.rcone(V(sx * .36, SY, .3), HC + V(sx * .3, -.26, .3), .025), S.rcone(V(sx * .36, SY, -.3), HC + V(sx * .3, -.26, -.3), .025), k=.02) for sx in (-1, 1)])
    fig.add('skids', 'body', 'gunm', sk, 500, voxel=.005, uv=('side',), sharp=45)
    whip = S.chain([HC + V(.3, .25, -.4), HC + V(.32, .55, -.44), HC + V(.33, .7, -.46)], [.012, .008, .006])
    fig.add('whip', 'body', 'rubber', whip, 80, voxel=.003)
    fig.add('beacon', 'body', 'red', S.union(ycan(HC + V(.33, .72, -.46), .035, .03, .01), S.sphere(HC + V(.33, .76, -.46), .03)), 60, voxel=.003)
    fig.add('beaconbase', 'body', 'gunm', ycan(HC + V(.3, .25, -.4), .04, .02, .01), 40, voxel=.004)
    # a tag wired to the side: who it is hired from
    fig.add('tag', 'body', 'nW', S.box(HC + V(-.43, -.05, .2), (.006, .07, .11), .01, rot(0, 0, .08)), 40, voxel=.003, uv=('side',),
            marks=[(S.band(HC + V(-.43, -.05, .2), (0, 1, 0), .012), (.1, .09, .08))])
    return fig


# ================================================================ Dustbike
def wheel(c, R_, r, wide, knobs=14, seed=1.0):
    """A knobbly tyre on a spoked hub, axle along x."""
    c = V(c)
    T = rot(0, 0, PI / 2)
    tyre = S.torus(c, R_, r, T, squash=wide / r)
    tyre = S.bump(tyre, lambda p: .022 * np.clip(np.sin(np.arctan2(p[..., 1] - c[1], p[..., 2] - c[2]) * knobs) * 3, 0, 1) * np.clip(np.abs(np.hypot(p[..., 1] - c[1], p[..., 2] - c[2]) - R_) * 0 + 1, 0, 1))
    tyre = S.bump(tyre, lambda p: (S.noise(p, 20, seed) - .5) * .01)
    hub = S.union(xcan(c, R_ - r * .55, wide * .5, .02), xcan(c, .07, wide * .9, .02), k=.02)
    hub = S.cut(hub, *[S.sphere(c + V(sx * wide * .55, np.sin(a) * (R_ - r) * .6, np.cos(a) * (R_ - r) * .6), (R_ - r) * .22) for a in np.linspace(0, 2 * PI, 6)[:-1] for sx in (-1, 1)])
    return tyre, hub


def dustbike():
    """A yard runabout with a fat back tyre, a fuel drum behind the seat and a burner bolted to the bars. One rider, crouched."""
    fig = B.Figure('dustbike', lo=(-.8, -.1, -1.3), hi=(.8, 1.9, 1.4), coarse=.025, detail=.9, paint=1024, brush=1.2)
    HIP = V(0, 1.0, -.22)
    fig.group('body', (0, 0, 0))
    fig.group('wheelR', (0, .4, -.72), 'body')
    fig.group('wheelF', (0, .36, .84), 'body')
    fig.group('arms', (0, 1.28, .42), 'body')               # the bars, the burner and the rider's arms turn together
    fig.group('head', (0, 1.52, .02), 'body')
    fig.group('legL', (-.13, HIP[1], HIP[2]))
    fig.group('legR', (.13, HIP[1], HIP[2]))
    # wheels
    tR, hR = wheel((0, .4, -.72), .3, .1, .16, 16, 1.0)
    fig.add('tyreR', 'wheelR', 'rubber', tR, 1100, voxel=.005, uv=('side',))
    fig.add('hubR', 'wheelR', 'bS', hR, 500, voxel=.004, uv=('side',), sharp=40)
    tF, hF = wheel((0, .36, .84), .27, .085, .1, 14, 2.0)
    fig.add('tyreF', 'wheelF', 'rubber', tF, 900, voxel=.005, uv=('side',))
    fig.add('hubF', 'wheelF', 'bS', hF, 400, voxel=.004, uv=('side',), sharp=40)
    # frame: a backbone tube, the forks, the swing arm
    fr = S.union(S.chain([V(0, 1.12, .55), V(0, 1.0, .1), V(0, .62, -.1), V(0, .55, -.35)], .045),
                 S.chain([V(0, 1.05, .2), V(0, 1.05, -.4), V(0, .62, -.1)], .035), k=.02)
    for sx in (-1, 1):
        fr = S.union(fr, S.rcone(V(sx * .1, .58, -.2), V(sx * .1, .4, -.72), .035), S.rcone(V(sx * .08, 1.18, .58), V(sx * .08, .36, .84), .035, .03), k=.02)
    fr = S.union(fr, S.rcone(V(0, 1.16, .56), V(0, 1.26, .52), .05), k=.02)                                  # the head tube
    fig.add('frame', 'body', 'gunm', fr, 1100, voxel=.004, uv=('side',), sharp=45)
    fig.add('shocks', 'body', 'nS', S.union(*[S.cyl(V(sx * .1, .95, -.32), V(sx * .1, .52, -.62), .03, .008) for sx in (-1, 1)]), 200, voxel=.004, uv=('side',))
    sp = S.union(*[S.chain([V(sx * .1, .95, -.32), V(sx * .1, .7, -.47), V(sx * .1, .52, -.62)], .018) for sx in (-1, 1)])
    fig.add('springs', 'body', 'pY', S.bump(sp, lambda p: .012 * np.sin(p[..., 1] * 90)), 300, voxel=.003)
    # the engine: a fat single cylinder with fins, an exhaust swept up the right side
    eng = S.union(S.box((0, .6, .12), (.14, .14, .16), .05), ycan((0, .82, .14), .1, .1, .02), k=.03)
    for i in range(5):
        eng = S.union(eng, ycan((0, .76 + i * .04, .14), .13, .007, .004))
    fig.add('engine', 'body', 'bS', dents(eng, 4.4, .006, 9), 900, voxel=.0035, uv=('side',), sharp=40)
    fig.add('enginecase', 'body', 'gunm', S.union(xcan((0, .55, -.05), .12, .16, .03), S.box((0, .5, .1), (.12, .06, .12), .03), k=.02), 400, voxel=.004, uv=('side',), sharp=40)
    ex = S.chain([V(.05, .78, .26), V(.18, .66, .3), V(.2, .5, .1), V(.2, .62, -.4), V(.2, .9, -.8)], .04)
    fig.add('exhaust', 'body', 'bD', ex, 400, voxel=.0035, uv=('side',))
    fig.add('muffler', 'body', 'rust', S.union(S.rcone(V(.21, .76, -.6), V(.21, .92, -.88), .07, .06), S.cyl(V(.21, .91, -.86), V(.21, .96, -.95), .045, .01), k=.01), 300, voxel=.004, uv=('side',))
    # tank, seat, fenders, number board
    tank = S.union(S.ellipsoid((0, 1.15, .28), (.17, .12, .26)), S.ellipsoid((0, 1.1, .12), (.15, .1, .16)), k=.05)
    tank = S.cut(tank, S.below(1.02))
    fig.add('tank', 'body', 'tank', dents(tank, 6.6, .008, 7), 700, voxel=.0035, uv=('side',), marks=[(S.band((0, 1.15, .28), (1, 0, 0), .025), (.95, .78, .2))])
    fig.add('fillcap', 'body', 'nS', ycan((0, 1.27, .33), .035, .015, .006), 60, voxel=.003)
    seat = S.cut(S.union(S.box((0, 1.06, -.3), (.14, .05, .3), .05), S.ellipsoid((0, 1.08, -.18), (.15, .06, .16)), k=.03), S.below(1.0))
    fig.add('seat', 'body', 'lea', S.bump(seat, lambda p: .004 * np.abs(np.sin(p[..., 2] * 60))), 500, voxel=.0035, uv=('top',))
    fendR = S.both(S.cut(S.torus((0, .4, -.72), .36, .05, rot(0, 0, PI / 2), squash=2.3), S.below(.5)), S.plane((0, 0, -.5), (0, 0, 1)))
    fendF = S.both(S.cut(S.torus((0, .36, .84), .33, .04, rot(0, 0, PI / 2), squash=2.0), S.below(.46)), S.plane((0, 0, 1.15), (0, 0, 1)))
    fig.add('fenders', 'body', 'pY', dents(S.union(fendR, fendF), 3.9, .008, 8), 700, voxel=.004, uv=('side',), sharp=40,
            marks=[(S.chevrons((0, .7, 0), (0, .3, 1), .09, lambda p: p[..., 2] < -.5), (.1, .09, .08))])
    nb = S.box((0, 1.12, .66), (.15, .12, .015), .03, rot(-.35, 0, 0))
    fig.add('numberboard', 'body', 'nW', nb, 160, voxel=.003, uv=('front',), marks=[(S.inside(S.box((0, 1.12, .7), (.05, .07, .05), 0, rot(-.35, 0, 0))), (.1, .09, .08))])
    fig.add('headlamp', 'body', 'gunm', zcan((0, 1.0, .72), .07, .05, .02), 160, voxel=.003, uv=('front',))
    fig.add('lampglass', 'body', 'visG', S.both(S.sphere((0, 1.0, .75), .06), zcan((0, 1.0, .78), .055, .02, 0)), 60, voxel=.003, uv=('front',))
    # the fuel drum behind the seat that feeds the burner, strapped on
    D = V(0, 1.2, -.66)
    drum = S.union(ycan(D, .14, .16, .03), *[S.torus(D + V(0, y, 0), .142, .012) for y in (-.06, .06)], k=.01)
    fig.add('fueldrum', 'body', 'tank', dents(drum, 9.1, .008, 7), 500, voxel=.0035, uv=('cyl', D), marks=[(S.band(D, (0, 1, 0), .03), (.95, .78, .2))])
    fig.add('drumstrap', 'body', 'leaB', S.torus(D, .15, .012, rot(PI / 2, 0, 0), squash=1.5), 120, voxel=.003)
    fig.add('rack', 'body', 'gunm', S.union(S.chain([V(-.15, 1.05, -.45), V(-.15, 1.04, -.84), V(.15, 1.04, -.84), V(.15, 1.05, -.45)], .016), S.box(D + V(0, -.17, 0), (.15, .01, .15), .005), k=.005), 200, voxel=.003)
    hose = S.chain([D + V(.1, .12, .08), V(.18, 1.3, -.4), V(.22, 1.2, .05), V(.2, 1.22, .38)], .018)
    fig.add('fuelhose', 'body', 'rib', S.bump(hose, lambda p: .003 * np.sin(p[..., 2] * 160)), 200, voxel=.003)
    # the bars and the burner: a nozzle on a bracket off the right bar, a pilot flame at its lip
    bars = S.chain([V(-.34, 1.36, .4), V(-.2, 1.3, .48), V(.2, 1.3, .48), V(.34, 1.36, .4)], .02)
    bars = S.union(bars, S.rcone(V(0, 1.24, .52), V(0, 1.31, .48), .03), k=.01)
    fig.add('bars', 'arms', 'bS', bars, 300, voxel=.003, uv=('side',))
    fig.add('grips', 'arms', 'rubber', S.union(*[S.rcone(V(sx * .3, 1.345, .42), V(sx * .4, 1.37, .37), .026) for sx in (-1, 1)]), 120, voxel=.003)
    N0, N1 = V(.16, 1.2, .5), V(.16, 1.13, 1.08)
    noz = S.union(S.rcone(N0, N1, .045, .035), S.cyl(N1 - V(0, -.01, .1), N1 + V(0, .006, .04), .06, .01), S.box(N0 + V(-.06, .06, .0), (.06, .02, .04), .01), k=.012)
    for t in (.3, .5, .7):
        noz = S.union(noz, S.torus(N0 + (N1 - N0) * t, .05, .01, S.basis((0, 1, 0), N1 - N0)))
    fig.add('burner', 'arms', 'bD', noz, 500, voxel=.003, uv=('side',), sharp=40)
    fig.add('burnertip', 'arms', 'rust', S.cut(S.cyl(N1 + V(0, 0, .02), N1 + V(0, .01, .08), .065, .01), S.cyl(N1, N1 + V(0, .02, .12), .04)), 160, voxel=.003, uv=('side',))
    fig.add('pilot', 'arms', 'fire', S.ellipsoid(N1 + V(0, -.05, .08), (.022, .03, .04)), 50, voxel=.003, glow=.8)
    fig.point('muzzle', N1 + V(0, 0, .1), 'arms')
    # the rider: crouched over the tank in a leather jacket, goggles down, a scarf over the mouth
    torso = S.union(S.ellipsoid((0, 1.3, -.02), (.19, .2, .14), rot(.55, 0, 0)), S.ellipsoid((0, 1.12, -.16), (.17, .13, .12)), k=.08)
    torso = S.union(torso, S.rcone((-.2, 1.43, .04), (.2, 1.43, .04), .075), k=.05)
    Tl = S.Limb((0, 1.05, -.2), (0, 1.5, .1))
    torso = S.bump(torso, Tl.folds([(.3, .3, 1.4, .01, .08, .2), (.45, -1.2, 1.4, .01, .08, -.2), (.6, 2.4, 1.6, .012, .08, .2), (.25, 3.1, 1.2, .01, .07, -.1)]))
    fig.add('jacket', 'body', 'lea', torso, 1400, voxel=.0035, uv=('cyl', V(0, 1.25, 0)),
            detail=S.fine(S.slit((0, 1.3, 0), (1, 0, .0), .004, .004), S.stitch((0, 1.2, 0), (0, 1, .5), .016, .004, .003, along=(1, 0, 0))),
            marks=[(S.inside(S.ellipsoid((0, 1.32, -.16), (.11, .08, .1))), (.95, .7, .12))])
    fig.add('belt', 'body', 'leaB', S.both(S.cut(S.grow(torso, .02), S.grow(torso, .002)), S.slab((0, 1.06, 0), (0, 1, -.3), .03)), 260, voxel=.003, uv=('cyl', V(0, 1.06, 0)))
    pads = S.union(*[S.bump(S.ellipsoid((sx * .2, 1.48, .05), (.09, .06, .1), rot(0, 0, -sx * .4)), lambda p: .006 * np.abs(np.sin(p[..., 2] * 50))) for sx in (-1, 1)])
    fig.add('shoulderpads', 'body', 'pY', pads, 500, voxel=.003, uv=('top',))
    HC = V(0, 1.62, .1)
    hel = S.cut(S.union(S.ellipsoid(HC + V(0, .03, -.01), (.15, .15, .165)), S.box(HC + V(0, .02, .16), (.13, .04, .04), .03), k=.03), S.below(HC[1] - .06))
    fig.add('helmet', 'head', 'hard', dents(hel, 1.9, .005, 10), 900, voxel=.003, uv=('cyl', HC), marks=[(S.band(HC, (1, 0, 0), .025), (.1, .09, .08))])
    face = S.union(S.ellipsoid(HC + V(0, -.08, .02), (.11, .12, .12)), S.rcone(HC + V(0, -.2, -.02), HC + V(0, -.08, .0), .06), k=.03)
    fig.add('head', 'head', 'skinF', face, 400, voxel=.003, uv=('cyl', HC))
    scarf = S.union(S.torus(HC + V(0, -.15, .01), .1, .04, squash=1.1), S.ellipsoid(HC + V(0, -.1, .1), (.1, .06, .05)), k=.03)
    scarf = S.union(scarf, S.chain([HC + V(-.05, -.15, -.1), HC + V(-.12, -.12, -.3), HC + V(-.1, -.06, -.5)], [.04, .035, .015]), k=.02)        # the tail streams back
    fig.add('scarf', 'head', 'fabR', S.bump(scarf, lambda p: .007 * np.sin(p[..., 2] * 60 + p[..., 0] * 30)), 700, voxel=.003, uv=('cyl', HC))
    gg, gl = [], []
    for sx in (-1, 1):
        c = HC + V(sx * .05, -.03, .12)
        gg += [zcan(c + V(0, 0, .02), .045, .03, .008), S.torus(c + V(0, 0, .05), .042, .009, rot(PI / 2, 0, 0))]
        gl.append(S.both(S.sphere(c + V(0, 0, .03), .045), zcan(c + V(0, 0, .055), .036, .01, 0)))
    fig.add('goggles', 'head', 'gunB', S.union(*gg, S.both(S.cut(S.grow(hel, .012), S.grow(hel, .0)), S.slab(HC + V(0, -.03, 0), (0, 1, 0), .016)), k=.006), 500, voxel=.0025, uv=('front',), sharp=45)
    fig.add('goggleglass', 'head', 'lens', S.union(*gl), 120, voxel=.0025, uv=('front',))
    # arms out to the grips
    for sx in (-1, 1):
        Sh, El, Wr = V(sx * .22, 1.42, .04), V(sx * .3, 1.28, .22), V(sx * .33, 1.35, .38)
        arm = S.union(S.rcone(Sh, El, .07, .06), S.rcone(El, Wr, .058, .048), k=.02)
        Al = S.Limb(Sh, Wr)
        arm = S.bump(arm, Al.folds([(.35, 0, 1.4, .008, .08, .2), (.55, 2, 1.4, .008, .08, -.2), (.75, -1.5, 1.3, .007, .07, .15)]))
        fig.add('sleeve' + ('R' if sx > 0 else 'L'), 'arms', 'lea', arm, 600, voxel=.0032, uv=('side',))
        fig.add('glove' + ('R' if sx > 0 else 'L'), 'arms', 'glove', S.union(S.sphere(V(sx * .35, 1.36, .41), .05), S.rcone(Wr, V(sx * .35, 1.36, .41), .052, .045), S.ellipsoid(V(sx * .345, 1.38, .37), (.06, .04, .05)), k=.02), 300, voxel=.003, uv=('side',))
    # legs bent onto the pegs
    for sx, g in ((1, 'legR'), (-1, 'legL')):
        hip, knee, ank = V(sx * .13, HIP[1], HIP[2]), V(sx * .22, 1.02, .2), V(sx * .2, .55, .02)
        lg = S.union(S.sphere(hip, .1), S.rcone(hip, knee, .095, .08), S.rcone(knee, ank, .08, .068), k=.04)
        Ll = S.Limb(hip, knee)
        lg = S.bump(lg, Ll.folds([(.4, 0, 1.4, .009, .07, .2), (.8, 2.5, 1.5, .01, .07, -.2), (.95, .5, 1.6, .011, .06, .1)]))
        fig.add('trouser' + g[-1], g, 'fabT', lg, 800, voxel=.0032, uv=('side',))
        fig.add('kneepad' + g[-1], g, 'pY', S.both(S.ellipsoid(knee + V(0, .02, .04), (.08, .09, .07)), S.plane(knee, (0, -.3, -1))), 200, voxel=.003, uv=('front',))
        boot = S.union(S.rcone(ank + V(0, .1, 0), ank + V(0, -.08, .0), .08, .075), S.ellipsoid(ank + V(0, -.1, .1), (.075, .06, .14)), k=.03)
        fig.add('boot' + g[-1], g, 'leaN', boot, 500, voxel=.003, uv=('side',))
        fig.add('peg' + g[-1], 'body', 'gunm', S.rcone(V(sx * .05, .45, .02), V(sx * .27, .45, .02), .02), 60, voxel=.003)
    return fig


# ================================================================ Pile Driver
def piledriver():
    """A claim-fence post driver on tracks, its hammer frame now carrying a gun. Anchored, it drops four stakes into the ground and the
    drop weight behind the breech rides the recoil. Sculpted anchored (stakes down, barrel up); the game folds the stakes for the road."""
    fig = B.Figure('piledriver', lo=(-1.9, -.2, -2.2), hi=(1.9, 3.6, 3.2), coarse=.04, detail=.9, paint=1024, brush=2.0)
    fig.group('body', (0, 0, 0))
    fig.group('trackL', (-.88, .42, 0), 'body')
    fig.group('trackR', (.88, .42, 0), 'body')
    fig.group('head', (0, 1.25, -.2), 'body')                 # the turret: turns to aim
    fig.group('arms', (0, 1.75, .25), 'head')                # the gun in its hammer frame: lifts to range
    fig.group('ram', (0, 1.75, .25), 'arms')                 # the drop weight that slides back on the frame when it fires
    ST = [(-1.0, .78, 1.15), (1.0, .78, 1.15), (-1.0, .78, -1.2), (1.0, .78, -1.2)]
    for i, c in enumerate(ST):
        fig.group('stake%d' % i, c, 'body')
    # tracks: a loop of pads round road wheels, with a mud guard over each
    for sx, g in ((-1, 'trackL'), (1, 'trackR')):
        x = sx * .88
        loop = S.union(S.box((x, .42, 0), (.26, .3, 1.35), .28), S.box((x, .42, 0), (.26, .3, 1.0), .1), k=.1)
        loop = S.cut(loop, S.box((x, .42, 0), (.3, .18, 1.12), .15))
        pads = lambda p, x=x: .025 * np.clip(np.sin((p[..., 2] + p[..., 1] * .0) * 34) * 4, 0, 1) * (np.abs(p[..., 0] - x) < .24)
        loop = S.bump(loop, pads)
        fig.add('track' + g[-1], g, 'rubber', loop, 1600, voxel=.01, uv=('side',), sharp=40)
        wh = S.union(*[xcan((x, .32 if abs(z) < 1 else .42, z), .17 if abs(z) < 1 else .22, .2, .03) for z in (-1.1, -.55, 0, .55, 1.1)])
        wh = S.cut(wh, *[S.sphere((x + sx * .22, .32, z), .07) for z in (-.55, 0, .55)])
        fig.add('wheels' + g[-1], g, 'bD', wh, 900, voxel=.008, uv=('side',), sharp=40)
        guard = S.cut(S.box((x, .8, .05), (.3, .04, 1.45), .03), S.box((x, .8, 1.6), (.5, .2, .2), 0, rot(.5, 0, 0)))
        fig.add('guard' + g[-1], 'body', 'pY', dents(guard, 2.0 + sx, .014, 3), 500, voxel=.008, uv=('top',), sharp=40,
                marks=[(S.chevrons((x, .84, 0), (0, 0, 1), .22, lambda p: np.abs(p[..., 0]) > .7), (.1, .09, .08))])
    # the hull: a low box with a sloped nose, a hatch, tool boxes and the stake rams on its corners
    hull = S.box((0, .82, -.05), (.62, .32, 1.4), .08)
    hull = S.cut(hull, S.plane((0, 1.0, 1.25), (0, -.7, -1)), S.plane((0, 1.0, -1.3), (0, -.8, 1)))
    # the engine grille on the sloped nose: a recessed bay with five louvres standing proud in it, so the ink and the edge light catch
    # every slat (a flat painted patch here read as a hole)
    GR, GC = rot(-.61, 0, 0), V(0, 1.0, 1.25)
    hull = S.cut(hull, S.box(GC, (.34, .1, .035), .012, GR))
    hull = dents(hull, 4.1, .014, 3)
    fig.add('hull', 'body', 'pY', hull, 1500, voxel=.01, uv=('box',), sharp=40,
            detail=S.fine(rivets([V(x, 1.15, z) for x in (-.55, .55) for z in np.linspace(-1.0, 1.0, 7)], .02, .008), S.slit((0, .95, 0), (0, 1, 0), .006, .006),
                          rivets([GC + GR @ V(x, y, .0) for x in (-.37, .37) for y in (-.075, .075)], .018, .008)),
            marks=[(S.inside(S.both(S.box(GC, (.38, .14, .06), .01, GR), lambda p: -S.box(GC, (.345, .105, .1), .012, GR)(p))), (.1, .09, .08))])
    lv = S.union(*[S.box(GC + GR @ V(0, y, -.012), (.32, .007, .022), .004, GR @ rot(.5, 0, 0)) for y in np.linspace(-.072, .072, 5)])
    fig.add('grille', 'body', 'gunm', S.union(lv, S.box(GC + GR @ V(0, 0, -.03), (.33, .09, .006), .004, GR), k=.004), 400, voxel=.004, uv=('front',), sharp=40)
    fig.add('belly', 'body', 'gunm', S.box((0, .55, 0), (.55, .08, 1.3), .05), 300, voxel=.01, uv=('box',))
    tb = S.union(S.box((-.45, 1.2, -1.0), (.14, .08, .22), .03), S.box((.45, 1.2, -1.05), (.14, .1, .2), .03))
    fig.add('toolboxes', 'body', 'tank', dents(tb, 6.6, .01, 6), 400, voxel=.006, uv=('box',), sharp=40)
    for i, (x, y, z) in enumerate(ST):
        c = V(x, y, z)
        sx, sz = np.sign(x), np.sign(z)
        mount = S.union(S.box(c + V(-sx * .15, 0, 0), (.2, .12, .14), .03), xcan(c, .1, .12, .02), k=.02)
        fig.add('stakemount%d' % i, 'body', 'bD', mount, 300, voxel=.006, uv=('side',), sharp=40)
        foot = c + V(sx * .55, -.78, sz * .35)
        leg = S.union(S.rcone(c, foot + V(0, .2, 0), .085, .07), S.box(foot + V(0, .1, 0), (.16, .05, .16), .02), k=.02)
        leg = S.union(leg, S.rcone(foot + V(0, .06, 0), foot + V(0, -.25, 0), .05, .01), k=.01)        # the spike that goes into the ground
        fig.add('stake%dleg' % i, 'stake%d' % i, 'bS', leg, 500, voxel=.006, uv=('side',), sharp=40)
        fig.add('stake%dram' % i, 'stake%d' % i, 'nS', S.cyl(c + V(0, .15, 0), c + (foot - c) * .55 + V(0, .2, 0), .035, .008), 120, voxel=.005, uv=('side',))
        fig.add('stake%dpad' % i, 'stake%d' % i, 'haz', S.box(foot + V(0, .15, 0), (.17, .03, .17), .015), 120, voxel=.006, uv=('top',))
    # the operator's cab on the left rear, glazed, with a stovepipe
    cab = S.cut(S.box((-.3, 1.55, -.85), (.3, .32, .4), .05), S.plane((-.3, 1.75, -.35), (0, -.5, -1)))
    fig.add('cab', 'body', 'pY', dents(cab, 7.7, .012, 4), 700, voxel=.007, uv=('box',), sharp=40)
    win = S.both(S.box((-.3, 1.62, -.85), (.31, .12, .41), .01), S.cut(S.box((-.3, 1.62, -.85), (.32, .14, .42)), S.box((-.3, 1.62, -.85), (.28, .2, .38))))
    fig.add('cabglass', 'body', 'visG', win, 300, voxel=.005, uv=('box',), glow=.35)
    fig.add('stovepipe', 'body', 'bD', S.union(ycan((-.48, 2.0, -1.12), .05, .2, .01), ycan((-.48, 2.22, -1.12), .08, .03, .01), k=.01), 200, voxel=.005)
    # the turret: a slewing ring and a deck carrying the frame
    tur = S.union(ycan((0, 1.2, -.2), .55, .08, .03), S.box((0, 1.38, -.1), (.42, .14, .6), .06), k=.04)
    fig.add('turret', 'head', 'bD', dents(tur, 3.7, .012, 4), 900, voxel=.008, uv=('box',), sharp=40)
    fig.add('trunnions', 'head', 'gunm', S.union(*[S.union(S.box((sx * .34, 1.6, .25), (.07, .22, .16), .03), xcan((sx * .34, 1.75, .25), .14, .08, .02), k=.02) for sx in (-1, 1)]), 500, voxel=.006, uv=('side',), sharp=40)
    # the gun: the old hammer frame (two rails and cross bracing) with a fat barrel inside it, raised for range
    El = .55
    Rg = rot(-El, 0, 0)
    P0 = V(0, 1.75, .25)
    at = lambda q: P0 + Rg @ V(q)
    rails = S.union(*[S.box(at((sx * .24, 0, .9)), (.05, .07, 1.5), .015, Rg) for sx in (-1, 1)])
    for k in range(6):
        z = -.4 + k * .48
        rails = S.union(rails, S.rcone(at((-.24, .05, z)), at((.24, .05, z + .45)), .022), S.rcone(at((.24, .05, z)), at((-.24, .05, z + .45)), .022))
    fig.add('frame', 'arms', 'pY', rails, 1400, voxel=.006, uv=('side',), sharp=40)
    brl = S.union(S.cyl(at((0, .0, -.3)), at((0, 0, 2.15)), .16, .03), S.cyl(at((0, 0, 1.95)), at((0, 0, 2.35)), .21, .03), k=.03)
    for z in (.4, .9, 1.4):
        brl = S.union(brl, S.cyl(at((0, 0, z)), at((0, 0, z + .08)), .19, .02), k=.01)
    brl = S.cut(brl, S.cyl(at((0, 0, 2.0)), at((0, 0, 2.5)), .1))
    for a in range(6):
        brl = S.cut(brl, S.box(at((np.sin(a) * .21, np.cos(a) * .21, 2.2)), (.04, .04, .1), .01, Rg))
    fig.add('barrel', 'arms', 'gunB', brl, 1400, voxel=.006, uv=('side',), sharp=45)
    fig.add('breech', 'arms', 'bS', S.box(at((0, 0, -.35)), (.22, .22, .2), .04, Rg), 300, voxel=.006, uv=('box',), sharp=40)
    fig.add('recoilrams', 'arms', 'nS', S.union(*[S.cyl(at((sx * .14, .2, -.2)), at((sx * .14, .2, .9)), .04, .01) for sx in (-1, 1)]), 300, voxel=.005, uv=('side',))
    fig.point('muzzle', at((0, 0, 2.4)), 'arms')
    wt = S.box(at((0, .0, -.75)), (.3, .3, .28), .05, Rg)
    wt = S.cut(wt, S.box(at((0, .0, -.75)), (.12, .4, .12), .02, Rg))
    fig.add('dropweight', 'ram', 'tank', dents(wt, 8.8, .015, 5), 600, voxel=.007, uv=('box',), sharp=40,
            marks=[(S.chevrons(at((0, 0, -.75)), Rg @ V(1, 0, 1), .14), (.95, .78, .2))])
    fig.add('cable', 'ram', 'rib', S.chain([at((0, .3, -.75)), at((0, .55, .3)), at((0, .45, 1.6))], .02), 200, voxel=.004)
    fig.add('sheave', 'arms', 'bS', xcan(at((0, .42, 1.62)), .12, .06, .02), 200, voxel=.005, uv=('side',))
    return fig


MAKERS = {'hauldrone': hauldrone, 'dustbike': dustbike, 'piledriver': piledriver}


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
    if png:
        from kit import look
        c = [float(x) for x in os.environ.get('LOOK', '0,0,1,2.6').split(',')]
        look.render(png, centre=(c[0], -c[1], c[2]), height=c[3], px=int(os.environ.get('PX', 560)))


if __name__ == '__main__':
    main()
