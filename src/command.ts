// The command view and the map. One zoom runs from first person, up through an angled view of the yard where bodies are picked and
// given orders, to the whole map. Nothing here changes the match by itself: orders go through Director.command (or to the server),
// and the rest is the camera, the cursor and what is picked.
//
// The rule that keeps first person the better way to play is LEAD, below: crew near a body somebody is driving fight better, and
// that is switched off for a player who is up here.
import * as THREE from 'three';
import type { Game } from './game';
import { UNIT, MAP, Unit, Building, isWorker } from './data';
import { V3, L_FX } from './gfx';
import { sfx, drillSound } from './audio';

/** Leading in person. Fighters the game is driving, within `reach` metres of a body one of their own side's players is driving, deal `dmg`
 *  times their damage and take `guard` times what hits them. Set both to 1 to switch it off. */
export const LEAD = { reach: 30, dmg: 1.25, guard: .85 };
/** The zoom: 0 is first person, `lift` and above is the command view, `map` and above is the whole map. */
export const ZOOM = { lift: .12, map: .9, step: .1, near: .2, far: .8, /** how tall a slice of ground the view shows at its nearest and furthest, in metres */ h0: 13, h1: 105, fov: 22 };

const A = V3(), B = V3(), P3 = V3(), AUX = new THREE.Object3D();
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
  /** What the picked building sells, as prompt lines. */
  shop = '';
  /** Half the height of ground the view shows, the camera's tilt, and how much the air between is thinned out for the picture. */
  h = ZOOM.h0; pitch = .9; fogK = 1;
  /** Enemy buildings this side has laid eyes on. One raised later on ground already walked over stays hidden until somebody looks again. */
  known = new WeakSet<Building>();
  /** Set by the HUD: turns a cursor spot on the full map into a spot on the ground. */
  mapPt: ((x: number, y: number) => [number, number] | null) | null = null;
  /** No way up for this screen: the second half of a split screen has no mouse to point with. */
  locked = false;
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
    this.zt = 0; this.sel.clear(); this.selB = null; this.box = null; this.drag = null; this.shop = ''; this.dive = null; g.lmb = g.rmb = false; g.pressed.delete('Mouse0'); g.pressed.delete('Mouse2');
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
    for (const b of g.buildings) if (b.team !== g.myTeam && !this.known.has(b) && g.fog.sees(b.pos.x, b.pos.z)) this.known.add(b);
    const w = g.wheel, free = me.alive && g.staticT <= 0 && !g.tab && g.introT <= 0 && !this.locked;
    if (!this.on) {
      // One notch out only lifts the camera a little, and it settles back: a wheel bumped in a firefight does not pull anyone out of their body.
      const picking = g.tool === 2 && isWorker(me.kind);   // the wheel is choosing a building
      if (free && !picking && w > 0) { if (this.zt > 0) { this.zt = ZOOM.near; this.lift(); } else { this.zt = .02; this.peekT = .8; } }
      else if (w < 0 && this.zt > 0) this.zt = 0;
      if (this.zt > 0 && !this.on) { this.peekT -= dt; if (this.peekT <= 0 || !free) this.zt = 0; }
      if (free && !this.on && P.has('KeyN')) { this.zt = .3; this.lift(); }
      if (free && !this.on && P.has('KeyM')) { this.back = 0; this.zt = 1; this.lift(); }
      if (this.on) { g.wheel = 0; P.delete('Mouse0'); P.delete('Mouse2'); }
      return;
    }
    this.input(dt, P, w);
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
    if (P.has('KeyF')) { const u = [...this.sel][0]; if (u) { this.land(u); return; } sfx.deny(); }
    if (P.has('Space')) { this.focus.set(me.pos.x, 0, me.pos.z); if (this.map) this.zt = .4; }
    if (P.has('KeyR') && this.sel.size) { this.send('r', 0, 0, 0); sfx.blip(); }
    // the Quartermaster and the squad's question still answer to their keys from up here
    P.delete('Mouse1'); P.delete('KeyV'); g.dir.playerOrders(P, A, B, -1);
    this.shop = this.selB && this.selB.built && g.sells(this.selB) ? g.shopAt(this.selB, P) : '';

    if (this.map) {
      const p = this.mapPt?.(this.cx, this.cy);
      if (p && P.has('Mouse0')) { this.focus.set(p[0], 0, p[1]); this.zt = this.back >= ZOOM.near && this.back <= ZOOM.far ? this.back : .5; this.cx = W / 2; this.cy = H / 2; sfx.blip(); }
      if (p && P.has('Mouse2') && this.sel.size) this.order(p[0], p[1], null);
      this.wasL = false; this.drag = null; return;
    }
    // picking: a click, or a box dragged out
    if (P.has('Mouse0')) { this.drag = [this.cx, this.cy]; this.wasL = true; }
    if (this.drag) { const [x0, y0] = this.drag, bw = Math.abs(this.cx - x0), bh = Math.abs(this.cy - y0); this.box = bw > 8 || bh > 8 ? [Math.min(x0, this.cx), Math.min(y0, this.cy), Math.max(x0, this.cx), Math.max(y0, this.cy)] : null; }
    if (this.wasL && !g.lmb && this.drag) { const add = K.has('ShiftLeft') || K.has('ShiftRight'); if (this.box) this.pickBox(this.box, add); else this.pickAt(add); this.drag = null; this.box = null; this.wasL = false; }
    if (P.has('Mouse2') && this.sel.size) { if (this.ground(this.cx, this.cy, P3)) this.order(P3.x, P3.z, this.under()); }
  }

  // ------------------------------------------------------------ picking
  /** Where a spot on the ground is on the screen, in HUD pixels. */
  screen(x: number, y: number, z: number, out: number[]) { const hud = this.g.hud; A.set(x, y, z).project(this.g.cam); out[0] = (A.x * .5 + .5) * hud.W; out[1] = (-A.y * .5 + .5) * hud.H; return A.z > -1 && A.z < 1; }
  /** The spot on the ground under a point on the screen. */
  ground(sx: number, sy: number, out: THREE.Vector3) {
    const hud = this.g.hud, cam = this.g.cam, nx = sx / hud.W * 2 - 1, ny = 1 - sy / hud.H * 2; A.set(nx, ny, -1).unproject(cam); B.set(nx, ny, 1).unproject(cam).sub(A);
    if (B.y > -1e-6) return false; out.copy(A).addScaledVector(B, -A.y / B.y); out.y = 0; return true;
  }
  private mine(u: Unit) { const g = this.g; return u.alive && u.team === g.myTeam && (!u.pilot || (!!g.net && u.pilot === g.net.id)) && (u !== g.me || !g.net); }
  /** The body nearest the cursor, of the player's side or of the enemy's that can be seen. */
  private unitAt(own: boolean): Unit | null {
    const g = this.g, s = [0, 0], pxm = g.hud.H / (2 * this.h); let best: Unit | null = null, bd = 1e9;
    for (const u of g.units) {
      if (own ? !this.mine(u) : (!u.alive || u.team === g.myTeam || !g.fog.sees(u.pos.x, u.pos.z))) continue; const st = UNIT[u.kind];
      if (!this.screen(u.pos.x, st.bodyY, u.pos.z, s)) continue; const d = Math.hypot(s[0] - this.cx, s[1] - this.cy), r = Math.max(20, st.rad * pxm * 1.5 + 6); if (d < r && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  private buildingAt(p: THREE.Vector3, own: boolean): Building | null { const g = this.g; for (const b of g.buildings) if (b.alive && (b.team === g.myTeam) === own && (own || this.known.has(b)) && Math.abs(p.x - b.pos.x) < b.hx + 1.2 && Math.abs(p.z - b.pos.z) < b.hz + 1.2) return b; return null; }
  private pickAt(add: boolean) {
    const g = this.g, u = this.unitAt(true);
    if (u) {
      const twice = g.pipe.time - this.clickT < .4 && this.clickKind === u.kind; this.clickT = g.pipe.time; this.clickKind = u.kind; this.selB = null;
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
    const fight = got.filter(u => !isWorker(u.kind)), take = fight.length ? fight : got;
    if (!add) this.sel.clear(); if (take.length) { this.selB = null; for (const u of take) this.sel.add(u); sfx.blip(); }
  }
  /** What a right click is on: an enemy to attack, ore to work, or one of the player's own buildings to build or mend. */
  private under(): { k: string; id: number } | null {
    const g = this.g, foe = this.unitAt(false); if (foe) return { k: 'a', id: foe.id };
    const fb = this.buildingAt(P3, false); if (fb) return { k: 'a', id: fb.id };
    const workers = [...this.sel].some(u => isWorker(u.kind)); if (!workers) return null;
    let ni = -1, nd = 3.2; g.ores.forEach((n, i) => { if (n.amount <= 0) return; const d = Math.hypot(n.pos.x - P3.x, n.pos.z - P3.z); if (d < nd) { nd = d; ni = i; } }); if (ni >= 0) return { k: 'o', id: ni };
    const ob = this.buildingAt(P3, true); if (ob && (!ob.built || ob.hp < ob.maxHp)) return { k: 'b', id: ob.id };
    return null;
  }
  private order(x: number, z: number, on: { k: string; id: number } | null) {
    const g = this.g, k = on ? on.k : 'm'; this.send(k, x, z, on ? on.id : 0);
    g.hud.ping(V3(x, 0, z), k === 'a' ? 'Attacking' : k === 'o' ? 'Working this seam' : k === 'b' ? 'Building here' : 'Moving here'); sfx.callout();
    if (this.ackT <= 0) { this.ackT = 4; const u = [...this.sel][0], ack = u && UNIT[u.kind].ack; if (u && ack && ack.length) g.hud.feed(UNIT[u.kind].name, ack[Math.floor(Math.random() * ack.length)], 'in'); }
  }
  private send(k: string, x: number, z: number, id: number) {
    const g = this.g, ids = [...this.sel].map(u => u.id); if (!ids.length) return;
    if (g.net) g.net.cmd('uo', k, Math.round(x * 10) / 10, Math.round(z * 10) / 10, id, ids); else g.dir.command(g.myTeam, ids, k, x, z, id);
  }

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
    for (const u of g.units) if (u.team !== g.myTeam) u.obj.visible = fog.sees(u.pos.x, u.pos.z);
    for (const b of g.buildings) if (b.team !== g.myTeam) { const v = this.known.has(b); b.obj.visible = v; if (b.holo) b.holo.visible = v; }
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
