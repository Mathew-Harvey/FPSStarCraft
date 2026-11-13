// The engine's shared systems (src/core/): Flux and vents, prices, supply, seams, armour and reach, research levels, effects, energy and
// abilities, fliers, unseen bodies and detection, cargo, mode switches, sides, and the server's checks. Each is tested on scratch kinds made
// here, so the test does not wait on any faction's roster. Last, one scratch body uses every system at once.
// Runs in Node with no browser. Run with: node tools/run-ts.mjs test/core/systems.ts
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, UNIT, BLD, FACTION, UPGRADES, setMap, setSides, Kind, BKind, Unit, SIDE, VHOME, swapEnd, fac } from '../../src/data';
import { defineBuildings, defineFaction, defineUnits, addHitFilter, HIT_FILTERS, bldRule } from '../../src/core/registry';
import { ECON, costOf, canPay, sendToVent, seamRate, ventSpots } from '../../src/core/econ';
import { LEVELS, level, levelMul, canHit } from '../../src/core/combat';
import { purseOf, staffVents } from '../../src/core/purse';
import { addStatus, hasStatus, statusPace, canAct } from '../../src/core/status';
import { defineAbilities, abilitiesOf, whyNot, useAbility, ENERGY } from '../../src/core/ability';
import { AIR, liftOff, flyBuilding, land } from '../../src/core/air';
import { seenBy, isHidden } from '../../src/core/sight';
import { load, unload, CARGO } from '../../src/core/cargo';
import { switchKind, morph } from '../../src/core/morph';
import { isEnemy, setAlliances, MAX_SIDES, TEAM_SLOTS } from '../../src/core/sides';
import { serverCmd, buildSnap, buildSnaps } from '../../src/netgame';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

// Scratch kinds. Each one turns on one system; `omni` turns on all of them.
const base = { team: 0, hp: 100, shield: 0, speed: 5, eye: 1.6, headY: 1.6, bodyY: .9, rad: .6, cost: 50, time: 5, supply: 1, quip: '', ack: [''] };
const add = (k: string, d: object) => { (UNIT as any)[k] = { ...base, name: k, ...d }; };
add('xplain', {}); add('xplate', { armour: 2, tags: ['plated'] }); add('xpierce', { bonus: { plated: 3 } });
add('xfly', { air: true, hits: 'both' }); add('xaa', { hits: 'both' }); add('xcloak', { cloak: true }); add('xeye', { detect: 12 });
add('xferry', { cargo: 8, air: true }); add('xtruck', { cargo: 4 }); add('xbig', { slots: 4 }); add('xsiege', { hp: 160, speed: 0 });
add('xflux', { flux: 25 }); add('xtank', { hp: 5000, speed: 0 }); add('xsoft', { tags: ['soft'] }); add('xcaster', { energy: 200, speed: 0 });
add('omni', { air: true, energy: 200, cargo: 4, cloak: true, hits: 'both', bonus: { soft: 2 }, armour: 1, tags: ['machine'] }); add('omnilanded', { hp: 200, energy: 200, armour: 3, cargo: 4, tags: ['machine', 'huge'] });
(BLD as any).xtap = { name: 'Scratch Tap', hp: 300, hx: 1.5, hz: 1.5, h: 2, cost: 75, time: 10, blurb: '' };
(BLD as any).xbunker = { name: 'Scratch Bunker', hp: 400, hx: 2, hz: 2, h: 2, cost: 100, time: 10, blurb: '', cargo: 4 };
defineBuildings({ xtap: { tap: true } });

function world(home = 0, out = 0, map = 0) {   // an Ironhold mirror: no faction's own damage rules get in the way
  setMap(map); setSides(home, out);
  const g = new Game(noPipe(), noHud, DIFFS[1], map, null, null, true); g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; g.human = g.human.map(() => false);
  for (const u of g.units) u.pilot = 0; return g;
}
const run = (g: Game, secs: number, each?: () => boolean | void) => { for (let i = 0; i < secs * 30; i++) { g.update(1 / 30); g.evq!.length = 0; if (each?.()) return true; } return false; };

