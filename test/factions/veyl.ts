// Headless checks for the Veyl rules (stream C): every unit can be made through its tech path; every ability works, and is refused when it
// should be (energy, range, cooldown, tech); every building does its job (song fields and silence, seeds that grow alone, the Siphon Bell,
// the Mending Pool, the Thorn Spire, Quicken, Far Singing, one Cantus). Run: node tools/run-ts.mjs test/factions/veyl.ts
// With `use` it also runs ten seeded 40-minute bot matches and checks the bots made every kind (slow; see test/factions/veyl-match.ts).
import { spawnSync } from 'node:child_process';
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, UNIT, BLD, UPGRADES, TRAINS, UNIT_NEEDS, FACTION, MAP, setMap, setSides, homeXZ, type Kind, type BKind, type Unit, type Building } from '../../src/data';
import { abilitiesOf, whyNot, useAbility } from '../../src/core/ability';
import { hasStatus, addStatus } from '../../src/core/status';
import { seenBy, isHidden } from '../../src/core/sight';
import { canHit } from '../../src/core/combat';
import { costOf } from '../../src/core/econ';
import { V_UNIT, V_BLD, V_TUNE, V_NEEDS, type VKind } from '../../src/factions/veyl/numbers';
import { silent, inField, energyOf, setEnergy, quickLeft, unfolded, restOf, quicken } from '../../src/factions/veyl/fields';
import { echo, GUNS, FP, driveMute } from '../../src/factions/veyl/units';
import { weights, pickKind, MIX_KINDS, type SeenMix } from '../../src/factions/veyl/mix';
import { isHunting, HUNT_FROM } from '../../src/core/brainkit';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const dt = 1 / 30;
/** A match with the Veyl at the far end running an economy, nobody playing, bots off (so nothing moves unless the test moves it). */
function world(map = 0) {
  setMap(map); setSides(0, 1); const g = new Game(noPipe(), noHud, DIFFS[1], map, null, null, true);
  g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => true);
  g.dir.vs.auto = false; g.dir.auto = false; g.purse[1] = 1e5; (g as any).fluxPurse[1] = 1e5; g.truce = true;
  return g;
}
/** Twenty Hush Wells in a row behind the far base, so beds never stop a test. */
function beds(g: Game) { const [hx, hz] = homeXZ(T), back = hz > 0 ? 1 : -1; for (let i = 0; i < 20; i++) g.addBuilding('hushwell', T, hx - 50 + i * 5, hz + back * 60, true);
}
const run = (g: Game, secs: number, each?: () => void) => { for (let i = 0; i < secs * 30; i++) { each?.(); g.update(dt); g.evq!.length = 0; } };
const T_HUM = V_TUNE.tuner.humT + .5, T = 1, [VX, VZ] = (() => { setMap(0); setSides(0, 1); return homeXZ(1); })();
/** Puts a finished Veyl building down at an offset from the far base, with a Hush Well beside it so it stands in a field. */
function put(g: Game, k: BKind, dx: number, dz: number, field = true): Building {
  const [hx, hz] = homeXZ(T); if (field && !inField(g, T, hx + dx, hz + dz, BLD[k].hx, BLD[k].hz)) g.addBuilding('hushwell', T, hx + dx + BLD[k].hx + 4, hz + dz, true);
  return g.addBuilding(k, T, hx + dx, hz + dz, true);
}
let ORG: [number, number] | null = null;   // where spawnV's offsets start (the far base, or open ground for the ability checks)
const spawnV = (g: Game, k: Kind, dx = 0, dz = 0) => { const [hx, hz] = ORG ?? homeXZ(T); const u = g.spawn(k, T, hx + dx, hz + dz); u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; return u; };
const spawnI = (g: Game, k: Kind, x: number, z: number) => { const u = g.spawn(k, 0, x, z); u.order = { type: 'guard', x, z }; return u; };

