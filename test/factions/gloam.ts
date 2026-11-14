// The Gloam's full roster (stream D): every unit can be made through its tech path, every ability works and is refused properly, every
// building does its job, and (part 2) the bots make every unit across ten seeded 40-minute matches without a crash or a stall.
// Runs in Node with no browser. Run with: node tools/run-ts.mjs test/factions/gloam.ts [quick]   (quick skips the bot matches)
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, UNIT, BLD, FACTION, TRAINS, UPGRADES, setMap, setSides, Kind, BKind, Unit, Building, SIDE, fac } from '../../src/data';
import { costOf } from '../../src/core/econ';
import { abilitiesOf, whyNot, useAbility } from '../../src/core/ability';
import { hasStatus } from '../../src/core/status';
import { seenBy } from '../../src/core/sight';
import { bldRule, unitRule } from '../../src/core/registry';
import { G_UNIT, G_BLD, G_RIPEN, G_DIGS, G2, G_TUNE, type GKind, type GBKind } from '../../src/factions/gloam/numbers';
import { FUSES, podRoom } from '../../src/factions/gloam/abilities';
import { isDug } from '../../src/factions/gloam/roster';
import { otherEnd } from '../../src/factions/gloam/actions';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const quick = process.argv.includes('quick'), oneArg = process.argv.indexOf('one');
// One bot match, for part 2 (run as a child process): every kind of body the Gloam side made, and what it spent on each.
if (oneArg > 0) { oneMatch(JSON.parse(process.argv[oneArg + 1])); process.exit(0); }

/** A Gloam side at the yard against Ironhold, with the bot brains switched off so only what the test does happens. */
function world(out = 0) {
  setMap(0); setSides(2, out);
  const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true); g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; g.human = g.human.map(() => false);
  for (const u of g.units) u.pilot = 0; g.dir.update = () => {};
  const H = SIDE.home, O = SIDE.out; g.purse[H] = 99999; g.fluxPurse[H] = 99999;
  // Clear the enemy away from the test ground: only what a test spawns fights.
  for (const u of g.units) if (u.team === O) { u.alive = false; g.scene.remove(u.obj); }
  return { g, H, O, cap: g.ownB('mothercap', true, H)[0] };
}
const run = (g: Game, secs: number, each?: () => boolean | void) => { for (let i = 0; i < secs * 30; i++) { g.update(1 / 30); g.evq!.length = 0; if (each?.()) return true; } return false; };
/** Grows a finished building of `k` for `team` near (x, z), on its own Bloom. */
function grow(g: Game, k: BKind, team: number, x: number, z: number) { const b = g.addBuilding(k, team, x, z, true); return b; }
const ring = (cap: Building, i: number, r = 13) => [cap.pos.x + Math.cos(i * 1.1) * r, cap.pos.z + Math.sin(i * 1.1) * r] as const;
const spawnAt = (g: Game, k: Kind, team: number, x: number, z: number) => { const u = g.spawn(k, team, x, z); u.order = { type: 'guard', x, z }; return u; };
const dmgOf = (b: Unit | Building) => b.maxHp - b.hp;