// ---------------------------------------------------------------- 1. Flux, vents, prices
{
  check(costOf('xflux' as Kind)[0] === 50 && costOf('xflux' as Kind)[1] === 25 && costOf('xplain' as Kind)[1] === 0 && costOf(UPGRADES[0].key)[0] === UPGRADES[0].cost, 'prices: a kind with Flux costs [ore, Flux]; one without costs no Flux; research reads the same way');
  // The factions' own rosters may have a tap by now, so take every tap away for this check and give them back after.
  { const taps = Object.keys(BLD).filter(k => bldRule(k as BKind).tap); defineBuildings(Object.fromEntries(taps.map(k => [k, { tap: undefined }])));
    const g0 = world(); setSides(0, 1); check(world(0, 1).vents.length === 0 && g0.vents.length === 0, 'vents: with no tap in either roster none are laid, so a match without Flux plays as before');
    defineBuildings(Object.fromEntries(taps.map(k => [k, { tap: true }]))); }
  ECON.vents = 'on'; const g = world(0, 0); const H = SIDE.home, O = SIDE.out;
  check(g.vents.length >= 4, `vents: laid when switched on (${g.vents.length})`);
  const d = (v: { pos: { x: number; z: number } }, x: number, z: number) => Math.hypot(v.pos.x - x, v.pos.z - z);
  const yard = g.vents.map(v => d(v, 0, 0)).sort((a, b) => a - b).slice(0, 2), far = g.vents.map(v => d(v, VHOME.x, VHOME.z)).sort((a, b) => a - b).slice(0, 2);
  check(Math.abs(yard[0] - far[0]) < 2 && Math.abs(yard[1] - far[1]) < 2, `vents: both ends have two vents the same walk from home (${yard.map(Math.round)} and ${far.map(Math.round)} m)`);
  check(g.vents.every(v => g.ores.every(o => d(v, o.pos.x, o.pos.z) >= 6)), 'vents: none sits on ore');
  FACTION[H].builds.push('xtap' as BKind);
  const v = g.vents.slice().sort((a, b) => d(a, 0, 0) - d(b, 0, 0))[0];
  check(!g.canPlace('xtap' as BKind, v.pos.x + 3, v.pos.z, false, H) && g.canPlace('xtap' as BKind, v.pos.x, v.pos.z, false, H), 'a tap goes square on a vent and nowhere else');
  check(!g.canPlace(FACTION[H].supply, v.pos.x + 1, v.pos.z, false, H), 'nothing else may cover a vent');
  g.purse[H] = 1000; const tap = g.place('xtap' as BKind, v.pos.x, v.pos.z, false, H, null)!; check(!!tap && v.tap === tap && g.cash(H) === 925, 'placing a tap pays its ore and claims the vent');
  check(!g.canPlace('xtap' as BKind, v.pos.x, v.pos.z, false, O), 'a tapped vent takes no second tap');
  tap.progress = 1; run(g, .1);
  const w = g.units.find(u => u.alive && u.team === H && u.kind === FACTION[H].worker)!; sendToVent(g, w, v);
  const f0 = g.flux(H); run(g, 40, () => g.flux(H) >= f0 + ECON.trip * 2);
  check(g.flux(H) >= f0 + ECON.trip * 2 && v.amount <= ECON.vent - ECON.trip * 2, `a worker carries Flux from the tap to the home building (${g.flux(H)} Flux, the vent has ${v.amount} left)`);
  const barracks = g.addBuilding(FACTION[H].barracks, H, 30, 30, true); (barracks as any).queue = [];
  g.purse[H] = 100; g.fluxPurse[H] = 10; check(!g.train(barracks, 'xflux' as Kind), 'training is refused when there is ore but not enough Flux');
  g.fluxPurse[H] = 30; check(g.train(barracks, 'xflux' as Kind) && g.cash(H) === 50 && g.flux(H) === 5, 'training takes ore and Flux');
  check(g.cancelTrain(barracks, 0) && g.cash(H) === 100 && g.flux(H) === 30 && barracks.queue.length === 0, 'cancelling an order gives both back');
  // The brains' purse: ore and Flux together, with something kept back.
  { g.purse[H] = 100; g.fluxPurse[H] = 30; const P = purseOf(g, H);
    check(P.can('xflux' as Kind) && !P.can('xflux' as Kind, 2) && P.short('xflux' as Kind, 2).includes('Flux'), 'a purse knows a body costs ore and Flux');
    P.hold([60, 0]); check(!P.can('xflux' as Kind) && P.can('xflux' as Kind, 1, false) && P.free().can('xflux' as Kind), 'a purse keeps back what it is saving for');
    g.fluxPurse[H] = 0; check(P.wantsFlux('xflux' as Kind) && !P.wantsFlux(FACTION[H].supply), 'a purse says when Flux is what is missing');
    for (const u of g.units) if (u.team === H) sendToVent(g, u, null);
    const n = staffVents(g, H, 3), on = g.units.filter(u => u.alive && u.team === H && u.vent === v).length;
    check(n === 3 && on === 3, `staffing a tapped vent puts three workers on it (${n}, ${on})`);
    g.fluxPurse[H] = 5000; check(staffVents(g, H, 3) === 2, 'with plenty of Flux one goes back to ore each step'); for (const u of g.units) if (u.team === H) sendToVent(g, u, null); }
  FACTION[H].builds.pop(); ECON.vents = 'auto';
  // Supply never goes past 200.
  for (let i = 0; i < 40; i++) g.addBuilding(FACTION[H].supply, H, -60 + (i % 8) * 8, -60 + Math.floor(i / 8) * 8, true);
  check(g.supplyCap(H) === ECON.supplyMax, `supply stops at ${ECON.supplyMax} however many supply buildings (${g.supplyCap(H)})`);
  // Seams: two workers at full speed, a third at half, a fourth goes elsewhere.
  ECON.full = 2; const n = g.ores[0], crew = g.units.filter(u => u.alive && u.team === H && u.kind === FACTION[H].worker).slice(0, 4);
  crew.sort((a, b) => a.id - b.id).forEach(u => { u.node = n; u.state = 'mining'; });
  check(crew.map(u => seamRate(g, u)).join() === '1,1,0.5,0', `a seam takes two workers at full speed and a third at half (${crew.map(u => seamRate(g, u))})`);
  ECON.full = 0; check(crew.every(u => seamRate(g, u) === 1), 'with the dial off every worker mines at full speed, as before');
}

