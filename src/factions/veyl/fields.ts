// Song fields and what grows in them. Every Veyl building except a Choir Stone, a Hush Well and a Siphon Bell must stand with some part of
// it inside a song field (a finished Choir Stone or Hush Well, or an unfolded Ferry) to work: outside one it falls silent, so it trains
// nothing, sells no songs and its tower stops. A Tender plants a seed and walks off; the seed grows by itself. A Choir Stone keeps energy
// for Quicken (one building works 50% faster for 20 s). A Brood Pit that knows Far Singing sings each new body in at the field nearest the
// front. A Mending Pool spends its energy putting shields back. All of it runs on the host; the classic match (a Veyl outpost nobody runs
// an economy for) has no fields, so none of this applies there.
import type { Game } from '../../game';
import { storyVeyl } from './story-tree';   // STORY STAND-IN: see story-tree.ts
import type { Unit, Building, Kind, BKind } from '../../data';
import { UNIT, BLD, fac } from '../../data';
import { V3, M } from '../../gfx';
import { sfx } from '../../audio';
import { TMP } from '../../game';
import { FIELD, V_TUNE } from './numbers';

/** Is the field rule on for this side? Only when the Chorus runs a real economy. */
export const fieldsOn = (g: Game, team: number) => g.eco && fac(team) === 1 && !storyVeyl(g);   // STORY STAND-IN: see story-tree.ts

/** Every spot that holds a song field for a side right now: [x, z, radius, the thing making it]. */
export function fieldsOf(g: Game, team: number): [number, number, number, Unit | Building][] {
  const out: [number, number, number, Unit | Building][] = [];
  for (const b of g.buildings) if (b.alive && b.built && b.team === team && (FIELD.src as string[]).includes(b.kind)) out.push([b.pos.x, b.pos.z, FIELD.r, b]);
  for (const u of g.units) if (u.alive && u.team === team && u.kind === 'ferry' && unfolded(u)) out.push([u.pos.x, u.pos.z, FIELD.ferry, u]);
  return out;
}
/** Does a footprint (centre and half sizes) touch one of the side's fields? */
export function inField(g: Game, team: number, x: number, z: number, hx: number, hz: number, skip: Unit | Building | null = null) {
  for (const [fx, fz, r, by] of fieldsOf(g, team)) { if (by === skip) continue; const dx = Math.max(Math.abs(fx - x) - hx, 0), dz = Math.max(Math.abs(fz - z) - hz, 0); if (Math.hypot(dx, dz) <= r) return true; }
  return false;
}
/** Kinds that work anywhere: the field makers themselves and the vent tap. */
export const freeKind = (k: BKind) => (FIELD.src as string[]).includes(k) || k === 'siphonbell';

/** Is a finished building silent (outside every field)? Bodies on the far side of the classic match are never silent. */
export function silent(g: Game, b: Building) { return fieldsOn(g, b.team) && !freeKind(b.kind) && !inField(g, b.team, b.pos.x, b.pos.z, b.hx, b.hz); }

/** Placement: '' when the spot is fine, else the plain reason. */
export function placeWhy(g: Game, k: BKind, x: number, z: number, team: number) {
  if (!fieldsOn(g, team) || freeKind(k)) return '';
  const st = BLD[k]; return inField(g, team, x, z, st.hx, st.hz) ? '' : `A ${st.name} has to stand inside a song field: next to a finished Choir Stone or Hush Well, or an unfolded Ferry.`;
}

// ---------------------------------------------------------------- building energy (Choir Stone for Quicken, Mending Pool)
const EN = new WeakMap<Building, number>(), QUICK = new WeakMap<Building, number>(), REST = new WeakMap<Building, number>();
export const energyOf = (b: Building) => EN.get(b) ?? 0;
export const setEnergy = (b: Building, n: number) => EN.set(b, n);
/** Seconds of Quicken left on a building. */
export const quickLeft = (g: Game, b: Building) => Math.max(0, (QUICK.get(b) ?? 0) - g.time);
/** How fast a finished building works: 0 silent, 1 normal, 1.5 Quickened. */
export function rateOf(g: Game, b: Building) { if (silent(g, b)) return 0; return quickLeft(g, b) > 0 ? V_TUNE.quicken.k : 1; }

/** Quicken: a Choir Stone of the side with 50 energy spends it on a building, which then works 50% faster for 20 s. */
export function quicken(g: Game, b: Building, team = b.team): boolean {
  if (!b.alive || !b.built || b.team !== team || fac(team) !== 1 || quickLeft(g, b) > 0) return false;
  const stone = g.ownB('choir', true, team).filter(s => energyOf(s) >= V_TUNE.quicken.energy).sort((a, c) => energyOf(c) - energyOf(a))[0]; if (!stone) return false;
  setEnergy(stone, energyOf(stone) - V_TUNE.quicken.energy); QUICK.set(b, g.time + V_TUNE.quicken.t);
  g.tracer(V3(stone.pos.x, 9.6, stone.pos.z), V3(b.pos.x, b.h * .7, b.pos.z), quickMat(), .25); g.puff(TMP.set(b.pos.x, b.h * .7, b.pos.z), 6, 1.2, M.cyan, 1, 1.5);
  g.evq?.push(['vq', b.id]); return true;
}
let qm: any = null; const quickMat = () => qm || (qm = M.cyan);

