// The Brood bot's army mix (balance spec 2026-11-14, src/core/brainkit.ts for the shared counts): what the Caps ripen next is the kind
// furthest under its share, where each kind's share comes from a base weight plus what it answers in the foe army the swarm has seen.
// No kind is trained while it is over the kit's cap (30% of fighter spend), and every kind the Gloam can grow keeps a base weight once
// its building stands, so each appears in a long match. When the kind called for cannot be paid for, the Buds wait for it.
import type { Director, Side } from '../../director';
import { UNIT, Kind, BKind, foeOf } from '../../data';
import { seenFoe, shareOf, capped, type SeenTag } from '../../core/brainkit';
import { foeAnswers } from './kit';

/** What the Caps (and the Tusk Hollow) can grow, with what must stand first. */
const NEED: Partial<Record<Kind, BKind>> = { snapper: 'warren', quillback: 'quillgarden', blister: 'blisterbed', shellback: 'shellpit', smother: 'rotden', seeder: 'rotden', gnatwing: 'wingspire', bloater: 'wingspire', hooksail: 'ancientcap', mulcher: 'tuskhollow' } as Partial<Record<Kind, BKind>>;
/** Base weights: a Snapper pair is still the swarm's body, Quillbacks its spine; the rest get a floor so each appears. */
// Stream L's duels at equal value (duels-r2-rank.txt, 2026-11-14): Mulcher, Quillback and Snapper win 68%, Bloater 64%, Blister 63%,
// Shellback 57%; Seeder 29%, Gnatwing 14%, Smother 2%, Hooksail 0%. The weak and the casters get only the floor that keeps them seen.
const BASE: Partial<Record<Kind, number>> = { snapper: 3, quillback: 2.4, blister: 1.2, shellback: 1, mulcher: 1.2, smother: .25, gnatwing: .25, seeder: .25, bloater: .3, hooksail: .2 };
/** The plan's counter table, Gloam column: for each thing the foe has a lot of, what answers it. */
const ANSWER: Partial<Record<SeenTag | 'swarm', Partial<Record<Kind, number>>>> = {
  soft: { blister: 2, mulcher: 1.5, gnatwing: .3 },
  swarm: { blister: 2, mulcher: 1.5, gnatwing: .3 },
  plated: { mulcher: 2, quillback: 2 },
  huge: { mulcher: 3 },
  air: { bloater: 3, quillback: 2 },
  melee: { shellback: 2, quillback: 1.5 },
};
const FLIERS = new Set<string>(['gnatwing', 'bloater', 'hooksail']);
/** How hard what was seen pulls the mix, against the base weights. */
const PULL = 3;

/** Each kind's wanted share of the fighter spend, from the base weights and what has been seen; only kinds whose building stands. */
export function broodWants(D: Director, S: Side): Partial<Record<Kind, number>> {
  const g = D.g, T = S.team, seen = seenFoe(g, S), total = Object.values(seen.kinds).reduce((a, b) => a + (b || 0), 0);
  const w: Partial<Record<Kind, number>> = {};
  for (const k in BASE) { const need = NEED[k as Kind]; if (!g.gated(T, k as Kind) && need && g.ownB(need, true, T).length) w[k as Kind] = BASE[k as Kind]!; }
  if (total > 0) {
    for (const tag in ANSWER) {
      const f = tag === 'swarm' ? (seen.swarm ? 1 : 0) : (seen.tags[tag as SeenTag] || 0) / total; if (f <= 0) continue;
      for (const [k, a] of Object.entries(ANSWER[tag as SeenTag]!)) if (w[k as Kind] !== undefined) w[k as Kind]! += a! * f * PULL;
    }
  }
  const sum = Object.values(w).reduce((a, b) => a + (b || 0), 0) || 1;
  for (const k in w) w[k as Kind]! /= sum;
  return w;
}

/**
 * The next fighter the Brood wants, the one furthest under its wanted share, skipping kinds over the spend cap and (against a foe with
 * nothing that hits the air) a second flier of a kind: an unanswerable swarm is no match. `skip` leaves out kinds grown elsewhere.
 */
export function broodPick(D: Director, S: Side, skip?: Set<string>): Kind | null {
  const g = D.g, T = S.team, want = broodWants(D, S), air = foeAnswers(g, T).air;
  // With only two or three kinds up, every one can be over the cap at once; then the cap cannot hold, and the kind furthest under its
  // share still comes next (a bare Snapper while a Quillback is wanted kept the swarm 70% Snapper at minute 20).
  for (const cap of [true, false]) {
    let best: Kind | null = null, bd = -Infinity;
    for (const k of Object.keys(want) as Kind[]) {
      if (skip?.has(k) || (cap && capped(S, k))) continue;
      if (!air && FLIERS.has(k) && g.own(k, T).length + queued(D, T, k) >= 1) continue;
      const d = want[k]! - shareOf(S, k); if (d > bd) { bd = d; best = k; }
    }
    if (best) return best;
  }
  return null;
}
const queued = (D: Director, T: number, k: Kind) => D.g.buildings.reduce((a, b) => a + (b.alive && b.team === T ? b.queue.filter(q => q.kind === k).length : 0), 0);
void [UNIT, foeOf];