// ---------------------------------------------------------------- 2. Armour, bonus, reach, research levels
{
  const g = world(), H = SIDE.home, O = SIDE.out;
  const plain = g.spawn('xplain' as Kind, O, 50, 70), plate = g.spawn('xplate' as Kind, O, 52, 70), gun = g.spawn('xplain' as Kind, H, 50, 60), pierce = g.spawn('xpierce' as Kind, H, 52, 60), fly = g.spawn('xfly' as Kind, O, 54, 70), aa = g.spawn('xaa' as Kind, H, 54, 60);
  const hit = (t: Unit, from: Unit, amt: number) => { const h = t.hp; g.damage(t, amt, from); return h - t.hp; };
  check(hit(plain, gun, 10) === 10, 'a body with no armour takes the hit as it was');
  check(hit(plate, gun, 10) === 8, 'flat armour 2 takes 2 off a hit');
  check(hit(plate, pierce, 10) === 11, 'a weapon with +3 against plated does 10 + 3 - 2 to a plated body');
  check(near(hit(plate, gun, 1), LEVELS.minHit), `a hit never drops below ${LEVELS.minHit}`);
  check(hit(fly, gun, 10) === 0 && !canHit(gun, fly) && canHit(aa, fly) && hit(fly, aa, 10) === 10, 'a ground weapon cannot hurt a flier; one that reaches the air can');
  gun.order = { type: 'guard', x: 50, z: 60 }; aa.order = { type: 'guard', x: 54, z: 60 };
  check(g.acquire(gun, 30, 0) !== fly && g.acquire(aa, 30, 0) !== null, 'a ground-only body never picks a flier as its target');
  // Scratch research, so the checks do not lean on a faction's real numbers (which carry categories now).
  const sx = (key: string, line: string, lvl: number) => ({ key, name: 'Scratch ' + key, cost: 1, blurb: '', at: FACTION[H].barracks, say: '', team: fac(H), line, lvl });
  const real = UPGRADES.filter(u => (u.team || 0) === fac(H) && (u.line === 'atk' || u.line === 'arm')), keep = real.map(u => [u, u.line] as const); for (const u of real) (u as any).line = undefined;
  (UPGRADES as any).push(sx('xatk1', 'atk', 1), sx('xatk2', 'atk', 2), sx('xarm1', 'arm', 1));
  const U = g.upOf(H) as any, UO = g.upOf(O) as any; U.xatk1 = true; U.xatk2 = true;
  check(level(g, H, 'atk') === 2 && near(levelMul(g, H, 'atk'), 1.25 * 1.2), 'research levels: two attack levels bought is level 2, worth what the old two upgrades were');
  check(near(g.gunMul(H), 1.25 * 1.2 * g.foeK(H)) && near(g.armorMul(O), 1), 'the shared multipliers read the levels');
  LEVELS.mode = 'flat'; check(hit(plain, gun, 10) === 12 && near(g.gunMul(H), g.foeK(H)), 'flat mode: each attack level adds to the hit instead');
  UO.xarm1 = true; check(hit(plain, gun, 10) === 11, 'flat mode: each armour level takes 1 off');
  LEVELS.mode = 'percent'; U.xatk1 = U.xatk2 = false; UO.xarm1 = false; (UPGRADES as any).splice(-3, 3); for (const [u, l] of keep) (u as any).line = l;
}

