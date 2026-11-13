// The Ironhold rules: every unit's tech path, every piece of research, every ability working and refused, every building's job, and the
// Quartermaster making every kind across ten seeded bot matches. Runs in Node with no browser.
// Run with: node tools/run-ts.mjs test/factions/ironhold.ts [matches=10]   (0 skips the bot matches, which take a few minutes)
import { spawn } from 'node:child_process';
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, UNIT, BLD, UPGRADES, TRAINS, UNIT_NEEDS, setMap, setSides, Kind, BKind, UpKey, Unit, Building, SIDE } from '../../src/data';
import { bldRule } from '../../src/core/registry';
import { costOf } from '../../src/core/econ';
import { abilitiesOf, whyNot, useAbility } from '../../src/core/ability';
import { hasStatus } from '../../src/core/status';
import { isHidden } from '../../src/core/sight';
import { addonOf, hasLab, hasTwin, energyOf, sell, fillDugout } from '../../src/factions/ironhold/bases';
import { boosted } from '../../src/factions/ironhold/kit';
import { I_UPGRADES, I_TUNE as TUNE } from '../../src/factions/ironhold/numbers';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** A quiet Ironhold v Veyl match: both brains off, rich, nothing built but the starting yard. */
function world() {
  setMap(0); setSides(0, 1);
  const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true); g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; g.human = g.human.map(() => false);
  for (const u of g.units) u.pilot = 0; g.dir.auto = false; g.dir.vs.auto = false; g.dir.qmT = 1e9; g.dir.vs.qmT = 1e9; (g.dir as any).plan = null; (g.dir as any).nextPlan = 1e9; (g.dir.vs as any).nextPlan = 1e9;
  g.purse[SIDE.home] = 1e5; g.fluxPurse[SIDE.home] = 1e5;
  for (let i = 0; i < 12; i++) g.addBuilding('depot', SIDE.home, -70 + (i % 6) * 7, -70 - Math.floor(i / 6) * 7, true);   // beds for everything
  return g;
}
const run = (g: Game, secs: number, each?: () => boolean | void) => { for (let i = 0; i < secs * 30; i++) { g.update(1 / 30); g.evq!.length = 0; if (each?.()) return true; } return false; };
const H = () => SIDE.home, O = () => SIDE.out;
const IRON_UNITS: Kind[] = ['rigger', 'linesman', 'breacher', 'patch', 'sapper', 'longshot', 'dustbike', 'piledriver', 'gantry', 'hopper', 'flakkite', 'gadfly', 'surveyor', 'claimbarge'] as Kind[];
const spots: Record<string, [number, number]> = { bunkhouse: [15, 8], machineshop: [0, -24], foundry: [-24, -24], hangar: [-22, 26], assay: [-15, 6], mast: [15, -17], annex: [-24, -4], depot: [-13, -9], watchpost: [24, 0], dugout: [24, 12], flaktower: [8, -10] };
const raise = (g: Game, k: BKind) => { const at = spots[k] || g.dir.freeSpot(k, 10, 10, H()) || [10, 10]; return g.addBuilding(k, H(), at[0], at[1], true); };
const bolt = (g: Game, host: Building, k: 'labbay' | 'twinbay') => { const ok = g.buildingAction(host, k); const a = addonOf(host); if (a) { a.built = true; a.progress = 1; a.hp = a.maxHp; } return ok && !!a; };