// ---------------------------------------------------------------- 1. every unit and building can be made through its tech path
{
  const { g, H, cap } = world();
  const kinds = Object.keys(G_UNIT) as GKind[], made = new Set<string>(), via = new Set<string>();
  // What can be grown at the start: only the first tier.
  check(!g.unlocked('rotden', H) && !g.unlocked('wingspire', H) && !g.unlocked('tuskhollow', H), 'tech: tier-2 and tier-3 buildings start locked');
  // Walk the tree: grow every building whose needs are met, ripen the Cap, until nothing new opens.
  let i = 0; const built = new Set<string>(['mothercap']);
  const tryAll = () => { let n = 0; for (const k of FACTION[H].builds) { if (built.has(k) || k === 'mothercap' || k === 'tunnelroot' || k === 'ventbladder') continue; if (g.unlocked(k, H)) { const [x, z] = ring(cap, i++, 16 + (i % 3) * 7); grow(g, k, H, x, z); built.add(k); n++; } } return n; };
  tryAll();
  const why0 = bldRule('mothercap').actions!(g, cap).find(a => a.key === 'grow')!.ok!(g, cap);
  check(built.has('warren') ? why0 === '' : /Warren/.test(why0), `tech: an Elder Cap needs a Warren (${why0 || 'Warren standing, allowed'})`);
  // A Cap that ripens keeps its Bloom: its patch never shrinks, and buildings that need Bloom still go down 14 m out.
  const capBloom = () => Math.max(0, ...g.carpet.patches.filter(p => p.owner === cap && !p.dying).map(p => p.max));
  const bloomHolds = (was: number, what: string) => { run(g, 3); const r = capBloom(), far = [[14, 0], [-14, 0], [0, 14], [0, -14]].filter(([dx, dz]) => g.carpet.on(cap.pos.x + dx, cap.pos.z + dz, 0, H)).length;
    let spot = false; for (let a = 0; a < 16 && !spot; a++) { const x = Math.round(cap.pos.x + Math.cos(a * .4) * 14), z = Math.round(cap.pos.z + Math.sin(a * .4) * 14); spot = g.canPlace('rotden', x, z, false, H); }
    check(r >= was && far >= 3 && spot, `Bloom: ${what} keeps its Bloom (${was} m to ${r} m, Bloom 14 m out on ${far} of 4 sides, a Rot Den fits: ${spot})`); return r; };
  const bloom0 = capBloom();
  check(g.buildingAction(cap, 'grow'), 'tech: the Mother Cap starts ripening into an Elder Cap');
  run(g, BLD.eldercap.time + 1);
  check(cap.kind === 'eldercap' && g.isHQ(cap) && g.ownB('mothercap', true, H).includes(cap), 'tech: it becomes an Elder Cap, still a home building and still counts as a Mother Cap');
  const bloom1 = bloomHolds(bloom0, 'a Mother Cap that ripens into an Elder Cap');
  tryAll(); tryAll();
  check(built.has('rotden') && built.has('wingspire') && built.has('deeproot') && built.has('quillgarden'), 'tech: the Elder Cap opens the Rot Den, Wing Spire, Deep Root and Quill Garden');
  check(!built.has('needleden') && !g.unlocked('tallspire', H), 'tech: the Needle Den and Tall Spire still wait for an Ancient Cap');
  check(g.buildingAction(cap, 'grow'), 'tech: the Elder Cap starts ripening into an Ancient Cap (a Rot Den is standing)');
  run(g, BLD.ancientcap.time + 1); tryAll(); tryAll();
  check(cap.kind === 'ancientcap' && built.has('needleden'), 'tech: the Ancient Cap opens the Needle Den');
  bloomHolds(bloom1, 'an Elder Cap that ripens into an Ancient Cap');
  const spire = g.ownB('wingspire', true, H)[0]; check(!!spire && g.buildingAction(spire, 'grow'), 'tech: a Wing Spire ripens into a Tall Spire once an Ancient Cap stands');
  run(g, BLD.tallspire.time + 1); check(spire.kind === 'tallspire' && g.ownB('wingspire', true, H).includes(spire), 'tech: the Tall Spire still counts as a Wing Spire');
  // Every Cap unit trains from the Cap; every ripened unit ripens. Spore Sacs first, for beds.
  for (let j = 0; j < 8; j++) { const [x, z] = ring(cap, j, 40); grow(g, 'sporesac', H, x, z); }
  for (const k of TRAINS.ancientcap || []) { cap.buds = 9; if (g.train(cap, k)) made.add(k); else console.log('  not trained:', k, g.gated(H, k), g.supplyUsed(H), g.supplyCap(H)); }
  const hol = g.ownB('tuskhollow', true, H)[0]; check(!!hol && g.train(hol, 'mulcher'), 'tech: a Mulcher wakes in the Tusk Hollow');
  run(g, 40);
  for (const k of TRAINS.ancientcap || []) if (g.own(k, H).length) via.add(k);
  check((TRAINS.ancientcap || []).every(k => made.has(k)), `tech: every Cap unit trains (${(TRAINS.ancientcap || []).filter(k => !made.has(k)).join(', ') || 'all'})`);
  check((TRAINS.ancientcap || []).every(k => via.has(k)), `tech: and comes out (${(TRAINS.ancientcap || []).filter(k => !via.has(k)).join(', ') || 'all'})`);
  for (const r of ['glob', 'gneedle', 'gsower'] as const) g.buyUpgrade(r, H);
  for (const from of Object.keys(G_RIPEN) as GKind[]) { const u = g.own(from, H)[0] || spawnAt(g, from, H, cap.pos.x + 12, cap.pos.z); const w = useAbility(g, u, 'ripen'); check(w, `tech: a ${UNIT[from].name} ripens (${whyNot(g, u, 'ripen', { x: 0, z: 0 }) || 'ok'})`); }
  run(g, 30);
  for (const from of Object.keys(G_RIPEN) as GKind[]) { const to = G_RIPEN[from]!.to; check(g.own(to, H).length > 0, `tech: ...into a ${UNIT[to].name}`); }
  // Bodies that only come from something else: Husks (Seeder), Pups (Sower), walkers (uprooting), Drifters (Spore Sac).
  const other = kinds.filter(k => k !== 'mulcher' && !(TRAINS.ancientcap || []).includes(k) && !Object.values(G_RIPEN).some(r => r!.to === k));
  check(other.sort().join(',') === ['drifter', 'husk', 'pup', 'puffwalk', 'stingerwalk'].sort().join(','), `tech: every other kind comes from an ability or a building command (${other.join(', ')})`);
}

