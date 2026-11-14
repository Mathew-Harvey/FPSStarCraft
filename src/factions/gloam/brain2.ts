// The Overgrowth's second half: everything past the first Warren, Garden, Bed and Hollow. It runs after the old brain each second
// and spends only what that brain leaves (it keeps the old brain's saving for a new Cap). In order:
// Vent Bladders and Grazers on the Flux; a Keeper at every Cap; the Cap ripening to Elder and Ancient; the new buildings; research;
// the new bodies in a mix set by what the enemy fields; ripening bodies; Spore Pods hopping toward the enemy; Blisters dug in as mines
// on the road; a tunnel for the push; Stinger Stalks walking to a Cap that lost its own; a Lookout Sac over the army.
import type { Director, Side } from '../../director';
import { BLD, UNIT, UPGRADES, Kind, BKind, Building, Unit, homeXZ, endPt, veylPt, foeOf, fac, RALLY } from '../../data';
import { costOf, canPay, sendToVent, tapped, ventAt } from '../../core/econ';
import { useAbility } from '../../core/ability';
import { ripeningOf } from '../../core/morph';
import { docOf } from '../../director';
import { G_RIPEN, type GKind, type GBKind } from './numbers';
import { isDug, setDug } from './roster';
import { foeAnswers } from './kit';
import { otherEnd } from './actions';
import { ripenWhy } from './abilities';

/** Where the second-half buildings go, as offsets from the home Cap (the same frame as brain.ts SLOT). */
const SLOT2: Partial<Record<GBKind, number[][]>> = {
  shellpit: [[-6, 18], [-6, -17], [12, 4]],
  rotden: [[16, -4], [16, 5], [-12, 16]],
  wingspire: [[18, 12], [18, -11], [-14, -16]],
  deeproot: [[12, 18], [12, -17], [20, 0]],
  needleden: [[-14, 12], [-14, -11], [20, 8]],
  puffball: [[-9, 4], [-9, -4], [4, 10]],
  oldgrowth: [[14, -8], [14, 9], [16, 0]],
};
const B2 = new WeakMap<Side, { t: number; told: Set<string>; bad: Set<unknown>; seen: WeakMap<Unit, [number, number, number]> }>();
const has = (g: Director['g'], T: number, k: BKind, built = true) => g.ownB(k, built, T).length > 0;

/** Returns the ore it is saving for (the old brain's Bud loop keeps that much back from fighters), negative when it is for a Cap tier
 *  and must be held every second. */