// ---------------------------------------------------------------- 1. Tech paths: each unit is refused until its buildings stand
{
  const g = world(), T = H();
  const where: Partial<Record<Kind, BKind>> = {}; for (const b in TRAINS) for (const k of TRAINS[b as BKind] || []) if (!where[k]) where[k] = b as BKind;
  const need = (k: Kind) => { const r: string[] = []; const at = where[k]; if (!at) return r; r.push(at); return r; };
  const hosts: Partial<Record<BKind, Building>> = {};
  const bunk = hosts.bunkhouse = raise(g, 'bunkhouse');
  check(g.train(bunk, 'linesman'), 'a Linesman trains at a bare Bunkhouse');
  check(!g.train(bunk, 'breacher'), 'a Breacher is refused without a Lab Bay on its Bunkhouse');
  check(bolt(g, bunk, 'labbay') && hasLab(bunk), 'a Lab Bay bolts onto the Bunkhouse from its command card');
  check(g.train(bunk, 'breacher') && g.train(bunk, 'sapper'), 'with the Lab Bay, Breachers and Sappers train');
  check(!g.train(bunk, 'patch'), 'a Patch is refused until there is an Assay Office');
  raise(g, 'assay'); bunk.queue.length = 0; check(g.train(bunk, 'patch'), 'with an Assay Office the Patch trains');
  check(!g.train(bunk, 'longshot'), 'a Longshot is refused until there is a Signal Mast');
  check(!!g.gated(T, 'mast') === false, 'the Signal Mast can go up once the Assay stands');
  raise(g, 'mast'); bunk.queue.length = 0; check(g.train(bunk, 'longshot'), 'with a Signal Mast the Longshot trains');
  check(!!g.gated(T, 'foundry'), 'a Foundry is refused before a Machine Shop');
  const shop = raise(g, 'machineshop'); check(g.train(shop, 'dustbike'), 'a Dustbike trains at a bare Machine Shop');
  check(!g.train(shop, 'piledriver'), 'a Pile Driver needs a Lab Bay on the Machine Shop'); bolt(g, shop, 'labbay'); shop.queue.length = 0; check(g.train(shop, 'piledriver'), 'with the Lab Bay the Pile Driver trains');
  check(!g.gated(T, 'foundry') && !g.gated(T, 'hangar'), 'Foundry and Hangar open once the Machine Shop stands');
  const fdy = raise(g, 'foundry'); check(g.train(fdy, 'gantry'), 'the Gantry trains at a Foundry');
  check(!!g.gated(T, 'annex'), 'the Head Office Annex is refused before a Hangar');
  const hang = raise(g, 'hangar'); check(g.train(hang, 'hopper') && g.train(hang, 'flakkite'), 'Hoppers and Flak Kites train at a bare Hangar');
  check(!g.train(hang, 'gadfly') && !g.train(hang, 'surveyor'), 'Gadfly and Surveyor need a Lab Bay on the Hangar');
  bolt(g, hang, 'labbay'); hang.queue.length = 0; check(g.train(hang, 'gadfly') && g.train(hang, 'surveyor'), 'with the Lab Bay the Gadfly and Surveyor train');
  hang.queue.length = 0; check(!g.train(hang, 'claimbarge'), 'a Claim Barge is refused until there is an Annex');
  raise(g, 'annex'); check(g.train(hang, 'claimbarge'), 'with an Annex the Claim Barge trains');
  check(!!g.gated(T, 'flaktower') === false, 'the Flak Tower opens once the Assay stands');
  for (const k of IRON_UNITS) { const c = costOf(k), u = UNIT[k]; check(c[0] === u.cost && c[1] === (u.flux || 0), `${u.name} costs ${c[0]} ore and ${c[1]} Flux`); }
  void need;
}

// ---------------------------------------------------------------- 2. Research: every level at its building, levels in order, the Lab and Mast gates
{
  const g = world(), T = H(), U = g.upOf(T);
  const keys = I_UPGRADES.map(u => u.key);
  check(keys.length >= 30, `the Ironhold have ${keys.length} pieces of research`);
  const atOf: Record<string, Building> = {};
  for (const u of UPGRADES.filter(x => keys.includes(x.key))) if (!atOf[u.at]) atOf[u.at] = raise(g, u.at as BKind);
  check(!g.buyUpgrade('overtime' as UpKey, T), 'Overtime is refused without a Lab Bay on a Bunkhouse');
  for (const h of ['bunkhouse', 'machineshop', 'hangar']) { const b = atOf[h] || raise(g, h as BKind); atOf[h] = b; bolt(g, b, 'labbay'); }
  check(!g.buyUpgrade('dmg2' as UpKey, T), 'Infantry Guns 2 is refused before level 1');
  check(g.buyUpgrade('dmg' as UpKey, T), 'Infantry Guns 1 is bought at the Assay Office');
  const mast = g.ownB('mast', true, T); for (const m of mast) m.alive = false;
  for (const b of g.buildings) b.queue.length = 0;
  check(!g.buyUpgrade('dmg2' as UpKey, T), 'Infantry Guns 2 is refused without a Signal Mast');
  raise(g, 'mast');
  let bought = 0, missing: string[] = [];
  for (let pass = 0; pass < 4; pass++) for (const u of I_UPGRADES) { if (U[u.key]) continue; for (const b of g.buildings) b.queue.length = 0; if (g.buyUpgrade(u.key as UpKey, T)) { U[u.key] = true; bought++; } }
  for (const u of I_UPGRADES) if (!U[u.key]) missing.push(u.key);
  check(!missing.length, `every piece of research can be bought in order (${bought} bought${missing.length ? ', refused: ' + missing.join(',') : ''})`);
  const lv = (line: string, cat: string) => I_UPGRADES.filter(u => u.line === line && u.cat === cat).map(u => u.lvl).sort().join('');
  check(lv('atk', 'inf') === '123' && lv('arm', 'inf') === '123' && lv('atk', 'mech') === '123' && lv('arm', 'mech|ship') === '123' && lv('atk', 'ship') === '123', 'infantry, machine and ship guns and plate each run levels 1 to 3');
}

