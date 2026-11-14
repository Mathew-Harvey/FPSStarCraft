// What every faction's bot brain shares (balance spec 2026-11-14, streams B, C and D): what the side has seen of the foe army, how its
// own fighter spend splits by kind, and the hunt that finishes a match once the foe has nothing left to fight with. Each brain keeps its
// own counter table and base weights and picks its own units; this file only keeps the counts and runs the hunt, so the three behave alike.
import type { Game } from '../game';
import type { Director, Side } from '../director';
import { UNIT, BLD, Unit, Kind, isFighter, foeOf, homeXZ, MAP } from '../data';
import { SIGHT } from '../fog';
import { isEnemy } from './sides';
import { isHidden, seenBy } from './sight';
import { tagsOf, isAir } from './combat';
import { costOf } from './econ';
import { ARMS } from '../net-arms';

/** The tags a brain can answer. The first six are the combat tags; air, unseen and melee are read off the body. */
export type SeenTag = 'soft' | 'plated' | 'huge' | 'living' | 'machine' | 'sung' | 'air' | 'unseen' | 'melee';
export interface Seen {
  /** Supply of foe fighters seen in the last 90 s, by tag (a body counts once under each tag it has). */ tags: Record<SeenTag, number>;
  /** Supply of foe fighters seen in the last 90 s, by kind. */ kinds: Partial<Record<Kind, number>>;
  /** More than 12 foe bodies of supply 1 or less. */ swarm: boolean;
  /** Ore + 2 x Flux of the foe fighters seen in the last 90 s. */ worth: number;
  /** Game time a foe fighter was last seen (-1: never). */ lastT: number;
  /** Foe bodies and buildings seen in the last 90 s that see hidden things (UNIT or BLD detect). */ detectors: number;
}
/** How far back a seen body still counts. */
export const SEEN_FOR = 90;
/** The share of fighter spend above which a kind is not trained until it falls back. Spend is ore + Flux over the whole match, the
 *  same measure as the balance table (tools/review.ts), so the cap holds the number that table checks. */
export const CAP = .3;
/** Melee: a body whose longest move reaches this far or less. */
const MELEE = 2.6;

interface Mem {
  bodies: Map<Unit, number>; dets: Map<object, number>; checkT: number; seen: Seen; spend: Partial<Record<string, number>>; spendAll: number;
  hunting: boolean; huntT: number; /** what the foe army was seen worth, sampled every 3 s */ hist: [number, number][]; /** no new hunt before this time */ calmT: number; spots: [number, number][] | null; spotI: number;
}
const MEM = new WeakMap<Side, Mem>();
function memOf(S: Side): Mem {
  let m = MEM.get(S);
  if (!m) MEM.set(S, m = { bodies: new Map(), checkT: 0, seen: { tags: blank(), kinds: {}, swarm: false, worth: 0, lastT: -1, detectors: 0 }, dets: new Map(), spend: {}, spendAll: 0, hunting: false, huntT: 0, hist: [], calmT: 0, spots: null, spotI: 0 });
  return m;
}
const blank = (): Record<SeenTag, number> => ({ soft: 0, plated: 0, huge: 0, living: 0, machine: 0, sung: 0, air: 0, unseen: 0, melee: 0 });
/** Ore + 2 x Flux: what a body is worth in the spec's tables. */
export const worthOf = (k: Kind) => { const c = costOf(k); return c[0] + 2 * c[1]; };
const meleeKind = (k: string) => { const a = ARMS[k]; return !!a && a.length > 0 && Math.max(...a.map(m => m.range)) <= MELEE; };