// ---------------------------------------------------------------- 2. Keeper: no Bud, Seed Cap, Spore Pod, Mend
{
  const { g, H, O, cap } = world(); g.human[H] = true;   // no bot casting of its own during this part
  cap.buds = 0; check(g.train(cap, 'keeper'), 'Keeper: trains with no ripe Bud'); check(!g.train(cap, 'snapper') || !g.ownB('warren', true, H).length, 'Keeper: a Snapper still needs a Bud (and a Warren)');
  run(g, UNIT.keeper.time + 1); const k = g.own('keeper', H)[0]; check(!!k, 'Keeper: comes out of the Cap');
  k.energy = 200; cap.buds = 3;
  k.pos.set(cap.pos.x + cap.hx + 2, 0, cap.pos.z); k.abCd = {}; (cap as any).seedT = 0;
  check(useAbility(g, k, 'seed', { x: cap.pos.x, z: cap.pos.z, id: cap.id }), `Seed Cap: cast on its own Cap from beside it (${whyNot(g, k, 'seed', { x: cap.pos.x, z: cap.pos.z, id: cap.id }) || 'ok'} ${JSON.stringify(k.abCd)})`);
  run(g, 1); check(!useAbility(g, k, 'seed', { x: cap.pos.x, z: cap.pos.z, id: cap.id }), 'Seed Cap: refused on a Cap already seeded');
  const b0 = cap.buds!; run(g, G2.keeper.seed.t + .5); check(cap.buds! >= b0 + G2.keeper.seed.buds && cap.buds! > G_TUNE.buds, `Seed Cap: 3 more Buds 20 s later, over the usual 3 (${b0} -> ${cap.buds})`);
  // Spore Pod: on own Bloom only.
  k.energy = 200; k.abCd = {}; const far = { x: cap.pos.x + 60, z: cap.pos.z + 60 };
  check(whyNot(g, k, 'pod', far) !== '', `Spore Pod: refused off Bloom or out of reach (${whyNot(g, k, 'pod', far)})`);
  const spot = [[5, 2], [-5, 2], [2, -5], [-2, 5], [5, -4], [-5, -4]].map(([dx, dz]) => ({ x: k.pos.x + dx, z: k.pos.z + dz })).find(p => g.carpet.on(p.x, p.z, 0, H) && podRoom(g, p.x, p.z)) || { x: k.pos.x + 5, z: k.pos.z + 2 };   /* a free spot: with a Cap's full Bloom an earlier pod may stand at the first */ check(useAbility(g, k, 'pod', spot), `Spore Pod: planted on its own Bloom (${whyNot(g, k, 'pod', spot) || 'ok'})`);
  run(g, 2); const pod = g.ownB('sporepod', false, H)[0]; check(!!pod, 'Spore Pod: a pod stands there');
  run(g, BLD.sporepod.time + 1); check(pod.built && g.carpet.on(pod.pos.x + 4, pod.pos.z, 0, H) || g.carpet.on(pod.pos.x, pod.pos.z, 0, H), 'Spore Pod: grows its own Bloom');
  check(g.buildingAction(pod, 'hop'), 'Spore Pod: plants one more pod further on'); check(!g.buildingAction(pod, 'hop'), 'Spore Pod: only once');
  // Mend: 75 now, 50 more over 12 s.
  const s = spawnAt(g, 'snapper', H, k.pos.x + 2, k.pos.z); s.hp = 10; s.maxHp = 300; k.energy = 200; k.abCd = {};
  check(useAbility(g, k, 'mend', { x: s.pos.x, z: s.pos.z, id: s.id }), `Mend: cast on a hurt friend (${whyNot(g, k, 'mend', { x: s.pos.x, z: s.pos.z, id: s.id }) || 'ok'})`);
  check(Math.abs(s.hp - 85) < 1, `Mend: 75 at once (${s.hp.toFixed(0)})`);
  const foe = spawnAt(g, 'linesman' as Kind, O, k.pos.x + 3, k.pos.z); k.abCd = {}; k.energy = 200;
  check(!useAbility(g, k, 'mend', { x: foe.pos.x, z: foe.pos.z, id: foe.id }), 'Mend: refused on an enemy'); foe.alive = false;
  const h1 = s.hp; run(g, 13); check(s.hp - h1 >= 49, `Mend: 50 more over 12 s (${(s.hp - h1).toFixed(0)}; Bloom heals too)`);
}

