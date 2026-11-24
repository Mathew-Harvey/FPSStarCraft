// Fun audit: the first two minutes for a person in a worker body who does nothing. Prints when the first fighter and the scout appear and what becomes of the scout.
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, isFighter, setMap, setSides } from '../../src/data';
import { clearMatch } from '../../src/core/sides';
initHeadless();
for (const [mf, ff] of [[0, 1], [0, 2], [1, 0], [2, 1]]) {
  let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  setMap(0); const [H, O] = setSides(mf, ff); const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true); g.noRender = true; g.evq = []; g.phase = 'play'; (g as any).introT = 0;
  g.human = g.human.map((_, t) => t === H); const w = g.units.find(u => u.team === H)!; g.possess(w, true);
  let minD = 1e9, minT = 0, first = -1, scoutAt = -1, scoutDead = -1, scout: any = null, lost = 0; const n0 = g.units.filter(u => u.team === H).length;
  for (let i = 0; i < 30 * 150; i++) { if ((g as any).phase === 'card') (g as any).phase = 'play'; g.keys.clear(); g.update(1 / 30);
    for (const e of g.evq!) if (e[0] === 'fd' && /scout/i.test(String(e[2]))) console.log('  feed', Math.round(g.time), e[1], e[2]); g.evq!.length = 0;
    if (first < 0 && g.units.some(u => u.alive && u.team === H && isFighter(u))) first = g.time;
    if (!scout) { scout = g.units.find(u => u.alive && u.team === O && u.order.type === 'scout'); if (scout) scoutAt = g.time; } else if (scoutDead < 0 && !scout.alive) scoutDead = g.time; if (scout && scout.alive) { const dd = Math.hypot(scout.pos.x - g.hqs(H)[0].pos.x, scout.pos.z - g.hqs(H)[0].pos.z); if (dd < minD) { minD = dd; minT = g.time; } } }
  const near = scout ? Math.round(Math.hypot(scout.pos.x - g.hqs(H)[0].pos.x, scout.pos.z - g.hqs(H)[0].pos.z)) : -1; console.log(JSON.stringify({ minD: Math.round(minD), minT: Math.round(minT), lastBy: scout?.lastBy, near, order: scout?.order.type, me: mf, foe: ff, firstFighter: Math.round(first), scoutOut: Math.round(scoutAt), scoutDead: Math.round(scoutDead), myBodies: g.units.filter(u => u.alive && u.team === H).length, me_alive: !!g.me?.alive }));
  clearMatch();
}
