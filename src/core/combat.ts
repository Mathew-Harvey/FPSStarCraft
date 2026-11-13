// How hits land: armour tags, flat armour, a weapon's bonus against a tag, what a weapon can reach (ground, air or both), and research
// levels 1 to 3. A kind with none of these set takes and deals exactly what it always did.
import type { Game } from '../game';
import type { Unit, Building, UpKey } from '../data';
import { UNIT, BLD, UPGRADES, fac, isUnit } from '../data';

/** What a body or building is made of. A weapon can do more against some of these.
 *  soft: flesh and cloth. plated: armour plate. living: grown, heals. machine: engines and frames. huge: the size of a house. sung: Veyl glass held by song. */
export type Tag = 'soft' | 'plated' | 'living' | 'machine' | 'huge' | 'sung';
export const TAGS: Tag[] = ['soft', 'plated', 'living', 'machine', 'huge', 'sung'];
/** What a weapon can reach. Ground is the default: a ground weapon cannot hit a flier. */
export type Reach = 'ground' | 'air' | 'both';
/** The three lines of research levels. atk: each level adds damage. arm: each level adds armour (or health, in percent mode). shd: shields. */
export type Line = 'atk' | 'arm' | 'shd';

/** The fight's own fields on a kind (UnitDef and BldDef carry them; every one is optional). */
export interface FightDef {
  /** What it is made of. */ tags?: Tag[];
  /** Flat armour taken off every hit, before research. */ armour?: number;
  /** Extra damage per hit against bodies with a tag. */ bonus?: Partial<Record<Tag, number>>;
  /** What its weapon reaches. */ hits?: Reach;
  /** Damage each attack level adds to one hit (flat mode). Default a tenth of the base hit, worked out by the caller. */ perLvl?: number;
}

/** Dials. `flat` is the StarCraft way: each attack level adds damage to a hit and each armour level takes 1 off every hit.
 *  `percent` is how Ore Else always worked: each level multiplies, 25%, 20%, then 15%. Percent stays on until the balance stream has
 *  tables for flat mode; both run through the same level count. */
export const LEVELS = { mode: 'percent' as 'percent' | 'flat', pct: [1.25, 1.2, 1.15], minHit: .5 };

const def = (k: string): FightDef => ((UNIT as any)[k] || (BLD as any)[k] || {}) as FightDef;
export const tagsOf = (t: Unit | Building): Tag[] => def(t.kind).tags || [];
export const hasTag = (t: Unit | Building, tag: Tag) => tagsOf(t).includes(tag);
export const reachOf = (k: string): Reach => def(k).hits || 'ground';
/** Is the body up in the air (a flier, or a lifted building)? */
export const isAir = (t: Unit | Building) => !!(t as Unit).air;

/** The research chain for a line, in level order, for a faction. Read from UpDef.line and UpDef.lvl. */
export function chain(f: number, line: Line): UpKey[] {
  return UPGRADES.filter(u => (u.team || 0) === f && u.line === line).sort((a, b) => (a.lvl || 0) - (b.lvl || 0)).map(u => u.key);
}
const CHAINS = new Map<string, UpKey[]>();
/** How many levels of a line a side has bought, 0 to 3. */
export function level(g: Game, team: number, line: Line) {
  const f = fac(team), key = f + line; let c = CHAINS.get(key); if (!c) CHAINS.set(key, c = chain(f, line));
  const U = g.upOf(team); let n = 0; for (const k of c) if (U[k]) n++; return n;
}
/** The percent-mode multiplier for a line: the old research numbers, level by level, multiplied in the same order as before. */
export function levelMul(g: Game, team: number, line: Line) {
  if (LEVELS.mode !== 'percent') return 1; const f = fac(team), key = f + line; let c = CHAINS.get(key); if (!c) CHAINS.set(key, c = chain(f, line));
  const U = g.upOf(team); let m = 1; c.forEach((k, i) => { if (U[k]) m *= UPGRADES.find(u => u.key === k)!.pct ?? LEVELS.pct[i]; }); return m;
}

/** Can this attacker's weapon reach this target? */
export function canHit(from: Unit | Building | null, t: Unit | Building) {
  if (!from) return true; const air = isAir(t), r = reachOf(from.kind); return air ? r !== 'ground' : r !== 'air';
}
/** The hit after armour and bonus. A target and attacker with none of these fields get the hit back unchanged. */
export function armourHit(g: Game, t: Unit | Building, amt: number, from: Unit | Building | null) {
  const td = def(t.kind), fd = from ? def(from.kind) : null; let a = amt, touched = false;
  if (fd?.bonus) for (const tag of td.tags || []) { const b = fd.bonus[tag]; if (b) { a += b; touched = true; } }
  if (LEVELS.mode === 'flat' && from) { const L = level(g, from.team, 'atk'); if (L) { a += L * (fd?.perLvl ?? 1); touched = true; } }
  let arm = td.armour || 0; if (LEVELS.mode === 'flat' && isUnit(t)) arm += level(g, t.team, 'arm');
  if (arm) { a -= arm; touched = true; }
  return touched ? Math.max(LEVELS.minHit, a) : amt;
}
