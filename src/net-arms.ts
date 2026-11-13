// Checking a player's damage claims on the match server.
// In a match on the server each player's own browser works out what their shots hit, and reports each hit ('dm'). The server checks every
// report against what that body could really do: one of the body's own attacks has to reach the target, hit that hard, and be ready again.
// A gun needs a clear line from the eye to the target. A report that fits none of the body's attacks is dropped.
//
// The numbers here are the first-person attacks in src/game.ts (updateRigger, updateGun, updateCannon, updateVeyl) and src/gloam-play.ts
// (playerGloam), before damage research. If one of those attacks changes, change its row here, or honest hits start being dropped
// (test/online/claims.mjs fires every attack in this table at its limit).
import type { Game } from './game';
import { UNIT, Unit, Building, fac } from './data';
import { clear } from './net-fog';

export interface Move {
  /** Attack name, for logs and tests. */ name: string;
  /** Reach in metres, from the attacker to the edge of the target. */ range: number;
  /** The most one hit can do to a body, and to a building (if different), before damage research. */ hit: number; bld?: number;
  /** Separate hits one use can land: pellets, pierced bodies, everything inside a blast. */ n: number;
  /** Seconds between uses, at the fastest. */ every: number;
  /** A shot along a line, which needs a clear line of sight. Blasts and swings do not. */ aim?: boolean;
  /** Hits one use can land on the same target: the scattergun's pellets. Everything else hits each target once. */ one: number;
}
const M = (name: string, range: number, hit: number, n: number, every: number, aim = false, bld?: number, one = 1): Move => ({ name, range, hit, n, every, aim, bld, one });
const WORKER = [M('drill', 3.6, 10, 1, .25), M('drill kick', 3.6, 22, 6, 1.1, false, 40)];

/** Every attack a driven body can make, by kind. */
export const ARMS: Record<string, Move[]> = {
  rigger: WORKER, tender: WORKER, grazer: WORKER,
  linesman: [M('rifle', 150, 15, 1, .12, true), M('grenade', 70, 75, 10, 5, false)],
  breacher: [M('scattergun', 34, 16.2, 9, .78, true, undefined, 9), M('shield bash', 3.4, 24, 6, .9)],
  gantry: [M('autocannon', 140, 34, 1, .36, true), M('autocannon burst', 143, 14, 6, .36), M('shell salvo', 110, 70, 16, 7), M('stomp', 6.5, 46, 10, 6, false, 60)],
  longshot: [M('long rifle', 150, 150, 3, 1.15, true)],
  patch: [M('rivet pistol', 150, 12, 1, .2, true)],
  cantor: [M('blade', 3, 28, 6, .6, false, 14), M('whirl', 3.8, 24, 10, 6)],
  lancer: [M('note', 70, 40, 1, 1.15, true), M('held note', 80, 55, 4, 7, true, 40)],
  warden: [M('low note blast', 8.2, 38, 10, 2.5, false, 53.2)],
  snapper: [M('bite', 2.8, 12, 6, .36, false, 8), M('pounce', 3.2, 20, 6, 3, false, 10)],
  quillback: [M('quill', 70, 29, 1, .55, true), M('quill fan', 70, 18, 5, 6, true)],
  blister: [],   // the Blister's burst is done on the server ('gb'), so it never reports a hit
  mulcher: [M('tusk sweep', 4.4, 34, 6, 1.4, false, 27.2), M('charge', 4, 45, 10, 6)],
};
/** For a kind with no row yet (a new unit): the old flat allowance, so it still plays online. Logged once per kind. */
const LOOSE = [M('any', 175, 450, 2, 1)];
const warned = new Set<string>();

/** Room for the two ends seeing the world a little differently: a quarter second of movement each way, and rounding. */
export const SLACK = 4, TOL = 1.2;
/** How many uses of an attack can arrive at once: two, or what fits in 0.6 seconds, so a late batch of shots still counts. One for a slow attack. */
const burstOf = (m: Move) => m.every >= 1.5 ? 1 : Math.max(2, .6 / m.every);