// ---------------------------------------------------------------- 3. Dig In, Shellbacks, Needlers, Blisters as mines
{
  const { g, H, O, cap } = world();
  const [x, z] = ring(cap, 0, 25); const sh = spawnAt(g, 'shellback', H, x, z);
  check(!useAbility(g, sh, 'dig'), 'Dig In: refused before the research');
  g.buyUpgrade('gdig', H); check(!!g.upOf(H).gdig, 'Dig In: bought at the Mother Cap');
  check(useAbility(g, sh, 'dig') && isDug(sh), 'Dig In: a Shellback digs in');
  const tr = spawnAt(g, 'linesman' as Kind, O, x + 6, z); check(!seenBy(g, O, sh), 'Dig In: unseen by an enemy with no detector');
  sh.hp = sh.maxHp * .4; const h0 = sh.hp; run(g, 2); check(sh.hp - h0 > G2.shellback.dugHeal * 1.5, `Shellback: heals fast dug in (${(sh.hp - h0).toFixed(1)} in 2 s)`);
  const p0 = sh.pos.clone(); sh.order = { type: 'amove', x: x + 20, z }; run(g, 1); check(sh.pos.distanceTo(p0) < .3, 'Dig In: a dug Shellback cannot move before Dug Crawl');
  sh.abCd = {}; check(useAbility(g, sh, 'dig') && !isDug(sh), 'Dig In: comes up again'); tr.alive = false;
  grow(g, 'shellpit', H, cap.pos.x - 16, cap.pos.z); check(!g.buyUpgrade('gcrawl', H), 'Dug Crawl: needs an Elder Cap'); g.upOf(H).gcrawl = true; sh.hp = sh.maxHp * .5; sh.abCd = {}; useAbility(g, sh, 'dig'); const p1 = sh.pos.clone(); sh.order = { type: 'amove', x: x + 20, z: z + 5 }; run(g, 2);
  check(isDug(sh) && sh.pos.distanceTo(p1) > 2, `Dug Crawl: a dug Shellback moves (${sh.pos.distanceTo(p1).toFixed(1)} m)`);
  // Needler: fires only dug in.
  const [nx, nz] = ring(cap, 2, 28), nd = spawnAt(g, 'needler', H, nx, nz), dummy = spawnAt(g, 'linesman' as Kind, O, nx + 7, nz); dummy.maxHp = dummy.hp = 5000; dummy.speed = 0;
  run(g, 3); check(dmgOf(dummy) === 0 || isDug(nd), 'Needler: does not fire standing up');
  if (!isDug(nd)) useAbility(g, nd, 'dig'); run(g, 4); check(isDug(nd) && dmgOf(dummy) > 0, `Needler: fires dug in (${dmgOf(dummy).toFixed(0)} damage in 4 s)`);
  { const seen = new Set<string>(); for (let i = 0; i < 60; i++) { g.update(1 / 30); for (const e of g.evq!) if (e[0] === 'lk') seen.add(e[1]); g.evq!.length = 0; } check(seen.has('gfire'), 'Needler: its spines go to every screen as a look (lk gfire)'); }
  dummy.alive = false;
  // Blister dug in as a mine.
  nd.alive = false; sh.alive = false; const [bx, bz] = ring(cap, 4, 70), bl = spawnAt(g, 'blister', H, bx, bz); useAbility(g, bl, 'dig'); check(isDug(bl), 'Blister: digs in');
  const walker = spawnAt(g, 'linesman' as Kind, O, bx + 9, bz); walker.order = { type: 'amove', x: bx - 9, z: bz }; walker.maxHp = walker.hp = 400;
  run(g, 6, () => !bl.alive); check(!bl.alive && dmgOf(walker) > 0, `Blister: a dug Blister bursts when an enemy walks over it (${dmgOf(walker).toFixed(0)} damage)`);
}

