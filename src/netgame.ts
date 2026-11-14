// What crosses the wire in a multiplayer match. The server owns the world: health, the economy, the AI and every
// death. Each player owns only their own body's movement and aim, and reports what they hit. The server sends
// everyone a snapshot of the world about fifteen times a second, plus a list of things to draw and say.
import * as THREE from 'three';
import { Game, beamMat } from './game';
import { UNIT, BLD, BUILDABLE, UPGRADES, TRAINS, UNIT_NEEDS, FACTION, VOICE_SIDE, SIDE, fac, atHome, Kind, BKind, Unit, Building, UpKey, isSoldier, isWorker, type StatusKey } from './data';
import { useAbility, abilityOf, whyNot, bodyOf, showCast, setAutocast, type Target } from './core/ability';
import { board, unload } from './core/cargo';
import { packLook, applyLook, packUnitLook, applyUnitLook, DEATHS } from './net-look';
import { abilityWords } from './card';
import { seenBy } from './core/sight';
import { multi, MATCH } from './core/sides';
import { SideView, LINGER } from './net-fog';
import { checkClaim, dropped } from './net-arms';
import type { Side } from './director';
import { V3, M, R, tracerMat } from './gfx';
import { sfx, babble } from './audio';

const KINDS = Object.keys(UNIT) as Kind[], BKINDS = Object.keys(BLD) as BKind[], UPS: UpKey[] = UPGRADES.map(u => u.key), ORD = ['guard', 'amove', 'follow', 'raid'] as const;
const r1 = (v: number) => Math.round(v * 10) / 10;
const F_MOVE = 1, F_TGT = 2, F_WORK = 4, F_CARRY = 8, F_FIRE = 16, F_BRACE = 128, /** in a player's own report: they are up in the command view */ F_ALOFT = 256;

// ---------------------------------------------------------------- server: world to snapshot
const unitRow = (x: Unit) => [x.id, KINDS.indexOf(x.kind), x.team, r1(x.pos.x), r1(x.pos.z), Math.round(x.yaw * 100), Math.ceil(x.hp), Math.ceil(x.maxHp), Math.floor(x.shield),
  (x.moving ? F_MOVE : 0) | (x.target ? F_TGT : 0) | (x.state === 'mining' || x.state === 'build' || x.state === 'repair' ? F_WORK : 0) | (x.carrying ? F_CARRY : 0) | (x.swing > .6 || x.flashT > 0 ? F_FIRE : 0) | (ORD.indexOf(x.order.type === 'scout' ? 'amove' : x.order.type) << 5)   /* two bits on the wire: a scout goes as a body on the march */ | (x.brace ? F_BRACE : 0),
  x.pilot, Math.round(x.pitch * 100), Math.round(x.wind * 10)];
const bldRow = (x: Building, g: Game) => [x.id, BKINDS.indexOf(x.kind), x.team, x.pos.x, x.pos.z, x.rot ? 1 : 0, Math.ceil(x.hp), x.built ? 1 : 0, Math.round(x.progress * 100), x.queue.length, x.queue[0] ? KINDS.indexOf(x.queue[0].kind) : 0, x.queue[0] ? r1(x.queue[0].t) : 0, x.buds || 0, 0, packLook(g, x)];
/** Switches for test servers, never set on a real one. `trustHits` (ORE_TRUST_HITS=1) checks hit claims the way the server did before
 *  claims were checked per attack (any hit, up to 450 a second from 175 m), so the browser sync tests (test/coop.mjs, test/versus.mjs) can end a match quickly with big hits. */
export const WIRE = { trustHits: false, /** Off: every side is sent the whole world, the way it was before fog on the wire. ORE_WIRE_FOG=0, for the same tests. */ fog: true };
/** The line out of each match, so a damage claim can be checked against what the claimer's side was sent. */
const WIRES = new WeakMap<Game, Wire>();
/** Index 13 of a building row: 1 when the side is not looking at it now and is sent its last sighting. */
const GHOST = 13;
/** Index 14: the numbers that only change how it looks (src/net-look.ts), or 0. */
const LOOK = 14;

/** One match's line out: takes each tick's events off the match once, and builds a snapshot for each side from what that side can see.
 *  `snap(null)` is the whole world, for an observer seat or a test. */
