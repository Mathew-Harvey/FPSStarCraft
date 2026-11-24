// What the game keeps between skirmishes (src/career.ts, fun audit stage 2): the player's own count in a match, bests, challenges and variants.
// Run: node tools/run-ts.mjs test/career.ts
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, FACTION, MAP, OVERTIME, setMap, setSides, validMap } from '../src/data';
import { CHALLENGES, RULES, VARIANTS, closeMatch, setRules, type Ctx, type Kept } from '../src/career';
import { clearMatch } from '../src/core/sides';
initHeadless();
let fails = 0; const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) fails++; };
let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const match = (home: number, out: number, people: number[], map = 0) => {
  clearMatch(); setMap(map); const [H, O] = setSides(home, out); const g = new Game(noPipe(), noHud, DIFFS[1], map, null, null, true);
  g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; (g as any).introT = 0; for (const u of g.units) u.pilot = 0; g.human = g.human.map((_, t) => people.includes(t === H ? 0 : t === O ? 1 : -1));
  return { g, H, O };
};
const run = (g: Game, secs: number) => { for (let i = 0; i < secs * 30 && g.phase !== 'over'; i++) { if ((g as any).phase === 'card') (g as any).phase = 'play'; g.keys.clear(); g.update(1 / 30); g.evq!.length = 0; } };
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ side: 0, foe: 1, map: 0, diff: 1, vars: [], ...over }), stat = (c: ReturnType<typeof closeMatch>, label: string) => c.you.find(s => s.label.startsWith(label))!;

check(CHALLENGES.length === 30 && new Set(CHALLENGES.map(c => c.id)).size === 30 && [0, 1, 2].every(s => CHALLENGES.filter(c => c.side === s).length === 10), 'thirty challenges, ten for each side');
check(VARIANTS.length === 4, 'four match variants');