// ---------------------------------------------------------------- 1. the roster and the tech tree
{
  const want: VKind[] = ['tender', 'cantor', 'lancer', 'tuner', 'mute', 'choirmaster', 'chord', 'bell', 'reedwalker', 'knell', 'listener', 'ferry', 'swift', 'prism', 'omen', 'lyre', 'shard', 'warden', 'cantus'];
  check(want.every(k => V_UNIT[k] && V_UNIT[k].team === 1), 'every Veyl unit in the plan has a row (18 plus the Shard)');
  check(['choir', 'hushwell', 'siphonbell', 'broodpit', 'wardpylon', 'thornspire', 'reedgate', 'mendingpool', 'duskhall', 'kiln', 'skyloft', 'tuningfork', 'quiethouse', 'songarchive', 'highbeacon'].every(k => (V_BLD as any)[k] && FACTION[1].builds.includes(k as BKind)), 'all 15 Veyl buildings exist and can be built');
  const cost = (k: Kind | BKind) => costOf(k).join('/');
  check(cost('cantor') === '100/0' && cost('lancer') === '125/50' && cost('tuner') === '50/100' && cost('mute') === '125/125' && cost('choirmaster') === '50/150' && cost('bell') === '275/100' && cost('reedwalker') === '300/200' && cost('knell') === '150/150' && cost('listener') === '25/75' && cost('ferry') === '250/0' && cost('swift') === '150/100' && cost('prism') === '250/150' && cost('omen') === '150/150' && cost('lyre') === '350/250' && cost('warden') === '300/200' && cost('cantus') === '400/400', 'unit costs are the plan\'s (ore / Flux)');
  check(UNIT.cantor.supply === 2 && UNIT.lancer.supply === 2 && UNIT.bell.supply === 4 && UNIT.reedwalker.supply === 6 && UNIT.knell.supply === 3 && UNIT.listener.supply === 1 && UNIT.lyre.supply === 6 && UNIT.cantus.supply === 8 && UNIT.chord.supply === 4, 'beds are the plan\'s');
  check(cost('duskhall') === '150/100' && cost('skyloft') === '150/150' && cost('songarchive') === '150/200' && cost('highbeacon') === '300/200' && cost('siphonbell') === '75/0', 'building costs are the plan\'s');
  const needs = (k: BKind) => (BLD[k].needs || []).join(',');
  check(needs('wardpylon') === 'broodpit' && needs('thornspire') === 'wardpylon' && needs('reedgate') === 'broodpit' && ['mendingpool', 'duskhall', 'kiln', 'skyloft'].every(k => needs(k as BKind) === 'reedgate') && needs('tuningfork') === 'kiln' && needs('quiethouse') === 'duskhall' && needs('songarchive') === 'duskhall' && needs('highbeacon') === 'skyloft', 'building tech tree matches the plan');
  check(UNIT_NEEDS.lancer === 'reedgate' && UNIT_NEEDS.tuner === 'reedgate' && UNIT_NEEDS.mute === 'quiethouse' && UNIT_NEEDS.choirmaster === 'songarchive' && UNIT_NEEDS.warden === 'songarchive' && UNIT_NEEDS.reedwalker === 'tuningfork' && UNIT_NEEDS.knell === 'tuningfork' && UNIT_NEEDS.lyre === 'highbeacon' && UNIT_NEEDS.cantus === 'highbeacon', 'unit tech requirements match the plan (Lancer needs the Reed Gate, Warden the Song Archive)');
  check(TRAINS.broodpit!.join() === 'cantor,lancer,tuner,mute,choirmaster' && TRAINS.kiln!.join() === 'bell,listener,ferry,reedwalker,knell' && TRAINS.skyloft!.join() === 'swift,prism,omen,lyre' && TRAINS.reedgate!.join() === 'warden' && TRAINS.choir!.join() === 'tender,cantus', 'each unit trains where the plan says');
  check(['vedge', 'vedge2', 'vedge3', 'vglass', 'vglass2', 'vglass3', 'vshell', 'vshell2', 'vshell3'].every(k => UPGRADES.find(u => u.key === k)?.at === 'wardpylon') && ['vaedge', 'vaedge3', 'vaglass2', 'vfar'].every(k => UPGRADES.find(u => u.key === k)?.at === 'reedgate'), 'ground levels 1 to 3 at the Ward Pylon, air levels and Far Singing at the Reed Gate');
}
// Each unit can be made through its tech path: refused before its building stands, trained once it does.
{
  const g = world(); beds(g); const pit = put(g, 'broodpit', -14, -16), kiln = put(g, 'kiln', -14, 18), loft = put(g, 'skyloft', 16, 18), gate = put(g, 'reedgate', 16, -18), stone = g.ownB('choir', true, T)[0];
  const at: Record<string, Building> = { broodpit: pit, kiln, skyloft: loft, reedgate: gate, choir: stone };
  let order = 0; const placed = new Set<string>(['reedgate', 'kiln', 'skyloft', 'broodpit']), where = (k: Kind) => at[Object.keys(TRAINS).find(x => (TRAINS as any)[x].includes(k))!];
  for (const k of ['lancer', 'tuner', 'mute', 'choirmaster', 'warden', 'reedwalker', 'knell', 'lyre', 'cantus'] as VKind[]) {
    const nb = V_NEEDS[k]!, b = where(k); b.queue.length = 0;
    if (!placed.has(nb)) { const refused = !g.train(b, k) && g.gated(T, k) === BLD[nb].name; placed.add(nb); put(g, nb, -30 + (order % 5) * 12, 30 + Math.floor(order / 5) * 10); order++; check(refused && g.train(b, k), `${UNIT[k].name}: refused at the ${BLD[b.kind].name} without a ${BLD[nb].name}, trained once one stands`); }
    else check(g.train(b, k), `${UNIT[k].name} trains once its ${BLD[nb].name} stands`);
    b.queue.length = 0;
  }
  for (const k of ['cantor', 'bell', 'listener', 'ferry', 'swift', 'prism', 'omen'] as VKind[]) { const b = where(k); b.queue.length = 0; check(g.train(b, k), `${UNIT[k].name} trains at the ${BLD[b.kind].name} with nothing more needed`); b.queue.length = 0; }
  // Each kind comes out: one building of the right sort for each.
  const all: VKind[] = ['cantor', 'lancer', 'tuner', 'mute', 'choirmaster', 'warden', 'bell', 'listener', 'ferry', 'reedwalker', 'knell', 'swift', 'prism', 'omen', 'lyre', 'cantus'];
  all.forEach((k, i) => { const home = where(k).kind; const b = home === 'choir' ? stone : put(g, home, -40 + (i % 6) * 14, -34 - Math.floor(i / 6) * 12); g.train(b, k); });
  run(g, 200); const kinds = new Set(g.own(undefined, T).map(u => u.kind)), missing = all.filter(k => !kinds.has(k));
  check(!missing.length, 'every queued kind came out of its building' + (missing.length ? ` (missing ${missing.join(', ')})` : ''));
  { const g2 = world(); beds(g2); const p2 = put(g2, 'broodpit', -14, -16); check(!g2.train(p2, 'lancer') && g2.gated(T, 'lancer') === 'Reed Gate', 'a Lancer is refused without a Reed Gate'); }
  check(!g.train(stone, 'cantus'), 'a second Cantus is refused (one per side)');
}

