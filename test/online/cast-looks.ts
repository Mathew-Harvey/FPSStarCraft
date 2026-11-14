// Every screen sees what the rules do, online: a cast going off and a wind-up under way reach each player, watcher and replay that
// can see the caster (and no other side), and the building parts that move only for show (a Flak Tower's aim, a building crawling or
// lifted off and flying) come down the wire too. Read from the ability definitions, so the Veyl and Gloam casts are covered the day they land.
// Run with: node tools/run-ts.mjs test/online/cast-looks.ts
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, SIDE, UNIT, BLD, FACTION, setMap, setSides, fac, Kind, BKind, Unit, Building } from '../../src/data';
import { abilitiesOf, useAbility, whyNot, type AbilityDef } from '../../src/core/ability';
import { SCENES, clearScenes } from './scenes';
import { Wire, applySnap, netTick } from '../../src/netgame';
import { mem } from '../../src/factions/ironhold/kit';
import { defineUnitLook } from '../../src/net-look';
import { switchKind } from '../../src/core/morph';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// every ability's look is watched: which screen played which cast, for which body
// the factions give their abilities their looks once every file has loaded
await Promise.resolve(); await new Promise(r => setTimeout(r, 0));
const shown: { g: Game; key: string; id: number; tid: number }[] = [], looks = new Set<AbilityDef>();
for (const k of Object.keys(UNIT) as Kind[]) for (const a of abilitiesOf(k)) { const was = a.show; if (was) looks.add(a); a.show = (g, u, t, tgt) => { shown.push({ g, key: a.key, id: u.id, tid: tgt?.id || 0 }); was?.(g, u, t, tgt); }; }

setMap(0); setSides(0, 1);
const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true);
g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => false);
g.dir.qmT = 1e9; (g.dir.vs as any).qmT = 1e9;
const H = SIDE.home, O = SIDE.out, wire = new Wire(g);
// three screens: the home side's player, the other side's player and a watcher who sees everything
const fakeNet = (id: number, watch = false): any => ({ id, watch: watch ? { follow: 0, team: H } : null, inbox: [], out: [], unit: 0, sendT: 9, speed: 1, cmd() { /* nothing */ }, flush() { /* nothing */ } });
const screen = (team: number, net: any) => { const c = new Game(noPipe(), noHud, DIFFS[1], 0, null, net, true); c.noRender = true; c.myTeam = team; c.phase = 'play'; return c; };
const cH = screen(H, fakeNet(1)), cO = screen(O, fakeNet(2)), cW = screen(H, fakeNet(3, true));
g.teams = { 1: H, 2: O }; for (const c of [cH, cO, cW]) c.teams = g.teams;
/** The server runs `n` ticks, then sends each screen its picture, the way a match does. */
function run(n = 1) {
  for (let i = 0; i < n; i++) g.update(1 / 30);
  wire.begin([H, O]); const sH = JSON.parse(JSON.stringify(wire.snap(H))), sO = JSON.parse(JSON.stringify(wire.snap(O))), sW = JSON.parse(JSON.stringify(wire.snap(null)));
  applySnap(cH, sH); applySnap(cO, sO); applySnap(cW, sW);
}
const on = (c: Game, key: string, id: number) => shown.some(s => s.g === c && s.key === key && s.id === id);
const hq = g.ownB(undefined, false, H)[0], oq = g.ownB(undefined, false, O)[0];
const quiet = { x: (hq.pos.x + oq.pos.x) / 2, z: (hq.pos.z + oq.pos.z) / 2 };
const ready = (u: Unit, a: AbilityDef) => { u.energy = Math.max(u.maxEnergy || 0, a.energy); u.abCd = {}; u.cast = null; u.status = []; };
for (const t of [H, O]) for (const key in g.ups[t]) (g.ups[t] as any)[key] = true;
run();

/** A body and a building change form on the host; each screen that is sent them shows the new kind with its own model. */
function reforms(F: string, w: Game, step: (n?: number) => void, screens: Game[], side: number, unit: [Kind, Kind], bld: [BKind, BKind] | null, at: { x: number; z: number }) {
  const u = w.spawn(unit[0], side, at.x, at.z - 6); u.pilot = 0; step();
  const before = screens.map(c => c.units.find(x => x.id === u.id)?.obj);
  switchKind(w, u, unit[1]); step();
  const now = screens.map(c => c.units.find(x => x.id === u.id));
  check(now.every((x, i) => x && x.kind === unit[1] && x.obj !== before[i] && x.obj.parent === c0(screens[i])), `${F}: ${an(UNIT[unit[0]].name)} turned ${UNIT[unit[1]].name} on the host is a ${UNIT[unit[1]].name}, with its new model, on ${screens.length} screens`);
  u.alive = false; step();
  if (!bld) return;
  const b = w.addBuilding(bld[0], side, at.x + 12, at.z - 12, true); step();
  const bb = screens.map(c => c.buildings.find(x => x.id === b.id)?.obj);
  w.rebuild(b, bld[1]); step();
  const bn = screens.map(c => c.buildings.find(x => x.id === b.id));
  check(bn.every((x, i) => x && x.kind === bld[1] && x.obj !== bb[i] && x.obj.parent === c0(screens[i]) && !bb[i]?.parent), `${F}: ${an(BLD[bld[0]].name)} grown or refitted into ${an(BLD[bld[1]].name)} is one on the screens too, the old model gone`);
  b.alive = false; step();
}
const c0 = (c: Game) => c.scene, an = (n: string) => (/^[AEIOU]/.test(n) ? 'an ' : 'a ') + n;

