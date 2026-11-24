// Fun audit: a hidden start on sizes other than Vast. Bot v bot on a turned map, to see that the bots still find each other and a match ends.
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, MAP, setMap, setSides } from '../../src/data';
import { clearMatch } from '../../src/core/sides';
initHeadless();
const o = JSON.parse(process.argv[2] || '{}'), codes: number[] = o.codes || [100, 211, 322], pairs: number[][] = o.pairs || [[0, 1]];
for (const code of codes) for (const [a, b] of pairs) {
  let seed = 7 + code; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  setMap(code); const [H, O] = setSides(a, b); const g = new Game(noPipe(), noHud, DIFFS[1], code, null, null, true); g.noRender = true; g.phase = 'play'; (g as any).introT = 0; g.human = g.human.map(() => false);
  let firstFight = -1; const t0 = Date.now();
  for (let i = 0; i < 30 * 2500 && (g as any).phase !== 'over'; i++) { if ((g as any).phase === 'card') (g as any).phase = 'play'; g.update(1 / 30); if (firstFight < 0 && g.stats.kills + g.stats.lost > 0) firstFight = g.time; }
  console.log(JSON.stringify({ code, hid: MAP.hid, a, b, over: g.phase === 'over', won: g.won, pts: (g as any).byPoints, min: +(g.time / 60).toFixed(1), firstDeath: Math.round(firstFight), out: MAP.out, secs: Math.round((Date.now() - t0) / 1000) }));
  clearMatch();
}
