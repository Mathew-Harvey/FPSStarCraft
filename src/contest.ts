// The rich seam (fun audit plan row 10, 2026-11-24): a thing to fight over away from both bases. In the bot tables more than half of all
// matches ended with the winner never losing a building, and nothing fell for the first nine minutes.
// Every four minutes a seam opens at a spot between the two bases and both sides are told where. A side holds it while it has a fighter
// within reach of the spot and the other side has none. Hold it for a minute without a break and the side banks 300 ore. If nobody has
// taken it after two and a half minutes it closes. A bot side sends a few fighters each time.
// It is a match variant ('seam' in src/career.ts), off unless the player switches it on, so no test or bot table sees it.
import type { Game } from './game';
import { FACTION, MAP, SIDE, STORY, homeXZ, isFighter } from './data';
import { multi } from './core/sides';
import { RULES } from './career';
import { M, V3 } from './gfx';

export const CONTEST = { /** Seconds from one seam closing to the next opening, and to the first. */ every: 240, /** Seconds a side must hold it. */ hold: 60, /** Ore for holding it. */ pay: 300, /** Metres from the spot that count. */ r: 14, /** Seconds it stays open with nobody winning it. */ open: 150, /** Fighters a bot side sends. */ squad: 5 };
export const newContest = () => ({ next: CONTEST.every, n: 0, holder: -1, held: 0, left: 0, botT: 0, puffT: 0 });

export function tickContest(g: Game, dt: number) {
  // The marker in the world, on every screen that knows where the seam is (a client is told by the host).
  if (g.seam && !g.noRender) { const C = g.contest; C.puffT -= dt; if (C.puffT <= 0) { C.puffT = .35; g.puff(V3(g.seam.x, .4, g.seam.z), 2, .9, M.green, 3.2, .8, 1.6); } }
  if (!RULES.seam || !g.eco || g.mission || STORY.on || g.net || multi() || g.phase === 'over') return;
  const C = g.contest, H = SIDE.home, O = SIDE.out;
  if (!g.seam) {
    if (g.time < C.next) return;
    // Where: half way between the bases, then to one side of that line and the other in turn. On a hidden map the middle of the world,
    // which is not on the line between the bases, so the marker does not point at the far base.
    const [ax, az] = homeXZ(H), [bx, bz] = homeXZ(O), dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 1, side = [0, 1, -1][C.n % 3] * Math.min(26, d * .18);
    const x = MAP.hid && MAP.mid ? MAP.mid[0] : (ax + bx) / 2 - dz / d * side, z = MAP.hid && MAP.mid ? MAP.mid[1] : (az + bz) / 2 + dx / d * side;
    g.seam = { x: Math.round(x), z: Math.round(z) }; C.n++; C.holder = -1; C.held = 0; C.left = CONTEST.open; C.botT = 0;
    if (g.evq) g.evq.push(['sm', g.seam.x, g.seam.z, 1]);
    g.feed('Signal', `A rich seam has opened between the bases. It is marked on your map. Keep a fighter on it for ${CONTEST.hold} seconds, with none of theirs there, and you bank ${CONTEST.pay} ore.`, 'al');
    return;
  }
  const S = g.seam, near = (t: number) => g.units.filter(u => u.alive && u.team === t && isFighter(u) && Math.hypot(u.pos.x - S.x, u.pos.z - S.z) < CONTEST.r).length;
  // A bot side sends its nearest few fighters, and sends again every 25 seconds while it has nobody there.
  C.botT -= dt; if (C.botT <= 0) { C.botT = 25; for (const t of [H, O]) if (!g.human[t] && !near(t)) { const ids = g.army(t).filter(u => !u.pilot).sort((p, q) => Math.hypot(p.pos.x - S.x, p.pos.z - S.z) - Math.hypot(q.pos.x - S.x, q.pos.z - S.z)).slice(0, CONTEST.squad).map(u => u.id); if (ids.length) g.dir.command(t, ids, 'm', S.x, S.z); } }
  const a = near(H), b = near(O), now = a && !b ? H : b && !a ? O : -1;
  if (now !== C.holder) { C.holder = now; C.held = 0; if (now >= 0) g.feed('Signal', `${FACTION[now].name} are on the rich seam. ${CONTEST.hold} seconds and it is theirs.`, 'al'); }
  else if (now >= 0) { C.held += dt; if (C.held >= CONTEST.hold) { g.purse[now] = (g.purse[now] || 0) + CONTEST.pay; g.feed('Signal', `${FACTION[now].name} held the rich seam and banked ${CONTEST.pay} ore. The next one opens in ${Math.round(CONTEST.every / 60)} minutes.`, 'al'); close(g); return; } }
  C.left -= dt; if (C.left <= 0 && C.holder < 0) { g.feed('Signal', 'The rich seam has closed. Nobody took it.', ''); close(g); }
}
function close(g: Game) { g.seam = null; g.contest.next = g.time + CONTEST.every; g.contest.holder = -1; g.contest.held = 0; if (g.evq) g.evq.push(['sm', 0, 0, 0]); }