// ---------------------------------------------------------------- 3. Effects
{
  const g = world(), H = SIDE.home, O = SIDE.out;
  const u = g.spawn('xplain' as Kind, H, 40, 80), foe = g.spawn('xplain' as Kind, O, 44, 80);
  check(statusPace(u) === 1 && canAct(u), 'no effects: full speed and free to act');
  addStatus(u, 'slow', 2, .5); check(near(g.pace(u), .5 * (g.pace(u) / statusPace(u))) && statusPace(u) === .5, 'slowed by half: half speed');
  addStatus(u, 'stun', 1); check(statusPace(u) === 0 && !canAct(u), 'stunned: no moving, no acting');
  u.order = { type: 'amove', x: 80, z: 80 }; const x0 = u.pos.x; run(g, .9); check(Math.abs(u.pos.x - x0) < .01, 'a stunned body stands still');
  run(g, 2.5); check(!hasStatus(u, 'stun') && !hasStatus(u, 'slow') && !u.status!.length, 'effects run out and come off');
  const fire = g.spawn('xplain' as Kind, O, 40, 150); addStatus(fire, 'burning', 2, 10, u.id); const hp0 = fire.hp; g.truce = true; run(g, 1); g.truce = false; check(hp0 - fire.hp > 8 && hp0 - fire.hp < 12, `burning at 10 a second takes about 10 in a second (${(hp0 - fire.hp).toFixed(1)})`);
  addStatus(foe, 'shielded', 5, 30); const hp1 = foe.hp; g.damage(foe, 20, u); check(foe.hp === hp1, 'an effect shield soaks a hit first'); g.damage(foe, 20, u); check(near(hp1 - foe.hp, 10), 'and the rest goes through once it is spent');
  addStatus(u, 'root', 1); check(statusPace(u) === 0 && canAct(u), 'rooted: no moving, but it can still shoot');
}

// ---------------------------------------------------------------- 4. Energy and abilities
{
  const g = world(), H = SIDE.home, O = SIDE.out; let zapped = 0;
  defineAbilities('xcaster', [{ key: 'zap', name: 'Zap', hotkey: 'Q', energy: 50, cd: 5, cast: .5, range: 10, target: 'body', who: 'foe', effect: (gg, u, t, tgt) => { zapped++; gg.damage(tgt!, 30, u); },
    ai: (gg, u) => { const e = gg.units.find(o => o.alive && o.team !== u.team && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 10); return e ? { x: e.pos.x, z: e.pos.z, id: e.id } : null; } }]);
  const c = g.spawn('xcaster' as Kind, H, 40, 90), foe = g.spawn('xtank' as Kind, O, 46, 90), far = g.spawn('xplain' as Kind, O, 70, 90), pal = g.spawn('xplain' as Kind, H, 42, 92);
  check(c.maxEnergy === 200 && c.energy === ENERGY.start && abilitiesOf('xcaster').length === 1, `a body with energy starts with ${ENERGY.start} of 200 and its ability listed`);
  check(whyNot(g, c, 'zap', { x: far.pos.x, z: far.pos.z, id: far.id }) === 'range' && whyNot(g, c, 'zap', { x: pal.pos.x, z: pal.pos.z, id: pal.id }) === 'target' && whyNot(g, c, 'nope', { x: 0, z: 0 }) === 'no such ability', 'refused: out of range, a friend for a foe-only ability, or an ability it does not have');
  c.energy = 20; check(whyNot(g, c, 'zap', { x: foe.pos.x, z: foe.pos.z, id: foe.id }) === 'energy', 'refused: not enough energy');
  c.energy = 60; check(useAbility(g, c, 'zap', { x: foe.pos.x, z: foe.pos.z, id: foe.id }) && near(c.energy, 10) && zapped === 0 && !!c.cast, 'cast: the energy is paid and the wind-up starts');
  check(whyNot(g, c, 'zap', { x: foe.pos.x, z: foe.pos.z, id: foe.id }) !== '', 'no second cast while winding up or cooling down');
  g.truce = true; run(g, .6); check(zapped === 1 && foe.hp < 5000 - 25, 'it goes off after the wind-up and does its effect');
  const e0 = c.energy!; run(g, 4); check(c.energy! > e0 + 3 && c.abCd!.zap > 0, `energy grows back (${e0.toFixed(1)} to ${c.energy!.toFixed(1)}) and the cooldown is still running`);
  run(g, 1.5); g.truce = false; c.energy = 200; run(g, 1.2); check(zapped === 2, 'a bot body uses the ability by itself through its hook');
  // Online: the client only asks, and the server checks the body is the player's own.
  const n0 = zapped; c.abCd!.zap = 0; c.energy = 200; serverCmd(g, 7, null, ['ab', c.id, 'zap', foe.pos.x, foe.pos.z, foe.id]); run(g, .7);
  const other = g.spawn('xcaster' as Kind, O, 80, 80); other.pilot = 9; serverCmd(g, 7, null, ['ab', other.id, 'zap', foe.pos.x, foe.pos.z, foe.id]);
  check(zapped === n0 + 1 && !other.cast, 'online: the server casts for a body on the asking player\'s side and refuses one that is not theirs');
}