/** Every frame for each standing Veyl building (host): seeds grow, energy refills, Quicken glows. */
export function eachVeyl(g: Game, b: Building, dt: number) {
  if (!b.built) {
    // A seed grows by itself (the faction's `grows` flag keeps game.ts from sending a Tender). A Tender who stays and sings still speeds it up.
    if (!g.net) b.progress += dt / BLD[b.kind].time;
    return;
  }
  if (b.kind === 'choir') EN.set(b, Math.min(V_TUNE.quicken.max, (EN.get(b) ?? V_TUNE.quicken.start) + V_TUNE.pool.regen * dt));
  if (b.kind === 'mendingpool') { EN.set(b, Math.min(V_TUNE.pool.max, (EN.get(b) ?? V_TUNE.pool.start) + V_TUNE.pool.regen * dt)); if (!silent(g, b)) mend(g, b, dt); }
}
/** The Mending Pool: spends energy putting shields back on hurt friends within reach, and health on hurt buildings at a third the rate. */
function mend(g: Game, b: Building, dt: number) {
  const T = V_TUNE.pool; let e = EN.get(b) ?? 0; if (e < 1) return; let spent = 0; const cap = T.rate * dt;
  for (const u of g.units) {
    if (!u.alive || u.team !== b.team || u.shield >= u.maxShield || g.distToBox(b, u.pos.x, u.pos.z) > T.r) continue;
    const add = Math.min(u.maxShield - u.shield, cap, (e - spent) * T.per); if (add <= 0) break; u.shield += add; spent += add / T.per;
    if (Math.random() < dt * 4) g.tracer(V3(b.pos.x, 2.4, b.pos.z), V3(u.pos.x, UNIT[u.kind].bodyY, u.pos.z), M.cyan as any, .12);
  }
  for (const o of g.buildings) {
    if (!o.alive || !o.built || o.team !== b.team || o === b || o.hp >= o.maxHp || g.time - o.lastHit < 2 || g.distToBox(o, b.pos.x, b.pos.z) > T.r + 2) continue;
    const add = Math.min(o.maxHp - o.hp, cap / 3, (e - spent) * T.per / 3); if (add <= 0) break; o.hp += add; spent += add * 3 / T.per;
  }
  EN.set(b, e - spent);
}

// ---------------------------------------------------------------- training: rate, silence and Far Singing
/** A Veyl building's training queue (the registry's `hatch`): runs at the building's rate, stops when silent, and with Far Singing a
 *  Brood Pit sings each body in at the field nearest the front after a short arrival, then rests. */
export function hatchVeyl(g: Game, b: Building, dt: number) {
  // game.ts passes dt already scaled by the building's rate, and does not call this at all while the building is silent.
  if (!b.queue.length) return;
  const rest = REST.get(b) ?? 0; if (rest > 0) { REST.set(b, rest - dt); return; }
  const q = b.queue[0], far = b.kind === 'broodpit' && fieldsOn(g, b.team) && !!g.upOf(b.team).vfar;
  if (far && !(q as any).far) { const at = frontField(g, b.team); (q as any).far = at; q.t = Math.min(q.t, V_TUNE.far.arrive); g.warn(at[0], at[1], 1.6, V_TUNE.far.arrive); g.evq?.push(['vf', Math.round(at[0] * 10) / 10, Math.round(at[1] * 10) / 10]); }
  q.t -= dt; if (q.t > 0) return;
  b.queue.shift(); const at: [number, number] | undefined = (q as any).far;
  const x = at ? at[0] + (Math.random() - .5) * 2 : b.pos.x + (Math.random() * 4 - 1), z = at ? at[1] + (Math.random() - .5) * 2 : b.pos.z + b.hz + 1.2;
  const u = g.spawn(q.kind, b.team, x, z); g.puff(TMP.copy(u.pos).setY(1), at ? 8 : 4, at ? 1.2 : .8, M.violet); if (g.vol(u.pos) > .2) sfx.blip(); g.dir.trained(u);
  if (at) REST.set(b, Math.max(0, UNIT[q.kind].time * V_TUNE.far.cycle - V_TUNE.far.arrive));
}
/** Where Far Singing puts a new body: the side's field nearest its army (or, for a player's side, nearest the body the player drives). */
export function frontField(g: Game, team: number): [number, number] {
  const fs = fieldsOf(g, team); let tx = 0, tz = 0, n = 0;
  if (g.me && g.me.team === team && g.me.alive) { tx = g.me.pos.x; tz = g.me.pos.z; n = 1; }
  else for (const u of g.army(team)) { tx += u.pos.x; tz += u.pos.z; n++; }
  if (!fs.length) { const h = g.ownB('choir', false, team)[0]; return h ? [h.pos.x, h.pos.z + 4] : [tx / Math.max(1, n), tz / Math.max(1, n)]; }
  if (n) { tx /= n; tz /= n; } else { tx = fs[0][0]; tz = fs[0][1]; }
  let best = fs[0], bd = 1e9; for (const f of fs) { const d = Math.hypot(f[0] - tx, f[1] - tz); if (d < bd) { bd = d; best = f; } }
  // just inside the field, on the side facing the army, clear of the building at its heart
  const ang = Math.atan2(tz - best[1], tx - best[0]), r = Math.min(best[2] * .7, 4.5) + (UNIT['broodpit' as Kind] ? 0 : 0);
  return [best[0] + Math.cos(ang) * r, best[1] + Math.sin(ang) * r];
}
/** Seconds a Brood Pit still rests after singing a body in. */
export const restOf = (b: Building) => Math.max(0, REST.get(b) ?? 0);

// ---------------------------------------------------------------- Ferry unfolding (the field part; the ability is in rules)
const OPEN = new WeakMap<Unit, boolean>();
export const unfolded = (u: Unit) => !!OPEN.get(u);
export function setUnfolded(u: Unit, on: boolean) { OPEN.set(u, on); }