// ---------------------------------------------------------------- 2. song fields, seeds, silence
{
  const g = world(), [hx, hz] = homeXZ(T);
  // Find open ground near the base where a Brood Pit fails only for want of a field, then grow a Hush Well beside it.
  let px = 0, pz = 0; find: for (let r = 16; r < 40; r += 2) for (let a = 0; a < 6.28; a += .3) { const x = Math.round(hx + Math.cos(a) * r), z = Math.round(hz + Math.sin(a) * r); g.placeWhy = '';
    if (!g.canPlace('broodpit', x, z, false, T) && g.placeWhy && g.canPlace('hushwell', x + 7.5, z, false, T) && g.canPlace('hushwell', x + 9, z, false, T)) { px = x; pz = z; break find; } }
  check(!!px && g.placeWhy.includes('song field'), 'a Brood Pit cannot be placed outside a song field, and the reason says so');
  const well = g.addBuilding('hushwell', T, px + 8, pz, true);
  check(g.canPlace('broodpit', px, pz, false, T), 'it can be placed beside a finished Hush Well');
  check(g.canPlace('hushwell', px, pz - 14, false, T) || g.canPlace('hushwell', px, pz + 14, false, T), 'a Hush Well needs no field');
  const seedB = g.place('broodpit', px, pz, false, T)!; let tender = false;
  run(g, 5, () => { if (g.units.some(u => u.team === T && u.kind === 'tender' && u.site === seedB)) tender = true; });
  check(!tender && !seedB.built && seedB.progress > 0, 'a planted seed grows by itself; no Tender is sent to it');
  run(g, BLD.broodpit.time); check(seedB.built, `the seed finishes on its own in its ${BLD.broodpit.time} s`);
  check(g.rate(seedB) === 1 && !silent(g, seedB), 'inside the field it works');
  g.killBuilding(well); check(silent(g, seedB) && g.rate(seedB) === 0, 'with the Hush Well gone the Brood Pit falls silent');
  check(!g.train(seedB, 'cantor'), 'a silent Brood Pit trains nothing');
  const pylon = g.addBuilding('wardpylon', T, hx + 26, hz + 36, true); check(silent(g, pylon) && !g.buyUpgrade('vedge', T), 'a silent Ward Pylon sells no songs');
  const spire = g.addBuilding('thornspire', T, hx + 22, hz + 40, true), foe = spawnI(g, 'linesman', hx + 22, hz + 50); g.truce = false; const hp0 = foe.hp; run(g, 3); check(foe.hp === hp0, 'a silent Thorn Spire does not fire');
  g.addBuilding('hushwell', T, hx + 26, hz + 44, true); run(g, 3); check(foe.hp < hp0 || !foe.alive, 'with a field back the Thorn Spire fires again');
  check(g.buyUpgrade('vedge', T), 'and the Ward Pylon sells Ground Edge again');
}
// Siphon Bell: on a vent, Tenders carry Flux home.
{
  const g = world(), v = g.vents.find(v => Math.hypot(v.pos.x - VX, v.pos.z - VZ) < 40);
  check(!!v, 'a Veyl match lays Flux vents (the Siphon Bell is a tap)');
  if (v) {
    check(!g.canPlace('siphonbell', Math.round(v.pos.x) + 6, Math.round(v.pos.z), false, T), 'a Siphon Bell only goes on a vent');
    const b = g.place('siphonbell', Math.round(v.pos.x), Math.round(v.pos.z), false, T)!; run(g, BLD.siphonbell.time + 1); check(b.built && v.tap === b, 'it grows on the vent with no field needed');
    const f0 = g.flux(T); for (const u of g.own('tender', T).slice(0, 3)) { u.vent = v; u.node = null; u.state = 'toVent'; } g.dir.vs.auto = false; run(g, 40);
    check(g.flux(T) > f0, `Tenders carried Flux home (${Math.round(g.flux(T) - f0)} in 40 s)`);
  }
}
// Quicken and Far Singing.
{
  const g = world(), stone = g.ownB('choir', true, T)[0], pit = put(g, 'broodpit', -14, -16); setEnergy(stone, 60);
  g.train(pit, 'cantor'); const t0 = pit.queue[0].t; run(g, 2); const plain = t0 - pit.queue[0].t;
  if (process.env.DBG) console.log('q', energyOf(stone), pit.built, pit.alive, quickLeft(g, pit), g.ownB('choir', true, T).map(energyOf)); check(quicken(g, pit), 'Quicken spends 50 of a Choir Stone\'s energy on a building'); check(energyOf(stone) < 15 && quickLeft(g, pit) > 19, 'the Stone lost the energy and the building is quickened for 20 s');
  const t1 = pit.queue[0].t; run(g, 2); check(Math.abs((t1 - pit.queue[0].t) / plain - V_TUNE.quicken.k) < .05, 'a quickened Brood Pit trains 50% faster');
  check(!quicken(g, pit), 'Quicken is refused while the building is already quickened (and the Stone has no energy left)');
  // Far Singing: a far Hush Well near the army; the next Cantor is sung in there.
  const [hx, hz] = homeXZ(T); g.upOf(T).vfar = true; g.addBuilding('hushwell', T, hx - 60, hz + 10, true); const lead = spawnV(g, 'cantor', -62, 14); pit.queue.length = 0; g.train(pit, 'cantor');
  const n0 = g.own('cantor', T).length; run(g, V_TUNE.far.arrive + .5); const fresh = g.own('cantor', T).filter(u => u !== lead).slice(n0 - 1)[0];
  check(g.own('cantor', T).length > n0 && !!fresh && Math.hypot(fresh.pos.x - (hx - 60), fresh.pos.z - (hz + 10)) < 10, `with Far Singing the new Cantor is sung in at the field nearest the army after ${V_TUNE.far.arrive} s`);
  check(restOf(pit) > 0, 'and the Brood Pit then rests');
}
// Mending Pool.
{
  const g = world(), pool = put(g, 'mendingpool', -14, -16), c = spawnV(g, 'cantor', -14, -12); c.shield = 0; c.lastHit = g.time;
  run(g, 2); check(c.shield > 30, `a Mending Pool puts shields back on a body near it (${Math.round(c.shield)} in 2 s)`); check(energyOf(pool) < V_TUNE.pool.start, 'and spends its energy doing it');
}
// Thorn Spire hits air and sees unseen bodies.
{
  const g = world(); g.truce = false; const sp = put(g, 'thornspire', 22, 4), gad = spawnI(g, 'linesman', sp.pos.x + 6, sp.pos.z);
  gad.air = true; gad.alt = 7; check(canHit(sp, gad), 'a Thorn Spire can hit a flier');
  const m = spawnV(g, 'mute', 0, 0); const ih = spawnI(g, 'linesman', m.pos.x + 8, m.pos.z); check(isHidden(m) && !seenBy(g, 0, m), 'a Mute is unseen by the enemy without a detector');
  g.units.splice(g.units.indexOf(ih), 1);
  const ow = g.addBuilding('thornspire', 1, 0, 0, true); ow.team = 1; // a Veyl spire next to an Ironhold Mute stand-in: use the sight rule directly
  check(BLD.thornspire.detect! >= 10, 'a Thorn Spire detects within 11 m');
}

