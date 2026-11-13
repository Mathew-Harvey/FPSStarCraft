// Checks for the Vast maps: the far base is hidden, the layout gives nothing away, scouts find it, and a bot side follows a build plan a scout can read.
// Runs in Node with no browser, on the same simulation the match server runs. Run with: npm run test:scout
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, SIDE, FACTION, MAP, MAPS, SIZES, VHOME, VAST, TURNS, ROAD, RALLY, setMap, setSides, validMap, rollMap, mapCode, baseOf, sizeOf, turnOf, BKind } from '../src/data';
import { DOCTRINES } from '../src/doctrine';
import { docOf } from '../src/director';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function match(map: number, home = 0, out = 1) {
  setMap(map); setSides(home, out); const g = new Game(noPipe(), noHud, DIFFS[1], map, null, null, true);
  g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => false);
  return g;
}
const run = (g: Game, secs: number, each?: () => void) => { for (let i = 0; i < secs * 30 && g.phase !== 'over'; i++) { each?.(); g.update(1 / 30); g.evq!.length = 0; } };
const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// 1. Map numbers. The old maps keep their numbers and draw nothing from the dice; a Vast map gets a turn nobody chose.
{
  const s0 = seed; let same = true; for (let size = 0; size < 3; size++) for (let base = 0; base < 3; base++) if (rollMap(mapCode(base, size)) !== mapCode(base, size)) same = false;
  check(same && seed === s0, 'Small, Medium and Large maps keep their numbers, and picking one draws nothing from the dice');
  const turns = new Set<number>(); for (let i = 0; i < 400; i++) { const c = rollMap(mapCode(1, VAST)); if (baseOf(c) !== 1 || sizeOf(c) !== VAST || !validMap(c)) turns.add(-1); turns.add(turnOf(c)); }
  check(!turns.has(-1) && !turns.has(0) && turns.size === TURNS, `a Vast match is turned one of ${TURNS} ways, never left as drawn (${turns.size} seen in 400 rolls)`);
  check(rollMap(mapCode(0, VAST), 7) === 730 && rollMap(1530) !== undefined && turnOf(rollMap(1530, 3)) === 3, 'a turn can be pinned, and rolling again replaces the old turn');
  check(!validMap(2500 + 30) && !validMap(134) && !validMap(-1) && validMap(2432) && validMap(30), 'map numbers past the last turn, and turned story maps, are refused');
  check(SIZES[VAST].name === 'Vast' && SIZES.length === 4 && MAPS.length === 6, 'Vast is the fourth size, and no map was added or dropped');
}

