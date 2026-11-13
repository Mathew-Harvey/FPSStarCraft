// What crosses the wire in a multiplayer match. The server owns the world: health, the economy, the AI and every
// death. Each player owns only their own body's movement and aim, and reports what they hit. The server sends
// everyone a snapshot of the world about fifteen times a second, plus a list of things to draw and say.
import * as THREE from 'three';
import { Game, beamMat } from './game';
import { UNIT, BLD, BUILDABLE, UPGRADES, TRAINS, UNIT_NEEDS, FACTION, VOICE_SIDE, SIDE, fac, atHome, Kind, BKind, Unit, Building, UpKey, isSoldier, isWorker, type StatusKey } from './data';
import { useAbility } from './core/ability';
import { seenBy, isHidden } from './core/sight';
import type { Side } from './director';
import { V3, M, R, tracerMat } from './gfx';
import { sfx, babble } from './audio';

const KINDS = Object.keys(UNIT) as Kind[], BKINDS = Object.keys(BLD) as BKind[], UPS: UpKey[] = UPGRADES.map(u => u.key), ORD = ['guard', 'amove', 'follow', 'raid'] as const;
const r1 = (v: number) => Math.round(v * 10) / 10;
const F_MOVE = 1, F_TGT = 2, F_WORK = 4, F_CARRY = 8, F_FIRE = 16, F_BRACE = 128;

// ---------------------------------------------------------------- server: world to snapshot
/** The world as one side may see it. `team` -1 is everything (nothing hidden on the map, or split screen); a side's own snapshot leaves out
 *  enemy bodies it cannot see (src/core/sight.ts), listing only their ids under `hz` so the browser hides them instead of killing them.
 *  `ev` is the event list when several sides' snapshots share one tick's events. */
export function buildSnap(g: Game, team = -1, ev?: any[]) {
  const D = g.dir, vis = (x: Unit) => team < 0 || seenBy(g, team, x);
  const hz = team < 0 ? [] : g.units.filter(x => x.alive && !vis(x)).map(x => x.id);
  // Extra fields only some bodies have: energy, effects, height and the carrier it rides in.
  const ux = g.units.filter(x => x.alive && vis(x) && (x.maxEnergy || x.status?.length || x.alt || x.inside)).map(x => [x.id, Math.floor(x.energy || 0), statusBits(x), Math.round((x.alt || 0) * 10), x.inside ? x.inside.id : 0]);
  const u = g.units.filter(x => x.alive && vis(x)).map(x => [x.id, KINDS.indexOf(x.kind), x.team, r1(x.pos.x), r1(x.pos.z), Math.round(x.yaw * 100), Math.ceil(x.hp), Math.ceil(x.maxHp), Math.floor(x.shield),
    (x.moving ? F_MOVE : 0) | (x.target ? F_TGT : 0) | (x.state === 'mining' || x.state === 'build' || x.state === 'repair' ? F_WORK : 0) | (x.carrying ? F_CARRY : 0) | (x.swing > .6 || x.flashT > 0 ? F_FIRE : 0) | (ORD.indexOf(x.order.type === 'scout' ? 'amove' : x.order.type) << 5)   /* two bits on the wire: a scout goes as a body on the march */ | (x.brace ? F_BRACE : 0),
    x.pilot, Math.round(x.pitch * 100), Math.round(x.wind * 10)]);
  const b = g.buildings.filter(x => x.alive).map(x => [x.id, BKINDS.indexOf(x.kind), x.team, x.pos.x, x.pos.z, x.rot ? 1 : 0, Math.ceil(x.hp), x.built ? 1 : 0, Math.round(x.progress * 100), x.queue.length, x.queue[0] ? KINDS.indexOf(x.queue[0].kind) : 0, x.queue[0] ? r1(x.queue[0].t) : 0, x.buds || 0]);
  const st = g.stats, e = ev || g.evq || []; if (!ev) g.evq = [];
  return {
    t: 's', time: r1(g.time), ore: Math.floor(g.cash(SIDE.home)), up: UPS.map((k, i) => g.upOf(SIDE.home)[k] ? i : -1).filter(i => i >= 0), uo: UPS.map((k, i) => g.upOf(SIDE.out)[k] ? i : -1).filter(i => i >= 0), o: g.ores.map(n => Math.round(n.amount)), u, b,
    d: [r1(D.raidIn), D.raidDir === 'north' ? 1 : 0, D.raidLive ? 1 : 0, D.auto ? 1 : 0, D.plan ? [D.plan.phase, r1(D.plan.t), D.plan.label, D.plan.book] : 0, D.callout ? [D.callout.who, D.callout.text, r1(D.callout.t), D.callout.dur, D.callout.keys] : 0, [D.playbook.name, D.playbook.steps, D.playbook.idx]],
    v: g.eco ? sideSnap(D.vs) : 0, vo: Math.floor(g.cash(SIDE.out)), fl: [Math.floor(g.flux(SIDE.home)), Math.floor(g.flux(SIDE.out))], ux, hz,
    st: [Math.floor(st.mined), st.built, st.kills, st.lost, Math.floor(st.minedV)], e, mo: g.mission ? D.objectives() : 0, mc: g.mission && g.ms.clock !== undefined ? r1(g.ms.clock) : -1, sc: Object.keys(g.score).map(k => [+k, g.score[+k][0], Math.floor(g.score[+k][1]), g.score[+k][2]]),
  };
}

