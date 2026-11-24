// Fun audit: bot against bot with the rich seam switched on. Prints who was paid how often, and how the match went.
// Run: node tools/run-ts.mjs tools/audit/seam.ts '{"pairs":[[0,1],[0,2],[1,2]],"seeds":[1,2],"on":true}'
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, setMap, setSides } from '../../src/data';
import { clearMatch } from '../../src/core/sides';
import { setRules } from '../../src/career';
initHeadless();
const o = JSON.parse(process.argv[2] || '{}');
for (const [a, b] of (o.pairs || [[0, 1], [0, 2], [1, 2]]) as number[][]) for (const s0 of o.seeds || [1, 2]) {
  let seed = s0 * 7919 + a * 3 + b; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  setRules(o.on === false ? [] : ['seam']); const map = o.map ?? 0; setMap(map); const [H, O] = setSides(a, b); const g = new Game(noPipe(), noHud, DIFFS[1], map, null, null, true); g.noRender = true; g.evq = []; g.phase = 'play'; (g as any).introT = 0; g.human = g.human.map(() => false);
  const paid = [0, 0]; let opened = 0, none = 0, bFirst = -1;
  for (let i = 0; i < 30 * 2500 && (g as any).phase !== 'over'; i++) { if ((g as any).phase === 'card') (g as any).phase = 'play'; g.update(1 / 30);
    for (const e of g.evq!) { if (e[0] === 'fd' && /banked 300/.test(e[2])) paid[String(e[2]).startsWith(['Ironhold', 'Veyl', 'Gloam'][a] === undefined ? '' : (g as any).constructor && '') ? 0 : 0] += 0; if (e[0] === 'fd' && /held the rich seam/.test(e[2])) paid[/^(The )?(Ironhold|Veyl|Gloam)/.test(e[2]) && e[2].includes(['Ironhold', 'Veyl', 'Gloam'][a]) && a !== b ? 0 : 1]++; if (e[0] === 'sm' && e[3]) opened++; if (e[0] === 'fd' && /Nobody took it/.test(e[2])) none++; if (e[0] === 'kb' && bFirst < 0) bFirst = g.time; } g.evq!.length = 0; }
  console.log(JSON.stringify({ on: o.on !== false, home: a, out: b, seed: s0, won: g.phase === 'over' ? (g.won ? 'home' : 'out') : 'none', min: +(g.time / 60).toFixed(1), opened, paidHome: paid[0], paidOut: paid[1], nobody: none, firstB: Math.round(bFirst / 6) / 10 }));
  clearMatch();
}