// ---------------------------------------------------------------- 5. The air
{
  const g = world(), H = SIDE.home, O = SIDE.out;
  const f = g.spawn('xfly' as Kind, H, 0, -14), walker = g.spawn('xplain' as Kind, H, 0, 14);
  check(!!f.air && f.alt === AIR.cruise, `a flier spawns at cruise height (${f.alt} m)`);
  // Straight across the home building: a walker is pushed round it, a flier goes over.
  const hq = g.ownB(FACTION[H].hq, true, H)[0]; f.order = { type: 'amove', x: 0, z: 20 }; g.truce = true;
  let over = false; run(g, 8, () => { g.moveTo(f, 0, 20, 1 / 30); if (Math.abs(f.pos.x - hq.pos.x) < hq.hx && Math.abs(f.pos.z - hq.pos.z) < hq.hz) over = true; });
  check(over, 'a flier crosses straight over a building');
  f.pos.set(walker.pos.x, 0, walker.pos.z); const wx = walker.pos.x; run(g, .2); check(near(walker.pos.x, wx, .05), 'a flier and a walker in the same spot do not push each other');
  const eye = { x: f.pos.x - 10, y: f.alt! + UNIT.xfly.bodyY, z: f.pos.z } as any, dir = { x: 1, y: 0, z: 0 } as any;
  const h = g.ray(eye, dir, 30, -1, null); check(!!h && h.unit === f, 'a shot at its height hits the flier');
  const low = g.ray({ x: f.pos.x - 10, y: UNIT.xfly.bodyY, z: f.pos.z } as any, dir, 30, H, null); check(!low || low.unit !== f, 'a shot at ground height passes under it');
  // A building lifts off, flies and lands.
  const bk = g.addBuilding(FACTION[H].barracks, H, 40, 40, true); check(liftOff(g, bk) && !!bk.air, 'a finished building lifts off');
  run(g, 2); check(bk.alt! > 3, `and rises (${bk.alt!.toFixed(1)} m)`);
  for (let i = 0; i < 300 && !flyBuilding(bk, 48, 40, 1 / 30); i++); check(near(bk.pos.x, 48, .3), 'it flies to a new spot');
  check(land(g, bk) && !bk.air, 'and lands where there is room'); g.truce = false;
}

// ---------------------------------------------------------------- 6. Unseen bodies and detection
{
  const g = world(), H = SIDE.home, O = SIDE.out;
  const ghost = g.spawn('xcloak' as Kind, O, 40, 100), gun = g.spawn('xplain' as Kind, H, 40, 92);
  check(isHidden(ghost) && !seenBy(g, H, ghost) && seenBy(g, O, ghost), 'a cloaked body is hidden from the enemy and seen by its own side');
  check(g.acquire(gun, 20, 0) !== ghost, 'the enemy cannot pick it as a target');
  const eye = g.spawn('xeye' as Kind, H, 40, 95); check(seenBy(g, H, ghost) && g.acquire(gun, 20, 0) === ghost, 'a detector in range reveals it, and it can be fought');
  eye.pos.set(40, 0, 60); check(!seenBy(g, H, ghost), 'out of the detector\'s range it is hidden again');
  addStatus(ghost, 'revealed', 3); check(seenBy(g, H, ghost), 'revealed by an effect, anyone can see it');
  const plain = g.spawn('xplain' as Kind, O, 44, 100); addStatus(plain, 'dug', Infinity); check(isHidden(plain) && statusPace(plain) === 0 && !canAct(plain), 'dug in: hidden, still, and not fighting');
}

