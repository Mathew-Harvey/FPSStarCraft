// Gloam building commands (BldRules.actions): a Cap ripening into an Elder or Ancient Cap, a Wing Spire into a Tall Spire, a Spore Sac
// floating off as a Drifter, Stinger Stalks and Puffballs pulling up their roots to walk, Spore Pods planting one more pod, and the
// Deep Root tunnels. Each shows in the building's first-person prompt and on the command card, and the bots call the same commands.
import { V3, R, M } from '../../gfx';
import { sfx } from '../../audio';
import type { Game } from '../../game';
import { UNIT, BLD, Unit, Building, BKind } from '../../data';
import { isEnemy } from '../../core/sides';
import { MAP } from '../../maps';
import { defineBuildings, type BldAction } from '../../core/registry';
import { costOf, refund } from '../../core/econ';
import { addStatus } from '../../core/status';
import { G2, G_UPGRADES, type GBKind, type GKind } from './numbers';
import { isCap, dist } from './kit';
import { podRoom } from './abilities';

const TMP = V3();
type Grow = { to: GBKind; t: number; all: number };
const growOf = (b: Building): Grow | undefined => (b as any).grow;
/** A building swapping into a bigger kind where it stands: what it needs besides the price, and how long it takes. */
const TIERS: Partial<Record<GBKind, { to: GBKind; needs: GBKind; hotkey: string }>> = {
  mothercap: { to: 'eldercap', needs: 'warren', hotkey: 'R' },
  eldercap: { to: 'ancientcap', needs: 'rotden', hotkey: 'R' },
  wingspire: { to: 'tallspire', needs: 'ancientcap', hotkey: 'R' },
};
/** Starts a building ripening into its next kind. Paid by buildingAction; the building keeps working meanwhile. */
function startGrow(g: Game, b: Building, to: GBKind) { (b as any).grow = { to, t: BLD[to].time, all: BLD[to].time } as Grow; g.puff(TMP.set(b.pos.x, b.h, b.pos.z), 6, 1.4, M.gS, .6, 2); if (g.vol(b.pos) > .2) sfx.place(); }
/** Every frame, host: ripening counts down, then the building becomes its next kind (health kept as a share). */
export function tickGrow(g: Game, b: Building, dt: number) {
  const gr = growOf(b); if (!gr) return; gr.t -= dt * Math.max(0, g.rate(b)); if (gr.t > 0) return;
  (b as any).grow = undefined; const from = b.kind; g.rebuild(b, gr.to); g.carpet.drop(b); g.carpet.add(b, gr.to, b.pos.x, b.pos.z, true);
  g.puff(TMP.set(b.pos.x, b.h * .8, b.pos.z), 10, 2, M.gS, 1, 3); sfx.built();
  g.feed(G_VOICE, from === 'wingspire' ? 'The Tall Spire has grown. Bloaters can ripen into Sowers there.' : `The ${BLD[gr.to].name} has ripened.`, '', b.team);
}
const G_VOICE = 'Overgrowth';
const tierActions = (k: GBKind) => (g: Game, b: Building): BldAction[] => {
  const T = TIERS[k]!, gr = growOf(b);
  if (gr) return [{ key: 'stopgrow', name: `Stop ripening (${Math.ceil(gr.t)} s left)`, hotkey: 'R', blurb: 'Gives the price back.', run: (g, b) => { (b as any).grow = undefined; refund(g, b.team, costOf(T.to)); } }];
  return [{ key: 'grow', name: `Ripen into ${BLD[T.to].name}`, hotkey: T.hotkey, cost: costOf(T.to), blurb: `${BLD[T.to].time} s. ${BLD[T.to].blurb}.`,
    ok: (g, b) => !g.ownB(T.needs as BKind, true, b.team).length ? `needs a ${BLD[T.needs].name} first` : '',
    run: (g, b) => startGrow(g, b, T.to) }];
};