// 2. Every hidden layout, all 72 of them: fields round both bases, roads that do not point at the enemy, and room behind each base.
{
  let bad = '', n = 0; const behind = [0, 0], rel: number[] = [];
  for (let base = 0; base < 3; base++) for (let turn = 1; turn <= TURNS; turn++) {
    const code = mapCode(base, VAST) + 100 * turn; setSides(0, 1); setMap(code); n++; const s = MAP.sites!, [mx, mz] = MAP.mid!, R = MAP.rad!, L = Math.hypot(VHOME.x, VHOME.z), why = (w: string) => { if (!bad) bad = `${code}: ${w}`; };
    if (!MAP.hid || MAP.arch) why('not hidden, or an arch marks the real road');
    if (L < 235 || L > 310) why(`bases ${Math.round(L)} m apart`);
    if (s.length !== SIZES[VAST].sites) why(`${s.length} fields`);
    for (const [x, z] of s) { if (Math.hypot(x, z) < 80 || Math.hypot(x - VHOME.x, z - VHOME.z) < 80) why('a field on top of a base'); if (Math.hypot(x - mx, z - mz) > R - 40) why('a field at the edge of the world'); }
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (Math.hypot(s[i][0] - s[j][0], s[i][1] - s[j][1]) < 70) why('two fields on top of each other');
    // every field has a twin the same walk from the other base
    for (const [x, z] of s) if (!s.some(q => Math.hypot(q[0] - (VHOME.x - x), q[1] - (VHOME.z - z)) < 2)) why('a field with no twin at the other end');
    for (const [hx, hz] of [[0, 0], [VHOME.x, VHOME.z]]) {
      if (R - Math.hypot(hx - mx, hz - mz) < 190) why(`only ${Math.round(R - Math.hypot(hx - mx, hz - mz))} m of world behind a base`);
      const near = s.filter(q => Math.hypot(q[0] - hx, q[1] - hz) < 125).length; if (near < 3) why(`only ${near} fields within 125 m of a base`);
      const eb = Math.atan2(hz ? -VHOME.z : VHOME.z, hx ? -VHOME.x : VHOME.x), roads = MAP.roads!.slice(1).filter(r => Math.hypot(r[0] - hx, r[1] - hz) < 20), bear = roads.map(r => Math.atan2(r[3] - r[1], r[2] - r[0]));
      if (roads.length < 3) why(`only ${roads.length} decoy roads from a base`);
      if (bear.some(a => gap(a, eb) < .45)) why('a decoy road runs beside the real one');
      if (bear.some(a => gap(a, eb) > 1.5708)) behind[hx ? 1 : 0]++; if (!hx) rel.push(...bear.map(a => gap(a, eb)));
    }
    if (!/ road$/.test(MAP.road) || !/ ridge$/.test(MAP.flankName!)) why('the roads are not named by compass bearing');
  }
  check(!bad && n === 72, `all 72 hidden layouts have 12 paired ore fields, 3 or more near each base, 3 or more decoy roads from each base, and 190 m of world behind each base${bad ? ' (' + bad + ')' : ''}`);
  const away = rel.filter(a => a > 1.5708).length / rel.length;
  check(behind[0] === 72 && behind[1] === 72 && away > .35 && away < .7, `every base has a road leading away from the enemy, and about half of all decoy roads do (${Math.round(away * 100)}%)`);
}

// 3. The old maps are not hidden, and their world is where it was.
{
  let bad = ''; for (const code of [0, 1, 2, 10, 21, 22, 4]) { setSides(0, 1); setMap(code); const k = MAP.k!; if (MAP.hid || MAP.roads!.length !== 1 || Math.abs(MAP.rad! - 200 * k) > 1e-6 || Math.abs(MAP.mid![0] - MAP.out[0] / 2) > 1e-6 || Math.abs(MAP.mid![1] - MAP.out[1] / 2) > 1e-6) bad = String(code); }
  setMap(0); check(!bad && MAP.out[0] === 124 && MAP.out[1] === 13 && MAP.arch === 68 && MAP.road === 'east road', 'the old maps are not hidden: one road, the same middle and edge, the same names' + (bad ? ` (${bad})` : ''));
}