// ---------------------------------------------------------------- 7. Cargo
{
  const g = world(), H = SIDE.home, O = SIDE.out;
  const truck = g.spawn('xtruck' as Kind, H, 40, 110), a = g.spawn('xplain' as Kind, H, 41, 110), b = g.spawn('xplain' as Kind, H, 42, 110), big = g.spawn('xbig' as Kind, H, 40, 112), foe = g.spawn('xplain' as Kind, O, 48, 110);
  check(load(g, truck, a) && load(g, truck, b) && !load(g, truck, big) && truck.cargo!.length === 2, 'a transport takes riders until it is full (two small, then no room for a big one)');
  check(!a.obj.visible && a.inside === truck && g.acquire(foe, 20, 0) !== a, 'a rider is out of sight and cannot be targeted');
  truck.pos.x = 30; g.truce = true; run(g, .1); check(near(a.pos.x, truck.pos.x) && a.pos.x < 32, 'riders move with the transport');
  check(unload(g, truck) === 2 && !a.inside && a.obj.visible && Math.hypot(a.pos.x - 30, a.pos.z - 110) < 4, 'unloading sets them down beside it');
  load(g, truck, a); load(g, truck, b); g.damage(truck, 1e4, foe);
  check(!truck.alive && a.alive && near(a.hp, 100 * (1 - CARGO.spill)) && !a.inside, `a transport that dies on the ground spills its riders, each hurt by ${CARGO.spill * 100}%`);
  const ferry = g.spawn('xferry' as Kind, H, b.pos.x, b.pos.z); load(g, ferry, b); g.damage(ferry, 1e4, null); check(!b.alive, 'riders of a flier that goes down die with it');
  const bunker = g.addBuilding('xbunker' as BKind, H, 70, 110, true), c = g.spawn('xplain' as Kind, H, 70, 113); check(load(g, bunker, c), 'a bunker takes a body in');
  g.truce = false; const f2 = g.spawn('xplain' as Kind, O, 74, 118); f2.hp = 5; let shot = false; run(g, 6, () => { if (!f2.alive) { shot = true; return true; } });
  check(shot && c.inside === bunker, 'a body inside a bunker still fights from it');
  g.damage(bunker, 1e5, f2.alive ? f2 : null); check(c.alive && !c.inside, 'when the bunker falls its riders spill out alive');
}

// ---------------------------------------------------------------- 8. Mode switches and ripening
{
  const g = world(), H = SIDE.home;
  const u = g.spawn('xplain' as Kind, H, 40, 120); u.hp = 50; u.pilot = 3; const id = u.id;
  check(switchKind(g, u, 'xsiege' as Kind) && u.id === id && u.kind === 'xsiege' && near(u.hp, 80) && u.pilot === 3 && u.speed === 0, 'a mode switch keeps the body, its pilot and its share of health (half of 100 is half of 160)');
  u.pilot = 0; check(morph(g, u, 'xplain' as Kind, 2) && u.kind === 'xsiege' && !canAct(u), 'ripening takes time, and the body is helpless meanwhile');
  g.truce = true; run(g, 2.2); g.truce = false; check(u.kind === 'xplain' && canAct(u) && u.id === id && near(u.hp, 50), 'and it comes out as the new kind, the same body');
}

// ---------------------------------------------------------------- 9. Sides
{
  check(isEnemy(0, 1) && isEnemy(0, 3) && !isEnemy(1, 1), 'one on one: the two teams fight, a team never fights itself');
  setAlliances([[0, 4], [1, 3]]); check(!isEnemy(0, 4) && isEnemy(0, 1) && isEnemy(4, 3), 'two against two: allies do not fight');
  setAlliances([]); check(isEnemy(0, 4) && MAX_SIDES === 8 && TEAM_SLOTS >= 24, 'free for all: everyone fights everyone, up to eight sides');
  const g = world(); check(g.purse.length >= TEAM_SLOTS && g.ups.length >= TEAM_SLOTS && g.cash(20) === 100 && g.upOf(20) !== g.upOf(0), 'every team slot has its own purse and research');
}

// ---------------------------------------------------------------- 9b. Faction hooks for extra needs, Bud-free training and extra beds
{
  const g = world(), H = SIDE.home; const bk = g.addBuilding(FACTION[H].barracks, H, 30, 30, true); g.purse[H] = 1000;
  defineFaction(fac(H), { gate: (gg, t, what) => what === 'xplain' ? 'Scratch Lab' : '', beds: () => 6 });
  check(!g.train(bk, 'xplain' as Kind) && g.gated(H, 'xplain') === 'Scratch Lab' && g.train(bk, 'xtank' as Kind), 'a faction gate refuses what it names and lets everything else through');
  const cap0 = g.supplyCap(H); defineFaction(fac(H), { gate: undefined, beds: undefined }); check(cap0 === g.supplyCap(H) + 6, 'a faction\'s extra beds add to its supply');
}

