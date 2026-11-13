// The Veyl bot brain, the Conductor: what to grow where, what to wake and which songs to learn; the free raid factory of the classic match
// (Ironhold at home against an outpost nobody plays); and every line the Veyl say in the feed.
import { V3, R, M } from '../../gfx';
import { sfx } from '../../audio';
import type { Director, Side, Wave } from '../../director';
import { docOf } from '../../director';
import { Kind, BKind, UNIT, BLD, UPGRADES, Building, OUTPOST, GATE, RALLY_N, NORTH_PATH, MAP, ROAD, SIDE, veylPt, roadPt, foeOf, fac, endPt, homeXZ } from '../../data';
import { defineFaction } from '../../core/registry';
const LOOKOUT = ['Lookout', 'Watcher', 'Rootwatch'];

export const VHINTS: [number, string, string][] = [
  [1.5, 'Conductor', 'The Chorus wakes. Hold click on the green ore to hum it loose, then carry it to the Choir Stone. I will tend the rest.'],
  [16, 'Conductor', 'Press 2 to seed buildings yourself. Press G and I will stop.'],
  [70, 'Watcher', 'The Ironhold yard is at the end of the road. Break every Headframe and the valley is ours.'],
  [125, 'Conductor', 'The map is dark until a voice walks it. Find another seam and seed a Choir Stone beside it (press 2). It becomes a new home.'],
];
export const VBOOKS = [
  { name: 'Road Song', steps: ['Gather', 'Swell', 'March'], go: 'Down the road, all of us. Sing them out of their bunks.', label: 'The Chorus marches down the road' },
  { name: 'Ridge Song', steps: ['Gather', 'Swell', 'Circle'], go: 'Over the ridge. They will hear us when it is too late.', label: 'The Chorus circles over the ridge' },
  { name: 'Final Verse', steps: ['Gather', 'Swell', 'All voices'], go: 'Every voice, both roads. Let the last Headframe fall.', label: 'Every voice on the last Headframe' },
];
export const VCHATTER = [
  'The rock here hums in a minor key. I do not care for it.', 'The Ironhold sing so badly. All hammer, no tune.', 'My shell itches. It means rain, or rifles.',
  'Another Tender asked me what silence sounds like. I did not answer.', 'The Stones are restless tonight.', 'I counted the stars. One of them is a Headframe light.',
  'If they shoot at me again I will sing louder.', 'Somebody keeps humming flat. It is not me.',
];
export const VKILL = ['One fewer hammer.', 'That one has stopped banging.', 'The rust takes them.', 'Quiet, at last.'];
export const VDOWN = ['A voice is gone.', 'We are one fewer.', 'The song thins.', 'They broke a shell. Remember it.'];