export function overgrowth2(D: Director, dt: number, V: Side): number {
  const g = D.g, T = V.team; let want = 0, firm = 0; let st = B2.get(V); if (!st) B2.set(V, st = { t: 0, told: new Set(), bad: new Set(), seen: new WeakMap() });
  if (!V.auto) return 0; void dt;   // called once a second by the old brain
  const U = g.upOf(T), DOC = docOf(V), [HX, HZ] = homeXZ(T), foe = foeOf(T);
  const caps = g.ownB('mothercap', true, T), home = caps.slice().sort((a, b) => Math.hypot(a.pos.x - HX, a.pos.z - HZ) - Math.hypot(b.pos.x - HX, b.pos.z - HZ))[0]; if (!home) return 0;
  const army = g.army(T), grazers = g.own('grazer', T).filter(u => !u.pilot && u !== g.me), n = army.length;
  const elder = has(g, T, 'eldercap'), ancient = has(g, T, 'ancientcap'), ripening = caps.some(c => (c as any).grow);
  const sites = g.ownB(undefined, false, T).filter(b => !b.built).length;
  const say = (key: string, line: string) => { if (st!.told.has(key)) return; st!.told.add(key); D.say('Overgrowth', line, '', T); };
  // Tech only when it is safe: the swarm is bigger than the enemy's army by a fifth, or ore is piling up. Saving for tech while the
  // enemy pushes lost almost every match to the Ironhold in the bot tables (the swarm is its army; a Snapper short is a fight lost).
  // After ten minutes the swarm techs anyway: a match that long is one the Snappers alone did not end.
  // Measured in what the armies cost, not heads: a Snapper is a twelfth of a Breaker, and counting heads had the swarm teching into a loss.
  const worth = (t: number) => g.army(t).reduce((a, u) => { const c = costOf(u.kind); return a + c[0] + c[1]; }, 0);
  const late = g.time > 600, safe = late || (n >= 8 && worth(T) >= worth(foe) * 1.5 + 200) || g.cash(T) > 320;
  if (!safe && !elder) { if (g.flux(T) > 150) for (const u of grazers) if (u.vent && !(u.fluxing! > 0)) sendToVent(g, u, null); return 0; }
  const keep: [number, number] = [n < 6 ? 999 : safe ? 40 : 120, 0];
  // Once the Elder stands, Flux is kept for the Wing Spire first (it is the dearest, and the other Flux buys starved it in every match).
  // After it, the first of each tier-3 body in turn: a Hooksail, a Needler, Sower Ripening, a Sower.
  const ripeCostOf = (k: GKind) => { const t = G_RIPEN[k]!.to, a = costOf(t as Kind), b = costOf(k as Kind); return Math.max(0, a[1] - b[1]); };
  const ripened = (k: Kind) => g.own(k, T).length + g.units.filter(u => u.alive && u.team === T && ripeningOf(u) === k).length;
  const spireFlux = elder && !has(g, T, 'wingspire', false) ? BLD['wingspire' as BKind].flux || 0
    : !ancient ? 0 : !g.own('hooksail', T).length ? UNIT.hooksail.flux || 0
    : has(g, T, 'needleden') && !U.gneedle ? 150 : has(g, T, 'needleden') && !ripened('needler') ? ripeCostOf('quillback') : has(g, T, 'tallspire') && !U.gsower ? 150
    : U.gsower && !ripened('sower') ? ripeCostOf('bloater') : 0;
  const afford = (c: [number, number], spire = false) => { const ok = canPay(g, T, [c[0] + keep[0], c[1] + keep[1] + (spire || !c[1] ? 0 : spireFlux)]); if (!ok && !want && keep[0] < 999 && g.flux(T) >= c[1]) want = c[0] + keep[0]; return ok; };
  // The Cap tiers come first once the match is long: the Buds hold back for them all the time, not every other half minute.
  const tier = (c: [number, number]) => { const ok = afford(c); if (!ok && late && g.flux(T) >= c[1]) firm = c[0] + keep[0]; return ok; };
  const canRoot = grazers.length > 7;
  const put = (k: GBKind, line: string) => {
    if (!g.unlocked(k as BKind, T) || !afford(costOf(k as BKind), k === 'wingspire') || !canRoot || sites > 1) return false;
    const slots = [...(SLOT2[k] || []), [8, 20], [-16, 0], [20, -16], [-4, 22]];
    for (const [lx, lz] of slots) { const [x, z] = endPt(T, ...veylPt(lx, lz), false), at = D.freeSpot(k as BKind, Math.round(x), Math.round(z), T); if (at && g.place(k as BKind, at[0], at[1], false, T, null)) { say('b_' + k, line); return true; } }
    return false;
  };
  const buy = (key: string) => { const u = UPGRADES.find(x => x.key === key); if (!u || U[u.key] || (u.needs && !U[u.needs]) || !g.ownB(u.at, true, T).length || g.gated(T, key)) return false; return afford(costOf(u.key), u.key === 'gsower' || u.key === 'gneedle') && g.buyUpgrade(u.key, T); };

  // 1. Flux. A Vent Bladder on each vent within reach of a Cap, and three Grazers on each tapped vent.
  // One vent until the Elder stands; a vent costs Grazers off the ore, and the bot tables lost about six matches in sixty to early vents.
  const vents = g.vents.filter(v => v.tap?.alive && v.tap.team === T && !st!.bad.has(v)).length;
  if (n >= (late ? 6 : 10) && grazers.length >= (elder || late ? 8 : 12) && g.time > 300 && (elder ? g.flux(T) < 300 : vents < 1)) for (const c of caps) {
    const v = g.vents.find(v => !v.tap?.alive && !st!.bad.has(v) && v.amount > 0 && Math.hypot(v.pos.x - c.pos.x, v.pos.z - c.pos.z) < 34);
    if (v && canRoot && afford(costOf('ventbladder' as BKind)) && sites < 2 && g.canPlace('ventbladder' as BKind, v.pos.x, v.pos.z, false, T) && g.place('ventbladder' as BKind, v.pos.x, v.pos.z, false, T, null)) { say('vent', 'A Vent Bladder on the vent. The Grazers can drink the Flux now.'); break; }
  }
  // Flux only as far as there is something to spend it on: the Grazers go back to ore once the side has plenty.
  const fluxFull = g.flux(T) > (ancient ? 500 : elder ? 300 : 125) || grazers.length < 5;
  if (fluxFull) for (const u of grazers) if (u.vent && !(u.fluxing! > 0)) sendToVent(g, u, null);
  // Grazers walk to a vent in a straight line, so one can be walled off by the side's own buildings. A Grazer that has not got
  // a metre closer in ten seconds gives up, and that vent is left alone from then on.
  for (const u of grazers) {
    if (!u.vent || u.state !== 'toVent') { st.seen.delete(u); continue; }
    const was = st.seen.get(u); if (!was || Math.hypot(u.pos.x - was[0], u.pos.z - was[1]) > 1) { st.seen.set(u, [u.pos.x, u.pos.z, g.time]); continue; }
    if (g.time - was[2] > 10) { st.bad.add(u.vent); sendToVent(g, u, null); st.seen.delete(u); }
  }
  if (!fluxFull) for (const v of g.vents) {
    if (!tapped(g, v, T) || st.bad.has(v)) continue; const on = grazers.filter(u => u.vent === v).length;
    if (on < (elder ? 3 : 2)) { const w = grazers.filter(u => !u.vent && !u.site && !u.carrying && !isDug(u)).sort((a, b) => Math.hypot(a.pos.x - v.pos.x, a.pos.z - v.pos.z) - Math.hypot(b.pos.x - v.pos.x, b.pos.z - v.pos.z))[0]; if (w && grazers.length > 4) sendToVent(g, w, v); }
  }
  // 2. A Keeper at every Cap that has a Warren behind it.
  if (has(g, T, 'warren') && n >= 8 && g.time > 360) for (const c of caps) {
    const k = g.own('keeper', T).filter(u => Math.hypot(u.pos.x - c.pos.x, u.pos.z - c.pos.z) < 30).length + c.queue.filter(q => q.kind === 'keeper').length;
    if (!k && afford(costOf('keeper')) && g.train(c, 'keeper')) { say('keeper', 'A Keeper for the Cap. It will seed Buds and spread the Bloom.'); break; }
  }
  // 3. The Cap ripens. Elder once the Garden stands and the swarm is big enough; Ancient once the Rot Den stands.
  if (!ripening && !elder && has(g, T, 'warren') && has(g, T, 'quillgarden') && n >= (late ? 5 : 7 + DOC.tech) && g.time > 330) { const a = (home as any); if (!a.grow && tier(costOf('eldercap' as BKind)) && g.buildingAction(home, 'grow')) say('elder', 'The Mother Cap is ripening into an Elder Cap. New growth soon.'); }
  if (!ripening && elder && !ancient && has(g, T, 'rotden') && n >= 6 + DOC.tech && g.time > 660) { const e = g.ownB('eldercap' as BKind, true, T)[0]; if (e && tier(costOf('ancientcap' as BKind)) && g.buildingAction(e, 'grow')) say('ancient', 'The Elder Cap is ripening into an Ancient Cap. The oldest things are waking.'); }
  // 4. Buildings, one at a time, in this order. Shell Pit and Puffballs early; the rest once the tier allows.
  const foeAir = g.army(foe).filter(u => u.air).length, foeHidden = g.army(foe).some(u => UNIT[u.kind].cloak || !!u.status?.some(x => x.k === 'unseen' || x.k === 'dug'));
  let builtOne = false; const wantB = (ok: boolean, k: GBKind, line: string) => { if (!builtOne && ok && !g.ownB(k as BKind, false, T).length) builtOne = put(k, line); };
  wantB(has(g, T, 'warren'), 'quillgarden' as GBKind, 'A Quill Garden. Spitters, and the first new tricks.');
  wantB(has(g, T, 'warren') && n >= 8, 'blisterbed' as GBKind, 'A Blister Bed. Let them come close.');
  wantB(has(g, T, 'quillgarden') && n >= 8, 'oldgrowth', 'Old Growth. Sharper mouths and thicker hide grow here.');
  wantB(has(g, T, 'warren') && n >= 8 && g.flux(T) >= 25, 'shellpit', 'A Shell Pit. Shellbacks to hold the Bloom.');
  if (!builtOne && has(g, T, 'warren') && (foeAir > 0 || foeHidden || g.time > 600)) { const pb = g.ownB('puffball', false, T).length; if (pb < Math.min(caps.length * (foeAir > 3 ? 2 : 1), 6)) builtOne = put('puffball', 'A Puffball by the Cap. It shoots fliers and sees what hides.'); }
  wantB(elder && n >= 5, 'wingspire', 'A Wing Spire. The Gloam take to the air.');
  wantB(elder && n >= 5, 'rotden', 'A Rot Den. Smothers and Seeders.');
  wantB(elder && !has(g, T, 'oldgrowth', false) && n >= 5, 'oldgrowth', 'Old Growth. The oldest spores, and the deepest tricks.');
  wantB(elder && n >= 8 && g.time > 600, 'deeproot', 'A Deep Root. We will come up behind them.');
  wantB(ancient && n >= 5, 'needleden', 'A Needle Den. The Quillbacks can ripen into Needlers.');
  wantB(ancient, 'tuskhollow', 'The Tusk Hollow grows. Something old is waking in it.');
  if (!builtOne && ancient && n >= 6 && !has(g, T, 'tallspire', false)) { const sp = g.ownB('wingspire', true, T).find(b => b.kind === 'wingspire' && !(b as any).grow); if (sp && tier(costOf('tallspire' as BKind)) && g.buildingAction(sp, 'grow')) say('tall', 'The Wing Spire is ripening into a Tall Spire. Sowers, soon.'); }
  // 4b. A Mulcher from the Tusk Hollow once the Ancient Cap stands (the old brain makes them too, but only while ore is spare).
  const hollow = g.ownB('tuskhollow', true, T).find(b => !b.queue.length);
  if (hollow && ancient && g.own('mulcher', T).length < 2 && afford(costOf('mulcher'))) g.train(hollow, 'mulcher');
  // 5. Research, by what is standing.
  // Only research for bodies the side has: nothing for Drifters it never floats, nothing for fliers it has not grown.
  const c = (...ks: string[]) => ks.reduce((a, k) => a + g.own(k as Kind, T).length, 0), fl = c('gnatwing', 'bloater', 'sower', 'hooksail');
  const useful: [string, boolean][] = [
    ['gsower', c('bloater') >= 1], ['gneedle', c('quillback') >= 1], ['gdmg', true], ['gspit1', c('quillback', 'shellback', 'lobber', 'needler', 'keeper') >= 3], ['garmor', n >= 10], ['gdig', c('blister') >= 3 || c('shellback') >= 3],
    ['gmend', c('shellback', 'lobber') >= 3], ['glob', c('shellback') >= 3], ['gneck', c('quillback') >= 4], ['gfly1', fl >= 3], ['gfhide1', fl >= 4],
    ['gcrawl', c('shellback', 'lobber') >= 5], ['grot', c('smother') >= 1], ['gwings', c('seeder') >= 2], ['gbloom', n >= 14], ['gdmg2', n >= 12], ['gspit2', c('quillback', 'shellback', 'lobber', 'needler') >= 6],
    ['garmor2', n >= 14], ['gspines', c('needler') >= 2], ['gfly2', fl >= 5], ['gbelly', c('drifter', 'lookoutsac') >= 1 && g.time > 1200],
    ['groll', c('blister') >= 5], ['gsap', c('blister') >= 5], ['ghunger', c('snapper') >= 12], ['gdmg3', n >= 16], ['gspit3', c('quillback', 'shellback', 'lobber', 'needler') >= 8], ['garmor3', n >= 18],
    ['gfly3', fl >= 6], ['gfhide2', fl >= 6], ['gfhide3', fl >= 8], ['gcharge', c('mulcher') >= 1], ['gbark', c('mulcher') >= 2], ['gdrift', c('drifter', 'lookoutsac') >= 2],
  ];
  if (n >= 7) for (const [k, ok] of useful) if (ok && !U[k as never] && buy(k)) break;
  // 6. Ripening bodies: about a third of the Shellbacks into Lobbers, a quarter of the Quillbacks into Needlers, Bloaters into Sowers when the sky is clear.
  const ans = foeAnswers(g, T), ratio: Partial<Record<GKind, number>> = { shellback: .34, quillback: ans.see || g.own('needler', T).length < 2 ? .25 : 0, bloater: foeAir > 2 && ripened('sower') ? 0 : .5 };
  for (const from of Object.keys(ratio) as GKind[]) {
    const to = G_RIPEN[from]!.to, a = g.own(from, T).length, b = g.own(to, T).length + g.units.filter(u => u.alive && u.team === T && ripeningOf(u) === to).length;
    if (a + b < (from === 'bloater' ? 1 : 3) || b >= (a + b) * ratio[from]!) continue;
    const u = g.own(from, T).filter(u => !u.pilot && u !== g.me && !u.target).sort((x, y) => y.hp / y.maxHp - x.hp / x.maxHp)[0];
    if (u && !ripenWhy(g, u) && afford([0, 0], true)) useAbility(g, u, 'ripen');
  }
  // 6b. A Sower that ripened at home joins the push: ripening keeps the Bloater's old order, which is often 'guard the Cap'.
  const push = army.find(u => !u.air && (u.order.type === 'raid' || u.order.type === 'amove'));
  if (push) for (const u of g.own('sower', T)) if (!u.pilot && u !== g.me && u.order.type === 'guard' && !u.target) u.order = { ...push.order };
  // 7. Spore Pods plant their one more pod toward the enemy.
  for (const p of g.ownB('sporepod' as BKind, true, T)) if ((p as any).hops > 0 && g.time - (p as any).bornT > 20) g.buildingAction(p, 'hop'); else if ((p as any).bornT === undefined) (p as any).bornT = g.time;
  // 8. Dig In: Blisters wait under the road as mines (up to four), a step in front of the rally point.
  if (U.gdig) {
    const [rx, rz] = endPt(T, RALLY.x, RALLY.z, true), dug = g.own('blister', T).filter(isDug).length;
    if (dug < 4) { const b = g.own('blister', T).find(u => !isDug(u) && !u.pilot && u !== g.me && !u.target && u.order.type === 'guard' && Math.hypot(u.pos.x - rx, u.pos.z - rz) < 14); if (b) setDug(g, b, true); }
  }
  // 9. A tunnel for the push: a Tunnel Root where the army stands once it is past halfway to the enemy.
  const dr = g.ownB('deeproot' as BKind, true, T).find(d => !otherEnd(g, d) && !g.buildings.some(t => t.alive && t.kind === 'tunnelroot' && (t as any).pair === d.id));
  if (dr && afford(costOf('tunnelroot' as BKind))) {
    const [fx, fz] = homeXZ(foe), lead = army.filter(u => !u.air && (u.order.type === 'raid' || u.order.type === 'amove')).sort((a, b) => Math.hypot(a.pos.x - fx, a.pos.z - fz) - Math.hypot(b.pos.x - fx, b.pos.z - fz))[0];
    if (lead && Math.hypot(lead.pos.x - HX, lead.pos.z - HZ) > 70 && Math.hypot(lead.pos.x - fx, lead.pos.z - fz) > 45) {
      for (const [ox, oz] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-6, -6]]) { const x = Math.round(lead.pos.x + ox), z = Math.round(lead.pos.z + oz); if (g.canPlace('tunnelroot' as BKind, x, z, false, T) && g.place('tunnelroot' as BKind, x, z, false, T, null)) { say('tunnel', 'A Tunnel Root by the swarm. The rest of us come up there.'); break; } }
    }
  }
  // 10. A Stinger Stalk or Puffball whose Cap is gone pulls up its roots and walks to the nearest Cap.
  for (const b of g.buildings) {
    if (!b.alive || !b.built || b.team !== T || (b.kind !== 'stinger' && b.kind !== 'puffball')) continue;
    if (caps.some(c => Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) < 30)) continue;
    const to = caps.slice().sort((a, c) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) - Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z))[0];
    if (to && g.buildingAction(b, 'uproot')) { const w = g.units[g.units.length - 1]; if (w && w.team === T) { const a = Math.random() * 6.283; w.order = { type: 'guard', x: to.pos.x + Math.cos(a) * 13, z: to.pos.z + Math.sin(a) * 13 }; } say('walk', 'A Stinger Stalk lost its Cap. It is walking home.'); break; }
  }
  // 10b. A Cap with no Stinger Stalk or Puffball near it gets one walked over from a Cap that has two.
  for (const kind of ['stinger', 'puffball'] as BKind[]) {
    const all = g.ownB(kind, true, T), near = (c: Building) => all.filter(b => Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) < 30);
    const bare = caps.find(c => c.built && !near(c).length && !g.own((kind === 'stinger' ? 'stingerwalk' : 'puffwalk') as Kind, T).length), rich = caps.find(c => near(c).length >= 2);
    if (bare && rich && g.buildingAction(near(rich)[0], 'uproot')) { const w = g.units[g.units.length - 1]; if (w && w.team === T) w.order = { type: 'guard', x: bare.pos.x + 9, z: bare.pos.z + 9 }; say('walk2' + kind, 'A spare guard pulls up its roots and walks to the new Cap.'); break; }
  }
  // 11. A Lookout Sac over the army once the enemy hides things: a Spore Sac floats off and ripens.
  if (elder && (foeHidden || g.time > 900) && !g.own('drifter', T).length && !g.own('lookoutsac', T).length) {
    const sac = g.ownB('sporesac', true, T).find(b => !b.queue.length); if (sac && g.buildingAction(sac, 'uproot')) say('drift', 'A Spore Sac floats off. It will ripen into a Lookout Sac and watch over the swarm.');
  }
  for (const d of g.own('drifter', T)) if (!d.pilot && d !== g.me && !ripenWhy(g, d) && afford(costOf('lookoutsac'))) useAbility(g, d, 'ripen');
  return firm ? -firm : want;
}

