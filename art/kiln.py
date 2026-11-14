"""The Veyl bodies the Kiln makes: Bell, Reedwalker, Knell, Listener.

Bell (beats heavy: a whole body cast as one bell, mouth down, a ring of shell it can throw up round itself), Reedwalker (a lantern on
four reed-thin legs, tall enough to step up a cliff, a beam lens in front), Knell (hunched under a hood, cradling the orb it rolls at
the foe), Listener (a flying ear: a curled shell trumpet with long feelers and glass wings, no arms). Same kit as art/veyl.py.
Run:  python kiln.py bell|reedwalker|knell|listener [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, veyl as Vk
from kit.sdf import V, rot
from veyl import tabard, cords, filigree, horn

KINDS = ('bell', 'reedwalker', 'knell', 'listener')
KIND = next((a for a in sys.argv[1:] if a in KINDS), 'bell')
PI = np.pi
FWD = rot(PI / 2, 0, 0)


# ---------------------------------------------------------------------------------------------------------------- Bell
def build_bell():
    """The whole body is a cast bell, mouth down, hanging off nothing. A small masked head sits in the crown like the bell's
    handle, two short heavy arms come out of the shoulder, each ending in a crystal clapper for a fist. A gold ring stands round its
    waist: that is the Ring Shell, which it throws up into a dome when hit."""
    fig = B.Figure('bell', lo=(-2.0, -.1, -1.8), hi=(2.0, 3.8, 1.8), coarse=.03, detail=1.0, paint=1536, brush=1.9)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, 2.72, .05), 'body'), ('halo', (0, 1.45, 0), 'body'),
                      ('armL', (-.95, 2.1, 0), 'body'), ('armR', (.95, 2.1, 0), 'body')):
        fig.group(g, p, par)
    # a short tail under the bell's mouth, like a clapper hanging out of it
    sw = Vk.tail_sweep(.9, .25)
    tail = Vk.lathe([(0, 0), (.05, .12), (.12, .45), (.18, .75), (.2, .9)], sweep=sw, plates=(5, .02))
    fig.add('tail', 'body', 'vD', Vk.pits(tail, 2.2, .006, 14), 800, voxel=.006, uv=('cyl', V(0, .45, 0)))
    # the bell: crown, waist, sound bow and lip, cast solid with a shallow mouth underneath
    shell = Vk.lathe([(1.12, .62), (1.1, .68), (.98, .82), (.8, 1.2), (.72, 1.7), (.74, 2.2), (.66, 2.5), (.4, 2.66), (0, 2.72)], zs=.92)
    shell = S.cut(shell, Vk.lathe([(1.0, .55), (.86, .74), (0, .95)], zs=.92), k=.03)
    shell = S.bump(shell, lambda p: .012 * np.sin(p[..., 1] * 22) * np.clip((1.05 - p[..., 1]) * 6, 0, 1))      # ringed at the sound bow
    shell = S.bump(shell, lambda p: -.02 * np.clip(1 - np.abs(S.noise(p, 2.2, 4.1) - .5) * 5, 0, 1))
    shell = S.groove(shell, [S.skin(shell, (x, y, 0), (0, 0, 1), tmax=2, out=-.006) for x, y in ((.3, 2.3), (.18, 2.0), (.3, 1.7), (.15, 1.4))], .01, .014)   # an old crack, mended in gold by the painter
    shell = filigree(shell, (0, 1.9, 0), .75, 1.4, w=.008, depth=.01, zs=.92, y_rise=.3)
    fig.add('shell', 'body', 'vI', Vk.pits(shell, 1.7, .008, 9), 3200, voxel=.01, uv=('cyl', V(0, 1.6, 0)))
    fig.add('lip', 'body', 'vG', Vk.ring((0, .64, 0), 1.1, .06, squash=1.0), 700, voxel=.008, uv=('cyl', V(0, .64, 0)))
    fig.add('bands', 'body', 'vG', S.union(*[Vk.ring((0, y, 0), r, .035) for y, r in ((1.05, .84), (2.25, .74))]), 700, voxel=.008)
    # a glowing note set in the front of the bell where a face would be on anyone else
    fig.add('note', 'body', 'vM', S.ellipsoid((0, 1.7, .66), (.2, .26, .08)), 200, voxel=.006, uv=('front',))
    fig.add('notering', 'body', 'vG', S.torus((0, 1.7, .69), .23, .04, rot(PI / 2 - .12, 0, 0), squash=1.3), 360, voxel=.006, uv=('front',))
    fig.add('studs', 'body', 'vC', S.union(*[Vk.crystal(V(np.sin(a) * .78, 2.24, np.cos(a) * .72), V(np.sin(a) * 1.02, 2.4, np.cos(a) * .94), .06, 4, .3) for a in np.linspace(0, 2 * PI, 9)[:-1]]), 300, voxel=.006, sharp=25)
    # the Ring Shell: a broad gold hoop standing off the waist on four crystal stays
    fig.add('halo', 'halo', 'vG', S.torus((0, 1.45, 0), 1.08, .06, squash=1.0), 700, voxel=.008, uv=('cyl', V(0, 1.45, 0)))
    fig.add('halostays', 'halo', 'teal', S.union(*[Vk.crystal(V(np.sin(a) * .72, 1.45, np.cos(a) * .66), V(np.sin(a) * 1.12, 1.45, np.cos(a) * 1.08), .05, 4, .4) for a in (PI / 4, 3 * PI / 4, 5 * PI / 4, 7 * PI / 4)]), 160, voxel=.006, sharp=25)
    # the head: a small mask in the crown, horns swept back like a bell's canons
    H0 = V(0, 2.72, .05)
    head = Vk.lathe([(.08, 0), (.17, .08), (.2, .22), (.16, .34), (.0, .4)], c=H0, zs=.95)
    fig.add('head', 'head', 'vD', Vk.pits(head, 4.3, .004, 18), 600, voxel=.005, uv=('cyl', H0 + V(0, .2, 0)))
    face = S.both(S.grow(head, .02), S.plane(H0 + V(0, 0, .08), (0, 0, -1)), k=.02)
    for sx in (-1, 1):
        face = S.cut(face, S.ellipsoid(H0 + V(sx * .08, .2, .2), (.05, .02, .05), rot(0, 0, sx * .3)), k=.01)
    fig.add('mask', 'head', 'vL', Vk.pits(face, 4.8, .004, 18), 500, voxel=.004, uv=('front',))
    fig.add('eyes', 'head', 'teal', S.union(*[S.ellipsoid(H0 + V(sx * .08, .2, .18), (.045, .016, .03), rot(0, 0, sx * .3)) for sx in (-1, 1)]), 80, voxel=.004)
    fig.add('canons', 'head', 'vG', S.union(*[horn(H0 + V(sx * .12, .3, -.02), H0 + V(sx * .36, .48, -.14), H0 + V(sx * .3, .7, -.36), .06, .012) for sx in (-1, 1)]), 400, voxel=.005, uv=('side',))
    for sx, g in ((-1, 'armL'), (1, 'armR')):
        Sh = V(sx * .95, 2.1, 0)
        El, Wr = Sh + V(sx * .42, -.38, .12), Sh + V(sx * .3, -.8, .5)
        fig.add('pauldron' + g[-1], g, 'vIp', Vk.pits(S.union(S.ellipsoid(Sh + V(sx * .05, .08, 0), (.36, .26, .34)), Vk.ring(Sh + V(sx * .04, 0, 0), .32, .03, (0, 0, -sx * .4)), k=.03), 3.3 + sx, .006, 14), 700, voxel=.007, uv=('top',))
        fig.add('arm' + g[-1], g, 'vD', Vk.arm(Sh, El, Wr, .14, .11, .09), 520, voxel=.006, uv=('cyl', El))
        fig.add('vamb' + g[-1], g, 'vI', Vk.pits(Vk.vambrace(El, El + (Wr - El) * .85, .17, .12, spur=.4, side=sx), 5.3 + sx, .006, 14), 600, voxel=.006, uv=('cyl', (El + Wr) / 2))
        fc = Wr + V(0, -.12, .12)
        fig.add('clapper' + g[-1], g, 'vC', S.union(Vk.crystal(fc + V(0, .14, -.08), fc + V(0, -.22, .2), .2, 6, .4), S.sphere(fc + V(0, .08, -.04), .14), k=.04), 360, voxel=.005, sharp=25)
        fig.add('cuff' + g[-1], g, 'vG', S.torus(Wr, .13, .03, S.basis((0, 0, 1), Wr - El)), 200, voxel=.005)
    fig.point('muzzle', (0, 1.7, .9), 'body')
    return fig, (0, 0, 1.8, 4.0)


# ---------------------------------------------------------------------------------------------------------- Reedwalker
def reed_leg(hip, knee, foot, r0, r1):
    """A leg as thin as a reed: a long upper, a knee knob with a crystal spur, a long shin, a pointed glass foot."""
    hip, knee, foot = V(hip), V(knee), V(foot)
    up = S.union(S.rcone(hip, knee, r0, r0 * .7), S.sphere(hip, r0 * 1.3), k=r0 * .5)
    up = S.bump(up, lambda p: r0 * .2 * np.exp(-((np.mod(np.linalg.norm(p - hip, axis=-1), .5) - .25) / .03) ** 2))    # jointed like cane
    shin = S.union(S.rcone(knee, foot, r0 * .65, r1), S.sphere(knee, r0 * 1.05), k=r0 * .3)
    shin = S.bump(shin, lambda p: r0 * .18 * np.exp(-((np.mod(np.linalg.norm(p - knee, axis=-1), .5) - .25) / .03) ** 2))
    return up, shin


def build_reedwalker():
    """A lantern of shell on four legs as thin as reeds, so tall it steps up a cliff in one stride. The lantern hangs between the
    hips, a lens of cut crystal in front that throws the beam, glass fins standing up its back, a halo laid flat on its top."""
    fig = B.Figure('reedwalker', lo=(-3.6, -.1, -3.6), hi=(3.6, 7.6, 3.6), coarse=.04, detail=1.0, paint=1536, brush=2.4)
    H = 5.0                                                                                                       # hip height
    legs = (('legL', -1, 1), ('legR', 1, 1), ('legBL', -1, -1), ('legBR', 1, -1))
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, H - .1, .9), 'body'), ('halo', (0, H + 1.7, 0), 'body')):
        fig.group(g, p, par)
    for g, sx, sz in legs:
        fig.group(g, (sx * .6, H, sz * .5), None)
    # the lantern: a turned shell, wide at the shoulders, drawn down to a point below, open at the sides in long slots
    lan = Vk.lathe([(0, H - 1.5), (.25, H - 1.2), (.7, H - .5), (.95, H + .1), (.9, H + .6), (.55, H + 1.05), (0, H + 1.2)], zs=.85)
    for a in np.linspace(0, 2 * PI, 7)[:-1] + PI / 6:
        lan = S.cut(lan, S.box(V(np.sin(a) * .9, H - .1, np.cos(a) * .76), (.09, .55, .3), .06, rot(0, a, 0)), k=.03)
    lan = filigree(lan, (0, H + .5, 0), .9, 1.3, w=.008, depth=.01, zs=.85, y_rise=.3)
    fig.add('lantern', 'body', 'vI', Vk.pits(lan, 1.8, .008, 9), 3000, voxel=.011, uv=('cyl', V(0, H, 0)))
    fig.add('core', 'body', 'vM', S.ellipsoid((0, H - .1, 0), (.55, .7, .48)), 400, voxel=.012, uv=('cyl', V(0, H, 0)))             # seen lit through the slots
    fig.add('bands', 'body', 'vG', S.union(Vk.ring((0, H + .62, 0), .88, .05, squash=1.0), Vk.ring((0, H - .55, 0), .7, .05)), 700, voxel=.01)
    fig.add('drop', 'body', 'vC', Vk.crystal((0, H - 1.3, 0), (0, H - 2.4, 0), .16, 6, .3), 160, voxel=.009, sharp=25)
    fig.add('hips', 'body', 'vD', S.union(*[S.ellipsoid(V(sx * .62, H, sz * .5), (.3, .26, .3)) for _, sx, sz in legs], Vk.ring((0, H, 0), .78, .1, squash=1.0), k=.08), 900, voxel=.011, uv=('cyl', V(0, H, 0)))
    fins = S.union(*[Vk.crystal(V(0, H + .5 + i * .22, -.6 - i * .05), V(0, H + 1.2 + i * .45, -1.3 - i * .25), .14 - i * .02, 5, .25) for i in range(3)])
    fig.add('fins', 'body', 'vC', fins, 360, voxel=.009, sharp=25)
    # the head: the beam lens in a gold cowl on the front of the lantern
    hc = V(0, H - .1, .9)
    cowl = S.cut(S.ellipsoid(hc + V(0, .1, -.12), (.46, .44, .4)), S.ellipsoid(hc + V(0, .05, .25), (.36, .34, .4)), k=.04)
    fig.add('cowl', 'head', 'vIp', Vk.pits(cowl, 4.1, .008, 9), 900, voxel=.01, uv=('front',))
    fig.add('lens', 'head', 'vC', S.ellipsoid(hc + V(0, .05, .06), (.3, .3, .16)), 300, voxel=.009, uv=('front',), glow=.6)
    fig.add('lensring', 'head', 'vG', S.torus(hc + V(0, .05, .14), .32, .045, FWD), 400, voxel=.009, uv=('front',))
    fig.add('lenseyes', 'head', 'teal', S.union(*[S.sphere(hc + V(sx * .36, .32, .12), .06) for sx in (-1, 1)]), 80, voxel=.008)
    fig.add('feelers', 'head', 'vG', S.mirror(S.chain([hc + V(.22, .4, -.05), hc + V(.5, .9, -.2), hc + V(.62, 1.3, -.55)], [.035, .025, .006])), 260, voxel=.008)
    c = V(0, H + 1.7, 0)
    r1, pts = Vk.halo(c, .9, .06, 6, .3, .07)
    fig.add('halo', 'halo', 'teal', S.moved(r1, R=rot(-PI / 2, 0, 0), c=c), 600, voxel=.01, uv=('top',))
    fig.add('halopoints', 'halo', 'mag', S.moved(pts, R=rot(-PI / 2, 0, 0), c=c), 200, voxel=.009, sharp=25)
    for g, sx, sz in legs:
        hip = V(sx * .62, H, sz * .5)
        knee = hip + V(sx * 1.35, .9, sz * 1.0)
        foot = V(sx * 2.3, 0, sz * 2.0)
        up, shin = reed_leg(hip, knee, foot + V(0, .45, 0), .13, .06)
        fig.add('thigh' + g[3:], g, 'vD', Vk.pits(up, 3 + sx + sz, .006, 14), 700, voxel=.008, uv=('cyl', (hip + knee) / 2))
        fig.add('shin' + g[3:], g, 'vD', Vk.pits(shin, 4 + sx - sz, .006, 14), 800, voxel=.008, uv=('cyl', (knee + foot) / 2))
        fig.add('kneecap' + g[3:], g, 'vG', S.torus(knee, .16, .04, S.basis((0, 1, 0), knee - hip)), 200, voxel=.007)
        fig.add('kneespur' + g[3:], g, 'vC', Vk.crystal(knee, knee + V(sx * .25, .7, sz * .2), .09, 4, .3), 90, voxel=.007, sharp=25)
        fig.add('foot' + g[3:], g, 'vC', Vk.crystal(foot + V(0, .55, 0), foot, .12, 5, .4), 120, voxel=.007, sharp=25)
        fig.add('anklering' + g[3:], g, 'vG', S.torus(foot + V(0, .55, 0), .1, .03), 120, voxel=.006)
    fig.point('muzzle', tuple(hc + V(0, .05, .3)), 'head')
    return fig, (0, 0, 3.6, 7.8)


# --------------------------------------------------------------------------------------------------------------- Knell
def build_knell():
    """Hunched under a heavy hood like a bell-ringer leaning into the rope, both arms round the orb it will roll at the foe. The orb
    rides in a cradle of gold ribs in front of the chest (its own group, so it can be let go of)."""
    fig = B.Figure('knell', lo=(-1.7, -.1, -1.6), hi=(1.7, 3.2, 2.0), coarse=.025, detail=1.0, paint=1024, brush=1.5)
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, 1.75, .45), 'body'), ('halo', (0, 2.2, -.3), 'body'),
                      ('armL', (-.42, 1.62, .15), 'body'), ('armR', (.42, 1.62, .15), 'body'), ('orb', (0, 1.08, .85), 'body')):
        fig.group(g, p, par)
    L = rot(.5, 0, 0)
    lean = lambda f: S.moved(f, R=L, c=(0, .95, 0))
    sw = Vk.tail_sweep(.95, .8)
    tail = Vk.lathe([(0, 0), (.05, .12), (.12, .42), (.18, .75), (.2, .9), (.18, .98)], sweep=sw, plates=(6, .018))
    fig.add('tail', 'body', 'vD', Vk.pits(tail, 2.6), 1000, voxel=.004, uv=('cyl', V(0, .5, -.2)))
    hips = S.union(S.ellipsoid((0, .98, 0), (.34, .16, .3)), Vk.ring((0, 1.02, 0), .3, .03), k=.03)
    fig.add('hips', 'body', 'vIp', Vk.pits(hips, 1.5), 500, voxel=.004, uv=('cyl', V(0, 1.0, 0)))
    pl = Vk.petals(1.0, .35, .26, .5, 9, .26, .018, skip=(0, 1, 8), back=.15, wave=.08, zs=.9, belly=.45)
    fig.add('skirt', 'body', 'vDp', Vk.pits(S.union(*pl), 2.0), 800, voxel=.004, uv=('cyl', V(0, .7, 0)), sharp=35)
    chest = Vk.lathe([(.14, 1.0), (.26, 1.08), (.42, 1.3), (.44, 1.52), (.3, 1.7), (.14, 1.78)], zs=.82)
    chest = filigree(chest, (0, 1.5, 0), .44, 1.2, zs=.82, y_rise=.08)
    fig.add('chest', 'body', 'vL', lean(Vk.pits(chest, 2.4)), 1600, voxel=.004, uv=('cyl', V(0, 1.4, .2)))
    # a heavy hood over the back like an upturned bell, its lip standing up past the head
    hood = Vk.lathe([(.62, 0), (.6, .06), (.5, .3), (.34, .6), (.14, .8), (0, .84)], c=(0, 1.45, -.15), zs=.9)
    hood = S.cut(hood, Vk.lathe([(.56, -.05), (.44, .3), (.28, .58), (0, .72)], c=(0, 1.45, -.15), zs=.9), k=.02)
    hood = S.moved(hood, R=rot(-.9, 0, 0), c=(0, 1.55, -.15))
    hood = S.bump(hood, lambda p: .008 * np.sin(np.arctan2(p[..., 0], p[..., 2]) * 14))
    fig.add('hood', 'body', 'vI', Vk.pits(hood, 3.1), 1300, voxel=.004, uv=('cyl', V(0, 1.9, -.4)))
    fig.add('hoodlip', 'body', 'vG', S.moved(Vk.ring((0, 1.46, -.15), .61, .03, squash=1.0), R=rot(-.9, 0, 0), c=(0, 1.55, -.15)), 400, voxel=.004)
    H0 = V(0, 1.75, .45)
    face = Vk.lathe([(.06, 0), (.14, .08), (.17, .22), (.13, .34), (0, .38)], c=H0, zs=.9)
    face = S.cut(face, S.ellipsoid(H0 + V(0, .18, .17), (.11, .03, .06)), k=.008)                                   # one long slit for the eyes
    fig.add('mask', 'head', 'vL', Vk.pits(face, 4.4, .003), 700, voxel=.003, uv=('front',))
    fig.add('eyes', 'head', 'teal', S.ellipsoid(H0 + V(0, .18, .14), (.1, .02, .03)), 60, voxel=.003)
    fig.add('beard', 'head', 'vG', S.union(*[S.chain([H0 + V(x, .06, .12), H0 + V(x * 1.3, -.1, .16), H0 + V(x * 1.1, -.26, .12)], [.016, .012, .004]) for x in (-.06, -.02, .02, .06)]), 200, voxel=.0025)
    c = V(0, 2.2, -.3)
    ring = S.torus(c, .34, .03, rot(PI / 2 - .7, 0, 0), squash=.6)
    fig.add('halo', 'halo', 'mag', ring, 360, voxel=.004, uv=('front',))
    fig.add('halopoints', 'halo', 'vC', S.union(*[Vk.crystal(c + rot(-.7, 0, 0) @ V(np.cos(a) * .3, np.sin(a) * .3, 0), c + rot(-.7, 0, 0) @ V(np.cos(a) * .5, np.sin(a) * .5, 0), .03, 4, .35) for a in (PI / 2, PI / 2 + 2.1, PI / 2 - 2.1)]), 90, voxel=.004, sharp=25)
    # the orb and its cradle
    oc = V(0, 1.08, .85)
    fig.add('orbcore', 'orb', 'vM', S.sphere(oc, .32), 400, voxel=.005, uv=('front',))
    fig.add('orbshell', 'orb', 'vC', S.cut(S.sphere(oc, .38), *[S.ecyl(oc, .14, .14, .5, .02) for _ in (0,)], S.ellipsoid(oc, (.5, .14, .5)), k=.01), 500, voxel=.004, uv=('front',), glow=.4)
    cradle = S.union(*[S.torus(oc, .42, .025, rot(0, a, PI / 2)) for a in (-.5, .5)], S.torus(oc + V(0, -.05, 0), .43, .025), k=.01)
    fig.add('cradle', 'orb', 'vG', cradle, 600, voxel=.004)
    for sx, g in ((-1, 'armL'), (1, 'armR')):
        Sh = V(sx * .42, 1.62, .15)
        El, Wr = Sh + V(sx * .25, -.36, .2), oc + V(sx * .36, .05, -.05)
        fig.add('arm' + g[-1], g, 'vD', Vk.arm(Sh, El, Wr, .07, .055, .045), 420, voxel=.004, uv=('cyl', El))
        fig.add('vamb' + g[-1], g, 'vIp', Vk.pits(Vk.vambrace(El, El + (Wr - El) * .8, .085, .06, spur=.3, side=sx), 5.2 + sx), 420, voxel=.004, uv=('cyl', (El + Wr) / 2))
        fig.add('shoulder' + g[-1], g, 'vI', Vk.pits(S.ellipsoid(Sh + V(sx * .04, .06, 0), (.16, .13, .16)), 3.2 + sx), 300, voxel=.004, uv=('top',))
        fig.add('claw' + g[-1], g, 'vL', Vk.claw(Wr + V(sx * .02, 0, .05), S.basis((-sx * .9, 0, .4), (0, 1, 0)), .08, curl=.9, thumb=sx), 400, voxel=.003, uv=('front',))
    fig.point('muzzle', tuple(oc), 'orb')
    return fig, (0, 0, 1.4, 3.2)


# ------------------------------------------------------------------------------------------------------------- Listener
def build_listener():
    """A flying ear. A shell curled into a trumpet, mouth forward, a lit crystal deep in it; long gold feelers trailing back; two pairs
    of thin glass wings beating at its sides; a halo laid flat under it like a ripple. No arms. Floats high, sees what hides."""
    fig = B.Figure('listener', lo=(-2.2, -.1, -2.2), hi=(2.2, 2.6, 2.2), coarse=.02, detail=1.0, paint=1024, brush=1.3)
    Y = 1.4
    for g, p, par in (('body', (0, 0, 0), None), ('head', (0, Y, .3), 'body'), ('halo', (0, Y - .6, 0), 'body'),
                      ('wingL', (-.3, Y + .1, -.1), 'body'), ('wingR', (.3, Y + .1, -.1), 'body')):
        fig.group(g, p, par)
    # the trumpet: a horn that widens forward to a flared mouth, its back end curled up and over in a spiral
    pts = [V(0, Y + .25, -.9), V(0, Y + .5, -.6), V(0, Y + .35, -.3), V(0, Y + .05, -.2), V(0, Y - .05, .1), V(0, Y, .35)]
    rad = [.04, .08, .12, .16, .22, .32]
    tr = Vk.horn(pts, rad, plates=6, lip=.012)
    mouth = Vk.lathe([(.3, 0), (.42, .08), (.5, .14), (.48, .17)], c=(0, 0, 0))
    mouth = S.moved(mouth, R=rot(PI / 2, 0, 0), d=(0, Y, .32))
    tr = S.union(tr, mouth, k=.04)
    tr = S.cut(tr, S.moved(Vk.lathe([(.0, -.3), (.18, -.05), (.4, .12), (.46, .2)]), R=rot(PI / 2, 0, 0), d=(0, Y, .32)), k=.02)   # hollow down its throat
    fig.add('trumpet', 'head', 'vI', Vk.pits(tr, 2.2), 1800, voxel=.003, uv=('side',))
    fig.add('mouthlip', 'head', 'vG', S.torus((0, Y, .47), .48, .025, FWD), 400, voxel=.003, uv=('front',))
    fig.add('heart', 'head', 'vC', Vk.crystal((0, Y, .0), (0, Y, .32), .1, 6, .4), 120, voxel=.003, sharp=25, glow=.7)
    fig.add('bands', 'head', 'vG', S.union(*[Vk.band(pts, rad, t, .014, .006) for t in (.4, .62, .8)]), 300, voxel=.003)
    # the body: a small shell bead under the trumpet, where the wings and feelers meet
    fig.add('bead', 'body', 'vD', Vk.pits(S.ellipsoid((0, Y - .12, -.25), (.2, .16, .26)), 1.4), 400, voxel=.003, uv=('cyl', V(0, Y, -.25)))
    fig.add('dropper', 'body', 'vC', Vk.crystal((0, Y - .2, -.25), (0, Y - .75, -.3), .07, 5, .3), 80, voxel=.003, sharp=25)
    fl = S.union(*[S.chain(S.bez((sx * .1, Y - .05, -.4), (sx * .5, Y + .2, -1.0), (sx * .7, Y - .3, -1.7), 10), list(np.linspace(.022, .004, 11))) for sx in (-1, 1)],
                 *[S.chain(S.bez((sx * .05, Y - .15, -.35), (sx * .3, Y - .5, -.9), (sx * .25, Y - .9, -1.3), 10), list(np.linspace(.016, .003, 11))) for sx in (-1, 1)])
    fig.add('feelers', 'body', 'vG', fl, 500, voxel=.0025)
    c = V(0, Y - .6, 0)
    fig.add('halo', 'halo', 'teal', S.torus(c, .55, .025), 400, voxel=.004, uv=('top',))
    fig.add('haloinner', 'halo', 'mag', S.torus(c + V(0, -.05, 0), .36, .018), 300, voxel=.004, uv=('top',))
    for sx, g in ((-1, 'wingL'), (1, 'wingR')):
        root = V(sx * .3, Y + .1, -.1)
        for k, (span, up, back, w) in enumerate(((1.5, .35, -.1, .32), (1.15, -.05, -.45, .24))):
            tip = root + V(sx * span, up, back)
            ax = (tip - root) / np.linalg.norm(tip - root)
            R = S.basis(V(0, 1, 0) - ax * ax[1], ax)
            leaf = S.ellipsoid((root + tip) / 2, (w, np.linalg.norm(tip - root) / 2, .006), S.basis(np.cross(ax, V(0, 0, 1)) if abs(ax[2]) < .9 else V(0, 1, 0), ax))
            fig.add('wing%d' % k + g[-1], g, 'vC', leaf, 200, voxel=.0025, uv=('top',), glow=.35)
            fig.add('vein%d' % k + g[-1], g, 'vG', S.chain([root, root + (tip - root) * .5 + V(0, .03, 0), tip], [.018, .012, .004]), 120, voxel=.0025)
    fig.point('eye', (0, Y, .5), 'head')
    return fig, (0, 0, 1.3, 2.8)


if __name__ == '__main__':
    fig, look_at = {'bell': build_bell, 'reedwalker': build_reedwalker, 'knell': build_knell, 'listener': build_listener}[KIND]()
    args = [a for a in sys.argv[1:] if a != KIND]
    png = args[0] if args and args[0].endswith('.png') else None
    only = [a for a in args if not a.endswith('.png')]
    if only:
        fig.parts = [p for p in fig.parts if any(p.name.startswith(o) or p.group == o for o in only)]
    here = __file__.rsplit('/', 1)[0]
    import os
    side = os.environ.get('OUT', here + '/../assets/mesh')
    fig.build(side + '/%s.bin' % KIND if not only else '/tmp/%s-part.bin' % KIND, here + '/out/%s.blend' % KIND if not only else None)
    if png:
        from kit import look
        c = [float(x) for x in os.environ.get('LOOK', '%g,%g,%g,%g' % look_at).split(',')]
        look.render(png, centre=(c[0], -c[1], c[2]), height=c[3], px=int(os.environ.get('PX', 640)))
