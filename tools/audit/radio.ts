// Fun audit: how many lines the radio says to a person in a skirmish. A person sits in a worker body and does nothing for `min` minutes.
// Run: node tools/run-ts.mjs tools/audit/radio.ts '{"min":12,"pairs":[[0,2]],"quiet":true}'   (quiet false counts with the rule off)
import { noHud, noPipe } from '../../server/shim';
import { Game, QUIET } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, setMap, setSides } from '../../src/data';
import { clearMatch } from '../../src/core/sides';
initHeadless();
const o = JSON.parse(process.argv[2] || '{}'), min = o.min || 12; if (o.quiet === false) { QUIET.chat = 0; QUIET.again = 0; QUIET.same = 0; }
for (const [mf, ff] of (o.pairs || [[0, 2], [0, 1], [1, 0], [2, 0]]) as number[][]) {
  let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  setMap(0); const [H] = setSides(mf, ff); const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true); g.noRender = true; g.evq = []; g.phase = 'play'; (g as any).introT = 0;
  g.human = g.human.map((_, t) => t === H); g.possess(g.units.find(u => u.team === H)!, true);
  const by: Record<string, number> = {}, cls: Record<string, number> = {}; let n = 0; const lines: string[] = [];
  for (let i = 0; i < 30 * 60 * min && (g as any).phase !== 'over'; i++) { if ((g as any).phase === 'card') (g as any).phase = 'play'; g.keys.clear(); g.update(1 / 30);
    for (const e of g.evq!) if (e[0] === 'fd' && (e[5] < 0 || e[5] === H)) { n++; by[e[1]] = (by[e[1]] || 0) + 1; cls[e[3] || 'plain'] = (cls[e[3] || 'plain'] || 0) + 1; if (o.show) lines.push(`${Math.round(g.time)} ${e[1]} | ${e[2]} | ${e[3]}`); } g.evq!.length = 0; }
  console.log(JSON.stringify({ me: mf, foe: ff, min: +(g.time / 60).toFixed(1), lines: n, cls, by })); if (o.show) console.log(lines.join('\n'));
  clearMatch();
}
