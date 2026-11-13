// The Ironhold bot brain, the Quartermaster: what to build where, what to train and research, and every line the Ironhold say in the feed.
// The squad's playbooks, rallies and pushes are shared and stay in director.ts.
import { sfx } from '../../audio';
import type { Director, Side } from '../../director';
import { docOf } from '../../director';
import { Kind, BKind, UNIT, BLD, UPGRADES, TRAINS, UNIT_NEEDS, Building, MAP, SIDE, roadPt, foeOf, fac, endPt, homeXZ } from '../../data';
import { bldRule } from '../../core/registry';
import { costOf, sendToVent } from '../../core/econ';
import { isEnemy } from '../../core/sides';
import { isHidden, seenBy } from '../../core/sight';
import { mem } from './kit';
import { addonOf, hasLab, hasTwin, scan, fillDugout, crawl } from './bases';
import { I_TUNE as TUNE } from './numbers';
import { defineFaction } from '../../core/registry';
const LOOKOUT = ['Lookout', 'Watcher', 'Rootwatch'];

export const HINTS: [number, string, string][] = [
  [1.5, 'Quartermaster', 'Welcome to Dustbowl 7. Hold click on the green ore to drill, then walk the pack back to the Headframe. I\'ll handle the paperwork.'],
  [16, 'Quartermaster', 'Press 2 if you want to place buildings yourself. Press G to make me stop.'],
  [70, 'Lookout', 'Veyl outpost is at the end of the road. Three Choir Stones. They will come for us first.'],
  [125, 'Quartermaster', 'The map is dark until somebody walks it. There are more ore fields out there: find them, then stake a Headframe next to one (press 2) and it becomes a new base.'],
];
export const BOOKS = [
  { name: 'Yard Push', steps: ['Open', 'Muster', 'Push'], go: 'Pushing the east yard. Shoot the glowy bits.', label: 'Alpha pushes the east yard' },
  { name: 'Back Door', steps: ['Open', 'Muster', 'Flank'], go: 'Going the long way round. Nobody sneeze.', label: 'Alpha flanks the long way round' },
  { name: 'Last Shift', steps: ['Open', 'Muster', 'All in'], go: 'Everybody goes. Both roads. Leave nothing standing.', label: 'Everyone hits the last Stone' },
];
export const CHATTER = [
  'Anyone else\'s boots full of sand? Just me?', 'I was told there\'d be hazard pay.', 'If a Cantor sings at me again I\'m singing back.',
  'Quartermaster owes me nine ore. I counted.', 'That mesa looked at me funny.', 'My gun\'s clean. My record isn\'t.',
  'Do the purple ones have a union? Asking for me.', 'Somebody tell the boss we\'re bored.', 'I had a dream I was a Rigger. Woke up screaming.',
  'Three Stones. Three. I can count that high.', 'Whoever packed lunch packed bolts.', 'Wind\'s changing. Smells like ozone and overtime.',
];
export const KILL = ['Purple down!', 'That one\'s done singing.', 'Put it on my tab.', 'Got one. Counting it twice.', 'Scratch one choirboy.'];
export const DOWN = ['Man down! Not me. Yet.', 'We lost one. Deduct it from somebody else.', 'They got Kowalski. Again.', 'Medic! We don\'t have one! Medic anyway!'];
const DEPOT_SLOTS = [[-13, 9], [-13, -9], [-19, 0], [-22, 12], [-26, -6], [-20, 22]];
const POST_SLOTS_0 = [[31, 20], [9, -31], [33, 5], [-8, 26]];
/** Watchpost spots covering the road the raids walk down and the flank. Worked out from the map, so they face the Veyl on every map. */
function postSlots(knows = true): number[][] {
  if (!knows) return [[20, 18], [-18, -20], [22, -16], [-20, 16]];   // a ring round the base: with nobody found yet, no side is the front
  if ((MAP.like ?? MAP.base) === 0 && MAP.size === 0) return POST_SLOTS_0;
  const e = MAP.flank[MAP.flank.length - 1], el = Math.hypot(e[0], e[1]) || 1, r = (p: [number, number]) => [Math.round(p[0]), Math.round(p[1])];
  return [r(roadPt(31, 6)), [Math.round(e[0] / el * 30), Math.round(e[1] / el * 30)], r(roadPt(33, -9)), r(roadPt(-8, 12))];
}