// ---------------------------------------------------------------- a cast that goes off at once
// Every ability of the home side's kinds that goes off at once with a plain aim: the home player and the watcher see it, and the
// other side, with nobody near, does not.
const homeKinds = (Object.keys(UNIT) as Kind[]).filter(k => (UNIT[k].team || 0) === 0 && abilitiesOf(k).length);
let tried = 0, seenOk = 0, hidOk = 0, withLook = 0; const missed: string[] = [];
for (const k of homeKinds) for (const a of abilitiesOf(k)) {
  if (a.cast > 0) continue;
  const u = g.spawn(k, H, quiet.x, quiet.z); u.pilot = 0; ready(u, a);
  const tgt = a.target === 'body' ? g.spawn(FACTION[(a.who ?? 'foe') === 'ally' ? H : O].worker, (a.who ?? 'foe') === 'ally' ? H : O, quiet.x + 3, quiet.z) : null;
  run(); const t = { x: tgt ? tgt.pos.x : quiet.x + 3, z: tgt ? tgt.pos.z : quiet.z, id: tgt?.id };
  if (whyNot(g, u, a.key, t) || !useAbility(g, u, a.key, t)) { u.alive = false; if (tgt) tgt.alive = false; continue; }
  tried++; if (looks.has(a)) withLook++; run();
  if (on(cH, a.key, u.id) && on(cW, a.key, u.id)) seenOk++; else missed.push(`${k}.${a.key}`);
  if (!on(cO, a.key, u.id)) hidOk++;
  u.alive = false; if (tgt) tgt.alive = false; run();
}
check(tried >= 8, `${tried} casts that go off at once were tried, ${withLook} of them with a look of their own`);
check(seenOk === tried, `each one plays on the caster's side's screen and the watcher's${missed.length ? ': missed ' + missed.join(', ') : ''}`);
check(hidOk === tried, `and never on the other side's, which cannot see the caster (${hidOk} of ${tried})`);

// ...and the other side does see one cast where it is looking
{
  const k = homeKinds.find(x => abilitiesOf(x).some(a => a.cast === 0 && a.target === 'self'))!, a = abilitiesOf(k).find(x => x.cast === 0 && x.target === 'self')!;
  const u = g.spawn(k, H, oq.pos.x + 14, oq.pos.z); u.pilot = 0; ready(u, a); run(4);
  const sent = cO.units.some(x => x.id === u.id && x.alive); useAbility(g, u, a.key); run();
  check(sent && on(cO, a.key, u.id), `a ${UNIT[k].name}'s ${a.name} next to the other side's base plays on that side's screen too`);
  u.alive = false; run();
}

// ---------------------------------------------------------------- a wind-up
{
  let done = false;
  for (const k of homeKinds) { for (const a of abilitiesOf(k)) {
    if (!(a.cast > .5) || done) continue;
    const u = g.spawn(k, H, quiet.x, quiet.z); u.pilot = 0; ready(u, a);
    const tgt = a.target === 'body' ? g.spawn(FACTION[O].worker, O, quiet.x + 4, quiet.z) : null; run();
    const t = { x: tgt ? tgt.pos.x : quiet.x + 4, z: tgt ? tgt.pos.z : quiet.z, id: tgt?.id };
    if (whyNot(g, u, a.key, t) || !useAbility(g, u, a.key, t) || !u.cast) { u.alive = false; if (tgt) tgt.alive = false; run(); continue; }
    done = true; run();
    const cu = cH.units.find(x => x.id === u.id)!, wu = cW.units.find(x => x.id === u.id)!, first = cu?.cast;
    check(!!first && first.key === a.key && Math.abs(first.t - u.cast.t) < .2 && wu?.cast?.key === a.key, `a ${UNIT[k].name}'s ${a.name} winding up shows on the home screen and the watcher's (${first?.t.toFixed(1)} s left)`);
    check(!cO.units.some(x => x.id === u.id), 'and the other side, not looking, is not sent the body or its wind-up');
    const t0 = first!.t; run(10); check(cu.cast === first && cu.cast!.t < t0, 'the screen keeps the same wind-up as it counts down, so its look starts once');
    netTick(cH, .1); const t1 = cu.cast?.t ?? 0; netTick(cH, .1); check(cu.cast && cu.cast.t < t1, 'and counts it down between pictures');
    for (let i = 0; i < 20 && u.cast; i++) run(10);
    run(); check(!cu.cast && on(cH, a.key, u.id), 'when it goes off the wind-up ends and the cast plays');
    u.alive = false; if (tgt) tgt.alive = false; run();
  } }
  check(done, 'some Ironhold ability winds up');
}

