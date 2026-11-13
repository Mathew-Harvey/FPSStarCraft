"""The Rigger: Ironhold's miner and builder, and the first body the player wears.

Stocky, past fifty, a paunch pushing his hi-vis vest open, sleeves rolled, a walrus moustache under round goggles and a
brimmed hard hat with a lamp. Run with the Python that has bpy installed:  python rigger.py [preview.png] [part ...]
"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kit import sdf as S, build as B, human as Hu
from kit.sdf import V, rot

PI = np.pi
fig = B.Figure('rigger', scale=1.06, detail=.85, paint=1024, grade=(.96, 1.06), hi=(1.2, 2.6, 1.2))      # he is all cloth, which takes the deepest tone: keep him as warm and light as the troopers' plate
HIP = .93
fig.group('body', (0, 0, 0))
fig.group('legL', (-.105, HIP, 0))
fig.group('legR', (.105, HIP, 0))
fig.group('head', (0, 1.5, 0), 'body', scale=1.1)
fig.group('armL', (-.225, 1.425, 0), 'body')
fig.group('armR', (.225, 1.425, 0), 'body')


# ---------------------------------------------------------------- legs
Hu.both_legs(fig, Hu.leg_parts(HIP))

# ---------------------------------------------------------------- pelvis and belt
ring = Hu.ring
pelvis = S.union(S.ellipsoid((0, .93, -.005), (.2, .13, .135)), S.ellipsoid((0, .9, -.07), (.17, .11, .1)), k=.05)
pelvis = S.cut(pelvis, S.above(1.03))
pelvis = S.bump(pelvis, lambda p: (S.noise(p, 20, 1.7) - .5) * .006)
pelvis = S.groove(pelvis, [V(0, 1.03, .13), V(0, .9, .135), V(0, .83, .1)], .006, .006)          # the fly
fig.add('pelvis', 'body', 'fabT', pelvis, 500, voxel=.0035, uv=('cyl', V(0, .93, 0)))
belt = ring((0, 1.02, .005), .208, .152, .028, .02)
belt = S.cut(belt, *[S.sphere((np.sin(a) * .2, 1.02, .005 + np.cos(a) * .146), .0055) for a in (-.5, -.35, .35, .5)])
fig.add('belt', 'body', 'leaB', belt, 380, voxel=.003, uv=('wrap', V(0, 1.02, 0)))
buckle = S.cut(S.box((0, 1.02, .158), (.034, .03, .008), .006), S.box((0, 1.02, .166), (.02, .017, .008), .003))
buckle = S.union(buckle, S.rcone((-.012, 1.02, .163), (.02, 1.02, .163), .004))
fig.add('buckle', 'body', 'nS', buckle, 120, voxel=.002, uv=('front',), sharp=30)
# what a rigger hangs off his belt: a fat pouch, a tape, and a spanner through a loop
pouch = S.union(S.box((-.185, .965, .05), (.03, .055, .05), .02, rot(0, .35, 0)), S.box((-.2, 1.0, .055), (.024, .028, .054), .012, rot(0, .35, 0)), k=.004)
pouch = S.union(pouch, S.sphere((-.222, .985, .062), .008))
fig.add('pouch', 'body', 'lea', pouch, 260, voxel=.0025, uv=('side',))
pouch2 = S.union(S.box((.13, .96, -.135), (.05, .05, .028), .018, rot(0, -.5, 0)), S.box((.13, .995, -.143), (.052, .024, .022), .01, rot(0, -.5, 0)), k=.004)
fig.add('pouchB', 'body', 'lea', pouch2, 220, voxel=.0025, uv=('front',))
sp = S.union(S.rcone((.2, 1.0, .03), (.215, .8, .045), .011, .012), S.cut(S.cyl((.217, .775, .03), (.217, .775, .06), .03, .004), S.box((.222, .752, .045), (.012, .03, .03))), k=.006)
sp = S.union(sp, S.cyl((.198, 1.005, .02), (.198, 1.005, .05), .022, .004), k=.006)
fig.add('spanner', 'body', 'nS', sp, 220, voxel=.002, uv=('side',), sharp=35)
fig.add('loop', 'body', 'leaB', ring((.207, .955, .037), .028, .028, .016, .007), 90, voxel=.002)

# ---------------------------------------------------------------- torso: shirt, vest, neckerchief
chest = S.ellipsoid((0, 1.31, -.005), (.2, .17, .125))
shoulders = S.union(S.rcone((0, 1.455, -.014), (-.2, 1.405, -.012), .078, .062), S.rcone((0, 1.455, -.014), (.2, 1.405, -.012), .078, .062), k=.03)   # sloping from the neck, not a coat hanger
belly = S.ellipsoid((0, 1.14, .05), (.198, .15, .17))
back = S.ellipsoid((0, 1.24, -.04), (.185, .21, .105))
torso = S.union(chest, shoulders, belly, back, k=.07)
torso = S.cut(torso, S.below(1.0))
shirt = S.bump(torso, lambda p: (S.noise(p, 18, 5.3) - .5) * .005)
shirt = S.groove(shirt, [V(0, 1.47, .1), V(0, 1.3, .135), V(0, 1.1, .225), V(0, 1.0, .19)], .005, .005)   # the button line
for i in range(4):
    y = 1.38 - i * .095
    shirt = S.union(shirt, S.sphere((0.006, y, .112 + (1.38 - y) * .31 + (.016 if i > 1 else 0)), .008))
collar = S.union(S.rcone((-.03, 1.5, .075), (-.085, 1.475, .02), .017, .02), S.rcone((.03, 1.5, .075), (.085, 1.475, .02), .017, .02), S.rcone((-.085, 1.475, .02), (0, 1.49, -.07), .02, .02), S.rcone((.085, 1.475, .02), (0, 1.49, -.07), .02, .02), k=.012)
shirt = S.union(shirt, collar, k=.012)
fig.add('shirt', 'body', 'fabT', shirt, 1100, voxel=.0035, uv=('cyl', V(0, 1.25, 0)))
# the vest sits a finger proud of the shirt and no longer closes over the paunch
vest = S.cut(S.grow(torso, .017), S.grow(torso, .003))
vest = S.cut(vest, S.below(1.045), S.above(1.455))
vest = S.cut(vest, S.sphere((-.238, 1.405, -.005), .098), S.sphere((.238, 1.405, -.005), .098))                 # arm holes
opening = S.both(S.box((0, 1.2, .2), (.5, .5, .2)), lambda p: np.abs(p[..., 0]) - (.03 + np.clip(p[..., 1] - 1.2, 0, 1) * .22 + np.clip(1.2 - p[..., 1], 0, 1) * .12))
vest = S.cut(vest, opening, k=.006)
vest = S.cut(vest, S.both(S.box((0, 1.42, -.2), (.5, .1, .1)), lambda p: np.abs(p[..., 0]) - (.075 - (1.46 - p[..., 1]) * .5)), k=.006)   # scooped at the back of the neck
for sx in (-1, 1):
    pk = S.box((sx * .118, 1.115, .188), (.05, .04, .016), .01, rot(-.25, sx * .5, 0))
    fl = S.box((sx * .118, 1.152, .184), (.053, .014, .018), .007, rot(-.25, sx * .5, 0))
    vest = S.union(S.union(vest, pk, k=.005), fl, k=.003)
vest = S.union(vest, S.box((-.11, 1.345, .118), (.04, .034, .012), .008, rot(-.1, -.45, 0)), k=.004)            # chest pocket
fig.add('vest', 'body', 'vestB', vest, 1700, voxel=.003, uv=('wrap', V(0, 1.25, 0)))
pencil = S.union(S.cyl((-.125, 1.34, .135), (-.122, 1.43, .128), .0065, .001), S.rcone((-.122, 1.43, .128), (-.1215, 1.445, .127), .006, .001))
fig.add('pencil', 'body', 'nY', pencil, 60, voxel=.0015, uv=('front',))
book = S.box((-.095, 1.375, .133), (.024, .034, .006), .003, rot(-.1, -.45, .05))
fig.add('notebook', 'body', 'nW', book, 40, voxel=.002, uv=('front',))
ker = S.torus((0, 1.498, .0), .078, .026, rot(.12, 0, 0), squash=1.25)
K = S.Limb((0, 1.47, 0), (0, 1.53, 0))
ker = S.bump(ker, K.folds([(.3, .6, 1.0, .006, .25, .2), (.6, -.7, 1.1, .006, .25, -.2), (.5, 2.6, 1.2, .005, .25, .1)], sharp=.6))
knot = S.ellipsoid((.012, 1.47, .092), (.03, .024, .024))
tail1 = S.union(*[S.rcone(a, b, r0, r1) for a, b, r0, r1 in [((.01, 1.465, .1), (-.02, 1.4, .128), .02, .028), ((-.02, 1.4, .128), (-.035, 1.345, .14), .028, .008)]], k=.01)
tail2 = S.union(*[S.rcone(a, b, r0, r1) for a, b, r0, r1 in [((.02, 1.465, .1), (.055, 1.41, .12), .018, .025), ((.055, 1.41, .12), (.075, 1.365, .125), .025, .008)]], k=.01)
tails = S.squash(S.union(tail1, tail2), (1, 1, .55), (0, 1.4, .13))
ker = S.union(ker, knot, tails, k=.01)
fig.add('kerchief', 'body', 'fabR', ker, 650, voxel=.0025, uv=('cyl', V(0, 1.45, 0)))

# ---------------------------------------------------------------- arms
arm_parts = Hu.arm_parts
armL, HL = arm_parts(-1, (-.225, 1.425, 0), (-.285, 1.18, -.03), (-.275, .95, .05), (-1, 0, 0), 1)
for name, (mat, fn, tris, kw) in armL.items():
    fig.add(name + 'L', 'armL', mat, fn, tris, **kw)
armR, HR = arm_parts(1, (.225, 1.425, 0), (.29, 1.2, -.05), (.255, 1.075, .17), (1, 0, 0), -1)
for name, (mat, fn, tris, kw) in armR.items():
    fig.add(name + 'R', 'armR', mat, fn, tris, **kw)


# ---------------------------------------------------------------- rock drill, in the drill hand
HRl, RhR = HR
G = HRl((0, -.022, .088))                                      # where the grip passes through the fist
gx = RhR[:, 0]                                                 # the grip's own line, raked back like a pistol grip
Dm = S.basis((0, -.14, 1), (0, 1, 0))                          # the drill looks a little below level
DC = G - gx * .125 + Dm @ V(0, .0, .05)
D = lambda q: DC + Dm @ V(q)
def dspace(f):
    return S.moved(lambda p: f(p), d=DC, R=Dm)
house = S.box((0, 0, 0), (.056, .064, .125), .024)
house = S.union(house, S.cyl((-.03, .058, -.05), (.03, .058, -.05), .05, .012), k=.02)             # the motor hump
for i in range(4):
    house = S.cut(house, S.box((0, .03, -.095 + i * .022), (.08, .06, .0045)), k=.003)              # cooling slots at the back
house = S.cut(house, S.box((.062, -.01, .04), (.012, .03, .05), .006), S.box((-.062, -.01, .04), (.012, .03, .05), .006), k=.004)
for q in ((.057, .04, .1), (.057, -.045, .1), (-.057, .04, .1), (-.057, -.045, .1)):
    house = S.union(house, S.sphere(q, .0085))
fig.add('drillbody', 'armR', 'chest', dspace(house), 560, voxel=.0025, uv=('side',), sharp=35)
chuck = S.union(S.cyl((0, 0, .12), (0, 0, .15), .052, .008), S.cyl((0, 0, .148), (0, 0, .2), .04, .006), S.cyl((0, 0, .196), (0, 0, .215), .046, .006), k=.004)
fig.add('drillchuck', 'armR', 'nD', dspace(chuck), 260, voxel=.0025, uv=('cyl', D((0, 0, .17)), Dm[:, 2]), sharp=35)
def bit(p):
    z = p[..., 2]
    t = np.clip((z - .21) / .3, 0, 1)
    r = .04 * (1 - t) ** .8 + .004
    rad = np.sqrt(p[..., 0] ** 2 + p[..., 1] ** 2)
    th = np.arctan2(p[..., 1], p[..., 0])
    flute = .009 * (1 - t * .6) * np.clip(np.sin(th * 2 + z * 62) * 1.6, -1, 1)
    d = (rad - r - flute) * .7
    return np.maximum(d, np.maximum(.21 - z, z - .515))
fig.add('drillbit', 'armR', 'drill', dspace(bit), 620, voxel=.002, uv=('cyl', D((0, 0, .36)), Dm[:, 2]), sharp=40)
handle = S.cut(S.torus((0, .0, -.14), .055, .013, rot(0, 0, np.pi / 2)), S.box((0, 0, -.06), (.05, .1, .05)))
handle = S.union(handle, S.cyl((-.024, .0, -.195), (.024, 0, -.195), .017, .004), k=.006)
fig.add('drillhandle', 'armR', 'gunm', dspace(handle), 220, voxel=.0025, uv=('side',))
grip = S.cyl(G - gx * .1, G + gx * .075, .0195, .006)
for i in range(4):
    grip = S.cut(grip, S.torus(G + gx * (-.05 + i * .03), .0225, .005, S.basis((0, 0, 1) - gx * gx[2], gx)), k=.003)
fig.add('drillgrip', 'armR', 'rubber', grip, 170, voxel=.002, uv=('side',))
tank = S.union(S.cyl((-.084, .01, -.09), (-.084, .01, .05), .03, .012), S.cyl((-.084, .01, .05), (-.084, .01, .075), .014, .003), S.torus((-.084, .01, -.02), .0305, .005, rot(np.pi / 2, 0, 0)), k=.003)
fig.add('drilltank', 'armR', 'tank', dspace(tank), 240, voxel=.0025, uv=('side',))
hose = S.chain([V(-.084, .01, .075), V(-.08, .03, .105), V(-.05, .06, .1), V(-.03, .068, .07)], .008)
fig.add('drillhose', 'armR', 'rubber', dspace(hose), 90, voxel=.002, uv=('side',))

# ---------------------------------------------------------------- head
HC = V(0, 1.675, -.008)                                                 # middle of the skull
skull = S.ellipsoid(HC, (.093, .112, .108))
jaw = S.union(S.ellipsoid((0, 1.6, .018), (.086, .08, .09)), S.box((0, 1.566, .016), (.058, .022, .05), .03), k=.03)
jowl = S.mirror(S.sphere((.05, 1.578, .03), .046))
chin = S.ellipsoid((0, 1.542, .062), (.05, .036, .038))
cheek = S.mirror(S.ellipsoid((.054, 1.628, .064), (.034, .03, .03)))
face = S.union(skull, jaw, jowl, chin, cheek, k=.035)
nose = S.union(S.rcone((0, 1.695, .092), (0, 1.64, .128), .015, .021), S.sphere((0, 1.63, .133), .03), S.mirror(S.sphere((.024, 1.622, .112), .018)), k=.016)
brow = S.rcone((-.052, 1.708, .082), (.052, 1.708, .082), .02)
face = S.union(face, nose, k=.014)
face = S.union(face, brow, k=.02)
lip = S.ellipsoid((0, 1.572, .09), (.03, .012, .014))
face = S.union(face, lip, k=.01)
face = S.cut(face, S.mirror(S.sphere((.04, 1.676, .105), .03)), k=.012)          # eye sockets, under the goggles
face = S.cut(face, S.mirror(S.sphere((.0245, 1.615, .128), .0075)), k=.004)      # nostrils
for sx in (-1, 1):                                                                # the lines a face earns
    face = S.groove(face, [V(sx * .034, 1.628, .112), V(sx * .058, 1.6, .088), V(sx * .062, 1.57, .07)], .0045, .006)
    face = S.groove(face, [V(sx * .02, 1.548, .09), V(sx * .03, 1.535, .075)], .004, .004)
    ear = S.cut(S.ellipsoid((sx * .099, 1.655, -.004), (.016, .036, .024), rot(0, sx * .5, sx * -.12)), S.ellipsoid((sx * .108, 1.657, .004), (.01, .022, .013), rot(0, sx * .5, sx * -.12)), k=.004)
    face = S.union(face, ear, S.sphere((sx * .1, 1.628, 0), .011), k=.008)
neck = S.union(S.rcone((0, 1.45, -.016), (0, 1.6, -.012), .056, .05), S.ellipsoid((0, 1.52, -.05), (.052, .07, .036)), k=.02)
face = S.union(face, neck, k=.012)
fig.add('face', 'head', 'skinF', face, 2300, voxel=.0022, uv=('cyl', HC))
# a walrus moustache, combed down and out
def tash(sx):
    pts = [V(0, 1.605, .112), V(sx * .03, 1.6, .112), V(sx * .062, 1.578, .094), V(sx * .083, 1.548, .07), V(sx * .088, 1.522, .056)]
    f = S.chain(pts, [.02, .025, .024, .017, .007])
    for j, o in enumerate((-.011, 0, .011)):
        f = S.groove(f, [p + V(0, o + .004, .012 - abs(o) * .3) for p in pts[1:]], .0035, .0045)
    return f
st = S.union(tash(-1), tash(1), k=.012)
fig.add('moustache', 'head', 'stache', st, 620, voxel=.0018, uv=('front',))
brows = S.union(*[S.ellipsoid((sx * .045, 1.722, .094), (.034, .011, .014), rot(0, sx * .3, sx * -.22)) for sx in (-1, 1)])
brows = S.bump(brows, lambda p: (S.noise(p, 160, 2.2) - .5) * .004)
fig.add('brows', 'head', 'stache', brows, 160, voxel=.0018, uv=('front',))
hair = S.cut(S.cut(S.grow(skull, .008), S.above(1.705)), lambda p: -(p[..., 2] - .012 + (p[..., 1] - 1.62) * .25))   # short back and sides
hair = S.cut(hair, skull)
hair = S.bump(hair, lambda p: (S.noise(p * V(1, .25, 1), 150, 4.2) - .5) * .004)
hair = S.cut(hair, S.mirror(S.ellipsoid((.099, 1.655, -.004), (.02, .04, .028))))
fig.add('hair', 'head', 'stache', hair, 300, voxel=.0025, uv=('cyl', HC))
# goggles: two turned cups on a leather strap
cups, lenses = [], []
for sx in (-1, 1):
    c0, c1 = V(sx * .042, 1.676, .084), V(sx * .047, 1.676, .124)
    cup = S.cut(S.cyl(c0, c1, .037, .006), S.cyl(c0 + V(0, 0, .034), c1 + V(sx * .002, 0, .02), .029, .0))
    cup = S.union(cup, S.torus(c1 - V(0, 0, .004), .0355, .0055, S.basis((0, 1, 0), c1 - c0)), k=.003)
    cup = S.union(cup, S.cyl(c0 + V(sx * .034, 0, .012), c0 + V(sx * .05, 0, .004), .011, .003))
    cups.append(cup)
    lenses.append(S.both(S.sphere(c0 + V(sx * .003, 0, -.02), .0575), S.cyl(c0, c1 - V(0, 0, .004), .03, .0)))
cups.append(S.rcone((-.012, 1.68, .112), (.012, 1.68, .112), .007))
fig.add('goggles', 'head', 'gunB', S.union(*cups), 760, voxel=.0018, uv=('front',), sharp=55)
fig.add('lenses', 'head', 'lens', S.union(*lenses), 120, voxel=.002, uv=('front',))
strap = S.cut(S.both(S.cut(S.grow(skull, .008), skull), S.slab((0, 1.676, 0), (0, 1, .0), .017)), lambda p: -p[..., 2] + .07)
fig.add('gogglestrap', 'head', 'leaB', strap, 200, voxel=.0025, uv=('wrap', HC))
# hard hat: a ribbed dome with a brim all the way round, tipped back a touch, and a lamp on the front
HR = rot(-.1, 0, 0)
HP = V(0, 1.722, -.004)
def hatspace(f):
    return S.moved(f, R=HR, c=HP)
dome = S.cut(S.ellipsoid(HP + V(0, .005, 0), (.118, .088, .13)), S.below(1.722))
for x in (-.045, 0, .045):                                                                                   # the ribs pressed into the crown
    rib = S.cut(S.ellipsoid(HP + V(x, .005, 0), (.016, .098 - abs(x) * .16, .132 - abs(x) * .2)), S.below(1.722))
    dome = S.union(dome, rib, k=.006)
brim = S.ellipsoid(HP + V(0, 0, .008), (.16, .0165, .18))
brim = S.bump(brim, lambda p: -((p[..., 0] / .158) ** 2) * .012)                                              # the brim droops at the sides
band = S.cut(S.ellipsoid(HP + V(0, .005, 0), (.1215, .03, .1335)), S.below(1.722))
hat = S.union(dome, brim, band, k=.008)
hat = S.cut(hat, S.cut(S.ellipsoid(HP + V(0, 0, 0), (.108, .078, .12)), S.above(1.76)))                      # hollow underneath
fig.add('hat', 'head', 'hard', hatspace(hat), 1150, voxel=.0022, uv=('top',))
lamp = S.union(S.box(HP + V(0, .045, .118), (.022, .02, .014), .005), S.cyl(HP + V(0, .048, .122), HP + V(0, .05, .162), .03, .006), S.torus(HP + V(0, .05, .16), .029, .006, S.basis((0, 1, 0), (0, .04, 1))), k=.004)
fig.add('lamp', 'head', 'nS', hatspace(lamp), 300, voxel=.002, uv=('front',), sharp=32)
fig.add('lampglass', 'head', 'visG', hatspace(S.both(S.sphere(HP + V(0, .05, .13), .042), S.cyl(HP + V(0, .049, .15), HP + V(0, .05, .172), .0245, .0))), 70, voxel=.002, uv=('front',))
cable = S.chain([HP + V(.02, .05, .12), HP + V(.04, .09, .06), HP + V(.045, .095, -.04), HP + V(.03, .04, -.125), HP + V(.02, .0, -.14)], .007)
clipc = S.box(HP + V(.035, .055, -.105), (.012, .008, .012), .003, rot(.5, 0, 0))
fig.add('cable', 'head', 'rubber', hatspace(S.union(cable, clipc)), 160, voxel=.002, uv=('side',))

# ---------------------------------------------------------------- the pack frame: he carries his own shelf, and the ore rides on it
# Two steel uprights against his back, bent over at the top into a hoop that stands above his hat, a shelf to stand the ore box on,
# a pick lashed down one side and a hurricane lamp swinging off the hoop.
FZ = -.2
ups = [S.chain([V(sx * .2, .98, FZ), V(sx * .2, 1.6, FZ - .005), V(sx * .19, 1.9, FZ - .03), V(sx * .12, 2.02, FZ - .05), V(0, 2.05, FZ - .055)], .016) for sx in (-1, 1)]
bars = [S.cyl((-.2, y, FZ - dz), (.2, y, FZ - dz), .013, .003) for y, dz in ((1.04, 0), (1.52, .005), (1.82, .02))]
shelf = [S.chain([V(sx * .2, .99, FZ), V(sx * .2, .985, FZ - .25), V(sx * .2, 1.03, FZ - .27)], .014) for sx in (-1, 1)] + [S.cyl((-.2, .985, FZ - .25), (.2, .985, FZ - .25), .013, .003)]
fig.add('frame', 'body', 'nS', S.union(*ups, *bars, *shelf, k=.006), 760, voxel=.003, uv=('front',), sharp=50)
straps = []
for sx in (-1, 1):                                                                                                # a strap over each shoulder, round under the arm and back to the frame
    st = S.both(S.cut(S.grow(torso, .03), S.grow(torso, .016)), S.slab((sx * .125, 0, 0), (1, .0, 0), .021))
    straps.append(S.cut(st, S.below(1.16)))
    straps.append(S.chain([V(sx * .125, 1.45, -.13), V(sx * .16, 1.5, FZ + .01)], .014))
fig.add('framestraps', 'body', 'leaB', S.union(*straps), 420, voxel=.003, uv=('side',))
roll = S.cyl((-.21, 1.93, FZ - .12), (.21, 1.93, FZ - .12), .075, .03)                                           # bedroll lashed under the hoop
roll = S.bump(roll, lambda p: .005 * np.sin(np.arctan2(p[..., 1] - 1.93, p[..., 2] - FZ + .12) * 5 + p[..., 0] * 30) + (S.noise(p, 30, 2.2) - .5) * .006)
fig.add('bedroll', 'body', 'fabG', roll, 420, voxel=.003, uv=('front',))
fig.add('rollties', 'body', 'leaB', S.union(*[S.torus((x, 1.93, FZ - .12), .078, .01, rot(0, 0, PI / 2)) for x in (-.12, .12)]), 140, voxel=.003)
# the pick: handle down the left upright, head up above the hoop
PH = V(-.255, 2.0, FZ - .03)
pick = S.union(S.rcone((-.25, 1.02, FZ - .02), PH, .017, .02), k=0)
fig.add('pickhandle', 'body', 'wood', pick, 160, voxel=.003, uv=('side',))
head_ = S.union(S.chain(S.bez(PH + V(0, .0, .2), PH + V(0, .06, 0), PH + V(0, -.02, -.22), 8), list(np.concatenate([np.linspace(.008, .024, 4), np.linspace(.024, .018, 5)]))), S.box(PH, (.022, .026, .03), .008), k=.008)
fig.add('pickhead', 'body', 'nD', head_, 240, voxel=.0025, uv=('side',), sharp=40)
fig.add('pickties', 'body', 'leaB', S.union(*[S.torus((-.225, y, FZ - .01), .034, .008) for y in (1.2, 1.7)]), 100, voxel=.0025)
# the lamp, on a hook off the right of the hoop
LH = V(.26, 1.86, FZ - .04)
hook = S.chain([V(.15, 2.0, FZ - .05), V(.25, 2.03, FZ - .05), V(.265, 1.98, FZ - .045), LH + V(0, .07, 0)], .008)
lamp = S.union(S.cyl(LH + V(0, -.085, 0), LH + V(0, -.06, 0), .04, .006), S.cyl(LH + V(0, .03, 0), LH + V(0, .05, 0), .036, .006), S.rcone(LH + V(0, .05, 0), LH + V(0, .075, 0), .024, .01),
               *[S.cyl(LH + V(np.cos(a) * .036, -.06, np.sin(a) * .036), LH + V(np.cos(a) * .034, .03, np.sin(a) * .034), .004) for a in (0, 2.1, 4.2)], S.torus(LH + V(0, .075, 0), .02, .004, rot(PI / 2, 0, 0)))
fig.add('lamphook', 'body', 'nD', hook, 80, voxel=.002)
fig.add('lampcage', 'body', 'nD', lamp, 260, voxel=.002, uv=('side',), sharp=40)
fig.add('lampflame', 'body', 'visG', S.ellipsoid(LH + V(0, -.015, 0), (.027, .042, .027)), 70, voxel=.002, uv=('side',))

if __name__ == '__main__':
    args = sys.argv[1:]
    png = args[0] if args and args[0].endswith('.png') else None
    only = [a for a in args if not a.endswith('.png')]
    if only:
        fig.parts = [p for p in fig.parts if any(p.name.startswith(o) or p.group == o for o in only)]
    here = __file__.rsplit('/', 1)[0]
    fig.build(here + '/../assets/mesh/rigger.bin' if not only else '/tmp/rigger-part.bin', here + '/out/rigger.blend' if not only else None)
    if png:
        from kit import look
        import os
        c = [float(x) for x in os.environ.get('LOOK', '0,0,1.0,2.2').split(',')]
        look.render(png, centre=(c[0], -c[1], c[2]), height=c[3], px=int(os.environ.get('PX', 640)))
