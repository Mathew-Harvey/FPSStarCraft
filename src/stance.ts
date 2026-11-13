// Standing at ease: how a body carries itself when it has nothing to do.
//
// A body with no order to walk, nothing to shoot and no work in hand puts its weight on one leg, lets its weapon drop, turns a little off the
// line, looks about, breathes, and now and then shifts to the other leg. The moment it walks, aims or works, the stance drains away and the
// game's own pose is all that is left.
//
// Everything here is for show, laid over the pose the game gives a body in the same way a flinch is (hitfx.ts): added after the game has
// posed it and taken off again before the next frame. It reads no dice (every choice is a plain hash of the body's number and the clock), so
// it cannot move a bot result, and it does nothing on the match server.
import type * as THREE from 'three';
import { UNIT, Unit, fac } from './data';
import type { Game } from './game';

const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
const smooth = (k: number) => k * k * (3 - 2 * k);

interface St { w: number; side: number; ly: number; lx: number; tg: any[]; ax: string[]; val: number[]; n: number }
/** How one kind of trooper stands. shift: hips over the standing leg (m). tilt: shoulders dropped on that side. blade: one foot ahead of the other.
 *  toe: feet turned out. wide: feet apart. arms: weapon let down. cross: weapon swung across the body. lean: bent at the hips. nod: chin down. turn: off the line. */