// ---------------------------------------------------------------- building parts that move for show
{
  const bk = (Object.keys(BLD) as BKind[]).find(k => (BLD[k].team || 0) === 0 && FACTION[H].builds.includes(k) && k !== FACTION[H].hq) || FACTION[H].builds[1];
  const b = g.addBuilding(bk, H, quiet.x + 10, quiet.z + 10, true), foe = g.spawn(FACTION[O].worker, O, quiet.x + 16, quiet.z + 10); run(2);
  const cb = () => cH.buildings.find(x => x.id === b.id)!, wb = () => cW.buildings.find(x => x.id === b.id)!;
  mem(b).aim = foe; mem(b).aimT = g.time; run();
  check((mem(cb()).aim as Unit)?.id === foe.id && (mem(wb()).aim as Unit)?.id === foe.id, `a building's aim (the Flak Tower's gun) reaches the screens: on the ${BLD[bk].name}, at body ${foe.id}`);
  g.time += 3; run(); check(!(mem(cb()).aim && cH.time - (mem(cb()).aimT || 0) < 2), 'and lapses on them when it stops shooting');
  mem(b).crawl = { x: b.pos.x + 20, z: b.pos.z, t: 0 }; run();
  check(!!mem(cb()).crawl, 'a building crawling on skids shows its skids on the screens');
  b.pos.x += 4; b.obj.position.x = b.pos.x; run(); for (let i = 0; i < 20; i++) netTick(cH, 1 / 30);
  check(Math.abs(cb().pos.x - b.pos.x) < .05 && Math.abs(cb().obj.position.x - b.pos.x) < .05, `and moves where it crawls (${cb().pos.x.toFixed(1)} on the screen, ${b.pos.x.toFixed(1)} on the server)`);
  mem(b).crawl = null; run(); check(!mem(cb()).crawl, 'the skids go when it settles');
  b.air = true; run(); for (let i = 0; i < 30; i++) cH.coreTick(1 / 30);
  check(cb().air === true && (cb().alt || 0) > .5, `a building lifted off to fly rises on the screens too (${(cb().alt || 0).toFixed(1)} m)`);
  b.air = false; run(); check(cb().air === false, 'and comes down');
  b.alive = false; foe.alive = false; run();
}

// ---------------------------------------------------------------- body looks, alive and at death
{
  // a test look: a number the rules keep on a body, and one they set as it dies (a mine that blew, or fizzled)
  defineUnitLook({ key: 'ztest', get: (_g, u) => mem(u).ztest || 0, set: (_g, u, v) => { mem(u).ztest = v; } });
  const u = g.spawn(FACTION[H].worker, H, quiet.x + 5, quiet.z - 5); u.pilot = 0; mem(u).ztest = 7; run();
  const cu = () => cH.units.find(x => x.id === u.id)!;
  check(mem(cu()).ztest === 7 && mem(cW.units.find(x => x.id === u.id)!).ztest === 7, 'a body\'s look number reaches the screens while it lives');
  mem(u).ztest = 0; run(); check(!mem(cu()).ztest, 'and clears when the rules clear it');
  const c0 = cu(); g.killUnit(u, null); mem(u).ztest = 3; run();   // set after the death event, as a dying hook would
  check(!c0.alive && mem(c0).ztest === 3, 'its death carries the look as the rules left it, read before the screen plays the death');
}

// ---------------------------------------------------------------- changes of form
reforms('Ironhold', g, run, [cH, cW], H, ['piledriver', 'piledriverset'], ['headframe', 'surveyrig'], quiet);