// The count: kills, damage, streak, deaths, buildings lost and time.
{ const { g, H, O } = match(0, 1, [0]); const me = g.spawn(FACTION[H].lead, H, 62, 7); g.possess(me, true); run(g, 2); (g as any).safeT = 0;
  const foes = [0, 1, 2].map(i => g.spawn(FACTION[O].worker, O, 66 + i * 2, 7)); const hp0 = foes[0].hp + foes[0].shield;
  g.damage(foes[0], 5, me); check(g.tally.dealt > 0 && Math.abs(g.tally.dealt - (hp0 - foes[0].hp - foes[0].shield)) < .01, `the count is what came off the target (${g.tally.dealt.toFixed(1)})`);
  check(Math.abs(g.tally.side - g.tally.dealt) < .01, 'and the side total has it too');
  const crew = g.spawn(FACTION[H].lead, H, 60, 9); g.damage(foes[1], 5, crew); check(g.tally.side > g.tally.dealt, 'a crew hit adds to the side total and not to the player');
  for (const f of foes) { g.damage(f, 9999, me); } check(g.tally.kills === 3 && g.tally.streak === 3, `three kills in a row is a streak of three (${g.tally.kills}, ${g.tally.streak})`);
  check(g.tally.dealt < 1000, 'a killing blow counts only the health that was left');
  run(g, 5); const late = g.spawn(FACTION[O].worker, O, 66, 7); g.damage(late, 9999, me); check(g.tally.kills === 4 && g.tally.streak === 3, 'a kill five seconds later starts a new streak; the best stays');
  check(g.tally.bodyT > 6 && g.tally.aboveT === 0, 'time in a body is counted');
  { const z = (g.cmd as any).zt; (g.cmd as any).zt = 1; const a0 = g.tally.aboveT; g.update(1 / 30); (g.cmd as any).zt = z; check(g.tally.aboveT > a0, 'and time in the command view'); }

  const b = g.buildings.find(x => x.team === H && x.built && x.kind !== FACTION[H].hq) || g.buildings.find(x => x.team === H && x.built)!; g.killBuilding(b); check(g.tally.bLost === 1, 'a finished building of ours that falls is counted');
  const foeB = g.buildings.find(x => x.team === O && x.built)!; g.killBuilding(foeB); check(g.tally.bLost === 1, 'an enemy building is not');
  if (g.phase !== 'over') { const d0 = g.tally.deaths; g.killUnit(me, late); check(g.tally.deaths === d0 + 1, 'a body lost under the player is counted'); }
}
// Closing a match: the row, bests, challenges.
{ const { g } = match(0, 1, [0]); const kept: Kept = { best: {}, done: [] }; g.tally = { kills: 12, dealt: 900, side: 3000, streak: 5, deaths: 1, bLost: 0, bodyT: 500, aboveT: 100 }; g.time = 600; g.won = true;
  const c = closeMatch(g, ctx(), kept);
  check(stat(c, 'You dropped').n === '12' && stat(c, 'Your damage').n === '900 (30%)' && stat(c, 'Time in a body').n === '83%' && stat(c, 'Win time').n === '10:00', 'the row says kills, damage with its share, time in a body and the win time');
  check(!!stat(c, 'Win time').fresh && !!stat(c, 'Best streak').fresh, 'a first win sets bests');
  const ids = c.earned.map(e => e.id).sort().join(' '); check(ids === ['0:win', '0:night', '0:clean', '0:quick', '0:streak', '0:boots', '0:careful'].sort().join(' '), `it meets the challenges it should (${ids})`);
  check(kept.done.length === 7 && c.done === 7 && c.of === 30, 'and they are kept');
  g.time = 700; g.tally.kills = 3; const c2 = closeMatch(g, ctx(), kept);
  check(!stat(c2, 'Win time').fresh && stat(c2, 'Win time').was === '10:00' && !stat(c2, 'You dropped').fresh && c2.earned.length === 0, 'a slower win sets nothing and earns nothing twice');
  g.time = 500; const c3 = closeMatch(g, ctx(), kept); check(!!stat(c3, 'Win time').fresh && stat(c3, 'Win time').was === '10:00', 'a faster win is a new best and says what it beat');
  const c4 = closeMatch(g, ctx({ side: 1 }), kept); check(!!stat(c4, 'Win time').fresh && c4.earned.some(e => e.id === '1:win'), 'bests and challenges are per side');
  g.tally.kills = 99; g.time = 100; const n = kept.done.length, c5 = closeMatch(g, ctx({ vars: ['rich'] }), kept); check(!c5.you.some(s => s.fresh) && !c5.earned.length && kept.done.length === n && kept.best.kills !== 99, 'a Double ore match sets no best and earns nothing');
  g.won = false; const c6 = closeMatch(g, ctx({ side: 2 }), kept); check(!c6.you.some(s => s.label === 'Win time') && !c6.earned.length, 'a loss earns no challenge and has no win time');
  const c7 = closeMatch(g, null, kept); check(c7.you.length === 5 && !c7.you.some(s => s.fresh), 'a match that is not a skirmish gets the row and no bests');
  g.tally.side = 0; check(closeMatch(g, null, kept).you[1].n === String(Math.round(g.tally.dealt)), 'with no side total the damage has no share');
}
// Variants.
{ setRules(['short']); check(RULES.short && OVERTIME.start === 480 && OVERTIME.limit === 1200, 'Short shift: overtime from minute 8, points at minute 20');
  setRules([]); check(!RULES.short && OVERTIME.start === 1200 && OVERTIME.limit === 2400, 'and clearing it puts overtime back');
  setRules(['short']); { const { g } = match(0, 1, [0]); g.time = 9 * 60; check(g.overtime() > 0, 'in a short shift overtime is on at minute 9'); g.time = 7 * 60; check(g.overtime() === 0, 'and not at minute 7'); } setRules([]);
  const bank = (rich: boolean) => { setRules(rich ? ['rich'] : []); const { g, H } = match(0, 1, [0]); const p0 = g.purse[H]; run(g, 60); const k = g.oreK(H); setRules([]); return { got: g.purse[H] - p0, mined: g.stats.mined, k }; };
  const a = bank(false), b = bank(true); check(a.k === 1 && b.k === 2, `Double ore: a load banks twice (x${b.k})`);
  setRules(['noqm']); { const { g, H, O } = match(0, 1, [0]); const me = g.units.find(u => u.team === H)!; g.possess(me, true); run(g, 3); check(g.dir.side(H).auto === false && g.dir.side(O).auto === true, 'No Quartermaster: ours is off and the bot side still runs');
    g.dir.order('G', 0, 0, me); check(g.dir.side(H).auto === false, 'and the key does not switch it back on'); } setRules([]);
  { const { g, H } = match(0, 1, [0]); const me = g.units.find(u => u.team === H)!; g.possess(me, true); run(g, 3); check(g.dir.side(H).auto === true, 'without the variant the Quartermaster runs'); }
  check(validMap(100) && validMap(211) && validMap(322), 'a hidden start is a valid map on Medium, Small and Large'); setMap(211); check(MAP.hid === true, 'and the map is marked hidden'); setMap(0);
}
// A quieter radio (stage 3): repeats and idle chatter are dropped, alerts and teaching lines are not, and a side hears only its own lead.
{ const { g, H, O } = match(0, 2, [0]); const heard = () => { const n = g.evq!.filter(e => e[0] === 'fd').length; g.evq!.length = 0; return n; }; g.time = 100; heard();
  g.feed('Quartermaster', 'Stacking another Depot.', '', H); g.time += 60; g.feed('Quartermaster', 'Stacking another Depot.', '', H); check(heard() === 1, 'the same plain line a minute later is not said again');
  g.time += 300; g.feed('Quartermaster', 'Stacking another Depot.', '', H); check(heard() === 1, 'five minutes later it is');
  g.feed('Quartermaster', 'Something else.', '', H); check(heard() === 0, 'a second plain line from the same speaker inside 45 seconds is dropped');
  g.feed('Lookout', 'On the road!', 'al', H); g.feed('Lookout', 'On the road!', 'al', H); g.feed('Quartermaster', 'Press E.', 'in', H); check(heard() === 3, 'alerts and teaching lines always go out');
  g.feed('Linesman', 'Boots full of sand.', 'chat', H); check(heard() === 0, 'idle chatter waits when something was said in the last half minute');
  g.time += 31; g.feed('Linesman', 'Boots full of sand.', 'chat', H); const e = g.evq!.find(x => x[0] === 'fd'); check(!!e && e[3] === '', 'and is said, as a plain line, once the radio has been quiet'); heard();
  g.time += 50; g.feed('Snapper', 'We are many.', 'chat', O); g.feed('Linesman', 'Sand again.', 'chat', H); check(heard() === 2, 'a line to the other side does not hush ours');
  g.time = 400; g.dir.bark(g.spawn('snapper', O, 60, 7), 'down'); const b = g.evq!.find(x => x[0] === 'fd'); check(!b || b[5] === O, 'a bark goes to the side whose body it was'); }
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