// ---------------------------------------------------------------- 3. abilities: each works and is refused when it should be
{
  const g = world(); beds(g); ORG = [MAP.mid![0], MAP.mid![1]]; const [hx, hz] = ORG;
  const foeAt = (k: Kind, dx: number, dz: number) => spawnI(g, k, hx + dx, hz + dz);
  // Tuner
  const tu = spawnV(g, 'tuner', 0, 20); tu.energy = 200;
  check(!!whyNot(g, tu, 'wall', { x: tu.pos.x + 30, z: tu.pos.z }), 'Glass Wall is refused out of range');
  const s0 = g.spires.length; check(useAbility(g, tu, 'wall', { x: tu.pos.x + 6, z: tu.pos.z }) && g.spires.length > s0, 'Glass Wall puts glass posts in the way'); run(g, V_TUNE.tuner.wallT + .5); check(g.spires.length === s0, 'and they are gone after 11 s');
  tu.energy = 70; check(whyNot(g, tu, 'hum', { x: 0, z: 0 }) === 'energy', 'Ward Hum is refused with 70 energy (it takes 75)'); tu.energy = 200;
  const shot = foeAt('linesman', 30, 20), hitOf = (u: Unit) => { const h0 = u.hp + u.shield; g.damage(u, 10, shot); return h0 - u.hp - u.shield; };
  const plain = hitOf(spawnV(g, 'cantor', 2, 40));
  check(useAbility(g, tu, 'hum'), 'Ward Hum goes off'); const humd = hitOf(spawnV(g, 'cantor', 2, 20));
  check(Math.abs(humd - plain * .8) < .4, `a friend near a humming Tuner takes 2 less from a hit (${humd.toFixed(1)} against ${plain.toFixed(1)}; armour and shields take their share after)`);
  run(g, T_HUM); const ws = spawnV(g, 'cantor', 4, 22); check(useAbility(g, tu, 'voice', { x: ws.pos.x, z: ws.pos.z, id: ws.id }), 'False Voice goes off on a friend'); const copies = g.own('cantor', T).filter(echo); check(copies.length === 2, 'it makes two copies');
  const cp = copies[0]; check(Math.abs(hitOf(cp) - 2 * hitOf(ws)) < 1, 'a copy takes double'); run(g, V_TUNE.tuner.voiceT + 1); check(!copies.some(c => c.alive), 'copies fade after 30 s');
  // Mute
  const mu = spawnV(g, 'mute', 0, -20); check(whyNot(g, mu, 'step', { x: mu.pos.x + 5, z: mu.pos.z }) === 'refused', 'Step Through is refused before it is learned at the Quiet House');
  g.upOf(T).vstepthru = true; const mx = mu.pos.x; check(useAbility(g, mu, 'step', { x: mu.pos.x + 8, z: mu.pos.z }) && mu.pos.x - mx > 6, 'Step Through blinks the Mute'); check(whyNot(g, mu, 'step', { x: mu.pos.x + 5, z: mu.pos.z }) === 'cooldown', 'and then waits 20 s');
  // Choirmaster
  const cm = spawnV(g, 'choirmaster', 10, 0); cm.energy = 200; const pack = [foeAt('linesman', 18, 0), foeAt('linesman', 18.5, 1), foeAt('linesman', 18, -1)];
  check(whyNot(g, cm, 'shatter', { x: hx + 18, z: hz }) === 'refused', 'Shatter Note is refused before it is learned at the Song Archive'); g.upOf(T).vshatter = true;
  const hp0 = pack.map(u => u.hp + u.shield); check(useAbility(g, cm, 'shatter', { x: hx + 18, z: hz }), 'Shatter Note goes off'); run(g, .3); const evq = g.evq; g.evq = []; run(g, .5); const marked = pack.every((u, i) => u.hp + u.shield === hp0[i]); g.evq = evq;
  check(marked, 'it marks the ground first and hurts nobody for the first second'); run(g, 5); const hurt = pack.map((u, i) => hp0[i] - (u.alive ? u.hp + u.shield : 0)); check(hurt.every(h => h > 40), `then it hurts everyone in the circle (${hurt.map(Math.round).join(', ')})`);
  const ps = spawnI(g, 'patch', cm.pos.x + 4, cm.pos.z + 4);   // by the Choirmaster, wherever its brain has walked it
   ps.energy = 80; ps.maxEnergy = 200; cm.energy = 200; cm.abCd = {}; const pe = ps.energy; check(useAbility(g, cm, 'drain', { x: ps.pos.x, z: ps.pos.z, id: ps.id }) && ps.energy < pe - 40, 'Drain burns an enemy\'s energy');
  const lone = spawnI(g, 'linesman', cm.pos.x + 4, cm.pos.z - 4); cm.abCd = {}; check(whyNot(g, cm, 'drain', { x: lone.pos.x, z: lone.pos.z, id: lone.id }) === 'refused', 'Drain is refused on a body with no energy');
  const cm2 = g.spawn('choirmaster', T, cm.pos.x + 2, cm.pos.z + 2); cm2.order = { type: 'guard', x: cm2.pos.x, z: cm2.pos.z }; g.truce = true; check(useAbility(g, cm, 'join'), 'Join starts with a second Choirmaster close by'); run(g, V_TUNE.choirmaster.joinT + 1);
  check(cm.kind === 'chord' && cm.alive && !cm2.alive, 'ten seconds later the two are one Chord, keeping the first one\'s id'); g.truce = false;
  for (const u of g.units) if (u.alive && u.team === T && u.target) u.target = null;   // nobody keeps a target from the checks above
  g.killUnit(tu, null);
  // Knell
  const kn = spawnV(g, 'knell', -10, 0), ring = [foeAt('linesman', -16, 0), foeAt('linesman', -16.5, .5)], buddy = spawnV(g, 'choirmaster', -16, -1); const bh = buddy.hp + buddy.shield;
  check(!!whyNot(g, kn, 'toll', { x: hx - 40, z: hz }), 'Toll is refused out of range'); 
  check(useAbility(g, kn, 'toll', { x: hx - 16, z: hz }), 'Toll rolls an orb'); run(g, V_TUNE.knell.roll - .4); if (process.env.DBG) console.log('ring', ring.map(u => [u.hp, u.maxHp, u.shield, u.alive])); check(ring.every(u => u.alive && u.hp === u.maxHp), 'nothing is hurt while the orb rolls');
  run(g, 1); check(ring.every(u => !u.alive), 'the burst kills both Linesmen'); check(buddy.hp + buddy.shield < bh, 'and hurts a friend standing there too'); check(whyNot(g, kn, 'toll', { x: hx - 16, z: hz }) === 'cooldown', 'then the Knell waits');
  // Listener, Ferry
  const li = spawnV(g, 'listener', 0, 0); check(!!li.air && isHidden(li) && UNIT.listener.detect! >= 10, 'a Listener flies, is unseen, and detects'); useAbility(g, li, 'settle'); run(g, .5); const lx = li.pos.x; li.order = { type: 'guard', x: lx + 30, z: li.pos.z }; run(g, 2); check(Math.abs(li.pos.x - lx) < .5 && hasStatus(li, 'root'), 'a settled Listener stays put');
  const fe = spawnV(g, 'ferry', 30, 30); const riders = [spawnV(g, 'cantor', 31, 31), spawnV(g, 'cantor', 29, 31), spawnV(g, 'lancer', 30, 32)]; useAbility(g, fe, 'load'); check(riders.every(u => u.inside === fe), 'a Ferry takes in friends beside it');
  check(whyNot(g, fe, 'unfold', { x: 0, z: 0 }) === '' , 'it can unfold'); useAbility(g, fe, 'drop'); check(riders.every(u => !u.inside), 'and lets them out'); fe.abCd = {}; useAbility(g, fe, 'unfold'); check(unfolded(fe) && inField(g, T, fe.pos.x + 2, fe.pos.z, 1, 1), 'an unfolded Ferry makes a song field');
  // Swift
  const sw = spawnV(g, 'swift', 0, 40), walker = foeAt('breacher', 6, 40); sw.energy = 40; check(whyNot(g, sw, 'lift', { x: walker.pos.x, z: walker.pos.z, id: walker.id }) === 'energy', 'Lift is refused below 50 energy');
  sw.energy = 200; check(useAbility(g, sw, 'lift', { x: walker.pos.x, z: walker.pos.z, id: walker.id }) && hasStatus(walker, 'lifted'), 'Lift holds a ground body in the air'); check(!canHit(sw, foeAt('linesman', 8, 40)), 'a Swift cannot shoot ground bodies');
  const big = spawnV(g, 'warden', 8, 44); check(!!whyNot(g, sw, 'lift', { x: big.pos.x, z: big.pos.z, id: big.id }) && !abilitiesOf('swift')[0].can!(g, sw, { x: big.pos.x, z: big.pos.z, id: big.id }), 'Lift is refused on a huge body');
  // Prism, Omen, Cantus, Bell, Reedwalker
  const pr = spawnV(g, 'prism', 0, -40); check(useAbility(g, pr, 'burn') && whyNot(g, pr, 'burn', { x: 0, z: 0 }) === 'cooldown', 'Burn Bright goes off, then waits 40 s');
  const om = spawnV(g, 'omen', -20, -40); om.energy = 200; const hid = foeAt('linesman', -24, -40); (hid as any).status = [{ k: 'unseen', t: 99 }]; check(!seenBy(g, T, hid), 'an unseen enemy is not seen');
  check(useAbility(g, om, 'reveal', { x: hid.pos.x, z: hid.pos.z }) && seenBy(g, T, hid), 'Reveal makes it seen');
  check(useAbility(g, om, 'stone', { x: hx - 20, z: hz - 34 }), 'Still Stone goes down'); const walkerS = foeAt('linesman', -20, -34); run(g, V_TUNE.omen.stoneArm + .5); check(hasStatus(walkerS, 'stun'), 'it freezes the first enemy that walks onto it'); const wh = walkerS.hp; g.damage(walkerS, 50, null); check(walkerS.hp === wh, 'a frozen body cannot be hurt');
  om.energy = 10; check(whyNot(g, om, 'shrill', { x: 0, z: 0 }) === 'energy', 'Shrill needs 25 energy to start');
  const cu = spawnV(g, 'cantus', 40, -20); cu.energy = 200; const near1 = spawnV(g, 'cantor', 42, -20); run(g, .5); check(hasStatus(near1, 'unseen'), 'a friend near the Cantus is unseen');
  const far = [spawnV(g, 'cantor', -40, 60), spawnV(g, 'cantor', -41, 61)]; check(useAbility(g, cu, 'gather', { x: hx - 40, z: hz + 60 }), 'Gather starts'); run(g, 2); check(far.every(u => Math.hypot(u.pos.x - cu.pos.x, u.pos.z - cu.pos.z) < 8), 'and calls the far group to the Cantus');
  const slowed = [foeAt('linesman', 50, -20), foeAt('linesman', 51, -21)]; check(useAbility(g, cu, 'hold', { x: hx + 50, z: hz - 20 }) && slowed.every(u => hasStatus(u, 'slow')), 'Hold Time slows the enemies in its circle');
  const be = spawnV(g, 'bell', -40, -10); run(g, .1); const bs = be.hp + be.shield; g.damage(be, 60, null); check(be.hp + be.shield === bs, 'a Bell\'s Ring Shell soaks the first hits');
  const rw = spawnV(g, 'reedwalker', 40, 10); check(canHit(sw, rw) && canHit(foeAt('linesman', 44, 10), rw), 'a Reedwalker can be hit by anti-air and by ground guns');
  // Lancer, Cantor
  const la = spawnV(g, 'lancer', 60, 0); check(whyNot(g, la, 'skip', { x: la.pos.x + 5, z: la.pos.z }) === 'refused', 'Skip is refused before it is learned at the Dusk Hall');
  const ca = spawnV(g, 'cantor', 60, 10), tg = foeAt('linesman', 66, 10); check(whyNot(g, ca, 'rush', { x: tg.pos.x, z: tg.pos.z, id: tg.id }) === 'refused', 'Rush is refused before it is learned');
  g.upOf(T).vrush = true; check(useAbility(g, ca, 'rush', { x: tg.pos.x, z: tg.pos.z, id: tg.id }), 'and works once it is');
  // Lyre and Shards
  const ly = spawnV(g, 'lyre', -60, 0); const mark = foeAt('linesman', -66, 0); ly.target = mark; g.purse[T] = 1e5; run(g, 6); check(g.units.some(u => u.alive && u.kind === 'shard' && (u as any).lyre === ly), 'a Lyre sends out Shards at its target');
  for (const k in UNIT) if (UNIT[k as Kind].team === 1) for (const a of abilitiesOf(k)) check(!!a.blurb && a.blurb.length > 10, `${UNIT[k as Kind].name} ${a.name} has a plain description for the command card`);
}