/** One of each new body as soon as it can grow, ahead of the old brain's Quillback and Blister shares, so every tier gets its look in. */
export function firstOf(D: Director, T: number): Kind | null {
  const g = D.g, count = (k: Kind) => g.own(k, T).length + g.buildings.reduce((a, b) => a + (b.alive && b.team === T ? b.queue.filter(q => q.kind === k).length : 0), 0);
  for (const k of ['shellback', 'smother', 'gnatwing', 'seeder', 'bloater', 'hooksail'] as Kind[])
    if (!count(k) && !(k === 'bloater' && count('sower')) && !g.gated(T, k) && g.ownB(UNIT_NEED[k]!, true, T).length && canPay(g, T, costOf(k))) return k;
  return null;
}
/** What the Caps ripen beyond Grazers, Snappers, Quillbacks and Blisters (the old brain's mix), as shares of the army, by what stands. */
export function budMix(D: Director, T: number): Kind | null {
  const g = D.g, U = g.upOf(T), army = g.army(T), n = army.length, foe = foeOf(T), foeAir = g.army(foe).filter(u => u.air).length;
  const count = (k: Kind) => g.own(k, T).length + g.buildings.reduce((a, b) => a + (b.alive && b.team === T ? b.queue.filter(q => q.kind === k).length : 0), 0);
  const shell = count('shellback') + count('lobber'), gn = count('gnatwing'), bt = count('bloater') + count('sower'), sm = count('smother'), sd = count('seeder'), hk = count('hooksail');
  const ok = (k: Kind) => g.unlocked !== undefined && !g.gated(T, k) && (!UNIT_NEED[k] || g.ownB(UNIT_NEED[k]!, true, T).length > 0) && canPay(g, T, costOf(k));
  // Against an enemy with nothing that hits the air, one of each flier at most: an unanswerable swarm is no match.
  const air = foeAnswers(g, T).air, flyCap = (k: number) => air ? Infinity : k < 1 ? 1 : 0;
  if (ok('bloater') && foeAir >= 3 && bt < Math.ceil(foeAir * .7)) return 'bloater';
  if (ok('shellback') && shell < Math.floor(n / 4) + 1) return 'shellback';
  if (ok('smother') && sm < Math.max(1, Math.floor(n / 9) + (n >= 10 ? 1 : 0))) return 'smother';
  if (ok('gnatwing') && gn < Math.min(Math.floor(n / 6) + 1, gn + flyCap(gn))) return 'gnatwing';
  if (ok('seeder') && sd < Math.max(1, Math.floor(n / 12) + (n >= 12 ? 1 : 0))) return 'seeder';
  if (ok('hooksail') && hk < Math.min(Math.max(1, Math.floor(n / 14) + (n >= 14 ? 1 : 0)), hk + flyCap(hk))) return 'hooksail';
  if (ok('bloater') && bt < Math.min(Math.max(1, Math.floor(n / 14) + (U.gsower ? 1 : 0)), bt + flyCap(bt))) return 'bloater';
  return null;
}
const UNIT_NEED: Partial<Record<Kind, BKind>> = { shellback: 'shellpit' as BKind, smother: 'rotden' as BKind, seeder: 'rotden' as BKind, gnatwing: 'wingspire' as BKind, bloater: 'wingspire' as BKind, hooksail: 'ancientcap' as BKind };
export type { Building, Unit };
void [fac, ventAt, BLD];
