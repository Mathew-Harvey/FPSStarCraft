// The first minute of a match a person plays against a side nobody plays (fun audit, 2026-11-24). Before this a new player drilled ore for
// 100 seconds before there was a fighter to jump into, and saw no enemy until the first raid at about 170 seconds.
//  - One fighter of the side's lead kind stands by the first barracks the moment it is finished, on the house.
//  - One enemy worker walks down from the far base as a scout, looks at the yard at about one minute and walks home. It does not fight
//    (a lone half-health Cantor sent the same way killed every Rigger in the yard): it is a first thing to shoot, and a warning.
// Only for a side with a person in a body, in a one-on-one that is not a story job, so bot matches and the balance tables never see it, and
// a match between two people gets neither.
import type { Game } from './game';
import { FACTION, MAP, UNIT, fac, foeOf, homeXZ } from './data';
import { multi } from './core/sides';

export const OPENING = { on: true, /** The free fighter only comes if the barracks is up by this many seconds. */ crewBy: 150, /** When the scout sets off. */ scoutAt: 40 };
const said: Record<number, [string, string]> = {
  0: ['Lookout', 'One of theirs on the road, alone. A scout. Jump into a rifle and drop it before it gets home.'],
  1: ['Watcher', 'One of theirs is walking in alone. A scout. Cut it down before it gets home.'],
  2: ['Rootwatch', 'One of theirs comes alone. A scout. Bite it before it gets home.'],
};
export function tickOpening(g: Game) {
  if (!OPENING.on || !g.eco || g.story || g.net || multi() || (MAP as any).hid || g.time > OPENING.crewBy + 5) return;
  const st = g.opened;
  for (let T = 0; T < g.human.length; T++) {
    if (!g.human[T] || st[T] === 3) continue; const F = foeOf(T); if (F === T || g.human[F]) continue;
    if (!g.units.some(u => u.alive && u.team === T && g.driven(u))) continue;   // nobody is in a body on this side (a test, or a side run from above)
    const s = st[T] || 0, me = FACTION[T];
    if (!(s & 1)) { const b = g.ownB(me.barracks, true, T)[0];
      if (b && g.time <= OPENING.crewBy) { st[T] = s | 1; const n = fac(T) === 2 ? 2 : 1; for (let i = 0; i < n; i++) g.spawn(me.lead, T, b.pos.x + b.hx + 1.5 + i * 1.2, b.pos.z + b.hz + 1.5); }
      else if (g.time > OPENING.crewBy) st[T] = s | 1; }
    if (!(st[T]! & 2) && g.time >= OPENING.scoutAt) { st[T] = (st[T] || 0) | 2; const hq = g.hqs(F, false)[0]; if (!hq) continue;
      const [hx, hz] = homeXZ(T), dx = hq.pos.x - hx, dz = hq.pos.z - hz, d = Math.hypot(dx, dz) || 1;
      const u = g.spawn(FACTION[F].worker, F, hq.pos.x - dx / d * (hq.hx + 6), hq.pos.z - dz / d * (hq.hz + 6));
      u.order = { type: 'scout', x: hx + dx / d * 26, z: hz + dz / d * 26, loop: true };   // loop: straight in and straight home, no walk round the first building it sees
      const l = said[fac(T)]; g.feed(l[0], l[1].replace('One of theirs', `A ${UNIT[u.kind].name}`), 'al', T); }
  }
}
