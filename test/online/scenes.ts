// Scenes for the abilities with a rule of their own about where they can be used: each builds what the rule asks for round the caster and
// says where to aim. Shared by the online ability tests (abilities.ts, cast-looks.ts). A new ability with such a rule needs a line here.
import type { Game } from '../../src/game';
import { UNIT, BLD, FACTION, Kind, BKind, Unit, isWorker, fac } from '../../src/data';
import { abilitiesOf } from '../../src/core/ability';
import { mem } from '../../src/factions/ironhold/kit';
import { load } from '../../src/core/cargo';
import { G_RIPEN } from '../../src/factions/gloam/numbers';
import { podRoom } from '../../src/factions/gloam/abilities';

/** The spot each ability with a rule of its own needs, built round the caster. Returns where to aim. */
/** Everything the scenes made, so a test can clear it away after the cast: left standing it would change what each side sees. */
export const made: { alive: boolean }[] = [];
export function clearScenes() { for (const o of made) o.alive = false; made.length = 0; }
const keep = <T extends { alive: boolean }>(o: T): T => { made.push(o); return o; };
export type Aim = { x: number; z: number; id?: number };
export const SCENES: Record<string, (g: Game, u: Unit, side: number, foe: number) => Aim | null> = {
  'longshot.deep': (g, u, side) => { const m = keep(g.addBuilding('mast' as any, side, u.pos.x - 14, u.pos.z, true)); mem(m).charges = 1; return { x: u.pos.x + 10, z: u.pos.z }; },
  'choirmaster.drain': (g, u, _s, foe) => { const k = (Object.keys(UNIT) as Kind[]).find(x => (UNIT[x].team || 0) === (fac(foe)) && !UNIT[x].air && abilitiesOf(x).some(a => a.energy > 0))!; const o = keep(g.spawn(k, foe, u.pos.x + 5, u.pos.z)); o.energy = 60; return { x: o.pos.x, z: o.pos.z, id: o.id }; },
  'choirmaster.join': (g, u, side) => { keep(g.spawn('choirmaster' as Kind, side, u.pos.x + 3, u.pos.z)); return { x: u.pos.x, z: u.pos.z }; },
  'ferry.drop': (g, u, side) => aboard(g, u, side),
  'drifter.drop': (g, u, side) => aboard(g, u, side),
  'quillback.ripen': (g, u, side) => ripe(g, u, side), 'shellback.ripen': (g, u, side) => ripe(g, u, side), 'bloater.ripen': (g, u, side) => ripe(g, u, side), 'drifter.ripen': (g, u, side) => ripe(g, u, side),
  'hooksail.drink': (g, u, side) => { const b = keep(g.addBuilding(FACTION[fac(side)].builds[0], side, u.pos.x + BLD[FACTION[fac(side)].builds[0]].hx + 2, u.pos.z, true)); return { x: b.pos.x, z: b.pos.z, id: b.id }; },
  'stingerwalk.root': (g, u, side) => bloom(g, u, side), 'puffwalk.root': (g, u, side) => bloom(g, u, side),
  'patch.painkiller': (g, u, side) => body(g, u, side, k => k === 'linesman'),
  'tuner.voice': (g, u, side) => body(g, u, side, k => !isWorker(k) && !UNIT[k].air && k !== 'tender'),
  'hopper.doors': (g, u, side) => { const o = body(g, u, side, k => !isWorker(k) && !UNIT[k].air, 2); return o && { x: u.pos.x, z: u.pos.z }; },
  'surveyor.jam': (g, u, _s, foe) => body(g, u, foe, k => !!UNIT[k].tags?.includes('machine') && !UNIT[k].air),
  'sapper.satchel': (g, u, _s, foe) => { const k = FACTION[fac(foe)].builds[0], b = keep(g.addBuilding(k, foe, u.pos.x + BLD[k].hx + 1, u.pos.z, true)); return { x: b.pos.x, z: b.pos.z, id: b.id }; },
  'keeper.seed': (g, u, side) => { const b = keep(g.addBuilding('mothercap' as any, side, u.pos.x + BLD['mothercap' as BKind].hx + 2, u.pos.z, true)); return { x: b.pos.x, z: b.pos.z, id: b.id }; },
  'keeper.pod': (g, u, side) => { const a = bloom(g, { pos: u.pos.clone() } as Unit, side); return { x: a.x, z: a.z }; },
};
/** A body of the same faction as `side` (a kind the test picks) standing beside the caster. */
function body(g: Game, u: Unit, side: number, want: (k: Kind) => boolean, d = 3): Aim | null {
  const f = fac(side), k = (Object.keys(UNIT) as Kind[]).find(x => (UNIT[x].team || 0) === f && want(x)); if (!k) return null;
  const o = keep(g.spawn(k, side, u.pos.x + d, u.pos.z)); o.speed = 0; return { x: o.pos.x, z: o.pos.z, id: o.id };
}
/** A small body of the same side carried aboard. */
function aboard(g: Game, u: Unit, side: number): Aim | null {
  const small = (Object.keys(UNIT) as Kind[]).filter(x => (UNIT[x].team || 0) === (UNIT[u.kind].team || 0) && !UNIT[x].air && (UNIT[x].supply || 1) <= 1);
  for (const k of small) { const p = keep(g.spawn(k, side, u.pos.x + 1.5, u.pos.z)); if (load(g, u, p)) return { x: u.pos.x, z: u.pos.z }; p.alive = false; }
  return null;
}
/** The building it ripens at, the research, and ore and Flux to pay. */
function ripe(g: Game, u: Unit, side: number): Aim {
  const r = G_RIPEN[u.kind as keyof typeof G_RIPEN]!; keep(g.addBuilding(r.at as any, side, u.pos.x - 20, u.pos.z + 12, true));
  for (let i = 0; i < 4; i++) keep(g.addBuilding(FACTION[fac(side)].builds.find(b => (BLD[b] as any).supply) || FACTION[fac(side)].builds[0], side, u.pos.x - 30 - i * 9, u.pos.z - 14, true));
  g.purse[side] += 5000; g.fluxPurse[side] = (g.fluxPurse[side] || 0) + 5000; return { x: u.pos.x, z: u.pos.z };
}
/** A patch of grown Bloom of its own side underfoot. */
function bloom(g: Game, u: Unit, side: number): Aim {
  for (let i = 0; i < 40 && !podRoom(g, u.pos.x, u.pos.z); i++) { u.pos.x += 7 * Math.cos(i * 2.4); u.pos.z += 7 * Math.sin(i * 2.4); }   // clear of buildings and seams
  g.carpet.add({ team: side, alive: true } as any, 'sporepod' as any, u.pos.x, u.pos.z, true); return { x: u.pos.x, z: u.pos.z };
}