export class Wire {
  views = new Map<number, SideView>(); ev: any[] = []; private byId = new Map<number, Unit>();
  constructor(public g: Game) { WIRES.set(g, this); }
  view(team: number) { let v = this.views.get(team); if (!v) this.views.set(team, v = new SideView(team)); return v; }
  /** Call once per snapshot round, before `snap`: takes the events and works out what every side that has a seat can see. */
  begin(teams: Iterable<number>) {
    const g = this.g; this.ev = g.evq || []; g.evq = []; this.byId.clear(); for (const u of g.units) this.byId.set(u.id, u);
    for (const e of this.ev) if (e[0] === 'ku') { const u = DEATHS.get(e); if (u) { e[3] = packUnitLook(g, u); DEATHS.delete(e); } }   // how it died, for its look
    if (WIRE.fog) for (const t of new Set(teams)) if (t >= 0) this.view(t).update(g);
  }
  snap(team: number | null) {
    const g = this.g, D = g.dir, H = SIDE.home, Ot = SIDE.out, V = team === null || !WIRE.fog ? null : this.view(team), ok = (t: number) => !V || V.friend(t);
    let u: any[][], b: any[][], foeSeen = !V;
    // events first, against what the side was sent last time: a body that died this tick is not in this snapshot
    const ev = V ? this.ev.filter(e => this.shows(V, e)) : this.ev;
    if (!V) { u = g.units.filter(x => x.alive).map(unitRow); b = g.buildings.filter(x => x.alive).map(x => bldRow(x, g)); }
    else {
      u = []; const sentU = new Set<number>();
      for (const x of g.units) { if (!x.alive) continue; const mine = V.friend(x.team);
        if (!mine) { if (!seenBy(g, V.team, x)) { V.lastSeen.delete(x.id); continue; }   // unseen (cloaked, dug in) with no detector near: not sent at all
          if (V.seesUnit(x)) V.lastSeen.set(x.id, g.time); else if (g.time - (V.lastSeen.get(x.id) ?? -99) > LINGER) continue; foeSeen = true; }
        u.push(unitRow(x)); sentU.add(x.id); }
      for (const id of V.lastSeen.keys()) if (!sentU.has(id) && !this.byId.get(id)?.alive) V.lastSeen.delete(id);
      b = []; const sentB = new Set<number>(), live = new Set<number>();
      for (const x of g.buildings) { if (!x.alive) continue; live.add(x.id);
        if (V.friend(x.team) || V.seesBuilding(g, x)) { const r = bldRow(x, g); b.push(r); if (!V.friend(x.team)) { V.memory.set(x.id, r); foeSeen = true; sentB.add(x.id); } }
      }
      // A remembered building stays until somebody looks at the spot again and finds it gone, the same rule as the scouting records (src/scout.ts).
      for (const [id, r] of V.memory) { if (sentB.has(id)) continue; if (!live.has(id) && V.sees(r[3], r[4])) { V.memory.delete(id); continue; } const gr = r.slice(); gr[GHOST] = 1; gr[LOOK] = 0; b.push(gr); }
      V.sentU = sentU; V.sentB = sentB;
    }
    const st = g.stats, sts = [Math.floor(st.mined), st.built, st.kills, st.lost, Math.floor(st.minedV)]; if (V && !V.friend(H)) sts[0] = 0; if (V && !V.friend(Ot)) sts[4] = 0;
    // A team game: the ore each side has banked, for the sides this one may know about (every side, for a watcher).
    if (multi()) (sts as any[]).push(MATCH.teams.filter(t => !V || V.friend(t)).map(t => [t, Math.floor(st.bySide[t] || 0)]));
    const out: any = {
      t: 's', time: r1(g.time), u, b, e: ev,
      o: g.ores.map(n => !V || V.sees(n.pos.x, n.pos.z) ? Math.round(n.amount) : null),
      st: sts, mo: g.mission ? D.objectives() : 0, mc: g.mission && g.ms.clock !== undefined ? r1(g.ms.clock) : -1, sc: Object.keys(g.score).map(k => [+k, g.score[+k][0], Math.floor(g.score[+k][1]), g.score[+k][2]]),
    };
    // Extra fields only some bodies have: energy, effects, height and the carrier it rides in. Only for bodies this side is sent.
    { const sent = new Set<number>(u.map(r => r[0] as number)); out.ux = g.units.filter(x => x.alive && sent.has(x.id) && (x.maxEnergy || x.status?.length || x.alt || x.inside || x.cast || packUnitLook(g, x))).map(x => [x.id, Math.floor(x.energy || 0), statusBits(x), Math.round((x.alt || 0) * 10), x.inside ? x.inside.id : 0, castRow(x), packUnitLook(g, x)]); }
    out.fl = [ok(H) ? Math.floor(g.flux(H)) : null, ok(Ot) ? Math.floor(g.flux(Ot)) : null];   // Flux: each side its own
    const ups = (t: number) => UPS.map((k, i) => g.upOf(t)[k] ? i : -1).filter(i => i >= 0);
    // A side's own purse, plan and research. The other side's research only while some of it is in sight, because it shows on the bodies (shields, the Bloom).
    if (ok(H)) { out.ore = Math.floor(g.cash(H)); out.d = [r1(D.raidIn), D.raidDir === 'north' ? 1 : 0, D.raidLive ? 1 : 0, D.auto ? 1 : 0, D.plan ? [D.plan.phase, r1(D.plan.t), D.plan.label, D.plan.book] : 0, D.callout ? [D.callout.who, D.callout.text, r1(D.callout.t), D.callout.dur, D.callout.keys] : 0, [D.playbook.name, D.playbook.steps, D.playbook.idx]]; }
    if (ok(Ot)) { out.vo = Math.floor(g.cash(Ot)); out.v = g.eco ? sideSnap(D.vs) : 0; }
    if (ok(H) || foeSeen) out.up = ups(H); if (ok(Ot) || foeSeen) out.uo = ups(Ot);
    return out;
  }
  /** Whether a side is told about an event: only what happens where it can see, to it, or for everyone. */
  shows(V: SideView, e: any[]) {
    const g = this.g, k = e[0], at = (x: number, z: number) => V.sees(x, z), mine = (pid: any) => typeof pid === 'number' && pid > 0 && V.friend(g.teams[pid] ?? SIDE.home);
    switch (k) {
      case 'fd': if (e[3] === 'ch' || e[1] === 'Signal') return true; if (e[4]) return mine(e[4]); return e[5] >= 0 ? V.friend(e[5]) : (VOICE_SIDE[e[1]] || 0) === fac(V.team);
      case 'pg': return mine(e[1]);
      case 'tr': return mine(e[9]) || at(e[1], e[3]) || at(e[4], e[6]);
      case 'pj': return V.friend(e[7]) || mine(e[10]) || at(e[1], e[3]) || at(e[1] + e[4] * .8, e[3] + e[6] * .8);
      case 'ex': return mine(e[6]) || at(e[1], e[3]);
      case 'wn': return at(e[1], e[2]);
      case 'ku': return V.sentU.has(e[1]);
      case 'kb': return V.sentB.has(e[1]) || g.buildings.some(b => b.id === e[1] && V.friend(b.team));
      case 'ht': { const u = this.byId.get(e[1]); return !!u && V.friend(u.team); }
      // a cast going off: only to a side that was sent the caster (its own, or one looking at it)
      case 'ab': { const u = this.byId.get(e[1]); return !!u && (V.friend(u.team) || V.sentU.has(e[1])); }
      default: return true;
    }
  }
}
/** A wind-up under way, so every screen shows it coming: which ability, seconds left, the aim. 0 for none. */
const castRow = (x: Unit) => x.cast ? [x.cast.key, r1(x.cast.t), r1(x.cast.x), r1(x.cast.z), x.cast.id || 0] : 0;
const SBITS: StatusKey[] = ['slow', 'stun', 'root', 'unseen', 'revealed', 'dug', 'lifted', 'shielded', 'burning', 'borrowed', 'blind'];
const statusBits = (u: Unit) => (u.status || []).reduce((n, s) => s.t > 0 ? n | (1 << SBITS.indexOf(s.k)) : n, 0);
/** One snapshot without a Wire: the whole world (team -1, as an observer or split screen sees it), or what one side can see right now.
 *  Takes the tick's events off the match unless `ev` is given. A match keeps a Wire instead, so a side remembers the buildings it saw. */
