// Every story job, run headless for a few minutes with bots on both sides: the job's setup, script and objectives must run without
// throwing, and its objective lines must read as text. Then a few jobs are driven to their end by cheating the state, to check the
// win and lose paths. Run: node tools/run-ts.mjs test/story.ts [minutes] [job numbers...]
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { BLD, DIFFS, FACTION, ROAD, SIDE, STORY, TRAINS, UNIT, fac, roadPt, setMap, setSides, setTeamGame } from '../src/data';
import type { BKind, Kind } from '../src/data';
import { fieldsOn } from '../src/factions/veyl/fields';
import { MISSIONS, missionSides, charterTeam, Mission } from '../src/campaign';

initHeadless();
const mins = +(process.argv[2] || 3), only = process.argv.slice(3).map(Number);
let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const fails: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fails.push(what); };

function host(m: Mission) {
  setMap(m.map); setSides(...missionSides(m)); if (m.team) setTeamGame(m.team); STORY.charter = charterTeam(m);
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
const job = (name: string) => MISSIONS.find(m => m.name === name)!;
if (!only.length) {
  { const { g } = host(job('Ore Else')); run(g, 2); for (const b of g.buildings.filter(b => b.team === SIDE.out)) g.damage(b, 1e7, null); run(g, 3);
    check(g.ms.erupt === 1 && g.ms.clock! < 90, 'Ore Else: breaking the last Stone opens the canyon and starts the hold');
    check(g.units.filter(u => u.alive && u.team === SIDE.out && u.order.type === 'raid').length >= 10, 'Ore Else: the Veyl come for the yard');
    for (const u of g.units) if (u.team === SIDE.out) u.alive = false; g.ms._o0 = 1; /* the Claim Barge, fielded earlier */ run(g, 92); check(ended(g) === 'won', 'Ore Else: holding the yard for the count wins it'); }
  { const { g } = host(job('Ore Else')); run(g, 2); for (const b of g.buildings.filter(b => b.team === SIDE.out)) g.damage(b, 1e7, null); run(g, 2); for (const b of g.ownB('headframe', false, SIDE.home)) g.damage(b, 1e7, null); check(ended(g) === 'lost', 'Ore Else: losing the Headframe in the hold loses it'); }
  { const { g } = host(job('Open Hands')); run(g, 2); const b = g.units.find(u => u.alive && u.pilot === 1)!; check(b && b.kind === 'lancer', 'Open Hands: the player has one Lancer'); b.pos.set(2, 0, 9); run(g, 40);
    check(ended(g) === 'won' && g.ms.heard === 1, 'Open Hands: standing at the Headframe plays the warning and wins'); check(g.units.every(u => u.hp > 0), 'Open Hands: nobody was shot'); }
  { const { g } = host(job('The Last Verse')); run(g, 2); const c = roadPt(ROAD.len * .52, 34); g.ms.raised = 1; g.ms.hold = 180; const stay = () => { const b = g.units.find(u => u.alive && u.pilot === 1); if (b) { b.pos.x = c[0]; b.pos.z = c[1]; b.hp = b.maxHp; } };
    for (let k = 0; k < 64 / T && g.endT <= 0; k++) { stay(); for (const b of g.buildings) if (b.team === SIDE.out) b.hp = b.maxHp; g.update(T); }
    check(ended(g) === 'lost' && /yard/.test((job('The Last Verse').fail as any)(g)), 'The Last Verse: staying in the song to the end of the verse loses it, and the end screen says the yard is under the glass'); }
  { const { g } = host(job('Spore Season')); run(g, 2); for (const q of g.props.filter(q => q.alive && q.name === 'Drill tower')) g.damageProp(q, 1e7, null); run(g, 1);
    check(!g.props.some(q => q.alive && q.name === 'Drill tower'), 'Spore Season: the drill tower can be broken'); }
  { const { g } = host(job('Rig Breakers')); run(g, 2); check(g.props.filter(q => q.alive && q.name === 'Deep Charge rig').length === 3, 'Rig Breakers: three Deep Charge rigs stand on the Drill Site');
    for (const q of g.props.filter(q => q.alive && q.name === 'Deep Charge rig')) g.damageProp(q, 1e7, null); check(ended(g) === 'won', 'Rig Breakers: breaking all three rigs wins'); }
  { const { g } = host(job('Fourteen Twenty')); run(g, 2); check(STORY.charter === SIDE.home && SIDE.out === 3, 'Fourteen Twenty: Charter Security holds the yard and the player the outpost'); g.ms.clock = .5; check(ended(g) === 'lost', 'Fourteen Twenty: the order landing loses it'); }
  { const { g } = host(job('Fourteen Twenty')); run(g, 2); const h = (g as any)._first; g.damage(h, 1e7, null); check(ended(g) === 'won', 'Fourteen Twenty: breaking the first Headframe wins'); }
  { const { g } = host(job('What It Remembers')); run(g, 1); check(g.props.filter(q => q.name === 'Glass wall').length >= 12 && g.props.some(q => q.name === 'First Stone'), 'What It Remembers: First Stone has its walls and the Stone'); }
  { const { g } = host(job('Wrong Body')); check(g.props.some(q => q.name === 'Broken glass'), 'Wrong Body: The Crack has its split floor'); const c = g.ownB('choir', true, SIDE.out)[0]; check(!!c && c.hp < c.maxHp * .5, 'Wrong Body: the Choir Stone starts cracked'); }
}
// ---- song fields: a story Veyl player runs the field rules, the story bot side does not (the classic outpost has no fields)
{ const { g, mine } = host(job('Brood')); check(fieldsOn(g, mine), 'Brood: the story Veyl player gets song fields');
  const { g: g2 } = host(job('Payroll')); check(fac(SIDE.out) === 1 && !fieldsOn(g2, SIDE.out), 'Payroll: the Veyl outpost a story job raids from gets no song fields'); }
// ---- every kind the three factions can train or build shows up on at least one job's paperwork, on that faction's own arc
{ const units = new Set(MISSIONS.flatMap(m => m.units)), blds = new Set(MISSIONS.flatMap(m => m.allow));
  const trainable = new Set(Object.values(TRAINS).flat() as Kind[]), builds = new Set([0, 1, 2].flatMap(f => FACTION[f].builds) as BKind[]);
  const noU = [...trainable].filter(k => !units.has(k) && !UNIT[k].worker && k !== 'rigger' && k !== 'tender' && k !== 'grazer'), noB = [...builds].filter(k => !blds.has(k) && ![0, 1, 2].some(f => FACTION[f].hq === k));   // workers and home buildings are on every job
  check(!noU.length, `every trainable kind is on some job (${noU.join(', ') || 'all'})`); check(!noB.length, `every building is on some job (${noB.join(', ') || 'all'})`); }
// ---- the field guide: a new kind on the player's side gets one line that says what it does and which keys work it
{ const { g, mine } = host(job('Old Friends')); const lines: string[] = []; const feed = g.feed.bind(g); (g as any).feed = (w: string, t: string, ...r: any[]) => { if (w === 'Field guide') lines.push(t); return (feed as any)(w, t, ...r); };
  run(g, 2); const [x, z] = [g.ownB('choir', true, mine)[0].pos.x, g.ownB('choir', true, mine)[0].pos.z]; g.spawn('tuner', mine, x + 4, z + 4); run(g, 2);
  check(lines.some(l => /^Tuner: .*R Glass Wall/.test(l)), `Old Friends: the field guide names the Tuner's keys (${lines.find(l => l.startsWith('Tuner')) || 'none'})`); g.spawn('tuner', mine, x + 5, z + 4); run(g, 2);
  check(lines.filter(l => l.startsWith('Tuner')).length === 1, 'Old Friends: the field guide says it once'); void UNIT; void BLD; }
// ---- team jobs: the plan puts a bot ally beside the player, and the Charter across the map
for (const name of ['Common Ground', 'Three Voices']) { const m = job(name); const { g, mine } = host(m); run(g, 2);
  const allies = [...new Set(g.buildings.filter(b => b.alive && b.team !== mine && b.team !== SIDE.out).map(b => b.team))];
  check(mine === 0 && allies.length === (name === 'Three Voices' ? 2 : 1) && g.buildings.some(b => b.alive && b.team === SIDE.out) && STORY.charter === SIDE.out, `${name}: the player at the yard, ${allies.length} bot ${allies.length > 1 ? 'allies' : 'ally'}, Charter Security across the map`);
  check(!g.human[allies[0]], `${name}: the ally is a bot`); }
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
