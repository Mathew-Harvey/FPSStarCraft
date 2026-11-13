// The Ironhold bot brain, the Quartermaster: what to build where, what to train and research, and every line the Ironhold say in the feed.
// The squad's playbooks, rallies and pushes are shared and stay in director.ts.
import { sfx } from '../../audio';
import type { Director, Side } from '../../director';
import { docOf } from '../../director';
import { Kind, BKind, UNIT, BLD, UPGRADES, Building, MAP, SIDE, roadPt, foeOf, fac, endPt, homeXZ } from '../../data';
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

export function quartermaster(D: Director, dt: number, S: Side = D) {
  const g = D.g, T = S.team, U = g.upOf(T), [HX, HZ] = homeXZ(T), P = (x: number, z: number) => endPt(T, x, z, true), cash = () => g.cash(T); S.qmT -= dt; if (S.qmT > 0 || !S.auto) return; S.qmT = 1;
  const hq = g.ownB('headframe', true, T)[0], bunk = g.ownB('bunkhouse', false, T), bunkUp = bunk.filter(b => b.built), sites = g.ownB(undefined, false, T).filter(b => !b.built), shop = g.ownB('machineshop', false, T), shopUp = shop.some(b => b.built);
  const free = g.supplyCap(T) - g.supplyUsed(T), army = g.army(T).length, posts = g.ownB('watchpost', false, T).length, building = sites.length > 0;
  const wantDepot = bunk.length > 0 && free <= 3 && !sites.some(b => b.kind === 'depot') && g.ownB('depot', false, T).length < 6;
  // The planned spot can be taken: the player may have built there, or a fallen tower left rubble. Then the nearest free ground will do.
  const put = (k: BKind, x: number, z: number, line: string, world = false) => { if (cash() < BLD[k].cost || (g.paper(T) && !g.paper(T)!.allow.includes(k))) return false; if (!world) [x, z] = P(x, z); const at = D.freeSpot(k, x, z, T); if (!at) return false; g.place(k, at[0], at[1], false, T); D.say('Quartermaster', line, '', T); return true; };
  const DOC = docOf(S), wantPosts = Math.max(0, (army >= 3 || (g.eco && g.human[foeOf(T)]) ? 1 + (D.raidN >= 2 ? 1 : 0) + (D.raidN >= 4 ? 1 : 0) : 0) + DOC.towers);
  // One goal at a time, in priority order. While a goal is unpaid, training holds back a reserve so the goal gets bought.
  let saving = true, hold = 95;
  const hfs = g.ownB('headframe', false, T), exp = D.expansion(hfs, T);
  const homeLeft = g.ores.filter(n => Math.hypot(n.pos.x - HX, n.pos.z - HZ) < 40).reduce((a, n) => [a[0] + n.amount, a[1] + n.max], [0, 0]);
  const wantHF = Math.min((MAP.sites || []).length + 1, 1 + (g.time > DOC.expT || homeLeft[0] < homeLeft[1] * .5 ? 1 : 0) + (g.time > 960 ? 1 : 0) + (g.time > 1440 ? 1 : 0)); const fdy = g.ownB('foundry', false, T), fdyB = fdy.find(b => b.built), lab = g.ownB('assay', false, T), labUp = lab.some(b => b.built), mast = g.ownB('mast', false, T), mastUp = mast.some(b => b.built);
  const spot = (k: BKind, slots: number[][], line: string, world = false) => { const at = (p: number[]): [number, number] => world ? [p[0], p[1]] : P(p[0], p[1]), sl = slots.find(p => g.canPlace(k, ...at(p), false, T)) || slots[0]; return put(k, sl[0], sl[1], line, world); };
  // research the yard can afford without starving the big purchases: bought when there is ore to spare
  const spare = (keys: string[]) => { for (const k of keys) { const u = UPGRADES.find(x => x.key === k)!; if (!U[u.key] && g.ownB(u.at, true, T).length && (!u.needs || U[u.needs]) && cash() >= u.cost + 120) return g.buyUpgrade(u.key, T); } return false; };
  if (!bunk.length) put('bunkhouse', 15, 8, 'Staking out a Bunkhouse. Then we get rich.');
  else if (wantDepot) spot('depot', DEPOT_SLOTS, 'Running out of beds. Stacking another Depot.');
  else if (building) saving = false;
  // A side playing for ore stakes its second Headframe before anything else.
  else if (DOC.key === 'boom' && bunkUp.length && exp.site && hfs.length < Math.min(2, wantHF)) { hold = BLD.headframe.cost; const [sx, sz] = exp.site, dx = sx - HX, dz = sz - HZ, l = Math.hypot(dx, dz) || 1; put('headframe', Math.round(sx - dx / l * 11), Math.round(sz - dz / l * 11), 'Staking a second Headframe early. Ore first, soldiers later.', true); }
  else if (bunkUp.length && posts < Math.min(1, wantPosts)) spot('watchpost', postSlots(g.intel.knows(T)), g.intel.knows(T) ? `Putting a Watchpost on the ${MAP.road}. For my nerves.` : 'Putting a Watchpost up. I do not know which way to point it, so it points at everything.');
  else if (bunkUp.length && !shop.length && army >= 4 + DOC.tech) put('machineshop', 0, -15, 'Machine Shop going in out back. Bigger guns, thicker hats.');
  else if (bunkUp.length && posts < wantPosts) spot('watchpost', postSlots(g.intel.knows(T)), 'Another Watchpost. I sleep better with crossfire.');
  else if (shopUp && !U.dmg && army >= 5) g.buyUpgrade('dmg', T);
  // Expanding: a new Headframe on the nearest free ore field once the home seams thin out or the shift runs long, and a Watchpost to mind it.
  else if (bunkUp.length && army >= Math.max(1, 6 + DOC.expArmy) && exp.site && hfs.length < wantHF) { hold = BLD.headframe.cost; const [sx, sz] = exp.site, dx = sx - HX, dz = sz - HZ, l = Math.hypot(dx, dz) || 1; put('headframe', Math.round(sx - dx / l * 11), Math.round(sz - dz / l * 11), 'Staking a new Headframe out on the far seam. Somebody walk the Riggers over.', true); }
  else if (exp.bare) { const [bx, bz] = exp.bare, rx = bx - HX, rz = bz - HZ, l = Math.hypot(rx, rz) || 1; spot('watchpost', [[Math.round(bx - rz / l * 9), Math.round(bz + rx / l * 9)], [Math.round(bx + rz / l * 9), Math.round(bz - rx / l * 9)]], 'Watchpost by the new Headframe. Out there it gets lonely.', true); }
  else if (shopUp && U.dmg && !fdy.length && army >= 7 + DOC.tech) { hold = 150; spot('foundry', [[-14, -14], [-15, 6], [15, -17], [-4, -28]], 'Foundry going up. Walkers, and the good plating.'); }
  else if (fdyB && army >= 6 && free >= 4 && g.own('gantry', T).length + fdyB.queue.length < (g.time > 660 ? 2 : 1)) { hold = UNIT.gantry.cost; if (cash() >= hold) g.train(fdyB, 'gantry'); }
  else if (fdyB && !lab.length && army >= 6 && (!g.paper(T) || g.paper(T)!.allow.includes('assay'))) spot('assay', [[-15, 6], [15, -17], [-16, 18], [14, 22]], 'Assay Office going up. Longshots, and people who read.');
  else if (bunkUp.length === 1 && bunk.length === 1 && g.time > DOC.prodT) put('bunkhouse', 4, 23, 'Second Bunkhouse. Twice the complaints.');
  else if (shopUp && !U.armor && army >= 6) g.buyUpgrade('armor', T);
  else if (fdyB && !U.dmg2 && army >= 9) { hold = 150; g.buyUpgrade('dmg2', T); }
  else if (fdyB && !U.armor2 && army >= 10) { hold = 150; g.buyUpgrade('armor2', T); }
  else if (fdyB && labUp && !mast.length && U.dmg2 && army >= 10 && (!g.paper(T) || g.paper(T)!.allow.includes('mast'))) { hold = 200; spot('mast', [[15, -17], [-4, -28], [-16, 18], [-24, -4], [14, 22]], 'Signal Mast going up. Head office wants to listen in, and they pay in kit.'); }
  else if (mastUp && !U.dmg3 && army >= 10) { hold = 200; g.buyUpgrade('dmg3', T); }
  else if (mastUp && !U.armor3 && army >= 11) { hold = 200; g.buyUpgrade('armor3', T); }
  else if (spare(['drill', 'post', 'pay', 'stitch', 'glass', 'beds', 'servo', 'weld', 'buckets', 'frag'])) saving = true;
  else saving = false;
  // Riggers: eight for the home yard and six more for each new base, trained at whichever Headframe is shortest of hands.
  const rigs = g.own('rigger', T), hqs = g.ownB('headframe', true, T);
  if (rigs.length < 8 + DOC.crew + 6 * (hqs.length - 1) && free > 0 && cash() >= 50 && (bunk.length || rigs.length < 6)) {
    const crew = (h: Building) => rigs.filter(u => g.nearHQ((u.node || u).pos.x, (u.node || u).pos.z, T) === h).length + h.queue.length;
    const h = hqs.filter(b => !b.queue.length && crew(b) < (b === hq ? 8 + DOC.crew : 6)).sort((a, b) => crew(a) - crew(b))[0]; if (h) g.train(h, 'rigger');
  }
  const heavy = g.own('breacher', T).length, light = g.own('linesman', T).length;
  const docs = g.own('patch', T).length, longs = g.own('longshot', T).length;
  for (const b of bunkUp) if (b.queue.length < 2) {
    const q = (k: Kind) => b.queue.filter(x => x.kind === k).length;
    const k: Kind = labUp && light >= 4 && longs + q('longshot') < Math.floor(light / 4) && free >= 2 ? 'longshot' : shopUp && army >= 5 && docs + q('patch') < 1 + Math.floor(army / 10) ? 'patch' : shopUp && heavy + q('breacher') < Math.floor(light / 3) && free >= 2 ? 'breacher' : 'linesman';
    if (cash() >= UNIT[k].cost + (saving ? hold : 0)) g.train(b, k);
  }
}
/** What the Ironhold say about the Gloam. */
export const IKILL_G = ['Bug down!', 'Squashed one.', 'That one is fertiliser.', 'Put it on my tab. Legs and all.', 'Got one. Smells awful.'];
export const ICHATTER_G = ['Anyone else itchy? Just me?', 'Those mushrooms are looking at me.', 'I stepped in the green stuff again.', 'How many legs is too many legs? I say four.', 'Quartermaster says the carpet is not contagious. Quartermaster is a liar.'];

