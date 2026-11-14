// Ironhold buildings: add-ons (Twin Bay trains two at once, Lab Bay unlocks the heavier units and its host's research), the Pump Jack on a
// Flux vent, the Depot that sinks for its own crew, the Dugout, the Flak Tower, the Watchpost's Spotlight, the Headframe's two second forms
// (Survey Rig: scans and Haul Drones; Bastion Head: armour and a gun), buildings packing onto skids and crawling, and the Signal Mast's
// Deep Charge. Player commands are building actions (BldRules.actions), so the first-person prompt, the command card and the server share them.
import { V3, R, M, tracerMat } from '../../gfx';
import { sfx } from '../../audio';
import type { Game } from '../../game';
import { TMP } from '../../game';
import { UNIT, BLD, Unit, Building, BKind, Kind, UPGRADES, fac } from '../../data';
import { defineBuildings, defineFaction, bldRule, type BldAction } from '../../core/registry';
import { addStatus } from '../../core/status';
import { isHidden, seenBy } from '../../core/sight';
import { isEnemy } from '../../core/sides';
import { load, unload, usedOf } from '../../core/cargo';
import { roomFor, flyBuilding } from '../../core/air';
import { refund, costOf } from '../../core/econ';
import { TUNE, mem, nearest, within, dist, mulOf } from './kit';
import { HOSTS, ADDONS, LAB, CRAWLERS, I_UPGRADES, I_NEEDS, type IBKind, type IKind } from './numbers';

const isHost = (k: string) => HOSTS.includes(k as IBKind);
const isAddon = (k: string) => ADDONS.includes(k as IBKind);
const an = (s: string) => (/^[AEIOU]/.test(s) ? 'an ' : 'a ') + s;

// ---------------------------------------------------------------- add-ons
/** The add-on bolted to a building (alive), if any, and the building an add-on is bolted to. */
export function addonOf(b: Building): Building | null { const a = mem(b).addon as Building | undefined; return a && a.alive && mem(a).host === b ? a : null; }
export function hostOf(a: Building): Building | null { const h = mem(a).host as Building | undefined; return h && h.alive && mem(h).addon === a ? h : null; }
/** Where an add-on can go beside a host, best first: against the west wall (the Bunkhouse's door is on the east), then the north and south walls. */
export function addonSpots(host: Building, k: BKind): [number, number][] { const d = BLD[k], x = host.pos.x, z = host.pos.z; return [[x - host.hx - 1.7 - d.hx, z - host.hz + d.hz], [x - host.hx + d.hx, z - host.hz - 1.7 - d.hz], [x - host.hx + d.hx, z + host.hz + 1.7 + d.hz]]; }
/** The spot an add-on would go now: the first of addonSpots with room (or the west one when none has room, for the refusal). */
export function addonSpot(host: Building, k: BKind, g?: Game): [number, number] { const all = addonSpots(host, k); return (g && all.find(p => g.canPlace(k, p[0], p[1], false, host.team))) || all[0]; }
const nearSpot = (h: Building, k: BKind, x: number, z: number) => addonSpots(h, k).reduce((a, p) => Math.hypot(p[0] - x, p[1] - z) < Math.hypot(a[0] - x, a[1] - z) ? p : a);
const hasLab = (b: Building) => { const a = addonOf(b); return !!a && a.built && a.kind === 'labbay'; };
const hasTwin = (b: Building) => { const a = addonOf(b); return !!a && a.built && a.kind === 'twinbay'; };
/** Bolts an add-on to a host. */
export function link(host: Building, a: Building) { mem(host).addon = a; mem(a).host = host; face(host, a); }
/** Turns an add-on so its joining tunnel (the model's +x side) points at its host, whichever wall it sits on. */
function face(host: Building, a: Building) { if (a.obj) a.obj.rotation.y = -Math.atan2(host.pos.z - a.pos.z, host.pos.x - a.pos.x); }
/** A free host of this side whose add-on spot is near a point, for snapping a Rigger's ghost and for linking a new add-on. */
function freeHost(g: Game, team: number, k: BKind, x: number, z: number, r = 6): Building | null {
  let best: Building | null = null, bd = r;
  for (const h of g.buildings) { if (!h.alive || h.team !== team || !isHost(h.kind) || addonOf(h) || mem(h).crawl) continue; const [sx, sz] = nearSpot(h, k, x, z), d = Math.hypot(sx - x, sz - z); if (d < bd) { bd = d; best = h; } }
  return best;
}
/** Starts an add-on beside a host (a Rigger is sent to build it). Returns the site, or null when the spot is taken. */
export function bolt(g: Game, host: Building, k: BKind): Building | null {
  if (addonOf(host) || !host.built) return null; const [x, z] = addonSpot(host, k, g); if (!g.canPlace(k, x, z, false, host.team)) return null;
  const a = g.addBuilding(k, host.team, x, z, false); link(host, a); return a;
}
const addonAction = (k: IBKind, hotkey: string): BldAction => ({
  key: k, name: `Bolt on ${an(BLD[k].name)}`, hotkey, cost: costOf(k), blurb: BLD[k].blurb,
  ok(g, b) { if (addonOf(b)) return `It already has ${an(BLD[addonOf(b)!.kind].name)}.`; if (mem(b).crawl) return 'Not while it crawls.'; const [x, z] = addonSpot(b, k, g); return g.canPlace(k, x, z, false, b.team) ? '' : 'No room beside it. Clear a wall.'; },
  run(g, b) { bolt(g, b, k); },
});
/** A host trains two at once with a Twin Bay; anything else trains one at a time, as usual. Nothing trains while it crawls. */
function hatchTwin(g: Game, b: Building, dt: number) {
  if (mem(b).crawl || mem(b).form) return;
  const n = hasTwin(b) ? 2 : 1;
  for (let i = 0; i < Math.min(n, b.queue.length); i++) b.queue[i].t -= dt;
  for (let i = Math.min(n, b.queue.length) - 1; i >= 0; i--) {
    const q = b.queue[i]; if (q.t > 0) continue; b.queue.splice(i, 1);
    const side = !!bldRule(b.kind).sideDoor && !b.rot, u = g.spawn(q.kind, b.team, b.pos.x + (side ? b.hx + 1.2 : R(-1, 3)), b.pos.z + (side ? R(-.5, .5) : b.hz + 1.2));
    g.puff(TMP.copy(u.pos).setY(1), 4, .8, M.dust); if (g.vol(b.pos) > .2) sfx.blip(); g.dir.trained(u);
  }
}
const trainsHere = (_g: Game, b: Building, k: Kind) => LAB.includes(k as any) && !hasLab(b) ? `The ${UNIT[k].name} needs a Lab Bay on this ${BLD[b.kind].name}.` : '';