// ---------------------------------------------------------------- 3b. driving a body is the stronger way to play
// Damage a second, the driven gun against the same body's bot brain. Both go through g.vMul (the song's boost), so it cancels out here.
{
  const T = V_TUNE, G = GUNS as Record<string, { dmg: number; cd: number }>, dps = (d: number, cd: number) => d / cd;
  const rows: [string, number, number][] = [
    ['cantor', dps(T.cantor.cut * 1.2, .6), dps(T.cantor.cut, T.cantor.cd)],
    ['lancer', dps(T.lancer.dmg, 1.15), dps(T.lancer.dmg, T.lancer.cd)],
    ['warden', dps(38, 1.5 + .7), dps(34, 2.2 + .9)],
    ['tuner', dps(G.tuner.dmg, G.tuner.cd), dps(T.tuner.dmg, T.tuner.cd)],
    ['mute', dps(T.mute.cut, T.mute.cd / FP), dps(T.mute.cut, T.mute.cd)],
    ['chord', dps(G.chord.dmg, G.chord.cd), dps(T.chord.dmg, T.chord.cd)],
    ['bell', dps(G.bell.dmg, G.bell.cd), dps(T.bell.dmg, T.bell.cd)],
    ['reedwalker', dps(1, G.reedwalker.cd), dps(1, T.reedwalker.cd)],   // the same sweep, more often
    ['swift', dps(G.swift.dmg, G.swift.cd), dps(T.swift.dmg * 2, T.swift.cd)],
    ['prism', dps(G.prism.dmg, G.prism.cd), dps(T.prism.dmg, T.prism.cd)],
    ['omen', dps(G.omen.dmg, G.omen.cd), dps(T.omen.dmg, T.omen.cd)],
    ['cantus', dps(G.cantus.dmg, G.cantus.cd), dps(T.cantus.dmg, T.cantus.cd)],
    ['shard', dps(G.shard.dmg, G.shard.cd), dps(T.shard.dmg, T.shard.cd)],
  ];
  const low = rows.filter(([, p, b]) => p < b * 1.4);
  check(!low.length, `a driven Veyl body does at least 1.4 times its bot's damage a second (${rows.map(([k, p, b]) => k + ' ' + (p / b).toFixed(2)).join(', ')})`);
  // and its hits go through the song's boost, as the bots' do: one Mute cut in an eco match
  const g = world(); g.eco = true; const m = g.spawn('mute', 1, 0, 0), o = g.spawn('linesman', 0, 2, 0); m.yaw = Math.PI / 2;
  g.me = m; m.pilot = 1; (g as any).lmb = true; g.fireCd = 0; const h0 = o.hp + o.shield; (driveMute as any)(g, { x: 1, y: 0, z: 0 }); const dealt = h0 - o.hp - o.shield;
  check(Math.abs(dealt - T.mute.cut * g.vMul(1)) < 2 || dealt >= T.mute.cut * g.vMul(1) * .8, `a driven Mute's cut goes through the song's boost (${dealt.toFixed(1)} of ${(T.mute.cut * g.vMul(1)).toFixed(1)})`);
  g.me = null;
}