export function buildSnap(g: Game, team = -1, ev?: any[]) { const w = new Wire(g); if (ev) { w.ev = ev; if (team >= 0) w.view(team).update(g); } else w.begin(team >= 0 ? [team] : []); return w.snap(team >= 0 ? team : null); }
/** Snapshots for every side with a player, sharing one tick's events, as JSON by team. */
export function buildSnaps(g: Game, teams: number[]): Map<number, string> { const w = new Wire(g), out = new Map<number, string>(); w.begin(teams); for (const t of new Set(teams)) out.set(t, JSON.stringify(w.snap(t))); return out; }

/** One side's squad and economy brain, for the players on that side. */
function sideSnap(S: Side) { return [S.raidLive ? 1 : 0, S.auto ? 1 : 0, S.plan ? [S.plan.phase, r1(S.plan.t), S.plan.label, S.plan.book] : 0, S.callout ? [S.callout.who, S.callout.text, r1(S.callout.t), S.callout.dur, S.callout.keys] : 0, [S.playbook.name, S.playbook.steps, S.playbook.idx]]; }
function sideApply(g: Game, S: Side, d: any[]) {
  S.raidLive = !!d[0]; S.auto = !!d[1]; S.plan = d[2] ? { phase: d[2][0], t: d[2][1], target: null, book: d[2][3], label: d[2][2] } : null;
  if (d[3]) { if (!S.callout || S.callout.text !== d[3][1]) sfx.callout(); S.callout = { who: d[3][0], text: d[3][1], t: d[3][2], dur: d[3][3], keys: d[3][4] }; } else S.callout = null;
  S.playbook.name = d[4][0]; S.playbook.steps = d[4][1]; S.playbook.idx = d[4][2];
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
    // A player reports their own hits, so the server checks each one against the attacks that body really has: reach, how hard, how often,
    // and a clear line for a gun (src/net-arms.ts). The target has to be an enemy that this side can see.
    if (!unit) return; const id = num(1), t = g.units.find(x => x.id === id) || g.buildings.find(x => x.id === id); if (!t || !t.alive || t.team === unit.team) return;
    if (WIRE.trustHits) {   // test servers only (see WIRE): the old allowance, any hit up to 450 a second from 175 m
      if (Math.hypot(t.pos.x - unit.pos.x, t.pos.z - unit.pos.z) > 175) return;
      const bk = BUDGET.get(unit) || { left: 900, t: g.time }; BUDGET.set(unit, bk); bk.left = Math.min(900, bk.left + (g.time - bk.t) * 450); bk.t = g.time;
      const amt = Math.min(450, num(2), bk.left); if (amt > 0) { bk.left -= amt; g.damage(t, amt, unit, !!c[3]); } return;
    }
    const V = WIRES.get(g)?.views.get(unit.team); if (V && !(V.sentU.has(id) || V.sentB.has(id))) { dropped.unseen = (dropped.unseen || 0) + 1; return; }
    const amt = checkClaim(g, unit, t, Math.min(450, num(2))); if (amt > 0) g.damage(t, amt, unit, !!c[3]);
  }
  // Abilities (src/core/ability.ts). Every check reads the ability's own definition (energy, cooldown, range, what it may be aimed at),
  // so a new ability is covered the day it is defined. On top of those: the body is the player's own (or an undriven one of their side),
  // and a body-aimed ability needs a target this side can see. A refusal is counted (dropped['ab ...']) and the player is told why.
  // The old one-off calls ('vs', 'gb', 'pt') are the same abilities under their old names.
  else if (k === 'ab') abilityAsk(g, pid, unit, side, c, num);
  // Autocast on or off for one body; boarding a carrier ('ld' then body ids, then the carrier's id last); letting out of a carrier.
  else if (k === 'aa') { const u = g.units.find(x => x.id === num(1)); if (u && u.alive && u.team === side) setAutocast(g, u, String(c[2]), !!num(3)); }
  else if (k === 'ld') { const ids = c.slice(1).map(Number).filter(Number.isFinite).slice(0, 40), cid = ids.pop(), car = g.units.find(x => x.id === cid) || g.buildings.find(x => x.id === cid);
    if (car && car.alive && car.team === side) for (const id of ids) { const u = g.units.find(x => x.id === id); if (u && u.alive && u.team === side && (u === unit || !u.pilot)) board(g, u, car); } }
  else if (k === 'ul') { const car = g.units.find(x => x.id === num(1)) || g.buildings.find(x => x.id === num(1)); if (car && car.alive && car.team === side) { const w = num(2) ? (car.cargo || []).find(u => u.id === num(2)) : undefined; if (!num(2) || w) unload(g, car, w); } }
  else if (k === 'vs') { if (unit && unit.kind === 'warden') useAbility(g, unit, 'lownote'); }
  // A building's action: the building's own rules check it (BldAction.ok and cost). An aim, if sent, is kept on the map.
  else if (k === 'ba') { const b = g.buildings.find(x => x.id === num(1)); if (b && b.alive && b.team === side && b.built) { const aim = typeof c[3] === 'number' && typeof c[4] === 'number' ? { x: Math.max(-900, Math.min(900, num(3))), z: Math.max(-900, Math.min(900, num(4))) } : undefined; g.feedTo = pid; g.buildingAction(b, String(c[2]).slice(0, 24), true, aim); g.feedTo = 0; } }
  else if (k === 'cq') { const b = g.buildings.find(x => x.id === num(1)); if (b && b.alive && b.team === side) g.cancelTrain(b, num(2)); }
  else if (k === 'hl') { const o = g.units.find(x => x.id === num(1)); if (unit && unit.kind === 'patch' && o && o.alive && o.team === unit.team && Math.hypot(o.pos.x - unit.pos.x, o.pos.z - unit.pos.z) < 70) { const bk = BUDGET.get(unit) || { left: 900, t: g.time }; BUDGET.set(unit, bk); bk.left = Math.min(900, bk.left + (g.time - bk.t) * 450); bk.t = g.time; if (bk.left >= 80) { bk.left -= 80; o.hp = Math.min(o.maxHp, o.hp + 10); } } }
  else if (k === 'dp') { if (!unit) return; const p = g.props[num(1)]; if (p && p.alive && Math.hypot(p.x - unit.pos.x, p.z - unit.pos.z) < 175 + p.r) { const a = allow(g, unit, 'dp', Math.min(900, num(2)), 2400, 1200); if (a > 0) g.damageProp(p, a, unit); } }
  else if (k === 'tr') { if (c.length === 9) g.evq!.push(['tr', ...c.slice(1).map(Number), pid]); }
  else if (k === 'pj') { if (c.length === 9) g.evq!.push(['pj', ...c.slice(1).map(Number), 2, pid]); }
  else if (k === 'tn') {
    const b = g.buildings.find(x => x.id === num(1)), kind = c[2] as Kind; if (!b || !b.alive || b.team !== side || !b.built || !(TRAINS[b.kind] || []).includes(kind) || (UNIT[kind].team || 0) !== fac(side)) return;
    const nb = UNIT_NEEDS[kind]; if (nb && !g.ownB(nb, true, side).length) return; if (g.gated(side, kind)) return;
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
  else if (k === 'uo') {
    // Orders from the command view: which bodies, what to do, and where. Only this player's own side, and never a body somebody is driving.
    const o = String(c[1]), ids = Array.isArray(c[5]) ? c[5].filter((v: any) => typeof v === 'number').slice(0, 80) : []; if (o.length !== 1 || !'maobr'.includes(o) || !ids.length) return;
    g.dir.command(side, ids, o, Math.max(-900, Math.min(900, num(2))), Math.max(-900, Math.min(900, num(3))), Math.round(num(4)));
  }
  else if (k === 'or') { const o = String(c[1]); if ('GVMXZCS'.includes(o) && o.length === 1 && (unit ? unit.team === side : side === SIDE.home)) g.dir.order(o, num(2), num(3), unit); }
}
/** Refused ability asks since the server started, by reason, and how many went through. For tests and /healthz. */
export const abAsks = { ok: 0 };
function abilityAsk(g: Game, pid: number, unit: Unit | null, side: number, c: any[], num: (i: number) => number) {
  const no = (why: string, tell = '') => { dropped['ab ' + why] = (dropped['ab ' + why] || 0) + 1; if (tell) { g.feedTo = pid; g.feed(FACTION[side].voice, tell, 'al', side); g.feedTo = 0; } };
  const u = g.units.find(x => x.id === num(1)), key = String(c[2]).slice(0, 24), t: Target = { x: num(3), z: num(4), id: num(5) || undefined };
  if (!u || !u.alive) return no('gone');
  if (!(u === unit || (u.team === side && !u.pilot))) return no('not yours');
  const a = abilityOf(u.kind, key); if (!a) return no('no such ability');
  if (a.target === 'body' && t.id && !WIRE.trustHits) { const V = WIRES.get(g)?.views.get(u.team); if (V && !(V.sentU.has(t.id) || V.sentB.has(t.id))) return no('unseen', `${a.name}: you cannot see that.`); }
  const why = whyNot(g, u, key, t); if (why) return no(why, `${a.name}: ${abilityWords(why, a, u)}.`);
  if (useAbility(g, u, key, t)) abAsks.ok++;
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
  unit.moving = !!(f & F_MOVE); unit.brace = !!(f & F_BRACE); unit.aloft = !!(f & F_ALOFT); if (f & F_FIRE) { unit.swing = 1; unit.flashT = .08; } unit.target = null;
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
  else if (k === 'ku') { const u = g.uById.get(e[1]); if (u && u.alive) { applyUnitLook(g, u, e[3]); g.killUnit(u, g.uById.get(e[2]) || g.bById.get(e[2]) || null); } }
  else if (k === 'kb') { const b = g.bById.get(e[1]); if (b && b.alive) { g.fallA = e[2]; g.killBuilding(b); } }
  else if (k === 'pr') { const p = g.props[e[1]]; if (p && p.alive && p.hp > e[2]) g.damageProp(p, p.hp - e[2], null); }
  else if (k === 'wn') g.warn(e[1], e[2], e[3], e[4]);
  else if (k === 'ab') CASTS.push(e);   // played once the snapshot is in, so the caster's state after the cast (cloaked, say) is there
  else if (k === 'ht') { const me = g.me; if (me && e[1] === me.id) { g.shake = Math.min(1, g.shake + .45); const a = Math.atan2(e[2] - me.pos.x, e[3] - me.pos.z) - g.yaw; g.hud.hurt(Math.atan2(Math.sin(a), Math.cos(a))); sfx.hurt(); me.lastHit = g.time; if (g.brace) { g.payback = Math.min(1, g.payback + .2); sfx.clang(); } } }
}
/** Casts that went off, from this snapshot's events: played at its end. */
const CASTS: any[][] = [];
function playCasts(g: Game) {
  for (const e of CASTS) { const u = g.uById.get(e[1]); if (!u) continue; const a = abilityOf(u.kind, e[2]); if (!a) continue;
    if (u.cast && u.cast.key === a.key) u.cast = null;
    const tgt = a.target === 'body' ? bodyOf(g, e[5]) : null; if (a.target === 'body' && !tgt) continue;
    showCast(g, u, a, { x: e[3], z: e[4], id: e[5] || undefined }, tgt); }
  CASTS.length = 0;
}
export function applySnap(g: Game, s: any) {
  const net = g.net!; g.applying = true; CASTS.length = 0;
  for (const e of s.e) event(g, e);
  g.time = s.time; if (s.ore !== undefined) g.purse[SIDE.home] = s.ore; if (s.vo !== undefined) g.purse[SIDE.out] = s.vo; if (s.fl) { if (typeof s.fl[0] === 'number') g.fluxPurse[SIDE.home] = s.fl[0]; if (typeof s.fl[1] === 'number') g.fluxPurse[SIDE.out] = s.fl[1]; }
  for (const [t, list] of [[SIDE.home, s.up], [SIDE.out, s.uo]] as [number, number[] | undefined][]) { if (!list) continue; const on = new Set<number>(list), U = g.upOf(t); UPS.forEach((k, i) => { const was = U[k]; U[k] = on.has(i); if (k === 'gbloom' && U[k] && !was) g.carpet.deepen(t); }); }
  g.ores.forEach((n, i) => { const a = s.o[i]; if (typeof a === 'number' && a !== n.amount) { n.amount = a; g.oreCheck(n); } });   // null: out of this side's sight, so the last count it saw stands
  if (s.sc) { g.score = {}; for (const r of s.sc) g.score[r[0]] = [r[1], r[2], r[3]]; }
  if (s.mo) g.netObjs = s.mo; if (s.mc >= 0) g.ms.clock = s.mc;
  g.stats.mined = s.st[0]; g.stats.built = s.st[1]; g.stats.kills = s.st[2]; g.stats.lost = s.st[3]; g.stats.minedV = s.st[4] || 0; if (Array.isArray(s.st[5])) for (const [t, v] of s.st[5]) g.stats.bySide[t] = v;
  const seen = new Set<number>();
  for (const r of s.u) {
    let u = g.uById.get(r[0]); if (u && !u.alive) continue;
    if (!u) { u = g.spawn(KINDS[r[1]], r[2], r[3], r[4], r[0]); g.uById.set(u.id, u); }
    seen.add(u.id); u.nx = r[3]; u.nz = r[4]; u.maxHp = r[7]; if (g.eco && UNIT[u.kind].shield) u.maxShield = UNIT[u.kind].shield * g.armorMul(u.team);   // Veyl glass upgrades thicken shields too
    if (r[8] < u.shield - 1) g.bubble(u); if (r[6] < u.hp - .5 || r[8] < u.shield - 1) g.fx.remote(u, Math.max(1, u.hp - r[6], u.shield - r[8]), r[8] < u.shield - 1); u.hp = r[6]; u.shield = u.maxShield ? Math.min(r[8], u.maxShield) : r[8]; (u as any).nf = r[9]; u.wind = r[12] / 10;
    if (u !== g.me || net.watch) { u.yaw = r[5] / 100; u.pitch = r[11] / 100; u.pilot = r[10]; } else if (r[10] === net.id || s.time > g.possT + 1.5) u.pilot = r[10];
  }
  // A body that is no longer sent has died, or (an enemy) gone out of sight. A hidden one is dropped entirely, so it can be drawn again when it is next seen.
  for (const u of g.units) if (u.alive && !seen.has(u.id)) { u.alive = false; g.scene.remove(u.obj); if (u === g.me) g.staticT = .2; if (u.team !== g.myTeam) g.uById.delete(u.id); }
  const ext = new Map<number, any[]>(); for (const r of s.ux || []) ext.set(r[0], r);
  for (const u of g.units) { if (!u.alive) continue; const r = ext.get(u.id);
    if (u.maxEnergy) u.energy = r ? r[1] : u.energy; u.status = r && r[2] ? SBITS.filter((_, i) => r[2] & (1 << i)).map(k => ({ k, t: 1 })) : undefined;
    // a wind-up: the same record kept while it runs (the looks notice a new one by identity), counted down here between snapshots
    applyUnitLook(g, u, r && r[6]);
    const c0 = r && r[5]; if (!c0) u.cast = null; else if (u.cast && u.cast.key === c0[0] && u.cast.x === c0[2] && u.cast.z === c0[3]) u.cast.t = c0[1]; else u.cast = { key: c0[0], t: c0[1], x: c0[2], z: c0[3], id: c0[4] };
    if (r) u.alt = r[3] / 10; else if (!u.air) u.alt = 0; const c = r && r[4] ? (g.uById.get(r[4]) || g.bById.get(r[4]) || null) : null; u.inside = c; if (c) { u.obj.visible = false; u.obj.userData.netHid = true; } else if (u.obj.userData.netHid) { u.obj.visible = true; u.obj.userData.netHid = false; } }
  const seenB = new Set<number>();
  for (const r of s.b) {
    let b = g.bById.get(r[0]); if (b && !b.alive) continue;
    if (!b) { b = g.addBuilding(BKINDS[r[1]], r[2], r[3], r[4], !!r[7], !!r[5], r[0]); g.bById.set(b.id, b); if (!r[7] && r[2] === 0) g.puff(V3(r[3], .3, r[4]), 5, 1.2, M.dust, .5, 2); }
    seenB.add(b.id); (b as any).ghost = r[GHOST] === 1; (b as any).nx = r[3]; (b as any).nz = r[4];   // where it is now: one that crawls or flies moves   // an enemy building this side is not looking at now: as it was when last seen
    if (!b.built && r[7]) { b.built = true; b.obj.scale.y = 1; if (b.holo) { g.scene.remove(b.holo); b.holo = null; } sfx.built(); g.puff(V3(b.pos.x, 1.5, b.pos.z), 8, 1.8, M.dust, .8, 2.5); }
    b.progress = r[8] / 100; if (!b.built) b.obj.scale.y = Math.max(.06, b.progress);
    if (r[6] < b.hp - .5) b.lastHit = g.time; b.hp = r[6];
    if (b.built) { const st = b.hp < b.maxHp * .33 ? 2 : b.hp < b.maxHp * .66 ? 1 : 0; if (st > b.stage) g.crack(b, st); }
    const q: { kind: Kind; t: number }[] = []; for (let i = 0; i < r[9]; i++) q.push({ kind: KINDS[r[10]], t: r[11] }); b.queue = q; b.buds = r[12] || 0;
    applyLook(g, b, r[GHOST] === 1 ? 0 : r[LOOK]);
  }
  for (const b of g.buildings) if (b.alive && !seenB.has(b.id)) { b.alive = false; g.scene.remove(b.obj); if (b.holo) g.scene.remove(b.holo); g.carpet.drop(b); if (b.team !== g.myTeam) g.bById.delete(b.id); }
  const D = g.dir, d = s.d; if (d) { D.raidIn = d[0]; D.raidDir = d[1] ? 'north' : 'east'; D.raidLive = !!d[2]; D.auto = !!d[3];
  D.plan = d[4] ? { phase: d[4][0], t: d[4][1], target: null, book: d[4][3], label: d[4][2] } : null;
  if (d[5] && !g.myTeam) { if (!D.callout || D.callout.text !== d[5][1]) sfx.callout(); D.callout = { who: d[5][0], text: d[5][1], t: d[5][2], dur: d[5][3], keys: d[5][4] }; } else D.callout = null;
  D.playbook.name = d[6][0]; D.playbook.steps = d[6][1]; D.playbook.idx = d[6][2]; }
  if (s.v) sideApply(g, D.vs, s.v);
  playCasts(g);
  g.applying = false;
}