// ---------------------------------------------------------------- every faction's casts
// Each faction in a match of its own at the far end (Ironhold in a mirror): every ability that can be cast at a plain spot (or where its bot
// hook would cast it) plays on its own side's screen and the watcher's once it goes off, wind-ups too, and never on the home side's.
let staged = 0;
for (const f of [0, 1, 2]) {
  setMap(0); setSides(0, f);
  const H = SIDE.home, O = SIDE.out;   // this match's own two teams (an Ironhold mirror's far end is team 3)
  const w = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true);
  w.noRender = true; w.evq = []; w.me = null; w.phase = 'play'; for (const u of w.units) u.pilot = 0; w.human = w.human.map(() => false);
  w.dir.qmT = 1e9; (w.dir.vs as any).qmT = 1e9; for (const t of [H, O]) for (const key in w.ups[t]) (w.ups[t] as any)[key] = true;
  const ww = new Wire(w), sH = screen(H, fakeNet(1)), sO = screen(O, fakeNet(2)), sW = screen(O, fakeNet(3, true)); w.teams = { 1: H, 2: O }; for (const c of [sH, sO, sW]) c.teams = w.teams;
  const step = (n = 1) => { for (let i = 0; i < n; i++) w.update(1 / 30); ww.begin([H, O]); const a = JSON.parse(JSON.stringify(ww.snap(H))), b = JSON.parse(JSON.stringify(ww.snap(O))), c = JSON.parse(JSON.stringify(ww.snap(null))); applySnap(sH, a); applySnap(sO, b); applySnap(sW, c); };
  step();
  const spot = quiet;
  if (f === 0) { /* Ironhold forms are checked above */ } else if (f === 1) reforms('Veyl', w, step, [sO, sW], O, ['choirmaster', 'chord'], null, spot);   // the Veyl have no building tiers
  else reforms('Gloam', w, step, [sO, sW], O, ['shellback', 'lobber'], ['eldercap', 'ancientcap'], spot);   // the same map: halfway between the two ends
  let n = 0, both = 0, hid = 0, nh = 0, looked = 0; const miss: string[] = [], skip: string[] = [], leak: string[] = [];
  for (const k of (Object.keys(UNIT) as Kind[]).filter(x => (UNIT[x].team || 0) === f)) for (const a of abilitiesOf(k)) {
    const u = w.spawn(k, O, spot.x, spot.z); u.pilot = 0; ready(u, a); const who = a.who ?? 'foe', S = who === 'ally' ? O : H;
    const tgt = a.target === 'body' ? w.spawn(FACTION[fac(S)].worker, S, spot.x + 3, spot.z) : null; if (tgt && who === 'ally') tgt.hp = tgt.maxHp * .6;
    if (tgt && who !== 'ally') { tgt.maxHp = tgt.hp = 5000; tgt.speed = 0; }   // an enemy target lives through a wind-up, so the cast goes off
    step(); let t: { x: number; z: number; id?: number } | null = { x: tgt ? tgt.pos.x : spot.x + 3, z: tgt ? tgt.pos.z : spot.z, id: tgt?.id };
    if (whyNot(w, u, a.key, t) && a.ai) t = a.ai(w, u);
    if ((!t || whyNot(w, u, a.key, t)) && SCENES[`${k}.${a.key}`]) { t = SCENES[`${k}.${a.key}`](w, u, O, H); step(); ready(u, a); if (a.key === 'drink') u.energy = 0; }   // ready again: its own bot hook may have started it in that tick   // its own rule's scene (scenes.ts)
    if (t && SCENES[`${k}.${a.key}`] && !whyNot(w, u, a.key, t)) staged++;
    if (!t || whyNot(w, u, a.key, t) || !useAbility(w, u, a.key, t)) { skip.push(`${k}.${a.key}`); u.alive = false; if (tgt) tgt.alive = false; clearScenes(); step(); continue; }
    n++; if (looks.has(a)) looked++;
    for (let i = 0; i < Math.ceil(a.cast * 3) + 4 && u.cast; i++) step(10); step();   // a long wind-up (a Deep Charge holds 14 s) runs out first
    if (on(sO, a.key, u.id) && on(sW, a.key, u.id)) both++; else miss.push(`${k}.${a.key}`);
    if (!tgt || who === 'ally') { nh++; if (!on(sH, a.key, u.id)) hid++; else leak.push(`${k}.${a.key}`); }   // an enemy target stands by the caster, so that side sees it
    u.alive = false; if (tgt) tgt.alive = false; clearScenes(); step();
  }
  const F = ['Ironhold', 'Veyl', 'Gloam'][f];
  check(n >= 10 && !skip.length, `${F}: every ability cast, ${n} of them, ${looked} with a look of their own${skip.length ? ' (left out, needing a scene in scenes.ts: ' + skip.join(', ') + ')' : ''}`);
  check(both === n, `${F}: each one plays on its side's screen and the watcher's${miss.length ? ': missed ' + miss.join(', ') : ''}`);
  check(hid === nh && nh > 3, `${F}: and never on the other side's when none of its bodies is near (${hid} of ${nh})${leak.length ? ': seen ' + leak.join(', ') : ''}`);
}

check(staged >= 12, `${staged} casts went in the scene their own rule asks for (scenes.ts)`);
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall cast and look checks passed'); process.exit(fail.length ? 1 : 0);
