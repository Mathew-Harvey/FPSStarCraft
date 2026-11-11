// Checks for the matchup sweep (Ironhold against the Veyl and against the Gloam): logic bugs and cheese that the
// bot-against-bot runs in tools/sim.ts turned up. Runs in Node with no browser, on the same simulation the match server runs.
// Run with: npm run test:rules
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, SIDE, FACTION, BLD, MAP, setMap, Kind, BKind } from '../src/data';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
/** A fresh match with bots on both sides. `out` is who holds the outpost: 1 the Veyl, 2 the Gloam. */
function match(out: number, map = 0) {
  setMap(map); SIDE.out = out; const g = new Game(noPipe(), noHud, DIFFS[1], map, null, null, true);
  g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = [false, false, false];
  return g;
}
const run = (g: Game, secs: number, each?: () => void) => { for (let i = 0; i < secs * 30 && g.phase !== 'over'; i++) { each?.(); g.update(1 / 30); g.evq!.length = 0; } };
const hq = (g: Game, t: number) => g.ownB(FACTION[t].hq, true, t)[0];

for (const out of [1, 2]) {
  const name = FACTION[out].short;
  // 1. No proxy towers: a new base 45 m from the enemy used to let its tower go right up against the enemy's ore line.
  {
    const g = match(out), h = hq(g, out); g.purse = [5000, 5000, 5000];
    // An Ironhold Headframe staked just past 45 m from the enemy base, finished on the spot.
    const ang = Math.atan2(-h.pos.z, -h.pos.x); let fx = 0, fz = 0;
    for (let r = 46; r < 90; r++) { fx = Math.round(h.pos.x + Math.cos(ang) * r); fz = Math.round(h.pos.z + Math.sin(ang) * r); if (g.canPlace('headframe', fx, fz, false, 0)) break; }
    const proxy = g.addBuilding('headframe', 0, fx, fz, true);
    const closest = (k: BKind, t: number) => { let best = 1e9; for (let dx = -42; dx <= 42; dx += 2) for (let dz = -42; dz <= 42; dz += 2) { const x = proxy.pos.x + dx, z = proxy.pos.z + dz; if (g.canPlace(k, x, z, false, t)) best = Math.min(best, Math.hypot(x - h.pos.x, z - h.pos.z)); } return best; };
    check(closest('watchpost', 0) >= 45, `vs ${name}: a Watchpost by a forward Headframe still has to stand 45 m from the enemy base (closest ${Math.round(closest('watchpost', 0))} m)`);
    // And the same rule for the outpost side's towers near the yard.
    const yard = hq(g, 0), tower = out === 2 ? 'stinger' : 'thornspire', base = g.addBuilding(FACTION[out].hq, out, Math.round(yard.pos.x + 47), Math.round(yard.pos.z - 20), true);
    if (out === 2) { g.carpet.add(base, 'mothercap', base.pos.x, base.pos.z, true); for (const k of ['warren'] as BKind[]) g.addBuilding(k, out, Math.round(base.pos.x + 14), Math.round(base.pos.z + 8), true); }
    else g.addBuilding('broodpit', out, Math.round(base.pos.x + 14), Math.round(base.pos.z + 8), true);
    let near = 1e9; for (let dx = -40; dx <= 40; dx += 2) for (let dz = -40; dz <= 40; dz += 2) { const x = base.pos.x + dx, z = base.pos.z + dz; if (g.canPlace(tower as BKind, x, z, false, out)) for (const b of g.ownB(undefined, false, 0)) near = Math.min(near, Math.hypot(x - b.pos.x, z - b.pos.z)); }
    check(near >= 45, `vs ${name}: the ${BLD[tower as BKind].name} cannot go up within 45 m of an Ironhold building (closest ${Math.round(near)} m)`);
  }
  // 2. Nothing past the edge of the world, where no body can walk up to it.
  {
    const g = match(out, 20), mx = MAP.out[0] / 2, mz = MAP.out[1] / 2, lim = 200 * (MAP.k || 1); g.purse = [5000, 5000, 5000];
    const far = g.addBuilding('headframe', 0, Math.round(mx), Math.round(mz - lim * .93), true);
    let worst = 0; for (let dx = -42; dx <= 42; dx += 2) for (let dz = -42; dz <= 42; dz += 2) { const x = far.pos.x + dx, z = far.pos.z + dz; if (g.canPlace('depot', x, z, false, 0)) worst = Math.max(worst, Math.hypot(x - mx, z - mz) + BLD.depot.hx); }
    check(worst <= lim, `vs ${name}: no Depot can be staked out past the edge of the world (furthest edge ${Math.round(worst)} of ${Math.round(lim)} m)`);
  }
  // 3. Jumping into a worker no longer banks the ore it carries: it has to be walked home.
  {
    const g = match(out), w = g.own(FACTION[out].worker, out)[0], before = g.cash(out); w.carrying = 15; w.pos.set(w.pos.x + 30, 0, w.pos.z); g.possess(w, true);
    check(g.cash(out) === before && w.carrying === 15, `${name}: taking over a worker keeps its pack full instead of banking it from across the map`);
    const home = hq(g, out), mined = g.stats.minedV; w.pos.set(home.pos.x, 0, home.pos.z + home.hz + 1); run(g, .2);
    check(g.stats.minedV >= mined + 15 && w.carrying === 0, `${name}: the pack banks once the body is walked to the ${BLD[FACTION[out].hq].name}`);
  }
  // 4. The ore loan for a broke side only comes when it has no workers at all, the same for every faction.
  {
    const g = match(out), ws = g.own(FACTION[out].worker, out); for (const w of ws.slice(2)) { w.alive = false; } for (const w of ws.slice(0, 2)) w.pilot = 99; g.purse[out] = 0; run(g, 20);
    check(g.cash(out) < 20, `${name}: a side with two workers and no ore gets no free ore (had ${Math.floor(g.cash(out))} after 20 s)`);
    for (const w of g.own(FACTION[out].worker, out)) w.alive = false; g.purse[out] = 0; run(g, 12);
    check(g.cash(out) > 20, `${name}: a side with no workers left still gets the loan for one more`);
  }
  // 5. Linesmen lob grenades into any bunched-up enemy, not only the Veyl.
  {
    const g = match(out), L = g.spawn('linesman', 0, 40, 40), k: Kind = out === 2 ? 'snapper' : 'cantor'; L.order = { type: 'guard', x: 40, z: 40 };
    for (let i = 0; i < 4; i++) { const f = g.spawn(k, out, 54 + (i % 2), 40 + (i >> 1)); f.order = { type: 'guard', x: f.pos.x, z: f.pos.z }; f.pilot = 99; f.hp = f.maxHp = 1e6; }
    let nade = false; run(g, 6, () => { if (g.projs.some(p => p.nade && p.from === L)) nade = true; });
    check(nade, `vs ${name}: a Linesman throws a grenade at a knot of ${k}s`);
  }
  // 6. A push that breaks nothing for a long time ends, so both armies do not stand still for the rest of the match.
  {
    const g = match(out), D = g.dir; g.purse = [0, 0, 0];
    const sq: any[] = []; for (let i = 0; i < 3; i++) { const u = g.spawn('linesman', 0, 10 + i, 30); u.order = { type: 'amove', x: 900, z: 900 }; u.pilot = 0; sq.push(u); }
    D.plan = { phase: 'go', t: 0, target: hq(g, out), book: 0, label: '', goT: g.time }; D.incoming(D, 0);
    check(D.vs.raidLive, `vs ${name}: the defenders see the push coming`);
    run(g, 160, () => { for (const u of sq) if (u.alive) { u.order = u.order.type === 'amove' ? u.order : u.order; } });
    check(!D.plan || D.plan.phase !== 'go', `vs ${name}: a push that broke nothing for 150 s is called off`);
    check(!D.vs.raidLive, `vs ${name}: and the defenders stop waiting for it`);
  }
  // 7. A body trained after the push has left waits at the rally, rather than walking out alone.
  {
    const g = match(out), D = g.dir; D.plan = { phase: 'go', t: 0, target: hq(g, out), book: 0, label: '', goT: g.time };
    const u = g.spawn('linesman', 0, 5, 20); D.enlist(u);
    check(u.order.type === 'guard', `vs ${name}: a late Linesman joins the rally, not a push already on its way`);
  }
  // 8. A worker only runs from a fighter that is fighting.
  {
    const g = match(out), w = g.own('rigger', 0)[0], st = hq(g, 0); w.pos.set(st.pos.x + 12, 0, st.pos.z - 12); w.state = 'idle';
    const f = g.spawn(out === 2 ? 'snapper' : 'cantor', out, w.pos.x + 5, w.pos.z); f.pilot = 99; f.target = null; f.hp = f.maxHp = 1e6;
    let fled = false; run(g, 3, () => { if (w.state === 'flee') fled = true; f.target = null; });
    check(!fled, `vs ${name}: a Rigger does not run from a ${FACTION[out].short} body that is just standing there`);
  }
  // 9. A body for a player who lost theirs: an idle one first, a free worker only when there is nothing to take.
  {
    const g = match(out), n = g.units.length, b = g.freshBody(0);
    check(!!b && g.units.length === n, `${name} match: an Ironhold player who lost a body gets a spare one, not a free new Rigger`);
  }
}

