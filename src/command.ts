// The command view and the map. One zoom runs from first person, up through an angled view of the yard where bodies are picked and
// given orders, to the whole map. Nothing here changes the match by itself: orders go through Director.command (or to the server),
// and the rest is the camera, the cursor and what is picked.
//
// The rule that keeps first person the better way to play is LEAD, below: crew near a body somebody is driving fight better, and
// that is switched off for a player who is up here.
import * as THREE from 'three';
import type { Game } from './game';
import { UNIT, BLD, MAP, FACTION, Unit, Building, BKind, Kind, isWorker, fac } from './data';
import { cardFor, Btn, Aim, KEYS, casters, abilityWords, hasBoard, hasAutocast } from './card';
import * as AB from './core/ability';
import { abilityOf, whyNot } from './core/ability';
import { roomOf } from './core/cargo';
import { isEnemy } from './core/sides';
import { bldRule } from './core/registry';
import { costOf, canPay } from './core/econ';
import { V3, L_FX } from './gfx';
import { sfx, drillSound } from './audio';

/** Leading in person. Fighters the game is driving, within `reach` metres of a body one of their own side's players is driving, deal `dmg`
 *  times their damage and take `guard` times what hits them. Set both to 1 to switch it off. */
export const LEAD = { reach: 30, dmg: 1.25, guard: .85 };
/** The zoom: 0 is first person, `lift` and above is the command view, `map` and above is the whole map. */
export const ZOOM = { lift: .12, map: .9, step: .1, near: .2, far: .8, /** how tall a slice of ground the view shows at its nearest and furthest, in metres */ h0: 13, h1: 105, fov: 22 };

const A = V3(), B = V3(), P3 = V3(), AUX = new THREE.Object3D();
/** One order for one body: go (m), attack (a), work a seam (o), build or mend (b), or walk back and forth fighting (p, between x,z and x2,z2).
 *  `n` is how many were sent together, so a block of bodies counts as there once its middle is close; `t` is how long it has run. */