// ---------------------------------------------------------------- crawling
/** Packs a building onto skids and sends it crawling to a spot: its add-on stays behind, training stops, it settles where there is room. */
export function crawl(g: Game, b: Building, x: number, z: number) {
  if (!CRAWLERS.includes(b.kind as IBKind) || !b.built || b.queue.length) return false;
  const a = addonOf(b); if (a) { mem(a).host = null; mem(b).addon = null; }
  mem(b).crawl = { x, z, t: 0 }; return true;
}
function tickCrawl(g: Game, b: Building, dt: number) {
  const c = mem(b).crawl; if (!c) return; c.t += dt;
  if (!flyBuilding(b, c.x, c.z, dt, TUNE.crawl)) { if (Math.random() < dt * 3) g.puff(TMP.set(b.pos.x + R(-b.hx, b.hx), .2, b.pos.z + R(-b.hz, b.hz)), 1, .7, M.dust, .4, .6); return; }
  // There: settle if there is room, else edge out in a ring until there is.
  if (roomFor(g, b, b.pos.x, b.pos.z)) { mem(b).crawl = null; sfx.clang(); const near = freeHostAddon(g, b); if (near) link(b, near); return; }
  const a = c.t * 1.7, r = 3 + c.t * .4; c.x = b.pos.x + Math.cos(a) * r; c.z = b.pos.z + Math.sin(a) * r;
}
/** A left-behind add-on at the spot a crawling host just settled on gets bolted back on. */
function freeHostAddon(g: Game, b: Building): Building | null {
  if (!isHost(b.kind)) return null;
  return g.buildings.find(a => a.alive && a.team === b.team && isAddon(a.kind) && !hostOf(a) && addonSpots(b, a.kind).some(p => Math.hypot(a.pos.x - p[0], a.pos.z - p[1]) < 1.5)) || null;
}
const crawlAction: BldAction = {
  key: 'crawl', name: 'Crawl', hotkey: 'K', blurb: 'Packs onto skids and crawls at walking pace to where you are looking. An add-on stays behind.',
  ok(g, b) { if (mem(b).crawl) return 'Already crawling.'; if (b.queue.length) return 'Finish or cancel the training first.'; if (mem(b).form) return 'Not while it is being refitted.'; return ''; },
  run(g, b, aim) { const me = g.me, p = V3(); if (aim) crawl(g, b, aim.x, aim.z); /* online: the player's aim, sent with the ask (K) */ else if (me && g.groundPoint(p, 200)) crawl(g, b, p.x, p.z); else crawl(g, b, b.pos.x + R(-20, 20), b.pos.z + R(-20, 20)); },
};

