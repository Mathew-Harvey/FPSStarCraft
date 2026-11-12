"""The body under the clothes: legs, arms and hands every two-legged Ironhold figure shares.

Each function returns {part name: (skin, shape, triangle budget, options)} sculpted for the +x side; `both_legs` mirrors it.
"""
import numpy as np
from . import sdf as S
from .sdf import V, rot


def both_legs(fig, parts):
    """Adds a set of leg parts to the figure for both legs (legR at +x, legL its mirror)."""
    for name, (mat, fn, tris, kw) in parts.items():
        fig.add(name + 'R', 'legR', mat, fn, tris, **kw)
        kw2 = dict(kw)
        if 'uv' in kw2 and len(kw2['uv']) > 1:
            o = np.array(kw2['uv'][1], np.float32) * np.array([-1, 1, 1], np.float32)
            kw2['uv'] = (kw2['uv'][0], o) + tuple(kw2['uv'][2:])
        fig.add(name + 'L', 'legL', mat, S.flipx(fn), tris, **kw2)


def add_arm(fig, group, tag, parts):
    for name, (mat, fn, tris, kw) in parts.items():
        fig.add(name + tag, group, mat, fn, tris, **kw)


# ---------------------------------------------------------------- legs (sculpted for the +x side, mirrored for the other)
def leg_parts(HIP=.93, pants='fabT', boot='leaN', pad='leaN', strapm='leaB', pocket=True, plate=None, greave=None, boss='nS'):
    """One leg in heavy trousers stuffed into a laced boot, with a strapped knee pad. Returns {name: (skin, shape, triangles, options)}."""
    x, xk, xa = .105, .118, .135            # hip, knee and ankle sit a little wider each, so he stands planted
    hip, knee, ank = V(x, HIP, 0), V(xk, .5, .025), V(xa, .26, -.005)
    out = {}
    # trousers: a heavy canvas that bags at the knee and stacks up where it is stuffed into the boot
    thigh = S.rcone(hip, knee, .1, .083)
    shin = S.rcone(knee, ank, .084, .08)
    blouse = S.torus(ank + V(0, .04, 0), .072, .034, squash=1.25)
    seat = S.sphere(hip + V(-.01, .0, -.01), .104)
    cloth = S.union(seat, thigh, shin, blouse, k=.045)
    T, Sh = S.Limb(hip, knee), S.Limb(knee, ank)
    cloth = S.bump(cloth, T.folds([(.2, .5, 1.5, .009, .05, .1), (.36, -.4, 1.3, .008, .045, -.1), (.8, .3, 1.5, .011, .045, .1), (.93, -.5, 1.6, .012, .05, -.08), (.88, 3.14, 1.3, .012, .05, .0), (.66, 3.0, 1.0, .008, .04, .08)]))
    cloth = S.bump(cloth, Sh.folds([(.12, .4, 1.4, .011, .07, -.1), (.1, 3.14, 1.4, .012, .07, .06), (.42, -.5, 1.3, .008, .06, .12), (.66, .8, 1.8, .012, .06, -.1), (.8, -1.2, 1.9, .013, .055, .1), (.92, 1.9, 2.2, .012, .05, -.06), (.74, 3.0, 1.2, .01, .05, .08)]))
    cloth = S.bump(cloth, lambda p: (S.noise(p, 22, 3.1) - .5) * .006)
    if pocket:
        cloth = S.union(S.union(cloth, S.box(V(xk + .074, .69, .0), (.02, .075, .06), .014, rot(0, 0, -.06)), k=.008), S.box(V(xk + .082, .752, .0), (.018, .026, .066), .01, rot(0, 0, -.06)), k=.004)
    out['trouser'] = (pants, S.cut(cloth, S.below(.235)), 1500, dict(voxel=.0032, uv=('cyl', hip * .5 + ank * .5)))
    # knee pad: a leather cup with a steel boss, strapped round the back
    if plate:                                                   # a pressed steel knee cop with a ridge down it, bolted through
        cup = S.both(S.ellipsoid(knee + V(0, .005, .05), (.082, .1, .07)), S.plane(knee + V(0, 0, .02), (0, 0, -1)), k=.012)
        cup = S.union(cup, S.rcone(knee + V(0, .085, .09), knee + V(0, -.08, .1), .012, .014), k=.012)
        cup = S.union(cup, S.both(S.ellipsoid(knee + V(0, -.085, .05), (.07, .04, .06)), S.plane(knee + V(0, 0, .025), (0, 0, -1))), k=.006)
        out['kneepad'] = (plate, cup, 300, dict(voxel=.003, uv=('front',)))
    cup = S.both(S.ellipsoid(knee + V(0, .0, .058), (.072, .086, .056)), S.plane(knee + V(0, 0, .032), (0, 0, -1)), k=.012)
    if not plate:
        out['kneepad'] = (pad, cup, 260, dict(voxel=.003, uv=('front',)))
    out['kneeboss'] = (boss, S.ellipsoid(knee + V(0, .0, .124 if plate else .108), (.03, .034, .016)), 90, dict(voxel=.002, uv=('front',)))
    strap = S.both(S.torus(knee + V(0, -.01, .0), .09, .013, squash=1.6), S.plane(knee + V(0, 0, .05), (0, 0, -1)))
    out['kneestrap'] = (strapm, strap, 110, dict(voxel=.003))
    if greave:                                                  # a shin plate strapped over the trouser, dented and a little askew
        mid = knee * .5 + ank * .5
        g = S.both(S.rcone(knee + V(0, -.1, .012), ank + V(0, .075, .014), .097, .09), S.plane(mid + V(0, 0, .03), (0, 0, -1)), k=.008)
        g = S.union(g, S.rcone(knee + V(0, -.11, .1), ank + V(0, .08, .096), .01, .012), k=.012)
        g = S.bump(g, lambda p: -.006 * np.exp(-(((p[..., 1] - .37) / .03) ** 2 + ((p[..., 0] - xk - .04) / .03) ** 2)))
        out['greave'] = (greave, g, 300, dict(voxel=.003, uv=('front',)))
        for i, y in enumerate((.45, .31)):
            st = S.both(S.torus(V((xk + xa) / 2, y, .008), .092, .011, squash=1.7), S.plane(V(0, 0, .045), (0, 0, 1)))
            out['greavestrap%d' % i] = (strapm, st, 70, dict(voxel=.003))
    # boot, toes turned out a little
    R = rot(0, .17, 0)
    a0 = V(xa, 0, 0)

    def turned(f):
        return S.moved(f, R=R, c=a0)
    shaft = S.rcone(V(xa, .1, -.012), V(xa, .285, -.014), .069, .078)
    foot = S.union(S.rcone(V(xa, .074, -.01), V(xa, .076, .13), .066, .064), S.sphere(V(xa, .074, -.05), .066), S.ellipsoid(V(xa, .072, .168), (.074, .062, .09)), k=.03)
    upper = S.union(shaft, foot, k=.04)
    Bt = S.Limb(V(xa, .3, -.014), V(xa, .06, -.01))
    upper = S.bump(upper, Bt.folds([(.5, 0, 1.5, .006, .035, .0), (.62, .2, 1.6, .007, .035, .1), (.74, -.1, 1.4, .006, .03, -.08)]))
    cuff = S.torus(V(xa, .288, -.014), .074, .013, squash=1.5)
    upper = S.union(upper, cuff, k=.01)
    upper = S.cut(upper, S.below(.034))
    out['boot'] = (boot, turned(upper), 620, dict(voxel=.003, uv=('cyl', V(xa, .15, 0))))
    cap = S.both(S.ellipsoid(V(xa, .07, .17), (.08, .066, .096)), S.plane(V(xa, 0, .148), (0, -.25, 1)))
    cap = S.cut(cap, S.below(.034))
    out['toecap'] = ('nD', turned(cap), 170, dict(voxel=.003, uv=('top',)))
    sole = S.box(V(xa, .019, .06), (.076, .019, .17), .016)
    sole = S.union(sole, S.box(V(xa, .019, .18), (.083, .019, .066), .018), k=.03)
    sole = S.cut(sole, S.box(V(xa, -.012, .035), (.09, .022, .034), .008))          # the step between heel and tread
    for i in range(5):
        sole = S.cut(sole, S.box(V(xa, -.004, .11 + i * .03), (.1, .008, .006)))    # tread
    out['sole'] = ('sole', turned(sole), 300, dict(voxel=.0028, uv=('side',), sharp=30))
    laces = [S.rcone(V(xa - .036, .118 + i * .034, .058 - i * .01), V(xa + .036, .126 + i * .034, .058 - i * .01), .0075) for i in range(4)]
    laces += [S.rcone(V(xa - .036, .118 + i * .034, .058 - i * .01), V(xa + .036, .16 + i * .034, .048 - i * .01), .006) for i in range(3)]
    out['laces'] = ('nD', turned(S.union(*laces)), 150, dict(voxel=.002, uv=('front',)))
    strap = S.both(S.torus(V(xa, .1, -.006), .077, .012, squash=1.8), S.plane(V(xa, 0, .075), (0, 0, -1)))
    out['bootstrap'] = (strapm, turned(S.union(strap, S.box(V(xa + .074, .1, .0), (.008, .02, .018), .004))), 130, dict(voxel=.0028))
    return out



