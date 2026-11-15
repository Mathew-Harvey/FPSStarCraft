// Scripted first-person player (stream L, gate line 7). Headless; the yard side (team 0) is a player whose side runs itself (the bot keeps the
// economy and the army, as with the side left on auto) while a script drives one body in first person with perfect aim, through the real
// controls: yaw, pitch, the move keys and the trigger. Every push the side's quartermaster calls is said yes to (Z).
// Run: node tools/run-ts.mjs tools/fp.ts '{"mode":"lead","me":0,"foe":1,"map":0,"seeds":[1,2]}' >> rows.jsonl
//   mode bot:  no player at all, both sides bots (the baseline).
//   mode cmd:  a player who never drives a body (command view hands-off: the side runs itself, the LEAD bonus never applies).
//   mode lead: the script drives a fighter that stays with the army and shoots whatever is in reach (LEAD on for the crew round it).
//   mode rush: the script drives a body straight at the far base from the first second and shoots its way in (the opening check:
//              no opening should win by minute 6 against a bot that scouts).
//   me, foe: factions 0 Ironhold, 1 Veyl, 2 Gloam. Prints one JSON line a match.
//   node tools/run-ts.mjs tools/fp.ts sum rows.jsonl   win rate of the player's side by mode, and rush matches over by minute 6.
import { readFileSync } from 'node:fs';
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, FACTION, UNIT, BLD, setMap, setSides } from '../src/data';
import { isFighter } from '../src/data';
import { unitRule } from '../src/core/registry';
import { clearMatch } from '../src/core/sides';

const NAMES = ['Ironhold', 'Veyl', 'Gloam'];
if (process.argv[2] === 'sum') {
  const rows = readFileSync(process.argv[3], 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  for (const mode of ['bot', 'cmd', 'lead', 'rush']) {
    const rs = rows.filter(r => r.mode === mode); if (!rs.length) continue;
    const w = rs.filter(r => r.win === 0).length, by6 = rs.filter(r => r.win === 0 && r.min <= 6).length;
    const per = NAMES.map((n, f) => { const x = rs.filter(r => r.me === f); return `${n} ${x.filter(r => r.win === 0).length}/${x.length}`; }).join(', ');
    const dps = rs.filter(r => r.dealt !== undefined), lead = rs.filter(r => r.led !== undefined);
    console.log(`${mode}: player side won ${w} of ${rs.length} (${Math.round(w / rs.length * 100)}%), by minute 6: ${by6} | ${per} | middle ${med(rs.map(r => r.min))} min`
      + (dps.length ? ` | driven body dealt ${Math.round(avg(dps.map(r => r.dealt)))} a match, ${avg(dps.map(r => r.deaths)).toFixed(1)} bodies lost` : '')
      + (lead.length ? ` | crew led ${avg(lead.map(r => r.led)).toFixed(1)} on average` : ''));
  }
  process.exit(0);
}
function avg(a: number[]) { return a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); }
function med(a: number[]) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; }