/** One side's squad and economy brain, for the players on that side. */
function sideSnap(S: Side) { return [S.raidLive ? 1 : 0, S.auto ? 1 : 0, S.plan ? [S.plan.phase, r1(S.plan.t), S.plan.label, S.plan.book] : 0, S.callout ? [S.callout.who, S.callout.text, r1(S.callout.t), S.callout.dur, S.callout.keys] : 0, [S.playbook.name, S.playbook.steps, S.playbook.idx]]; }
function sideApply(g: Game, S: Side, d: any[]) {
  S.raidLive = !!d[0]; S.auto = !!d[1]; S.plan = d[2] ? { phase: d[2][0], t: d[2][1], target: null, book: d[2][3], label: d[2][2] } : null;
  if (d[3]) { if (!S.callout || S.callout.text !== d[3][1]) sfx.callout(); S.callout = { who: d[3][0], text: d[3][1], t: d[3][2], dur: d[3][3], keys: d[3][4] }; } else S.callout = null;
  S.playbook.name = d[4][0]; S.playbook.steps = d[4][1]; S.playbook.idx = d[4][2];
}

const SBITS: StatusKey[] = ['slow', 'stun', 'root', 'unseen', 'revealed', 'borrowed', 'lifted', 'shielded', 'burning'];
const statusBits = (u: Unit) => (u.status || []).reduce((n, s) => s.t > 0 ? n | (1 << SBITS.indexOf(s.k)) : n, 0);
/** Snapshots for every side with a player, sharing one tick's events. One snapshot for all when nobody on the map is hidden. */
export function buildSnaps(g: Game, teams: number[]): Map<number, string> {
  const out = new Map<number, string>(), hidden = g.units.some(x => x.alive && isHidden(x));
  if (!hidden) { const s = JSON.stringify(buildSnap(g)); for (const t of teams) out.set(t, s); return out; }
  const ev = g.evq || []; g.evq = []; for (const t of new Set(teams)) out.set(t, JSON.stringify(buildSnap(g, t, ev))); return out;
}

// ---------------------------------------------------------------- server: one player's actions
const BUDGET = new WeakMap<Unit, { left: number; t: number }>(), MOVED = new WeakMap<Unit, { left: number; t: number }>();
/** A refilling allowance per body and per kind of claim: ore drilled, seconds of welding, damage to scenery, and the Patch's pulse.
 *  An honest client never comes near these. They stop a doctored one from claiming a thousand ore or a finished Foundry in one message. */