def ring(c, rx, rz, h, t, rnd=.006):
    """A band round the waist: an oval can with a smaller one taken out."""
    return S.cut(S.ecyl(c, rx, rz, h, rnd), S.ecyl(c, rx - t, rz - t, h * 2, .0))



HS = 1.32                                                       # hands a size up from life, the way a comic draws a working man
def arm_parts(side, Sh, El, Wr, y_hand, thumb, sleevem='fabT', skinm='skinF', glovem='gloveN', strapm='leaB'):
    """side is -1 for his own right (the game's armL) and 1 for the drill arm. Sh, El, Wr are the shoulder, elbow and wrist."""
    Sh, El, Wr = V(Sh), V(El), V(Wr)
    out = {}
    up = S.rcone(Sh, El, .073, .064)
    cap = S.sphere(Sh + V(side * .01, -.005, 0), .082)
    roll_at = Sh + (El - Sh) * .78
    ax = (El - Sh) / np.linalg.norm(El - Sh)
    Rr = S.basis(V(0, 0, 1) - ax * ax[2], ax)                    # local y along the arm
    roll = S.torus(roll_at, .069, .02, Rr, squash=1.5)
    sleeve = S.union(cap, S.both(up, S.plane(roll_at, ax)), roll, k=.02)
    A = S.Limb(Sh, roll_at)
    sleeve = S.bump(sleeve, A.folds([(.3, side * 1.3, 1.3, .008, .07, .12), (.5, -side * .6, 1.4, .008, .07, -.1), (.72, side * .4, 1.6, .009, .06, .1), (.84, 2.6, 1.4, .009, .06, -.08), (.16, 0, 1.2, .007, .06, .0)]))
    sleeve = S.bump(sleeve, lambda p: (S.noise(p, 22, 9.1) - .5) * .005)
    out['sleeve'] = (sleevem, sleeve, 620, dict(voxel=.003, uv=('cyl', (Sh + roll_at) / 2, ax)))
    fax = (Wr - El) / np.linalg.norm(Wr - El)
    fore = S.union(S.rcone(El, Wr, .064, .046), S.sphere(El, .062), S.ellipsoid(El + fax * .09 + V(side * .012, 0, .006), (.057, .057, .08), S.basis(fax, (0, 0, 1))), k=.03)
    fore = S.union(fore, S.rcone(roll_at - ax * .02, El, .062, .06), k=.02)
    out['forearm'] = (skinm, fore, 380, dict(voxel=.003, uv=('cyl', (El + Wr) / 2, fax)))
    Rh = S.basis(fax, y_hand)
    hand = S.fist(Wr + fax * .012, Rh, HS, thumb, fat=.004)
    cuff = S.union(S.rcone(Wr + fax * .012, Wr - fax * .075, .055, .069), S.torus(Wr - fax * .075, .067, .011, S.basis((0, 0, 1) - fax * fax[2] if abs(fax[2]) < .9 else (0, 1, 0), fax)), k=.012)
    glove = S.union(hand, cuff, k=.014)
    Hl = lambda q: Wr + fax * .012 + Rh @ (V(q) * HS)
    for x in (-.024, 0, .024):                                                       # seams down the back of the hand
        glove = S.groove(glove, [Hl((x, .026, .02)), Hl((x * 1.1, .03, .09))], .004, .004)
    glove = S.groove(glove, [Hl((-.05, .0, .012)), Hl((0, .026, .012)), Hl((.05, .0, .012))], .004, .004)
    out['glove'] = (glovem, glove, 1300, dict(voxel=.0022, uv=('cyl', Wr, fax)))
    wr = S.torus(Wr - fax * .02, .056, .008, S.basis((0, 0, 1) - fax * fax[2] if abs(fax[2]) < .9 else (0, 1, 0), fax), squash=2.2)
    out['wriststrap'] = (strapm, S.union(wr, S.box(Wr - fax * .02 + Rh @ V(0, .061, 0), (.012, .006, .016), .003, Rh)), 110, dict(voxel=.002))
    return out, (Hl, Rh)




