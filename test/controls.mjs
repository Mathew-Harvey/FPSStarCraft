// The RTS controls in the command view, in one headless browser: control groups, the idle worker and whole army keys, the command card
// (keys, clicks, greyed buttons and why), production queues and cancelling, rally points to a spot, a seam and a body, orders lined up
// with Shift and their waypoints, patrol and stop, staking a building out from above, and the HUD's Flux, supply and worker counts.
// Run with: npm run build && node test/controls.mjs   (SHOTS=dir saves pictures)
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const page = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.html')).href, SHOTS = process.env.SHOTS || '';
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'] });
try {
  const shotIn = async (p, n) => { if (SHOTS) { await p.evaluate(() => { for (const d of document.querySelectorAll('#feed div')) d.style.animation = 'none'; }); await p.screenshot({ path: `${SHOTS}/${n}.jpg`, type: 'jpeg', quality: 88 }); } };
  // Software drawing in a headless browser grows its memory with every frame drawn, so the test runs in two fresh pages.
  const open = async () => {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(300000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  await p.evaluate(() => {
    __ore.setFree(true); __ore.pickMap(0); document.querySelectorAll('#diff button')[0].click(); __ore.start(); __ore.hold(true);
    const g = __ore.game; g.introT = 0; g.hourFix = 13; g.wxFix = 'clear'; g.truce = true; g.dir.raidIn = 9999; g.dir.auto = false; g.ore = 2000;
    for (const k of ['linesman', 'breacher', 'longshot', 'rigger', 'patch', 'gantry']) g.seenKinds.add(k);
    for (let i = 0; i < 6; i++) g.spawn('linesman', 0, -6 + i * 2.2, 14 + (i % 2) * 2);
    // Only the test moves time: the page's own frame loop still calls update while held, which made runs depend on how slow the machine was.
    const real = g.update.bind(g); let stepping = false; g.update = dt => { if (stepping) real(dt); };
    window.step = n => { const g = __ore.game; stepping = true; for (let i = 0; i < n; i++) { if (g.phase === 'card') g.phase = 'play'; g.noRender = i < n - 1; g.update(1 / 30); } g.noRender = false; stepping = false; };
    window.aim = (x, z, y = 1) => { const C = __ore.game.cmd, s = [0, 0]; C.screen(x, y, z, s); C.cx = s[0]; C.cy = s[1]; };
    window.click = (btn = 0) => { const g = __ore.game; g.pressed.add('Mouse' + btn); if (!btn) g.lmb = true; step(1); if (!btn) { g.lmb = false; step(1); } };
    window.key = (k, mods = []) => { const g = __ore.game; for (const m of mods) g.keys.add(m); g.pressed.add(k); step(1); for (const m of mods) g.keys.delete(m); };
    window.look = (x, z) => { const C = __ore.game.cmd; C.focus.set(x, 0, z); step(2); };
    window.pickAll = list => { const C = __ore.game.cmd; C.sel.clear(); C.selB = null; C.menu = ''; C.aim = null; for (const u of list) C.sel.add(u); step(1); };
    step(20); key('KeyN'); step(30);
  });

    return p;
  };
  let p = await open();
  const shot = n => shotIn(p, n);
  // ---- control groups
  let r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, ls = g.own('linesman'); pickAll(ls.slice(0, 3)); key('Digit1', ['ControlLeft']); pickAll(ls.slice(3, 5)); key('Digit2', ['ControlLeft']); C.sel.clear(); step(1);
    key('Digit1'); const one = [...C.sel].map(u => u.id).sort().join(); pickAll([ls[5]]); key('Digit1', ['ShiftLeft']); C.sel.clear(); key('Digit1'); const added = C.sel.size; key('Digit2'); const two = C.sel.size;
    C.focus.set(80, 0, 80); step(1); key('Digit2'); step(1); key('Digit2'); const f = Math.hypot(C.focus.x - ls[3].pos.x, C.focus.z - ls[3].pos.z);
    return { one: one === ls.slice(0, 3).map(u => u.id).sort().join(), added, two, f }; });
  check(r.one, 'Ctrl and a number keeps the picked bodies as a group, and the number picks them again');
  check(r.added === 4, `Shift and a number adds the picked body to the group (${r.added})`);
  check(r.two === 2, 'a second group holds its own bodies');
  check(r.f < 6, `the number pressed twice quickly moves the view to the group (${r.f.toFixed(1)} m off)`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd; C.sel.clear(); key('F2'); const army = [...C.sel], all = army.every(u => u.kind !== 'rigger'); const n = g.units.filter(u => u.alive && u.team === 0 && u.kind !== 'rigger').length;
    const w = g.own('rigger').find(u => u !== g.me); w.node = null; w.pref = null; w.site = null; w.state = 'walk'; w.windX = w.pos.x; w.windZ = w.pos.z; step(10); key('F1'); return { army: army.length, n, all, idle: C.sel.size === 1 && C.sel.has(w), w: w.state, look: Math.hypot(C.focus.x - w.pos.x, C.focus.z - w.pos.z) }; });
  check(r.all && r.army === r.n, `F2 picks every fighter on the side (${r.army} of ${r.n})`);
  check(r.idle && r.look < 1, `F1 picks the idle worker and looks at it (${r.w})`);

  // ---- the card for bodies
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, ls = g.own('linesman'); pickAll(ls.slice(0, 3)); const ids = C.card.map(b => b.id), keys = C.card.map(b => b.key), dom = [...document.querySelectorAll('#ccard .cb')].map(e => e.textContent);
    return { ids, keys, dom, shown: !document.getElementById('ccard').hidden }; });
  check(r.shown && ['move', 'stop', 'patrol', 'release', 'jump'].every(i => r.ids.includes(i)), `fighters picked: the card shows Move, Stop, Patrol, Back to squad and Jump in (${r.ids})`);
  check(new Set(r.keys).size === r.keys.length && !r.keys.some(k => /Key[WASDMN]|Digit/.test(k)), `every button has its own key, and none of them pans or lifts the view (${r.keys.map(k => k.replace('Key', ''))})`);
  check(r.dom.length === r.ids.length && /Q/.test(r.dom[0]), 'the HUD draws each button with its key on it');
  await shot('card-fighters');

  // ---- Shift: orders lined up, and their waypoints
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, ls = g.own('linesman').slice(0, 3); pickAll(ls); look(20, 30); aim(14, 30, 0); click(2); aim(26, 40, 0); key('Mouse2', ['ShiftLeft']); aim(8, 46, 0); key('Mouse2', ['ShiftLeft']); step(1);
    window.qtrace = ls.map(u => [Math.round(u.pos.x), Math.round(u.pos.z), u.order.x.toFixed(0), u.order.z.toFixed(0), C.cur.get(u)?.k]).join(' '); const q = ls.map(u => (C.queue.get(u) || []).length), first = ls.every(u => Math.hypot(u.order.x - 14, u.order.z - 30) < 5), lines = C['lines'] && C['lines'].visible ? C['lines'].geometry.drawRange.count : 0; return { q, first, lines }; });
  check(r.q.every(n => n === 2) && r.first, `Shift and a right click lines up orders: they go to the first spot with two more waiting (${r.q})`);
  check(r.lines >= 18, `the lined-up orders are drawn on the ground as waypoints (${r.lines} line ends)`);
  await shot('shift-queue');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, ls = g.own('linesman').slice(0, 3); const seen = []; for (let i = 0; i < 60 && ls.some(u => C.cur.has(u)); i++) { step(30); const o = ls[0].order; const k = Math.round(o.x) + ',' + Math.round(o.z); if (seen[seen.length - 1] !== k) seen.push(k); }
    return { seen, end: ls.map(u => Math.hypot(u.pos.x - 8, u.pos.z - 46)), left: ls.map(u => (C.queue.get(u) || []).length), start: window.qtrace }; });
  check(r.seen.length >= 3 && Math.max(...r.end) < 8 && r.left.every(n => !n), `they walk the spots in order and stop at the last one (${r.seen.join(' then ')}; started ${r.start})`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, ls = g.own('linesman').slice(0, 2); pickAll(ls); const at = ls.map(u => [u.pos.x, u.pos.z]); key('KeyP'); const lit = C.aim && C.aim.k === 'patrol'; look(30, 46); aim(30, 46, 0); click(0);
    let there = false, back = false; for (let i = 0; i < 40; i++) { step(30); const d = Math.hypot(ls[0].pos.x - 30, ls[0].pos.z - 46); if (d < 7) there = true; if (there && Math.hypot(ls[0].pos.x - at[0][0], ls[0].pos.z - at[0][1]) < 8) { back = true; break; } }
    key('KeyH'); const stopped = ls.every(u => !C.cur.has(u) && Math.hypot(u.order.x - u.pos.x, u.order.z - u.pos.z) < 3); return { lit, there, back, stopped }; });
  check(r.lit, 'P lights the Patrol button and waits for a spot');
  check(r.there && r.back, 'a patrol walks to the spot and back again');
  check(r.stopped, 'H stops them where they stand');

  await p.close(); p = await open();
  // ---- a building: the card, the queue, cancelling, rally points
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, bh = g.addBuilding('bunkhouse', 0, 16, 16, true); for (const x of [-34, -42, -50]) g.addBuilding('depot', 0, x, 24, true); g.ore = 2000; look(16, 16); aim(16, 16, 0); click(0); step(1);
    const ids = C.card.map(b => b.id), off = Object.fromEntries(C.card.map(b => [b.id, b.off])); for (let i = 0; i < 6; i++) key('KeyE'); const q = bh.queue.length, full = C.card.find(b => b.id === 'tr:linesman').off;
    const slots = document.querySelectorAll('#cpan .qs:not(.none)').length, before = g.ore; key('Backspace'); const after = g.ore, q2 = bh.queue.length;
    return { sel: C.selB === bh, ids, off, q, full, slots, refund: after - before, q2 }; });
  check(r.sel && r.ids.includes('tr:linesman') && r.ids.includes('tr:breacher') && r.ids.includes('rally'), `a Bunkhouse picked: the card shows what it trains and a rally point (${r.ids})`);
  check(/Machine Shop/.test(r.off['tr:breacher']), `a unit that needs another building is greyed and says which ("${r.off['tr:breacher']}")`);
  check(r.q === 5 && /Queue full/.test(r.full), `the queue holds five, and the sixth press says the queue is full (${r.q}, "${r.full}")`);
  check(r.slots === 5, `the five queued bodies show in the panel (${r.slots})`);
  check(r.refund === 60 && r.q2 === 4, `Backspace takes the last one off and pays its ore back (${r.refund} ore)`);
  await shot('card-building');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, bh = C.selB; const q0 = bh.queue.length, before = g.ore, el = document.querySelector('#cpan .qs[data-cb="q:1"]'), rc = el.getBoundingClientRect(), R = document.getElementById('hud').getBoundingClientRect(), s = g.hud.scale;
    C.cx = (rc.left + rc.width / 2 - R.left) / s; C.cy = (rc.top + rc.height / 2 - R.top) / s; click(0); return { refund: g.ore - before, q: q0 - bh.queue.length }; });
  check(r.refund === 60 && r.q === 1, `a click on a queued body in the panel cancels that one (${r.refund} ore back)`);
  {
    r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, bh = C.selB; g.ore = 0; step(1); const poor = C.card.find(b => b.id === 'tr:linesman').off; const el = document.querySelector('#ccard .cb[data-cb="tr:linesman"]'); return { poor, grey: el && el.classList.contains('off'), txt: el && el.textContent }; });
    check(/60 ore/.test(r.poor) && r.grey && /60 ore/.test(r.txt), `with no ore the button is greyed and says what it costs ("${r.poor}")`);
  }
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, bh = C.selB; g.ore = 2000; bh.queue.length = 0; look(30, 4); aim(30, 4, 0); click(2); const set = C.rally.get(bh); const u = g.spawn('linesman', 0, bh.pos.x + 1, bh.pos.z + bh.hz + 1.2); step(2); const o = u.order; step(200); return { set: !!set, mine: o.mine, d: Math.hypot(u.pos.x - 30, u.pos.z - 4), lines: C['lines'].visible }; });
  check(r.set && r.mine, 'a right click with a building picked sets its rally point, and a new body from it is sent there');
  check(r.d < 6, `the new body walks to the rally point (${r.d.toFixed(1)} m off)`);
  check(r.lines, 'the rally point is drawn from the building to the spot');
  await shot('rally');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, hf = g.ownB('headframe')[0], seam = g.ores.filter(o => o.amount > 0).sort((a, b) => Math.hypot(a.pos.x - hf.pos.x, a.pos.z - hf.pos.z) - Math.hypot(b.pos.x - hf.pos.x, b.pos.z - hf.pos.z))[3]; look(hf.pos.x, hf.pos.z); C.sel.clear(); C.selB = hf; step(1);
    key('KeyL'); look(seam.pos.x, seam.pos.z); aim(seam.pos.x, seam.pos.z, 0); click(0); const r0 = C.rally.get(hf); const w = g.spawn('rigger', 0, hf.pos.x, hf.pos.z + hf.hz + 1.2); step(3); return { ore: r0 && r0.ore === g.ores.indexOf(seam), pref: w.pref === seam }; });
  check(r.ore && r.pref, 'L then a click on ore rallies a Headframe to that seam, and a new Rigger goes to work it');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, bh = g.ownB('bunkhouse')[0], lead = g.own('linesman')[0]; C.sel.clear(); C.selB = bh; look(lead.pos.x, lead.pos.z); aim(lead.pos.x, lead.pos.z); click(2); const r0 = C.rally.get(bh); lead.pos.x += 10; const u = g.spawn('linesman', 0, bh.pos.x, bh.pos.z + bh.hz + 1.2); step(2); return { id: r0 && r0.id === lead.id, d: Math.hypot(u.order.x - lead.pos.x, u.order.z - lead.pos.z) }; });
  check(r.id && r.d < 4, `a rally point on one of the side's bodies sends new bodies to wherever that body is now (${r.d.toFixed(1)} m off)`);

  // ---- staking a building out from above
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, w = g.own('rigger').find(u => u !== g.me); look(w.pos.x, w.pos.z); pickAll([w]); key('KeyB'); const menu = C.card.map(b => b.id); const dep = C.card.find(b => b.id === 'bd:depot'); key(dep.key);
    const lit = C.aim && C.aim.k === 'stake'; look(-22, 34); aim(-22, 34, 0); step(1); const ghost = Object.values(C['ghosts']).some(gs => gs[0].visible || gs[1].visible); const n0 = g.buildings.length, ore0 = g.ore; click(0);
    const site = g.buildings[g.buildings.length - 1]; step(4); return { menu, lit, ghost, made: g.buildings.length === n0 + 1 && site.kind === 'depot' && !site.built, paid: ore0 - g.ore, builder: w.site === site, aimOff: !C.aim }; });
  check(r.menu.includes('bd:depot') && r.menu.includes('back'), `a worker picked: B opens the build list (${r.menu.length - 1} buildings)`);
  check(r.lit && r.ghost, 'picking a building from the list shows it at the cursor, the way it shows in first person');
  check(r.made && r.paid > 85 && r.paid <= 100, `a click stakes it out from above and pays for it (${r.paid} ore, less what the Riggers banked meanwhile)`);
  check(r.builder && r.aimOff, 'the picked worker is sent to put it up');
  await shot('stake');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, w = g.own('rigger').find(u => u !== g.me); pickAll([w]); key('KeyB'); const ms = C.card.find(b => b.id === 'bd:foundry'); const n0 = g.buildings.length; key(ms.key); return { off: ms.off, none: g.buildings.length === n0 && !C.aim }; });
  check(/Machine Shop/.test(r.off) && r.none, `a locked building is greyed with what it needs, and stakes nothing ("${r.off}")`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, w = g.own('rigger').find(u => u !== g.me), hf = g.ownB('headframe')[0]; pickAll([w]); key('KeyB'); key(C.card.find(b => b.id === 'bd:depot').key); look(hf.pos.x, hf.pos.z); aim(hf.pos.x, hf.pos.z, 0); step(1); const fits = C.fits, n0 = g.buildings.length; click(0); return { fits, none: g.buildings.length === n0, kept: !!C.aim }; });
  check(!r.fits && r.none && r.kept, 'on top of another building it does not fit: nothing is staked and the order waits for a better spot');

  // ---- the HUD
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd; key('KeyH'); C.sel.clear(); C.selB = null; step(3); const t = id => document.getElementById(id).textContent; const sup = t('sup').split('/').map(Number);
    return { flux: t('flux'), sup, cap: g.supplyCap(0), bases: t('cpan') }; });
  check(r.flux === '0', 'the HUD shows Flux beside ore (0 until the side has any)');
  check(r.sup[1] === Math.min(200, r.cap) && r.sup[1] <= 200, `supply reads used out of room, 200 at most (${r.sup.join('/')})`);
  check(/Base 1: \d+\/\d+ workers/.test(r.bases), `with nothing picked the panel counts each base's workers against its seams ("${r.bases.match(/Base 1[^B]*/)?.[0]}")`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, u = g.own('linesman')[0]; u.maxEnergy = 100; u.energy = 40; C.sel.add(u); look(u.pos.x, u.pos.z); step(2); const bars = [...document.querySelectorAll('#anchors .hb.n')].filter(e => !e.hidden).length; u.maxEnergy = 0; C.sel.clear(); step(1); return bars; });
  check(r >= 1, 'a body with energy shows an energy bar under its health');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, hf = g.ownB('headframe')[0]; look(hf.pos.x, hf.pos.z); step(2); return [...document.querySelectorAll('#anchors .lab .sat')].map(e => e.textContent); });
  check(r.some(t => /Workers \d+\/\d+/.test(t)), `from above each base says how many workers it has against what its seams want (${r[0]})`);
  await shot('hud-bases');
} finally { await b.close(); }
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall passed'); process.exit(fail.length ? 1 : 0);
