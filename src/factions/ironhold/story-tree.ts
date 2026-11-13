// STORY STAND-IN, to be removed: story jobs were written for the old Ironhold tech tree. Until the story stream rewrites them for the full tree
// (wave 3 of the full-depth plan), a story job plays Ironhold on the simpler tree it was written for: no Lab Bay gates, no Flux on Ironhold
// prices, research where the jobs ask for it (guns and plate at the Machine Shop), and the old unit needs (Patch: Machine Shop, Longshot: Assay
// Office). Everything here switches back the moment a story job ends. Delete this file, its import in rules.ts and the `storyTree()` checks in
// bases.ts when the jobs are rewritten.
import { STORY, UNIT_NEEDS } from '../../data';
import { I_UNIT, I_BLD, I_UPGRADES, I_NEEDS } from './numbers';

/** Whether Ironhold is on the simpler story tree right now. */
export const storyTree = () => saved !== null;

type Saved = { flux: Map<object, number | undefined>; at: Map<object, string>; needs: Partial<Record<string, string>> };
let saved: Saved | null = null;
const OLD_AT: Record<string, string> = { dmg: 'machineshop', armor: 'machineshop' };
const OLD_NEEDS: Partial<Record<string, string>> = { breacher: 'machineshop', patch: 'machineshop', longshot: 'assay', claimbarge: 'annex' };

/** Puts the story tree on during a campaign job (or while one is being set up) and takes it off otherwise. Cheap to call every frame. */
export function syncStoryTree(g: { mission: unknown }) {
  const on = STORY.on || !!g.mission;
  if (on && !saved) {
    saved = { flux: new Map(), at: new Map(), needs: {} };
    for (const d of [...Object.values(I_UNIT), ...Object.values(I_BLD), ...I_UPGRADES] as any[]) { saved.flux.set(d, d.flux); d.flux = 0; }
    for (const u of I_UPGRADES as any[]) if (OLD_AT[u.key]) { saved.at.set(u, u.at); u.at = OLD_AT[u.key]; }
    for (const k of Object.keys(I_NEEDS)) saved.needs[k] = (UNIT_NEEDS as any)[k];
    for (const k of Object.keys(OLD_NEEDS)) (UNIT_NEEDS as any)[k] = OLD_NEEDS[k];
  } else if (!on && saved) {
    for (const [d, f] of saved.flux) (d as any).flux = f;
    for (const [u, at] of saved.at) (u as any).at = at;
    for (const k of Object.keys(OLD_NEEDS)) { if (saved.needs[k] === undefined) delete (UNIT_NEEDS as any)[k]; else (UNIT_NEEDS as any)[k] = saved.needs[k]; }
    saved = null;
  }
}