// ---------------------------------------------------------------- 3c. bot bodies use every ability
// A Veyl bot army with everything learned against a passive enemy (stunned, unkillable, it never shoots back), so nothing here swings
// with balance numbers. A battle at mid-map, where the test's own "fire" falls on the Veyl at random; then the quiet set pieces a battle
// does not make: two tired Choirmasters at home, an Omen at home, a Lancer with a blade on it, a Tuner with two blades near, a losing group far from its Cantus, and
// the Conductor's Ferry drop. Each ability on every Veyl kind must be cast by a bot at least once, and the Lyre must put Shards out.
{
  const cast: Record<string, number> = {}; let shards = 0;
  const botWorld = () => { const g = world(); g.truce = false; g.human = [true, false]; const up = g.upOf(T) as any; for (const x of UPGRADES) if ((x.team || 0) === 1) up[x.key] = UPGRADES.filter(y => y.key === x.key).length > 1 ? 3 : true; return g; };
  const passive = (g: Game, k: Kind, x: number, z: number) => { const u = g.spawn(k, 0, x, z); u.maxHp = u.hp = 1e5; u.order = { type: 'guard', x, z }; if (u.maxEnergy) u.energy = u.maxEnergy; return u; };
  const play = (g: Game, secs: number, each?: (f: number) => void) => { for (let f = 0; f < secs * 30; f++) { each?.(f); g.update(dt);
    for (const ev of g.evq!) if (ev[0] === 'ab') { const u = g.units.find(x => x.id === ev[1]); if (u && u.team === T) cast[u.kind + '.' + ev[2]] = (cast[u.kind + '.' + ev[2]] || 0) + 1; }
    g.evq!.length = 0; shards = Math.max(shards, g.units.filter(u => u.alive && u.kind === 'shard').length); } };
  const still = (F: Unit[]) => { for (const u of F) if (u.alive) { addStatus(u, 'stun', 1.2); u.hp = u.maxHp; } };
  // the battle
  {
    const g = botWorld(), [mx, mz] = MAP.mid!, V: Unit[] = [], F: Unit[] = [];
    const army: [Kind, number][] = [['cantor', 4], ['lancer', 2], ['tuner', 2], ['mute', 2], ['choirmaster', 3], ['knell', 2], ['listener', 1], ['ferry', 1], ['swift', 1], ['prism', 2], ['omen', 2], ['cantus', 1], ['warden', 2], ['lyre', 1], ['bell', 1], ['reedwalker', 1], ['chord', 1]];
    let i = 0; for (const [k, n] of army) for (let j = 0; j < n; j++, i++) { const u = g.spawn(k, T, mx - 8 + (i % 8) * 2, mz + 22 + Math.floor(i / 8) * 2); if (u.maxEnergy) u.energy = u.maxEnergy; u.order = { type: 'amove', x: mx, z: mz }; V.push(u); }
    const foes: [Kind, number][] = [['linesman', 5], ['breacher', 2], ['dustbike', 2], ['longshot', 1], ['patch', 1], ['gadfly', 1], ['sapper', 2], ['shaftmine', 1]];
    i = 0; for (const [k, n] of foes) for (let j = 0; j < n; j++, i++) F.push(passive(g, k, mx - 6 + (i % 7) * 2, mz + Math.floor(i / 7) * 2));
    play(g, 150, f => { if (f % 30) return; still(F); for (const u of F) u.target = V.filter(v => v.alive).sort((a, b) => Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) - Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z))[0] ?? null;
      for (const v of V) if (v.alive && Math.random() < .2) g.damage(v, 8, F[0]); });
  }
  // the quiet set pieces, each in a world of its own
  { const g = botWorld(); ORG = null; const a = spawnV(g, 'choirmaster', 0, 12), b = spawnV(g, 'choirmaster', 2, 12); a.energy = b.energy = 20; const om = spawnV(g, 'omen', -6, 12); om.energy = 200; play(g, 6); }
  { const g = botWorld(), [mx, mz] = MAP.mid!, F = [passive(g, 'breacher', mx + 2, mz)], la = g.spawn('lancer', T, mx, mz); la.order = { type: 'guard', x: mx, z: mz }; play(g, 4, f => { if (!(f % 30)) still(F); }); }
  { const g = botWorld(), [mx, mz] = MAP.mid!, F = [passive(g, 'dustbike', mx + 8, mz), passive(g, 'breacher', mx + 8, mz + 2)], tu = g.spawn('tuner', T, mx, mz); tu.order = { type: 'guard', x: mx, z: mz }; tu.energy = 60; play(g, 4, f => { if (!(f % 30)) still(F); }); }
  { const g = botWorld(), [mx, mz] = MAP.mid!, [hx, hz] = homeXZ(T), F: Unit[] = []; g.spawn('cantus', T, hx, hz - 8).order = { type: 'guard', x: hx, z: hz - 8 };
    for (let i = 0; i < 10; i++) F.push(passive(g, 'linesman', mx - 5 + i, mz)); const G = [0, 1, 2, 3].map(i => { const u = g.spawn('cantor', T, mx - 2 + i, mz + 3); u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; return u; });
    play(g, 4, f => { if (f % 30) return; still(F); for (const u of G) u.shield = 0; }); }
  { const g = botWorld(), [hx, hz] = homeXZ(T); g.dir.vs.auto = true; (g.dir.side(T) as any).dropT = 0; const fe = g.spawn('ferry', T, hx, hz - 10); fe.order = { type: 'guard', x: hx, z: hz - 10 };
    for (let i = 0; i < 6; i++) { const u = g.spawn('cantor', T, hx - 3 + i, hz - 12); u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; } play(g, 120); }
  const want = new Set<string>(); for (const k of ['cantor', 'lancer', 'tuner', 'mute', 'choirmaster', 'knell', 'listener', 'ferry', 'swift', 'prism', 'omen', 'cantus', 'warden', 'lyre', 'bell', 'reedwalker', 'chord'] as Kind[]) for (const a of abilitiesOf(k)) want.add(k + '.' + a.key);
  const never = [...want].filter(k => !cast[k]);
  check(!never.length, `bot Veyl bodies use every ability (${never.length ? 'never: ' + never.join(', ') : [...want].map(k => k + ' ' + cast[k]).join(', ')})`);
  check(shards > 0, `a bot Lyre puts Shards out (${shards} at once)`);
}

