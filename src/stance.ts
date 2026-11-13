// Standing at ease: how a body carries itself when it has nothing to do.
//
// A body with no order to walk, nothing to shoot and no work in hand puts its weight on one leg, lets its weapon drop, turns a little off the
// line, looks about, breathes, and now and then shifts to the other leg. The moment it walks, aims or works, the stance drains away and the
// game's own pose is all that is left.
//
// Left alone for a few seconds more, a body settles: a trooper sits down with the rifle across the knees or drops into a wide squat, a walker
// parks on its haunches, the Veyl sink to hang just off the ground with their arms spread, and the Gloam go down on their bellies with their
// legs folded up round them. Those that stay on their feet turn to face whoever is standing next to them, and now and then check a weapon or
// look back over a shoulder.
//
// Everything here is for show, laid over the pose the game gives a body in the same way a flinch is (hitfx.ts): added after the game has
// posed it and taken off again before the next frame. It reads no dice (every choice is a plain hash of the body's number and the clock), so
// it cannot move a bot result, and it does nothing on the match server.
import type * as THREE from 'three';
import { UNIT, Unit, fac } from './data';
import { unitRule } from './core/registry';
import type { Game } from './game';

const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
const smooth = (k: number) => k * k * (3 - 2 * k);

interface St { w: number; side: number; ly: number; lx: number; tg: any[]; ax: string[]; val: number[]; n: number; /** seconds stood idle */ it: number; /** how far settled into the resting pose */ rw: number; /** turned toward a neighbour by this much */ face: number; faceT: number }
/** How one kind of trooper stands. shift: hips over the standing leg (m). tilt: shoulders dropped on that side. blade: one foot ahead of the other.
 *  toe: feet turned out. wide: feet apart. arms: weapon let down. cross: weapon swung across the body. lean: bent at the hips. nod: chin down. turn: off the line. */
interface Man { shift: number; tilt: number; blade: number; toe: number; wide: number; arms: number; cross: number; lean: number; nod: number; turn: number }
const MAN: Record<string, Man> = {
  linesman: { shift: .12, tilt: .15, blade: .3, toe: .45, wide: .05, arms: .85, cross: .5, lean: .02, nod: .04, turn: .7 },
  breacher: { shift: .07, tilt: .07, blade: .3, toe: .3, wide: .12, arms: .4, cross: .16, lean: .12, nod: .1, turn: .4 },
  longshot: { shift: .14, tilt: .17, blade: .2, toe: .5, wide: 0, arms: 1.0, cross: .34, lean: -.07, nod: -.04, turn: .9 },
  patch: { shift: .13, tilt: .15, blade: .24, toe: .45, wide: .03, arms: .7, cross: .4, lean: .04, nod: .06, turn: .8 },
  rigger: { shift: .13, tilt: .16, blade: .2, toe: .5, wide: .04, arms: 0, cross: 0, lean: .13, nod: .14, turn: 1.0 },
  gantry: { shift: .2, tilt: .07, blade: .12, toe: .16, wide: .04, arms: .4, cross: 0, lean: .05, nod: 0, turn: .4 },
};
/** What a body does once it has stood about for a while. 0 stays on its feet, 1 sits on the ground, 2 drops into a wide squat. */
const restOf = (u: Unit) => { const h = hash(u.id, 21), r = unitRule(u.kind).stance?.rest; return r ? r(h) : h < .42 ? 1 : h < .64 ? 2 : 0; };
/** How a body squats when it has none of its own (see StanceLook.squat). */
const SQUAT = { sp: .48, fw: .5, lean: .34, arms: .35, slide: 1, shield: false };