const ALLOW = new WeakMap<Unit, Record<string, { left: number; t: number }>>();
function allow(g: Game, u: Unit, key: string, want: number, cap: number, perSec: number) {
  let all = ALLOW.get(u); if (!all) ALLOW.set(u, all = {}); const a = all[key] || (all[key] = { left: cap, t: g.time });
  a.left = Math.min(cap, a.left + Math.max(0, g.time - a.t) * perSec); a.t = g.time; const got = Math.max(0, Math.min(want, a.left)); a.left -= got; return got;
}
export function serverCmd(g: Game, pid: number, unit: Unit | null, c: any[]) {
  const k = c[0], num = (i: number) => (typeof c[i] === 'number' && isFinite(c[i]) ? c[i] : 0);
  const side = g.teams[pid] ?? SIDE.home;
  if (k === 'dm') {
    // A player reports their own hits, so the server checks them: the target has to be an enemy in reach, and no body can deal more
    // in a second than the hardest-hitting gun and a grenade could together.
    if (!unit) return; const id = num(1), t = g.units.find(x => x.id === id) || g.buildings.find(x => x.id === id); if (!t || !t.alive || t.team === unit.team) return;
    if (Math.hypot(t.pos.x - unit.pos.x, t.pos.z - unit.pos.z) > 175) return;
    const bk = BUDGET.get(unit) || { left: 900, t: g.time }; BUDGET.set(unit, bk); bk.left = Math.min(900, bk.left + (g.time - bk.t) * 450); bk.t = g.time;
    const amt = Math.min(450, num(2), bk.left); if (amt <= 0) return; bk.left -= amt; g.damage(t, amt, unit, !!c[3]);
  }
  // Abilities (src/core/ability.ts): the server checks the body is the player's own (or one of their side's), then energy, cooldown and range.
  // The old one-off calls are the same abilities under their old names.
  else if (k === 'ab') { const u = g.units.find(x => x.id === num(1)); if (u && u.alive && (u === unit || (u.team === side && !u.pilot))) useAbility(g, u, String(c[2]), { x: num(3), z: num(4), id: num(5) || undefined }); }
  else if (k === 'vs') { if (unit && unit.kind === 'warden') useAbility(g, unit, 'lownote'); }
  else if (k === 'cq') { const b = g.buildings.find(x => x.id === num(1)); if (b && b.alive && b.team === side) g.cancelTrain(b, num(2)); }
  else if (k === 'hl') { const o = g.units.find(x => x.id === num(1)); if (unit && unit.kind === 'patch' && o && o.alive && o.team === unit.team && Math.hypot(o.pos.x - unit.pos.x, o.pos.z - unit.pos.z) < 70) { const bk = BUDGET.get(unit) || { left: 900, t: g.time }; BUDGET.set(unit, bk); bk.left = Math.min(900, bk.left + (g.time - bk.t) * 450); bk.t = g.time; if (bk.left >= 80) { bk.left -= 80; o.hp = Math.min(o.maxHp, o.hp + 10); } } }
  else if (k === 'dp') { if (!unit) return; const p = g.props[num(1)]; if (p && p.alive && Math.hypot(p.x - unit.pos.x, p.z - unit.pos.z) < 175 + p.r) { const a = allow(g, unit, 'dp', Math.min(900, num(2)), 2400, 1200); if (a > 0) g.damageProp(p, a, unit); } }
  else if (k === 'tr') { if (c.length === 9) g.evq!.push(['tr', ...c.slice(1).map(Number), pid]); }
  else if (k === 'pj') { if (c.length === 9) g.evq!.push(['pj', ...c.slice(1).map(Number), 2, pid]); }
  else if (k === 'tn') {
    const b = g.buildings.find(x => x.id === num(1)), kind = c[2] as Kind; if (!b || !b.alive || b.team !== side || !b.built || !(TRAINS[b.kind] || []).includes(kind) || (UNIT[kind].team || 0) !== fac(side)) return;
    const nb = UNIT_NEEDS[kind]; if (nb && !g.ownB(nb, true, side).length) return;
    g.feedTo = pid; g.train(b, kind, true); g.feedTo = 0;
  }
  else if (k === 'up') { const u = UPGRADES.find(x => x.key === c[1]); if (u && (u.team || 0) === fac(side) && g.ownB(u.at, true, side).length) { g.feedTo = pid; g.buyUpgrade(u.key, side, true); g.feedTo = 0; } }
  else if (k === 'pl') {
    const kind = c[1] as BKind, x = Math.round(num(2)), z = Math.round(num(3)), rot = !!c[4], v = FACTION[side].voice; if (!FACTION[side].builds.includes(kind)) return;
    if (g.unlocked(kind, side) && g.canPlace(kind, x, z, rot, side) && g.cash(side) >= BLD[kind].cost && g.place(kind, x, z, rot, side, unit)) { if (g.score[pid]) g.score[pid][2]++; g.feedTo = pid; g.feed(v, fac(side) === 2 ? `${BLD[kind].name} rooted. A Grazer gave itself to it, and it grows by itself.` : fac(side) ? `${BLD[kind].name} seeded. Hold click on it to sing it up faster.` : `${BLD[kind].name} staked out. Hold the drill on it to speed things up.`, ''); g.feedTo = 0; }
    else { g.feedTo = pid; g.feed(v, `Could not ${fac(side) === 2 ? 'root' : fac(side) ? 'seed' : 'stake out'} that ${BLD[kind].name}. Somebody beat you to the spot or the ore.`, 'al'); g.feedTo = 0; }
  }
  else if (k === 'mn') { const n = g.ores[num(1)]; if (!n || !unit || !isWorker(unit.kind) || Math.hypot(n.pos.x - unit.pos.x, n.pos.z - unit.pos.z) > 8) return; const a = allow(g, unit, 'mn', Math.max(0, Math.min(3, num(2), n.amount, g.packCap(unit.team) - unit.carrying)), 12, 12); n.amount -= a; unit.carrying += a; g.oreCheck(n); }   // banked when the body reaches the Headframe
  else if (k === 'wd') { const b = g.buildings.find(x => x.id === num(1)); if (unit && isWorker(unit.kind) && b && b.alive && b.team === unit.team && !b.built && g.distToBox(b, unit.pos.x, unit.pos.z) < 8) b.progress += allow(g, unit, 'wd', Math.min(.6, Math.max(0, num(2))), 1, 1.25) / BLD[b.kind].time * 1.6; }
  else if (k === 'fx') { const b = g.buildings.find(x => x.id === num(1)); if (unit && isWorker(unit.kind) && b && b.alive && b.team === unit.team && b.built && g.distToBox(b, unit.pos.x, unit.pos.z) < 8) b.hp = Math.min(b.maxHp, b.hp + 40 * allow(g, unit, 'wd', Math.min(.6, Math.max(0, num(2))), 1, 1.25)); }
  else if (k === 'gb') { if (unit && unit.alive && unit.kind === 'blister') useAbility(g, unit, 'burst'); }
  else if (k === 'xx') { g.evq!.push(['ex', num(1), 0, num(2), Math.min(8, Math.max(1, num(3))), 1, pid]); }
  else if (k === 'rd') { /* the old raid call: the Veyl now march as a squad, answered with Z like Ironhold's */ }
  else if (k === 'pg') { const x = Math.max(-400, Math.min(400, num(1))), z = Math.max(-400, Math.min(400, num(2))); g.evq!.push(['pg', pid, x, z]); }
  else if (k === 'ch') { const t = String(c[1] || '').replace(/[<>&]/g, '').trim().slice(0, 120); if (t) g.evq!.push(['fd', g.names[pid] || 'Crew', t, 'ch']); }
  else if (k === 'pt') { if (unit && unit.kind === 'patch') useAbility(g, unit, 'pulse'); }
  else if (k === 'or') { const o = String(c[1]); if ('GVMXZCS'.includes(o) && o.length === 1 && (unit ? unit.team === side : side === SIDE.home)) g.dir.order(o, num(2), num(3), unit); }
}
/** The player's own body, as their browser last reported it. */
export function serverMove(g: Game, unit: Unit, m: any[]) {
  const x = +m[0], z = +m[1]; if (!isFinite(x) || !isFinite(z)) return;
  // Nobody walks faster than their body can sprint and dash. Each body has an allowance of ground that refills at its own top speed (sprint,
  // every speed upgrade, the Gloam carpet and the dash, plus a tenth) and holds a second and a quarter of it, which covers a hitch in the
  // connection. A report from further away than the allowance is pulled back toward where the body could have got to. The allowance used to
  // be 4 m on every message, however many messages came in one tick, so a doctored client could cross the map in a second.
  const top = unit.speed * 2.4 + 3, d = Math.hypot(x - unit.pos.x, z - unit.pos.z), a = MOVED.get(unit) || { left: top * .5, t: g.time }; MOVED.set(unit, a);
  a.left = Math.min(top * 1.25, a.left + Math.max(0, g.time - a.t) * top); a.t = g.time; const reach = Math.min(d, a.left);
  if (d <= a.left) { unit.pos.x = x; unit.pos.z = z; a.left -= d; } else if (d < 40 && reach > 0) { unit.pos.x += (x - unit.pos.x) / d * reach; unit.pos.z += (z - unit.pos.z) / d * reach; a.left -= reach; }
  unit.yaw = +m[2] || 0; unit.pitch = Math.max(-1.5, Math.min(1.5, +m[3] || 0)); const f = m[4] | 0;
  unit.moving = !!(f & F_MOVE); unit.brace = !!(f & F_BRACE); if (f & F_FIRE) { unit.swing = 1; unit.flashT = .08; } unit.target = null;
}