// 10. Gloam fighters scatter from a grenade in the air.
{
  const g = match(2), L = g.spawn('linesman', 0, 40, 40); L.pilot = 99; const sn = g.spawn('snapper', 2, 52, 40); sn.order = { type: 'guard', x: 52, z: 40 };
  const x0 = sn.pos.x; g.shoot(new (L.pos.constructor as any)(51, 1.5, 40), new (L.pos.constructor as any)(0, 3, 0), 0, 60, true, L); run(g, .4);
  check(Math.hypot(sn.pos.x - 51, sn.pos.z - 40) > Math.abs(x0 - 51) + 1, 'a Snapper scatters from a grenade landing beside it');
}

// 11. Both pairings, bots on both sides, play out to a result without the stalemates the sweep found.
for (const [out, map] of [[1, 2], [2, 20]]) {
  const g = match(out, map); let bad = '';
  for (let i = 0; i < 40 * 60 * 30 && g.phase !== 'over'; i++) { g.update(1 / 30); g.evq!.length = 0; if (g.cash(0) < -1 || g.cash(out) < -1) bad = 'negative ore'; }
  check(!bad, `Ironhold vs ${FACTION[out].short} on map ${map}: no negative ore`);
  check(g.phase === 'over', `Ironhold vs ${FACTION[out].short} on map ${map}: the bots finish the match inside 40 minutes (ended at ${Math.round(g.time)} s)`);
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASS'); process.exit(fail.length ? 1 : 0);
