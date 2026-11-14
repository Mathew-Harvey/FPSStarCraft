// Ability asks over the wire, checked by the server against each ability's own definition (src/core/ability.ts): every ability of every
// kind is asked for honestly (it goes), from too far, without the energy, during its wait, for somebody else's body, and at a body this
// side cannot see (each refused). Nothing here names an ability: a new one is tested the day it is defined.
// Also: a building action aimed at the ground (a Survey Rig's Scan) goes where the player looked.
// Run with: node tools/run-ts.mjs test/online/abilities.ts
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, SIDE, UNIT, BLD, FACTION, setMap, setSides, Kind, Unit, Building } from '../../src/data';
import { abilitiesOf, type AbilityDef } from '../../src/core/ability';
import { dropped } from '../../src/net-arms';
import { Wire, serverCmd, abAsks } from '../../src/netgame';
import { mem } from '../../src/factions/ironhold/kit';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function match(home: number, out: number) {
  setMap(0); setSides(home, out); const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true);
  g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => true);
  return g;
}
const ME = 1, FOE = 2;
const kinds = (Object.keys(UNIT) as Kind[]).filter(k => abilitiesOf(k).length);
const ready = (u: Unit, a: AbilityDef) => { u.energy = Math.max(u.maxEnergy || 0, a.energy); u.abCd = {}; u.cast = null; u.status = []; u.alive = true; };
const ask = (g: Game, pid: number, unit: Unit | null, u: Unit, a: AbilityDef, x: number, z: number, id = 0) => { const n = abAsks.ok; serverCmd(g, pid, unit, ['ab', u.id, a.key, x, z, id]); return abAsks.ok > n; };
let seenDrop: Record<string, number> = {};
const lastWhy = () => { const d = Object.entries(dropped).filter(([k, v]) => k.startsWith('ab ') && v !== (seenDrop[k] || 0)).map(([k]) => k.slice(3)); seenDrop = { ...dropped }; return d.join('/'); };
const refusals = () => Object.entries(dropped).filter(([k]) => k.startsWith('ab ')).reduce((n, [, v]) => n + v, 0);