type Left = { left: number; t: number };
const BUCKET = new WeakMap<Unit, Map<string, Left>>();
/** Takes `amt` from a refilling allowance, or returns false and takes nothing. */
function take(all: Map<string, Left>, key: string, full: number, perSec: number, now: number, amt: number) {
  let b = all.get(key); if (!b) all.set(key, b = { left: full, t: now }); b.left = Math.min(full, b.left + Math.max(0, now - b.t) * perSec); b.t = now;
  return b.left >= amt;
}
/** Claims dropped since the server started, by reason. For tests and the server log. */
export const dropped: Record<string, number> = {};
const drop = (why: string) => { dropped[why] = (dropped[why] || 0) + 1; return 0; };

/** The most a hit can be pushed up by this side's research, the difficulty and the Veyl's song. */
function mulOf(g: Game, team: number) { return Math.max(1, g.gunMul(team), g.foeK(team) * g.gunMul(team), fac(team) === 1 ? g.vMul(team) : 1) * (g.upOf(team).glass ? 1.15 : 1); }

/** Checks one damage report. Returns how much of it stands (0 when it is dropped). */
export function checkClaim(g: Game, by: Unit, t: Unit | Building, amt: number): number {
  if (!(amt > 0) || !isFinite(amt)) return drop('amount');
  const isB = !('kind' in t && t.kind in UNIT), reach = isB ? g.distToBox(t as Building, by.pos.x, by.pos.z) : Math.max(0, Math.hypot(t.pos.x - by.pos.x, t.pos.z - by.pos.z) - UNIT[(t as Unit).kind].rad);
  let moves = ARMS[by.kind]; if (!moves) { moves = LOOSE; if (!warned.has(by.kind)) { warned.add(by.kind); console.warn(`no wire attacks listed for ${by.kind}: using the loose allowance (src/net-arms.ts)`); } }
  const mul = mulOf(g, by.team); let why = moves.length ? 'range' : 'no attack';
  let all = BUCKET.get(by); if (!all) BUCKET.set(by, all = new Map()); if (all.size > 400) all.clear();
  let sight: boolean | null = null;
  for (const m of [...moves].sort((a, b) => a.hit - b.hit)) {
    if (reach > m.range + SLACK) continue;
    const cap = (isB && m.bld !== undefined ? m.bld : m.hit) * mul * TOL + .5; if (amt > cap) { why = 'too hard'; continue; }
    if (m.aim && reach > 6) { if (sight === null) sight = seen(g, by, t, isB); if (!sight) { why = 'no line of sight'; continue; } }
    // Two allowances: everything this attack can do in a use (all the bodies in a blast), and what it can do to this one target.
    const one = (isB && m.bld !== undefined ? m.bld : m.hit) * mul, k = burstOf(m) * TOL, now = g.time, tk = m.name + ':' + t.id;
    if (!take(all, m.name, one * m.n * k, one * m.n / m.every * TOL, now, amt) || !take(all, tk, one * m.one * k, one * m.one / m.every * TOL, now, amt)) { why = 'too fast'; continue; }
    all.get(m.name)!.left -= amt; all.get(tk)!.left -= amt; return amt;
  }
  return drop(why);
}
/** A clear line from the attacker's eye to some part of the target. */
function seen(g: Game, by: Unit, t: Unit | Building, isB: boolean) {
  const eye = UNIT[by.kind].eye;
  if (!isB) { const st = UNIT[(t as Unit).kind]; return clear(g, by, eye, t.pos.x, st.bodyY, t.pos.z, t) || clear(g, by, eye, t.pos.x, st.headY, t.pos.z, t) || clear(g, by, eye, t.pos.x, st.bodyY * .35, t.pos.z, t); }
  const b = t as Building, nx = Math.max(b.pos.x - b.hx, Math.min(b.pos.x + b.hx, by.pos.x)), nz = Math.max(b.pos.z - b.hz, Math.min(b.pos.z + b.hz, by.pos.z));
  return clear(g, by, eye, b.pos.x, b.h * .5, b.pos.z, b) || clear(g, by, eye, nx, Math.min(1.2, b.h * .5), nz, b) || clear(g, by, eye, nx, b.h * .85, nz, b);
}