// ---------------------------------------------------------------- Headframe, Survey Rig, Bastion Head
/** A Headframe being refitted into a Survey Rig or Bastion Head: what it becomes and the seconds left. Nothing trains meanwhile. */
const refit = (to: IBKind, hotkey: string): BldAction => ({
  key: to, name: `Refit as ${an(BLD[to].name)}`, hotkey, cost: costOf(to), blurb: BLD[to].blurb + `. Takes ${BLD[to].time} s; nothing trains meanwhile.`,
  ok(g, b) { if (mem(b).form) return 'Already being refitted.'; if (b.queue.length) return 'Finish or cancel the training first.'; if (mem(b).crawl) return 'Not while it crawls.'; return ''; },
  run(g, b) { mem(b).form = { to, t: BLD[to].time }; },
});
function tickRefit(g: Game, b: Building, dt: number) {
  const f = mem(b).form; if (!f) return; f.t -= dt; if (Math.random() < dt * 2) g.debris(TMP.set(b.pos.x + R(-b.hx, b.hx), b.h, b.pos.z + R(-b.hz, b.hz)), 1, .08, M.spark, 3);
  if (f.t > 0) return; mem(b).form = null; g.rebuild(b, f.to); if (f.to === 'surveyrig') { mem(b).energy = TUNE.rig.start; }
  sfx.built(); g.feed('Quartermaster', f.to === 'surveyrig' ? 'Survey Rig is up. Scans and Haul Drones on request, billed by the minute.' : 'Bastion Head is up. Thicker walls and a gun on the roof.', '', b.team);
}
const energyOf = (b: Building) => mem(b).energy ?? 0;
/** A Survey Rig's scan: every body in the circle can be seen and shot for a while, unseen or not. */
export function scan(g: Game, b: Building, x: number, z: number) {
  for (const o of g.units) if (o.alive && isEnemy(b.team, o.team) && Math.hypot(o.pos.x - x, o.pos.z - z) < TUNE.rig.scanR) addStatus(o, 'revealed', TUNE.rig.scanT);
  mem(b).scan = { x, z, t: g.time + TUNE.rig.scanT }; g.pow(V3(x, 2, z), TUNE.rig.scanR * 2, 1); sfx.callout();
}
/** A Survey Rig calls a Haul Drone: it lands by the Rig and mines twice as fast for 64 s. */
export function callDrone(g: Game, b: Building) { const u = g.spawn('hauldrone', b.team, b.pos.x + R(-2, 2), b.pos.z + b.hz + 1.5); mem(u).born = g.time; g.puff(TMP.set(u.pos.x, 2, u.pos.z), 5, .8, M.dust, -.5, 1.5); return u; }
const rigActions = (): BldAction[] => [
  { key: 'drone', name: 'Haul Drone', hotkey: 'P', blurb: `${TUNE.rig.drone} of the Rig's energy: a drone that mines twice as fast for ${TUNE.rig.droneT} s.`, ok: (_g, b) => energyOf(b) >= TUNE.rig.drone ? '' : `Needs ${TUNE.rig.drone} energy (has ${Math.floor(energyOf(b))}).`, run(g, b) { mem(b).energy -= TUNE.rig.drone; callDrone(g, b); } },
  { key: 'scan', name: 'Scan', hotkey: 'O', blurb: `${TUNE.rig.scan} energy: shows everything in ${TUNE.rig.scanR} m of where you are looking for ${TUNE.rig.scanT} s, unseen bodies too.`, ok: (_g, b) => energyOf(b) >= TUNE.rig.scan ? '' : `Needs ${TUNE.rig.scan} energy (has ${Math.floor(energyOf(b))}).`, run(g, b, aim) { mem(b).energy -= TUNE.rig.scan; const p = V3(); if (aim) scan(g, b, aim.x, aim.z); /* online (K) */ else if (g.me && g.groundPoint(p, 400)) scan(g, b, p.x, p.z); else scan(g, b, b.pos.x, b.pos.z); } },
];