// 4. A hidden match, bots on both sides. Nobody knows anything at the start, both ends build from one building, scouts go out, and each side finds
//    the other well before the nine-minute fallback. No push sets off before its side has seen something to push at.
for (const [map, home, out] of [[mapCode(0, VAST) + 500, 0, 1], [mapCode(2, VAST) + 1900, 2, 0], [mapCode(1, VAST) + 1200, 1, 1]]) {
  const g = match(map, home, out), I = g.intel, H = SIDE.home, O = SIDE.out, name = `${FACTION[H].short} v ${FACTION[O].short} on ${map}`;
  check(g.eco && g.ownB(undefined, false, H).length === 1 && g.ownB(undefined, false, O).length === 1 && g.own(undefined, H).length === 6 && g.own(undefined, O).length === 6, `${name}: both ends start with one building and six workers`);
  check(!I.knows(H) && !I.knows(O) && !I.known(H).length && !I.known(O).length && I.read(H).key === 'none', `${name}: at the start neither side knows where the other is`);
  const r0 = g.dir.rallyAt(0, false, g.dir), r1 = g.dir.rallyAt(0, false, g.dir.vs);
  check(Math.hypot(r0.x, r0.z) < 30 && Math.hypot(r1.x - VHOME.x, r1.z - VHOME.z) < 30 && Math.hypot(r0.x - RALLY.x, r0.z - RALLY.z) > 6, `${name}: before the enemy is found a squad waits by its own base, not on the road to theirs`);
  check(Math.abs(g.yaw - 2.2) < 1e-6, `${name}: the first view faces the same way whatever the layout`);
  let early = '', scouts = 0, maxOut = 0; const ids = new Set<number>();
  run(g, 560, () => { for (const s of [g.dir, g.dir.vs]) if (s.plan && !I.known(s.team).length && !early) early = `${FACTION[s.team].short} planned a push at ${Math.round(g.time)} s knowing nothing`;
    let now = 0; for (const u of g.units) if (u.alive && u.order.type === 'scout') { now++; if (!ids.has(u.id)) { ids.add(u.id); scouts++; } } maxOut = Math.max(maxOut, now); });
  check(!early, `${name}: no push is planned before its side has found something to push at${early ? ' (' + early + ')' : ''}`);
  check(scouts >= 2 && maxOut <= 6, `${name}: both sides send scouts (${scouts} sent, at most ${maxOut} out at once)`);
  check(I.found[0] && I.found[1] && I.foundT[0] < 535 && I.foundT[1] < 535, `${name}: each side's own scouts find the other (at ${Math.round(I.foundT[0])} s and ${Math.round(I.foundT[1])} s)`);
  const r2 = g.dir.rallyAt(0, false, g.dir); check(Math.hypot(r2.x - RALLY.x, r2.z - RALLY.z) < 6 || g.phase === 'over', `${name}: once found, the squad waits on the road to them`);
  check(I.known(H).every(b => b.alive && b.team === O) && I.known(H).length <= g.ownB(undefined, false, O).length, `${name}: a side only plans against buildings it has seen (${I.known(H).length} of ${g.ownB(undefined, false, O).length})`);
}

// 5. What a side knows is what it has looked at. A building put up out of sight is not on the map; one seen and then knocked down out of sight stays
//    on the map until somebody looks again.
{
  const g = match(mapCode(0, VAST) + 800), I = g.intel, H = SIDE.home, O = SIDE.out; g.dir.auto = false; g.dir.vs.auto = false; g.dir.docSet = g.dir.vs.docSet = true;
  const scout = g.spawn('linesman', H, VHOME.x - ROAD.dx * 20, VHOME.z - ROAD.dz * 20); scout.pilot = 9; run(g, 2);
  const hq = g.ownB(FACTION[O].hq, false, O)[0];
  check(I.found[0] && I.seen[0].has(hq.id) && !I.found[1], 'a body standing in sight of their base puts it on the map, and seeing is one way only');
  const far = g.addBuilding('broodpit', O, Math.round(VHOME.x + ROAD.dx * 34), Math.round(VHOME.z + ROAD.dz * 34), true); run(g, 2);
  check(!I.seen[0].has(far.id) && I.known(H).length === 1, 'a building that goes up out of sight is not on the map');
  scout.pos.set(far.pos.x - ROAD.dx * 12, 0, far.pos.z - ROAD.dz * 12); run(g, 2); const had = I.seen[0].has(far.id);
  scout.pos.set(0, 0, 0); run(g, 1); g.damage(far, 1e6, null); run(g, 2);
  check(had && !far.alive && I.seen[0].has(far.id) && !I.known(H).includes(far), 'a building knocked down out of sight stays on the map, but nobody plans a push at it');
  scout.pos.set(far.pos.x - ROAD.dx * 12, 0, far.pos.z - ROAD.dz * 12); run(g, 2);
  check(!I.seen[0].has(far.id), 'and it comes off the map when somebody looks at the spot again');
}

