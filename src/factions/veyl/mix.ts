// The Conductor's army mix (stream L's brain spec, change 1): each body it trains answers what it has seen of the enemy army.
// A base weight per kind, plus a counter weight for every seen tag the kind answers (the plan's counter table, checked against L's
// equal-value duels). The weights set a target share of fighter spend; a free building trains the kind of its own list that is
// furthest under its share. A kind over 30% of the spend since minute 4 is off the list until it falls back, and every kind keeps
// its base weight once its building stands, so each one turns up in a long match.
import type { VKind } from './numbers';

/** What the side has seen of the enemy army lately: supply per tag, and whether it is a swarm of small bodies. */
export interface SeenMix { soft: number; plated: number; huge: number; air: number; unseen: number; melee: number; swarm: boolean; total: number }

/** The fighters the mix picks from (Tenders are the economy's, Shards the Lyre's). */
export const MIX_KINDS: VKind[] = ['cantor', 'lancer', 'tuner', 'mute', 'choirmaster', 'warden', 'bell', 'reedwalker', 'knell', 'listener', 'ferry', 'swift', 'prism', 'omen', 'lyre', 'cantus'];

/** Base weights: what a long match wants of each kind with nothing seen. */
export const BASE: Partial<Record<VKind, number>> = {
  cantor: 3, lancer: 2, tuner: .7, mute: 1, choirmaster: 1.2, warden: 1, bell: 1.4, reedwalker: 1, knell: 1, listener: .4, ferry: .3,
  swift: 1, prism: 1.2, omen: .8, lyre: 1, cantus: 1,
};

/** What each kind answers. "soft or swarm: Cantor (side cut), Choirmaster, Knell; plated and huge: Lancer, Bell; air: Swift, Lancer;
 *  unseen: Listener; melee: Lancer, Bell" (the plan's table), plus the Omen's Shrill on soft bodies and the Prism's Burn on plated ones. */
export const ANSWERS: Record<'soft' | 'swarm' | 'plated' | 'huge' | 'air' | 'unseen' | 'melee', [VKind, number][]> = {
  soft: [['cantor', 2], ['choirmaster', 2], ['knell', 2], ['omen', 1.5], ['reedwalker', 1]],
  swarm: [['cantor', 2], ['knell', 2.5], ['choirmaster', 2], ['reedwalker', 1.5]],
  plated: [['lancer', 3], ['bell', 3], ['prism', 2]],
  huge: [['bell', 3], ['lancer', 1.5], ['mute', 1]],
  air: [['swift', 4], ['lancer', 2], ['prism', 1.5], ['lyre', 1]],
  unseen: [['listener', 4]],
  melee: [['lancer', 2], ['bell', 2], ['tuner', 1.5], ['reedwalker', 1]],
};

/** The weight of each kind the side can make now (0 for the rest): base plus counters, each counter scaled by how much of the seen army
 *  carries that tag. `extra` adds the Conductor's own reasons (its plan, a Mute nobody can see). */
export function weights(seen: SeenMix, can: (k: VKind) => boolean, extra: Partial<Record<VKind, number>> = {}): Partial<Record<VKind, number>> {
  const w: Partial<Record<VKind, number>> = {}, T = Math.max(1, seen.total), part = { soft: seen.soft / T, plated: seen.plated / T, huge: seen.huge / T, air: seen.air / T, unseen: Math.min(1, seen.unseen / 4), melee: seen.melee / T, swarm: seen.swarm ? 1 : 0 };
  for (const k of MIX_KINDS) if (can(k)) w[k] = (BASE[k] ?? .5) + (extra[k] ?? 0);
  for (const tag in ANSWERS) for (const [k, b] of ANSWERS[tag as keyof typeof ANSWERS]) if (w[k] !== undefined) w[k]! += b * 4 * part[tag as keyof typeof part];
  return w;
}

/** The kind out of `list` furthest under its target share of the spend (`share` gives a kind's share so far, 0-1). */
export function pickKind(list: VKind[], w: Partial<Record<VKind, number>>, share: (k: VKind) => number, capped: (k: VKind) => boolean): VKind | null {
  const sum = Object.values(w).reduce((a, b) => a + (b ?? 0), 0) || 1;
  let best: VKind | null = null, bd = -Infinity;
  for (const k of list) { if (!w[k] || capped(k)) continue; const d = w[k]! / sum - share(k); if (d > bd) { bd = d; best = k; } }
  return best;
}
