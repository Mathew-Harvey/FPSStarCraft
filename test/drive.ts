// The body a person drives (DRIVE in src/command.ts) and the first minute of a match (src/opening.ts), from the fun audit of 2026-11-24.
// Against a side nobody plays, a driven body's hits are worth more and a bot's hits on it land for less; between two people neither applies.
// After a death the player is not put in a body that is nearly dead. A side with a person in a body gets one fighter with its first barracks
// and sees one enemy scout; a bot match gets neither. Run: node tools/run-ts.mjs test/drive.ts
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, FACTION, isFighter, setMap, setSides } from '../src/data';
import { DRIVE } from '../src/command';
import { clearMatch } from '../src/core/sides';
initHeadless();
let fails = 0; const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) fails++; };
let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const match = (home: number, out: number, people: number[]) => {
  clearMatch(); setMap(0); const [H, O] = setSides(home, out); const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true);
  g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; (g as any).introT = 0; for (const u of g.units) u.pilot = 0; g.human = g.human.map((_, t) => people.includes(t === H ? 0 : t === O ? 1 : -1));
  return { g, H, O };
};
const run = (g: Game, secs: number) => { for (let i = 0; i < secs * 30 && g.phase !== 'over'; i++) { if ((g as any).phase === 'card') (g as any).phase = 'play'; g.keys.clear(); g.update(1 / 30); g.evq!.length = 0; } };
const near = (a: number, b: number) => Math.abs(a - b) < .01;

check(DRIVE.dmg > 1 && DRIVE.guard < 1, `the dial ships on: a driven body deals x${DRIVE.dmg} and takes x${DRIVE.guard} against bots`);
// One hit each way, Ironhold against the Gloam (no armour, no shields, no Veyl multiplier in the sum).
const hit = (people: number[], drivenShoots: boolean) => { const { g, H, O } = match(0, 2, people); const a = g.spawn('linesman', H, 60, 7), b = g.spawn('quillback', O, 66, 7); g.possess(a, true); (g as any).safeT = 0;
  const from = drivenShoots ? a : b, to = drivenShoots ? b : a, h0 = to.hp; g.damage(to, 10, from); return h0 - to.hp; };
check(near(hit([0], true), 10 * DRIVE.dmg), 'a driven body\'s hit on a bot side is worth more');
check(near(hit([0], false), 10 * DRIVE.guard), 'a bot\'s hit on a driven body lands for less');
check(near(hit([0, 1], true), 10) && near(hit([0, 1], false), 10), 'with a person on each side a hit is worth what it says, both ways');
{ const { g, H, O } = match(0, 2, []); const a = g.spawn('linesman', H, 60, 7), b = g.spawn('quillback', O, 66, 7), h0 = b.hp; g.damage(b, 10, a); check(near(h0 - b.hp, 10), 'a bot\'s hit on a bot is unchanged'); }

// Respawn: the nearest body is nearly dead, a whole one stands a little further off.
{ const { g, H } = match(0, 2, [0]); const me = g.spawn('linesman', H, 60, 7), hurt = g.spawn('linesman', H, 62, 7), whole = g.spawn('linesman', H, 75, 7); hurt.hp = 8; g.possess(me, true);
  g.killUnit(me, null); (g as any).staticT = 0; g.respawn();
  check(g.me === whole, 'after a death the player goes to a healthy body, not the nearest dying one');
  const h0 = whole.hp; g.damage(whole, 20, null); check(whole.hp === h0, 'and that body cannot be hurt for a moment');
  run(g, DRIVE.safe + .2); g.damage(whole, 20, null); check(whole.hp < h0, 'then it can'); }
{ const { g, H } = match(0, 2, [0]); for (const u of g.units) if (u.team === H) u.alive = false; const me = g.spawn('linesman', H, 60, 7), hurt = g.spawn('linesman', H, 62, 7); hurt.hp = 8; g.possess(me, true); g.killUnit(me, null); (g as any).staticT = 0; g.respawn();
  check(g.me === hurt, 'with only a hurt body left, the player still gets it'); }

// The opening.
for (const [home, out] of [[0, 1], [1, 2], [2, 0]]) {
  const { g, H, O } = match(home, out, [0]); const w = g.units.find(u => u.team === H)!; g.possess(w, true); let scout = false, fighterAt = -1, hurtByScout = false; const n0 = g.units.filter(u => u.alive && u.team === H).length;
  for (let t = 0; t < 75; t++) { run(g, 1); if (g.units.some(u => u.alive && u.team === O && u.order.type === 'scout')) scout = true; if (fighterAt < 0 && g.units.some(u => u.alive && u.team === H && isFighter(u))) fighterAt = g.time; }
  check(fighterAt > 0 && fighterAt < 70, `${FACTION[H].name}: a person in a body has a fighter to jump into inside 70 s (${Math.round(fighterAt)} s)`);
  check(scout, `${FACTION[H].name}: one enemy scout comes down the road`);
  check(g.units.filter(u => u.alive && u.team === H).length >= n0, `${FACTION[H].name}: the scout kills nobody`);
}
{ const { g, H, O } = match(0, 1, []); let scout = false; for (let t = 0; t < 60; t++) { run(g, 1); if (g.units.some(u => u.team === O && u.order.type === 'scout')) scout = true; }
  check(!scout && !Object.keys(g.opened).length, 'a bot match gets no scout and no free fighter'); }
{ const { g, H, O } = match(0, 1, [0, 1]); const w = g.units.find(u => u.team === H)!; g.possess(w, true); run(g, 60); check(!Object.keys(g.opened).length, 'a match between two people gets neither'); }
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