let total = 0, went = 0, special: string[] = [], bad: string[] = [], fx: string[] = [];
const refused: Record<string, number> = { far: 0, energy: 0, wait: 0, theirs: 0, unseen: 0, unknown: 0 }, tried: Record<string, number> = { far: 0, energy: 0, wait: 0, theirs: 0, unseen: 0, unknown: 0 };
for (const k of kinds) {
  const f = UNIT[k].team || 0, g = match(0, f === 2 ? 2 : 1), side = f === 0 ? SIDE.home : SIDE.out, foe = side === SIDE.home ? SIDE.out : SIDE.home;
  g.teams[ME] = side; g.teams[FOE] = foe; const wire = new Wire(g);
  // what this side's player was last sent (the server's fog check reads it)
  const look = () => { wire.begin([side]); wire.snap(side); };
  // every research done, so an ability that needs one is not refused for that
  for (const t of [side, foe]) for (const key in g.ups[t]) (g.ups[t] as any)[key] = true;
  // a quiet spot halfway between the two bases
  const hq = g.ownB(undefined, false, SIDE.home)[0], oq = g.ownB(undefined, false, SIDE.out)[0], X = (hq.pos.x + oq.pos.x) / 2, Z = (hq.pos.z + oq.pos.z) / 2;
  for (const a of abilitiesOf(k)) {
    total++;
    const u = g.spawn(k, side, X, Z); u.pilot = 0; ready(u, a);
    const reach = Math.min(a.range >= 9000 ? 30 : a.range, 30), near = Math.max(1, Math.min(reach * .6, 12)), who = a.who ?? 'foe';
    const tgt = a.target === 'body' ? g.spawn(FACTION[who === 'ally' ? side : foe].worker, who === 'ally' ? side : foe, X + near, Z) : null;
    const tx = a.target === 'self' ? X : tgt ? tgt.pos.x : X + reach * .7, tz = tgt ? tgt.pos.z : Z;
    if (tgt && who === 'ally') tgt.hp = tgt.maxHp * .6;   // a hurt friend, for a heal
    look(); lastWhy();
    // honest: it goes, and the game runs on with it (a few seconds, so a wind-up goes off)
    // An ability with a spot rule of its own (a mine only so many at once, a jam only on a machine) is asked for where its bot hook would use it.
    let ok = ask(g, ME, null, u, a, tx, tz, tgt?.id || 0);
    if (!ok && a.can && a.ai) { const t = a.ai(g, u); if (t) ok = ask(g, ME, null, u, a, t.x, t.z, t.id || 0); }
    // ...or with other company: a building or a machine to aim at, or one of ours standing by.
    if (!ok && a.can) {
      const S = who === 'ally' ? side : foe, f2 = UNIT[FACTION[S].worker].team || 0, mach = (Object.keys(UNIT) as Kind[]).find(x => (UNIT[x].team || 0) === f2 && UNIT[x].tags?.includes('machine') && !UNIT[x].air);
      const extra: (Unit | Building)[] = a.target === 'body' ? [g.addBuilding(FACTION[S].builds[0], S, u.pos.x + Math.min(near, 2) + BLD[FACTION[S].builds[0]].hx, u.pos.z, true), ...(mach ? [g.spawn(mach, S, u.pos.x + near, u.pos.z + 1)] : [])] : [g.spawn(FACTION[side].worker, side, u.pos.x + 2, u.pos.z)];
      look(); for (const o of extra) { if (ok) break; ready(u, a); ok = ask(g, ME, null, u, a, o.pos.x, o.pos.z, a.target === 'body' ? o.id : 0); }
      for (const o of extra) o.alive = false;
    }
    // ...or one of this side's own buildings, standing next to it (a Cap to seed, a building to drink from)
    if (!ok && a.can && a.target === 'body' && who !== 'foe') {
      const x0 = u.pos.x, z0 = u.pos.z;
      for (const b of g.buildings) { if (ok) break; if (!b.alive || b.team !== side || !b.built) continue; u.pos.x = b.pos.x + b.hx + 1.5; u.pos.z = b.pos.z; ready(u, a); look(); ok = ask(g, ME, null, u, a, b.pos.x, b.pos.z, b.id); }
      if (!ok) { u.pos.x = x0; u.pos.z = z0; }
    }
    if (ok) { went++; try { for (let i = 0; i < 90; i++) { g.update(1 / 30); g.evq!.length = 0; } } catch (e) { fx.push(`${k}.${a.key}: ${(e as Error).message}`); } }
    else if (a.can) special.push(`${k}.${a.key} (${lastWhy()})`); else bad.push(`${k}.${a.key}`);
    // too far: just past its reach (abilities aimed at the caster itself have none)
    if (a.target !== 'self' && a.range < 9000) { ready(u, a); tried.far++; const d = a.range + 6; if (tgt) { tgt.pos.x = u.pos.x + d; tgt.pos.z = u.pos.z; } look(); if (!ask(g, ME, null, u, a, u.pos.x + d, u.pos.z, tgt?.id || 0)) refused.far++; else bad.push(`${k}.${a.key} from ${d.toFixed(0)} m`); if (tgt) { tgt.pos.x = u.pos.x + near; tgt.pos.z = u.pos.z; } look(); }
    const aimX = tgt ? tgt.pos.x : a.target === 'self' ? u.pos.x : u.pos.x + reach * .5, aimZ = tgt ? tgt.pos.z : u.pos.z;
    // without the energy
    if (a.energy > 0) { ready(u, a); u.energy = a.energy - 1; tried.energy++; if (!ask(g, ME, null, u, a, aimX, aimZ, tgt?.id || 0)) refused.energy++; else bad.push(`${k}.${a.key} with ${u.energy} energy`); }
    // during its wait
    if (a.cd > 0) { ready(u, a); u.abCd = { [a.key]: a.cd }; tried.wait++; if (!ask(g, ME, null, u, a, aimX, aimZ, tgt?.id || 0)) refused.wait++; else bad.push(`${k}.${a.key} during its wait`); }
    // the other side asks for this body
    ready(u, a); tried.theirs++; if (!ask(g, FOE, null, u, a, aimX, aimZ, tgt?.id || 0)) refused.theirs++; else bad.push(`${k}.${a.key} by the other side`);
    // a body this side has not seen: it arrived after the last picture
    if (a.target === 'body') { ready(u, a); const t2 = g.spawn(tgt!.kind, tgt!.team, u.pos.x + near * .8, u.pos.z + 1); tried.unseen++; if (!ask(g, ME, null, u, a, t2.pos.x, t2.pos.z, t2.id)) refused.unseen++; else bad.push(`${k}.${a.key} at a body not yet seen`); t2.alive = false; }
    // an ability this kind does not have
    ready(u, a); tried.unknown++; if (!ask(g, ME, null, u, { ...a, key: 'nosuch' }, aimX, aimZ)) refused.unknown++;
    u.alive = false; if (tgt) tgt.alive = false;
  }
}
check(total >= 20, `${total} abilities on ${kinds.length} kinds, all read from their definitions`);
check(!bad.length, `every honest ask goes through and every bad one is refused${bad.length ? ': ' + bad.join('; ') : ''}`);
check(went + special.length === total, `${went} went at once; ${special.length} have a spot rule of their own and refused the plain test spot (${special.join(', ') || 'none'})`);
check(!special.some(x => /unseen/.test(x)), `no honest ask is refused for not seeing what this side can see${special.filter(x => /unseen/.test(x)).length ? ': ' + special.filter(x => /unseen/.test(x)).join(', ') : ''}`);
check(!fx.length, `the server runs every ability's effect with nobody's screen attached${fx.length ? ': ' + fx.join('; ') : ''}`);
for (const r of Object.keys(tried)) check(refused[r] === tried[r], `refused ${r}: ${refused[r]} of ${tried[r]}`);
check(refusals() > 0 && Object.keys(dropped).some(k => k === 'ab range') && Object.keys(dropped).some(k => k === 'ab unseen'), `refusals are counted by reason (${Object.entries(dropped).filter(([k]) => k.startsWith('ab ')).map(([k, v]) => `${k.slice(3)} ${v}`).join(', ')})`);