/** What the Quartermaster leans toward this match, from the side's build plan: soldiers, machines or fliers. Every plan still makes some of
 *  everything once it can, so all fifteen kinds turn up; the lean sets the shares. */
type Lean = 'bio' | 'mech' | 'air';
const LEANS: Record<string, Lean> = { steady: 'bio', rush: 'bio', fort: 'mech', boom: 'air' };
/** Share of the army (by beds) the Quartermaster wants of each kind, by lean. */
const MIX: Record<Lean, Partial<Record<Kind, number>>> = {
  bio: { linesman: 10, breacher: 4, patch: 2, sapper: 1.5, longshot: 1.2, dustbike: 1.5, piledriver: 1.5, gantry: 1.2, flakkite: .8, gadfly: .8, surveyor: .5, hopper: .5, claimbarge: .8 },
  mech: { linesman: 5, breacher: 2, patch: 1, sapper: 1.5, longshot: .8, dustbike: 3, piledriver: 4, gantry: 3, flakkite: 1, gadfly: .8, surveyor: .6, hopper: .4, claimbarge: .8 },
  air: { linesman: 6, breacher: 2, patch: 1, sapper: 1, longshot: .8, dustbike: 1.5, piledriver: 1, gantry: 1, flakkite: 3, gadfly: 3, surveyor: 1, hopper: .8, claimbarge: 2 },
};
const WHERE: Partial<Record<Kind, BKind>> = { linesman: 'bunkhouse', breacher: 'bunkhouse', patch: 'bunkhouse', sapper: 'bunkhouse', longshot: 'bunkhouse', dustbike: 'machineshop', piledriver: 'machineshop', gantry: 'foundry', hopper: 'hangar', flakkite: 'hangar', gadfly: 'hangar', surveyor: 'hangar', claimbarge: 'hangar' };
const LINES: Partial<Record<BKind, string>> = {
  pumpjack: 'Pump Jack on the vent. Flux is extra, like everything else.', assay: 'Assay Office going up. Bigger guns for the foot soldiers, eventually.', machineshop: 'Machine Shop going in out back. Bikes first, big guns later.',
  foundry: 'Foundry going up. Walkers, and plate for anything with an engine.', hangar: 'Hangar going up. Anything that flies, we rent.', mast: 'Signal Mast going up. Head office wants to listen in.',
  annex: 'Head Office Annex. They sent a man with a clipboard. He is staying.', flaktower: 'Flak Tower going up. Things fly now. We shoot them.', dugout: 'Dugout going in at the front. Four seats, no windows.',
};