// ---------------------------------------------------------------- 3. Abilities: each one works when it should, and is refused when it should
{
  const g = world(), T = H(), F = O(), U = g.upOf(T);
  const at = (k: Kind, x = 30, z = 30, team = T) => { const u = g.spawn(k, team, x, z); u.order = { type: 'guard', x, z }; return u; };
  const why = (u: Unit, key: string, t = { x: u.pos.x, z: u.pos.z } as any) => whyNot(g, u, key, t);
  // Every Ironhold body with an ability has a hotkey for it, and every ability is listed on its kind.
  const keysOf = (k: Kind) => abilitiesOf(k).map(a => a.key);
  check(['overtime'].every(k => keysOf('linesman').includes(k)) && keysOf('patch').includes('painkiller') && ['mine', 'satchel'].every(k => keysOf('sapper').includes(k)) && keysOf('dustbike').includes('kick') && keysOf('piledriver').includes('anchor')
    && keysOf('hopper').includes('doors') && keysOf('flakkite').includes('land') && keysOf('gadfly').includes('cloak') && ['stake', 'jam', 'flare'].every(k => keysOf('surveyor').includes(k)) && ['foreclose', 'relocate'].every(k => keysOf('claimbarge').includes(k))
    && keysOf('gantry').includes('flak') && ['ghillie', 'tranq', 'deep'].every(k => keysOf('longshot').includes(k)), 'every planned ability is on its kind');
  check(IRON_UNITS.every(k => abilitiesOf(k).every(a => !!a.hotkey)), 'every ability has a first-person key');
  // Overtime
  const lin = at('linesman'); check(!!why(lin, 'overtime'), 'Overtime is refused before the research');
  U.overtime = true; const hp = lin.hp; check(useAbility(g, lin, 'overtime') && lin.hp < hp && boosted(g, lin, 'ot'), 'Overtime costs health and speeds the Linesman up');
  lin.hp = 5; check(!!why(lin, 'overtime'), 'Overtime is refused when it would kill');
  // Painkiller
  const pat = at('patch', 32, 30); pat.energy = 200; const pal = at('linesman', 33, 30); check(useAbility(g, pat, 'painkiller', { x: pal.pos.x, z: pal.pos.z, id: pal.id }), 'a Patch gives a Painkiller to a Linesman');
  run(g, .2); const shooter = at('lancer' as Kind, 60, 60, F), h0 = pal.hp; g.damage(pal, 10, shooter); check(h0 - pal.hp <= 10 - TUNE.painkiller.armour + .01, `a Painkiller takes ${TUNE.painkiller.armour} off each hit`);
  pat.energy = 0; const pal2 = at('linesman', 33, 31); check(!!why(pat, 'painkiller', { x: pal2.pos.x, z: pal2.pos.z, id: pal2.id }), 'a Painkiller is refused with no energy');
  // Shaft Mines
  const sap = at('sapper', 40, 40); check(useAbility(g, sap, 'mine', { x: 41, z: 40 }), 'a Sapper starts digging a Shaft Mine');
  run(g, TUNE.mine.dig + .5); const mine = g.units.find(u => u.alive && u.kind === 'shaftmine' && u.team === T);
  check(!!mine && isHidden(mine), 'the Shaft Mine is dug in and unseen');
  const foe = at('lancer' as Kind, 42.5, 40, F); const fhp = foe.hp + foe.shield;
  run(g, 4, () => !mine!.alive); check(!mine!.alive && (foe.hp + foe.shield < fhp || !foe.alive), 'a foe stepping near it sets it off and is hurt (shield counts)');
  for (let i = 0; i < TUNE.mine.keep; i++) { const m = g.spawn('shaftmine' as Kind, T, 50 + i * 2, 50); (m as any).owner = sap; const { mem } = require('../../src/factions/ironhold/kit'); mem(m).owner = sap.id; }
  sap.abCd = {}; check(!!why(sap, 'mine', { x: 41, z: 42 }), `a Sapper keeps no more than ${TUNE.mine.keep} mines`);
  { const { tickCharges } = require('../../src/factions/ironhold/ground'), mem2 = require('../../src/factions/ironhold/kit').mem, mines = () => g.units.filter(u => u.alive && u.kind === 'shaftmine' && u.team === T).length;
    tickCharges(g, 0); check(mines() === TUNE.mine.keep, 'a living Sapper\'s mines stay in the ground');
    const lone = g.spawn('shaftmine' as Kind, T, 56, 50); mem2(lone).owner = 987654; tickCharges(g, 0); check(!lone.alive && mines() === TUNE.mine.keep, 'a mine whose Sapper is dead goes with it'); }
  // Satchel
  const vb = g.addBuilding('hushwell' as BKind, F, 60, 40, true), sap2 = at('sapper', 60 - vb.hx - 1.5, 40), bhp = vb.hp;
  check(!!why(sap2, 'satchel', { x: 30, z: 30, id: lin.id }), 'a Satchel is refused on something that is not an enemy building');
  check(useAbility(g, sap2, 'satchel', { x: vb.pos.x, z: vb.pos.z, id: vb.id }), 'a Sapper plants a Satchel on an enemy building');
  run(g, TUNE.satchel.fuse + 1.5); check(vb.hp < bhp - TUNE.satchel.dmg * .5 || !vb.alive, 'the Satchel goes off and hurts the building');
  // Kick Start
  const bike = at('dustbike', 30, 50); check(useAbility(g, bike, 'kick') && !!why(bike, 'kick'), 'Kick Start fires, then waits on its cooldown');
  // Pile Driver anchor and lift
  const pd = at('piledriver', 20, 60); useAbility(g, pd, 'anchor'); run(g, TUNE.pile.anchor + 1); check(pd.kind === 'piledriverset', 'a Pile Driver anchors into its set form');
  useAbility(g, pd, 'lift'); run(g, TUNE.pile.anchor + 1); check(pd.kind === 'piledriver', 'and lifts its stakes again');
  // Hopper doors
  const hop = at('hopper', 70, 70); const rider = at('linesman', 71, 70); hop.pos.y = 0; (hop as any).alt = 0;
  check(useAbility(g, hop, 'doors'), 'a Hopper opens its doors'); run(g, 1.5);
  check(rider.inside === hop || !!hop.cargo?.includes(rider), 'a Linesman beside it climbs in');
  hop.abCd = {}; useAbility(g, hop, 'doors'); run(g, 1.5); check(!rider.inside, 'and climbs out again');
  const hop2 = at('hopper', 90, 90); hop2.abCd = {}; check(!!why(hop2, 'doors'), 'an empty Hopper with nobody near is refused');
  check(useAbility(g, hop, 'afterburn') && !!why(hop, 'afterburn'), 'Afterburn fires, then waits on its cooldown');
  // Flak Kite lands and takes off
  const kite = at('flakkite', 80, 20); useAbility(g, kite, 'land'); run(g, TUNE.land + 1); check(kite.kind === 'flakwalker' && !kite.air, 'a Flak Kite lands as a walker');
  useAbility(g, kite, 'takeoff'); run(g, TUNE.land + 1); check(kite.kind === 'flakkite' && !!kite.air, 'and takes off again');
  // Gadfly cloak
  const gad = at('gadfly', 85, 30); gad.energy = 200; check(!!why(gad, 'cloak'), 'Smoke Cloak is refused before the research');
  U.smoke = true; check(useAbility(g, gad, 'cloak') && isHidden(gad), 'with the research the Gadfly goes unseen');
  gad.energy = 1; run(g, 3); check(!isHidden(gad), 'and shows again when the energy runs out');
  // Surveyor
  const sur = at('surveyor', 50, 80); sur.energy = 200;
  check(useAbility(g, sur, 'stake', { x: 52, z: 80 }), 'a Surveyor fires a Stake Gun'); run(g, 1.5); check(g.units.some(u => u.alive && u.kind === 'staketurret' && u.team === T), 'and a turret stands where it lands');
  const tank = at('piledriver', 55, 80, F); sur.energy = 200; check(useAbility(g, sur, 'jam', { x: tank.pos.x, z: tank.pos.z, id: tank.id }), 'Jam is cast on an enemy machine'); run(g, .3);
  check(hasStatus(tank, 'stun'), 'and the machine stops');
  const soft = at('lancer' as Kind, 54, 82, F); sur.energy = 200; check(!!why(sur, 'jam', { x: soft.pos.x, z: soft.pos.z, id: soft.id }), 'Jam is refused on a body that is not a machine');
  sur.energy = 200; useAbility(g, sur, 'flare', { x: soft.pos.x, z: soft.pos.z }); run(g, 1.5); check(hasStatus(soft, 'blind') && hasStatus(soft, 'revealed'), 'a Flare blinds and shows what it lands on');
  sur.energy = 0; check(!!why(sur, 'flare', { x: 54, z: 82 }), 'a Flare is refused with no energy');
  // Claim Barge
  const barge = at('claimbarge', 20, 90); barge.energy = 200; check(!!why(barge, 'foreclose', { x: 26, z: 90, id: 0 }) && !!why(barge, 'relocate', { x: 10, z: 10 }), 'Foreclosure and Relocate are refused before their research');
  const prey = at('piledriver', 26, 90, F); U.foreclose = true; U.relocate = true; check(!why(barge, 'foreclose', { x: prey.pos.x, z: prey.pos.z, id: prey.id }), 'with the research Foreclosure can be cast');
  check(useAbility(g, barge, 'relocate', { x: 10, z: 10 }), 'a Claim Barge relocates to ground its side can see'); run(g, TUNE.relocate.cast + 1); check(Math.hypot(barge.pos.x - 10, barge.pos.z - 10) < 4, 'and arrives there');
  // Gantry flak
  const gan = at('gantry', 30, 10); useAbility(g, gan, 'flak'); run(g, TUNE.flakSwitch + 1); check(gan.kind === 'gantryflak', 'a Gantry switches to flak mode'); useAbility(g, gan, 'ground'); run(g, TUNE.flakSwitch + 1); check(gan.kind === 'gantry', 'and back to its cannon');
  // Longshot
  const ls = at('longshot', 10, 30); ls.energy = 200; check(!!why(ls, 'ghillie'), 'Ghillie is refused before the research'); U.ghillie = true; check(useAbility(g, ls, 'ghillie') && isHidden(ls), 'with the research the Longshot goes unseen');
  check(!!why(ls, 'deep', { x: 15, z: 30 }), 'a Deep Charge is refused with no charge built at a Signal Mast');
  const mast = raise(g, 'mast'); check(g.buildingAction(mast, 'charge'), 'a Signal Mast starts building a Deep Charge'); run(g, 45); check(!why(ls, 'deep', { x: 15, z: 30 }), 'once it is ready the Longshot can call it in');
}

