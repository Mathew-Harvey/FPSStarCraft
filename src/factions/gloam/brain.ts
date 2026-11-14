// The Gloam's economy brain, the Overgrowth: what to root next, what to grow, and how many mouths to feed.
// It mirrors the Quartermaster and the Conductor, with the Gloam's own rules: every building costs a Grazer,
// every unit costs a Bud, and buildings only grow on Bloom.
import type { Director, Side } from '../../director';
import { DOCTRINES } from '../../doctrine';
import { sfx } from '../../audio';
import { defineFaction } from '../../core/registry';
import { isEnemy } from '../../core/sides';
import { costOf, canPay } from '../../core/econ';
import { overgrowth2, firstOf } from './brain2';
import { broodPick } from './brood-mix';
import { hunt, spent } from '../../core/brainkit';
const LOOKOUT = ['Lookout', 'Watcher', 'Rootwatch'];
import { BLD, UNIT, UPGRADES, Kind, BKind, Building, MAP, veylPt, endPt, homeXZ, foeOf, fac } from '../../data';
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
  const g = D.g, T = V.team, U = g.upOf(T), [HX, HZ] = homeXZ(T); if (V.auto) hunt(D, V, dt);   /* the finish runs every tick (brainkit.ts) */
  V.qmT -= dt; if (V.qmT > 0 || !V.auto) return; V.qmT = 1;
  const own = (k: BKind) => g.ownB(k, false, T), up = (k: BKind) => g.ownB(k, true, T), cash = () => g.cash(T), pays = (c: [number, number], extra = 0) => canPay(g, T, [c[0] + extra, c[1]]);
  const caps = own('mothercap'), capsUp = up('mothercap'), home = capsUp[0] || caps[0]; const want2 = overgrowth2(D, dt, V); if (!home) return;
  const sites = g.ownB(undefined, false, T).filter(b => !b.built), growing = sites.length > 0;
  const free = g.supplyCap(T) - g.supplyUsed(T), army = g.army(T).length, grazers = g.own('grazer', T).filter(u => !u.pilot);
  const warren = own('warren'), warrenUp = up('warren').length > 0, garden = own('quillgarden'), gardenUp = up('quillgarden').length > 0, bed = own('blisterbed'), bedUp = up('blisterbed').length > 0;
  const hollow = own('tuskhollow'), hollowUp = up('tuskhollow')[0], old = own('oldgrowth'), oldUp = up('oldgrowth').length > 0, stingers = own('stinger').length;
  // A building costs a Grazer as well as ore. Never root the last few: the belly of the swarm comes first.
  const canRoot = grazers.length > 5;
  let saving = true, hold = 80;
  const put = (k: BKind, line: string) => {
    if (!pays(costOf(k)) || !canRoot || !g.unlocked(k, T)) return false;
    for (const [lx, lz] of SLOT[k] || []) { const [x, z] = endPt(T, ...veylPt(lx, lz), false), at = D.freeSpot(k, Math.round(x), Math.round(z), T); if (at && g.place(k, at[0], at[1], false, T, null)) { D.say('Overgrowth', line, '', T); return true; } }
    return false;
  };
  const spare = (keys: string[]) => { for (const k of keys) { const u = UPGRADES.find(x => x.key === k)!; if (!U[u.key] && g.ownB(u.at, true, T).length && (!u.needs || U[u.needs]) && !g.gated(T, u.key) && pays(costOf(u.key), 120)) return g.buyUpgrade(u.key, T); } return false; };
  const homeLeft = g.ores.filter(n => Math.hypot(n.pos.x - HX, n.pos.z - HZ) < 40).reduce((a, n) => [a[0] + n.amount, a[1] + n.max], [0, 0]);
  const DOC = V.doc || DOCTRINES[0], wantCaps = Math.min((MAP.sites || []).length + 1, 1 + (g.time > DOC.expT - 60 || homeLeft[0] < homeLeft[1] * .5 ? 1 : 0) + (g.time > 900 ? 1 : 0) + (g.time > 1380 ? 1 : 0));
  const wantSac = free <= 3 && !sites.some(b => b.kind === 'sporesac') && own('sporesac').length < 7;
  const wantStingers = Math.max(0, (army >= 3 ? 1 + (g.time > 420 ? 1 : 0) + (g.time > 840 ? 1 : 0) : 0) + DOC.towers);
  const exp = expansion(D, T);
  // A new Cap goes ten metres from the seam on the side facing home, or a little further back if the ore is in the way there.
  const capSpot = ([sx, sz]: number[]) => { const dx = HX - sx, dz = HZ - sz, l = Math.hypot(dx, dz) || 1; return [10, 12, 14, 16, 18].map(r => [Math.round(sx + dx / l * r), Math.round(sz + dz / l * r)]).find(p => g.canPlace('mothercap', p[0], p[1], false, T)) || null; };
  if (!warren.length) put('warren', 'A Warren first. The Snappers need somewhere to sleep.');
  else if (wantSac) put('sporesac', 'We are crowded. Rooting a Spore Sac.');
  else if (growing) saving = false;
  // Outnumbered: no new tech until the swarm has caught up, or the side that rooted a Garden first is the side that gets run over.
  else if (warrenUp && g.army(foeOf(T)).length > army + 3) saving = false;
  else if (DOC.key === 'boom' && warrenUp && exp.site && caps.length < Math.min(2, wantCaps)) { hold = BLD.mothercap.cost; const at = capSpot(exp.site);
    if (cash() >= BLD.mothercap.cost && canRoot && at && g.place('mothercap', at[0], at[1], false, T, null)) D.say('Overgrowth', 'A Grazer goes to the far seam early. Ore first, teeth later.', '', T); }
  else if (warrenUp && stingers < Math.min(1, wantStingers)) put('stinger', 'A Stinger Stalk by the road. It will whip anything that sniffs too close.');
  else if (warrenUp && !garden.length && army >= 4 + DOC.tech) put('quillgarden', 'A Quill Garden. Spitters, and the first new tricks.');
  // Fat Buds once the Garden is down, never before: bought at exactly three fighters it starved the swarm for half a minute, and which side happened
  // to hatch an odd Snapper decided the mirror match.
  else if (warrenUp && garden.length && !U.gfat && army >= 4 && pays(costOf('gfat'))) g.buyUpgrade('gfat', T);
  else if (warrenUp && !bed.length && army >= 6 + DOC.tech) put('blisterbed', 'A Blister Bed. Let them come close.');
  else if (warrenUp && stingers < wantStingers) put('stinger', 'Another Stinger Stalk. The road should hurt.');
  // Bite, Spit and Hide grow at the Old Growth; it goes down once the Garden stands.
  else if (gardenUp && !old.length && army >= 8) put('oldgrowth', 'Old Growth. Sharper mouths and thicker hide grow here.');
  else if (oldUp && !U.gdmg && army >= 8 && pays(costOf('gdmg'))) g.buyUpgrade('gdmg', T);
  else if (warrenUp && army >= Math.max(1, 6 + DOC.expArmy) && exp.site && caps.length < wantCaps) {
    hold = BLD.mothercap.cost; const at = capSpot(exp.site);
    if (cash() >= BLD.mothercap.cost && canRoot && at && g.place('mothercap', at[0], at[1], false, T, null)) D.say('Overgrowth', 'A Grazer has wandered to the far seam to become a Mother Cap. The Bloom will follow it.', '', T);
  }
  else if (exp.bare) { const [bx, bz] = exp.bare; for (const [ox, oz] of [[7, 7], [-7, 7], [7, -7], [-7, -7]]) if (cash() >= BLD.stinger.cost && canRoot && g.canPlace('stinger', bx + ox, bz + oz, false, T) && g.place('stinger', bx + ox, bz + oz, false, T, null)) { D.say('Overgrowth', 'A Stinger Stalk to guard the new Cap.', '', T); break; } }
  else if (g.unlocked('tuskhollow', T) && !hollow.length && U.gdmg && army >= 7 + DOC.tech) { hold = 200; put('tuskhollow', 'The Tusk Hollow grows. Something old is waking in it.'); }
  else if (hollowUp && army >= 6 && free >= 4 && g.own('mulcher', T).length + hollowUp.queue.length < 1) { hold = UNIT.mulcher.cost; if (pays(costOf('mulcher')) && g.train(hollowUp, 'mulcher')) spent(g, V, 'mulcher'); }
  else if (oldUp && !U.garmor && army >= 6 && pays(costOf('garmor'))) g.buyUpgrade('garmor', T);
  else if (oldUp && !U.gdmg2 && !g.gated(T, 'gdmg2') && army >= 9) { hold = 150; if (pays(costOf('gdmg2'))) g.buyUpgrade('gdmg2', T); }
  else if (oldUp && !U.garmor2 && !g.gated(T, 'garmor2') && army >= 10) { hold = 225; if (pays(costOf('garmor2'))) g.buyUpgrade('garmor2', T); }
  else if (oldUp && !U.gdmg3 && !g.gated(T, 'gdmg3') && army >= 10) { hold = 200; if (pays(costOf('gdmg3'))) g.buyUpgrade('gdmg3', T); }
  else if (oldUp && !U.garmor3 && !g.gated(T, 'garmor3') && army >= 11) { hold = 300; if (pays(costOf('garmor3'))) g.buyUpgrade('garmor3', T); }
  else if (spare(['gtongue', 'glegs', 'gquill', 'gspit1', 'gsap', 'gcharge', 'gbloom', 'ggut'])) saving = true;
  else saving = false;
  // Buds: every Mother Cap ripens what it can. Grazers first, until each Cap has its crew plus a few spare to root with.
  // Plus the Grazers each tapped vent takes (two, three once the Elder stands; brain2.ts sends them).
  const want = 8 + DOC.crew + 6 * (capsUp.length - 1) + (warren.length && !old.length ? 1 : 0) + g.vents.filter(v => v.tap?.alive && v.tap.built && v.tap.team === T).length * (up('eldercap' as BKind).length ? 3 : 2);
  // After ten minutes the Buds hold back for the second half's tech every other half minute, so the army and the tech both grow.
  const sn = g.own('snapper', T).length, qb = g.own('quillback', T).length, bl = g.own('blister', T).length;
  // The Tusk Hollow grows a Mulcher whenever the mix calls for one more (it answers soft, plated and huge alike).
  if (hollowUp && !hollowUp.queue.length && warrenUp && broodPick(D, V) === 'mulcher' && pays(costOf('mulcher')) && g.train(hollowUp, 'mulcher')) spent(g, V, 'mulcher');
  for (const cap of capsUp) {
    while ((cap.buds || 0) > 0) {
      let k: Kind | null = null;
      if (grazers.length + count(capsUp, 'grazer') < want && free > 0) k = 'grazer';
      else if (!warrenUp) break;
      else if ((k = firstOf(D, T))) { /* the first of each new body */ }
      else k = broodPick(D, V, new Set(['mulcher'])) || 'snapper';   /* the mix (brood-mix.ts): what answers what was seen, no kind over the cap */
      const n = k === 'snapper' ? 2 : 1, c = costOf(k);
      if (!canPay(g, T, [c[0] * n + (k === 'grazer' ? 0 : Math.max(saving ? hold : 0, want2 < 0 ? -want2 : g.time > 600 && Math.floor(g.time / 30) % 2 === 0 ? want2 : 0)), c[1] * n]) || !g.train(cap, k)) break;
      if (k !== 'grazer' && k !== 'keeper') for (let i = 0; i < n; i++) spent(g, V, k);
    }
  }
}
const count = (caps: Building[], k: Kind) => caps.reduce((a, b) => a + b.queue.filter(q => q.kind === k).length, 0);
/** The next seam worth a Mother Cap (nearest home, nobody there yet, away from the Ironhold), and a new Cap still without a Stinger Stalk. */
function expansion(D: Director, T: number): { site: number[] | null; bare: number[] | null } {
  const g = D.g, [HX, HZ] = homeXZ(T), near = (x: number, z: number, r: number, f: (b: Building) => boolean) => g.buildings.some(b => b.alive && f(b) && Math.hypot(b.pos.x - x, b.pos.z - z) < r);
  const free = (MAP.sites || []).filter(([x, z]) => !near(x, z, 30, b => b.team === T && b.kind === 'mothercap') && !near(x, z, 50, b => isEnemy(b.team, T)) && g.ores.some(n => n.amount > 0 && Math.hypot(n.pos.x - x, n.pos.z - z) < 16)).sort((a, b) => Math.hypot(a[0] - HX, a[1] - HZ) - Math.hypot(b[0] - HX, b[1] - HZ));
  const bare = g.ownB('mothercap', true, T).find(h => Math.hypot(h.pos.x - HX, h.pos.z - HZ) > 30 && !near(h.pos.x, h.pos.z, 24, b => b.team === T && b.kind === 'stinger'));
  return { site: free[0] || null, bare: bare ? [bare.pos.x, bare.pos.z] : null };
}