// ---------------------------------------------------------------- Dugout
const dugActions = (): BldAction[] => [
  { key: 'empty', name: 'Let them out', hotkey: 'J', blurb: 'Everyone inside walks out.', ok: (_g, b) => b.cargo?.length ? '' : 'Nobody inside.', run(g, b) { unload(g, b); } },
  { key: 'sell', name: 'Sell it back', hotkey: 'K', blurb: `Pulls it down and pays back ${Math.round(TUNE.sell * 100)}% of its price.`, run(g, b) { sell(g, b); } },
  { key: 'fill', name: 'Call crew in', hotkey: 'N', blurb: 'Your nearest fighters on foot climb in, up to four.', ok: (_g, b) => usedOf(b) < 4 ? '' : 'Full.', run(g, b) { fillDugout(g, b, 12); } },
];
export function sell(g: Game, b: Building) { unload(g, b); const c = costOf(b.kind); refund(g, b.team, [c[0] * TUNE.sell, c[1] * TUNE.sell]); b.alive = false; g.scene.remove(b.obj); if (b.holo) g.scene.remove(b.holo); }
/** Fills a Dugout with the nearest free fighters on foot of its side. */
export function fillDugout(g: Game, b: Building, r: number) {
  const cand = g.units.filter(u => u.alive && u.team === b.team && !u.air && !u.inside && u !== g.me && !u.pilot && UNIT[u.kind].supply <= 2 && !UNIT[u.kind].worker && u.kind !== 'rigger' && UNIT[u.kind].speed > 0 && g.distToBox(b, u.pos.x, u.pos.z) < r).sort((a, c) => g.distToBox(b, a.pos.x, a.pos.z) - g.distToBox(b, c.pos.x, c.pos.z));
  let n = 0; for (const u of cand) { if (usedOf(b) >= 4) break; if (g.distToBox(b, u.pos.x, u.pos.z) > 4) { u.order = { type: 'guard', x: b.pos.x, z: b.pos.z }; mem(u).dug = b; continue; } if (load(g, b, u)) n++; }
  return n;
}

// ---------------------------------------------------------------- Signal Mast: Deep Charges
const mastActions = (): BldAction[] => [{
  key: 'charge', name: 'Build a Deep Charge', hotkey: 'N', cost: TUNE.deep.cost, blurb: `Takes 40 s. A Longshot calls it down (key Y). One at a time.`,
  ok: (_g, b) => (mem(b).charges || 0) > 0 ? 'One is ready already.' : mem(b).chargeT > 0 ? 'One is being built.' : '',
  run(_g, b) { mem(b).chargeT = 40; },
}];