export class Stance {
  private map = new WeakMap<Unit, St>(); private list: St[] = [];
  constructor(private g: Game) { }
  /** Before the game poses the bodies: take last frame's stance back off. */
  pre() { for (const st of this.list) { for (let i = 0; i < st.n; i++) st.tg[i][st.ax[i]] -= st.val[i]; st.n = 0; } this.list.length = 0; }
  /** After the game has posed the bodies: lay the stance over whoever is standing about. */
  post(dt: number) {
    const g = this.g; if (g.evq) return; const t = g.time;
    for (const u of g.units) {
      if (!u.alive) continue; let st = this.map.get(u);
      const working = u.state === 'mining' || u.state === 'build' || u.state === 'repair';
      const idle = !u.moving && !u.target && !working && u.flashT <= 0 && u.swing < .02 && u.wind <= 0 && u.dashT <= 0 && u !== g.me && !u.pilot && !(u.pop > .02);
      if (!st) { if (!idle) continue; st = { w: 0, side: this.sideAt(u, t), ly: 0, lx: 0, tg: [], ax: [], val: [], n: 0, it: 0, rw: 0, face: 0, faceT: 0 }; this.map.set(u, st); }
      st.w += ((idle ? 1 : 0) - st.w) * Math.min(1, dt * (idle ? 2.2 : 7)); st.it = idle ? st.it + dt : 0; if (st.w < .003) { st.w = 0; st.rw = 0; continue; }
      { const at = 2.5 + hash(u.id, 22) * 6; st.rw += ((st.it > at ? 1 : 0) - st.rw) * Math.min(1, dt * (st.it > at ? 1.3 : 7)); }
      // every second or so, see who is standing nearest and turn toward them, so a squad left alone drifts into knots and not a parade line
      if ((st.faceT -= dt) <= 0) { st.faceT = .8 + hash(u.id, 23) * .6; let bd = 36, bx = 0, bz = 0, got = false; for (const o of g.units) { if (o === u || !o.alive || o.team !== u.team) continue; const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = dx * dx + dz * dz; if (d < bd && d > .04) { bd = d; bx = dx; bz = dz; got = true; } }
        if (got && hash(u.id, 24) < .75) { let a = Math.atan2(bx, bz) - u.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); (st as any).want = Math.max(-1.25, Math.min(1.25, a)) * .85; } else (st as any).want = (hash(u.id, 3) - .5) * 1.1; }
      st.face += ((((st as any).want as number) || 0) - st.face) * Math.min(1, dt * 1.6);
      st.side += (this.sideAt(u, t) - st.side) * Math.min(1, dt * 1.5);
      // where it is looking: ahead most of the time, now and then off to one side, held a few seconds
      const lp = 2.6 + hash(u.id, 4) * 3, ln = Math.floor(t / lp + hash(u.id, 5) * 9), away = hash(u.id, ln + 40) < .55;
      const quick = fac(u.team) === 2 ? 7 : 3.2; st.ly += ((away ? (hash(u.id, ln + 60) - .5) * 1.3 : 0) - st.ly) * Math.min(1, dt * quick); st.lx += ((away ? (hash(u.id, ln + 80) - .4) * .22 : 0) - st.lx) * Math.min(1, dt * quick);
      this.list.push(st); const k = smooth(st.w) * (.85 + hash(u.id, 6) * .3), r = u.rig, sd = st.side, br = Math.sin(t * 1.7 + u.id * 1.3), rw = smooth(st.rw) * smooth(st.w);
      const add = (o: any, a: string, v: number) => { o[a] += v; st!.tg[st!.n] = o; st!.ax[st!.n] = a; st!.val[st!.n++] = v; };
      // now and then a few seconds of business: 1 checks the weapon, 2 looks back over a shoulder, 3 scuffs a foot
      const gp = 7 + hash(u.id, 13) * 7, gn = Math.floor(t / gp + hash(u.id, 14) * 9), gt = (t / gp + hash(u.id, 14) * 9 - gn) * gp, gk = gt < 2.6 ? Math.sin(gt / 2.6 * Math.PI) ** .6 * k : 0, gest = gk > 0 ? 1 + Math.floor(hash(u.id, gn + 50) * 3) : 0;
      if (fac(u.team) === 2) this.bug(u, st, k, rw, t, add);
      else if (r.legL && r.legR) {
        const L = unitRule(u.kind).stance, P = MAN[u.kind] || MAN.linesman, hip = r.legL.position.y, big = hip / .93, rest = restOf(u), sit = rest === 1 ? rw : 0, sq = rest === 2 ? rw : 0, up = 1 - sit;
        const dx = sd * P.shift * big * k * up * (1 - sq * .6), a = -sd * P.tilt * k * up * (1 - sq * .5);
        const free = sd > 0 ? r.legL : r.legR, held = sd > 0 ? r.legR : r.legL, sway = Math.sin(t * .45 + u.id * 2.1) * .014 * big * k, s1 = Math.abs(sd) * up * (1 - sq);
        add(u.obj.rotation, 'y', st.face * k + (gest === 2 ? gk * .5 * (hash(u.id, gn) < .5 ? -1 : 1) : 0));
        // hips over the standing leg, shoulders dropped that side; the torso turns about the hips, so the feet stay where they are
        add(r.body.position, 'x', dx + sway + Math.sin(a) * hip); add(r.body.rotation, 'z', a); add(r.body.rotation, 'y', sd * .16 * k * up); add(r.body.rotation, 'x', P.lean * k * up + br * .009 * k);
        for (const l of [r.legL, r.legR]) { const out = l === r.legL ? -1 : 1; add(l.position, 'x', dx + sway); add(l.rotation, 'z', -(dx + sway) / hip + out * P.wide * k * up); add(l.rotation, 'y', out * P.toe * k * (l === free ? 1 : .45) * s1); }
        add(free.rotation, 'x', -P.blade * k * s1 - (gest === 3 ? gk * .35 * Math.abs(Math.sin(gt * 5)) * up * (1 - sq) : 0)); add(held.rotation, 'x', P.blade * .4 * k * s1);
        if (sit > 0) {
          // down on the ground: legs out in front and a little apart, back rounded, the weapon across the knees
          const drop = (hip - .13 * big) * sit, lay = hash(u.id, 25) < .35 ? -.32 : .2;
          add(u.obj.position, 'y', -drop); for (const l of [r.legL, r.legR]) { const out = l === r.legL ? -1 : 1; add(l.rotation, 'x', (-1.5 + out * sd * .09) * sit); add(l.rotation, 'y', out * .22 * sit); }
          add(r.body.rotation, 'x', lay * sit); add(r.body.position, 'z', -.1 * big * sit * (lay > 0 ? 1 : -.4));
          if (r.arms) { add(r.arms.rotation, 'x', (.5 - lay * .9) * sit); add(r.arms.rotation, 'z', sd * .3 * sit); }
          if (L?.tool) { if (r.armL) add(r.armL.rotation, 'x', (-.75 - lay) * sit); if (r.armR) add(r.armR.rotation, 'x', (-.5 - lay) * sit); }
        }
        if (sq > 0) {
          // a wide squat on the haunches (the walker parks the same way): feet apart, hips sunk, weight forward over the knees
          const Q = L?.squat || SQUAT, sp = Q.sp, fw = Q.fw, low = hip * (1 - Math.cos(sp) * Math.cos(fw * .6)) * sq;
          add(u.obj.position, 'y', -low); for (const l of [r.legL, r.legR]) { const out = l === r.legL ? -1 : 1; add(l.rotation, 'z', out * sp * sq); add(l.rotation, 'x', -fw * .6 * sq); add(l.rotation, 'y', out * .3 * sq); }
          add(r.body.rotation, 'x', Q.lean * sq); add(r.body.position, 'z', -.12 * big * sq * Q.slide);
          if (r.arms) add(r.arms.rotation, 'x', Q.arms * sq);
          if (Q.shield && r.armL) { add(r.armL.rotation, 'x', .5 * sq); add(r.armL.rotation, 'z', -.25 * sq); }
        }
        if (r.head) { add(r.head.rotation, 'y', st.ly * 1.3 * k - sd * .16 * k * up + (gest === 2 ? gk * .7 * (hash(u.id, gn) < .5 ? -1 : 1) : 0)); add(r.head.rotation, 'x', (P.nod + st.lx) * k - sq * .3 - sit * .12 + (gest === 1 ? gk * .4 : 0)); add(r.head.rotation, 'z', sd * .1 * k * up); }
        if (r.arms) { const how = .75 + hash(u.id, 11) * .5, cs = hash(u.id, 12) < .7 ? -sd : sd, g1 = gest === 1 ? gk : 0;
          add(r.arms.rotation, 'x', (P.arms * how * (1 - g1 * 1.25) + br * .014) * k * up * (1 - sq * .5)); add(r.arms.rotation, 'y', cs * P.cross * k * up * (1 - g1 * .5)); add(r.arms.rotation, 'z', -cs * P.cross * .3 * k * up + g1 * .5 * k); }
        if (L?.tool) { if (r.armL) { add(r.armL.rotation, 'z', -.16 * k); add(r.armL.rotation, 'x', (.16 + sd * .1) * k * up); } if (r.armR) { add(r.armR.rotation, 'x', (.45 - sd * .1) * k * up); add(r.armR.rotation, 'z', .12 * k); } }
        else if (r.armL) { add(r.armL.rotation, 'x', .4 * k * up * (1 - sq)); add(r.armL.rotation, 'z', -.18 * k * up * (1 - sq)); }                                      // the Breacher lets the shield down
        if (L?.idleTick) { add(r.body.position, 'y', (-.1 + Math.sin(t * 29 + u.id) * .005) * k); }   // settled on its legs, engine ticking over
      } else {
        // the Veyl hang in the air: they drift, turn a shoulder, and let one arm fall lower than the other. Left longer, they sink until the tail all but
        // touches the ground, lean back, open their arms and let the halo tip over.
        const big = !!unitRule(u.kind).heavy, slow = big ? .35 : .6, sw = Math.sin(t * slow + u.id * 1.9), sw2 = Math.sin(t * slow * .7 + u.id * .7), h = UNIT[u.kind].bodyY, med = hash(u.id, 21) < .7 ? rw : 0;
        add(u.obj.rotation, 'y', st.face * (big ? .5 : 1) * k + sw2 * .22 * k);
        add(u.obj.position, 'y', (sw * .08 - med * (big ? .2 : .1)) * k); add(u.obj.position, 'x', sw2 * .12 * k * Math.cos(u.yaw)); add(u.obj.position, 'z', -sw2 * .12 * k * Math.sin(u.yaw));
        add(r.body.rotation, 'z', (sd * .1 + sw * .07) * k); add(r.body.rotation, 'y', (sd * .26 + sw2 * .1) * k); add(r.body.rotation, 'x', (-.08 + sw2 * .04 - med * .13) * k); add(r.body.position, 'x', -(sd * .1 + sw * .07) * k * h * .5);
        if (r.head) { add(r.head.rotation, 'y', st.ly * 1.3 * k - sd * .26 * k + (gest === 2 ? gk * .6 : 0)); add(r.head.rotation, 'x', (st.lx + .06 + med * .28) * k); add(r.head.rotation, 'z', -sd * .16 * k); }
        if (r.armL) { add(r.armL.rotation, 'z', -(.12 + sd * .12 + br * .02 + med * .42) * k); add(r.armL.rotation, 'x', (sd * .3 + sw * .06 - med * .25) * k); }
        if (r.armR) { add(r.armR.rotation, 'z', (.12 - sd * .12 + br * .02 + med * .42) * k); add(r.armR.rotation, 'x', (-sd * .3 - sw * .06 - med * .25) * k); }
        if (r.arms) { add(r.arms.rotation, 'x', (.55 + br * .02 - med * 1.7) * k); add(r.arms.rotation, 'y', -sd * .34 * k * (1 - med)); }                             // the Lancer rests its lance, then stands it upright
        if (r.halo) { add(r.halo.rotation, 'x', (sw * .12 + med * .7) * k); add(r.halo.rotation, 'y', sw2 * .2 * k); }
      }
    }
  }
  /** Which leg a body is standing on (-1 left, 1 right). It changes its mind every so often. */
  private sideAt(u: Unit, t: number) { const p = 7 + hash(u.id, 1) * 9, n = Math.floor(t / p + hash(u.id, 2) * 9); return hash(u.id, n + 10) < .5 ? -1 : 1; }
  /** The Gloam do not stand, they crouch: sunk on their legs, sides going in and out, legs set unevenly, a foot lifted now and then. Left longer they
   *  go down on their bellies with their legs folded up round them, and every so often one rears up to taste the air. */
  private bug(u: Unit, st: St, k: number, rw: number, t: number, add: (o: any, a: string, v: number) => void) {
    const r = u.rig, sd = st.side, h = UNIT[u.kind].bodyY, br = Math.sin(t * (unitRule(u.kind).stance?.breath ?? 2.6) + u.id * 1.3), legs: THREE.Object3D[] = u.obj.userData.legs || [];
    const rp = 9 + hash(u.id, 26) * 8, rn = Math.floor(t / rp + hash(u.id, 27) * 9), rt = (t / rp + hash(u.id, 27) * 9 - rn) * rp, rear = rt < 1.8 && hash(u.id, rn + 70) < .6 ? Math.sin(rt / 1.8 * Math.PI) ** .7 * k : 0;
    const down = (hash(u.id, 21) < .75 ? rw : 0) * (1 - rear), low = (.1 + down * .36) * h;
    add(u.obj.rotation, 'y', st.face * .9 * k);
    add(u.obj.position, 'y', -low * k * .8); add(r.body.position, 'y', (-low * .2 - br * .02 * h) * k); add(r.body.rotation, 'z', sd * (.1 + down * .1) * k); add(r.body.rotation, 'x', (.07 + down * .1 - rear * .5) * k); add(r.body.rotation, 'y', sd * .14 * k);
    add(r.body.scale, 'x', br * .035 * k); add(r.body.scale, 'z', br * .025 * k); add(r.body.scale, 'y', -br * .02 * k);
    if (r.head) { const sniff = hash(u.id, Math.floor(t / 3.1 + hash(u.id, 7) * 5) + 20) < .4 ? Math.sin(t * 13 + u.id) * .07 : 0; add(r.head.rotation, 'y', st.ly * 1.1 * k); add(r.head.rotation, 'x', (st.lx + .1 + sniff + down * .2 - rear * .35) * k); add(r.head.rotation, 'z', -sd * .2 * k); }
    // one foot picked up and set down again, a different one each time
    const tp = 2.3 + hash(u.id, 8) * 2.5, tn = t / tp + hash(u.id, 9) * 7, ti = Math.floor(tn), tf = (tn - ti) * tp, pick = legs.length ? Math.floor(hash(u.id, ti + 30) * legs.length * 1.6) : -1;
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i], sx = l.name[3] === 'L' ? -1 : 1, front = +l.name[2] === 0, set = (hash(u.id, i + 100) - .5) * .5, lift = i === pick && tf < .45 ? Math.sin(tf / .45 * Math.PI) : 0;
      add(l.rotation, 'y', (set + lift * .25) * k); add(l.rotation, 'z', sx * (.1 + down * .42 + (1 + br * .25) * .04 + lift * .4 + (front ? rear * .7 : 0)) * k);
    }
  }
}