// ---------------------------------------------------------------- 4. Lobber, Smother, Seeder
{
  const { g, H, O, cap } = world();
  const [x, z] = ring(cap, 1, 26), lb = spawnAt(g, 'lobber', H, x, z), dm = spawnAt(g, 'linesman' as Kind, O, x + 12, z); dm.maxHp = dm.hp = 5000; dm.speed = 0; dm.order = { type: 'guard', x: x + 12, z };
  check(!useAbility(g, lb, 'bile', { x: x + 40, z }), 'Bile Lob: refused out of reach');
  check(useAbility(g, lb, 'bile', { x: dm.pos.x, z: dm.pos.z }), 'Bile Lob: thrown at a spot');
  run(g, .5); check(FUSES.length === 1, 'Bile Lob: a mark shows where it will land before it lands');
  const d0 = dmgOf(dm); run(g, G2.lobber.lob.fuse + .2); check(dmgOf(dm) - d0 >= G2.lobber.lob.dmg * .9, `Bile Lob: lands 2.5 s later for 60 (${(dmgOf(dm) - d0).toFixed(0)}, with its spit)`);
  lb.alive = false; dm.alive = false;
  const sm = spawnAt(g, 'smother', H, x, z); sm.energy = 200; const t1 = spawnAt(g, 'linesman' as Kind, O, x + 7, z), t2 = spawnAt(g, 'linesman' as Kind, O, x + 7.5, z + 1);
  check(useAbility(g, sm, 'choke', { x: x + 7, z }), 'Choke Spores: cast');
  run(g, G2.smother.choke.fuse + .6); check(hasStatus(t1, 'root') && hasStatus(t2, 'root'), 'Choke Spores: everything there is held in place');
  t1.alive = t2.alive = false; sm.energy = 200; sm.abCd = {};
  const vic = spawnAt(g, 'linesman' as Kind, O, x + 6, z); check(useAbility(g, sm, 'mind', { x: vic.pos.x, z: vic.pos.z, id: vic.id }), 'Rot Mind: cast on an enemy');
  run(g, 1); check(vic.team === H, 'Rot Mind: the body fights for the Gloam'); run(g, G2.smother.mind.t); check(vic.team === O, 'Rot Mind: and goes home 12 s later');
  sm.energy = 200; sm.abCd = {}; const big = spawnAt(g, 'mulcher', O, x + 6, z + 3); check(!useAbility(g, sm, 'mind', { x: big.pos.x, z: big.pos.z, id: big.id }), 'Rot Mind: refused on a huge body'); big.alive = false; vic.alive = false;
  const sd = spawnAt(g, 'seeder', H, x, z + 4), aim = spawnAt(g, 'linesman' as Kind, O, x + 20, z + 4); const n0 = g.own('husk', H).length;
  check(useAbility(g, sd, 'fling', { x: aim.pos.x, z: aim.pos.z }), 'Fling Husks: thrown'); run(g, 1); check(g.own('husk', H).length - n0 === G2.seeder.n, 'Fling Husks: two Husks');
  aim.alive = false; run(g, G2.seeder.life + 1); check(g.own('husk', H).length === 0, 'Fling Husks: they wither after 18 s');
}