defineFaction(0, {
  brain: (D, dt, S) => quartermaster(D, dt, S), hints: HINTS, books: BOOKS,
  chatter: foe => foe === 2 && Math.random() < .5 ? ICHATTER_G : CHATTER,
  lines: (kind, foe) => kind === 'kill' ? (foe === 2 ? IKILL_G : KILL) : DOWN,
  trained(D, u) {
    if (u.kind === 'linesman' && !D.flags.line) { D.flags.line = true; D.say('Quartermaster', 'First Linesman on the payroll. Look at them and press F to jump in, or hold Tab.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'longshot' && !D.flags.long) { D.flags.long = true; D.say('Longshot', 'Longshot reporting. Hold right-click for the scope. One shot, then find a new hill.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'patch' && !D.flags.patch) { D.flags.patch = true; D.say('Patch', 'Patch on shift. I mend whoever is closest to dying. As me, press C to top everyone up.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'gantry' && !D.flags.gantry) { D.flags.gantry = true; D.say('Gantry', 'Walker online. Click fires the cannons, C stomps. Jump in, the seat is warm.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'breacher' && !D.flags.breach) { D.flags.breach = true; D.say('Breacher', 'Shield\'s heavy. Hold right-click to hide behind it, click to bash.', 'in', u.team); sfx.callout(); }
  },
  built(D, b) {
    if (b.kind === 'bunkhouse' && !D.flags.bunk) { D.flags.bunk = true; D.say('Quartermaster', 'Bunkhouse is up. Look at the door and press E for a Linesman.', 'in', b.team); }
    else if (b.kind === 'machineshop') D.say('Quartermaster', 'Machine Shop\'s open. Breachers at the Bunkhouse, upgrades at the bench.', 'in', b.team);
    else if (b.kind === 'watchpost') D.say('Lookout', 'Watchpost manned. By a gun. The gun is the man.', '', b.team);
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