// ---------------------------------------------------------------- 9c. Hooks the faction streams asked for
{
  const g = world(), H = SIDE.home, O = SIDE.out, f = fac(H); g.purse[H] = 5000;
  const bk = g.addBuilding(FACTION[H].barracks, H, 30, 40, true); let ran = 0;
  defineUnits({ xtank: { limit: 1 } }); check(g.train(bk, 'xtank' as Kind) && !g.train(bk, 'xtank' as Kind), 'a kind with a limit of one trains once per side'); bk.queue.length = 0;
  defineBuildings({ [FACTION[H].barracks]: { trains: (gg, b, k) => k === 'xplain' ? 'needs a Lab Bay on this building' : '', actions: () => [{ key: 'lab', name: 'Lab Bay', hotkey: 'L', cost: [50, 0], ok: () => '', run: () => { ran++; } }] } });
  check(!g.train(bk, 'xplain' as Kind) && g.buildingAction(bk, 'lab') && ran === 1 && g.cash(H) === 5000 - 50 - UNIT.xtank.cost, 'a building can refuse one kind and offer its own paid commands');
  defineBuildings({ [FACTION[H].barracks]: { trains: undefined, actions: undefined } });
  defineFaction(f, { works: (gg, b) => b === bk ? 0 : 1, whySilent: () => 'It is outside a song field.' }); g.train(bk, 'xsoft' as Kind);
  check(g.silent(bk) === 'It is outside a song field.' && bk.queue.length === 0, 'a silent building refuses to train, with the faction\'s reason');
  defineFaction(f, { works: undefined, whySilent: undefined });
  defineFaction(f, { placeOK: (gg, k) => k === FACTION[H].supply ? 'It has to stand inside a song field.' : '' });
  check(!g.canPlace(FACTION[H].supply, -14, 14, false, H) && g.placeWhy.includes('song field'), 'a faction can refuse a building spot and say why'); defineFaction(f, { placeOK: undefined });
  add('xtall', { tall: true }); add('xsky', { hits: 'air' }); const tall = g.spawn('xtall' as Kind, O, 60, 60), sky = g.spawn('xsky' as Kind, H, 60, 52), short = g.spawn('xplain' as Kind, O, 62, 60);
  check(canHit(sky, tall) && !canHit(sky, short), 'an air-only weapon can hit a tall walker but not a short one');
  const depot = g.addBuilding(FACTION[H].supply, H, 20, 60, true); defineBuildings({ [FACTION[H].supply]: { hq: true } });
  check(g.isHQ(depot) && g.hqs(H).includes(depot) && g.nearHQ(20, 62, H) === depot, 'a building whose rules say hq counts as a home building'); defineBuildings({ [FACTION[H].supply]: { hq: undefined } });
  defineBuildings({ xbunker: { counts: [FACTION[H].supply] } }); g.addBuilding('xbunker' as BKind, H, 80, 60, true); check(g.ownB(FACTION[H].supply, true, H).some(b => b.kind === ('xbunker' as BKind)), 'a kind that counts as another is found as that kind');
  const flt = (gg: any, t: any, amt: number) => t === short ? 0 : amt + (t === tall ? 2 : 0); addHitFilter(flt); const h0 = short.hp, h1 = tall.hp; g.damage(short, 10, null); g.damage(tall, 10, null);
  check(short.hp === h0 && h1 - tall.hp === 12, 'hit filters can stop a hit or add to it'); HIT_FILTERS.splice(HIT_FILTERS.indexOf(flt), 1);
  add('xmine', { ward: true }); const mine = g.spawn('xmine' as Kind, H, 90, 60); check(!g.army(H).includes(mine), 'a body left behind (ward) is not a fighter and joins no army');
  const bl = g.spawn('xplain' as Kind, H, 100, 60), tgt = g.spawn('xplain' as Kind, O, 108, 60); check(g.acquire(bl, 20, 0) === tgt, 'a body sees a foe 8 m off'); addStatus(bl, 'blind', 8); check(g.acquire(bl, 20, 0) === null, 'blinded, it only finds targets within 4 m');
  add('xtrooper', { cat: 'inf' }); (UPGRADES as any).push({ key: 'xinf1', name: 'Scratch Infantry Plate', cost: 1, blurb: '', at: FACTION[H].barracks, say: '', team: fac(H), line: 'arm', lvl: 1, cat: 'inf' });
  g.upOf(H)['xinf1' as any] = true; check(near(g.armorMul(H, 'inf'), 1.25) && near(g.armorMul(H), 1) && near(g.armorMul(H, 'mach'), 1), 'a level with a category counts only for bodies of that category'); (UPGRADES as any).pop();
  (UPGRADES as any).push({ key: 'xmech1', name: 'Scratch Machine and Ship Plate', cost: 1, blurb: '', at: FACTION[H].barracks, say: '', team: fac(H), line: 'arm', lvl: 1, cat: 'xmech|xship' });
  g.upOf(H)['xmech1' as any] = true; check(near(g.armorMul(H, 'xmech'), 1.25) && near(g.armorMul(H, 'xship'), 1.25) && near(g.armorMul(H, 'inf'), 1) && near(g.armorMul(H), 1), 'one level can name several categories'); (UPGRADES as any).pop();
  { const k = FACTION[H].supply, sx = 0, sz = -150, was = g.canPlace(k, sx, sz, false, H); defineBuildings({ [k]: { far: true } }); const now = g.canPlace(k, sx, sz, false, H); defineBuildings({ [k]: { far: undefined } });
    check(!was && now, `a far building goes up away from home (${was} then ${now})`); }
  const id = depot.id; check(g.rebuild(depot, FACTION[H].barracks) && depot.id === id && depot.kind === FACTION[H].barracks, 'a building can change kind in place');
}

