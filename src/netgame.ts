// What crosses the wire in a multiplayer match. The server owns the world: health, the economy, the AI and every
// death. Each player owns only their own body's movement and aim, and reports what they hit. The server sends
// everyone a snapshot of the world about fifteen times a second, plus a list of things to draw and say.
import * as THREE from 'three';
import { Game, beamMat } from './game';
import { UNIT, BLD, BUILDABLE, UPGRADES, Kind, BKind, Unit, Building, UpKey, isSoldier } from './data';
import { V3, M, R, tracerMat } from './gfx';
import { sfx, babble } from './audio';

const KINDS = Object.keys(UNIT) as Kind[], BKINDS = Object.keys(BLD) as BKind[], UPS: UpKey[] = ['dmg', 'armor', 'dmg2', 'armor2'], ORD = ['guard', 'amove', 'follow', 'raid'] as const;
const r1 = (v: number) => Math.round(v * 10) / 10;
const F_MOVE = 1, F_TGT = 2, F_WORK = 4, F_CARRY = 8, F_FIRE = 16, F_BRACE = 128;

// ---------------------------------------------------------------- server: world to snapshot
export function buildSnap(g: Game) {
  const D = g.dir;
  const u = g.units.filter(x => x.alive).map(x => [x.id, KINDS.indexOf(x.kind), x.team, r1(x.pos.x), r1(x.pos.z), Math.round(x.yaw * 100), Math.ceil(x.hp), Math.round(x.maxHp), Math.round(x.shield),
    (x.moving ? F_MOVE : 0) | (x.target ? F_TGT : 0) | (x.state === 'mining' || x.state === 'build' || x.state === 'repair' ? F_WORK : 0) | (x.carrying ? F_CARRY : 0) | (x.swing > .6 || x.flashT > 0 ? F_FIRE : 0) | (ORD.indexOf(x.order.type) << 5) | (x.brace ? F_BRACE : 0),
    x.pilot, Math.round(x.pitch * 100), Math.round(x.wind * 10)]);
  const b = g.buildings.filter(x => x.alive).map(x => [x.id, BKINDS.indexOf(x.kind), x.team, x.pos.x, x.pos.z, x.rot ? 1 : 0, Math.ceil(x.hp), x.built ? 1 : 0, Math.round(x.progress * 100), x.queue.length, x.queue[0] ? KINDS.indexOf(x.queue[0].kind) : 0, x.queue[0] ? r1(x.queue[0].t) : 0]);
  const st = g.stats, e = g.evq || []; g.evq = [];
  return {
    t: 's', time: r1(g.time), ore: Math.floor(g.ore), up: UPS.reduce((a, k, i) => a | (g.up[k] ? 1 << i : 0), 0), o: g.ores.map(n => Math.round(n.amount)), u, b,
    d: [r1(D.raidIn), D.raidDir === 'north' ? 1 : 0, D.raidLive ? 1 : 0, D.auto ? 1 : 0, D.plan ? [D.plan.phase, r1(D.plan.t), D.plan.label, D.plan.book] : 0, D.callout ? [D.callout.who, D.callout.text, r1(D.callout.t), D.callout.dur, D.callout.keys] : 0, [D.playbook.name, D.playbook.steps, D.playbook.idx]],
    st: [Math.floor(st.mined), st.built, st.kills, st.lost], e,
  };
}