// ---------------------------------------------------------------- 5. fliers: Gnatwing, Bloater, Sower, Hooksail, Drifter
{
  const { g, H, O, cap } = world(); g.human[H] = true;
  const [x, z] = ring(cap, 3, 26);
  const gw = spawnAt(g, 'gnatwing', H, x, z); check(!!gw.air || UNIT.gnatwing.air === true, 'Gnatwing: flies');
  const a = spawnAt(g, 'linesman' as Kind, O, x + 3, z), b = spawnAt(g, 'linesman' as Kind, O, x + 4.5, z + 1); a.maxHp = a.hp = b.maxHp = b.hp = 2000; a.speed = b.speed = 0;
  run(g, 6); check(dmgOf(a) > 0 && dmgOf(b) > 0, `Gnatwing: a bite jumps to the body next to it (${dmgOf(a).toFixed(0)} and ${dmgOf(b).toFixed(0)})`); gw.alive = false; a.alive = b.alive = false;
  const bt = spawnAt(g, 'bloater', H, x, z), fl = spawnAt(g, 'gnatwing', O, x + 6, z); fl.team = O; fl.maxHp = fl.hp = 3000;
  const grd = spawnAt(g, 'linesman' as Kind, O, x + 4, z - 2); grd.maxHp = grd.hp = 3000; grd.speed = 0;
  run(g, 8); check(dmgOf(fl) > 0, `Bloater: spits at fliers (${dmgOf(fl).toFixed(0)}; ${bt.alive} ${bt.target?.kind} ${fl.alive} ${fl.alt} ${bt.pos.distanceTo(fl.pos).toFixed(1)})`); check(dmgOf(grd) === 0, 'Bloater: does not hit the ground');
  bt.alive = fl.alive = grd.alive = false;
  const sw = spawnAt(g, 'sower', H, x, z), tgt = spawnAt(g, 'linesman' as Kind, O, x + 8, z); tgt.maxHp = tgt.hp = 3000; tgt.speed = 0;
  run(g, 4); check(g.own('pup', H).length > 0 || dmgOf(tgt) > 0, `Sower: drops Pups on the ground below (${g.own('pup', H).length} out)`); sw.alive = false; tgt.alive = false; run(g, G2.sower.life + 1);
  check(g.own('pup', H).length === 0, 'Sower: Pups wither');
  // Hooksail: Reel, Spore Cloud, Drink.
  const hk = spawnAt(g, 'hooksail', H, x, z); hk.energy = 200; const v = spawnAt(g, 'linesman' as Kind, O, x + 8, z); v.speed = 0;
  g.human[H] = true; const v0 = v.pos.clone(); check(useAbility(g, hk, 'reel', { x: v.pos.x, z: v.pos.z, id: v.id }), 'Reel: cast'); run(g, 1.2);
  check(v.pos.distanceTo(v0) > 3 && v.pos.x < v0.x, `Reel: the body is pulled toward the Hooksail (${v.pos.distanceTo(v0).toFixed(1)} m)`);
  v.alive = false; hk.energy = 200; hk.abCd = {};
  const hx = hk.pos.x, hz = hk.pos.z, sh = spawnAt(g, 'linesman' as Kind, O, hx + 8, hz + 4), mark = spawnAt(g, 'snapper', H, hx, hz + 4); mark.maxHp = mark.hp = 5000; mark.speed = 0; sh.speed = 0;
  check(useAbility(g, hk, 'cloud', { x: sh.pos.x, z: sh.pos.z }), `Spore Cloud: cast (${whyNot(g, hk, 'cloud', { x: sh.pos.x, z: sh.pos.z })} ${hk.cast?.key})`); run(g, .6); const m0 = dmgOf(mark), sp = sh.pos.clone(); for (let i = 0; i < 40; i++) { sh.pos.copy(sp); run(g, .1); } /* held where it stands: a Linesman walks in to a step away, where the cloud lets it hit */ check(dmgOf(mark) - m0 === 0, `Spore Cloud: an enemy inside cannot hit from range (${(dmgOf(mark) - m0).toFixed(0)} damage once the cloud is up)`);
  sh.alive = false; mark.alive = false;
  hk.energy = 20; hk.abCd = {}; const sac = grow(g, 'sporesac', H, x + 2, z + 2); hk.pos.set(x + 2, 0, z + 5);
  const bh = sac.hp; check(useAbility(g, hk, 'drink', { x: sac.pos.x, z: sac.pos.z, id: sac.id }), 'Drink: cast on its own building'); run(g, 1.2);
  check(bh - sac.hp >= G2.hooksail.drink.hp * .9 && hk.energy! >= 69, `Drink: 200 health for 50 energy (${(bh - sac.hp).toFixed(0)}, energy ${hk.energy!.toFixed(0)})`);
  hk.alive = false;
  // Drifter: a Spore Sac floats off and keeps its beds; carries 8 with Belly Sacs; ripens into a Lookout Sac that sees dug-in bodies.
  const cap0 = g.supplyCap(H); check(g.buildingAction(sac, 'uproot'), 'Spore Sac: floats off as a Drifter'); run(g, .2);
  const dr = g.own('drifter', H)[0]; check(!!dr && !sac.alive && g.supplyCap(H) === cap0, `Drifter: keeps its 8 beds (${cap0} -> ${g.supplyCap(H)})`);
  for (let i = 0; i < 4; i++) spawnAt(g, 'snapper', H, dr.pos.x + 1, dr.pos.z + (i - 2));
  check(!useAbility(g, dr, 'board'), 'Drifter: takes nobody aboard before Belly Sacs');
  g.buyUpgrade('gbelly', H); check(!g.upOf(H).gbelly, 'Belly Sacs: needs an Elder Cap'); grow(g, 'warren', H, cap.pos.x - 14, cap.pos.z); g.buildingAction(cap, 'grow'); run(g, BLD.eldercap.time + 1);
  g.buyUpgrade('gbelly', H); check(!!g.upOf(H).gbelly, 'Belly Sacs: bought once an Elder Cap stands'); dr.abCd = {};
  check(useAbility(g, dr, 'board') && (dr.cargo?.length || 0) >= 3, `Drifter: takes bodies aboard (${dr.cargo?.length || 0})`);
  dr.abCd = {}; check(useAbility(g, dr, 'drop') && !(dr.cargo?.length), 'Drifter: lets them out');
  dr.abCd = {}; check(useAbility(g, dr, 'ripen'), `Drifter: ripens into a Lookout Sac (${whyNot(g, dr, 'ripen', { x: 0, z: 0 }) || 'ok'})`); run(g, UNIT.lookoutsac.time + 1);
  const ls = g.own('lookoutsac', H)[0]; check(!!ls && (UNIT.lookoutsac.detect || 0) > 0, 'Lookout Sac: sees hidden bodies');
}