// ---------------------------------------------------------------- 10. What the server sends each side
{
  const g = world(), H = SIDE.home, O = SIDE.out; const ghost = g.spawn('xcloak' as Kind, O, 40, 140), pal = g.spawn('xcaster' as Kind, H, 40, 120);
  g.evq!.push(['test']); const snaps = buildSnaps(g, [H, O]), sh = JSON.parse(snaps.get(H)!), so = JSON.parse(snaps.get(O)!);
  check(!sh.u.some((r: any[]) => r[0] === ghost.id) && !JSON.stringify(sh).includes(`[${ghost.id},`) && so.u.some((r: any[]) => r[0] === ghost.id), 'online: a hidden body is left out of the enemy\'s snapshot entirely (fog on the wire, test/online) and sent to its own side');
  check(sh.e.length === 1 && so.e.length === 1 && g.evq!.length === 0, 'online: both sides\' snapshots carry the tick\'s events once');
  const one = buildSnap(g); check(one.u.some((r: any[]) => r[0] === ghost.id) && one.ux.some((r: any[]) => r[0] === pal.id && r[1] === Math.floor(pal.energy!)) && Array.isArray(one.fl), 'online: the full snapshot carries energy, Flux and every body');
}

// ---------------------------------------------------------------- 11. One body, every system
{
  ECON.vents = 'on'; const g = world(), H = SIDE.home, O = SIDE.out;
  defineAbilities('omni', [{ key: 'land', name: 'Land', hotkey: 'E', energy: 0, cd: 1, cast: 0, range: 0, target: 'self', effect: (gg, u) => { morph(gg, u, 'omnilanded' as Kind, 1); } },
    { key: 'slowfield', name: 'Slow Field', hotkey: 'Q', energy: 75, cd: 10, cast: 0, range: 14, target: 'area', radius: 5, effect: (gg, u, t) => { for (const o of gg.units) if (o.alive && isEnemy(o.team, u.team) && Math.hypot(o.pos.x - t.x, o.pos.z - t.z) < 5) addStatus(o, 'slow', 4, .5, u.id); } }]);
  const o = g.spawn('omni' as Kind, H, 40, 130), rider = g.spawn('xplain' as Kind, H, 40, 131), foe = g.spawn('xsoft' as Kind, O, 50, 130), eye = g.spawn('xeye' as Kind, O, 70, 130);
  check(o.air && o.alt === AIR.cruise, 'omni: flies');
  check(isHidden(o) && !seenBy(g, O, o) && g.acquire(foe, 20, 0) !== o, 'omni: unseen by the enemy');
  check(load(g, o, rider) && rider.inside === o, 'omni: carries a rider');
  o.energy = 100; check(useAbility(g, o, 'slowfield', { x: 50, z: 130 }) && hasStatus(foe, 'slow'), 'omni: casts an area slow on an enemy');
  const hp0 = foe.hp; g.damage(foe, 10, o); check(hp0 - foe.hp === 12, 'omni: its weapon does +2 against soft bodies');
  eye.pos.set(42, 0, 130); check(seenBy(g, O, o), 'omni: a detector finds it');
  check(useAbility(g, o, 'land'), 'omni: switches mode'); g.truce = true; run(g, 1.3); g.truce = false;
  check(o.kind === 'omnilanded' && !o.air && o.alt === 0 && rider.inside === o, `omni: landed as the same body (${o.kind}), on the ground, rider still aboard`);
  ECON.vents = 'auto';
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASS');
process.exit(fail.length ? 1 : 0);
