// The Veyl bot brain, the Conductor: what to grow where, what to wake and which songs to learn; the free raid factory of the classic match
// (Ironhold at home against an outpost nobody plays); and every line the Veyl say in the feed.
import { V3, R, M } from '../../gfx';
import { sfx } from '../../audio';
import type { Director, Side, Wave } from '../../director';
import { docOf } from '../../director';
import { Kind, BKind, UNIT, BLD, UPGRADES, Building, OUTPOST, GATE, RALLY_N, NORTH_PATH, MAP, ROAD, SIDE, veylPt, roadPt, foeOf, fac, endPt, homeXZ } from '../../data';
import { defineFaction } from '../../core/registry';
import { conductor } from './conductor';
import { V_TUNE } from './numbers';
export { conductor };
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
    const g = D.g, U = g.upOf(u.team) as any;
    // Research a new body is born with that game.ts does not count: Shell levels, and Air Glass for fliers.
    const sh = (U.vshell ? 1.1 : 1) * (U.vshell2 ? 1.1 : 1) * (U.vshell3 ? 1.1 : 1); u.maxShield *= sh; u.shield *= sh;
    if (UNIT[u.kind].air) { const a = (U.vaglass ? V_TUNE.air[0] : 1) * (U.vaglass2 ? V_TUNE.air[1] : 1) * (U.vaglass3 ? V_TUNE.air[2] : 1); u.maxHp *= a; u.hp *= a; u.maxShield *= a; u.shield *= a; }
    if (u.kind === 'omen' && U.vomen) { u.maxEnergy = (u.maxEnergy || 200) + 50; u.energy = (u.energy || 0) + 50; }
    if (!g.eco) return;
    const first = (flag: string, who: string, line: string) => { if (D.flags[flag + u.team]) return; D.flags[flag + u.team] = true; D.say(who, line, 'in', u.team); sfx.callout(); };
    if (u.kind === 'cantor') first('vcan', 'Cantor', 'A Cantor is ready. Look at it and press F to drive it. Click cuts, right click spins and cuts everything around you.');
    if (u.kind === 'lancer') first('vlan', 'Lancer', 'A Lancer is ready. Click fires a bolt; right click holds a long beam that goes through a whole line.');
    if (u.kind === 'warden') first('vwar', 'Warden', 'A Warden is ready. Click slams the ground in front of it; right click puts 60 shield back on every Veyl body near it.');
    if (u.kind === 'tuner') first('vtun', 'Tuner', 'A Tuner is ready. R puts up a glass pane that blocks a path for 11 seconds, C makes friends near it take 2 less from each hit, V makes two fake copies of a friend.');
    if (u.kind === 'mute') first('vmut', 'Conductor', 'A Mute is ready. Enemies cannot see it unless something of theirs that detects is near. Click cuts.');
    if (u.kind === 'choirmaster') first('vcho', 'Choirmaster', 'A Choirmaster is ready. R marks a circle that cracks for 80 damage over 4 seconds, C drains an enemy\'s energy, V joins with another Choirmaster into a Chord.');
    if (u.kind === 'chord') first('vchd', 'Conductor', 'Two Choirmasters joined into a Chord: one body, nearly all shield, hitting everything near its target.');
    if (u.kind === 'bell') first('vbel', 'Bell', 'A Bell is ready. Its shots do 30 more to plated and huge bodies. Its Ring Shell soaks the first 100 damage, and grows back 30 seconds after it breaks.');
    if (u.kind === 'reedwalker') first('vree', 'Reedwalker', 'A Reedwalker is ready. Its beam sweeps a 4 metre line. It can step up cliffs, and enemy anti-air guns can hit it.');
    if (u.kind === 'knell') first('vkne', 'Knell', 'A Knell is ready. Click rolls an orb to a spot; 3 seconds later it bursts for 145 on everything near it, ours too.');
    if (u.kind === 'listener') first('vlis', 'Listener', 'A Listener is in the air. Enemies cannot see it, and it shows us their unseen bodies within 12 metres. C makes it stop and stay.');
    if (u.kind === 'ferry') first('vfer', 'Ferry', 'A Ferry is ready. R takes in friends next to it, V lets them out, C lands it and opens a song field.');
    if (u.kind === 'swift') first('vswi', 'Swift', 'A Swift is in the air. It only hits fliers. C lifts an enemy ground body off its feet for 8 seconds.');
    if (u.kind === 'prism') first('vpri', 'Prism', 'A Prism is in the air. Its beam does more to plated bodies, and C makes it much stronger against them for 12 seconds.');
    if (u.kind === 'omen') first('vome', 'Omen', 'An Omen is in the air. Click turns its beam on and off (it burns energy). C shows every unseen enemy in a circle, V leaves a trap that freezes bodies for 20 seconds.');
    if (u.kind === 'lyre') first('vlyr', 'Lyre', 'A Lyre is in the air. It builds Shards, 15 ore each, up to 8, and sends them at whatever it fights.');
    if (u.kind === 'cantus') first('vcan2', 'Cantus', 'The Cantus is in the air. Friends near it cannot be seen. C calls a group to it from anywhere, R slows every enemy in a circle.');
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