defineFaction(2, {
  brain: (D, dt, S) => overgrowth(D, dt, S), hints: GHINTS, books: GBOOKS,
  chatter: () => GCHATTER, lines: kind => kind === 'kill' ? GKILL : GDOWN,
  trained(D, u) {
    if (u.kind === 'snapper' && !D.flags.gsn) { D.flags.gsn = true; D.say('Snapper', 'Two of us, fresh from the Bud. Look at me and press F. Click bites, right click pounces.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'quillback' && !D.flags.gqb) { D.flags.gqb = true; D.say('Quillback', 'A Quillback, bristling. Click spits a quill; right click throws a fan of five.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'blister' && !D.flags.gbl) { D.flags.gbl = true; D.say('Blister', 'I am a Blister. Carry me into a crowd, click, and I pop. You will need a new body after.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'mulcher' && !D.flags.gmu) { D.flags.gmu = true; D.say('Mulcher', 'The old one walks. Click sweeps the tusks; right click charges through a line.', 'in', u.team); sfx.callout(); }
  },
  built(D, b) {
    if (b.kind === 'warren' && !D.flags.gwar) { D.flags.gwar = true; D.say('Overgrowth', 'The Warren is open. Snappers can ripen at any Mother Cap now: look at a Cap and press T.', 'in', b.team); }
    else if (b.kind === 'quillgarden') D.say('Overgrowth', 'The Quill Garden is grown. Quillbacks ripen at the Caps, and the Garden teaches thicker hide and sharper mouths.', 'in', b.team);
    else if (b.kind === 'blisterbed') D.say('Overgrowth', 'The Blister Bed is full. Blisters ripen at the Caps now.', 'in', b.team);
    else if (b.kind === 'tuskhollow') D.say('Overgrowth', 'The Tusk Hollow is grown. A Mulcher can wake inside it.', 'in', b.team);
    else if (b.kind === 'mothercap') D.say('Overgrowth', 'A new Mother Cap stands. Grazers can bring ore here, and it grows Buds of its own.', 'in', b.team);
  },
  lost(D, b, left) { D.say('Rootwatch', `The ${BLD[b.kind].name} has withered.`, 'al', b.team); if (b.kind === 'mothercap' && left) D.say(LOOKOUT[fac(foeOf(b.team))], `A Mother Cap is down. ${left} still growing.`, 'in', foeOf(b.team)); else if (b.kind !== 'mothercap') D.say('Alpha', `${BLD[b.kind].name} squashed. Keep swinging.`, '', foeOf(b.team)); },
});