// 6. The scout order: a body walks out to the end of a road nobody has looked down, then home, and goes back to what it was doing.
{
  const g = match(mapCode(1, VAST) + 300), I = g.intel, H = SIDE.home; g.dir.vs.auto = false; g.dir.docSet = g.dir.vs.docSet = true; g.human[H] = true; g.dir.auto = false;
  g.dir.order('S', 0, 0, null); const u = g.units.find(x => x.alive && x.order.type === 'scout')!;
  check(!!u && u.team === H && I.spots[0].some(s => s.sent && Math.hypot(s.x - u.order.x, s.z - u.order.z) < 1), 'the scout order sends one free body to the end of a road');
  g.dir.order('S', 0, 0, null); g.dir.order('S', 0, 0, null); const out = g.units.filter(x => x.alive && x.order.type === 'scout'), ends = new Set(out.map(x => Math.round(x.order.x) + ',' + Math.round(x.order.z)));
  check(out.length === 3 && ends.size === 3, 'three scout orders send three bodies down three different roads');
  let far = 0; run(g, 150, () => { far = Math.max(far, Math.hypot(u.pos.x, u.pos.z)); });
  check(far > 80 && (u.order.type !== 'scout' || u.order.back === true), `a scout walks out (${Math.round(far)} m) and turns for home`);
  run(g, 120); const back = g.units.filter(x => x.alive && x.order.type === 'scout').length;
  check(back <= 1 && I.spots[0].filter(s => s.seen).length >= 2, `scouts come home and go back to work, and the roads they walked are marked as looked at (${I.spots[0].filter(s => s.seen).length} of ${I.spots[0].length})`);
}

// 7. Build plans. On the old maps every side follows the standard plan, which changes nothing. On a hidden map each plan shows in what gets built,
//    and a scout with the whole base in view reads it right.
{
  const g0 = match(0); run(g0, 3); check(docOf(g0.dir) === DOCTRINES[0] && docOf(g0.dir.vs) === DOCTRINES[0] && !g0.dir.docSet, 'on the old maps both sides follow the standard plan');
  const picks = new Set<string>(); for (let i = 0; i < 12; i++) { const g = match(mapCode(0, VAST) + 100 * (1 + i)); run(g, 2); picks.add(docOf(g.dir).key); picks.add(docOf(g.dir.vs).key); }
  check(picks.size === DOCTRINES.length, `on a hidden map a bot side picks one of ${DOCTRINES.length} plans (${[...picks].join(', ')})`);
  const tower: BKind[] = ['watchpost', 'thornspire', 'stinger'], prod: BKind[] = ['bunkhouse', 'broodpit'];
  for (const f of [0, 1, 2]) {
    const tally = (plan: number, secs: number) => { const g = match(mapCode(0, VAST) + 600, f, f === 0 ? 1 : 0); g.docFix = plan; g.dir.vs.auto = true; run(g, secs); const T = SIDE.home, n = (ks: BKind[]) => g.ownB(undefined, false, T).filter(b => ks.includes(b.kind)).length;
      // a scout with the whole base in view
      const I = g.intel; for (const b of g.ownB(undefined, false, T)) I.seen[1].set(b.id, { id: b.id, kind: b.kind, x: b.pos.x, z: b.pos.z, built: b.built, t: g.time });
      return { hq: n([FACTION[T].hq]), prod: n(prod), tower: n(tower), read: I.read(SIDE.out).key, key: docOf(g.dir).key }; };
    const name = FACTION[f].short, rush = tally(1, 200), fort = tally(2, 300), boom = tally(3, 330);
    if (f !== 2) check(rush.key === 'rush' && rush.prod >= 2 && rush.tower === 0 && rush.read === 'rush', `${name} early rush: two barracks and no towers by 200 s, and a scout reads it as a rush (${rush.prod} barracks, ${rush.tower} towers, read ${rush.read})`);
    else check(rush.key === 'rush' && rush.tower === 0 && rush.hq === 1, `${name} early rush: no towers and no second base by 200 s (${rush.tower} towers)`);
    check(fort.key === 'fort' && fort.tower >= 2 && fort.read === 'fort', `${name} dig in: two towers or more by 300 s, and a scout reads it as digging in (${fort.tower} towers, read ${fort.read})`);
    check(boom.key === 'boom' && boom.hq >= 2 && boom.read === 'boom', `${name} second base early: two bases by 330 s, and a scout reads it as expanding (${boom.hq} bases, read ${boom.read})`);
  }
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASS'); process.exit(fail.length ? 1 : 0);
