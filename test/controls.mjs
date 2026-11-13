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

  // ---- page three: the tech tree screen, touch and controller into the command view and card
  await p.close(); p = await open();
  r = await p.evaluate(() => { const g = __ore.game; key('KeyN'); step(20); g.phase = 'play'; __ore.pause();
    const q = s => [...document.querySelectorAll(s)], names = () => q('#tree .node h4').map(e => e.textContent);
    const own = { shown: !document.getElementById('pause').hidden, names: names(), tabs: q('#ttabs .ttab').map(e => e.textContent), rows: q('#tree .tier').length, have: q('#tree .node.have h4').map(e => e.textContent), text: document.getElementById('tree').textContent };
    q('#ttabs [data-f="1"]')[0].click(); const veyl = names(); q('#ttabs [data-f="2"]')[0].click(); const gloam = { names: names(), marks: q('#tree .node.have').length };
    __ore.resume(); g.phase = 'play'; return { own, veyl, gloam, want: [...new Set(['headframe', ...g.dir ? [] : [], ...window.__ore.MAP ? [] : []])] }; });
  check(r.own.shown && r.own.tabs[0] === 'Ironhold (you)' && r.own.tabs.length === 3, `the pause screen has a tech tree with a tab for each faction (${r.own.tabs.join(', ')})`);
  check(r.own.names[0] === 'Headframe' && r.own.rows >= 4 && r.own.names.includes('Signal Mast'), `the player's own tree starts at the main building and runs in rows by what each building needs (${r.own.rows} rows: ${r.own.names.join(', ')})`);
  check(r.own.have.includes('Headframe') && /Linesman\s*60 ore · 1 supply/.test(r.own.text) && /Needs Machine Shop/.test(r.own.text), 'it marks what is standing, and lists each unit with its price, supply and what it needs');
  check(r.veyl.includes('Choir Stone') && r.gloam.names.includes('Mother Cap') && r.gloam.marks === 0, `the other factions' trees can be read too, with nothing marked as ours (${r.veyl.length} Veyl, ${r.gloam.names.length} Gloam buildings)`);
  await p.evaluate(() => { __ore.game.phase = 'play'; __ore.pause(); });
  await shot('tech-tree');
  await p.evaluate(() => { __ore.resume(); __ore.game.phase = 'play';
    { const g = __ore.game; g.supplyCap = () => 60; }   // room to train: the six extra fighters fill the starting beds
    // The touch layer: switched on as on a phone, with its per-frame work run by the test between steps.
    const T = __ore.touch, tf = T.frame.bind(T); T.frame = () => {}; window.tframe = () => tf(); __ore.setTouch(true); __ore.setFree(true); window.dispatchEvent(new Event('resize'));
    const el = document.getElementById('touch'); let id = 1;
    window.tdown = (x, y) => { const i = id++; el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: i, clientX: x, clientY: y, bubbles: true })); return i; };
    window.tmove = (i, x, y) => el.dispatchEvent(new PointerEvent('pointermove', { pointerId: i, clientX: x, clientY: y, bubbles: true }));
    window.tup = (i, x, y) => el.dispatchEvent(new PointerEvent('pointerup', { pointerId: i, clientX: x, clientY: y, bubbles: true }));
    window.ttap = (x, y) => { const i = tdown(x, y); tup(i, x, y); tframe(); step(1); tframe(); step(1); tframe(); step(1); };
    window.tbtn = b => { const e = document.querySelector(`#touch [data-b="${b}"]`), r = e.getBoundingClientRect(), i = id++; e.dispatchEvent(new PointerEvent('pointerdown', { pointerId: i, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { pointerId: i, clientX: r.x + 2, clientY: r.y + 2, bubbles: true })); tframe(); step(1); tframe(); };
    window.page = (hx, hy) => { const R = document.getElementById('hud').getBoundingClientRect(), k = __ore.game.hud.scale; return [R.left + hx * k, R.top + hy * k]; };
    window.unitAt = u => { const C = __ore.game.cmd, s = [0, 0]; C.screen(u.pos.x, 1, u.pos.z, s); return page(s[0], s[1]); };
    tframe(); step(2); tframe(); });
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, up = document.querySelector('#touch [data-b="up"]'); const was = C.on, seen = !up.hidden && up.textContent; tbtn('up'); step(25); tframe(); return { was, seen, on: C.on, label: up.textContent }; });
  check(!r.was && r.seen === 'Above' && r.on && r.label === 'Down', `on a touch screen an "Above" button lifts the player into the command view, and turns into "Down" (${r.seen} → ${r.label})`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, u = g.own('linesman')[0]; look(u.pos.x, u.pos.z); C.sel.clear(); step(1); const [x, y] = unitAt(u); ttap(x, y); return C.sel.has(u) && C.sel.size === 1; });
  check(r, 'a tap on a body picks it');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, u = [...C.sel][0], f0 = C.focus.clone(); const [x, y] = page(g.hud.W * .5, g.hud.H * .5); const i = tdown(x, y); for (let k = 1; k <= 6; k++) { tmove(i, x - k * 25, y); step(1); } tup(i, x - 150, y); tframe(); step(1); tframe(); step(1); return { moved: Math.hypot(C.focus.x - f0.x, C.focus.z - f0.z), kept: C.sel.has(u) && C.sel.size === 1 }; });
  check(r.moved > 3 && r.kept, `a one-finger drag slides the ground (${r.moved.toFixed(1)} m) and does not change the pick`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, u = [...C.sel][0]; look(u.pos.x, u.pos.z); tbtn('corder'); const lit = document.querySelector('#touch [data-b="corder"]').classList.contains('on'); const [x, y] = page(g.hud.W * .7, g.hud.H * .45); ttap(x, y); return { lit, mine: !!u.order.mine, ty: u.order.type }; });
  check(r.lit && r.mine && r.ty === 'amove', `with Order lit, a tap on the ground orders the picked bodies there (${r.ty})`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd; tbtn('corder'); const hf = g.ownB('headframe')[0]; C.sel.clear(); C.selB = hf; look(hf.pos.x, hf.pos.z); step(1); tframe(); const e = document.querySelector('#ccard [data-cb^="tr:"]'), r = e.getBoundingClientRect(), n = hf.queue.length; ttap(r.x + r.width / 2, r.y + r.height / 2); return { n0: n, n1: hf.queue.length, id: e.dataset.cb }; });
  check(r.n1 === r.n0 + 1, `a tap on a card button presses it (${r.id}: queue ${r.n0} → ${r.n1})`);
  await p.evaluate(() => { tframe(); step(1); });   // a capture after hand-stepped frames is sometimes black: one more frame
  await shot('touch-command');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd; C.zt = .5; C.z = .5; step(1); const z0 = C.zt, [x, y] = page(g.hud.W * .5, g.hud.H * .5); const a = tdown(x - 40, y), b2 = tdown(x + 40, y); for (let k = 1; k <= 2; k++) { tmove(a, x - 40 - k * 30, y); tmove(b2, x + 40 + k * 30, y); step(1); } tup(a, x - 100, y); tup(b2, x + 100, y); tframe(); step(1); return { z0, z1: C.zt, on: C.on }; });
  check(r.z1 < r.z0 && r.on, `two fingers spread apart zoom in (${r.z0.toFixed(2)} → ${r.z1.toFixed(2)})`);
  await p.evaluate(() => { __ore.setTouch(false); __ore.setFree(true); window.dispatchEvent(new Event('resize')); tframe(); step(1); });

  // ---- a controller: a fake pad, driven through the same code the page polls
  await p.evaluate(() => { window.pad = { connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
    window.pbtn = (i, on) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
    window.pdrive = () => { __ore.padDrive(pad); step(1); };
    window.ptap = i => { pbtn(i, true); pdrive(); pbtn(i, false); pdrive(); };
    const g = __ore.game; if (g.cmd.on) { key('KeyN'); step(25); } g.phase = 'play'; });
  r = await p.evaluate(() => { pbtn(8, true); pdrive(); return __ore.game.cmd.on; });
  await p.waitForTimeout(500);
  r = await p.evaluate(was => { pdrive(); step(25); const on = __ore.game.cmd.on; pbtn(8, false); pdrive(); step(2); return { was, on, still: __ore.game.cmd.on }; }, r);
  check(!r.was && r.on && r.still, 'holding View on a controller lifts the player into the command view (a short press still calls the squad)');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, z0 = C.zt; ptap(12); return { z0, z1: C.zt }; });
  check(r.z1 < r.z0, `D-pad up zooms in from above (${r.z0.toFixed(2)} → ${r.z1.toFixed(2)})`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, hf = g.ownB('headframe')[0]; C.sel.clear(); C.selB = hf; step(1); C.padFocus = -1; ptap(15); const f = C.padFocus, lit = document.querySelector('#ccard .cb.pf')?.dataset.cb; const n = hf.queue.length; ptap(0); return { f, lit, n0: n, n1: hf.queue.length }; });
  check(r.f === 0 && r.lit === 'tr:rigger' && r.n1 === r.n0 + 1, `D-pad right steps onto the card (outlined: ${r.lit}) and A presses it (queue ${r.n0} → ${r.n1})`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd; C.selB = null; step(1); ptap(3); const army = C.sel.size; ptap(8); step(25); return { army, on: C.on }; });
  check(r.army >= 5 && !r.on, `Y picks the whole army (${r.army}) and a tap of View drops back into the body`);

  // ---- page four: abilities, building commands and status on the card and HUD (test-only content where the factions have none yet)
  await p.close(); p = await open();
  await p.evaluate(() => { const R = __ore.reg, g = __ore.game;
    R.defineAbilities('longshot', [{ key: 'flare', name: 'Test Flare', hotkey: 'E', energy: 25, cd: 10, cast: 0, range: 30, target: 'point', blurb: 'test only', effect: (g, u, t) => { window.flared = (window.flared || []).concat([[u.id, t.x, t.z]]); } }]);
    R.defineAbilities('linesman', [{ key: 'brace', name: 'Test Brace', hotkey: 'C', energy: 0, cd: 8, cast: 0, range: 0, target: 'self', effect: (g, u) => { window.braced = (window.braced || []).concat([u.id]); } }]);
    R.defineBuildings({ headframe: { actions: (g, b) => [{ key: 'horn', name: 'Test Horn', hotkey: 'N', cost: [30, 0], blurb: 'test only', ok: () => window.hornBlock || '', run: () => { window.horned = (window.horned || 0) + 1; } }] } });
    for (let i = 0; i < 2; i++) { const u = g.spawn('longshot', 0, 4 + i * 2, 18); u.maxEnergy = 100; u.energy = 30 - i * 20; }
    step(2); });
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, ls = g.own('linesman').filter(u => !u.pilot).slice(0, 4); pickAll(ls); const b = C.card.find(x => x.id === 'ab:linesman:brace'); key(b.key); return { key: b.key, n: (window.braced || []).length, cds: ls.map(u => +(u.abCd?.brace || 0).toFixed(1)) }; });
  check(r.n === 4 && r.cds.every(c => c > 7), `a self ability on the card goes off on every picked body of that kind (${r.key}: ${r.n} braced)`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd; step(1); const b = C.card.find(x => x.id === 'ab:linesman:brace'); return b.off; });
  check(/^Ready in \d+ s$/.test(r), `while it recharges the button is greyed with the wait ("${r}")`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, ls = g.own('longshot').slice(-2); pickAll(ls); const b = C.card.find(x => x.id === 'ab:longshot:flare'); key(b.key); const lit = C.aim && C.aim.k === 'ab';
    const far = ls[0], tx = far.pos.x + 6, tz = far.pos.z - 6; look(tx, tz); aim(tx, tz, 0); click(0); return { lit, sub: b.sub, f: window.flared || [], who: [ls[0].id, ls[1].id], e: ls.map(u => Math.round(u.energy)) }; });
  check(r.lit && r.f.length === 1 && r.f[0][0] === r.who[0], `an aimed ability waits for a click, then only one caster goes: the one with the energy (${r.sub}; energy now ${r.e.join(', ')})`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, ls = g.own('longshot').slice(-2); pickAll(ls); const b = C.card.find(x => x.id === 'ab:longshot:flare'); return b.off; });
  check(/^Needs 25 energy/.test(r), `with no picked body able to pay, the button says how much energy it needs ("${r}")`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, hf = g.ownB('headframe')[0]; C.sel.clear(); C.selB = hf; C.menu = ''; C.aim = null; step(1); const b = C.card.find(x => x.id === 'ba:horn'); const o0 = g.purse[0]; key(b.key); const ok = { n: window.horned || 0, paid: o0 - g.purse[0] }; window.hornBlock = 'Not now.'; step(1); const b2 = C.card.find(x => x.id === 'ba:horn'); key(b2.key); window.hornBlock = ''; return { label: b.label, ...ok, off: b2.off, n2: window.horned || 0 }; });
  check(r.n === 1 && r.paid === 30 && r.off === 'Not now' && r.n2 === 1, `a building's own commands are on its card, paid for, and greyed with their reason ("${r.label}", then "${r.off}")`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, u = g.own('linesman')[0]; C.selB = null; pickAll([u]); u.status = [{ k: 'slow', t: 5 }, { k: 'shielded', t: 5 }]; look(u.pos.x, u.pos.z); step(2); const t = [...document.querySelectorAll('#anchors .st')].filter(e => !e.hidden).map(e => e.textContent); u.status = []; return t; });
  check(r.includes('Slowed +1'), `a body under a status shows it over its head in plain words (${r.join(', ')})`);
  await p.evaluate(() => { const u = __ore.game.own('linesman')[0]; u.status = [{ k: 'slow', t: 5 }]; step(2); });
  await shot('card-abilities');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, u = g.own('longshot').slice(-1)[0]; pickAll([u]); key('KeyF'); step(30); u.energy = 5; step(3); if (g.me !== u) return { shown: false, text: 'not driving it' }; const e = document.getElementById('abil'); return { shown: !e.hidden, text: e.textContent }; });
  check(r.shown && /Test Flare/.test(r.text) && /Needs 25 energy/.test(r.text), `in first person the driven body's abilities sit over its name with key, cost and what stops them ("${r.text}")`);
  await shot('fp-abilities');

  // ---- page five: a team game from the skirmish menu, and allies drawn as allies
  await p.close();
  p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(300000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  r = await p.evaluate(() => { __ore.setFree(true); const q = s => [...document.querySelectorAll(s)];
    const before = document.getElementById('teams').hidden; __ore.pickMap(6); const row = document.getElementById('teams'), names = q('#teams button').map(b => b.firstChild.textContent);
    q('#teams button')[1].click(); document.querySelectorAll('#diff button')[0].click(); __ore.start(); __ore.hold(true);
    const g = __ore.game, me = g.myTeam, teams = [...new Set(g.units.map(u => u.team))];
    return { before, shown: !row.hidden, names, teams, me, on: row.querySelector('.on')?.firstChild.textContent }; });
  check(r.before && r.shown && r.names.join(',') === '1v1,2v2,Free for all', `on a four-start map the menu offers the kinds of game from the team layouts (${r.names.join(', ')})`);
  check(r.on === '2v2' && r.teams.length === 4, `picking 2v2 starts a match with four sides (${r.teams.join(', ')})`);
  r = await p.evaluate(() => { const g = __ore.game; g.introT = 0; g.truce = true; g.dir.raidIn = 9999;
    const real = g.update.bind(g); let stepping = false; g.update = dt => { if (stepping) real(dt); };
    window.step = n => { stepping = true; for (let i = 0; i < n; i++) { if (g.phase === 'card') g.phase = 'play'; g.noRender = i < n - 1; g.update(1 / 30); } g.noRender = false; stepping = false; };
    step(5); const F = __ore.reg.isFriend, friends = [...new Set(g.units.filter(u => u.team !== g.myTeam && F(u.team, g.myTeam)).map(u => u.team))];
    return { friends }; });
  check(r.friends.length === 1, `in 2v2 the player has one allied side (${r.friends.join(', ')})`);
  r = await p.evaluate(() => { const g = __ore.game, me = g.me, mine = g.myTeam;
    const ally = g.units.find(u => u.alive && u.team !== mine && __ore.reg.isFriend(u.team, mine));
    if (!ally) return { ally: false };
    g.pressed.add('KeyN'); step(30); const C = g.cmd; C.focus.set(ally.pos.x, 0, ally.pos.z); ally.hp = ally.maxHp * .5; step(3);
    const bars = [...document.querySelectorAll('#anchors .hb.f')].filter(e => !e.hidden).length, sp = [0, 0]; C.screen(ally.pos.x, 1, ally.pos.z, sp); C.cx = sp[0]; C.cy = sp[1]; step(1);
    const asFoe = C.unitAt(false) === ally, shown = ally.obj.visible; return { ally: true, bars, team: ally.team, asFoe, shown, on: C.on }; });
  check(r.ally && r.on && r.bars >= 1 && r.shown && !r.asFoe, `from above an ally is always shown, its health bar has its own colour, and a click on it is not an attack (team ${r.team}, ${r.bars} ally bars)`);
  await p.evaluate(() => step(1));
  await shot('team-game');
} finally { await b.close(); }
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall passed'); process.exit(fail.length ? 1 : 0);