/** What side S has seen of the foe army lately. Cheap to call every brain tick: it looks at the field twice a second. */
export function seenFoe(g: Game, S: Side): Seen {
  const m = memOf(S), T = S.team;
  if (g.time < m.checkT) return m.seen; m.checkT = g.time + .5;
  const eyes: number[][] = [];
  for (const u of g.units) if (u.alive && u.team === T) eyes.push([u.pos.x, u.pos.z, SIGHT[u.kind] || 30]);
  for (const b of g.buildings) if (b.alive && b.team === T) eyes.push([b.pos.x, b.pos.z, SIGHT[b.kind] || (b.built ? 26 : 14)]);
  for (const o of g.units) {
    if (!o.alive || !isEnemy(T, o.team) || !isFighter(o) || o.inside) continue;
    if (!eyes.some(e => (e[0] - o.pos.x) ** 2 + (e[1] - o.pos.z) ** 2 <= e[2] * e[2])) continue;
    // a hidden body only counts once something of ours can see it; but bumping into it (it shot us) is seeing that something is there
    if (isHidden(o) && !seenBy(g, T, o) && !(o.target && (o.target as Unit).team === T)) continue;
    m.bodies.set(o, g.time);
  }
  for (const o of g.units) if (o.alive && isEnemy(T, o.team) && UNIT[o.kind]?.detect && eyes.some(e => (e[0] - o.pos.x) ** 2 + (e[1] - o.pos.z) ** 2 <= e[2] * e[2])) m.dets.set(o, g.time);
  for (const b of g.buildings) if (b.alive && isEnemy(T, b.team) && BLD[b.kind]?.detect && eyes.some(e => (e[0] - b.pos.x) ** 2 + (e[1] - b.pos.z) ** 2 <= e[2] * e[2])) m.dets.set(b, g.time);
  let dets = 0; for (const [o, t] of m.dets) { if (!(o as Unit).alive || g.time - t > SEEN_FOR) m.dets.delete(o); else dets++; }
  const s: Seen = { tags: blank(), kinds: {}, swarm: false, worth: 0, lastT: m.seen.lastT, detectors: dets }; let small = 0;
  for (const [o, t] of m.bodies) {
    if (!o.alive || g.time - t > SEEN_FOR) { m.bodies.delete(o); continue; }
    if (g.time - t < 1) s.lastT = g.time;
    // by supply, so a free scout or a carrier (a Lookout Sac, a Drifter: supply 0) does not read as an air army
    const k = o.kind as Kind, sup = UNIT[k]?.supply ?? 1;
    s.kinds[k] = (s.kinds[k] || 0) + sup; s.worth += worthOf(k); if (sup > 0 && sup <= 1) small++;
    for (const tag of tagsOf(o)) if (tag in s.tags) s.tags[tag as SeenTag] += sup;
    if (isAir(o)) s.tags.air += sup;
    if (UNIT[k]?.cloak || (o.status || []).some(x => x.k === 'unseen') || isHidden(o)) s.tags.unseen += sup;
    if (meleeKind(k)) s.tags.melee += sup;
  }
  s.swarm = small > 12; m.seen = s;
  return s;
}

/** Counts a fighter the brain has just queued toward its spend shares (ore + Flux, as the balance table counts it). */
export function spent(_g: Game, S: Side, kind: Kind) { const m = memOf(S), c = costOf(kind), w = c[0] + c[1]; m.spend[kind] = (m.spend[kind] || 0) + w; m.spendAll += w; }
/** Each kind's share of the fighter spend counted so far. */
export function shareOf(S: Side, kind: Kind): number { const m = memOf(S); return m.spendAll > 0 ? (m.spend[kind] || 0) / m.spendAll : 0; }
/** A kind over the cap is not trained until it falls back. Not before 1500 has been spent, or the first few units cap themselves. */
export function capped(S: Side, kind: Kind): boolean { const m = memOf(S); return m.spendAll >= 1500 && shareOf(S, kind) > CAP; }

/** How long the foe army's seen worth is remembered for the hunt, and the earliest a hunt starts. */
export const HUNT_MEMORY = 300, HUNT_FROM = 600;
/** Buildings that shoot: a hunt has to be worth more than the towers it walks into. */
const TOWERS = new Set(['watchpost', 'flaktower', 'bastion', 'dugout', 'thornspire', 'stinger', 'puffball', 'stingerwalk', 'puffwalk']);
/** Worth of side T's own fighters, fliers included. */
const armyWorth = (g: Game, T: number) => g.army(T).reduce((a, u) => a + worthOf(u.kind as Kind), 0);
/** Is side S hunting down the last buildings right now (for tests and the brains' lines). */
export const isHunting = (S: Side) => !!MEM.get(S)?.hunting;