// ---------------------------------------------------------------- server: one player's actions
const TRAINS: Record<string, Kind[]> = { headframe: ['rigger'], bunkhouse: ['linesman', 'breacher', 'patch', 'longshot'], foundry: ['gantry'] };
export function serverCmd(g: Game, pid: number, unit: Unit | null, c: any[]) {
  const k = c[0], num = (i: number) => (typeof c[i] === 'number' && isFinite(c[i]) ? c[i] : 0);
  if (k === 'dm') { if (!unit) return; const id = num(1), amt = Math.min(600, num(2)), t = g.units.find(x => x.id === id) || g.buildings.find(x => x.id === id); if (t && t.alive && t.team === 1 && amt > 0) g.damage(t, amt, unit, !!c[3]); }
  else if (k === 'dp') { if (!unit) return; const p = g.props[num(1)]; if (p) g.damageProp(p, Math.min(900, num(2)), unit); }
  else if (k === 'tr') { if (c.length === 9) g.evq!.push(['tr', ...c.slice(1).map(Number), pid]); }
  else if (k === 'pj') { if (c.length === 9) g.evq!.push(['pj', ...c.slice(1).map(Number), 2, pid]); }
  else if (k === 'tn') {
    const b = g.buildings.find(x => x.id === num(1)), kind = c[2] as Kind; if (!b || !b.alive || b.team !== 0 || !b.built || !(TRAINS[b.kind] || []).includes(kind)) return;
    const shop = g.ownB('machineshop', true).length > 0, fdy = g.ownB('foundry', true).length > 0; if (((kind === 'breacher' || kind === 'patch') && !shop) || (kind === 'longshot' && !fdy)) return;
    g.feedTo = pid; g.train(b, kind, true); g.feedTo = 0;
  }
  else if (k === 'up') { const u = UPGRADES.find(x => x.key === c[1]); if (u && g.ownB(u.at, true).length) { g.feedTo = pid; g.buyUpgrade(u.key, true); g.feedTo = 0; } }
  else if (k === 'pl') {
    const kind = c[1] as BKind, x = Math.round(num(2)), z = Math.round(num(3)), rot = !!c[4]; if (!BUILDABLE.includes(kind as any)) return;
    if (g.unlocked(kind) && g.canPlace(kind, x, z, rot) && g.ore >= BLD[kind].cost) { g.place(kind, x, z, rot); g.feedTo = pid; g.feed('Quartermaster', `${BLD[kind].name} staked out. Hold the drill on it to speed things up.`, ''); g.feedTo = 0; }
    else { g.feedTo = pid; g.feed('Quartermaster', `Could not stake out that ${BLD[kind].name}. Somebody beat you to the spot or the ore.`, 'al'); g.feedTo = 0; }
  }
  else if (k === 'mn') { const n = g.ores[num(1)]; if (!n || !unit || unit.kind !== 'rigger') return; const a = Math.max(0, Math.min(3, num(2), n.amount)); n.amount -= a; g.ore += a; g.stats.mined += a; }
  else if (k === 'wd') { const b = g.buildings.find(x => x.id === num(1)); if (b && b.alive && b.team === 0 && !b.built) b.progress += Math.min(.6, Math.max(0, num(2))) / BLD[b.kind].time * 1.6; }
  else if (k === 'fx') { const b = g.buildings.find(x => x.id === num(1)); if (b && b.alive && b.team === 0 && b.built) b.hp = Math.min(b.maxHp, b.hp + 40 * Math.min(.6, Math.max(0, num(2)))); }
  else if (k === 'pt') { if (unit && unit.kind === 'patch') g.patchUp(unit); }
  else if (k === 'or') { const o = String(c[1]); if ('GVMXZC'.includes(o) && o.length === 1) g.dir.order(o, num(2), num(3), unit); }
}
/** The player's own body, as their browser last reported it. */
export function serverMove(g: Game, unit: Unit, m: any[]) {
  const x = +m[0], z = +m[1]; if (!isFinite(x) || !isFinite(z)) return;
  const d = Math.hypot(x - unit.pos.x, z - unit.pos.z); if (d < 14) { unit.pos.x = x; unit.pos.z = z; }   // further than that in one update is not walking
  unit.yaw = +m[2] || 0; unit.pitch = Math.max(-1.5, Math.min(1.5, +m[3] || 0)); const f = m[4] | 0;
  unit.moving = !!(f & F_MOVE); unit.brace = !!(f & F_BRACE); if (f & F_FIRE) { unit.swing = 1; unit.flashT = .08; } unit.target = null;
}