/** Takes a building off the map without a wreck (it walked or floated away). Clients drop it when it leaves the snapshot. */
export function lift(g: Game, b: Building) { b.alive = false; g.scene.remove(b.obj); if (b.holo) g.scene.remove(b.holo); g.carpet.drop(b); }
/** Uproots a building into a body of `to`, with the same share of health, standing where the building stood. */
export function uproot(g: Game, b: Building, to: GKind) {
  const k = b.hp / b.maxHp, u = g.spawn(to, b.team, b.pos.x, b.pos.z); u.hp = Math.max(1, u.maxHp * k); u.yaw = b.obj.rotation.y;
  if (to !== 'drifter') { addStatus(u, 'root', G2.uproot.t); (u as any).pullT = G2.uproot.t; }
  u.order = { type: 'guard', x: b.pos.x, z: b.pos.z }; lift(g, b); g.puff(TMP.set(b.pos.x, .5, b.pos.z), 8, 1.4, M.dust, .8, 2); if (g.vol(b.pos) > .2) sfx.place(); return u;
}
/** A walker that has finished rooting turns back into its building, on the spot, with the same share of health. */
export function reroot(g: Game, u: Unit) {
  const to: GBKind = u.kind === 'stingerwalk' ? 'stinger' : 'puffball', k = u.hp / u.maxHp;
  const b = g.addBuilding(to, u.team, Math.round(u.pos.x), Math.round(u.pos.z), true); b.hp = Math.max(1, b.maxHp * k);
  u.alive = false; g.scene.remove(u.obj); g.puff(TMP.set(u.pos.x, .4, u.pos.z), 6, 1, M.dust, .5, 1.6); return b;
}
const uprootAct = (to: GKind, name: string, blurb: string): BldAction => ({ key: 'uproot', name, hotkey: 'R', blurb,
  ok: (g, b) => b.queue.length ? 'still busy' : to === 'drifter' && g.supplyUsed(b.team) > g.supplyCap(b.team) ? 'its beds are full' : '',
  run: (g, b) => { uproot(g, b, to); } });

// ---------------------------------------------------------------- Spore Pods
/** A pod with a hop left plants one more pod 12 m on, toward the enemy (or where the player is looking), on its own fresh Bloom. */
export function podHop(g: Game, b: Building, x?: number, z?: number) {
  if (!((b as any).hops > 0)) return null;
  let tx = x, tz = z;
  if (tx === undefined || tz === undefined) { const foe = g.buildings.filter(o => o.alive && isEnemy(b.team, o.team)).sort((a, c) => dist(a, b) - dist(c, b))[0]; const a = foe ? Math.atan2(foe.pos.z - b.pos.z, foe.pos.x - b.pos.x) : R(0, 6.283); tx = b.pos.x + Math.cos(a) * G2.keeper.pod.hop; tz = b.pos.z + Math.sin(a) * G2.keeper.pod.hop; }
  for (let i = 0; i < 8; i++) { const ox = tx + (i ? R(-3, 3) : 0), oz = tz + (i ? R(-3, 3) : 0); if (Math.hypot(ox - MAP.mid![0], oz - MAP.mid![1]) < MAP.rad! * .95 - 2 && podRoom(g, ox, oz)) { (b as any).hops = 0; const n = g.addBuilding('sporepod', b.team, Math.round(ox), Math.round(oz), false); (n as any).hops = 0; return n; } }
  return null;
}
const podAct: BldAction = { key: 'hop', name: 'Plant one more pod', hotkey: 'R', blurb: '14 m on toward the enemy. Once per pod.',
  ok: (_g, b) => (b as any).hops > 0 ? '' : 'this pod has planted its one', run: (g, b) => { podHop(g, b); } };

// ---------------------------------------------------------------- Deep Root tunnels
/** The other end of a tunnel: a Tunnel Root's Deep Root, or a Deep Root's Tunnel Root. Null when that end is gone or not grown yet. */
export function otherEnd(g: Game, b: Building): Building | null {
  if (b.kind === 'tunnelroot') { const d = g.bById?.get((b as any).pair) ?? g.buildings.find(x => x.id === (b as any).pair); return d && d.alive && d.built ? d : null; }
  const t = g.buildings.find(x => x.alive && x.built && x.kind === 'tunnelroot' && (x as any).pair === b.id); return t || null;
}
/** Sends a body through: it comes out at the far mouth, held still for a moment. */
export function travel(g: Game, u: Unit, from: Building) {
  const to = otherEnd(g, from); if (!to) return false; const a = R(0, 6.283), r = Math.max(to.hx, to.hz) + 1.2;
  u.pos.set(to.pos.x + Math.cos(a) * r, 0, to.pos.z + Math.sin(a) * r); u.obj.position.copy(u.pos); addStatus(u, 'stun', G2.tunnel.inT);
  if (u.order && u.order.type === 'amove') { const ox = u.order.x, oz = u.order.z; if (Math.hypot(ox - from.pos.x, oz - from.pos.z) < 6) u.order = { ...u.order, x: u.pos.x, z: u.pos.z }; }
  if (u === g.me) { g.shake = Math.max(g.shake, .2); }
  g.puff(TMP.set(from.pos.x, .4, from.pos.z), 3, .8, M.dust, .4); g.puff(TMP.set(u.pos.x, .4, u.pos.z), 3, .8, M.dust, .4); if (g.vol(u.pos) > .2) sfx.dash(g.vol(u.pos) * .6);
  return true;
}
/** Every frame, host: own ground bodies that walk onto a mouth while heading further than the other mouth is, go through. */
function tunnelTick(g: Game, b: Building) {
  const to = otherEnd(g, b); if (!to) return; const mouth = Math.max(b.hx, b.hz) + G2.tunnel.mouth;
  for (const u of g.units) {
    if (!u.alive || u.team !== b.team || u.air || u.inside || u === g.me || u.pilot || (u as any).tunT > g.time) continue;
    if (Math.hypot(u.pos.x - b.pos.x, u.pos.z - b.pos.z) > mouth) continue; const o = u.order; if (!o || (o.type !== 'amove' && o.type !== 'raid')) continue;
    const here = Math.hypot(o.x - u.pos.x, o.z - u.pos.z), there = Math.hypot(o.x - to.pos.x, o.z - to.pos.z);
    if (there + 8 < here) { (u as any).tunT = g.time + 3; travel(g, u, b); }
  }
}
const tunnelAct: BldAction = { key: 'go', name: 'Go through', hotkey: 'R', blurb: 'You and every body of yours within 6 m come out at the other end.',
  ok: (g, b) => !otherEnd(g, b) ? (b.kind === 'deeproot' ? 'no Tunnel Root grown from it yet' : 'its Deep Root is gone') : '',
  run: (g, b) => { const to = otherEnd(g, b)!; for (const u of g.units) if (u.alive && u.team === b.team && !u.air && !u.inside && g.distToBox(b, u.pos.x, u.pos.z) < 6) { (u as any).tunT = g.time + 3; travel(g, u, b); } void to; } };
