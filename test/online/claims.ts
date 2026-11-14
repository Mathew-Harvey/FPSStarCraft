// Online checks that run in Node with no server and no browser, on the same simulation the match server runs:
// damage claims are checked per attack (reach, how hard, how often, line of sight), and fog on the wire sends each side only what it sees.
// Run with: node tools/run-ts.mjs test/online/claims.ts
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, SIDE, UNIT, setMap, setSides, Kind, Unit } from '../../src/data';
import { ARMS, SLACK, checkClaim, dropped } from '../../src/net-arms';
import { Wire, serverCmd } from '../../src/netgame';
import { SIGHT } from '../../src/fog';
import { EYE_FAR } from '../../src/net-fog';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function match(home = 0, out = 1) {
  setMap(0); setSides(home, out); const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true);
  g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => true);
  return g;
}
/** A clear strip of ground `len` metres long, running north (+z), away from both bases and any scenery. */
function openGround(g: Game, len: number): [number, number] {
  const segD = (px: number, pz: number, x: number, z: number) => { const t = Math.max(0, Math.min(len, pz - z)); return Math.hypot(px - x, pz - (z + t)); };
  for (let r = 0; r < 20000; r++) { const x = -220 + Math.random() * 440, z = -220 + Math.random() * 440;
    if (Math.hypot(x, z) < 50 || Math.hypot(x - SIDE_OUT[0], z - SIDE_OUT[1]) < 60) continue;
    if (g.props.some(p => p.alive && segD(p.x, p.z, x, z) < p.r + 3)) continue; return [x, z]; }
  throw new Error('no clear strip of ground on this map');
}
let SIDE_OUT = [124, 13];
const step = (g: Game, s: number) => { for (let i = 0; i < s * 30; i++) { g.update(1 / 30); g.evq!.length = 0; } };
const still = (u: Unit) => { u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; u.target = null; u.pilot = 99; u.moving = false; };

// ---------------------------------------------------------------- 1. claims per attack
{
  const g = match(), H = SIDE.home, O = SIDE.out; SIDE_OUT = [g.ownB(undefined, false, O)[0].pos.x, g.ownB(undefined, false, O)[0].pos.z];
  // the table covers every kind a player can drive
  const missing = (Object.keys(UNIT) as Kind[]).filter(k => !ARMS[k]); check(!missing.length, `every kind has its attacks listed for the server${missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''}`);
  // Every attack in the table, at the edge of its reach and at full strength, gets through: the table is never stricter than the game.
  let honest = 0, refused: string[] = [];
  const [ox, oz] = openGround(g, 64);
  for (const kind of Object.keys(ARMS) as Kind[]) for (const m of ARMS[kind]) {
    const by = g.spawn(kind, UNIT[kind].team || 0, ox, oz), foeT = by.team === 0 ? 1 : 0, tk: Kind = foeT === H ? 'breacher' : 'warden', t = g.spawn(tk, foeT, ox, oz + Math.min(m.range, 60) - .5 + UNIT[tk].rad); still(by); still(t);
    for (let i = 0; i < (m.every >= 1.5 ? 1 : 2) * m.one; i++) { t.hp = t.maxHp = 99999; t.shield = 0; const ok = checkClaim(g, by, t, m.hit * g.gunMul(by.team)) > 0; ok ? honest++ : refused.push(`${kind} ${m.name}`); }
    by.alive = t.alive = false; g.units = g.units.filter(u => u.alive);
  }
  check(!refused.length, `every listed attack lands at the edge of its reach, twice in a row (${honest} honest hits${refused.length ? '; refused: ' + [...new Set(refused)].join(', ') : ''})`);

  // a Linesman 20 m from a Warden
  const ln = g.spawn('linesman', H, ox, oz), w = g.spawn('warden', O, ox, oz + 20); still(ln); still(w); w.hp = w.maxHp = 99999;
  check(checkClaim(g, ln, w, 15) === 15, 'a rifle headshot at 20 m stands');
  check(checkClaim(g, ln, w, 400) === 0 && dropped['too hard'] > 0, 'a rifle hit for 400 is dropped as too hard');
  // The most a Linesman can really put on one body at once is a burst of rifle fire (6 x 15) and one grenade (75), with research on top.
  let n = 0; for (let i = 0; i < 40; i++) n += checkClaim(g, ln, w, 15);
  check(n <= 260, `forty rifle hits in the same instant: only a burst's worth stands (${n} of 600)`);
  step(g, 1); let m2 = 0; for (let i = 0; i < 40; i++) m2 += checkClaim(g, ln, w, 15);
  check(m2 >= 90 && m2 <= 200, `a second later the rifle has its rate back, about eight hits a second (${m2})`);
  // reach
  const rg = g.spawn('rigger', H, ox + 5, oz); still(rg); const near = g.spawn('cantor', O, ox + 7, oz); still(near); near.hp = near.maxHp = 99999;
  check(checkClaim(g, rg, near, 10) === 10, 'a drill hit at arm\'s length stands');
  near.pos.set(ox + 45, 0, oz); check(checkClaim(g, rg, near, 10) === 0, 'a drill hit on a body 40 m away is dropped');
  // the old cap let any body deal 450 a second from 175 m away
  check(checkClaim(g, rg, w, 400) === 0, 'a Rigger cannot claim 400 on a Warden from across the field');

  // line of sight: a big rock between a Longshot and its target
  const rock = g.props.filter(p => p.alive && p.solid && p.kind === 'rock' && p.h > 3 && p.r > 1.8 && p.r < 10 && Math.hypot(p.x, p.z) > 30).sort((a, b) => b.r - a.r)[0];
  if (rock) {
    const ls = g.spawn('longshot', H, rock.x - rock.r - 8, rock.z), tgt = g.spawn('warden', O, rock.x + rock.r + 8, rock.z); still(ls); still(tgt); tgt.hp = tgt.maxHp = 99999;
    const before = dropped['no line of sight'] || 0; const got = checkClaim(g, ls, tgt, 58);
    check(got === 0 && (dropped['no line of sight'] || 0) > before, `a Long Rifle hit through a ${rock.name} is dropped (no line of sight)`);
    ls.pos.set(rock.x, 0, rock.z - rock.r - 20); tgt.pos.set(rock.x + 8, 0, rock.z - rock.r - 20); step(g, 2);
    check(checkClaim(g, ls, tgt, 58) === 58, 'the same hit with nothing in the way stands');
  } else check(false, 'found a big rock to test line of sight');
}