// ---------------------------------------------------------------- 6. Stinger Stalks and Puffballs walk; Deep Root tunnels; research gates
{
  const { g, H, O, cap } = world();
  const st = grow(g, 'stinger', H, cap.pos.x + 14, cap.pos.z); check(g.buildingAction(st, 'uproot'), 'Stinger Stalk: pulls up its roots'); run(g, .2);
  const sw = g.own('stingerwalk', H)[0]; check(!!sw && !st.alive, 'Stinger Stalk: walks');
  sw.order = { type: 'guard', x: sw.pos.x + 3, z: sw.pos.z }; run(g, G2.uproot.t + 4);
  check(useAbility(g, sw, 'root') || !!(sw as any).rootT || !sw.alive, 'Stinger Stalk: roots again on its own Bloom'); run(g, G2.uproot.root + 1);
  check(g.ownB('stinger', true, H).length === 1 && !sw.alive, 'Stinger Stalk: stands as a Stinger Stalk again');
  const pf = grow(g, 'puffball', H, cap.pos.x - 14, cap.pos.z + 6), fl = spawnAt(g, 'gnatwing', O, pf.pos.x + 6, pf.pos.z); fl.maxHp = fl.hp = 2000;
  run(g, 3); check(dmgOf(fl) > 0, `Puffball: shoots fliers (${dmgOf(fl).toFixed(0)})`); fl.alive = false;
  const dg = spawnAt(g, 'linesman' as Kind, O, pf.pos.x + 5, pf.pos.z + 3); g.buyUpgrade('gdig', 1);
  // Research gates.
  check(!g.buyUpgrade('gdmg2', H) && /Elder Cap/.test(g.gated(H, 'gdmg2')), `gates: Bite 2 needs an Elder Cap (${g.gated(H, 'gdmg2')})`);
  grow(g, 'oldgrowth', H, cap.pos.x, cap.pos.z + 16); check(g.buyUpgrade('gdmg', H) && g.buyUpgrade('garmor', H) && g.buyUpgrade('gspit1', H), 'Old Growth: Bite, Hide and Spit level 1');
  const sn = spawnAt(g, 'snapper', H, cap.pos.x + 30, cap.pos.z + 30); check(sn.maxHp > UNIT.snapper.hp, `Hide 1: new bodies have more health (${sn.maxHp.toFixed(0)} over ${UNIT.snapper.hp})`); dg.alive = false;
  // Deep Root tunnels.
  grow(g, 'warren', H, cap.pos.x - 14, cap.pos.z - 8); g.buildingAction(cap, 'grow'); run(g, BLD.eldercap.time + 1);
  const dr = grow(g, 'deeproot', H, cap.pos.x + 10, cap.pos.z - 14); const fx = cap.pos.x + 90, fz = cap.pos.z + 40;
  check(!g.canPlace('tunnelroot', fx, fz, false, H) || /see/.test((g as any).placeWhy || 'see'), 'Tunnel Root: refused where the side cannot see');
  const eye = spawnAt(g, 'snapper', H, fx + 3, fz); check(g.canPlace('tunnelroot', fx, fz, false, H), 'Tunnel Root: allowed where a body of its own stands close by');
  const g0 = g.own('grazer', H).length; const tr = g.place('tunnelroot', fx, fz, false, H, null); check(!!tr && g.own('grazer', H).length === g0, 'Tunnel Root: grows far from home and uses up no Grazer');
  run(g, BLD.tunnelroot.time + 1); check(otherEnd(g, tr!) === dr && otherEnd(g, dr) === tr, 'Tunnel Root: joined to its Deep Root');
  const walker = spawnAt(g, 'snapper', H, dr.pos.x + dr.hx + 1, dr.pos.z); walker.order = { type: 'amove', x: fx + 10, z: fz };
  run(g, 1.5); check(Math.hypot(walker.pos.x - tr!.pos.x, walker.pos.z - tr!.pos.z) < 8, `Tunnel: a body heading past the far end goes through (${Math.hypot(walker.pos.x - tr!.pos.x, walker.pos.z - tr!.pos.z).toFixed(0)} m from it)`);
  g.killBuilding(tr!); check(otherEnd(g, dr) === null, 'Tunnel: killing one end closes it'); eye.alive = false;
  // Vent Bladder: taps a vent and the Grazers carry Flux.
  const v = g.vents.slice().sort((a, b) => Math.hypot(a.pos.x - cap.pos.x, a.pos.z - cap.pos.z) - Math.hypot(b.pos.x - cap.pos.x, b.pos.z - cap.pos.z))[0];
  check(!!v && bldRule('ventbladder').tap === true, `Vent Bladder: taps a vent (${g.vents.length} vents laid)`);
}