interface Man { shift: number; tilt: number; blade: number; toe: number; wide: number; arms: number; cross: number; lean: number; nod: number; turn: number }
const MAN: Record<string, Man> = {
  linesman: { shift: .07, tilt: .08, blade: .2, toe: .34, wide: .025, arms: .46, cross: .36, lean: .0, nod: .04, turn: .6 },
  breacher: { shift: .035, tilt: .035, blade: .24, toe: .26, wide: .08, arms: .18, cross: .1, lean: .08, nod: .1, turn: .35 },
  longshot: { shift: .085, tilt: .1, blade: .13, toe: .38, wide: 0, arms: .6, cross: .24, lean: -.04, nod: -.03, turn: .8 },
  patch: { shift: .075, tilt: .085, blade: .16, toe: .34, wide: .015, arms: .38, cross: .26, lean: .025, nod: .06, turn: .7 },
  rigger: { shift: .08, tilt: .095, blade: .14, toe: .4, wide: .02, arms: 0, cross: 0, lean: .1, nod: .14, turn: .9 },
  gantry: { shift: .13, tilt: .04, blade: .09, toe: .12, wide: .02, arms: .24, cross: 0, lean: .035, nod: 0, turn: .35 },
};

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
      if (!st) { if (!idle) continue; st = { w: 0, side: this.sideAt(u, t), ly: 0, lx: 0, tg: [], ax: [], val: [], n: 0 }; this.map.set(u, st); }
      st.w += ((idle ? 1 : 0) - st.w) * Math.min(1, dt * (idle ? 2.2 : 9)); if (st.w < .003) { st.w = 0; continue; }
      st.side += (this.sideAt(u, t) - st.side) * Math.min(1, dt * 1.5);
      // where it is looking: ahead most of the time, now and then off to one side, held a few seconds
      const lp = 2.6 + hash(u.id, 4) * 3, ln = Math.floor(t / lp + hash(u.id, 5) * 9), away = hash(u.id, ln + 40) < .55;
      const quick = fac(u.team) === 2 ? 7 : 3.2; st.ly += ((away ? (hash(u.id, ln + 60) - .5) * 1.3 : 0) - st.ly) * Math.min(1, dt * quick); st.lx += ((away ? (hash(u.id, ln + 80) - .4) * .22 : 0) - st.lx) * Math.min(1, dt * quick);
      this.list.push(st); const k = smooth(st.w) * (.8 + hash(u.id, 6) * .4), r = u.rig, sd = st.side, br = Math.sin(t * 1.7 + u.id * 1.3);
      const add = (o: any, a: string, v: number) => { o[a] += v; st!.tg[st!.n] = o; st!.ax[st!.n] = a; st!.val[st!.n++] = v; };
      if (fac(u.team) === 2) this.bug(u, st, k, t, add);
      else if (r.legL && r.legR) {
        const P = MAN[u.kind] || MAN.linesman, hip = r.legL.position.y, big = hip / .93, dx = sd * P.shift * big * k, a = -sd * P.tilt * k;
        const free = sd > 0 ? r.legL : r.legR, held = sd > 0 ? r.legR : r.legL, sway = Math.sin(t * .45 + u.id * 2.1) * .012 * big * k, s1 = Math.abs(sd);
        add(u.obj.rotation, 'y', (hash(u.id, 3) - .5) * P.turn * k);
        // hips over the standing leg, shoulders dropped that side; the torso turns about the hips, so the feet stay where they are
        add(r.body.position, 'x', dx + sway + Math.sin(a) * hip); add(r.body.rotation, 'z', a); add(r.body.rotation, 'y', sd * .11 * k); add(r.body.rotation, 'x', P.lean * k + br * .007 * k);
        for (const l of [r.legL, r.legR]) { const out = l === r.legL ? -1 : 1; add(l.position, 'x', dx + sway); add(l.rotation, 'z', -(dx + sway) / hip + out * P.wide * k); add(l.rotation, 'y', out * P.toe * k * (l === free ? 1 : .45) * s1); }
        add(free.rotation, 'x', -P.blade * k * s1); add(held.rotation, 'x', P.blade * .4 * k * s1);
        if (r.head) { add(r.head.rotation, 'y', st.ly * k - sd * .11 * k); add(r.head.rotation, 'x', (P.nod + st.lx) * k); add(r.head.rotation, 'z', sd * .07 * k); }
        if (r.arms) { const how = .65 + hash(u.id, 11) * .7, cs = hash(u.id, 12) < .7 ? -sd : sd; add(r.arms.rotation, 'x', (P.arms * how + br * .012) * k); add(r.arms.rotation, 'y', cs * P.cross * k); add(r.arms.rotation, 'z', -cs * P.cross * .3 * k); }
        if (u.kind === 'rigger') { if (r.armL) { add(r.armL.rotation, 'z', -.1 * k); add(r.armL.rotation, 'x', (.1 + sd * .08) * k); } if (r.armR) { add(r.armR.rotation, 'x', (.3 - sd * .08) * k); add(r.armR.rotation, 'z', .08 * k); } }
        else if (r.armL) { add(r.armL.rotation, 'x', .22 * k); add(r.armL.rotation, 'z', -.1 * k); }                                      // the Breacher lets the shield down a little
        if (u.kind === 'gantry') { add(r.body.position, 'y', (-.07 + Math.sin(t * 29 + u.id) * .004) * k); }   // settled on its legs, engine ticking over
      } else {
        // the Veyl hang in the air: they drift, turn a shoulder, and let one arm fall lower than the other
        const big = u.kind === 'warden', slow = big ? .35 : .6, sw = Math.sin(t * slow + u.id * 1.9), sw2 = Math.sin(t * slow * .7 + u.id * .7), h = UNIT[u.kind].bodyY;
        add(u.obj.rotation, 'y', (hash(u.id, 3) - .5) * (big ? .3 : .7) * k);
        add(r.body.rotation, 'z', (sd * .04 + sw * .03) * k); add(r.body.rotation, 'y', (sd * .16 + sw2 * .06) * k); add(r.body.rotation, 'x', (-.05 + sw2 * .02) * k); add(r.body.position, 'x', -(sd * .04 + sw * .03) * k * h * .5);
        if (r.head) { add(r.head.rotation, 'y', st.ly * k - sd * .16 * k); add(r.head.rotation, 'x', (st.lx + .04) * k); add(r.head.rotation, 'z', -sd * .09 * k); }
        if (r.armL) { add(r.armL.rotation, 'z', -(.07 + sd * .06 + br * .012) * k); add(r.armL.rotation, 'x', (sd * .16 + sw * .03) * k); }
        if (r.armR) { add(r.armR.rotation, 'z', (.07 - sd * .06 + br * .012) * k); add(r.armR.rotation, 'x', (-sd * .16 - sw * .03) * k); }
        if (r.arms) { add(r.arms.rotation, 'x', (.3 + br * .012) * k); add(r.arms.rotation, 'y', -sd * .22 * k); }                             // the Lancer rests its lance
        if (r.halo) add(r.halo.rotation, 'x', sw * .05 * k);
      }
    }
  }
  /** Which leg a body is standing on (-1 left, 1 right). It changes its mind every so often. */
  private sideAt(u: Unit, t: number) { const p = 7 + hash(u.id, 1) * 9, n = Math.floor(t / p + hash(u.id, 2) * 9); return hash(u.id, n + 10) < .5 ? -1 : 1; }
  /** The Gloam do not stand, they crouch: sunk on their legs, sides going in and out, legs set unevenly, a foot lifted now and then. */
  private bug(u: Unit, st: St, k: number, t: number, add: (o: any, a: string, v: number) => void) {
    const r = u.rig, sd = st.side, h = UNIT[u.kind].bodyY, br = Math.sin(t * (u.kind === 'mulcher' ? 1.3 : 2.6) + u.id * 1.3), legs: THREE.Object3D[] = u.obj.userData.legs || [];
    add(u.obj.rotation, 'y', (hash(u.id, 3) - .5) * .9 * k);
    add(r.body.position, 'y', (-.05 - br * .012) * h * k); add(r.body.rotation, 'z', sd * .06 * k); add(r.body.rotation, 'x', .045 * k); add(r.body.rotation, 'y', sd * .08 * k);
    add(r.body.scale, 'x', br * .022 * k); add(r.body.scale, 'z', br * .016 * k); add(r.body.scale, 'y', -br * .012 * k);
    if (r.head) { const sniff = hash(u.id, Math.floor(t / 3.1 + hash(u.id, 7) * 5) + 20) < .4 ? Math.sin(t * 13 + u.id) * .05 : 0; add(r.head.rotation, 'y', st.ly * .7 * k); add(r.head.rotation, 'x', (st.lx + .08 + sniff) * k); add(r.head.rotation, 'z', -sd * .12 * k); }
    // one foot picked up and set down again, a different one each time
    const tp = 2.3 + hash(u.id, 8) * 2.5, tn = t / tp + hash(u.id, 9) * 7, ti = Math.floor(tn), tf = (tn - ti) * tp, pick = legs.length ? Math.floor(hash(u.id, ti + 30) * legs.length * 1.6) : -1;
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i], sx = l.name[3] === 'L' ? -1 : 1, set = (hash(u.id, i + 100) - .5) * .34, lift = i === pick && tf < .45 ? Math.sin(tf / .45 * Math.PI) : 0;
      add(l.rotation, 'y', (set + lift * .2) * k); add(l.rotation, 'z', sx * (-.05 * (1 + br * .25) + lift * .32) * k);
    }
  }
}