GRIP = V(0, -.022, .088)                                        # where a handle passes through a closed fist, in the fist's own space


def wrist_for(grip, Rh, El):
    """Where the wrist has to be for a fist turned by Rh to close round a handle passing through `grip`."""
    grip, El = V(grip), V(El)
    Wr = grip - Rh @ (GRIP * HS)
    for _ in range(3):
        fax = (Wr - El) / np.linalg.norm(Wr - El)
        Wr = grip - fax * .012 - Rh @ (GRIP * HS)
    return Wr


def armoured_arm(side, Sh, El, Wr, Rh, thumb, sleeve='fab', guard='bS', glove='leaB', rib='rib', r=.07):
    """A trooper's arm: a padded sleeve, an elbow cop, a forearm plate and a heavy glove. Rh turns the fist (see sdf.fist)."""
    Sh, El, Wr = V(Sh), V(El), V(Wr)
    out = {}
    ax = (El - Sh) / np.linalg.norm(El - Sh)
    fax = (Wr - El) / np.linalg.norm(Wr - El)
    up = S.union(S.rcone(Sh, El, r * 1.08, r * .95), S.sphere(Sh + V(side * .008, -.004, 0), r * 1.16), k=.02)
    A = S.Limb(Sh, El)
    up = S.bump(up, A.folds([(.34, side * 1.3, 1.3, .008, .07, .12), (.52, -side * .6, 1.4, .008, .07, -.1), (.72, side * .4, 1.6, .01, .06, .1), (.86, 2.6, 1.4, .01, .06, -.08), (.9, -.4, 1.2, .009, .05, .06)]))
    up = S.bump(up, lambda p: (S.noise(p, 22, 9.1 + side) - .5) * .005)
    lower = S.union(S.rcone(El, Wr, r * .92, r * .7), S.sphere(El, r * .95), k=.02)
    Bf = S.Limb(El, Wr)
    lower = S.bump(lower, Bf.folds([(.14, side * .5, 1.5, .008, .09, .1), (.86, -side * 1.0, 1.6, .008, .07, -.08), (.93, 2.2, 1.6, .008, .06, .06)]))
    out['sleeve'] = (sleeve, S.union(up, lower, k=.018), 760, dict(voxel=.003, uv=('cyl', (Sh + El) / 2, ax)))
    cop = S.both(S.sphere(El - (ax - fax) * .012, r * 1.22), S.plane(El + (ax - fax) * .01, ax - fax), k=.01)       # the cup sits on the point of the elbow
    cop = S.union(cop, S.sphere(El - (ax - fax) / np.linalg.norm(ax - fax) * r * 1.2, r * .26), k=.006)
    out['elbow'] = (guard, cop, 170, dict(voxel=.003, uv=('front',)))
    a, b = El + (Wr - El) * .24, El + (Wr - El) * .78
    vam = S.rcone(a, b, r * 1.12, r * .93)
    vam = S.both(vam, S.slab((a + b) / 2, fax, np.linalg.norm(b - a) / 2), k=.006)
    out_dir = np.cross(fax, np.cross(V(side, 0, 0), fax))
    vam = S.union(vam, S.rcone(a + out_dir * r * 1.05, b + out_dir * r * .9, .011, .011), k=.01)                    # a pressed rib down the outside
    vam = S.bump(vam, lambda p: -.005 * np.clip(1 - np.abs(S.noise(p, 30, 4.4) - .5) * 9, 0, 1))                    # a few knocks
    out['vambrace'] = (guard, vam, 280, dict(voxel=.003, uv=('cyl', (a + b) / 2, fax)))
    band = S.torus(El + (Wr - El) * .82, r * .86, .011, S.basis((0, 0, 1) - fax * fax[2] if abs(fax[2]) < .9 else (0, 1, 0), fax), squash=1.8)
    out['cuffband'] = (rib, band, 80, dict(voxel=.003))
    at = Wr + fax * .012
    hand = S.fist(at, Rh, HS, thumb, fat=.005)
    cuff = S.union(S.rcone(Wr + fax * .02, Wr - fax * .07, .054, .068), S.sphere(Wr, .05), k=.012)
    glove_ = S.union(hand, cuff, k=.016)
    Hl = lambda q: at + Rh @ (V(q) * HS)
    for x in (-.024, 0, .024):
        glove_ = S.groove(glove_, [Hl((x, .028, .02)), Hl((x * 1.1, .032, .09))], .004, .004)
    glove_ = S.union(glove_, S.box(Hl((0, .03, .05)), (.036 * HS, .007, .026 * HS), .006, Rh), k=.004)             # a knuckle plate
    out['glove'] = (glove, glove_, 1150, dict(voxel=.0023, uv=('cyl', Wr, fax)))
    return out, Hl