// ---------------------------------------------------------------- client: snapshot to world
function event(g: Game, e: any[]) {
  const net = g.net!, k = e[0];
  if (k === 'fd') { if (!e[4] || e[4] === net.id) { g.hud.feed(e[1], e[2], e[3]); babble(e[1], String(e[2]).length); } }
  else if (k === 'tr') { if (e[9] !== net.id) g.tracer(V3(e[1], e[2], e[3]), V3(e[4], e[5], e[6]), e[7] ? beamMat : tracerMat, e[8]); }
  else if (k === 'ex') g.explode(V3(e[1], e[2], e[3]), -2, 0, e[4], null, !!e[5]);
  else if (k === 'pj') { if (e[10] !== net.id) g.shoot(V3(e[1], e[2], e[3]), V3(e[4], e[5], e[6]), e[7], 0, !!e[8], null, e[9]); }
  else if (k === 'ku') { const u = g.uById.get(e[1]); if (u && u.alive) g.killUnit(u, g.uById.get(e[2]) || g.bById.get(e[2]) || null); }
  else if (k === 'kb') { const b = g.bById.get(e[1]); if (b && b.alive) { g.fallA = e[2]; g.killBuilding(b); } }
  else if (k === 'pr') { const p = g.props[e[1]]; if (p && p.alive && p.hp > e[2]) g.damageProp(p, p.hp - e[2], null); }
  else if (k === 'wn') g.warn(e[1], e[2], e[3], e[4]);
  else if (k === 'ht') { const me = g.me; if (me && e[1] === me.id) { g.shake = Math.min(1, g.shake + .45); const a = Math.atan2(e[2] - me.pos.x, e[3] - me.pos.z) - g.yaw; g.hud.hurt(Math.atan2(Math.sin(a), Math.cos(a))); sfx.hurt(); me.lastHit = g.time; } }
}
export function applySnap(g: Game, s: any) {
  const net = g.net!; g.applying = true;
  for (const e of s.e) event(g, e);
  g.time = s.time; g.ore = s.ore; UPS.forEach((k, i) => { g.up[k] = !!(s.up & (1 << i)); });
  g.ores.forEach((n, i) => { const a = s.o[i]; if (a !== undefined && a !== n.amount) { n.amount = a; g.oreCheck(n); } });
  g.stats.mined = s.st[0]; g.stats.built = s.st[1]; g.stats.kills = s.st[2]; g.stats.lost = s.st[3];
  const seen = new Set<number>();
  for (const r of s.u) {
    let u = g.uById.get(r[0]); if (u && !u.alive) continue;
    if (!u) { u = g.spawn(KINDS[r[1]], r[2], r[3], r[4], r[0]); g.uById.set(u.id, u); }
    seen.add(u.id); u.nx = r[3]; u.nz = r[4]; u.maxHp = r[7];
    if (r[8] < u.shield - 1) g.bubble(u); u.hp = r[6]; u.shield = r[8]; (u as any).nf = r[9]; u.wind = r[12] / 10;
    if (u !== g.me) { u.yaw = r[5] / 100; u.pitch = r[11] / 100; u.pilot = r[10]; } else if (r[10] === net.id || s.time > g.possT + 1.5) u.pilot = r[10];
  }
  for (const u of g.units) if (u.alive && !seen.has(u.id)) { u.alive = false; g.scene.remove(u.obj); if (u === g.me) g.staticT = .2; }
  const seenB = new Set<number>();
  for (const r of s.b) {
    let b = g.bById.get(r[0]); if (b && !b.alive) continue;
    if (!b) { b = g.addBuilding(BKINDS[r[1]], r[2], r[3], r[4], !!r[7], !!r[5], r[0]); g.bById.set(b.id, b); if (!r[7] && r[2] === 0) g.puff(V3(r[3], .3, r[4]), 5, 1.2, M.dust, .5, 2); }
    seenB.add(b.id);
    if (!b.built && r[7]) { b.built = true; b.obj.scale.y = 1; if (b.holo) { g.scene.remove(b.holo); b.holo = null; } sfx.built(); g.puff(V3(b.pos.x, 1.5, b.pos.z), 8, 1.8, M.dust, .8, 2.5); }
    b.progress = r[8] / 100; if (!b.built) b.obj.scale.y = Math.max(.06, b.progress);
    if (r[6] < b.hp - .5) b.lastHit = g.time; b.hp = r[6];
    if (b.built) { const st = b.hp < b.maxHp * .33 ? 2 : b.hp < b.maxHp * .66 ? 1 : 0; if (st > b.stage) g.crack(b, st); }
    const q: { kind: Kind; t: number }[] = []; for (let i = 0; i < r[9]; i++) q.push({ kind: KINDS[r[10]], t: r[11] }); b.queue = q;
  }
  for (const b of g.buildings) if (b.alive && !seenB.has(b.id)) { b.alive = false; g.scene.remove(b.obj); if (b.holo) g.scene.remove(b.holo); }
  const D = g.dir, d = s.d; D.raidIn = d[0]; D.raidDir = d[1] ? 'north' : 'east'; D.raidLive = !!d[2]; D.auto = !!d[3];
  D.plan = d[4] ? { phase: d[4][0], t: d[4][1], target: null, book: d[4][3], label: d[4][2] } : null;
  if (d[5]) { if (!D.callout || D.callout.text !== d[5][1]) sfx.callout(); D.callout = { who: d[5][0], text: d[5][1], t: d[5][2], dur: d[5][3], keys: d[5][4] }; } else D.callout = null;
  D.playbook.name = d[6][0]; D.playbook.steps = d[6][1]; D.playbook.idx = d[6][2];
  g.applying = false;
}