/** The Veyl economy, when the Chorus runs one: what to grow next, what to learn, and who to wake. It mirrors the Quartermaster. */
export function conductor(D: Director, dt: number, V: Side = D.vs) {
  const g = D.g, T = V.team, U = g.upOf(T), [HX, HZ] = homeXZ(T), VP = (lx: number, lz: number) => endPt(T, ...veylPt(lx, lz), false); V.qmT -= dt; if (V.qmT > 0 || !V.auto) return; V.qmT = 1;
  const own = (k: BKind) => g.ownB(k, false, T), up = (k: BKind) => g.ownB(k, true, T), cash = () => g.cash(T);
  const pits = own('broodpit'), pitsUp = up('broodpit'), sites = g.ownB(undefined, false, T).filter(b => !b.built), building = sites.length > 0;
  const free = g.supplyCap(T) - g.supplyUsed(T), army = g.army(T).length, spires = own('thornspire').length, ward = own('wardpylon'), wardUp = up('wardpylon').length > 0, gate = own('reedgate'), gateUp = up('reedgate')[0];
  const stones = own('choir'), home = up('choir')[0] || stones[0]; if (!home) return;
  const wantWell = pits.length > 0 && free <= 3 && !sites.some(b => b.kind === 'hushwell') && own('hushwell').length < 6;
  const DOC = docOf(V), wantSpires = Math.max(0, (army >= 3 || g.human[foeOf(T)] ? 1 + (g.time > 420 ? 1 : 0) + (g.time > 840 ? 1 : 0) : 0) + DOC.towers);
  const put = (k: BKind, slots: number[][], line: string) => { if (cash() < BLD[k].cost || (g.paper(T) && !g.paper(T)!.allow.includes(k) && k !== 'choir')) return false; for (const [lx, lz] of slots) { const [x, z] = VP(lx, lz), at = D.freeSpot(k, Math.round(x), Math.round(z), T); if (at) { g.place(k, at[0], at[1], false, T); D.say('Conductor', line, '', T); return true; } } return false; };
  const spare = (keys: string[]) => { for (const k of keys) { const u = UPGRADES.find(x => x.key === k)!; if (!U[u.key] && g.ownB(u.at, true, T).length && (!u.needs || U[u.needs]) && cash() >= u.cost + 120) return g.buyUpgrade(u.key, T); } return false; };
  const homeLeft = g.ores.filter(n => Math.hypot(n.pos.x - HX, n.pos.z - HZ) < 40).reduce((a, n) => [a[0] + n.amount, a[1] + n.max], [0, 0]);
  const wantStones = Math.min((MAP.sites || []).length + 1, 1 + (g.time > DOC.expT || homeLeft[0] < homeLeft[1] * .5 ? 1 : 0) + (g.time > 960 ? 1 : 0) + (g.time > 1440 ? 1 : 0));
  const exp = D.vExpansion(stones, T);
  let saving = true, hold = 95;
  if (!pits.length) put('broodpit', [[-2, -10], [-2, 12], [-8, 1]], 'A Brood Pit first. The voices need somewhere to wake.');
  else if (wantWell) put('hushwell', [[6, -14], [6, 16], [0, -18], [0, 20], [-6, -16], [-6, 18]], 'The song is crowded. Growing a Hush Well.');
  else if (building) saving = false;
  // The second Stone comes before the extra towers and songs: a Chorus that waited for all of them first expanded minutes after the Ironhold, or never.
  else if (pitsUp.length && army >= Math.max(1, 4 + DOC.expArmy) && g.time > Math.min(360, DOC.expT) && exp.site && stones.length < wantStones) { hold = BLD.choir.cost; const [sx, sz] = exp.site, dx = HX - sx, dz = HZ - sz, l = Math.hypot(dx, dz) || 1, at = [4, 5, 6, 7, 9].map(r => [Math.round(sx + dx / l * r), Math.round(sz + dz / l * r)]).find(p => g.canPlace('choir', p[0], p[1], false, T));
    // As close to the seams as it will stand. A Stone is a pillar, not a shed with a long front wall: nine metres out, every Tender at a new
    // Stone walked further than a Rigger does to a Headframe's near face, and the Chorus mined a third less from the same number of hands.
    if (cash() >= BLD.choir.cost && at) { const [x, z] = at; g.place('choir', x, z, false, T); D.say('Conductor', 'Seeding a new Choir Stone on the far seam. Some Tenders will drift over.', '', T); } }
  else if (pitsUp.length && spires < Math.min(1, wantSpires)) put('thornspire', [[-12, -8], [-12, 10], [-16, 1]], 'A Thorn Spire by the road, to listen for boots.');
  else if (pitsUp.length && !ward.length && army >= 4 + DOC.tech) put('wardpylon', [[-4, 2], [-5, -4], [-5, 7]], 'A Ward Pylon. It keeps the Stones whole, and it knows the first songs.');
  else if (pitsUp.length && spires < wantSpires) put('thornspire', [[-12, -8], [-12, 10], [-16, 1], [-8, -16], [-8, 18]], 'Another Thorn Spire. The road should sting.');
  else if (wardUp && !U.vedge && army >= 5) g.buyUpgrade('vedge', T);
  else if (exp.bare) { const [bx, bz] = exp.bare; for (const [ox, oz] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) if (cash() >= BLD.thornspire.cost && g.canPlace('thornspire', bx + ox, bz + oz, false, T)) { g.place('thornspire', bx + ox, bz + oz, false, T); D.say('Conductor', 'A Thorn Spire to keep the new Stone company.', '', T); break; } }
  else if (wardUp && U.vedge && !gate.length && army >= 7 + DOC.tech) { hold = 200; put('reedgate', [[2, -17], [2, 19], [-10, -14], [-10, 16]], 'The Reed Gate grows. Something deep is listening.'); }
  else if (gateUp && army >= 6 && free >= 6 && g.own('warden', T).length + gateUp.queue.length < (g.time > 660 ? 2 : 1)) { hold = UNIT.warden.cost; if (cash() >= hold) g.train(gateUp, 'warden'); }
  else if (pits.length === 1 && pitsUp.length === 1 && g.time > DOC.prodT) put('broodpit', [[-2, 12], [-2, -10], [-8, 1], [-10, -14]], 'A second Brood Pit. Twice the voices.');
  else if (wardUp && !U.vglass && army >= 6) g.buyUpgrade('vglass', T);
  else if (gateUp && !U.vedge2 && army >= 9) { hold = 150; g.buyUpgrade('vedge2', T); }
  else if (gateUp && !U.vglass2 && army >= 10) { hold = 150; g.buyUpgrade('vglass2', T); }
  else if (spare(['vhum', 'vstep', 'vthorn', 'vbreath', 'vwide', 'vbloom'])) saving = true;
  else saving = false;
  // Tenders: eight for the home Stone and six more for each new one, woken at whichever Stone is shortest of hands.
  const tend = g.own('tender', T), hqs = up('choir');
  if (tend.length < 8 + DOC.crew + 6 * (hqs.length - 1) && free > 0 && cash() >= 50 && (pits.length || tend.length < 6)) {
    const crew = (h: Building) => tend.filter(u => g.nearHQ((u.node || u).pos.x, (u.node || u).pos.z, T) === h).length + h.queue.length;
    const h = hqs.filter(b => !b.queue.length && crew(b) < (b === home ? 8 + DOC.crew : 6)).sort((a, b) => crew(a) - crew(b))[0]; if (h) g.train(h, 'tender');
  }
  const cans = g.own('cantor', T).length, lans = g.own('lancer', T).length;
  for (const b of pitsUp) if (b.queue.length < 2) {
    const q = (k: Kind) => b.queue.filter(x => x.kind === k).length, k: Kind = lans + q('lancer') < Math.floor((cans + q('cantor')) / 2) + 1 && army >= 2 ? 'lancer' : 'cantor';
    if (cash() >= UNIT[k].cost + (saving ? hold : 0)) g.train(b, k);
  }
}
export function enemy(D: Director, dt: number) {
  const g = D.g, stones = g.stones(); if (!stones.length) return;
  const gate = g.gate(), pits = g.pits(), src = gate ? { x: GATE.x - 6, z: GATE.z } : { x: OUTPOST.x, z: OUTPOST.z };
  D.raidAge += dt; const close = (r: number) => g.units.some(u => u.alive && u.team === 1 && u.order.type === 'raid' && Math.hypot(u.pos.x, u.pos.z) < r); if (D.raidLive && !D.raidSeen && close(60)) D.raidSeen = true;
  if (D.raidLive && (D.raidSeen || D.raidAge > 75 ? !close(78) : !g.units.some(u => u.alive && u.team === 1 && u.order.type === 'raid'))) { D.raidLive = false; D.say('Alpha', 'Yard\'s clear. Somebody sweep up the purple.', ''); if (D.plan?.phase !== 'go') D.regroup(); }
  if (g.mission && !g.mission.raids) D.raidIn = 999;
  D.raidIn -= dt;
  if (D.raidIn < 15 && !D.warned) {
    D.warned = true; D.raidDir = D.raidN >= 2 && D.raidN % 2 === 0 ? 'north' : 'east';
    D.say('Lookout', D.raidDir === 'north' ? `Movement on the ${MAP.flankName}! They're coming round the back.` : `Dust on the ${MAP.road}. Raid inbound.`, 'al'); sfx.alarm();
    if (D.plan?.phase !== 'go') D.regroup(D.raidDir === 'north');
  }
  if (D.raidIn <= 0) {
    const n = D.raidN++; D.raidIn = 92 * g.diff.raid; D.warned = false; D.raidLive = true; D.raidAge = 0; D.raidSeen = false;
    let budget = Math.min((9 + 3.5 * (g.coop - 1)) * g.diff.enemy, (2 + n * .8) * g.diff.enemy * (1 + .4 * (g.coop - 1))) * (gate ? 1 : .6) * (pits.length ? .6 + .2 * pits.length : .35); const north = D.raidDir === 'north'; let count = 0;
    // The Conductor reads the yard before it writes the raid: what is standing guard, and what would hurt most to lose.
    const posts = g.ownB('watchpost', true), longs = g.own('longshot').length, heavies = g.own('breacher').length + 2 * g.own('gantry').length, riggers = g.own('rigger').filter(u => !u.pilot && u.node);
    let share = n >= 1 ? .3 : 0; if (posts.length >= 2 || heavies >= 3) share += .2; if (longs >= 2) share -= .15; share = n >= 1 ? Math.max(.1, Math.min(.55, share)) : 0;
    const verse = D.verse; D.verse = -1; if (verse === 0) { share = 0; budget += 1.5; } else if (verse === 1) share = .75;
    // Day shift gets the plain version: one group, straight down the road, no tricks.
    const smart = g.diff.enemy >= 1, pincer = smart && n >= 3 && budget >= 6 && (n % 3 === 0 || posts.length >= 3), harass = smart && n >= 2 && n % 2 === 1 && budget >= 5 && riggers.length > 0;
    // the softest building: the one furthest from any Watchpost, with the Headframe as the default
    const soft = g.ownB().filter(b => b.built && b.kind !== 'watchpost').map(b => ({ b, d: posts.reduce((m, p) => Math.min(m, Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z)), 60) + (b.kind === 'depot' ? 6 : b.kind === 'headframe' ? -8 : 0) })).sort((a, c) => c.d - a.d)[0];
    const aim = (): [number, number] => soft && smart && n >= 2 && soft.d > 30 ? [soft.b.pos.x + R(-3, 3), soft.b.pos.z + soft.b.hz + R(2, 4)] : roadPt(R(-3, 6), R(-10, -5));
    const mk = (viaNorth: boolean): Wave => { const st = viaNorth ? NORTH_PATH[Math.max(0, NORTH_PATH.length - 2)] : roadPt(Math.min(ROAD.len * .45, 56), 0), w: Wave = { units: [], sx: st[0], sz: st[1], t: 0, go: false, n0: 0, north: viaNorth, tx: 0, tz: 0 }; const a = viaNorth ? [RALLY_N.x * .3 + R(-3, 3), RALLY_N.z * .3 + R(-2, 2)] : aim(); w.tx = a[0]; w.tz = a[1]; if (!smart) { w.go = true; w.sx = w.tx; w.sz = w.tz; } D.waves.push(w); return w; };
    const main = mk(north), side = pincer ? mk(!north) : null, raiders = harass ? mk(!north && NORTH_PATH.length > 1) : null;
    if (raiders) { const r = riggers[Math.floor(Math.random() * riggers.length)]; raiders.tx = r.node!.pos.x; raiders.tz = r.node!.pos.z; raiders.hunt = true; }
    const send = (k: Kind, w: Wave) => {
      const pit = pits.length ? pits[count % pits.length] : null; const u = pit ? g.spawn(k, 1, pit.pos.x - ROAD.dx * 5.5 + R(-2, 2), pit.pos.z - ROAD.dz * 5.5 + R(-2, 2)) : g.spawn(k, 1, src.x - 8 + R(-4, 4), src.z + R(-7, 7)); if (pit) g.puff(V3(u.pos.x, 1, u.pos.z), 5, 1, M.violet, .8);
      const stop = w.north ? (w.go ? NORTH_PATH.length : Math.max(0, NORTH_PATH.length - 2)) : -1; u.order = { type: 'raid', x: w.sx + R(-4, 4), z: w.sz + R(-4, 4), path: w.north ? NORTH_PATH.slice(0, stop).map(p => [p[0] + R(-3, 3), p[1] + R(-3, 3)]) : undefined }; w.units.push(u); w.n0++; count++;
    };
    for (const u of D.remnant) if (u.alive) { main.units.push(u); main.n0++; u.order = { type: 'raid', x: main.sx + R(-4, 4), z: main.sz + R(-4, 4) }; } D.remnant = [];
    if ((n >= 4 && n % 3 === 1 && budget >= 6) || (verse === 2 && n >= 3)) { send('warden', main); budget = Math.max(1, budget - 5); }
    if (raiders) { send('cantor', raiders); send('cantor', raiders); budget -= 2; }
    const lancers = Math.floor(budget * share), cantors = Math.max(1, Math.round(budget - lancers));
    for (let i = 0; i < lancers; i++) send('lancer', side && i % 3 === 2 ? side : main);
    for (let i = 0; i < cantors; i++) send('cantor', side && i % 3 === 1 ? side : main);
    D.say('Lookout', pincer ? `${count} Veyl, and they have split up. Some on the ${MAP.road}, some over the ${MAP.flankName}.` : `${count} Veyl ${north ? 'coming over the ' + MAP.flankName : 'coming down the ' + MAP.road}. ${raiders ? 'A couple peeled off toward the diggers.' : 'They look annoyed.'}`, 'al');
  }
  // Raiders gather out of gun range and go in together. A beaten raid pulls its survivors back to join the next one.
  for (let i = D.waves.length - 1; i >= 0; i--) {
    const w = D.waves[i]; w.units = w.units.filter(u => u.alive); if (!w.units.length) { D.waves.splice(i, 1); continue; }
    if (!w.go) {
      const there = w.units.filter(u => Math.hypot(u.pos.x - w.sx, u.pos.z - w.sz) < 11).length; if (there) w.t += dt;
      if (there >= w.units.length * .8 || w.t > 30 || w.units.some(u => u.target && g.time - u.lastHit < 2)) { w.go = true; w.t = 0; const rest = w.north ? NORTH_PATH.slice(Math.max(0, NORTH_PATH.length - 2)) : []; for (const u of w.units) u.order = { type: 'raid', x: w.tx + R(-3, 3), z: w.tz + R(-3, 3), path: rest.length ? rest.map(p => [p[0] + R(-3, 3), p[1] + R(-3, 3)]) : undefined }; }
    } else {
      w.t += dt;
      if (g.diff.enemy >= 1 && w.n0 >= 4 && w.units.length <= Math.max(1, Math.floor(w.n0 * .25)) && !w.units.some(u => u.kind === 'warden') && stones.length) { for (const u of w.units) { u.order = { type: 'raid', x: roadPt(ROAD.len * .75, 0)[0] + R(-4, 4), z: roadPt(ROAD.len * .75, 0)[1] + R(-4, 4) }; u.target = null; D.remnant.push(u); } D.waves.splice(i, 1); D.say('Lookout', 'They are pulling back. That will not be the last of them.', ''); continue; }
      // Nothing left to hit where they stand: move on to the nearest thing that is still up.
      if (w.t > 2) { w.t = 0; for (const u of w.units) { if (u.target || (u.order.path && u.order.path.length) || Math.hypot(u.pos.x - u.order.x, u.pos.z - u.order.z) > 7) continue; let bd = 1e9, nb: Building | null = null; for (const b of g.buildings) if (b.alive && b.team === 0) { const d = Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z); if (d < bd) { bd = d; nb = b; } } if (nb) { u.order.x = nb.pos.x + R(-2, 2); u.order.z = nb.pos.z + nb.hz + R(1, 3); } } }
    }
  }
  // Broken Thorn Spires grow back while the Stones still sing and nobody is near to stop them.
  if (!D.spireHome) D.spireHome = g.buildings.filter(b => b.kind === 'thornspire').map(b => [b.pos.x, b.pos.z]);
  D.growT -= dt; if (D.growT <= 0) { D.growT = 110 / g.diff.enemy; const gone = g.diff.enemy <= 1 ? undefined : D.spireHome.find(([x, z]) => !g.buildings.some(b => b.alive && b.kind === 'thornspire' && Math.abs(b.pos.x - x) < 1 && Math.abs(b.pos.z - z) < 1)); if (gone && !g.units.some(u => u.alive && u.team === 0 && Math.hypot(u.pos.x - gone[0], u.pos.z - gone[1]) < 55)) { g.addBuilding('thornspire', 1, gone[0], gone[1], true); g.puff(V3(gone[0], 2, gone[1]), 8, 1.6, M.violet, 1); } }
  if (D.alarmT > 0) {
    D.alarmT -= dt; D.alarmCd -= dt; const def = g.units.filter(u => u.alive && u.team === 1 && u.order.type === 'guard' && u.kind !== 'warden' && !u.pilot);
    // Guards with nothing to fight walk out to the shooter, however far away the shooter thinks is safe.
    for (const u of def) if (!u.target) { u.order.x = D.alarmX + ((u.id * 7) % 9 - 4); u.order.z = D.alarmZ + ((u.id * 5) % 9 - 4); }
    // The Chorus swarms anyone who comes alone. A proper push meets the usual garrison and a little extra.
    const crowd = g.units.filter(u => u.alive && u.team === 0 && u.kind !== 'rigger' && Math.hypot(u.pos.x - D.alarmX, u.pos.z - D.alarmZ) < 45).length, lone = crowd <= 2 * g.coop;
    const cap = Math.round((4 + stones.length + (lone ? 3 + Math.min(5, g.time / 150) : crowd <= 4 ? 2 : 1)) * g.diff.enemy * (1 + .4 * (g.coop - 1)));
    if (D.alarmCd <= 0 && def.length < cap) {
      D.alarmCd = (gate ? (lone ? 4.5 : 9) : 12) / g.diff.enemy; const k: Kind = D.alarmN++ % 3 === 2 ? 'lancer' : 'cantor', u = g.spawn(k, 1, src.x + R(-2, 2), src.z + R(-3, 3));
      u.order = { type: 'guard', x: D.alarmX + R(-3, 3), z: D.alarmZ + R(-3, 3) }; g.puff(V3(u.pos.x, 1, u.pos.z), 5, 1, M.violet, .8);
    }
    if (D.alarmT <= 0) for (const u of def) { u.order.x = OUTPOST.x - 8 + R(-8, 4); u.order.z = OUTPOST.z + R(-9, 9); }
  }
  D.reinT -= dt;
  if (D.reinT <= 0) {
    D.reinT = gate ? 24 : 60; const guards = g.units.filter(u => u.alive && u.team === 1 && u.order.type === 'guard' && u.kind !== 'warden');
    if (guards.length < 4 + stones.length) { const k: Kind = guards.filter(u => u.kind === 'lancer').length < 2 ? 'lancer' : 'cantor'; const u = g.spawn(k, 1, src.x + R(-2, 2), src.z + R(-3, 3)); u.order = { type: 'guard', x: OUTPOST.x - 8 + R(-8, 4), z: OUTPOST.z + R(-9, 9) }; }
  }
}

