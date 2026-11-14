import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, setMap, setSides, MAP, BLD, homeXZ } from '../src/data';
import * as T from '../src/terrain';
initHeadless();
const m = +(process.argv[2] || 0); let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
setMap(m); const [H, O] = setSides(0, 0); const g = new Game(noPipe(), noHud, DIFFS[1], m, null, null, true);
g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => false);
while (g.time < 200) { g.update(1 / 30); g.evq!.length = 0; }
for (const t of [H, O]) { const [hx, hz] = homeXZ(t);
  for (const v of g.vents) { const d = Math.hypot(v.pos.x - hx, v.pos.z - hz); if (d > 45) continue; const st = BLD.pumpjack, x = v.pos.x, z = v.pos.z;
    const why: string[] = []; const [mx, mz] = MAP.mid!; if (Math.hypot(x - mx, z - mz) + Math.max(st.hx, st.hz) > MAP.rad! * .99) why.push('edge');
    if (!g.buildings.some(b => b.alive && b.team === t && b.built && g.isHQ(b) && Math.hypot(b.pos.x - x, b.pos.z - z) < 42)) why.push('noHQ');
    for (const b of g.buildings) if (b.alive && Math.abs(x - b.pos.x) < st.hx + b.hx + 1.6 && Math.abs(z - b.pos.z) < st.hz + b.hz + 1.6) why.push('bld:' + b.kind + (b.team === t ? '' : '(foe)'));
    for (const o of g.ores) if (o.amount > 0 && Math.abs(x - o.pos.x) < st.hx + 2.4 && Math.abs(z - o.pos.z) < st.hz + 2.4) { why.push('ore'); break; }
    if (!T.flat(x, z, st.hx + .6, st.hz + .6, true)) why.push('notflat');
    g.placeWhy = ''; const ok = g.canPlace('pumpjack', x, z, false, t); console.log(t === H ? 'yard' : 'far', 'vent', Math.round(d), 'at', Math.round(x), Math.round(z), 'canPlace', ok, why.join(' '), g.placeWhy, 'spires', (g as any).spires?.length); } }
for (const v of g.vents) { const near = g.spires.filter(s => Math.hypot(s.x - v.pos.x, s.z - v.pos.z) < 6); if (near.length) console.log('vent', Math.round(v.pos.x), Math.round(v.pos.z), 'props', near.map(s => `${(s as any).kind || (s as any).type || '?'} r${s.r.toFixed(1)} at ${Math.round(s.x)},${Math.round(s.z)}`).join('; ')); }