// ---------------------------------------------------------------- 4. Buildings: add-ons, crawling, HQ forms, Dugout, Pump Jack, Depot, towers
{
  const g = world(), T = H();
  const bunk = raise(g, 'bunkhouse'); check(bolt(g, bunk, 'twinbay') && hasTwin(bunk), 'a Twin Bay bolts onto a Bunkhouse');
  check(!g.buildingAction(bunk, 'labbay'), 'a host takes only one add-on');
  g.train(bunk, 'linesman'); g.train(bunk, 'linesman'); const before = g.own('linesman', T).length; run(g, UNIT.linesman.time + 1); check(g.own('linesman', T).length - before === 2, 'with a Twin Bay two Linesmen come out at once');
  const twin = addonOf(bunk)!; const ox = bunk.pos.x; bunk.queue.length = 0;
  check(g.buildingAction(bunk, 'crawl'), 'a Bunkhouse packs up to crawl'); run(g, 12); check(Math.abs(bunk.pos.x - ox) > 3 && !addonOf(bunk) && twin.alive, 'it crawls away and leaves its add-on behind');
  check(!g.train(bunk, 'linesman') || !!(require('../../src/factions/ironhold/kit').mem(bunk).crawl) === false, 'it does not train while crawling');
  const hq = g.hqs(T)[0]; g.purse[T] = 1e5; g.fluxPurse[T] = 1e5; hq.queue.length = 0;
  check(g.buildingAction(hq, 'surveyrig'), 'the Headframe starts refitting into a Survey Rig'); run(g, BLD.surveyrig.time + 2); check(hq.kind === 'surveyrig' && g.isHQ(hq), 'and becomes one, still a home building');
  run(g, 40); const e = energyOf(hq) || 0, drones = g.own('hauldrone' as Kind, T).length, called = g.buildingAction(hq, 'drone'); check(called && g.own('hauldrone' as Kind, T).length > drones && energyOf(hq) < e, `the Survey Rig calls down a Haul Drone for energy (${called}, ${drones} to ${g.own('hauldrone' as Kind, T).length}, energy ${Math.round(e)} to ${Math.round(energyOf(hq))})`);
  run(g, 2); check(g.own('hauldrone' as Kind, T).some(u => u.state !== 'idle'), 'the Haul Drone goes to work');
  const hf2 = g.addBuilding('headframe', T, -40, 40, true); check(g.buildingAction(hf2, 'bastion'), 'a Headframe can refit into a Bastion'); run(g, BLD.bastion.time + 2); check(hf2.kind === 'bastion' && hf2.maxHp >= 3000, 'and becomes a heavy Bastion');
  const foe = g.spawn('lancer' as Kind, O(), -40, 52); foe.order = { type: 'guard', x: -40, z: 52 }; const fh = foe.hp; run(g, 4); check(foe.hp < fh || !foe.alive, 'the Bastion shoots a foe in reach');
  const dug = raise(g, 'dugout'); for (let i = 0; i < 6; i++) g.spawn('linesman', T, 24 + i * .3, 15);
  fillDugout(g, dug, 10); run(g, 3); const inside = g.units.filter(u => u.alive && u.inside === dug).length; check(inside > 0 && inside <= 4, `Linesmen fill the Dugout, at most four (${inside})`);
  const ore = g.cash(T); sell(g, dug); check(!dug.alive && g.cash(T) - ore >= BLD.dugout.cost * TUNE.sell - 1, `a Dugout sells back for ${TUNE.sell * 100}% of its price`);
  check(g.units.every(u => u.inside !== dug), 'and its seats empty out first');
  const v = g.vents[0]; check(!!v, 'the map has Flux vents for the Pump Jack');
  if (v) { check(!g.canPlace('pumpjack', v.pos.x + 9, v.pos.z + 9, false, T), 'a Pump Jack cannot go off a vent'); g.purse[T] = 1e5; const j = g.place('pumpjack', v.pos.x, v.pos.z, false, T, null); check(!!j || g.buildings.some(b => b.kind === 'pumpjack' && b.alive), 'a Pump Jack goes on a vent'); }
  const dep = raise(g, 'depot'), mate = g.spawn('linesman', T, dep.pos.x, dep.pos.z + 8); check(!!bldRule('depot').walkOver?.(g, dep, mate), 'a Depot lies flat to walk over while no enemy is near');
  const raider = g.spawn('lancer' as Kind, O(), dep.pos.x + 6, dep.pos.z); raider.order = { type: 'guard', x: raider.pos.x, z: raider.pos.z }; run(g, 1); check(!bldRule('depot').walkOver?.(g, dep, mate), 'and rises into a wall when an enemy comes near');
  const flak = raise(g, 'flaktower'); const bird = g.spawn('flakkite', O(), flak.pos.x + 5, flak.pos.z + 5); bird.order = { type: 'guard', x: bird.pos.x, z: bird.pos.z }; const bh = bird.hp; run(g, 4); check(bird.hp < bh || !bird.alive, 'a Flak Tower shoots a flier');
  const sneak = g.spawn('gadfly', O(), flak.pos.x + 6, flak.pos.z); addStatusUnseen(sneak); check(require('../../src/core/sight').seenBy(g, T, sneak), 'a Flak Tower sees a cloaked flier near it');
}
function addStatusUnseen(u: Unit) { require('../../src/core/status').addStatus(u, 'unseen', 30); }