/** Client, every frame: take in what the server sent, ease every other body toward where it should be, and report our own. */
export function netTick(g: Game, dt: number) {
  const net = g.net!;
  for (const m of net.inbox) {
    if (m.t === 's') applySnap(g, m);
    else if (m.t === 'yo') net.unit = m.unit;
    else if (m.t === 'over') { g.stats.mined = m.stats[0]; g.stats.built = m.stats[1]; g.stats.kills = m.stats[2]; g.stats.lost = m.stats[3]; g.time = m.time; g.end(!!m.won); }
  }
  net.inbox.length = 0;
  // a body the server has given us and we are not yet driving
  if (net.unit) { const u = g.uById.get(net.unit); if (u && u.alive) { net.unit = 0; u.pilot = net.id; g.staticT = 0; g.jumpCd = 0; const first = !g.me; g.possess(u, true); if (!first) { sfx.jump(); g.pipe.flash = .4; } } }
  const me = g.me;
  if (me && me.alive && me.pilot && me.pilot !== net.id && g.staticT <= 0) { g.feed('Signal', 'Someone else got to that body first.', 'al'); g.staticT = .3; }
  for (const u of g.units) {
    if (!u.alive) continue; const f = (u as any).nf | 0;
    u.swing = Math.max(0, u.swing - dt * 4); u.flashT -= dt; u.pop = Math.max(0, u.pop - dt * 7);
    if (u === me) continue;
    const dx = u.nx - u.pos.x, dz = u.nz - u.pos.z, d2 = dx * dx + dz * dz;
    if (d2 > 200) { u.pos.x = u.nx; u.pos.z = u.nz; } else { const k = Math.min(1, dt * 11); u.pos.x += dx * k; u.pos.z += dz * k; }
    u.moving = !!(f & F_MOVE) || d2 > .25; u.target = f & F_TGT ? u : null; u.state = f & F_WORK ? 'mining' : 'idle'; u.brace = !!(f & F_BRACE);
    u.order.type = ORD[(f >> 5) & 3]; if (u.rig.pack) u.rig.pack.visible = !!(f & F_CARRY);
    if (f & F_FIRE) { u.swing = Math.max(u.swing, .9); u.flashT = .05; }
  }
  // keep our own body out of the others
  if (me && me.alive) for (const o of g.units) { if (o === me || !o.alive) continue; const dx = me.pos.x - o.pos.x, dz = me.pos.z - o.pos.z, lim = (UNIT[me.kind].rad + UNIT[o.kind].rad) * (o.team === me.team ? 1.1 : 1.25), d2 = dx * dx + dz * dz; if (d2 < lim * lim && d2 > 1e-5) { const d = Math.sqrt(d2); me.pos.x += dx / d * (lim - d); me.pos.z += dz / d * (lim - d); } }
  // damaged friendly buildings smoke, as they do offline
  for (const b of g.buildings) if (b.alive && b.built && b.team === 0 && b.hp < b.maxHp * .5) { b.smokeT -= dt; if (b.smokeT <= 0) { const bad = b.hp < b.maxHp * .25; b.smokeT = bad ? .18 : .4; g.puff(V3(b.pos.x + R(-b.hx, b.hx) * .6, b.h * R(.6, 1), b.pos.z + R(-b.hz, b.hz) * .6), 1, 1.5, bad && Math.random() < .5 ? M.fire : M.smoke, 2.4, .5); } }
  const D = g.dir; D.raidIn -= dt; if (D.callout) D.callout.t -= dt; if (D.plan) D.plan.t -= dt;
  net.sendT -= dt;
  if (net.sendT <= 0) {
    net.sendT = .05;
    net.flush(me && me.alive && g.staticT <= 0 ? [r1(me.pos.x), r1(me.pos.z), Math.round(g.yaw * 100) / 100, Math.round(g.pitch * 100) / 100, (me.moving ? F_MOVE : 0) | (g.fireCd > 0 && g.lmb ? F_FIRE : 0) | (g.brace ? F_BRACE : 0)] : null);
  }
}
export { isSoldier, THREE };
