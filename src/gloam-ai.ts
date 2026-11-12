// The Gloam's economy brain, the Overgrowth: what to root next, what to grow, and how many mouths to feed.
// It mirrors the Quartermaster and the Conductor, with the Gloam's own rules: every building costs a Grazer,
// every unit costs a Bud, and buildings only grow on Bloom.
import type { Director, Side } from './director';
import { BLD, UNIT, UPGRADES, Kind, BKind, Building, MAP, veylPt, endPt, homeXZ, foeOf } from './data';
export const GHINTS: [number, string, string][] = [
  [1.5, 'Overgrowth', 'The Gloam stir. Hold click on the green ore to chew it loose, then carry it in your belly to the Mother Cap. I will grow the rest.'],
  [16, 'Overgrowth', 'Press 2 to root a building yourself. It costs a Grazer, and it only grows on our Bloom. Press G and I will stop.'],
  [70, 'Rootwatch', 'The Ironhold yard is at the end of the road. Break every Headframe and the valley is soil.'],
  [125, 'Overgrowth', 'The map is dark until a Gloam walks it. Find another seam and seed a Mother Cap beside it (press 2). The Bloom will follow.'],
];
export const GBOOKS = [
  { name: 'Road Swarm', steps: ['Gather', 'Ripen', 'Swarm'], go: 'Down the road, all legs. Bite whatever moves.', label: 'The swarm runs down the road' },
  { name: 'Ridge Swarm', steps: ['Gather', 'Ripen', 'Circle'], go: 'Over the ridge, low and quiet. Come at their backs.', label: 'The swarm circles over the ridge' },
  { name: 'Last Feast', steps: ['Gather', 'Ripen', 'Everything'], go: 'Everything with legs. Both roads. Leave them nothing.', label: 'Everything on the last Headframe' },
];
export const GCHATTER = [
  'The ground here tastes of rust. I like it.', 'A Snapper bit me. It said it was practice.', 'The Bloom is warm tonight.',
  'I counted my legs again. Still six.', 'The hammer people never stop banging.', 'Something in the Cap is kicking. A new sister.',
  'I dreamed of rain. The spores dreamed with me.', 'Their metal is chewy. Not filling.',
];
export const GKILL = ['Soil now.', 'Chewed.', 'One fewer hammer.', 'Mulch.', 'The Bloom will have that one.'];
export const GDOWN = ['A sister is gone.', 'We are fewer.', 'They popped one of us.', 'Remember the smell of it.'];
/** What the Ironhold say about the Gloam. */
export const IKILL_G = ['Bug down!', 'Squashed one.', 'That one is fertiliser.', 'Put it on my tab. Legs and all.', 'Got one. Smells awful.'];
export const ICHATTER_G = ['Anyone else itchy? Just me?', 'Those mushrooms are looking at me.', 'I stepped in the green stuff again.', 'How many legs is too many legs? I say four.', 'Quartermaster says the carpet is not contagious. Quartermaster is a liar.'];

/** Where the Overgrowth roots its buildings, as offsets from the home Mother Cap (rotated to face the road like the Veyl's). */
const SLOT: Partial<Record<BKind, number[][]>> = {
  warren: [[-2, -10], [-2, 11], [-8, 1]],
  sporesac: [[6, -12], [6, 13], [0, -14], [0, 15], [-6, -13], [-6, 14], [10, -8], [10, 9]],
  stinger: [[-11, -6], [-11, 7], [-14, 1], [-8, -12], [-8, 13]],
  quillgarden: [[-4, 3], [-5, -5], [4, -16], [4, 17]],
  blisterbed: [[2, -17], [2, 18], [-10, -14], [-10, 15]],
  tuskhollow: [[10, -15], [10, 16], [14, 0]],
  oldgrowth: [[14, -8], [14, 9], [16, 0]],
};