/**
 * Finishing a won match. Once no foe fighter has been seen for 30 s and our army is worth at least twice the most the foe was seen with in
 * that last stretch, every idle fighter but the four nearest home walks to the nearest foe building it knows of, and with none known it
 * walks the map's expansion spots and the foe's home in turn. It stops when the foe army comes back above half of ours.
 * Orders are given again every 3 s, so a push that ends and calls everyone home cannot strand the hunt.
 */
export function hunt(D: Director, S: Side, dt: number) {
  const g = D.g, T = S.team, m = memOf(S), seen = seenFoe(g, S); m.huntT -= dt; if (m.huntT > 0) return; m.huntT = 3;
  const mine = armyWorth(g, T);
  // The foe's last known strength: the most its army was seen worth over the last five minutes (one glimpse of two bodies is not the
  // army), plus half again the price of every tower of theirs we know of. Not before minute 10: early on nobody has seen anything.
  m.hist.push([g.time, seen.worth]); while (m.hist.length && g.time - m.hist[0][0] > HUNT_MEMORY) m.hist.shift();
  const peak = Math.max(0, ...m.hist.map(h => h[1]));
  const towers = g.intel.known(T).filter(b => b.alive && b.built && TOWERS.has(b.kind)).reduce((a, b) => { const c = costOf(b.kind); return a + 1.5 * (c[0] + 2 * c[1]); }, 0);
  if (m.hunting) { if (seen.worth > mine / 2) { m.hunting = false; m.calmT = g.time + 120; for (const u of g.army(T)) if (u.order.type === 'amove' && !u.order.mine && !u.pilot && u !== g.me) u.target = null; return; } }
  else if (g.time >= HUNT_FROM && g.time >= m.calmT && seen.lastT >= 0 && g.time - seen.lastT >= 30 && g.army(T).length >= 8 && mine >= 2 * (peak + towers)) { m.hunting = true; }
  if (!m.hunting) return;
  const [hx, hz] = homeXZ(T), foe = foeOf(T);
  // never a body someone drives or ordered by hand from the command view, nor one following a player or out scouting
  const all = g.army(T).filter(u => u !== g.me && !u.pilot && !u.order.mine && u.order.type !== 'follow' && u.order.type !== 'scout');
  const home = new Set([...all].sort((a, b) => Math.hypot(a.pos.x - hx, a.pos.z - hz) - Math.hypot(b.pos.x - hx, b.pos.z - hz)).slice(0, 4));
  const known = g.intel.known(T).filter(b => b.alive);
  let spot: [number, number] | null = null;
  if (!known.length) {
    if (!m.spots) { const sites = (MAP.sites || []).map(p => [p[0], p[1]] as [number, number]); m.spots = [homeXZ(foe), ...sites]; m.spotI = 0; }
    spot = m.spots[m.spotI % m.spots.length];
  }
  let atSpot = 0;
  for (const u of all) {
    if (home.has(u) || u.target) continue;
    if (known.length) {
      const b = known.reduce((a, c) => Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < Math.hypot(c.pos.x - u.pos.x, c.pos.z - u.pos.z) ? a : c);
      if (u.order.type !== 'amove' || Math.hypot(u.order.x - b.pos.x, u.order.z - b.pos.z) > 8) u.order = { type: 'amove', x: b.pos.x, z: b.pos.z };
    } else if (spot) {
      if (Math.hypot(u.pos.x - spot[0], u.pos.z - spot[1]) < 10) atSpot++;
      if (u.order.type !== 'amove' || Math.hypot(u.order.x - spot[0], u.order.z - spot[1]) > 4) u.order = { type: 'amove', x: spot[0], z: spot[1] };
    }
  }
  // the first to reach a spot with nothing there: on to the next one
  if (spot && atSpot > 0) m.spotI++;
}