// ---------------------------------------------------------------- towers
const DEPOT_UP = 12;
defineBuildings({
  bunkhouse: { hatch: hatchTwin, trains: trainsHere, actions: () => [addonAction('twinbay', 'N'), addonAction('labbay', 'M'), crawlAction] },
  machineshop: { hatch: hatchTwin, trains: trainsHere, actions: () => [addonAction('twinbay', 'N'), addonAction('labbay', 'M'), crawlAction] },
  hangar: { hatch: hatchTwin, trains: trainsHere, sideDoor: false, actions: () => [addonAction('twinbay', 'N'), addonAction('labbay', 'M'), crawlAction] },
  headframe: { hatch: hatchTwin, actions: () => [refit('surveyrig', 'J'), refit('bastion', 'L'), crawlAction] },
  surveyrig: { hq: true, mends: true, hatch: hatchTwin, actions: () => [...rigActions(), crawlAction], note: b => `Energy ${Math.floor(energyOf(b))} of ${TUNE.rig.max}${b.queue.length ? ` · ${b.queue.length} queued` : ''}` },
  bastion: { hq: true, mends: true, hatch: hatchTwin, actions: () => [crawlAction], tick(g, b, dt) {
    b.cd -= dt; if (b.cd > 0) return; const t = nearest(g, { pos: b.pos, team: b.team }, TUNE.bastion.range + b.hx, o => !o.air && seenBy(g, b.team, o)); if (!t) { b.cd = .3; return; }
    b.cd = TUNE.bastion.cd; const a = V3(b.pos.x, b.h + 1, b.pos.z), e = V3(t.pos.x, UNIT[t.kind].bodyY, t.pos.z); g.tracer(a, e, tracerMat, .16); if (g.vol(b.pos) > .05) sfx.cannon(); g.damage(t, TUNE.bastion.dmg * g.gunMul(b.team), b); g.burst(e, TUNE.bastion.dmg * .3, 2, null, t);
  } },
  twinbay: { added(g, b) { if (!hostOf(b)) { const h = freeHost(g, b.team, b.kind, b.pos.x, b.pos.z, 2); if (h) link(h, b); } }, spot(g, team, x, z) { const h = freeHost(g, team, 'twinbay', x, z); return h ? nearSpot(h, 'twinbay', x, z) : null; } },
  labbay: { added(g, b) { if (!hostOf(b)) { const h = freeHost(g, b.team, b.kind, b.pos.x, b.pos.z, 2); if (h) link(h, b); } }, spot(g, team, x, z) { const h = freeHost(g, team, 'labbay', x, z); return h ? nearSpot(h, 'labbay', x, z) : null; }, note: b => hostOf(b) ? `Bolted to the ${BLD[hostOf(b)!.kind].name}` : 'Not bolted to anything' },
  pumpjack: { tap: true },
  // A Depot sinks into the ground once it is up, so its own side walks over it. It comes up when an enemy body is close.
  depot: { walkOver: (_g, b, u) => u.team === b.team && !mem(b).raised && b.built, tick(g, b, dt) {
    const m = mem(b); if ((m.chk = (m.chk || 0) - dt) <= 0) { m.chk = .5; m.raised = !!nearest(g, { pos: b.pos, team: b.team }, DEPOT_UP + b.hx, o => !o.air) && !g.units.some(u => u.alive && u.team === b.team && !u.air && g.distToBox(b, u.pos.x, u.pos.z) < .3); }
    const want = m.raised ? 0 : -(b.h - .5); b.obj.position.y += (want - b.obj.position.y) * Math.min(1, dt * 3);
  } },
  dugout: { actions: () => dugActions(), note: b => `${usedOf(b)} of 4 inside` },
  flaktower: { tick(g, b, dt) {
    b.cd -= dt; if (b.cd > 0) return; const t = nearest(g, { pos: b.pos, team: b.team }, 13, o => !!o.air && seenBy(g, b.team, o)); if (!t) { b.cd = .25; return; }
    b.cd = .6; mem(b).aim = t; mem(b).aimT = g.time; const a = V3(b.pos.x, b.h, b.pos.z), e = V3(t.pos.x, UNIT[t.kind].bodyY + (t.alt || 0), t.pos.z); g.tracer(a, e, tracerMat, .1); if (g.vol(b.pos) > .05) sfx.turret(g.vol(b.pos) * .6); g.damage(t, 12 * g.gunMul(b.team), b);
  } },
  watchpost: { detect: (g, b) => g.upOf(b.team).spotlight ? 11 : 0 },
  mast: { actions: () => mastActions(), note: b => (mem(b).charges || 0) > 0 ? 'A Deep Charge is ready' : mem(b).chargeT > 0 ? `Deep Charge ready in ${Math.ceil(mem(b).chargeT)} s` : '' },
});

/** Every frame for each Ironhold building (host): crawling, refits, Survey Rig energy, Deep Charge building. */
function each(g: Game, b: Building, dt: number) {
  if (g.net || !b.built) return; const m = mem(b);
  if (m.crawl) tickCrawl(g, b, dt);
  if (m.form) tickRefit(g, b, dt);
  if (b.kind === 'surveyrig') m.energy = Math.min(TUNE.rig.max, (m.energy ?? TUNE.rig.start) + .7875 * dt);
  if (m.chargeT > 0) { m.chargeT -= dt; if (m.chargeT <= 0) { m.chargeT = 0; m.charges = 1; g.feed('Signal Mast', 'Deep Charge built. A Longshot can call it down.', 'in', b.team); } }
}

// ---------------------------------------------------------------- gates for research
/** Lab Bay research needs a Lab Bay bolted to a building of that kind; some levels need a building standing as well. */
function gate(g: Game, team: number, what: string): string {
  // A unit that needs a building beyond the one it trains at (the Patch, Longshot, Claim Barge), and a building that needs another first.
  const nb = I_NEEDS[what as IKind] as BKind | undefined; if (nb) return g.ownB(nb, true, team).length ? '' : BLD[nb].name;
  if (BLD[what as BKind]?.needs) { const m = g.missing(what as BKind, team); return m.length ? BLD[m[0]].name : ''; }
  const u = I_UPGRADES.find(x => x.key === what); if (!u) return '';
  if (u.lab && !g.ownB(u.at, true, team).some(hasLab)) return `Lab Bay on ${an(BLD[u.at].name)}`;
  for (const r of u.req || []) if (!g.ownB(r, true, team).length) return BLD[r].name;
  return '';
}
defineFaction(0, { each, gate, works: (_g, b) => mem(b).crawl ? 0 : 1, whySilent: (_g, b) => mem(b).crawl ? `The ${BLD[b.kind].name} is crawling on its skids.` : '' });
export { hasLab, hasTwin, energyOf, isHost, isAddon };
