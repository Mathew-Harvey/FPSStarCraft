// Mode switches and ripening. A body turns into another kind (siege mode and back, a Gloam body ripening into its next form) and stays the
// same body: the same id, the same player driving it, the same share of its health, shields and energy, at the same spot.
import type { Game } from '../game';
import type { Unit, Kind } from '../data';
import { UNIT } from '../data';
import { addStatus, clearStatus } from './status';
import { initAir } from './air';

/** A body part way through changing: what it is turning into and the seconds left. */
export interface Ripen { kind: Kind; t: number; total: number }
const RIPE = new WeakMap<Unit, Ripen>();
/** What a body is ripening into (morph), or undefined. */
export const ripeningOf = (u: Unit) => RIPE.get(u)?.kind;
/** How far a body is through its ripening, 0 to 1, or 0 when it is not ripening. */
export const ripenShare = (u: Unit) => { const r = RIPE.get(u); return r ? Math.max(0, Math.min(1, 1 - r.t / r.total)) : 0; };
export const ripening = (u: Unit) => RIPE.get(u) || null;

/** Turns a body into another kind now. Returns false if it is dead or already that kind. */
export function switchKind(g: Game, u: Unit, kind: Kind): boolean {
  if (!u.alive || u.kind === kind || !UNIT[kind]) return false;
  const hpK = u.maxHp ? u.hp / u.maxHp : 1, shK = u.maxShield ? u.shield / u.maxShield : 1, en = u.energy;
  const st = UNIT[kind], mul = u.maxHp / Math.max(1, UNIT[u.kind].hp), smul = UNIT[u.kind].shield ? u.maxShield / UNIT[u.kind].shield : 1;
  g.remodel(u, kind);
  u.kind = kind; u.maxHp = st.hp * mul; u.hp = Math.max(1, u.maxHp * hpK); u.maxShield = st.shield * smul; u.shield = u.maxShield * shK; u.speed = st.speed;
  u.maxEnergy = st.energy || 0; u.energy = st.energy ? Math.min(st.energy, en ?? 0) : undefined;
  u.air = false; u.alt = 0; initAir(u); u.target = null; u.cast = null;
  if (u === g.me) g.possess(u, true);
  return true;
}
/** Starts a body changing into another kind over `secs` seconds. It cannot move or act meanwhile (it is rooted and stunned). */
export function morph(g: Game, u: Unit, kind: Kind, secs = 0): boolean {
  if (!u.alive || u.kind === kind || !UNIT[kind] || RIPE.has(u)) return false;
  if (secs <= 0) return switchKind(g, u, kind);
  RIPE.set(u, { kind, t: secs, total: secs }); addStatus(u, 'stun', Infinity); addStatus(u, 'root', Infinity); return true;
}
/** Every frame: ripening bodies count down and change when ready. */
export function tickMorph(g: Game, dt: number) {
  for (const u of g.units) { const r = RIPE.get(u); if (!r) continue; if (!u.alive) { RIPE.delete(u); continue; } if (g.net) continue; r.t -= dt; if (r.t <= 0) { RIPE.delete(u); clearStatus(u, 'stun'); clearStatus(u, 'root'); switchKind(g, u, r.kind); } }
}