export interface Step { k: 'm' | 'a' | 'o' | 'b' | 'p'; x: number; z: number; id: number; n: number; t: number; x2?: number; z2?: number; /** closest it has come, and when */ best?: number; bestT?: number }
/** Where a building sends what it trains: a spot on the ground, a body (`id`, followed to wherever it is then), or a seam (`ore`, by index). */
export interface Rally { x: number; z: number; id?: number; ore?: number }
const STEP_COL: Record<string, number[]> = { m: [.55, 1, .45], a: [1, .35, .3], o: [1, .85, .3], b: [.5, .95, 1], p: [.5, .95, 1], r: [1, .78, .1] };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Command {
  /** Where the zoom is now and where it is heading. */
  z = 0; zt = 0;
  /** The spot on the ground the camera looks at. */
  focus = V3();
  /** The cursor, in HUD pixels. The mouse stays captured by the page, so the game draws its own. */
  cx = 800; cy = 450;
  /** The bodies picked, or the one building picked. */
  sel = new Set<Unit>(); selB: Building | null = null;
  /** The box being dragged out, in HUD pixels, for the HUD to draw. */
  box: [number, number, number, number] | null = null;
  /** Half the height of ground the view shows, the camera's tilt, and how much the air between is thinned out for the picture. */
  h = ZOOM.h0; pitch = .9; fogK = 1;
  /** Enemy buildings this side has laid eyes on. One raised later on ground already walked over stays hidden until somebody looks again. */
  known = new WeakSet<Building>();
  /** Set by the HUD: turns a cursor spot on the full map into a spot on the ground. */
  mapPt: ((x: number, y: number) => [number, number] | null) | null = null;
  /** No way up for this screen: the second half of a split screen has no mouse to point with. */
  locked = false;
  /** Ten control groups (Digit1 to Digit0): the bodies in each, or the one building. */
  groups: { us: Unit[]; b: Building | null }[] = Array.from({ length: 10 }, () => ({ us: [], b: null }));
  /** Orders queued with Shift, per body, and the one each body is carrying out now. */
  queue = new Map<Unit, Step[]>(); cur = new Map<Unit, Step>();
  /** Where each building sends what it trains: a spot, a body or a seam. */
  rally = new Map<Building, Rally>();
  /** The card's buttons for what is picked, worked out each frame for the HUD to draw. */
  card: Btn[] = [];
  /** The order waiting for a click on the map, and which page of the card is up. */
  aim: Aim | null = null; menu: '' | 'build' = '';
  /** Whether a building being staked out from above is turned, and whether it fits where the cursor is. */
  rot = false; fits = false; stakeAt = V3();
  private seen = new Set<number>(); private seeded = false; private groupT = -9; private groupLast = -1; private idleI = 0;
  private lines: THREE.LineSegments | null = null; private ghosts: Record<string, THREE.Object3D[]> = {}; private pending: { k: BKind; x: number; z: number; t: number; ids: number[] }[] = []; private qT = 0;
  private drag: [number, number] | null = null; private wasL = false; private peekT = 0; private back = 0; private dive: Unit | null = null;
  private clickT = -9; private clickKind = ''; private ackT = 0; private hid = false;
  private fogMesh: THREE.Mesh | null = null; private fogTex: THREE.DataTexture | null = null; private fogA: Float32Array | null = null; private fogD: Uint8Array | null = null; private fogT = 0;

  constructor(private g: Game) { }
  /** The player is out of their body and giving orders. */
  get on() { return this.zt >= ZOOM.lift; }
  /** The whole map is up. */
  get map() { return this.zt >= ZOOM.map; }

  // ------------------------------------------------------------ in and out
  private lift() {
    const g = this.g, me = g.me!; this.focus.set(me.pos.x, 0, me.pos.z); this.cx = g.hud.W / 2; this.cy = g.hud.H / 2; this.sel.clear(); this.selB = null; this.dive = null; this.drag = null; this.box = null; this.wasL = false;
    g.lmb = g.rmb = false; g.ads = 0; g.brace = false; drillSound(false, false); sfx.blip();
    // The body left behind is ordinary crew until somebody comes back to it: a fighter holds where it stands, a worker goes back to work.
    if (!g.net && me.alive) { me.target = null; if (isWorker(me.kind)) { me.site = null; me.state = me.carrying > 0 ? 'toHQ' : 'idle'; } else me.order = { type: 'guard', x: me.pos.x, z: me.pos.z, mine: true }; }
  }
  /** Back down into a body: the one asked for, else the first one picked, else the nearest to the middle of the view, else the one left behind. */
  private land(want: Unit | null = null) {
    const g = this.g, me = g.me, free = (u: Unit) => u.alive && u.team === g.myTeam && (!u.pilot || (!!g.net && u.pilot === g.net.id));
    let u = want && free(want) ? want : null;
    if (!u) for (const s of this.sel) if (free(s)) { u = s; break; }
    if (!u && !this.map) { let bd = this.h * 1.3; for (const o of g.units) { if (!free(o)) continue; const d = Math.hypot(o.pos.x - this.focus.x, o.pos.z - this.focus.z) + (o === me ? -3 : 0); if (d < bd) { bd = d; u = o; } } }
    if (!u || (u !== me && g.jumpCd > 0 && me && me.alive)) u = me;
    this.zt = 0; this.sel.clear(); this.selB = null; this.box = null; this.drag = null; this.aim = null; this.menu = ''; this.dive = null; g.lmb = g.rmb = false; g.pressed.delete('Mouse0'); g.pressed.delete('Mouse2');
    if (!u || !u.alive) return;
    if (u === me) { const cd = g.jumpCd; g.possess(u, true); g.jumpCd = cd; } else g.possess(u);
  }

  // ------------------------------------------------------------ every frame
  update(dt: number, P: Set<string>) {
    const g = this.g, me = g.me; if (!me) return;
    this.z += (this.zt - this.z) * Math.min(1, dt * 7); if (Math.abs(this.zt - this.z) < .0015) this.z = this.zt;
    if (!this.on) this.focus.lerp(A.set(me.pos.x, 0, me.pos.z), Math.min(1, dt * 12));
    for (const u of this.sel) if (!u.alive || u.team !== g.myTeam) this.sel.delete(u);
    if (this.selB && !this.selB.alive) this.selB = null;
    for (const b of g.buildings) if (isEnemy(b.team, g.myTeam) && !this.known.has(b) && g.fog.sees(b.pos.x, b.pos.z)) this.known.add(b);
    this.watchNew(); this.runQueues(dt); this.landPending(dt);
    if (!this.sel.size && !this.selB) { this.aim = null; this.menu = ''; }
    const w = g.wheel, free = me.alive && g.staticT <= 0 && !g.tab && g.introT <= 0 && !this.locked;
    if (!this.on) {
      // One notch out only lifts the camera a little, and it settles back: a wheel bumped in a firefight does not pull anyone out of their body.
      const picking = g.tool === 2 && isWorker(me.kind);   // the wheel is choosing a building
      if (free && !picking && w > 0) { if (this.zt > 0) { this.zt = ZOOM.near; this.lift(); } else { this.zt = .02; this.peekT = .8; } }
      else if (w < 0 && this.zt > 0) this.zt = 0;
      if (this.zt > 0 && !this.on) { this.peekT -= dt; if (this.peekT <= 0 || !free) this.zt = 0; }
      if (free && !this.on && P.has('KeyN')) { this.zt = .3; this.lift(); }
      if (free && !this.on && P.has('KeyM')) { this.back = 0; this.zt = 1; this.lift(); }
      // The idle worker and whole army keys work from first person too: they lift the view and pick.
      if (free && !this.on && (P.has('F1') || P.has('Backquote') || P.has('F2'))) { const army = P.has('F2'); this.zt = .3; this.lift(); if (army) this.allArmy(); else this.idleWorker(); }
      if (this.on) { g.wheel = 0; P.delete('Mouse0'); P.delete('Mouse2'); }
      this.show(false); return;
    }
    this.input(dt, P, w); this.show(this.on);
  }

  private input(dt: number, P: Set<string>, w: number) {
    const g = this.g, me = g.me!, hud = g.hud, W = hud.W, H = hud.H, K = g.keys, k = g.sens / Math.max(.2, hud.scale), mpp = 2 * this.h / H;
    this.ackT -= dt;
    // the cursor, or the ground sliding under it while the middle button is held
    if (g.mmb && !this.map) { this.focus.x -= g.mdx * k * mpp; this.focus.z -= g.mdy * k * mpp / Math.sin(this.pitch); }
    else { this.cx = clamp(this.cx + g.mdx * k, 0, W); this.cy = clamp(this.cy + g.mdy * k, 0, H); }
    if (!this.map) {
      let px = 0, pz = 0; if (K.has('KeyA') || K.has('ArrowLeft') || this.cx <= 1) px--; if (K.has('KeyD') || K.has('ArrowRight') || this.cx >= W - 1) px++; if (K.has('KeyW') || K.has('ArrowUp') || this.cy <= 1) pz--; if (K.has('KeyS') || K.has('ArrowDown') || this.cy >= H - 1) pz++;
      if (px || pz) { const sp = this.h * 1.9 * dt; this.focus.x += px * sp; this.focus.z += pz * sp; }
    }
    { const ox = MAP.out[0] / 2, oz = MAP.out[1] / 2, dx = this.focus.x - ox, dz = this.focus.z - oz, d = Math.hypot(dx, dz), lim = 205 * (MAP.k || 1); if (d > lim) { this.focus.x = ox + dx / d * lim; this.focus.z = oz + dz / d * lim; } }
    // the wheel
    if (w < 0) {
      if (this.map) { const p = this.mapPt?.(this.cx, this.cy); if (p) this.focus.set(p[0], 0, p[1]); this.zt = this.back >= ZOOM.near && this.back <= ZOOM.far ? this.back : .6; this.cx = W / 2; this.cy = H / 2; sfx.blip(); }
      else if (this.zt <= ZOOM.near + 1e-3) { this.land(); return; }
      else { this.zt = Math.max(ZOOM.near, this.zt - ZOOM.step); if (this.ground(this.cx, this.cy, P3)) this.focus.lerp(P3, .22); }
    } else if (w > 0 && !this.map) { if (this.zt >= ZOOM.far - 1e-3) { this.back = ZOOM.far; this.zt = 1; this.drag = null; this.box = null; sfx.blip(); } else this.zt = Math.min(ZOOM.far, this.zt + ZOOM.step); }
    // keys
    if (P.has('KeyM')) { if (!this.map) { this.back = this.zt; this.zt = 1; this.drag = null; this.box = null; sfx.blip(); } else if (this.back < ZOOM.lift) { this.land(me); return; } else { this.zt = this.back; sfx.blip(); } }
    if (P.has('KeyN')) { this.land(me); return; }
    if (P.has('Space')) { this.focus.set(me.pos.x, 0, me.pos.z); if (this.map) this.zt = .4; }
    const shift = K.has('ShiftLeft') || K.has('ShiftRight'), ctrl = K.has('ControlLeft') || K.has('ControlRight');
    this.groupKeys(P, shift, ctrl);
    if (P.has('F1') || P.has('Backquote')) this.idleWorker();
    if (P.has('F2') || (ctrl && P.has('KeyA'))) { P.delete('KeyA'); this.allArmy(); }
    // the command card: its keys, then a click on one of its buttons
    if (this.aim?.k === 'stake' && P.has('KeyR')) { P.delete('KeyR'); this.rot = !this.rot; sfx.blip(); }
    this.card = cardFor(g, this.sel, this.selB, this.menu, this.aim);
    for (const b of this.card) if (P.has(b.key)) { P.delete(b.key); this.press(b); if (!this.on) return; this.card = cardFor(g, this.sel, this.selB, this.menu, this.aim); break; }
    if (P.has('Mouse0')) { const id = g.hud.cardAt(this.cx, this.cy); if (id) { P.delete('Mouse0'); g.lmb = false; this.clickCard(id); if (!this.on) return; this.card = cardFor(g, this.sel, this.selB, this.menu, this.aim); } }
    // the Quartermaster and the squad's question still answer to their keys from up here
    P.delete('Mouse1'); P.delete('KeyV'); g.dir.playerOrders(P, A, B, -1);

    if (this.map) {
      const p = this.mapPt?.(this.cx, this.cy);
      if (p && this.aim && this.aim.k !== 'stake' && P.has('Mouse0')) { this.useAim(p[0], p[1], null, shift); }
      else if (p && P.has('Mouse0')) { this.focus.set(p[0], 0, p[1]); this.zt = this.back >= ZOOM.near && this.back <= ZOOM.far ? this.back : .5; this.cx = W / 2; this.cy = H / 2; sfx.blip(); }
      if (p && P.has('Mouse2')) { if (this.aim) { this.aim = null; sfx.blip(); } else if (this.sel.size) this.order(p[0], p[1], null, shift); else if (this.selB) this.setRally(p[0], p[1], null); }
      this.wasL = false; this.drag = null; return;
    }
    // an order from the card waiting for a spot: a left click gives it, a right click drops it
    if (this.aim) {
      const on = this.ground(this.cx, this.cy, P3);
      if (this.aim.k === 'stake' && on) this.stakeHover(this.aim.b, P3);
      if (P.has('Mouse0') && on) { P.delete('Mouse0'); this.useAim(P3.x, P3.z, this.under(true), shift); }
      if (P.has('Mouse2')) { P.delete('Mouse2'); this.aim = null; sfx.blip(); }
      this.drag = null; this.box = null; this.wasL = false; return;
    }
    // picking: a click, or a box dragged out
    if (P.has('Mouse0')) { this.drag = [this.cx, this.cy]; this.wasL = true; }
    if (this.drag) { const [x0, y0] = this.drag, bw = Math.abs(this.cx - x0), bh = Math.abs(this.cy - y0); this.box = bw > 8 || bh > 8 ? [Math.min(x0, this.cx), Math.min(y0, this.cy), Math.max(x0, this.cx), Math.max(y0, this.cy)] : null; }
    if (this.wasL && !g.lmb && this.drag) { if (this.box) this.pickBox(this.box, shift); else this.pickAt(shift, ctrl); this.drag = null; this.box = null; this.wasL = false; }
    if (P.has('Mouse2')) { const id = g.hud.cardAt(this.cx, this.cy); if (id) { P.delete('Mouse2'); g.rmb = false; if (id.startsWith('ab:')) this.autocast(id); return; } }
    if (P.has('Mouse2') && this.sel.size && hasBoard(g) && this.ground(this.cx, this.cy, P3) && !this.unitAt(false) && this.carrierAt(P3.x, P3.z) && [...this.sel].some(u => !roomOf(u))) { P.delete('Mouse2'); this.board(P3.x, P3.z); }
    if (P.has('Mouse2') && this.ground(this.cx, this.cy, P3)) { if (this.sel.size) this.order(P3.x, P3.z, this.under(), shift); else if (this.selB) this.setRally(P3.x, P3.z, this.under(true)); }
  }

  // ------------------------------------------------------------ picking
  /** Where a spot on the ground is on the screen, in HUD pixels. */
  screen(x: number, y: number, z: number, out: number[]) { const hud = this.g.hud; A.set(x, y, z).project(this.g.cam); out[0] = (A.x * .5 + .5) * hud.W; out[1] = (-A.y * .5 + .5) * hud.H; return A.z > -1 && A.z < 1; }
  /** The spot on the ground under a point on the screen. */
  ground(sx: number, sy: number, out: THREE.Vector3) {
    const hud = this.g.hud, cam = this.g.cam, nx = sx / hud.W * 2 - 1, ny = 1 - sy / hud.H * 2; A.set(nx, ny, -1).unproject(cam); B.set(nx, ny, 1).unproject(cam).sub(A);
    if (B.y > -1e-6) return false; out.copy(A).addScaledVector(B, -A.y / B.y); out.y = 0; return true;
  }
  mine(u: Unit) { const g = this.g; return u.alive && u.team === g.myTeam && (!u.pilot || (!!g.net && u.pilot === g.net.id)) && (u !== g.me || !g.net); }
  /** The body nearest the cursor, of the player's side or of the enemy's that can be seen. */
  private unitAt(own: boolean): Unit | null {
    const g = this.g, s = [0, 0], pxm = g.hud.H / (2 * this.h); let best: Unit | null = null, bd = 1e9;
    for (const u of g.units) {
      if (own ? !this.mine(u) : (!u.alive || !isEnemy(u.team, g.myTeam) || !g.fog.sees(u.pos.x, u.pos.z))) continue; const st = UNIT[u.kind];
      if (!this.screen(u.pos.x, st.bodyY, u.pos.z, s)) continue; const d = Math.hypot(s[0] - this.cx, s[1] - this.cy), r = Math.max(20, st.rad * pxm * 1.5 + 6); if (d < r && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  private buildingAt(p: THREE.Vector3, own: boolean): Building | null { const g = this.g; for (const b of g.buildings) if (b.alive && (own ? b.team === g.myTeam : isEnemy(b.team, g.myTeam)) && (own || this.known.has(b)) && Math.abs(p.x - b.pos.x) < b.hx + 1.2 && Math.abs(p.z - b.pos.z) < b.hz + 1.2) return b; return null; }
  private pickAt(add: boolean, all = false) {
    const g = this.g, u = this.unitAt(true); this.aim = null; this.menu = '';
    if (u) {
      // A double click, or Ctrl and a click, picks every one of that kind on the screen.
      const twice = all || (g.pipe.time - this.clickT < .4 && this.clickKind === u.kind); this.clickT = g.pipe.time; this.clickKind = u.kind; this.selB = null;
      if (twice) { const s = [0, 0]; if (!add) this.sel.clear(); for (const o of g.units) if (this.mine(o) && o.kind === u.kind && this.screen(o.pos.x, 1, o.pos.z, s) && s[0] > 0 && s[0] < g.hud.W && s[1] > 0 && s[1] < g.hud.H) this.sel.add(o); }
      else if (add) { if (this.sel.has(u)) this.sel.delete(u); else this.sel.add(u); } else { this.sel.clear(); this.sel.add(u); }
      sfx.blip(); return;
    }
    const b = this.ground(this.cx, this.cy, P3) ? this.buildingAt(P3, true) : null;
    if (b) { this.sel.clear(); this.selB = b; sfx.blip(); } else if (!add) { this.sel.clear(); this.selB = null; }
  }
  private pickBox(q: [number, number, number, number], add: boolean) {
    const g = this.g, s = [0, 0], got: Unit[] = [];
    for (const u of g.units) if (this.mine(u) && this.screen(u.pos.x, UNIT[u.kind].bodyY, u.pos.z, s) && s[0] >= q[0] && s[0] <= q[2] && s[1] >= q[1] && s[1] <= q[3]) got.push(u);
    // A box with fighters in it takes the fighters and leaves the workers at their seams.
    const fight = got.filter(u => !isWorker(u.kind)), take = fight.length ? fight : got; this.aim = null; this.menu = '';
    if (!add) this.sel.clear(); if (take.length) { this.selB = null; for (const u of take) this.sel.add(u); sfx.blip(); }
  }
  /** What a right click is on: an enemy to attack, ore to work, or one of the player's own buildings to build or mend. */
  private under(any = false): { k: string; id: number } | null {
    const g = this.g, foe = this.unitAt(false); if (foe) return { k: 'a', id: foe.id };
    const fb = this.buildingAt(P3, false); if (fb) return { k: 'a', id: fb.id };
    // For a rally point or the card's own orders: one of the player's bodies, or any seam.
    if (any) { const own = this.unitAt(true); if (own) return { k: 'u', id: own.id }; }
    const workers = any || [...this.sel].some(u => isWorker(u.kind)); if (!workers) return null;
    let ni = -1, nd = 3.2; g.ores.forEach((n, i) => { if (n.amount <= 0) return; const d = Math.hypot(n.pos.x - P3.x, n.pos.z - P3.z); if (d < nd) { nd = d; ni = i; } }); if (ni >= 0) return { k: 'o', id: ni };
    const ob = this.buildingAt(P3, true); if (ob && (!ob.built || ob.hp < ob.maxHp)) return { k: 'b', id: ob.id };
    return null;
  }
  private order(x: number, z: number, on: { k: string; id: number } | null, shift = false) {
    const g = this.g, k = (on && on.k !== 'u' ? on.k : 'm') as Step['k']; this.issue({ k, x, z, id: on && on.k !== 'u' ? on.id : 0, n: this.sel.size, t: 0 }, shift);
    g.hud.ping(V3(x, 0, z), (shift ? 'Then ' : '') + (k === 'a' ? 'Attacking' : k === 'o' ? 'Working this seam' : k === 'b' ? 'Building here' : 'Moving here')); sfx.callout();
    if (this.ackT <= 0) { this.ackT = 4; const u = [...this.sel][0], ack = u && UNIT[u.kind].ack; if (u && ack && ack.length) g.hud.feed(UNIT[u.kind].name, ack[Math.floor(Math.random() * ack.length)], 'in'); }
  }
  private send(k: string, x: number, z: number, id: number) { this.sendIds([...this.sel].map(u => u.id), k, x, z, id); }
  private sendIds(ids: number[], k: string, x: number, z: number, id: number) {
    const g = this.g; if (!ids.length) return; if (k === 'p') k = 'm';
    if (g.net) g.net.cmd('uo', k, Math.round(x * 10) / 10, Math.round(z * 10) / 10, id, ids); else g.dir.command(g.myTeam, ids, k, x, z, id);
  }

  // ------------------------------------------------------------ orders in a row (Shift), and the card
  /** Gives the picked bodies one order. Without Shift it replaces what they were doing; with Shift it waits until their last order is done. */
  issue(step: Step, shift: boolean) {
    const us = [...this.sel]; if (!us.length) return;
    if (step.k === 'p') { let cx = 0, cz = 0; for (const u of us) { cx += u.pos.x; cz += u.pos.z; } step.x2 = cx / us.length; step.z2 = cz / us.length; }
    const now: Unit[] = [];
    for (const u of us) {
      if (!shift || !this.cur.has(u)) { this.queue.delete(u); this.cur.set(u, { ...step }); now.push(u); continue; }
      const q = this.queue.get(u) || []; if (q.length < 12) q.push({ ...step }); this.queue.set(u, q);
    }
    // Bodies starting now go together, so they stand in a block round the spot instead of all pushing for the same square metre.
    for (const u of now) this.cur.get(u)!.n = now.length;
    if (now.length) this.sendIds(now.map(u => u.id), step.k, step.x, step.z, step.id);
  }
  /** Is a body's order done: there (in a block, the middle is close enough), the target is gone, the site is up. Working a seam never is. */
  private done(u: Unit, s: Step) {
    const g = this.g, d = Math.hypot(u.pos.x - s.x, u.pos.z - s.z), reach = s.k === 'p' ? 5 : 4.5 + Math.sqrt(s.n) * 1.5;
    // A body that has come no closer for four seconds, and is not fighting, is as close as it is going to get (blocked, or standing in the block round the spot).
    if (s.best === undefined || d < s.best - .5) { s.best = d; s.bestT = s.t; }
    if (s.k === 'm' || s.k === 'p') return d < reach || (isWorker(u.kind) && s.t > 1 && u.state !== 'walk') || (s.t - s.bestT! > 4 && !u.target) || s.t > 90;
    if (s.k === 'a') return !g.units.some(o => o.alive && o.id === s.id) && !g.buildings.some(o => o.alive && o.id === s.id);
    if (s.k === 'b') { const b = g.buildings.find(o => o.id === s.id); return !b || !b.alive || (b.built && b.hp >= b.maxHp) || (s.t > 2 && u.site !== b); }
    return false;
  }
  private runQueues(dt: number) {
    const g = this.g; this.qT -= dt; if (this.qT > 0) return; const step = .25 - this.qT; this.qT = .25;
    for (const [u, s] of this.cur) {
      // Dead, driven by somebody, or handed back to the side's own brain: its list of orders is over.
      const gone = !u.alive || u.team !== g.myTeam || (u === g.me && !this.on) || (!!u.pilot && (!g.net || u.pilot !== g.net.id)) || (!isWorker(u.kind) && s.t > 1 && !u.order.mine);
      if (gone) { this.cur.delete(u); this.queue.delete(u); continue; }
      s.t += step; if (!this.done(u, s)) continue;
      if (s.k === 'p') { const x = s.x, z = s.z; s.x = s.x2!; s.z = s.z2!; s.x2 = x; s.z2 = z; s.t = 0; s.n = 1; s.best = undefined; this.sendIds([u.id], 'm', s.x, s.z, 0); continue; }
      const nx = this.queue.get(u)?.shift(); if (!nx) { this.cur.delete(u); this.queue.delete(u); continue; }
      nx.n = 1; nx.t = 0; this.cur.set(u, nx); this.sendIds([u.id], nx.k, nx.x, nx.z, nx.id);
    }
  }
  /** Presses a card button. A greyed one says why it is greyed. */
  press(b: Btn) {
    const g = this.g, voice = FACTION[g.myTeam].voice;
    if (b.off) { sfx.deny(); g.hud.feed(voice, `${b.label}: ${b.off}.`, 'al'); return; }
    const a = b.act, us = [...this.sel];
    if (a.t === 'train' && this.selB) g.train(this.selB, a.k, true);
    else if (a.t === 'research') g.buyUpgrade(a.k, g.myTeam, true);
    else if (a.t === 'aim') { const same = this.aim && this.aim.k === a.aim.k && (a.aim.k !== 'stake' || (this.aim as any).b === a.aim.b); this.aim = same ? null : a.aim; if (a.aim.k === 'stake') this.rot = false; sfx.blip(); }
    else if (a.t === 'stop') { for (const u of us) { this.queue.delete(u); this.cur.delete(u); this.sendIds([u.id], 'm', u.pos.x, u.pos.z, 0); } sfx.blip(); }
    else if (a.t === 'release') { for (const u of us) { this.queue.delete(u); this.cur.delete(u); } this.send('r', 0, 0, 0); sfx.blip(); }
    else if (a.t === 'jump') { const u = us[0]; if (u) this.land(u); }
    else if (a.t === 'buildMenu') { this.menu = 'build'; this.aim = null; sfx.blip(); }
    else if (a.t === 'back') { this.menu = ''; this.aim = null; sfx.blip(); }
    else if (a.t === 'cancel' && this.selB) this.cancel(this.selB, this.selB.queue.length - 1);
    else if (a.t === 'bact' && this.selB) g.buildingAction(this.selB, a.key, true);
    else if (a.t === 'unload') { const G = g as any; if (this.selB) G.unload(this.selB); else for (const c of us) if (roomOf(c) > 0 && c.cargo?.length) G.unload(c); sfx.blip(); }
    else if (a.t === 'ability') {
      const ab = abilityOf(a.kind, a.key)!, { ready } = casters(g, us, a.kind, ab);
      // Smart cast: a self cast goes off on every picked body of that kind that can; an aimed one waits for a click, and then only
      // one caster goes (the nearest that can reach).
      if (ab.target === 'self') { for (const u of ready) g.useAbility(u, a.key); sfx.blip(); }
      else { const same = this.aim && this.aim.k === 'ab' && this.aim.key === a.key && this.aim.kind === a.kind; this.aim = same ? null : { k: 'ab', kind: a.kind, key: a.key, name: ab.name }; sfx.blip(); }
    }
  }
  /** The card button a controller's D-pad has moved to (-1 for none); A presses it. */
  padFocus = -1;
  /** A controller steps the card focus by `d`, wrapping round. */
  padStep(d: number) { const n = this.card.length; if (!n) { this.padFocus = -1; return; } this.padFocus = this.padFocus < 0 ? (d > 0 ? 0 : n - 1) : (this.padFocus + d + n) % n; sfx.blip(); }
  /** A controller presses the focused card button. */
  padPress() { const b = this.card[this.padFocus]; if (b) this.press(b); else sfx.deny(); }
  /** A click on the card: a button, or one of the slots of the picked building's queue. */
  private clickCard(id: string) {
    if (id.startsWith('q:')) { if (this.selB) this.cancel(this.selB, +id.slice(2)); return; }
    const b = this.card.find(x => x.id === id); if (b) this.press(b);
  }
  /** Takes one body off a building's queue and pays it back in full (online the server does it). */
  cancel(b: Building, i: number) { if (i < 0 || i >= b.queue.length || bldRule(b.kind).buds) { sfx.deny(); return; } this.g.cancelTrain(b, i); sfx.blip(); }
  /** The order a card button was waiting on, given at a spot (and maybe on something). */
  private useAim(x: number, z: number, on: { k: string; id: number } | null, shift: boolean) {
    const g = this.g, aim = this.aim!; let keep = shift;
    if (aim.k === 'move') this.order(x, z, on && on.k === 'a' ? on : null, shift);
    else if (aim.k === 'patrol') { this.issue({ k: 'p', x, z, id: 0, n: this.sel.size, t: 0 }, shift); g.hud.ping(V3(x, 0, z), 'Patrolling to here and back'); sfx.callout(); }
    else if (aim.k === 'gather') { if (on && on.k === 'o') this.order(x, z, on, shift); else { sfx.deny(); g.hud.feed(FACTION[g.myTeam].voice, 'Gather needs a seam: click on ore.', 'al'); keep = true; } }
    else if (aim.k === 'rally') this.setRally(x, z, on);
    else if (aim.k === 'stake') { if (!this.stake(aim.b, x, z)) keep = true; }
    else if (aim.k === 'board') { if (!this.board(x, z)) keep = true; }
    else if (aim.k === 'ab') { if (!this.cast(aim.kind, aim.key, x, z, on && on.k !== 'o' ? on.id : 0)) keep = true; }
    if (!keep) this.aim = null;
  }

  /** The picked bodies (not carriers themselves) are sent to get into the carrier or bunker of ours nearest the spot. */
  board(x: number, z: number): boolean {
    const g = this.g, riders = [...this.sel].filter(u => !roomOf(u)); if (!riders.length || !hasBoard(g)) return false;
    const c = this.carrierAt(x, z); if (!c) { sfx.deny(); g.hud.feed(FACTION[g.myTeam].voice, 'Get in needs one of our carriers or bunkers: click on one.', 'al'); return false; }
    for (const u of riders) { this.queue.delete(u); this.cur.delete(u); }
    (g as any).board(riders, c); sfx.callout(); g.hud.ping(V3(c.pos.x, 0, c.pos.z), 'Getting in'); return true;
  }
  /** One of the player's carriers (a body or building with room) under the spot, if any. */
  carrierAt(x: number, z: number): Unit | Building | null {
    const g = this.g, t = g.myTeam; let best: Unit | Building | null = null, bd = 4;
    for (const u of g.units) { if (!u.alive || u.team !== t || roomOf(u) <= 0 || this.sel.has(u)) continue; const d = Math.hypot(u.pos.x - x, u.pos.z - z) - UNIT[u.kind].rad; if (d < bd) { bd = d; best = u; } }
    for (const b of g.buildings) { if (!b.alive || b.team !== t || !b.built || roomOf(b) <= 0) continue; const d = g.distToBox(b, x, z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  /** A right click on an ability button flips whether the picked bodies of that kind cast it by themselves. */
  autocast(id: string) {
    const g = this.g, [, kind, key] = id.split(':'), a = abilityOf(kind, key);
    if (!a || !a.autocast || !hasAutocast()) { sfx.deny(); return; }
    const us = [...this.sel].filter(u => u.kind === kind), on = !us.some(u => !(u as any).autoOff?.[key]);
    for (const u of us) (AB as any).setAutocast(g, u, key, on);
    sfx.blip(); g.hud.feed(FACTION[g.myTeam].voice, `${a.name}: ${on ? 'cast by itself again' : 'only when told'}.`, '');
  }
  /** An aimed ability, given by the nearest picked body of that kind that can reach the spot (or the body clicked). */
  cast(kind: Kind, key: string, x: number, z: number, id = 0): boolean {
    const g = this.g, a = abilityOf(kind, key); if (!a) return false;
    const t = { x, z, id: a.target === 'body' ? id || undefined : undefined }, us = [...this.sel].filter(u => u.kind === kind);
    us.sort((p, q) => Math.hypot(p.pos.x - x, p.pos.z - z) - Math.hypot(q.pos.x - x, q.pos.z - z));
    let why = '', who: Unit | undefined;
    for (const u of us) { const w = whyNot(g, u, key, t); if (!w) { g.useAbility(u, key, t); sfx.blip(); g.hud.ping(V3(x, 0, z), a.name); return true; } if (!why) { why = w; who = u; } }
    sfx.deny(); g.hud.feed(FACTION[g.myTeam].voice, `${a.name}: ${abilityWords(why, a, who)}.`, 'al'); return false;
  }

  // ------------------------------------------------------------ rally points
  setRally(x: number, z: number, on: { k: string; id: number } | null) {
    const g = this.g, b = this.selB; if (!b || !g.sells(b)) return;
    const r: Rally = { x, z }; if (on && on.k === 'o') { r.ore = on.id; const n = g.ores[on.id]; r.x = n.pos.x; r.z = n.pos.z; } else if (on && (on.k === 'u' || on.k === 'a')) r.id = on.id;
    this.rally.set(b, r); g.hud.ping(V3(r.x, 0, r.z), r.ore !== undefined ? 'New workers go to this seam' : r.id ? 'New bodies go to this one' : 'New bodies gather here'); sfx.callout();
  }
  /** Where a rally point is now: a body it follows moves. */
  rallyAt(r: Rally): [number, number] { if (r.id) { const g = this.g, t = g.units.find(u => u.alive && u.id === r.id) || g.buildings.find(o => o.alive && o.id === r.id); if (t) return [t.pos.x, t.pos.z]; } return [r.x, r.z]; }
  /** Sends each body that has just come out of a building with a rally point to it. */
  private watchNew() {
    const g = this.g;
    if (!this.seeded) { for (const u of g.units) this.seen.add(u.id); this.seeded = g.units.length > 0; return; }
    for (const u of g.units) {
      if (this.seen.has(u.id)) continue; this.seen.add(u.id); if (!u.alive || u.team !== g.myTeam || u.pilot) continue;
      for (const [b, r] of this.rally) {
        if (!b.alive || b.team !== g.myTeam) { this.rally.delete(b); continue; }
        if (Math.abs(u.pos.x - b.pos.x) > b.hx + 4 || Math.abs(u.pos.z - b.pos.z) > b.hz + 4) continue;
        const [x, z] = this.rallyAt(r), foe = !!r.id && (g.units.some(o => o.alive && o.id === r.id && isEnemy(o.team, g.myTeam)) || g.buildings.some(o => o.alive && o.id === r.id && isEnemy(o.team, g.myTeam)));
        const step: Step = r.ore !== undefined && isWorker(u.kind) ? { k: 'o', x, z, id: r.ore, n: 1, t: 0 } : foe && !isWorker(u.kind) ? { k: 'a', x, z, id: r.id!, n: 1, t: 0 } : { k: 'm', x, z, id: 0, n: 1, t: 0 };
        this.cur.set(u, step); this.sendIds([u.id], step.k, x, z, step.id); break;
      }
    }
  }

  // ------------------------------------------------------------ staking out a building from above
  private stakeHover(k: BKind, p: THREE.Vector3) {
    const g = this.g; this.stakeAt.set(Math.round(p.x * 2) / 2, 0, Math.round(p.z * 2) / 2);
    this.fits = g.unlocked(k, g.myTeam) && canPay(g, g.myTeam, costOf(k)) && g.canPlace(k, this.stakeAt.x, this.stakeAt.z, this.rot, g.myTeam);
  }
  /** Stakes a building out where the cursor is, and sends the nearest picked worker to put it up. A Gloam building is a Grazer that roots there. */
  private stake(k: BKind, x: number, z: number) {
    const g = this.g, team = g.myTeam, voice = FACTION[team].voice; this.stakeHover(k, V3(x, 0, z));
    if (!this.fits) { sfx.deny(); g.hud.feed(voice, !g.unlocked(k, team) ? `${BLD[k].name} is locked.` : !canPay(g, team, costOf(k)) ? `A ${BLD[k].name} costs ${BLD[k].cost} ore${costOf(k)[1] ? ' and ' + costOf(k)[1] + ' Flux' : ''}. We are short.` : 'Can\'t build there.', 'al'); return false; }
    const { x: sx, z: sz } = this.stakeAt, ws = [...this.sel].filter(u => isWorker(u.kind)).sort((a, b) => Math.hypot(a.pos.x - sx, a.pos.z - sz) - Math.hypot(b.pos.x - sx, b.pos.z - sz)), w = ws[0] || null;
    if (!w) { sfx.deny(); return false; }
    const site = g.place(k, sx, sz, this.rot, team, w); g.obj.built = true;
    this.menu = '';
    if (fac(team) === 2) { if (!g.net && !site) { sfx.deny(); g.hud.feed(voice, 'No Grazer to spare for that.', 'al'); return false; } this.sel.delete(w); g.hud.feed(voice, `${BLD[k].name} rooted. A Grazer gave itself to it.`, ''); }
    else { if (site) { this.sendIds([w.id], 'b', sx, sz, site.id); this.cur.set(w, { k: 'b', x: sx, z: sz, id: site.id, n: 1, t: 0 }); } else if (g.net) this.pending.push({ k, x: sx, z: sz, t: 6, ids: [w.id] }); g.hud.feed(voice, `${BLD[k].name} staked out. The ${UNIT[w.kind].name} is walking over to build it.`, ''); }
    return true;
  }
  /** Online the site appears a moment after it is staked: send the worker once it is there. */
  private landPending(dt: number) {
    const g = this.g; for (let i = this.pending.length - 1; i >= 0; i--) { const p = this.pending[i]; p.t -= dt; const b = g.buildings.find(o => o.alive && !o.built && o.team === g.myTeam && o.kind === p.k && Math.abs(o.pos.x - p.x) < 1.5 && Math.abs(o.pos.z - p.z) < 1.5); if (b) this.sendIds(p.ids, 'b', b.pos.x, b.pos.z, b.id); if (b || p.t <= 0) this.pending.splice(i, 1); }
  }

  // ------------------------------------------------------------ groups and quick picks
  private groupKeys(P: Set<string>, shift: boolean, ctrl: boolean) {
    const g = this.g;
    for (let i = 0; i < 10; i++) {
      const code = 'Digit' + ((i + 1) % 10); if (!P.has(code)) continue; P.delete(code); const G = this.groups[i], n = (i + 1) % 10;
      if (ctrl) { G.us = [...this.sel]; G.b = this.sel.size ? null : this.selB; g.hud.feed('Groups', G.us.length || G.b ? `Group ${n}: ${G.us.length ? G.us.length + ' picked' : BLD[G.b!.kind].name}.` : `Group ${n} emptied.`, ''); sfx.blip(); continue; }
      if (shift) { for (const u of this.sel) if (!G.us.includes(u)) G.us.push(u); if (this.sel.size) G.b = null; g.hud.feed('Groups', `Group ${n}: ${G.us.length} picked.`, ''); sfx.blip(); continue; }
      G.us = G.us.filter(u => this.mine(u)); if (G.b && !G.b.alive) G.b = null;
      if (!G.us.length && !G.b) { sfx.deny(); continue; }
      const twice = g.pipe.time - this.groupT < .45 && this.groupLast === i; this.groupT = g.pipe.time; this.groupLast = i;
      this.sel.clear(); this.selB = null; this.aim = null; this.menu = ''; if (G.us.length) for (const u of G.us) this.sel.add(u); else this.selB = G.b;
      // Pressed twice quickly: the view goes to them.
      if (twice) { let x = 0, z = 0; if (G.us.length) { for (const u of G.us) { x += u.pos.x; z += u.pos.z; } x /= G.us.length; z /= G.us.length; } else { x = G.b!.pos.x; z = G.b!.pos.z; } this.focus.set(x, 0, z); if (this.map) this.zt = this.back >= ZOOM.near && this.back <= ZOOM.far ? this.back : .5; }
      sfx.blip();
    }
  }
  /** Picks every fighter on the player's side. */
  allArmy() { const g = this.g; this.sel.clear(); this.selB = null; this.aim = null; this.menu = ''; for (const u of g.units) if (this.mine(u) && !isWorker(u.kind)) this.sel.add(u); if (this.sel.size) sfx.blip(); else { sfx.deny(); g.hud.feed(FACTION[g.myTeam].voice, 'No fighters to pick.', 'al'); } }
  /** Workers doing nothing: standing where they were sent, or with no seam and no site. */
  idle() { return this.g.units.filter(u => this.mine(u) && isWorker(u.kind) && u !== this.g.me && (u.state === 'hold' || (u.state === 'idle' && !u.site && !u.node))); }
  /** Picks the next idle worker and looks at it. */
  idleWorker() {
    const g = this.g, list = this.idle(); if (!list.length) { sfx.deny(); g.hud.feed(FACTION[g.myTeam].voice, 'Every worker is busy.', ''); return; }
    const u = list[this.idleI++ % list.length]; this.sel.clear(); this.selB = null; this.aim = null; this.menu = ''; this.sel.add(u); this.focus.set(u.pos.x, 0, u.pos.z); if (this.map) this.zt = .5; sfx.blip();
  }

  // ------------------------------------------------------------ what is drawn on the ground: orders in a row, rally points, the building being staked
  private show(on: boolean) {
    const g = this.g;
    for (const k in this.ghosts) { const [ok, bad] = this.ghosts[k]; ok.visible = bad.visible = false; }
    if (on && !this.map && this.aim?.k === 'stake') {
      const k = this.aim.b; let gh = this.ghosts[k]; if (!gh && g.ghost[k]) { gh = this.ghosts[k] = [g.ghost[k].clone(), g.ghostBad[k].clone()]; g.scene.add(gh[0], gh[1]); }
      if (gh) { const o = gh[this.fits ? 0 : 1]; o.visible = true; o.position.copy(this.stakeAt); o.rotation.y = this.rot ? Math.PI / 2 : 0; }
    }
    // Nothing is made until the view is first opened: a new three.js object draws a random id, and bot-only runs replay a seeded dice.
    if (!this.lines && !on) return;
    if (!this.lines) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2400), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * 2400), 3));
      const m = this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, fog: false, toneMapped: false })); m.frustumCulled = false; m.renderOrder = 41; m.layers.set(L_FX); g.scene.add(m);
    }
    const L = this.lines, pos = L.geometry.attributes.position as THREE.BufferAttribute, col = L.geometry.attributes.color as THREE.BufferAttribute; let n = 0;
    const seg = (x0: number, z0: number, x1: number, z1: number, c: number[]) => { if (n + 2 > 2400) return; pos.setXYZ(n, x0, .45, z0); col.setXYZ(n++, c[0], c[1], c[2]); pos.setXYZ(n, x1, .45, z1); col.setXYZ(n++, c[0], c[1], c[2]); };
    const mark = (x: number, z: number, c: number[]) => { const r = Math.max(.5, this.h * .03); seg(x - r, z - r, x + r, z + r, c); seg(x - r, z + r, x + r, z - r, c); };
    if (on) {
      for (const u of this.sel) {
        const s = this.cur.get(u); if (!s) continue; let x = u.pos.x, z = u.pos.z;
        for (const t of [s, ...(this.queue.get(u) || [])]) { const [tx, tz] = t.k === 'a' ? this.where(t) : [t.x, t.z]; seg(x, z, tx, tz, STEP_COL[t.k]); mark(tx, tz, STEP_COL[t.k]); if (t.k === 'p') { seg(tx, tz, t.x2!, t.z2!, STEP_COL.p); mark(t.x2!, t.z2!, STEP_COL.p); } x = tx; z = tz; }
      }
      const b = this.selB, r = b && this.rally.get(b); if (b && r) { const [x, z] = this.rallyAt(r); seg(b.pos.x, b.pos.z, x, z, STEP_COL.r); mark(x, z, STEP_COL.r); }
    }
    L.visible = n > 0; L.geometry.setDrawRange(0, n); pos.needsUpdate = col.needsUpdate = true;
  }
  /** Where an attack order's target is now. */
  private where(s: Step): [number, number] { const g = this.g, t = g.units.find(o => o.alive && o.id === s.id) || g.buildings.find(o => o.alive && o.id === s.id); return t ? [t.pos.x, t.pos.z] : [s.x, s.z]; }

  // ------------------------------------------------------------ the camera
  /** Moves the camera from where first person put it toward the view from above, by as much as the zoom says. Returns how wide the shadows should reach. */
  view(cam: THREE.PerspectiveCamera) {
    const t = clamp((this.z - ZOOM.lift) / (ZOOM.map - ZOOM.lift), 0, 1), s0 = Math.min(1, this.z / ZOOM.lift), s = s0 * s0 * (3 - 2 * s0);
    this.h = ZOOM.h0 * Math.pow(ZOOM.h1 / ZOOM.h0, t); this.pitch = (50 + 16 * t) * Math.PI / 180;
    const D = this.h / Math.tan(ZOOM.fov * Math.PI / 360);
    AUX.position.set(this.focus.x, D * Math.sin(this.pitch), this.focus.z + D * Math.cos(this.pitch)); AUX.lookAt(this.focus.x, 0, this.focus.z); AUX.rotateY(Math.PI);   // a camera looks down its own -z
    cam.position.lerp(AUX.position, s); cam.quaternion.slerp(AUX.quaternion, s); cam.fov += (ZOOM.fov - cam.fov) * s;
    // From this far up the near plane moves out, so the depth the ink lines are drawn from stays sharp, and the air is thinned so the yard is not lost in haze.
    const far = cam.position.distanceTo(this.focus); cam.near = s >= 1 ? Math.max(.06, far * .25) : .06 + (far * .1 - .06) * Math.max(0, s - .5) * 2; this.fogK = Math.min(1, 55 / Math.max(1, far));
    return Math.max(110, this.h * 3.2);
  }

  // ------------------------------------------------------------ what the crew cannot see
  /** From above, enemy bodies show only inside the crew's sight, enemy buildings only once found, and ground nobody has walked is dark. */
  veil(on: boolean, dt: number) {
    const g = this.g;
    if (!on) { if (this.hid) { this.hid = false; for (const b of g.buildings) { b.obj.visible = true; if (b.holo) b.holo.visible = true; } if (this.fogMesh) this.fogMesh.visible = false; } return; }
    const fresh = !this.hid; this.hid = true; const fog = g.fog;
    for (const u of g.units) if (isEnemy(u.team, g.myTeam)) u.obj.visible = fog.sees(u.pos.x, u.pos.z);
    for (const b of g.buildings) if (isEnemy(b.team, g.myTeam)) { const v = this.known.has(b); b.obj.visible = v; if (b.holo) b.holo.visible = v; }
    const n = fog.n;
    if (!this.fogMesh || !this.fogTex || this.fogTex.image.width !== n) {
      if (this.fogMesh) g.scene.remove(this.fogMesh);
      const data = this.fogD = new Uint8Array(n * n * 4); for (let i = 0; i < n * n; i++) { data[i * 4] = 20; data[i * 4 + 1] = 14; data[i * 4 + 2] = 13; data[i * 4 + 3] = 240; }
      const tex = this.fogTex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true; this.fogA = new Float32Array(n * n).fill(240);
      // One flat sheet over the whole world, three times the size of the survey so the dark runs past its edge.
      const sz = n * 4, x0 = fog.x0 - sz, z0 = fog.z0 - sz, x1 = fog.x0 + sz * 2, z1 = fog.z0 + sz * 2, geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, .3, z0, x1, .3, z0, x0, .3, z1, x1, .3, z1], 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute([-1, -1, 2, -1, -1, 2, 2, 2], 2)); geo.setIndex([0, 2, 1, 1, 2, 3]);
      const m = this.fogMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false })); m.frustumCulled = false; m.renderOrder = 40; m.layers.set(L_FX); g.scene.add(m); this.fogT = 0;
    }
    // The dark eases in and out as the crew's sight moves, and is right at once when the view first opens.
    this.fogMesh.visible = true; this.fogT += dt;
    if (this.fogT >= .05 || fresh) { const k = fresh ? 1 : 1 - Math.exp(-this.fogT * 7); this.fogT = 0; const c = fog.cells, a = this.fogA!, d = this.fogD!; for (let i = 0; i < c.length; i++) { const want = c[i] === 2 ? 0 : c[i] === 1 ? 105 : 240; a[i] += (want - a[i]) * k; d[i * 4 + 3] = a[i]; } this.fogTex.needsUpdate = true; }
  }
}