export function quartermaster(D: Director, dt: number, S: Side = D) {
  const g = D.g, T = S.team, U = g.upOf(T), [HX, HZ] = homeXZ(T), P = (x: number, z: number) => endPt(T, x, z, true); S.qmT -= dt; if (S.qmT > 0 || !S.auto) return; S.qmT = 1;
  const pays = (c: [number, number], extra = 0) => g.cash(T) >= c[0] + extra && g.flux(T) >= c[1];
  const own = (k: BKind) => g.ownB(k, false, T), up = (k: BKind) => g.ownB(k, true, T);
  const hqs = g.hqs(T), hq = hqs[0], bunk = own('bunkhouse'), bunkUp = up('bunkhouse'), sites = g.ownB(undefined, false, T).filter(b => !b.built);
  const free = g.supplyCap(T) - g.supplyUsed(T), army = g.army(T).length, posts = own('watchpost').length, building = sites.length > 0;
  const DOC = docOf(S), lean: Lean = LEANS[DOC.key] || 'bio', allow = (k: BKind) => !g.paper(T) || g.paper(T)!.allow.includes(k);
  // The planned spot can be taken: the player may have built there, or a fallen tower left rubble. Then the nearest free ground will do.
  const put = (k: BKind, x: number, z: number, line: string, world = false) => { if (!pays(costOf(k)) || !allow(k) || g.gated(T, k)) return false; if (!world) [x, z] = P(x, z); const at = D.freeSpot(k, x, z, T); if (!at) return false; g.place(k, at[0], at[1], false, T); D.say('Quartermaster', line, '', T); return true; };
  const spot = (k: BKind, slots: number[][], line: string, world = false) => { const at = (p: number[]): [number, number] => world ? [p[0], p[1]] : P(p[0], p[1]), sl = slots.find(p => g.canPlace(k, ...at(p), false, T)) || slots[0]; return put(k, sl[0], sl[1], line, world); };
  const buy = (key: string) => { const u = UPGRADES.find(x => x.key === key)!; return !U[u.key] && up(u.at).length && (!u.needs || U[u.needs]) && !g.gated(T, key) && pays(costOf(u.key)) && g.buyUpgrade(u.key, T); };
  const spare = (keys: string[]) => { for (const k of keys) { const u = UPGRADES.find(x => x.key === k); if (u && !U[u.key] && up(u.at).length && (!u.needs || U[u.needs]) && !g.gated(T, k) && pays(costOf(u.key), 120)) return g.buyUpgrade(u.key, T); } return false; };
  const bolt = (host: Building | undefined, k: 'labbay' | 'twinbay') => !!host && !addonOf(host) && pays(costOf(k)) && g.buildingAction(host, k);
  const DOC_T = DOC.tech, wantPosts = Math.max(0, (army >= 3 || (g.eco && g.human[foeOf(T)]) ? 1 + (D.raidN >= 2 ? 1 : 0) + (D.raidN >= 4 ? 1 : 0) : 0) + DOC.towers);
  // One goal at a time, in priority order. While a goal is unpaid, training holds back a reserve so the goal gets bought.
  let saving = true, hold: [number, number] = [95, 0];
  const exp = D.expansion(g.hqs(T, false), T), homeLeft = g.ores.filter(n => Math.hypot(n.pos.x - HX, n.pos.z - HZ) < 40).reduce((a, n) => [a[0] + n.amount, a[1] + n.max], [0, 0]);
  const wantHF = Math.min((MAP.sites || []).length + 1, 1 + (g.time > DOC.expT || homeLeft[0] < homeLeft[1] * .5 ? 1 : 0) + (g.time > 960 ? 1 : 0) + (g.time > 1440 ? 1 : 0));
  const jacks = own('pumpjack'), vent = g.vents.filter(v => !(v.tap && v.tap.alive) && v.amount > 0 && hqs.some(h => Math.hypot(h.pos.x - v.pos.x, h.pos.z - v.pos.z) < 40) && g.canPlace('pumpjack', v.pos.x, v.pos.z, false, T)).sort((a, b) => Math.hypot(a.pos.x - HX, a.pos.z - HZ) - Math.hypot(b.pos.x - HX, b.pos.z - HZ))[0];
  const wantJacks = Math.min(2 * hqs.length, (bunk.length ? 1 : 0) + (g.time > 600 ? 1 : 0) + (g.time > 840 ? 1 : 0) + (g.time > 1000 ? 1 : 0));
  const shop = own('machineshop'), shopUp = up('machineshop'), lab = own('assay'), labUp = up('assay'), fdy = own('foundry'), fdyUp = up('foundry'), hang = own('hangar'), hangUp = up('hangar'), mast = own('mast'), mastUp = up('mast'), annex = own('annex');
  const hostNoAddon = (bs: Building[]) => bs.find(b => b.built && !addonOf(b) && !mem(b).crawl);
  const air = lean === 'air', mech = lean === 'mech', foeAir = g.units.some(o => o.alive && o.air && isEnemy(T, o.team) && seenBy(g, T, o));
  const hidden = g.units.find(o => o.alive && isEnemy(T, o.team) && isHidden(o) && g.units.some(m => m.alive && m.team === T && Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z) < 25));
  if (hidden) mem(S).hidT = g.time;
  const flak = own('flaktower').length, wantFlak = (foeAir || (mem(S).hidT && g.time - mem(S).hidT < 300) ? 1 : 0) + (foeAir && army >= 10 ? 1 : 0) + (DOC.key === 'fort' ? 1 : 0);
  if (!bunk.length) put('bunkhouse', 15, 8, 'Staking out a Bunkhouse. Then we get rich.');
  else if (free <= 3 && !sites.some(b => b.kind === 'depot') && own('depot').length < 24 && g.supplyCap(T) < 200) spot('depot', DEPOT_SLOTS, 'Running out of beds. Stacking another Depot.');
  else if (building && sites.length >= 2) saving = false;
  else if (vent && jacks.length < wantJacks && g.own('rigger', T).length >= 10 + jacks.length * 2 && (army >= 6 || g.time > 420)) { hold = costOf('pumpjack'); if (pays(hold)) { g.place('pumpjack', vent.pos.x, vent.pos.z, false, T); D.say('Quartermaster', LINES.pumpjack!, '', T); } }
  // A side playing for ore stakes its second Headframe before anything else.
  else if (DOC.key === 'boom' && bunkUp.length && exp.site && hqs.length < Math.min(2, wantHF)) { hold = costOf('headframe'); const [sx, sz] = exp.site, dx = sx - HX, dz = sz - HZ, l = Math.hypot(dx, dz) || 1; put('headframe', Math.round(sx - dx / l * 11), Math.round(sz - dz / l * 11), 'Staking a second Headframe early. Ore first, soldiers later.', true); }
  else if (bunkUp.length && posts < Math.min(1, wantPosts)) spot('watchpost', postSlots(g.intel.knows(T)), g.intel.knows(T) ? `Putting a Watchpost on the ${MAP.road}. For my nerves.` : 'Putting a Watchpost up. I do not know which way to point it, so it points at everything.');
  else if (bunkUp.length && hq && hq.kind === 'headframe' && hq.built && !hq.queue.length && !mem(hq).form && g.time > 480 && army >= 8 && pays(costOf(DOC.key === 'fort' ? 'bastion' : 'surveyrig'), 50)) g.buildingAction(hq, DOC.key === 'fort' ? 'bastion' : 'surveyrig');
  else if (bunkUp.length && army >= 7 && jacks.some(j => j.built) && !bunkUp.some(hasLab) && hostNoAddon(bunkUp)) { hold = costOf('labbay'); bolt(hostNoAddon(bunkUp), 'labbay'); }
  else if (bunkUp.length === 1 && bunk.length === 1 && g.time > DOC.prodT) put('bunkhouse', 4, 23, 'Second Bunkhouse. Twice the complaints.');
  else if (bunkUp.length && !lab.length && army >= 6 + DOC_T) spot('assay', [[-15, 6], [15, -17], [-16, 18], [14, 22]], LINES.assay!);
  else if (bunkUp.length && !shop.length && army >= 8 + DOC_T - (mech ? 2 : 0)) { hold = costOf('machineshop'); put('machineshop', 0, -15, LINES.machineshop!); }
  else if (bunkUp.length && posts < wantPosts) spot('watchpost', postSlots(g.intel.knows(T)), 'Another Watchpost. I sleep better with crossfire.');
  else if (labUp.length && flak < wantFlak) spot('flaktower', [[8, -10], [-10, 10], [12, 12], [-12, -12]], LINES.flaktower!);
  else if (labUp.length && !U.dmg && army >= 5) { hold = costOf('dmg'); buy('dmg'); }
  // Expanding: a new Headframe on the nearest free ore field once the home seams thin out or the shift runs long, and a Watchpost to mind it.
  else if (bunkUp.length && army >= Math.max(1, 6 + DOC.expArmy) && exp.site && hqs.length < wantHF) { hold = costOf('headframe'); const [sx, sz] = exp.site, dx = sx - HX, dz = sz - HZ, l = Math.hypot(dx, dz) || 1; put('headframe', Math.round(sx - dx / l * 11), Math.round(sz - dz / l * 11), 'Staking a new Headframe out on the far seam. Somebody walk the Riggers over.', true); }
  else if (exp.bare) { const [bx, bz] = exp.bare, rx = bx - HX, rz = bz - HZ, l = Math.hypot(rx, rz) || 1; spot('watchpost', [[Math.round(bx - rz / l * 9), Math.round(bz + rx / l * 9)], [Math.round(bx + rz / l * 9), Math.round(bz - rx / l * 9)]], 'Watchpost by the new Headframe. Out there it gets lonely.', true); }
  else if (shopUp.length && !shopUp.some(hasLab) && hostNoAddon(shopUp) && army >= 6) { hold = costOf('labbay'); bolt(hostNoAddon(shopUp), 'labbay'); }
  else if (shopUp.length && !hang.length && (army >= (air ? 6 : 9) + DOC_T || g.time > 660)) { hold = costOf('hangar'); spot('hangar', [[-16, 18], [14, 22], [-24, -4], [24, -6]], LINES.hangar!); }
  else if (shopUp.length && !fdy.length && (army >= (mech ? 6 : 9) + DOC_T || g.time > 720)) { hold = costOf('foundry'); spot('foundry', [[-14, -14], [-15, 6], [15, -17], [-4, -28]], LINES.foundry!); }
  else if (labUp.length && !U.armor && army >= 6) { hold = costOf('armor'); buy('armor'); }
  else if (hangUp.length && !hangUp.some(hasLab) && hostNoAddon(hangUp) && army >= 8) { hold = costOf('labbay'); bolt(hostNoAddon(hangUp), 'labbay'); }
  else if (labUp.length && !mast.length && army >= 9 + DOC_T && allow('mast')) { hold = costOf('mast'); spot('mast', [[15, -17], [-4, -28], [-16, 18], [-24, -4], [14, 22]], LINES.mast!); }
  else if (bunkUp.length >= 2 && hostNoAddon(bunkUp) && army >= 8) { hold = costOf('twinbay'); bolt(hostNoAddon(bunkUp), 'twinbay'); }
  else if (fdyUp.length && !U.mdmg && army >= 9) { hold = costOf('mdmg'); buy('mdmg'); }
  else if (fdyUp.length && !U.marm && army >= 10) { hold = costOf('marm'); buy('marm'); }
  else if (hangUp.length && !annex.length && army >= 12 && g.time > 840) { hold = costOf('annex'); spot('annex', [[-24, -4], [24, -6], [-4, -28], [14, 22]], LINES.annex!); }
  else if (mastUp.length && !U.dmg2 && army >= 10) { hold = costOf('dmg2'); buy('dmg2'); }
  else if (mastUp.length && !U.armor2 && army >= 11) { hold = costOf('armor2'); buy('armor2'); }
  else if (DOC.key === 'fort' && bunkUp.length && !own('dugout').length && army >= 6) spot('dugout', postSlots(g.intel.knows(T)).map(p => [p[0] * .8, p[1] * .8]), LINES.dugout!);
  else if (mastUp.length && g.own('longshot', T).length && !mastUp.some(m => mem(m).charges || mem(m).chargeT > 0) && pays(costOf('mast'), 150)) g.buildingAction(mastUp[0], 'charge');
  else if (army >= 10 && g.cash(T) > 250 && spare(['drill', 'overtime', 'hobble', 'kitbelt', 'pay', 'hotspout', 'quickanchor', 'minedrill', 'stitch', 'smoke', 'ghillie', 'foreclose', 'relocate', 'sdmg', 'mdmg2', 'marm2', 'dmg3', 'armor3', 'servo', 'battery', 'rotors', 'post', 'spotlight', 'glass', 'buckets', 'frag', 'weld', 'sdmg2', 'mdmg3', 'marm3', 'sdmg3'])) saving = true;
  else saving = false;

  if (hold[1] > g.flux(T) && !own('pumpjack').some(j => j.built)) saving = false;
  // Riggers: eight for the home yard and six more for each new base, three more for each Pump Jack, trained at whichever home building is shortest of hands.
  const rigs = g.own('rigger', T), tapped = jacks.filter(j => j.built);
  if (rigs.length < Math.min(34, 9 + DOC.crew + 5 * (hqs.length - 1) + 3 * tapped.length) && free > 0 && pays(costOf('rigger')) && (bunk.length || rigs.length < 6)) {
    const crew = (h: Building) => rigs.filter(u => g.nearHQ((u.node || u).pos.x, (u.node || u).pos.z, T) === h).length + h.queue.length;
    const h = hqs.filter(b => !b.queue.length && !mem(b).form && crew(b) < (b === hq ? 9 + DOC.crew : 6) + 3 * tapped.filter(j => g.nearHQ(j.pos.x, j.pos.z, T) === b).length).sort((a, b) => crew(a) - crew(b))[0]; if (h) g.train(h, 'rigger');
  }
  // Three Riggers on each finished Pump Jack.
  // Fewer on the pumps while Flux piles up unspent: a full tank sends one back to the ore.
  const crewN = g.flux(T) > 900 ? 1 : g.flux(T) > 500 ? 2 : 3;
  for (const j of tapped) { const v = g.vents.find(x => x.tap === j); if (!v || v.amount <= 0) continue; const on = rigs.filter(u => u.vent === v); if (on.length > crewN) sendToVent(g, on[0], null); if (on.length < crewN) { const r = rigs.filter(u => !u.vent && u.state !== 'build' && !u.site && !u.pilot && u !== g.me && u.carrying === 0).sort((a, b) => a.pos.distanceTo(j.pos) - b.pos.distanceTo(j.pos))[0]; if (r) sendToVent(g, r, v); } }
  // Survey Rigs: Haul Drones whenever there is energy to spare, a scan on anything unseen bothering us.
  for (const r of up('surveyrig')) { const e = mem(r).energy ?? 0; if (hidden && e >= TUNE.rig.scan && !g.units.some(o => o.alive && o.team === T && UNIT[o.kind].detect && Math.hypot(o.pos.x - hidden.pos.x, o.pos.z - hidden.pos.z) < 12)) { g.buildingAction(r, 'scan'); scan(g, r, hidden.pos.x, hidden.pos.z); mem(r).energy += 0; } else if (e >= TUNE.rig.drone + TUNE.rig.scan && g.own('hauldrone' as Kind, T).length < hqs.length) g.buildingAction(r, 'drone'); }
  // Dugouts fill up when the enemy comes close.
  for (const d of up('dugout')) if (g.units.some(o => o.alive && isEnemy(T, o.team) && !o.air && g.distToBox(d, o.pos.x, o.pos.z) < 24)) fillDugout(g, d, 16);
  // A spare Bunkhouse crawls out to a new base that has none, once.
  if (!mem(S).crawled && bunkUp.length >= 2) { const far = hqs.find(h => Math.hypot(h.pos.x - HX, h.pos.z - HZ) > 30 && !bunk.some(b => Math.hypot(b.pos.x - h.pos.x, b.pos.z - h.pos.z) < 26)); const b = bunkUp.find(x => !x.queue.length && !mem(x).crawl); if (far && b) { const dx = HX - far.pos.x, dz = HZ - far.pos.z, l = Math.hypot(dx, dz) || 1; if (crawl(g, b, far.pos.x + dx / l * 14, far.pos.z + dz / l * 14)) { mem(S).crawled = true; D.say('Quartermaster', 'Packing a Bunkhouse onto skids and dragging it out to the new Headframe.', '', T); } } }

  // Training: whichever kind the army is shortest of, against the lean's shares, at a building that can make it now.
  const reserve = saving ? hold : [0, 0] as [number, number], mix = MIX[lean], have: Partial<Record<Kind, number>> = {};
  for (const u of g.army(T)) { const k = (u.kind === 'piledriverset' ? 'piledriver' : u.kind === 'flakwalker' ? 'flakkite' : u.kind === 'gantryflak' ? 'gantry' : u.kind) as Kind; have[k] = (have[k] || 0) + UNIT[k].supply; }
  for (const b of g.ownB(undefined, true, T)) for (const q of b.queue) have[q.kind] = (have[q.kind] || 0) + UNIT[q.kind].supply;
  const total = Object.values(have).reduce((a, n) => a + n!, 0) + 1, wsum = Object.values(mix).reduce((a, n) => a + n!, 0);
  // Fliers are wanted at all only against fliers, or for an air lean, or late; detectors once something unseen has shown up.
  const want = (k: Kind) => { let w = (mix[k] || 0) / wsum; if (k === 'flakkite' && foeAir) w *= 3; if (k === 'surveyor' && mem(S).hidT) w = Math.max(w, .06); if (k === 'hopper' && army < 10) w = 0; if (k === 'claimbarge' && army < 14) w = 0; return w; };
  const hosts = [...bunkUp, ...shopUp, ...fdyUp, ...hangUp].filter(b => b.queue.length < (hasTwin(b) ? 3 : 2) && !mem(b).crawl);
  const optsOf = (b: Building) => (TRAINS[b.kind] || []).filter(k => !g.gated(T, k) && !bldRule(b.kind).trains?.(g, b, k) && (!UNIT_NEEDS[k] || g.ownB(UNIT_NEEDS[k]!, true, T).length) && free >= UNIT[k].supply);
  const gapOf = (k: Kind) => (have[k] || 0) / total - want(k), best = (ks: Kind[]) => ks.filter(k => want(k) > 0).sort((a, c) => gapOf(a) - gapOf(c))[0];
  for (let n = 0; n < 6; n++) {
    // The kind the army is shortest of, wherever it can be made; a host that cannot make it only spends what is left over after it.
    const top = best(hosts.flatMap(optsOf)); let done = false;
    for (const b of hosts.filter(b => b.queue.length < (hasTwin(b) ? 3 : 2)).sort((a, c) => +optsOf(c).includes(top!) - +optsOf(a).includes(top!))) {
      const opts = optsOf(b), pick = best(opts) || (opts.includes('linesman') ? 'linesman' : null); if (!pick) continue;
      const c = costOf(pick), extra = top && pick !== top ? costOf(top) : [0, 0];
      if (pays(c, reserve[0] + extra[0]) && (!c[1] || g.flux(T) >= c[1] + reserve[1] + extra[1])) { g.train(b, pick); have[pick] = (have[pick] || 0) + UNIT[pick].supply; done = true; break; }
    }
    if (!done) break;
  }
}
/** The first of each kind says who it is and which keys it uses. */
const FIRST: Partial<Record<string, [string, string]>> = {
  linesman: ['Quartermaster', 'First Linesman on the payroll. Look at them and press F to jump in, or hold Tab.'],
  breacher: ['Breacher', 'Shield is heavy. Hold right-click to hide behind it, click to fire. Good against anything with plate.'],
  patch: ['Patch', 'Patch on shift. I mend whoever is closest to dying. As me, C tops everyone up and T numbs one friend.'],
  sapper: ['Sapper', 'Sapper here. C digs in a mine where you look. T sticks a satchel on a building. Stand well back.'],
  longshot: ['Longshot', 'Longshot reporting. Right-click for the scope. C to hide in the grass, T to put one to sleep, Y to call in a Deep Charge.'],
  dustbike: ['Dustbike', 'Dustbike fuelled. Click to spray fire, T to kick it into a sprint. Bad against plate, great against everyone else.'],
  piledriver: ['Pile Driver', 'Pile Driver rolling. C drives the stakes in and the big gun reaches far. C again to pull them out.'],
  gantry: ['Gantry', 'Walker online. Click fires the cannons, C stomps, T swaps to flak for fliers. Jump in, the seat is warm.'],
  hopper: ['Hopper', 'Hopper fuelled. Right-click opens the doors: friends close by climb in, and right-click again lets them out. C burns hard.'],
  flakkite: ['Flak Kite', 'Flak Kite up. Kills fliers. C lands it on legs to shoot things on the ground.'],
  gadfly: ['Gadfly', 'Gadfly up. Shoots the ground from the air. With Smoke Cloak, C hides it while the battery lasts.'],
  surveyor: ['Surveyor', 'Surveyor up. It sees hidden things. C drops a gun turret, T jams a machine, Y fires a flare that blinds.'],
  claimbarge: ['Claim Barge', 'Claim Barge on station. Slow and very heavy. C fires one huge shell, T moves the whole barge somewhere we can see.'],
  hauldrone: ['Quartermaster', 'Haul Drone landed. It digs twice as fast, then goes home in about a minute.'],
};
/** The first of each building says what it is for. */
const OPENED: Partial<Record<string, string>> = {
  machineshop: 'Machine Shop is open. Dustbikes now. Bolt a Lab Bay on for Pile Drivers.',
  pumpjack: 'Pump Jack is pumping. Three Riggers on it carry Flux home.',
  labbay: 'Lab Bay is bolted on. That building trains the better kinds now, and does its research.',
  twinbay: 'Twin Bay is bolted on. That building trains two at once now.',
  assay: 'Assay Office is open. Infantry guns and plate. Patches can train now.',
  flaktower: 'Flak Tower is up. It shoots fliers and sees hidden things near it.',
  foundry: 'Foundry is open. Gantry walkers, and guns and plate for the machines.',
  hangar: 'Hangar is open. Hoppers and Flak Kites now. Bolt a Lab Bay on for the rest.',
  mast: 'Signal Mast is up. Longshots can train, and it builds Deep Charges.',
  annex: 'Head Office Annex is open. Claim Barges, and the research that makes them mean.',
  dugout: 'Dugout is dug. Four Linesmen fit inside and shoot out. It sells back if we move on.',
  surveyrig: 'The Headframe is a Survey Rig now. It calls Haul Drones and scans for hidden things.',
  bastion: 'The Headframe is a Bastion now. Thick walls and a big gun on the roof.',
};

