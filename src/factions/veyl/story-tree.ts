// STORY STAND-IN, to be removed: story jobs were written for the old Veyl rules. Until the story stream rewrites them for the full tree
// (wave 3 of the full-depth plan), a story job plays the Veyl on the simpler rules it was written for: no song fields (any building works
// anywhere), no Flux on Veyl prices, no unit tech gates (a Lancer from the first Brood Pit), and a Thorn Spire after the Brood Pit.
// Everything here switches back the moment a story job ends. Delete this file and the `storyVeyl()` calls in fields.ts and rules.ts when
// the jobs are rewritten.
import { STORY, UPGRADES } from '../../data';
import { V_UNIT, V_BLD, V_UPGRADES } from './numbers';

let saved: { flux: Map<object, number | undefined>; spire: string[] | undefined; old: [object, string, unknown][] } | null = null;
/** The old numbers the jobs were balanced on: prices, beds and build times of the first Veyl roster. */
const OLD: [object, Record<string, unknown>][] = [
  [V_UNIT.cantor, { hp: 90, shield: 50, cost: 60, time: 11, supply: 1 }], [V_UNIT.lancer, { hp: 50, shield: 30, cost: 65, time: 12, supply: 1 }], [V_UNIT.warden, { hp: 900, time: 30 }],
  [V_BLD.broodpit, { time: 14 }], [V_BLD.hushwell, { time: 9 }], [V_BLD.wardpylon, { time: 16 }], [V_BLD.thornspire, { cost: 110, time: 11 }], [V_BLD.reedgate, { cost: 200, time: 20, hp: 1600 }],
];

/** Whether the Veyl are on the simpler story rules right now. Syncs the tables first (cheap, safe to call every frame). */
export function storyVeyl(g: { mission: unknown }): boolean {
  const on = STORY.on || !!g.mission;
  if (on && !saved) {
    saved = { flux: new Map(), spire: V_BLD.thornspire.needs as string[] | undefined, old: [] };
    for (const [d, o] of OLD) for (const k in o) { saved.old.push([d, k, (d as any)[k]]); (d as any)[k] = o[k]; }
    for (const d of [...Object.values(V_UNIT), ...Object.values(V_BLD), ...V_UPGRADES, ...UPGRADES.filter(u => u.team === 1)] as any[]) { saved.flux.set(d, d.flux); d.flux = 0; }
    (V_BLD.thornspire as any).needs = ['broodpit'];
  } else if (!on && saved) {
    for (const [d, f] of saved.flux) (d as any).flux = f;
    for (const [d, k, v] of saved.old) (d as any)[k] = v;
    (V_BLD.thornspire as any).needs = saved.spire; saved = null;
  }
  return on;
}