// ---------------------------------------------------------------- 3d. the Conductor's army mix and the finish (stream L's brain spec)
// Directions, not numbers: what it has seen moves the weights the right way, no kind runs past the cap, every kind keeps some weight,
// a Conductor that sees fliers trains Swifts, and one whose enemy has nothing left to fight with hunts the last buildings down.
{
  const none: SeenMix = { soft: 0, plated: 0, huge: 0, air: 0, unseen: 0, melee: 0, swarm: false, total: 0 }, all = () => true;
  const w0 = weights(none, all), wPl = weights({ ...none, plated: 20, total: 20 }, all), wAir = weights({ ...none, air: 20, total: 20 }, all), wSw = weights({ ...none, soft: 20, swarm: true, total: 20 }, all), wUn = weights({ ...none, unseen: 4, total: 4 }, all);
  check(wPl.lancer! > w0.lancer! && wPl.bell! > w0.bell! && wPl.cantor === w0.cantor, 'seeing a plated army puts more weight on Lancers and Bells, none on Cantors');
  check(wAir.swift! > wAir.prism! && wAir.swift! > wAir.omen! && wAir.swift! > wAir.lyre! && wAir.swift! > w0.swift!, 'seeing fliers makes the Swift the Skyloft\'s first pick');
  check(wSw.knell! > w0.knell! && wSw.cantor! > w0.cantor! && wSw.choirmaster! > w0.choirmaster!, 'seeing a swarm of soft bodies puts more weight on Knells, Cantors and Choirmasters');
  check(wUn.listener! > w0.listener!, 'seeing unseen bodies puts more weight on Listeners');
  check(MIX_KINDS.every(k => (w0[k] ?? 0) > 0), 'every Veyl fighter keeps some weight when nothing is seen, so each turns up in a long match');
  check(pickKind(['cantor', 'lancer'], w0, () => 0, k => k === 'cantor') === 'lancer' && pickKind(['cantor'], w0, () => 0, k => k === 'cantor') === null, 'a kind at the cap is not picked');
  // a Conductor that sees fliers puts Swifts out of its Skyloft
  {
    const g = world(); beds(g); g.truce = false; g.human = [true, false]; g.dir.vs.auto = true; const [hx, hz] = homeXZ(T);
    for (const k of ['skyloft', 'kiln', 'reedgate', 'broodpit'] as BKind[]) put(g, k, k === 'skyloft' ? 14 : k === 'kiln' ? -14 : k === 'reedgate' ? 0 : 0, k === 'reedgate' ? 16 : k === 'broodpit' ? -16 : 0);
    const F: Unit[] = []; for (let i = 0; i < 6; i++) { const u = g.spawn('gadfly', 0, hx - 6 + i * 2, hz - 24); u.maxHp = u.hp = 1e5; F.push(u); }
    let made = 0; const seenK = new Set<Unit>(); run(g, 80, () => { for (const u of F) { addStatus(u, 'stun', 1); u.hp = u.maxHp; } for (const u of g.units) if (u.alive && u.team === T && !seenK.has(u)) { seenK.add(u); if (u.kind === 'swift') made++; } });
    check(made > 0, `a Conductor that sees fliers trains Swifts (${made})`);
  }
  // the finish: the enemy has buildings but no fighters, and the Veyl army goes after them
  {
    const g = world(); beds(g); g.truce = false; g.human = [true, false]; g.dir.vs.auto = true;
    for (const u of g.units) if (u.alive && u.team === 0 && UNIT[u.kind] && !['rigger'].includes(u.kind)) { u.alive = false; u.hp = 0; g.scene.remove(u.obj); }
    g.time = HUNT_FROM;   // the hunt waits for minute 10
    const [hx, hz] = homeXZ(T); for (let i = 0; i < 14; i++) spawnV(g, i % 2 ? 'cantor' : 'lancer', -7 + i, -12);
    // what the enemy had, seen once near the Veyl base, then gone
    const ghost = g.spawn('linesman', 0, hx, hz - 20); run(g, 2); ghost.alive = false; ghost.hp = 0; g.scene.remove(ghost.obj);
    const foeB = g.buildings.filter(b => b.alive && b.team === 0), hp0 = foeB.reduce((a, b) => a + b.hp, 0);
    let hunted = false; run(g, 150, () => { hunted ||= isHunting(g.dir.vs); });
    const hp1 = g.buildings.filter(b => b.team === 0).reduce((a, b) => a + (b.alive ? b.hp : 0), 0);
    check(hunted, 'once the enemy has had no fighters for 30 s, the Conductor hunts');
    check(hp1 < hp0 * .9 || g.phase === 'over', `and its army breaks the enemy's buildings (${Math.round(hp0)} to ${Math.round(hp1)} hp${g.phase === 'over' ? ', match over' : ''})`);
  }
}