/** What the Ironhold say about the Gloam. */
export const IKILL_G = ['Bug down!', 'Squashed one.', 'That one is fertiliser.', 'Put it on my tab. Legs and all.', 'Got one. Smells awful.'];
export const ICHATTER_G = ['Anyone else itchy? Just me?', 'Those mushrooms are looking at me.', 'I stepped in the green stuff again.', 'How many legs is too many legs? I say four.', 'Quartermaster says the carpet is not contagious. Quartermaster is a liar.'];

defineFaction(0, {
  brain: (D, dt, S) => quartermaster(D, dt, S), hints: HINTS, books: BOOKS,
  chatter: foe => foe === 2 && Math.random() < .5 ? ICHATTER_G : CHATTER,
  lines: (kind, foe) => kind === 'kill' ? (foe === 2 ? IKILL_G : KILL) : DOWN,
  trained(D, u) {
    const f = FIRST[u.kind]; if (!f || D.flags['first_' + u.kind]) return; D.flags['first_' + u.kind] = true; D.say(f[0], f[1], 'in', u.team); sfx.callout();
  },
  built(D, b) {
    if (b.kind === 'bunkhouse' && !D.flags.bunk) { D.flags.bunk = true; D.say('Quartermaster', 'Bunkhouse is up. Look at the door and press E for a Linesman.', 'in', b.team); return; }
    if (b.kind === 'watchpost') { D.say('Lookout', 'Watchpost manned. By a gun. The gun is the man.', '', b.team); return; }
    const l = OPENED[b.kind]; if (l && !D.flags['built_' + b.kind]) { D.flags['built_' + b.kind] = true; D.say('Quartermaster', l, 'in', b.team); }
  },
  lost(D, b, left) {
    const g = D.g;
    if (g.eco) {
      if (b.kind === 'headframe' && left) D.say(LOOKOUT[fac(foeOf(b.team))], `A Headframe is down. ${left} still standing.`, 'in', foeOf(b.team));
      if (b.kind !== 'headframe') D.say('Quartermaster', `We lost the ${BLD[b.kind].name}. That\'s coming out of somebody\'s pay.`, 'al', b.team);
      return;
    }
    if (b.team === 0 && b.kind !== 'headframe') D.say('Quartermaster', `We lost the ${BLD[b.kind].name}. That\'s coming out of somebody\'s pay.`, 'al', SIDE.home);
  },
});