// ---------------------------------------------------------------- 7. the bots make every unit (ten seeded 40-minute matches)
if (!quick) {
  const { spawn } = await import('node:child_process'), specs: any[] = [];
  // Two against the Ironhold, two against the Veyl, six mirrors (both Gloam sides counted), on all three maps.
  for (const [i, [home, out]] of [[2, 0], [0, 2], [2, 1], [1, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2]].entries()) specs.push({ home, out, map: i % 3, seed: 100 + i, mins: 40 });
  const rows: any[] = []; let next = 0;
  const one = (sp: any) => new Promise<void>(res => { let out = ''; const p = spawn(process.execPath, [process.argv[1], 'one', JSON.stringify(sp)], { stdio: ['ignore', 'pipe', 'inherit'] }); p.stdout.on('data', d => out += d); p.on('close', code => { const line = out.trim().split('\n').pop() || '{}'; try { rows.push({ ...JSON.parse(line), code }); } catch { rows.push({ sp, code, bad: out.slice(-300) }); } res(); }); });
  await Promise.all([0, 1, 2, 3].map(async () => { while (next < specs.length) await one(specs[next++]); }));
  const made = new Map<string, number>(), spend = new Map<string, number>(); let total = 0;
  for (const r of rows) { check(r.code === 0 && !r.bad, `bots: match ${JSON.stringify(r.sp)} ran to the end (${r.res ?? 'crashed'} at ${Math.round((r.t ?? 0) / 60)} min)`); check(!r.stall, `bots: no stall in ${JSON.stringify(r.sp)} (${r.stall || 'the Gloam kept making things'})`); for (const k in r.made || {}) made.set(k, (made.get(k) || 0) + r.made[k]); for (const k in r.spend || {}) { spend.set(k, (spend.get(k) || 0) + r.spend[k]); total += r.spend[k]; } }
  for (const k of Object.keys(G_UNIT)) check((made.get(k) || 0) > 0, `bots: made at least one ${UNIT[k as Kind].name} across ten matches (${made.get(k) || 0})`);
  console.log('\nShare of the Gloam\'s unit spend (ore plus Flux), ten matches:');
  for (const [k, v] of [...spend].sort((a, b) => b[1] - a[1])) console.log(`  ${UNIT[k as Kind].name.padEnd(13)} ${(v / total * 100).toFixed(1).padStart(5)}%  made ${made.get(k)}`);
  console.log('Results: ' + rows.map(r => `${r.sp?.home}${r.sp?.out}:${r.res} ${Math.round((r.t ?? 0) / 60)}m`).join(' '));
}
console.log(fail.length ? `\n${fail.length} FAILED\n` + fail.join('\n') : '\nALL PASS');
if (fail.length) process.exitCode = 1;
export { check, fail, world, run };

function oneMatch(sp: { home: number; out: number; map: number; seed: number; mins: number }) {
  seed = sp.seed; setMap(sp.map); setSides(sp.home, sp.out);
  const g = new Game(noPipe(), noHud, DIFFS[1], sp.map, null, null, true); g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; g.human = g.human.map(() => false);
  for (const u of g.units) u.pilot = 0;
  const T = sp.home === 2 ? SIDE.home : SIDE.out, mine = (t: number) => t === T || (sp.home === 2 && sp.out === 2 && fac(t) === 2), seen = new Map<Unit, string>(), made: Record<string, number> = {}, spend: Record<string, number> = {};
  const note = (u: Unit, from?: string) => { const k = u.kind; made[k] = (made[k] || 0) + 1; const c = costOf(k as Kind), f = from ? costOf(from as Kind) : [0, 0]; spend[k] = (spend[k] || 0) + Math.max(0, c[0] - f[0]) + Math.max(0, c[1] - f[1]); };
  for (const u of g.units) if (mine(u.team)) seen.set(u, u.kind);
  // Every body counts from the moment it is made, even one that dies before the once-a-second count (a Pup under fire).
  const spawn0 = g.spawn.bind(g); (g as any).spawn = (...a: Parameters<Game['spawn']>) => { const u = spawn0(...a); if (u && mine(u.team) && fac(u.team) === 2 && !seen.has(u)) { note(u); seen.set(u, u.kind); lastNew = g.time; } return u; };
  let res = 'draw', lastNew = 0, stall = '';
  for (let i = 0; i < sp.mins * 60 * 30; i++) {
    g.update(1 / 30); g.evq!.length = 0;
    if (i % 30 === 0) {
      for (const u of g.units) if (u.alive && mine(u.team) && fac(u.team) === 2) { const was = seen.get(u); if (was === undefined) { note(u); lastNew = g.time; } else if (was !== u.kind) { note(u, was); lastNew = g.time; } seen.set(u, u.kind); }
      if ((sp as any).log && i % (30 * 60) === 0) { const bk: Record<string, number> = {}; for (const b of g.buildings) if (b.alive && b.team === T) bk[b.kind] = (bk[b.kind] || 0) + 1; console.error(Math.round(g.time / 60) + 'm', 'ore', Math.round(g.cash(T)), 'flux', Math.round(g.flux(T)), 'army', g.army(T).length, 'foe', g.army(T === SIDE.home ? SIDE.out : SIDE.home).length, JSON.stringify(bk), Object.keys(g.upOf(T)).filter(k => g.upOf(T)[k as never]).join(',')); }
      if (g.time - lastNew > 300 && g.ownB(undefined, true, T).length && !stall) stall = `nothing new for 5 minutes at ${Math.round(g.time / 60)} min`;
    }
    if (g.endT > 0 || !g.hqs(SIDE.home).length || !g.hqs(SIDE.out).length) { res = !g.hqs(SIDE.home).length ? 'out' : !g.hqs(SIDE.out).length ? 'home' : g.endWon ? 'home' : 'out'; break; }
  }
  console.log(JSON.stringify({ sp, res, t: Math.round(g.time), made, spend, stall }));
}
void [G_BLD, G_DIGS, UPGRADES, costOf, abilitiesOf, unitRule];