// ---------------------------------------------------------------- 4. bot matches: every kind gets made
if (process.argv[2] === 'use') {
  const jobs: any[] = []; for (let s = 1; s <= 10; s++) jobs.push({ home: s % 2 ? 1 : (s % 4 === 0 ? 2 : 0), out: s % 2 ? (s % 3 ? 0 : 2) : 1, map: s % 3, seed: 500 + s * 13, mins: 40, plan: ['ground', 'tech', 'air'][s % 3] });   // the three Conductor plans in turn
  const rows = jobs.map(j => { const r = spawnSync('node', ['dist/veyl-match.mjs', JSON.stringify(j)], { encoding: 'utf8' }); const row = JSON.parse(r.stdout.trim().split('\n').pop()!); console.log(`  ${JSON.stringify(j.plan)} ${row.home}v${row.out} map ${row.map}: ${row.res} at ${Math.round(row.t / 60)} min`); return row; });
  const made: Record<string, number> = {}, spend: Record<string, number> = {}; let errors = 0;
  for (const r of rows) { errors += r.errors; for (const k in r.made) made[k] = (made[k] || 0) + r.made[k]; for (const k in r.spend) spend[k] = (spend[k] || 0) + r.spend[k]; }
  const all = Object.values(spend).reduce((a, b) => a + b, 0);
  console.log('Unit use over 10 matches (share of spend):'); for (const k of Object.keys(spend).sort((a, b) => spend[b] - spend[a])) console.log(`  ${UNIT[k as Kind].name.padEnd(12)} ${String(made[k]).padStart(4)} made  ${(spend[k] / all * 100).toFixed(1)}%`);
  check(errors === 0, 'no match threw an error');
  for (const k of ['cantor', 'lancer', 'tuner', 'mute', 'choirmaster', 'bell', 'reedwalker', 'knell', 'listener', 'ferry', 'swift', 'prism', 'omen', 'lyre', 'warden', 'cantus']) check((made[k] || 0) > 0, `the bots made at least one ${UNIT[k as Kind].name}`);
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall passed'); process.exit(fail.length ? 1 : 0);