initHeadless();
const o = JSON.parse(process.argv[2] || '{}'), mode: string = o.mode || 'lead', mins = o.mins ?? (mode === 'rush' ? 8 : 40);
for (const seed0 of o.seeds || [1]) {
  let seed = seed0; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const map = o.map ?? 0; setMap(map); const [H, O] = setSides(o.me ?? 0, o.foe ?? 1);
  const g = new Game(noPipe(), noHud, DIFFS[1], map, null, null, true);
  g.noRender = true; g.evq = []; g.phase = 'play'; (g as any).introT = 0;
  for (const u of g.units) u.pilot = 0;
  for (const u of g.units) { u.pos.x += (Math.random() - .5) * 4; u.pos.z += (Math.random() - .5) * 4; } g.dir.qmT = Math.random(); g.dir.vs.qmT = Math.random();
  const player = mode !== 'bot', drive = mode === 'lead' || mode === 'rush';
  g.human = g.human.map((_, t) => player && t === H); g.me = null;
  let dealt = 0, deaths = 0, ledSum = 0, ledN = 0, last: any = null, stuck = 0, strafe = 0, px = 0, pz = 0;
  const was = Game.prototype.damage; (g as any).damage = function (t: any, amt: number, from: any, ...r: any[]) { const h0 = t.hp + (t.shield || 0); const res = (was as any).call(this, t, amt, from, ...r); if (from && from === g.me && t.team !== H) dealt += Math.max(0, h0 - (t.hp + (t.shield || 0))); return res; };
  const hq = () => g.buildings.find(b => b.alive && b.team === O && b.kind === FACTION[O].hq) || g.buildings.find(b => b.alive && b.team === O);
  const pick = () => { const lead = FACTION[H].lead; const free = g.units.filter(u => u.alive && u.team === H && isFighter(u) && !unitRule(u.kind).heavy);
    const by = free.filter(u => u.kind === lead).concat(free); if (!by.length) return null; const f = hq(); if (!f) return by[0];
    return by.sort((a, b) => (a.kind === lead ? 0 : 1) - (b.kind === lead ? 0 : 1) || Math.hypot(a.pos.x - f.pos.x, a.pos.z - f.pos.z) - Math.hypot(b.pos.x - f.pos.x, b.pos.z - f.pos.z))[0]; };
  const step = () => {
    g.keys.clear(); g.lmb = false; (g as any).rmb = false; if ((g as any).phase === 'card') (g as any).phase = 'play';
    const s = g.dir.side(H); if (player && s?.plan && s.plan.phase === 'ask') g.dir.order('Z');
    if (!drive || (g as any).staticT > 0) return;   // the driven body just died: the game hands the player a new one when the static clears
    // Only fighters are driven: with none out yet (or after the driven one dies and the game drops the player into a worker) the worker goes
    // back to its job and the script waits for the next fighter.
    let m = g.me; if (last && (!m || !m.alive || m !== last)) { deaths++; last = null; }
    if (!m || !m.alive || m.team !== H || !isFighter(m)) { const u = pick(); if (u) { g.possess(u, true); m = g.me; } else { if (m && m.alive) { m.state = 'idle'; } g.me = null; return; } }
    if (!m || !isFighter(m)) return;
    last = m; ledSum += g.ledCount(); ledN++;
    const foes = g.units.filter(u => u.alive && u.team === O && !(u as any).dug && !(u as any).cloak), dist = (a: any) => Math.hypot(a.pos.x - m!.pos.x, a.pos.z - m!.pos.z);
    const near = foes.map(u => [dist(u), u] as const).sort((a, b) => a[0] - b[0])[0];
    let T: any = null, ty = 1.2, goal: any = null;
    if (near && near[0] < 34) { T = near[1]; ty = T.pos.y + (T.alt || 0) + UNIT[T.kind].bodyY; }
    else if (mode === 'rush') { const b = g.buildings.filter(x => x.alive && x.team === O).map(x => [dist(x), x] as const).sort((a, b) => a[0] - b[0])[0]; const f = hq();
      if (b && b[0] < 34) { T = b[1]; ty = T.pos.y + BLD[T.kind].h * .4; } else goal = f; }
    else { // lead: stay with the crew, a few metres behind the fighter nearest the far base
      const f = hq(), crew = g.army(H).filter(u => u !== m); if (crew.length && f) { const front = crew.sort((a, b) => Math.hypot(a.pos.x - f.pos.x, a.pos.z - f.pos.z) - Math.hypot(b.pos.x - f.pos.x, b.pos.z - f.pos.z))[0]; if (dist(front) > 7) goal = front; } }
    const G = T || goal; if (!G) return; const dx = G.pos.x - m.pos.x, dz = G.pos.z - m.pos.z, d = Math.hypot(dx, dz);
    g.yaw = Math.atan2(dx, dz);
    if (T) { g.pitch = Math.atan2(ty - (m.pos.y + ((m as any).alt || 0) + UNIT[m.kind].eye), d); g.lmb = true; g.pressed.add('Mouse0'); if (T && 'pilot' in T ? d > 22 : d > Math.max(BLD[T.kind]?.hx || 2, 2) + 14) g.keys.add('KeyW'); }
    else { g.pitch = 0; g.keys.add('KeyW'); if (d > 50) g.keys.add('ShiftLeft'); }
    if (g.keys.has('KeyW')) { if (Math.hypot(m.pos.x - px, m.pos.z - pz) < .02) stuck++; else stuck = 0; if (stuck > 20) { strafe = 25; stuck = 0; } if (strafe > 0) { strafe--; g.keys.add('KeyD'); } }
    px = m.pos.x; pz = m.pos.z; };
  const t0 = Date.now();
  for (let i = 0; i < (mins * 60 + 5) * 30 && g.phase !== 'over'; i++) { step(); g.update(1 / 30); g.evq!.length = 0;
    if (o.debug && i % 300 === 0) { const m = g.me, f = hq(); console.error(Math.round(g.time), m?.kind, m && f ? Math.round(Math.hypot(m.pos.x - f.pos.x, m.pos.z - f.pos.z)) : -1, Math.round(dealt), m?.alive); } }
  const win = g.winners.length ? (g.winners.includes(H) ? 0 : 1) : g.phase === 'over' ? (g.won ? 0 : 1) : -1;
  if (o.debug) console.error("end", g.phase, g.won, g.hqs(H).length, g.hqs(O).length, g.units.filter(u => u.alive && u.team === H).length);
  console.log(JSON.stringify({ mode, me: o.me ?? 0, foe: o.foe ?? 1, map, seed: seed0, win, min: Math.round(g.time / 6) / 10, points: g.byPoints,
    ...(drive ? { dealt: Math.round(dealt), deaths, led: +(ledSum / Math.max(1, ledN)).toFixed(2) } : {}), secs: Math.round((Date.now() - t0) / 1000) }));
  g.dispose?.(); clearMatch();
}