defineFaction(1, {
  brain: (D, dt, S) => conductor(D, dt, S), classic: (D, dt) => enemy(D, dt), hints: VHINTS, books: VBOOKS,
  chatter: () => VCHATTER, lines: kind => kind === 'kill' ? VKILL : VDOWN,
  trained(D, u) {
    if (!D.g.eco) return;
    if (u.kind === 'cantor' && !D.flags.vcan) { D.flags.vcan = true; D.say('Cantor', 'A Cantor wakes. Look at me and press F to take the blades. Right click whirls.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'lancer' && !D.flags.vlan) { D.flags.vlan = true; D.say('Lancer', 'A Lancer, listening. Click throws the long note; right click holds it through a whole line.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'warden' && !D.flags.vwar) { D.flags.vwar = true; D.say('Warden', 'The deep voice is awake. Click slams the ground; right click gives every Veyl near me its shield back.', 'in', u.team); sfx.callout(); }
  },
  built(D, b) {
    if (!D.g.eco) return;
    if (b.kind === 'broodpit' && !D.flags.vpit) { D.flags.vpit = true; D.say('Conductor', 'The Brood Pit is open. Look at it and press E for a Cantor, T for a Lancer.', 'in', b.team); }
    else if (b.kind === 'wardpylon') D.say('Conductor', 'The Ward Pylon sings. Buildings near it take less harm, and it teaches the first songs.', 'in', b.team);
    else if (b.kind === 'reedgate') D.say('Conductor', 'The Reed Gate is open. A Warden can wake there now.', 'in', b.team);
    else if (b.kind === 'choir') D.say('Conductor', 'A new Choir Stone sings. Tenders can bring ore here.', 'in', b.team);
  },
  lost(D, b, left) {
    const g = D.g;
    if (g.eco) { D.say('Watcher', `The ${BLD[b.kind].name} has fallen silent.`, 'al', b.team); if (b.kind === 'choir' && left) D.say(LOOKOUT[fac(foeOf(b.team))], `A Choir Stone is down. ${left} still singing.`, 'in', foeOf(b.team)); else if (b.kind !== 'choir') D.say('Alpha', `${BLD[b.kind].name} down. Keep swinging.`, '', foeOf(b.team)); return; }
    // The classic match: the yard's Lookout and squad call out each piece of the outpost that falls.
    if (b.kind === 'reedgate') { D.say('Lookout', 'Reed Gate is down! Their reinforcements just got a lot slower.', 'in', SIDE.home); sfx.callout(); return; }
    if (b.kind === 'broodpit') { const n = g.pits().length; D.say('Lookout', n ? 'Brood Pit caved in! Their raids just got thinner.' : 'Both Brood Pits are gone. Whatever raids are left will be scraps.', 'in', SIDE.home); sfx.callout(); return; }
    if (b.kind === 'thornspire') { D.say('Alpha', 'Thorn Spire down. That one owed me a helmet.', '', SIDE.home); return; }
    if (b.kind === 'wardpylon') { D.say('Lookout', 'Ward Pylon is down! The Stones are soft now. Hit them!', 'in', SIDE.home); sfx.callout(); if (D.plan?.phase === 'go') { D.plan.target = g.nearestStone(b.pos); for (const u of g.soldiers()) if (u.order.type === 'amove' && D.plan.target) u.order = { type: 'amove', x: D.plan.target.pos.x, z: D.plan.target.pos.z }; } return; }
    if (b.kind === 'choir') {
      const left = g.stones().length; D.lastFailed = false;
      if (left && !D.flags.warden) { D.flags.warden = true; const w = g.spawn('warden', 1, OUTPOST.x + 6, OUTPOST.z); w.order = { type: 'guard', x: OUTPOST.x - 4, z: OUTPOST.z }; D.say('Lookout', 'Stone down, and something big just woke up in there. Warden! Stay out of the pink ring.', 'al', SIDE.home); sfx.alarm(); }
      else if (left) D.say('Alpha', left === 1 ? 'One Stone left! I can taste the bonus.' : 'Stone down. Keep swinging.', '', SIDE.home);
      if (left && D.plan?.phase === 'go') { D.plan.target = g.nearestStone(b.pos); for (const u of g.soldiers()) if (u.order.type === 'amove' && D.plan.target) u.order = { type: 'amove', x: D.plan.target.pos.x, z: D.plan.target.pos.z }; }
    }
  },
});