// ---------------------------------------------------------------- client: snapshot to world
function event(g: Game, e: any[]) {
  const net = g.net!, k = e[0];
  if (k === 'fd') { if (e[4] ? e[4] === net.id : e[3] === 'ch' || e[1] === 'Signal' || (e[5] >= 0 ? e[5] === g.myTeam : (VOICE_SIDE[e[1]] || 0) === fac(g.myTeam))) { g.hud.feed(e[1], e[2], e[3]); if (e[3] === 'ch') sfx.blip(); else babble(e[1], String(e[2]).length); } }
  else if (k === 'pg') { if ((g.teams[e[1]] || 0) !== g.myTeam) return; g.pings.push({ pid: e[1], x: e[2], z: e[3], t: 8 }); if (g.pings.length > 8) g.pings.shift(); sfx.callout(); }
  else if (k === 'nm') { g.names = e[1]; if (e[2]) g.teams = e[2]; }
  else if (k === 'ph') { for (const r of e[1]) { const p = g.props[r[0]]; if (p && p.alive && p.hp > r[1]) g.damageProp(p, p.hp - r[1], null); } }
  else if (k === 'tr') { if (e[9] !== net.id) g.tracer(V3(e[1], e[2], e[3]), V3(e[4], e[5], e[6]), e[7] ? beamMat : tracerMat, e[8]); }
  else if (k === 'ex') { if (e[6] !== net.id) g.explode(V3(e[1], e[2], e[3]), -2, 0, e[4], null, e[5] === 2 ? 2 : !!e[5]); }
  else if (k === 'pj') { if (e[10] !== net.id) g.shoot(V3(e[1], e[2], e[3]), V3(e[4], e[5], e[6]), e[7], 0, !!e[8], null, e[9]); }
  else if (k === 'ku') { const u = g.uById.get(e[1]); if (u && u.alive) g.killUnit(u, g.uById.get(e[2]) || g.bById.get(e[2]) || null); }
  else if (k === 'kb') { const b = g.bById.get(e[1]); if (b && b.alive) { g.fallA = e[2]; g.killBuilding(b); } }
  else if (k === 'pr') { const p = g.props[e[1]]; if (p && p.alive && p.hp > e[2]) g.damageProp(p, p.hp - e[2], null); }
  else if (k === 'wn') g.warn(e[1], e[2], e[3], e[4]);
  else if (k === 'ht') { const me = g.me; if (me && e[1] === me.id) { g.shake = Math.min(1, g.shake + .45); const a = Math.atan2(e[2] - me.pos.x, e[3] - me.pos.z) - g.yaw; g.hud.hurt(Math.atan2(Math.sin(a), Math.cos(a))); sfx.hurt(); me.lastHit = g.time; if (g.brace) { g.payback = Math.min(1, g.payback + .2); sfx.clang(); } } }
}
export function applySnap(g: Game, s: any) {
  const net = g.net!; g.applying = true;
  for (const e of s.e) event(g, e);
  g.time = s.time; g.purse[SIDE.home] = s.ore; if (s.vo !== undefined) g.purse[SIDE.out] = s.vo; if (s.fl) { g.fluxPurse[SIDE.home] = s.fl[0]; g.fluxPurse[SIDE.out] = s.fl[1]; }
  for (const [t, list] of [[SIDE.home, s.up], [SIDE.out, s.uo || []]] as [number, number[]][]) { const on = new Set<number>(list), U = g.upOf(t); UPS.forEach((k, i) => { const was = U[k]; U[k] = on.has(i); if (k === 'gbloom' && U[k] && !was) g.carpet.deepen(t); }); }
  g.ores.forEach((n, i) => { const a = s.o[i]; if (a !== undefined && a !== n.amount) { n.amount = a; g.oreCheck(n); } });
  if (s.sc) { g.score = {}; for (const r of s.sc) g.score[r[0]] = [r[1], r[2], r[3]]; }
  if (s.mo) g.netObjs = s.mo; if (s.mc >= 0) g.ms.clock = s.mc;
  g.stats.mined = s.st[0]; g.stats.built = s.st[1]; g.stats.kills = s.st[2]; g.stats.lost = s.st[3]; g.stats.minedV = s.st[4] || 0;
  const seen = new Set<number>();
  for (const r of s.u) {
    let u = g.uById.get(r[0]); if (u && !u.alive) continue;
    if (!u) { u = g.spawn(KINDS[r[1]], r[2], r[3], r[4], r[0]); g.uById.set(u.id, u); }
    seen.add(u.id); u.nx = r[3]; u.nz = r[4]; u.maxHp = r[7]; if (g.eco && UNIT[u.kind].shield) u.maxShield = UNIT[u.kind].shield * g.armorMul(u.team);   // Veyl glass upgrades thicken shields too
    if (r[8] < u.shield - 1) g.bubble(u); if (r[6] < u.hp - .5 || r[8] < u.shield - 1) g.fx.remote(u, Math.max(1, u.hp - r[6], u.shield - r[8]), r[8] < u.shield - 1); u.hp = r[6]; u.shield = u.maxShield ? Math.min(r[8], u.maxShield) : r[8]; (u as any).nf = r[9]; u.wind = r[12] / 10;
    if (u !== g.me) { u.yaw = r[5] / 100; u.pitch = r[11] / 100; u.pilot = r[10]; } else if (r[10] === net.id || s.time > g.possT + 1.5) u.pilot = r[10];
  }
  // Bodies the server says are there but hidden from this side: kept, and not drawn. Anything else missing is gone.
  const hid = new Set<number>(s.hz || []); for (const id of hid) { const u = g.uById.get(id); if (u && u.alive) { u.obj.visible = false; u.obj.userData.netHid = true; seen.add(id); } }
  for (const u of g.units) if (u.alive && !seen.has(u.id)) { u.alive = false; g.scene.remove(u.obj); if (u === g.me) g.staticT = .2; }
  const ext = new Map<number, any[]>(); for (const r of s.ux || []) ext.set(r[0], r);
  for (const u of g.units) { if (!u.alive || hid.has(u.id)) continue; const r = ext.get(u.id);
    if (u.maxEnergy) u.energy = r ? r[1] : u.energy; u.status = r && r[2] ? SBITS.filter((_, i) => r[2] & (1 << i)).map(k => ({ k, t: 1 })) : undefined;
    if (r) u.alt = r[3] / 10; else if (!u.air) u.alt = 0; const c = r && r[4] ? (g.uById.get(r[4]) || g.bById.get(r[4]) || null) : null; u.inside = c; if (c) { u.obj.visible = false; u.obj.userData.netHid = true; } else if (u.obj.userData.netHid) { u.obj.visible = true; u.obj.userData.netHid = false; } }
  const seenB = new Set<number>();
  for (const r of s.b) {
    let b = g.bById.get(r[0]); if (b && !b.alive) continue;
    if (!b) { b = g.addBuilding(BKINDS[r[1]], r[2], r[3], r[4], !!r[7], !!r[5], r[0]); g.bById.set(b.id, b); if (!r[7] && r[2] === 0) g.puff(V3(r[3], .3, r[4]), 5, 1.2, M.dust, .5, 2); }
    seenB.add(b.id);
    if (!b.built && r[7]) { b.built = true; b.obj.scale.y = 1; if (b.holo) { g.scene.remove(b.holo); b.holo = null; } sfx.built(); g.puff(V3(b.pos.x, 1.5, b.pos.z), 8, 1.8, M.dust, .8, 2.5); }
    b.progress = r[8] / 100; if (!b.built) b.obj.scale.y = Math.max(.06, b.progress);
    if (r[6] < b.hp - .5) b.lastHit = g.time; b.hp = r[6];
    if (b.built) { const st = b.hp < b.maxHp * .33 ? 2 : b.hp < b.maxHp * .66 ? 1 : 0; if (st > b.stage) g.crack(b, st); }
    const q: { kind: Kind; t: number }[] = []; for (let i = 0; i < r[9]; i++) q.push({ kind: KINDS[r[10]], t: r[11] }); b.queue = q; b.buds = r[12] || 0;
  }
  for (const b of g.buildings) if (b.alive && !seenB.has(b.id)) { b.alive = false; g.scene.remove(b.obj); if (b.holo) g.scene.remove(b.holo); g.carpet.drop(b); }
  const D = g.dir, d = s.d; D.raidIn = d[0]; D.raidDir = d[1] ? 'north' : 'east'; D.raidLive = !!d[2]; D.auto = !!d[3];
  D.plan = d[4] ? { phase: d[4][0], t: d[4][1], target: null, book: d[4][3], label: d[4][2] } : null;
  if (s.v) sideApply(g, D.vs, s.v);
  if (d[5] && !g.myTeam) { if (!D.callout || D.callout.text !== d[5][1]) sfx.callout(); D.callout = { who: d[5][0], text: d[5][1], t: d[5][2], dur: d[5][3], keys: d[5][4] }; } else D.callout = null;
  D.playbook.name = d[6][0]; D.playbook.steps = d[6][1]; D.playbook.idx = d[6][2];
  g.applying = false;
}

