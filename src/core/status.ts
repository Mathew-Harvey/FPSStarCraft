// Effects that sit on a body for a while: slowed, stunned, rooted, unseen, revealed, dug in, lifted, shielded and burning.
// A body with no effects on it moves, acts and takes hits exactly as before.
import type { Game } from '../game';
import type { Unit, Status, StatusKey } from '../data';

/** Puts an effect on a body for `t` seconds. The same effect again keeps the longer time and the stronger strength.
 *  `t` of Infinity lasts until taken off (a body dug in stays dug in). */
export function addStatus(u: Unit, k: StatusKey, t: number, n?: number, from?: number) {
  const list = u.status || (u.status = []), had = list.find(s => s.k === k);
  if (had) { had.t = Math.max(had.t, t); if (n !== undefined) had.n = Math.max(had.n ?? 0, n); if (from !== undefined) had.from = from; return had; }
  const s: Status = { k, t, n, from }; list.push(s); return s;
}
export function clearStatus(u: Unit, k: StatusKey) { if (u.status) u.status = u.status.filter(s => s.k !== k); }
export const hasStatus = (u: Unit, k: StatusKey) => !!u.status && u.status.some(s => s.k === k && s.t > 0);
export const statusOf = (u: Unit, k: StatusKey) => u.status?.find(s => s.k === k && s.t > 0);

/** Speed multiplier from effects: 0 when stunned, rooted, dug in or lifted, else less for a slow. 1 with none. */
export function statusPace(u: Unit) {
  const L = u.status; if (!L || !L.length) return 1; let m = 1;
  for (const s of L) { if (s.t <= 0) continue; if (s.k === 'stun' || s.k === 'root' || s.k === 'borrowed' || s.k === 'lifted') return 0; if (s.k === 'slow') m *= 1 - Math.min(.9, s.n ?? .5); }
  return m;
}
/** Can the body think, shoot or cast? Not while stunned or lifted. A dug-in body only if its kind says it fights dug in (see the registry's `dugFight`). */
export function canAct(u: Unit, dugFight = false) {
  const L = u.status; if (!L || !L.length) return true;
  for (const s of L) if (s.t > 0 && (s.k === 'stun' || s.k === 'lifted' || (s.k === 'borrowed' && !dugFight))) return false;
  return true;
}
/** Is the body hidden from enemy eyes by an effect (cloaked or dug in), before detection is counted? */
export const hiddenBy = (u: Unit) => !!u.status && u.status.some(s => s.t > 0 && (s.k === 'unseen' || s.k === 'borrowed')) && !hasStatus(u, 'revealed');

/** A hit on a body: an effect shield soaks it first. Returns what is left of the hit. */
export function soak(u: Unit, amt: number) {
  const s = statusOf(u, 'shielded'); if (!s || !(s.n! > 0)) return amt;
  const a = Math.min(s.n!, amt); s.n! -= a; if (s.n! <= 0) s.t = 0; return amt - a;
}

/** Runs every effect for one frame (host only): counts down, burns, and drops the ones that ran out. */
export function tickStatus(g: Game, dt: number) {
  for (const u of g.units) {
    const L = u.status; if (!L || !L.length || !u.alive) continue;
    for (const s of L) {
      s.t -= dt;
      if (s.k === 'burning' && s.n && !g.net) { const from = s.from ? g.units.find(o => o.id === s.from) || null : null; g.damage(u, s.n * dt, from); if (!u.alive) break; }
      if (s.k === 'lifted') u.alt = Math.min(4, (u.alt || 0) + dt * 6);
    }
    if (L.some(s => s.t <= 0)) { if (L.some(s => s.k === 'lifted' && s.t <= 0) && !u.air) u.alt = 0; u.status = L.filter(s => s.t > 0); }
  }
}
