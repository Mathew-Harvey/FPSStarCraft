// Every story job, run headless for a few minutes with bots on both sides: the job's setup, script and objectives must run without
// throwing, and its objective lines must read as text. Then a few jobs are driven to their end by cheating the state, to check the
// win and lose paths. Run: node tools/run-ts.mjs test/story.ts [minutes] [job numbers...]
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, ROAD, SIDE, STORY, roadPt, setMap, setSides } from '../src/data';
import { MISSIONS, missionSides, charterTeam, Mission } from '../src/campaign';

initHeadless();
const mins = +(process.argv[2] || 3), only = process.argv.slice(3).map(Number);
let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const fails: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fails.push(what); };

function host(m: Mission) {
  setMap(m.map); setSides(...missionSides(m)); STORY.charter = charterTeam(m);
  const g = new Game(noPipe(), noHud, DIFFS[m.diff], m.map, m, null, m.out); g.noRender = true; g.evq = []; g.phase = 'play';
  const mine = m.out ? SIDE.out : SIDE.home; g.human = g.human.map((_, t) => t === mine);
  if (m.out) { g.me = null; for (const u of g.units) u.pilot = 0; const b = g.units.find(u => u.alive && u.team === mine); if (b) b.pilot = 1; }
  return { g, mine };
}
const T = 1 / 30;
MISSIONS.forEach((m, i) => {
  if (only.length && !only.includes(i + 1)) return;
  const label = `${m.tag} ${m.name}`;
  try {
    const { g } = host(m); let lines = 0, err = '';
    const steps = Math.round(mins * 60 / T);
    for (let k = 0; k < steps && g.phase === 'play' && g.endT <= 0; k++) { g.update(T); }
    for (const o of m.objectives) { const t = o.text(g); if (typeof t !== 'string' || !t.length || /undefined|NaN/.test(t)) err = t; }
    lines = (g.evq || []).length;
    const objs = m.objectives.map(o => (o.done(g) ? '[x] ' : '[ ] ') + o.text(g)).join(' | ');
    console.log(`  ${label}: t=${Math.round(g.time)}s units=${g.units.length} over=${g.phase === 'over' || g.endT > 0} won=${g.endWon} ${objs}`);
    check(!err, `${label}: objective text reads (${err || 'ok'})`); void lines;
  } catch (e: any) { check(false, `${label}: ran without throwing (${String(e && e.stack || e).split('\n').slice(0, 3).join(' / ')})`); }
});
// ---- the endings: cheat each job to its last step and check it is won or lost
const run = (g: Game, secs: number) => { for (let k = 0; k < secs / T && g.endT <= 0 && g.phase === 'play'; k++) g.update(T); };
const ended = (g: Game) => { for (let k = 0; k < 120 && g.phase === 'play'; k++) g.update(T); return g.phase === 'over' ? (g.won ? 'won' : 'lost') : 'running'; };
const job = (n: number) => MISSIONS.find(m => m.tag === `Job ${n}`)!;
if (!only.length) {
  { const { g } = host(job(8)); run(g, 2); for (const b of g.buildings.filter(b => b.team === SIDE.out)) g.damage(b, 1e7, null); run(g, 3);
    check(g.ms.erupt === 1 && g.ms.clock! < 90, 'job 8: breaking the last Stone opens the canyon and starts the hold');
    check(g.units.filter(u => u.alive && u.team === SIDE.out && u.order.type === 'raid').length >= 10, 'job 8: the Veyl come for the yard');
    for (const u of g.units) if (u.team === SIDE.out) u.alive = false; run(g, 92); check(ended(g) === 'won', 'job 8: holding the yard for the count wins it'); }
  { const { g } = host(job(8)); run(g, 2); for (const b of g.buildings.filter(b => b.team === SIDE.out)) g.damage(b, 1e7, null); run(g, 2); for (const b of g.ownB('headframe', false, SIDE.home)) g.damage(b, 1e7, null); check(ended(g) === 'lost', 'job 8: losing the Headframe in the hold loses it'); }
  { const { g } = host(job(14)); run(g, 2); const b = g.units.find(u => u.alive && u.pilot === 1)!; check(b && b.kind === 'lancer', 'job 14: the player has one Lancer'); b.pos.set(2, 0, 9); run(g, 40);
    check(ended(g) === 'won' && g.ms.heard === 1, 'job 14: standing at the Headframe plays the warning and wins'); check(g.units.every(u => u.hp > 0), 'job 14: nobody was shot'); }
  { const { g } = host(job(15)); run(g, 2); const c = roadPt(ROAD.len * .52, 34); g.ms.raised = 1; g.ms.hold = 180; const stay = () => { const b = g.units.find(u => u.alive && u.pilot === 1); if (b) { b.pos.x = c[0]; b.pos.z = c[1]; b.hp = b.maxHp; } };
    for (let k = 0; k < 64 / T && g.endT <= 0; k++) { stay(); for (const b of g.buildings) if (b.team === SIDE.out) b.hp = b.maxHp; g.update(T); }
    check(ended(g) === 'lost' && /yard/.test((job(15).fail as any)(g)), 'job 15: staying in the song to the end of the verse loses it, and the end screen says the yard is under the glass'); }
  { const { g } = host(job(20)); run(g, 2); for (const q of g.props.filter(q => q.alive && q.name === 'Drill tower')) g.damageProp(q, 1e7, null); run(g, 1);
    check(!g.props.some(q => q.alive && q.name === 'Drill tower'), 'job 20: the drill tower can be broken'); }
  { const { g } = host(job(23)); run(g, 2); check(g.props.filter(q => q.alive && q.name === 'Deep Charge rig').length === 3, 'job 23: three Deep Charge rigs stand on the Drill Site');
    for (const q of g.props.filter(q => q.alive && q.name === 'Deep Charge rig')) g.damageProp(q, 1e7, null); check(ended(g) === 'won', 'job 23: breaking all three rigs wins'); }
  { const { g } = host(job(24)); run(g, 2); check(STORY.charter === SIDE.home && SIDE.out === 3, 'job 24: Charter Security holds the yard and the player the outpost'); g.ms.clock = .5; check(ended(g) === 'lost', 'job 24: the order landing loses it'); }
  { const { g } = host(job(24)); run(g, 2); const h = (g as any)._first; g.damage(h, 1e7, null); check(ended(g) === 'won', 'job 24: breaking the first Headframe wins'); }
  { const { g } = host(job(19)); run(g, 1); check(g.props.filter(q => q.name === 'Glass wall').length >= 12 && g.props.some(q => q.name === 'First Stone'), 'job 19: First Stone has its walls and the Stone'); }
  { const { g } = host(job(9)); check(g.props.some(q => q.name === 'Broken glass'), 'job 9: The Crack has its split floor'); const c = g.ownB('choir', true, SIDE.out)[0]; check(!!c && c.hp < c.maxHp * .5, 'job 9: the Choir Stone starts cracked'); }
}
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