/** Client, every frame: take in what the server sent, ease every other body toward where it should be, and report our own. */
export function netTick(g: Game, dt: number) {
  const net = g.net!;
  for (const m of net.inbox) {
    if (m.t === 's') applySnap(g, m);
    else if (m.t === 'yo') net.unit = m.unit;
    else if (m.t === 'over') { g.stats.mined = m.stats[0]; g.stats.built = m.stats[1]; g.stats.kills = m.stats[2]; g.stats.lost = m.stats[3]; g.stats.minedV = m.stats[4] || 0; g.time = m.time; g.end(atHome(g.myTeam) ? !!m.won : !m.won); }
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
  for (let i = g.pings.length - 1; i >= 0; i--) if ((g.pings[i].t -= dt) <= 0) g.pings.splice(i, 1);
  const D = g.dir; D.raidIn -= dt; for (const S of [D, D.vs] as Side[]) { if (S.callout) S.callout.t -= dt; if (S.plan) S.plan.t -= dt; }
  net.sendT -= dt;
  if (net.sendT <= 0) {
    net.sendT = .05;
    net.flush(me && me.alive && g.staticT <= 0 ? [r1(me.pos.x), r1(me.pos.z), Math.round(g.yaw * 100) / 100, Math.round(g.pitch * 100) / 100, (me.moving ? F_MOVE : 0) | (g.fireCd > 0 && g.lmb ? F_FIRE : 0) | (g.brace ? F_BRACE : 0)] : null);
  }
}
export { isSoldier, THREE };