/** Client, every frame: take in what the server sent, ease every other body toward where it should be, and report our own. */
/** What a watcher is looking through: one player's body (their id), or failing that any body on one side. */
export interface WatchView { follow: number; team: number }
/** Puts a watcher's view in the body that the followed player drives. When they have none (dead, waiting for a fresh body) the view stays
 *  where it is until that body is gone, then takes any body on the same side. */
function follow(g: Game, w: WatchView) {
  let u: Unit | undefined = w.follow ? g.units.find(x => x.alive && x.pilot === w.follow) : undefined;
  if (w.follow && u) w.team = u.team;
  if (!u && g.me && g.me.alive && g.me.team === w.team) return;
  if (!u) u = g.units.find(x => x.alive && x.team === w.team && x.pilot) || g.units.find(x => x.alive && x.team === w.team);
  if (!u || u === g.me) return;
  const pilot = u.pilot; u.pilot = 0; g.myTeam = u.team; g.possess(u, true); u.pilot = pilot; g.staticT = 0; g.net!.out = [];
}
export function netTick(g: Game, dt: number) {
  const net = g.net!;
  for (const m of net.inbox) {
    if (m.t === 's') applySnap(g, m);
    else if (m.t === 'yo') net.unit = m.unit;
    else if (m.t === 'over') { g.stats.mined = m.stats[0]; g.stats.built = m.stats[1]; g.stats.kills = m.stats[2]; g.stats.lost = m.stats[3]; g.stats.minedV = m.stats[4] || 0; g.time = m.time; g.end(m.mine || atHome(g.myTeam) ? !!m.won : !m.won); }
  }
  net.inbox.length = 0;
  // a body the server has given us and we are not yet driving
  if (net.unit) { const u = g.uById.get(net.unit); if (u && u.alive) { net.unit = 0; u.pilot = net.id; g.staticT = 0; g.jumpCd = 0; const first = !g.me; g.possess(u, true); if (!first) { sfx.jump(); g.pipe.flash = .4; } } }
  if (net.watch) follow(g, net.watch);
  const me = g.me, W = !!net.watch;
  if (!W && me && me.alive && me.pilot && me.pilot !== net.id && g.staticT <= 0) { g.feed('Signal', 'Someone else got to that body first.', 'al'); g.staticT = .3; }
  for (const u of g.units) {
    if (!u.alive) continue; const f = (u as any).nf | 0;
    u.swing = Math.max(0, u.swing - dt * 4); u.flashT -= dt; u.pop = Math.max(0, u.pop - dt * 7); if (u.cast) u.cast.t = Math.max(0, u.cast.t - dt);
    if (u === me && !W) continue;
    const dx = u.nx - u.pos.x, dz = u.nz - u.pos.z, d2 = dx * dx + dz * dz;
    if (d2 > 200) { u.pos.x = u.nx; u.pos.z = u.nz; } else { const k = Math.min(1, dt * 11); u.pos.x += dx * k; u.pos.z += dz * k; }
    u.moving = !!(f & F_MOVE) || d2 > .25; u.target = f & F_TGT ? u : null; u.state = f & F_WORK ? 'mining' : 'idle'; u.brace = !!(f & F_BRACE);
    u.order.type = ORD[(f >> 5) & 3]; if (u.rig.pack) u.rig.pack.visible = !!(f & F_CARRY);
    if (f & F_FIRE) { u.swing = Math.max(u.swing, .9); u.flashT = .05; }
  }
  // keep our own body out of the others
  if (me && me.alive) for (const o of g.units) { if (o === me || !o.alive) continue; const dx = me.pos.x - o.pos.x, dz = me.pos.z - o.pos.z, lim = (UNIT[me.kind].rad + UNIT[o.kind].rad) * (o.team === me.team ? 1.1 : 1.25), d2 = dx * dx + dz * dz; if (d2 < lim * lim && d2 > 1e-5) { const d = Math.sqrt(d2); me.pos.x += dx / d * (lim - d); me.pos.z += dz / d * (lim - d); } }
  // a building that crawls or flies eases to where it was last sent
  for (const b of g.buildings) { if (!b.alive) continue; const bx = (b as any).nx, bz = (b as any).nz; if (bx === undefined || (bx === b.pos.x && bz === b.pos.z)) continue;
    const dx = bx - b.pos.x, dz = bz - b.pos.z, k = dx * dx + dz * dz > 400 ? 1 : Math.min(1, dt * 8); b.pos.x = Math.abs(dx) < .01 ? bx : b.pos.x + dx * k; b.pos.z = Math.abs(dz) < .01 ? bz : b.pos.z + dz * k; b.obj.position.x = b.pos.x; b.obj.position.z = b.pos.z; }
  // damaged friendly buildings smoke, as they do offline
  for (const b of g.buildings) if (b.alive && b.built && b.team === 0 && b.hp < b.maxHp * .5) { b.smokeT -= dt; if (b.smokeT <= 0) { const bad = b.hp < b.maxHp * .25; b.smokeT = bad ? .18 : .4; g.puff(V3(b.pos.x + R(-b.hx, b.hx) * .6, b.h * R(.6, 1), b.pos.z + R(-b.hz, b.hz) * .6), 1, 1.5, bad && Math.random() < .5 ? M.fire : M.smoke, 2.4, .5); } }
  for (let i = g.pings.length - 1; i >= 0; i--) if ((g.pings[i].t -= dt) <= 0) g.pings.splice(i, 1);
  const D = g.dir; D.raidIn -= dt; for (const S of [D, D.vs] as Side[]) { if (S.callout) S.callout.t -= dt; if (S.plan) S.plan.t -= dt; }
  // A watcher sends nothing: the view follows a player, and the server would drop anything they sent.
  if (W) { net.out = []; if (me && me.alive) { const k = Math.min(1, dt * 12); let dy = me.yaw - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.yaw += dy * k; g.pitch += (me.pitch - g.pitch) * k; } return; }
  net.sendT -= dt;
  if (net.sendT <= 0) {
    net.sendT = .05;
    net.flush(me && me.alive && g.staticT <= 0 ? [r1(me.pos.x), r1(me.pos.z), Math.round(g.yaw * 100) / 100, Math.round(g.pitch * 100) / 100, (me.moving ? F_MOVE : 0) | (g.fireCd > 0 && g.lmb ? F_FIRE : 0) | (g.brace ? F_BRACE : 0) | (g.cmd.on ? F_ALOFT : 0)] : null);
  }
}
export { isSoldier, THREE };
