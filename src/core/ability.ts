// Energy and abilities. A kind lists its abilities with defineAbilities; anyone (a player's key, a bot, the server) uses one through
// useAbility, which checks energy, cooldown, range and target the same way every time. Online, a client only asks ('ab') and the server casts.
import type { Game } from '../game';
import type { Unit, Building } from '../data';
import { UNIT } from '../data';
import { isEnemy } from './sides';
import { canAct } from './status';
import { unitRule } from './registry';
const dugOK = (u: Unit, a: AbilityDef | null) => !!a?.dug || !!unitRule(u.kind).dugFight;

/** Where an ability is aimed: a spot on the ground, a body or building (id), or the caster itself. */
export interface Target { x: number; z: number; id?: number }
/** self: no aim. point: a spot. body: one body or building. area: a spot, and everything within `radius` of it. */
export type AimKind = 'self' | 'point' | 'body' | 'area';

export interface AbilityDef {
  key: string; name: string; /** The key a player presses (I's HUD shows it). */ hotkey: string;
  /** Energy it takes, seconds before it can be used again, and seconds of wind-up before it goes off. */
  energy: number; cd: number; cast: number;
  /** How far from the caster the aim may be, in metres (0 for self). */ range: number;
  target: AimKind; radius?: number;
  /** On by default: a body cast it by itself whenever its `ai` finds a target (a medic's heal, say). */ autocast?: boolean;
  /** Which bodies a body-aimed ability may take: its own side, the enemy, or anyone. Default the enemy. */ who?: 'ally' | 'foe' | 'any';
  /** Plain words for the HUD card. */ blurb?: string;
  /** Usable while dug in (coming up again, say). A kind with `dugFight` may use all of its abilities dug in. */ dug?: boolean;
  /** Extra check before the cast (a tap only on a vent, a morph only with room). Return false to refuse. */
  can?(g: Game, u: Unit, t: Target): boolean;
  /** What happens when it goes off (host only). `tgt` is the body or building when aimed at one. */
  effect(g: Game, u: Unit, t: Target, tgt: Unit | Building | null): void;
  /** A bot's hook: where it would use this now, or null. Runs for bot bodies, and for autocast on any body nobody is driving. */
  ai?(g: Game, u: Unit): Target | null;
}

const ABS: Record<string, AbilityDef[]> = {};
/** Adds abilities to a kind of body. A key given again replaces the old one. */
export function defineAbilities(kind: string, list: AbilityDef[]) { const have = ABS[kind] || []; for (const a of list) { const i = have.findIndex(h => h.key === a.key); if (i >= 0) have[i] = a; else have.push(a); } ABS[kind] = have; }
export const abilitiesOf = (kind: string): AbilityDef[] => ABS[kind] || [];
export const abilityOf = (kind: string, key: string) => abilitiesOf(kind).find(a => a.key === key) || null;

/** Energy dials: a second's regrowth, and what a body with energy starts with. */
export const ENERGY = { regen: .7875, start: 50 };

/** Gives a new body its energy pool (UnitDef.energy). Called by spawn. */
export function initEnergy(u: Unit) { const m = UNIT[u.kind].energy; if (m) { u.maxEnergy = m; u.energy = Math.min(m, ENERGY.start); } }

/** Why a cast would be refused, or '' when it can go. */
export function whyNot(g: Game, u: Unit, key: string, t: Target): string {
  const a = abilityOf(u.kind, key); if (!a) return 'no such ability';
  if (!u.alive) return 'dead'; if (u.inside) return 'inside'; if (!canAct(u, dugOK(u, a))) return 'cannot act';
  if ((u.energy ?? 0) < a.energy) return 'energy'; if ((u.abCd?.[key] ?? 0) > 0) return 'cooldown'; if (u.cast) return 'busy';
  if (a.target !== 'self') { if (!isFinite(t.x) || !isFinite(t.z)) return 'aim'; if (Math.hypot(t.x - u.pos.x, t.z - u.pos.z) > a.range + 1) return 'range'; }
  if (a.target === 'body') { const o = bodyOf(g, t.id); if (!o || !o.alive) return 'target'; const ally = !isEnemy(o.team, u.team); if ((a.who ?? 'foe') === 'ally' ? !ally : (a.who ?? 'foe') === 'foe' ? ally : false) return 'target'; if (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > a.range + 1) return 'range'; }
  if (a.can && !a.can(g, u, t)) return 'refused';
  return '';
}
export const bodyOf = (g: Game, id?: number): Unit | Building | null => id ? (g.uById.get(id) || g.units.find(o => o.id === id) || g.buildings.find(b => b.id === id) || null) : null;