// ---------------------------------------------------------------- 2. fog on the wire, in process
{
  const g = match(), H = SIDE.home, O = SIDE.out, wire = new Wire(g);
  g.teams = { 1: H, 2: O };
  const hq = g.ownB(undefined, false, O)[0];
  step(g, 5); wire.begin([H, O]); const sH = wire.snap(H), sO = wire.snap(O), all = wire.snap(null);
  const foeUnits = (s: any, t: number) => s.u.filter((r: any) => r[2] !== t), foeB = (s: any, t: number) => s.b.filter((r: any) => r[2] !== t);
  check(all.u.some((r: any) => r[2] === O) && all.b.some((r: any) => r[2] === O), 'the whole world has both sides in it');
  check(!foeUnits(sH, H).length && !foeB(sH, H).length, `at the start Ironhold is sent no Veyl body or building (${foeUnits(sH, H).length} bodies, ${foeB(sH, H).length} buildings)`);
  check(!foeUnits(sO, O).length && !foeB(sO, O).length, 'and the Veyl are sent nothing of Ironhold');
  check(sH.ore !== undefined && sH.vo === undefined && sH.d && !sH.v, 'Ironhold gets its own ore and plan, and not the Veyl purse or plan');
  check(sO.vo !== undefined && sO.ore === undefined && !sO.d, 'the Veyl get their own purse, and not Ironhold\'s ore or plan');
  check(sH.o.some((a: any) => a === null) && sH.o.some((a: any) => typeof a === 'number'), 'ore counts are sent only for fields in sight');
  // a scout walks up to the Veyl base, looks, and walks away again
  const sc = g.spawn('linesman', H, hq.pos.x - 30, hq.pos.z); still(sc); sc.yaw = Math.atan2(hq.pos.x - sc.pos.x, hq.pos.z - sc.pos.z); sc.hp = sc.maxHp = 99999;
  step(g, .2); wire.begin([H, O]); const s2 = wire.snap(H); wire.snap(O);
  const seenB = foeB(s2, H), live = seenB.filter((r: any) => !r[13]);
  check(live.length > 0, `a scout at the Veyl base is sent the buildings it can see (${live.length})`);
  // every enemy body sent is near one of Ironhold's eyes, or along a driver's look
  const eyes = [...g.units.filter(u => u.alive && u.team === H).map(u => [u.pos.x, u.pos.z, (SIGHT[u.kind] || 30) + 6 + (u.pilot ? EYE_FAR : 0)]), ...g.buildings.filter(b => b.alive && b.team === H).map(b => [b.pos.x, b.pos.z, (SIGHT[b.kind] || 26) + 6])];
  const stray = foeUnits(s2, H).filter((r: any) => !eyes.some(e => Math.hypot(e[0] - r[3], e[1] - r[4]) <= e[2]));
  check(foeUnits(s2, H).length > 0 && !stray.length, `every Veyl body sent is inside Ironhold's sight (${foeUnits(s2, H).length} sent, ${stray.length} outside)`);
  sc.pos.set(0, 0, 0); step(g, 1); wire.begin([H, O]); const s3 = wire.snap(H);
  const ghosts = foeB(s3, H);
  check(ghosts.length >= live.length && ghosts.every((r: any) => r[13] === 1), `walked home, the scout's side keeps the buildings it saw, marked as last seen (${ghosts.length})`);
  check(!foeUnits(s3, H).length, 'and is sent no Veyl body once none is in sight');
  // a claim on a body this side was not sent is dropped
  const far = g.units.find(u => u.alive && u.team === O)!; const hp0 = far.hp + far.shield, me = g.spawn('linesman', H, 0, 4); still(me); g.teams[1] = H;
  wire.begin([H, O]); wire.snap(H); serverCmd(g, 1, me, ['dm', far.id, 15, 0]);
  check(far.hp + far.shield === hp0 && dropped.unseen > 0, 'a hit claimed on a body the side cannot see is dropped');
  // a death far away is not told to the side that could not see it
  g.evq!.push(['ku', far.id, 0]); wire.begin([H, O]); const s4 = wire.snap(H), s5 = wire.snap(O);
  check(!s4.e.some((e: any) => e[0] === 'ku' && e[1] === far.id) && s5.e.some((e: any) => e[0] === 'ku' && e[1] === far.id), 'a death is told to the side that saw the body, not the side that did not');
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall online claim and fog checks passed'); process.exit(fail.length ? 1 : 0);