export function overgrowth(D: Director, dt: number, V: Side = D.vs) {
  const g = D.g, T = V.team, U = g.upOf(T), [HX, HZ] = homeXZ(T); V.qmT -= dt; if (V.qmT > 0 || !V.auto) return; V.qmT = 1;
  const own = (k: BKind) => g.ownB(k, false, T), up = (k: BKind) => g.ownB(k, true, T), cash = () => g.cash(T);
  const caps = own('mothercap'), capsUp = up('mothercap'), home = capsUp[0] || caps[0]; if (!home) return;
  const sites = g.ownB(undefined, false, T).filter(b => !b.built), growing = sites.length > 0;
  const free = g.supplyCap(T) - g.supplyUsed(T), army = g.army(T).length, grazers = g.own('grazer', T).filter(u => !u.pilot);
  const warren = own('warren'), warrenUp = up('warren').length > 0, garden = own('quillgarden'), gardenUp = up('quillgarden').length > 0, bed = own('blisterbed'), bedUp = up('blisterbed').length > 0;
  const hollow = own('tuskhollow'), hollowUp = up('tuskhollow')[0], old = own('oldgrowth'), oldUp = up('oldgrowth').length > 0, stingers = own('stinger').length;
  // A building costs a Grazer as well as ore. Never root the last few: the belly of the swarm comes first.
  const canRoot = grazers.length > 5;
  const put = (k: BKind, line: string) => {
    if (cash() < BLD[k].cost || !canRoot || (g.paper(T) && !g.paper(T)!.allow.includes(k))) return false;
    for (const [lx, lz] of SLOT[k] || []) { const [x, z] = endPt(T, ...veylPt(lx, lz), false), at = D.freeSpot(k, Math.round(x), Math.round(z), T); if (at && g.place(k, at[0], at[1], false, T, null)) { D.say('Overgrowth', line, '', T); return true; } }
    return false;
  };
  const spare = (keys: string[]) => { for (const k of keys) { const u = UPGRADES.find(x => x.key === k)!; if (!U[u.key] && g.ownB(u.at, true, T).length && (!u.needs || U[u.needs]) && cash() >= u.cost + 120) return g.buyUpgrade(u.key, T); } return false; };
  const homeLeft = g.ores.filter(n => Math.hypot(n.pos.x - HX, n.pos.z - HZ) < 40).reduce((a, n) => [a[0] + n.amount, a[1] + n.max], [0, 0]);
  const wantCaps = Math.min((MAP.sites || []).length + 1, 1 + (g.time > 420 || homeLeft[0] < homeLeft[1] * .5 ? 1 : 0) + (g.time > 900 ? 1 : 0) + (g.time > 1380 ? 1 : 0));
  const wantSac = free <= 3 && !sites.some(b => b.kind === 'sporesac') && own('sporesac').length < 7;
  const wantStingers = army >= 3 ? 1 + (g.time > 420 ? 1 : 0) + (g.time > 840 ? 1 : 0) : 0;
  const exp = expansion(D, T);
  let saving = true, hold = 80;
  if (!warren.length) put('warren', 'A Warren first. The Snappers need somewhere to sleep.');
  else if (wantSac) put('sporesac', 'We are crowded. Rooting a Spore Sac.');
  else if (growing) saving = false;
  // Outnumbered: no new tech until the swarm has caught up, or the side that rooted a Garden first is the side that gets run over.
  else if (warrenUp && g.army(foeOf(T)).length > army + 3) saving = false;
  else if (warrenUp && stingers < Math.min(1, wantStingers)) put('stinger', 'A Stinger Stalk by the road. It will whip anything that sniffs too close.');
  else if (warrenUp && !garden.length && army >= 4) put('quillgarden', 'A Quill Garden. Spitters, and the first new tricks.');
  // Fat Buds once the Garden is down, never before: bought at exactly three fighters it starved the swarm for half a minute, and which side happened
  // to hatch an odd Snapper decided the mirror match.
  else if (warrenUp && garden.length && !U.gfat && army >= 4) g.buyUpgrade('gfat', T);
  else if (warrenUp && !bed.length && army >= 6) put('blisterbed', 'A Blister Bed. Let them come close.');
  else if (warrenUp && stingers < wantStingers) put('stinger', 'Another Stinger Stalk. The road should hurt.');
  else if (gardenUp && !U.gdmg && army >= 5) g.buyUpgrade('gdmg', T);
  else if (warrenUp && army >= 6 && exp.site && caps.length < wantCaps) {
    hold = BLD.mothercap.cost; const [sx, sz] = exp.site, dx = HX - sx, dz = HZ - sz, l = Math.hypot(dx, dz) || 1, x = Math.round(sx + dx / l * 10), z = Math.round(sz + dz / l * 10);
    if (cash() >= BLD.mothercap.cost && canRoot && g.canPlace('mothercap', x, z, false, T) && g.place('mothercap', x, z, false, T, null)) D.say('Overgrowth', 'A Grazer has wandered to the far seam to become a Mother Cap. The Bloom will follow it.', '', T);
  }
  else if (exp.bare) { const [bx, bz] = exp.bare; for (const [ox, oz] of [[7, 7], [-7, 7], [7, -7], [-7, -7]]) if (cash() >= BLD.stinger.cost && canRoot && g.canPlace('stinger', bx + ox, bz + oz, false, T) && g.place('stinger', bx + ox, bz + oz, false, T, null)) { D.say('Overgrowth', 'A Stinger Stalk to guard the new Cap.', '', T); break; } }
  else if (gardenUp && !hollow.length && U.gdmg && army >= 7) { hold = 200; put('tuskhollow', 'The Tusk Hollow grows. Something old is waking in it.'); }
  else if (hollowUp && army >= 6 && free >= 4 && g.own('mulcher', T).length + hollowUp.queue.length < (g.time > 660 ? 2 : 1)) { hold = UNIT.mulcher.cost; if (cash() >= hold) g.train(hollowUp, 'mulcher'); }
  else if (gardenUp && !U.garmor && army >= 6) g.buyUpgrade('garmor', T);
  else if (hollowUp && !U.gdmg2 && army >= 9) { hold = 200; g.buyUpgrade('gdmg2', T); }
  else if (hollowUp && !U.garmor2 && army >= 10) { hold = 200; g.buyUpgrade('garmor2', T); }
  else if (hollowUp && bedUp && !old.length && U.gdmg2 && army >= 10) { hold = 250; put('oldgrowth', 'Old Growth. The oldest spores, and the deepest tricks.'); }
  else if (oldUp && !U.gdmg3 && army >= 10) { hold = 250; g.buyUpgrade('gdmg3', T); }
  else if (oldUp && !U.garmor3 && army >= 11) { hold = 250; g.buyUpgrade('garmor3', T); }
  else if (spare(['gtongue', 'glegs', 'gquill', 'gsap', 'gcharge', 'gbloom', 'ggut'])) saving = true;
  else saving = false;
  // Buds: every Mother Cap ripens what it can. Grazers first, until each Cap has its crew plus a few spare to root with.
  const want = 8 + 6 * (capsUp.length - 1) + (warren.length && !old.length ? 1 : 0);
  const sn = g.own('snapper', T).length, qb = g.own('quillback', T).length, bl = g.own('blister', T).length;
  for (const cap of capsUp) {
    while ((cap.buds || 0) > 0) {
      let k: Kind | null = null;
      if (grazers.length + count(capsUp, 'grazer') < want && free > 0) k = 'grazer';
      else if (!warrenUp) break;
      else if (gardenUp && qb + count(capsUp, 'quillback') < Math.floor((sn + count(capsUp, 'snapper')) / 3) + 1 && army >= 2) k = 'quillback';
      else if (bedUp && bl + count(capsUp, 'blister') < Math.floor(army / 6) + 1) k = 'blister';
      else k = 'snapper';
      const n = k === 'snapper' ? 2 : 1, cost = UNIT[k].cost * n + (saving && k !== 'grazer' ? hold : 0);
      if (cash() < cost || !g.train(cap, k)) break;
    }
  }
}
const count = (caps: Building[], k: Kind) => caps.reduce((a, b) => a + b.queue.filter(q => q.kind === k).length, 0);
/** The next seam worth a Mother Cap (nearest home, nobody there yet, away from the Ironhold), and a new Cap still without a Stinger Stalk. */
function expansion(D: Director, T: number): { site: number[] | null; bare: number[] | null } {
  const g = D.g, [HX, HZ] = homeXZ(T), near = (x: number, z: number, r: number, f: (b: Building) => boolean) => g.buildings.some(b => b.alive && f(b) && Math.hypot(b.pos.x - x, b.pos.z - z) < r);
  const free = (MAP.sites || []).filter(([x, z]) => !near(x, z, 30, b => b.team === T && b.kind === 'mothercap') && !near(x, z, 50, b => b.team !== T) && g.ores.some(n => n.amount > 0 && Math.hypot(n.pos.x - x, n.pos.z - z) < 16)).sort((a, b) => Math.hypot(a[0] - HX, a[1] - HZ) - Math.hypot(b[0] - HX, b[1] - HZ));
  const bare = g.ownB('mothercap', true, T).find(h => Math.hypot(h.pos.x - HX, h.pos.z - HZ) > 30 && !near(h.pos.x, h.pos.z, 24, b => b.team === T && b.kind === 'stinger'));
  return { site: free[0] || null, bare: bare ? [bare.pos.x, bare.pos.z] : null };
}