/** Uses an ability. On a client it sends the ask and returns true; the server answers. On the host it checks, pays the energy and
 *  starts the wind-up (or casts at once with no wind-up). Returns whether it started. */
export function useAbility(g: Game, u: Unit, key: string, t: Target = { x: u.pos.x, z: u.pos.z }): boolean {
  if (g.net) { g.net.cmd('ab', u.id, key, Math.round(t.x * 10) / 10, Math.round(t.z * 10) / 10, t.id || 0); return true; }
  if (whyNot(g, u, key, t)) return false;
  const a = abilityOf(u.kind, key)!; u.energy = (u.energy ?? 0) - a.energy; (u.abCd || (u.abCd = {}))[key] = a.cd;
  if (a.target === 'self') { t = { x: u.pos.x, z: u.pos.z }; }
  if (a.cast > 0) { u.cast = { key, t: a.cast, x: t.x, z: t.z, id: t.id || 0 }; return true; }
  fire(g, u, a, t); return true;
}
function fire(g: Game, u: Unit, a: AbilityDef, t: Target) {
  const tgt = a.target === 'body' ? bodyOf(g, t.id) : null; if (a.target === 'body' && (!tgt || !tgt.alive)) return;
  if (a.target !== 'self') u.yaw = Math.atan2(t.x - u.pos.x, t.z - u.pos.z);
  a.effect(g, u, t, tgt); g.evq?.push(['ab', u.id, a.key, Math.round(t.x * 10) / 10, Math.round(t.z * 10) / 10]);
}

/** Every frame: energy grows back, cooldowns count down, wind-ups go off, and bot bodies use what their hooks pick. */
/** Each game's own think timer: a server runs many matches, and a replay must start the clock where the match did (K). */
const AIT = new WeakMap<Game, number>();
export function tickAbilities(g: Game, dt: number) {
  let aiT = (AIT.get(g) ?? 0) - dt; const think = aiT <= 0; if (think) aiT = .5; AIT.set(g, aiT);
  for (const u of g.units) {
    if (!u.alive) continue;
    if (u.maxEnergy) u.energy = Math.min(u.maxEnergy, (u.energy ?? 0) + ENERGY.regen * dt);
    if (u.abCd) for (const k in u.abCd) if (u.abCd[k] > 0) u.abCd[k] = Math.max(0, u.abCd[k] - dt);
    if (g.net) continue;
    if (u.cast) { if (!canAct(u, dugOK(u, abilityOf(u.kind, u.cast.key)))) { u.cast = null; continue; } u.cast.t -= dt; if (u.cast.t <= 0) { const c = u.cast, a = abilityOf(u.kind, c.key); u.cast = null; if (a) fire(g, u, a, { x: c.x, z: c.z, id: c.id }); } continue; }
    if (!think || u === g.me || u.pilot) continue;
    const list = ABS[u.kind]; if (!list) continue;
    const bot = !g.human[u.team] || !!g.dir?.side(u.team)?.auto;   // a player's own side casts only what is set to cast by itself
    for (const a of list) { if (!a.ai || (!bot && !a.autocast) || (u.energy ?? 0) < a.energy || (u.abCd?.[a.key] ?? 0) > 0) continue; const t = a.ai(g, u); if (t && useAbility(g, u, a.key, t)) break; }
  }
}