// ---------------------------------------------------------------- a told refusal
{
  const g = match(0, 1), H = SIDE.home; g.teams[ME] = H; const k = kinds.find(x => (UNIT[x].team || 0) === 0 && abilitiesOf(x).some(a => a.energy > 0))!, a = abilitiesOf(k).find(x => x.energy > 0)!;
  const u = g.spawn(k, H, 0, 0); ready(u, a); u.energy = 0; g.evq = []; { const w = new Wire(g); w.begin([H]); w.snap(H); } ask(g, ME, null, u, a, u.pos.x + 1, u.pos.z);
  const fd = g.evq!.find(e => e[0] === 'fd' && e[4] === ME);
  check(!!fd && fd[2] === `${a.name}: Needs ${a.energy} energy (has 0).`, `the player is told why, in plain words: "${fd?.[2]}"`);
}

// ---------------------------------------------------------------- a building action aimed at the ground
{
  const g = match(0, 1), H = SIDE.home; g.teams[ME] = H; new Wire(g);
  const rig = g.addBuilding('surveyrig' as any, H, 30, 30, true); mem(rig).energy = 200;
  serverCmd(g, ME, null, ['ba', rig.id, 'scan', -80.5, 120]); const s = mem(rig).scan;
  check(!!s && s.x === -80.5 && s.z === 120 && mem(rig).energy < 200, 'a Survey Rig\'s Scan, asked for online, goes where the player looked');
  mem(rig).scan = null; mem(rig).energy = 200; serverCmd(g, ME, null, ['ba', rig.id, 'scan', 5000, -5000]); const s2 = mem(rig).scan;
  check(!!s2 && s2.x === 900 && s2.z === -900, 'an aim off the map is kept to its edge');
  mem(rig).scan = null; mem(rig).energy = 200; g.teams[FOE] = SIDE.out; serverCmd(g, FOE, null, ['ba', rig.id, 'scan', 0, 0]);
  check(!mem(rig).scan && mem(rig).energy === 200, 'the other side cannot use it');
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ability checks passed'); process.exit(fail.length ? 1 : 0);