/** A Tunnel Root has to go where the side can see now, within reach of a body or building of its own, and needs a Deep Root with no tunnel. */
export function tunnelOK(g: Game, x: number, z: number, team: number) {
  const free = g.buildings.find(d => d.alive && d.built && d.team === team && d.kind === 'deeproot' && !g.buildings.some(t => t.alive && t.kind === 'tunnelroot' && (t as any).pair === d.id));
  if (!free) return 'Every Deep Root already has its tunnel. Grow another Deep Root.';
  if (!g.units.some(u => u.alive && u.team === team && Math.hypot(u.pos.x - x, u.pos.z - z) < 14) && !g.buildings.some(b => b.alive && b.team === team && g.distToBox(b, x, z) < 12)) return 'A Tunnel Root has to go where you can see right now.';
  return '';
}

// ---------------------------------------------------------------- research a bigger Cap still sells
/** An Elder or Ancient Cap still sells the Mother Cap's research; the prompt only lists research at its own kind, so it lists them as commands. */
const capResearch = (g: Game, b: Building): BldAction[] => {
  const keys = 'FGHJ'.split(''); let i = 0; const out: BldAction[] = [];
  for (const u of G_UPGRADES) { if (u.at !== 'mothercap' || g.upOf(b.team)[u.key] || i >= keys.length) continue; if (u.needs && !g.upOf(b.team)[u.needs]) continue; out.push({ key: 'r_' + u.key, name: u.name, hotkey: keys[i++], blurb: `${u.cost} ore${u.flux ? ' / ' + u.flux + ' Flux' : ''}. ${u.blurb}`, ok: g2 => g2.gated(b.team, u.key), run: (g2, b2) => { g2.buyUpgrade(u.key, b2.team, true); } }); }
  return out;
};

// ---------------------------------------------------------------- wiring
defineBuildings({
  mothercap: { actions: tierActions('mothercap') },
  eldercap: { actions: (g, b) => [...tierActions('eldercap')(g, b), ...capResearch(g, b)] },
  ancientcap: { actions: capResearch },
  wingspire: { actions: tierActions('wingspire') },
  sporesac: { actions: () => [uprootAct('drifter', 'Float off as a Drifter', 'It keeps its 8 beds while it floats. Slow.')] },
  stinger: { actions: () => [uprootAct('stingerwalk', 'Pull up the roots', 'Walks slowly; roots again on your Bloom.')] },
  puffball: { actions: () => [uprootAct('puffwalk', 'Pull up the roots', 'Walks slowly; roots again on your Bloom.')] },
  sporepod: { actions: () => [podAct], added(_g, b) { if ((b as any).hops === undefined) (b as any).hops = 1; } },
  deeproot: { actions: () => [tunnelAct], tick: (g, b) => tunnelTick(g, b) },
  tunnelroot: { actions: () => [tunnelAct], tick: (g, b) => tunnelTick(g, b), free: true, far: true,
    added(g, b) { const d = g.buildings.filter(d => d.alive && d.built && d.team === b.team && d.kind === 'deeproot' && !g.buildings.some(t => t !== b && t.alive && t.kind === 'tunnelroot' && (t as any).pair === d.id)).sort((a, c) => dist(a, b) - dist(c, b))[0]; (b as any).pair = d ? d.id : -1; } },
});
export { TIERS, growOf };