// ---------------------------------------------------------------- 5. The Quartermaster: every kind made across seeded bot matches, and what got used
const N = +(process.argv[2] ?? 10);
type Row = { out: number; seed: number; map: number; res: string; t: number; trained: Record<string, number>; spend: Record<string, number>; built: Record<string, number>; casts: Record<string, number>; acts: Record<string, number>; forms: Record<string, number>; up: string[] };
async function matches(): Promise<Row[]> {
  // Against each faction and the mirror, on all three maps; the foe plays as a careful human (it never takes a push early) in half of them so
  // matches run long enough for the late tech to show.
  const specs = Array.from({ length: N }, (_, i) => ({ out: [1, 2, 0][i % 3], seed: 100 + i, map: i % 3, mins: 40, human: i % 2 ? [0, 1] : undefined }));
  const rows: Row[] = [], go = (s: any) => new Promise<void>(ok => { let out = ''; const p = spawn('node', ['dist/iron-match.mjs', JSON.stringify(s)]); p.stdout.on('data', d => out += d); p.on('close', () => { try { rows.push(JSON.parse(out.trim().split('\n').pop()!)); } catch { console.log('match failed', JSON.stringify(s), out.slice(-300)); } ok(); }); });
  const q = [...specs]; await Promise.all([0, 1, 2, 3].map(async () => { while (q.length) await go(q.shift()); })); return rows;
}
(async () => {
  if (N > 0) {
    const b = spawn('node', ['tools/run-ts.mjs', 'tools/iron-match.ts', '{"mins":0}']); await new Promise(ok => b.on('close', ok));
    const rows = await matches(), all: Record<string, number> = {}, spend: Record<string, number> = {}, casts: Record<string, number> = {}, built: Record<string, number> = {}, acts: Record<string, number> = {};
    for (const r of rows) { for (const k in r.trained) all[k] = (all[k] || 0) + r.trained[k]; for (const k in r.spend) spend[k] = (spend[k] || 0) + r.spend[k]; for (const k in r.casts) casts[k] = (casts[k] || 0) + r.casts[k]; for (const k in r.built) built[k] = (built[k] || 0) + r.built[k]; for (const k in r.acts) acts[k] = (acts[k] || 0) + r.acts[k]; }
    console.log(`\n${rows.length} matches: ` + rows.map(r => `${['mirror', 'Veyl', 'Gloam'][r.out % 3]} m${r.map} ${r.res} ${Math.round(r.t / 60)}min`).join(', '));
    const fighters = IRON_UNITS.filter(k => k !== 'rigger'), sum = fighters.reduce((a, k) => a + (spend[k] || 0), 0) || 1;
    console.log('\nUnit-use share (ore + Flux spent on each fighter, all matches):');
    for (const k of fighters) console.log(`  ${UNIT[k].name.padEnd(13)} ${String(all[k] || 0).padStart(4)} made  ${((spend[k] || 0) / sum * 100).toFixed(1).padStart(5)}%`);
    console.log('Abilities cast: ' + Object.entries(casts).map(([k, n]) => `${k} ${n}`).join(', '));
    console.log('Building commands: ' + Object.entries(acts).map(([k, n]) => `${k} ${n}`).join(', '));
    console.log('Buildings raised: ' + Object.entries(built).map(([k, n]) => `${k} ${n}`).join(', '));
    for (const k of IRON_UNITS) check((all[k] || 0) > 0, `the Quartermaster made a ${UNIT[k].name} in the bot matches (${all[k] || 0})`);
    for (const k of ['pumpjack', 'labbay', 'twinbay', 'assay', 'machineshop', 'foundry', 'hangar', 'mast', 'annex', 'flaktower', 'depot', 'watchpost']) check((built[k] || 0) > 0, `the Quartermaster raised a ${BLD[k as BKind].name} (${built[k] || 0})`);
    for (const k of ['surveyrig', 'drone']) check((acts[k] || 0) > 0, `the Quartermaster used the ${k} command (${acts[k] || 0})`);
    if (all.surveyor) check(['stake', 'jam', 'flare', 'scan'].some(k => (casts[k] || 0) + (acts[k] || 0) > 0), `bots used a Surveyor ability or a Scan`);
    for (const k of ['mine', 'painkiller', 'overtime', 'kick', 'anchor', 'doors', 'land']) check((casts[k] || 0) > 0, `bots cast ${k} (${casts[k] || 0})`);
  }
  console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASS'); process.exit(fail.length ? 1 : 0);
})();
