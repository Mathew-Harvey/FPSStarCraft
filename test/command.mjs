// The command view and the map, in one headless browser: the zoom from first person up to the map, picking bodies, the orders
// given from above, the crew bonus for leading in person, what is hidden from above, and the same orders through a split screen
// match (which runs the server's own code).
// Run with: npm run build && node test/command.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const page = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.html')).href, SHOTS = process.env.SHOTS || '';
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
try {
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.setDefaultTimeout(300000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  const until = (fn, arg, ms = 90000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const shot = async n => { if (SHOTS) { await p.evaluate(() => { for (const d of document.querySelectorAll('#feed div')) d.style.animation = 'none'; }); await p.screenshot({ path: `${SHOTS}/${n}.jpg`, type: 'jpeg', quality: 85 }); } };
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  await p.evaluate(() => {
    __ore.setFree(true); __ore.pickMap(0); document.querySelectorAll('#diff button')[0].click(); __ore.start(); __ore.hold(true);
    const g = __ore.game; g.introT = 0; g.hourFix = 13; g.wxFix = 'clear'; g.truce = true; g.dir.raidIn = 9999; g.dir.auto = false; g.ore = 600;
    for (const k of ['linesman', 'breacher', 'longshot', 'rigger', 'patch', 'gantry']) g.seenKinds.add(k);
    for (let i = 0; i < 6; i++) g.spawn('linesman', 0, -6 + i * 2.2, 14 + (i % 2) * 2);
    // The page is stepped by hand, drawing only the last frame of each run: picking reads the camera as it was last drawn.
    window.step = n => { const g = __ore.game; for (let i = 0; i < n; i++) { if (g.phase === 'card') g.phase = 'play'; g.noRender = i < n - 1; g.update(1 / 30); } g.noRender = false; };
    window.aim = (x, z, y = 1) => { const C = __ore.game.cmd, s = [0, 0]; C.screen(x, y, z, s); C.cx = s[0]; C.cy = s[1]; };
    window.click = (btn = 0) => { const g = __ore.game; g.pressed.add('Mouse' + btn); if (!btn) g.lmb = true; step(1); if (!btn) { g.lmb = false; step(1); } };
    window.key = k => { __ore.game.pressed.add(k); step(1); };
    window.wheel = (d, n = 1) => { for (let i = 0; i < n; i++) { __ore.game.wheel = d; step(1); } };
    step(20);
  });

  // ---- the zoom
  let r = await p.evaluate(() => { const g = __ore.game, me = g.me.id; wheel(1); const a = [g.cmd.zt > 0, g.cmd.on]; step(40); return { a, back: g.cmd.zt === 0 && g.cmd.z === 0, same: g.me.id === me }; });
  check(r.a[0] && !r.a[1] && r.back && r.same, 'one notch of the wheel lifts the camera a little and it settles back into the body');
  r = await p.evaluate(() => { const g = __ore.game, t0 = g.time, me = g.me; wheel(1, 2); step(28); return { on: g.cmd.on, dt: g.time - t0, state: me.state, hud: document.getElementById('cmdUI').hidden, cross: getComputedStyle(document.getElementById('cross')).display }; });
  check(r.on && !r.hud && r.cross === 'none', 'two notches leave the body for the command view, and the crosshair steps aside');
  check(Math.abs(r.dt - 1) < .05, `the match keeps running at full speed up there (${r.dt.toFixed(2)} s in 30 frames)`);
  check(r.state !== 'idle', `the body left behind goes back to work as ordinary crew (${r.state})`);
  await shot('command-near');

  // ---- picking and orders
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd; wheel(1, 2); step(20); C.cx = 20; C.cy = 20; g.pressed.add('Mouse0'); g.lmb = true; step(1); C.cx = g.hud.W - 20; C.cy = g.hud.H - 20; step(1); const box = !!C.box; g.lmb = false; step(1); return { box, kinds: [...C.sel].map(u => u.kind), rings: g.units.filter(u => u.ring.visible).length }; });
  check(r.box && r.kinds.length === 6 && r.kinds.every(k => k === 'linesman'), `a box round the yard picks the six fighters and leaves the Riggers at work (${r.kinds.length})`);
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd; aim(34, 20, 0); click(2); const o = [...C.sel].map(u => u.order); g.dir.regroup(); const kept = [...C.sel].every(u => u.order.type === 'amove' && u.order.mine); step(240); const at = [...C.sel].map(u => Math.hypot(u.pos.x - 34, u.pos.z - 20)); return { o: o.every(x => x.type === 'amove' && x.mine && Math.hypot(x.x - 34, x.z - 20) < 6), kept, far: Math.max(...at) }; });
  check(r.o, 'a right click on the ground sends the picked bodies there');
  check(r.kept, "the squad's own brain leaves bodies under the player's orders alone");
  check(r.far < 9, `they walk there and stand in a block (${r.far.toFixed(1)} m off at most)`);
  await shot('command-order');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, foe = g.spawn('cantor', 1, 44, 24); foe.order = { type: 'guard', x: 44, z: 24 }; step(12); g.fog.update(g, 1, true); aim(44, 24); click(2); const one = [...C.sel][0]; g.truce = false; step(3); const r = { prey: [...C.sel].every(u => u.order.prey === foe), tgt: one.target === foe }; g.truce = true; foe.hp = 0; foe.alive = false; g.scene.remove(foe.obj); step(2); return r; });
  check(r.prey && r.tgt, 'a right click on an enemy sets the picked bodies on that one');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd; key('KeyR'); return [...C.sel].every(u => !u.order.mine && u.order.type === 'guard'); });
  check(r, 'R hands the picked bodies back to the squad');
  // a worker, a seam and a building site
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, w = g.own('rigger').find(u => u !== g.me), far = g.ores.reduce((a, n) => Math.hypot(n.pos.x, n.pos.z) > Math.hypot(a.pos.x, a.pos.z) && Math.hypot(n.pos.x, n.pos.z) < 40 ? n : a, g.ores[0]);
    C.focus.set(w.pos.x, 0, w.pos.z); step(2); aim(w.pos.x, w.pos.z); click(0); const picked = C.sel.size === 1 && C.sel.has(w);
    C.focus.set(far.pos.x, 0, far.pos.z); step(2); aim(far.pos.x, far.pos.z, 0); click(2); const seam = w.pref === far && (w.node === far || w.state === 'toHQ');
    const site = g.place('depot', -14, 10, false); if (site.builder) { site.builder.site = null; site.builder = null; } C.focus.set(-14, 0, 10); step(2); aim(-14, 10, 0); click(2);
    return { picked, seam, site: w.site === site && site.builder === w }; });
  check(r.picked, 'a click picks one body');
  check(r.seam, 'a right click on ore sends a worker to that seam, and it keeps to it');
  check(r.site, 'a right click on a building site puts the worker on it');
  // a building: E trains from above
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, bh = g.addBuilding('bunkhouse', 0, 16, 16, true); for (const x of [-34, -42]) g.addBuilding('depot', 0, x, 24, true); g.ore = 600; C.focus.set(16, 0, 16); step(2); aim(16, 16, 0); click(0); const sel = C.selB === bh; step(1); const shop = C.shop; key('KeyE'); return { sel, shop, q: bh.queue.length, ore: g.ore, pan: document.getElementById('cpan').textContent }; });
  check(r.sel && /Linesman/.test(r.shop) && r.q === 1 && r.ore < 600, `picking a building and pressing E trains from above (${r.q} queued)`);
  await shot('command-building');

  // ---- leading in person
  r = await p.evaluate(() => { const g = __ore.game, me = g.me, hit = () => { const a = g.spawn('linesman', 0, me.pos.x + 4, me.pos.z), f = g.spawn('cantor', 1, me.pos.x + 8, me.pos.z); step(1); const h0 = f.hp + f.shield; g.damage(f, 10, a); const out = h0 - f.hp - f.shield; const b0 = a.hp; g.damage(a, 10, f); const inn = b0 - a.hp; for (const u of [a, f]) { u.alive = false; g.scene.remove(u.obj); } return [out, inn]; };
    const up = hit(); key('KeyN'); step(20); const down = hit(); const n = g.ledCount(); return { up, down, on: g.cmd.on, n, sub: document.getElementById('whoSub').textContent }; });
  check(Math.abs(r.up[0] - 10) < .01 && Math.abs(r.up[1] - 10) < .01, `crew fight at face value while the player is in the command view (${r.up})`);
  check(!r.on && Math.abs(r.down[0] - 12.5) < .01 && Math.abs(r.down[1] - 8.5) < .01, `crew beside a body the player is driving deal 25% more and take 15% less (${r.down})`);

  // ---- what the crew cannot see
  r = await p.evaluate(() => { const g = __ore.game, far = g.spawn('lancer', 1, 150, 0), near = g.spawn('lancer', 1, g.me.pos.x + 12, g.me.pos.z + 6); far.order = { type: 'guard', x: 150, z: 0 }; near.order = { type: 'guard', x: near.pos.x, z: near.pos.z }; g.fog.update(g, 1, true); step(2); const fp = far.obj.visible; key('KeyN'); step(30); g.fog.update(g, 1, true); step(2);
    const stone = g.buildings.find(b => b.team === 1); const r = { fp, far: far.obj.visible, near: near.obj.visible, stone: stone ? stone.obj.visible : null }; for (const u of [far, near]) { u.alive = false; g.scene.remove(u.obj); } return r; });
  check(r.fp && !r.far && r.near, 'from above, an enemy outside the crew\'s sight is hidden and one inside it is shown');
  check(r.stone === false, 'an enemy building nobody has found is hidden from above');

  // ---- back down, and the map
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, me = g.me, u = g.own('linesman')[0]; g.jumpCd = 0; C.focus.set(u.pos.x, 0, u.pos.z); step(2); aim(u.pos.x, u.pos.z); click(0); const had = C.sel.has(u); while (C.on) wheel(-1); step(30); const r = { had, in: g.me === u, was: g.lastBody === me, z: C.z, vis: !g.buildings.some(b => !b.obj.visible) }; return r; });
  check(r.had && r.in && r.z === 0, 'the wheel all the way in drops the player into the picked body');
  check(r.vis, 'back in first person nothing is hidden');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, me = g.me; key('KeyM'); step(12); const open = C.map && !document.getElementById('bigmap').hidden; const m = document.getElementById('bigmap').getBoundingClientRect(); return { open, w: m.width, me: g.me === me }; });
  check(r.open && r.w > 300, `M opens the full map from first person (${Math.round(r.w)} px wide)`);
  await shot('map');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, hud = g.hud; C.cx = hud.W / 2 + 60; C.cy = hud.H / 2; const pt = C.mapPt(C.cx, C.cy); click(0); step(10); return { cmd: C.on && !C.map, d: pt ? Math.hypot(C.focus.x - pt[0], C.focus.z - pt[1]) : 99 }; });
  check(r.cmd && r.d < 1, 'a click on the map takes the command view to that spot');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd, me = g.me; key('KeyN'); step(20); const a = !C.on && g.me === me; key('KeyM'); step(6); const b = C.map; key('KeyM'); step(20); return { a, b, c: !C.on && g.me === me }; });
  check(r.a, 'N goes back to the body the player left');
  check(r.b && r.c, 'M again closes the map and returns to first person');

  // ---- the same orders through a split screen match, which runs the server's code
  await p.evaluate(() => { __ore.hold(false); __ore.quit(); __ore.startSplit(); });
  check(await until(() => __ore.game.me && __ore.game2() && __ore.game2().me && __ore.game.units.length > 6), 'a split screen match starts');
  await p.evaluate(() => { const h = __ore.split().host; h.truce = true; h.dir.raidIn = 9999; for (let i = 0; i < 4; i++) h.spawn('linesman', 0, -6 + i * 2.2, 16); __ore.game2().noRender = true; });
  check(await until(() => __ore.game.units.filter(u => u.kind === 'linesman').length >= 4), 'the fighters reach player one\'s half');
  await p.evaluate(() => { const g = __ore.game; g.introT = 0; g.phase = 'play'; g.pressed.add('KeyN'); });
  check(await until(() => __ore.game.cmd.on && __ore.game.cmd.z > .25), 'player one goes up to the command view');
  check(await until(() => { const h = __ore.split().host, u = h.units.find(x => x.pilot === 1); return !!u && u.aloft; }), 'the match knows that player is up there');
  r = await p.evaluate(() => { const g = __ore.game, C = g.cmd; for (const u of g.units) if (u.kind === 'linesman' && u.team === 0 && !u.pilot) C.sel.add(u); const ids = [...C.sel].map(u => u.id); C.ground(g.hud.W * .7, g.hud.H * .4, g.cam.position.clone()); C.cx = g.hud.W * .7; C.cy = g.hud.H * .4; g.pressed.add('Mouse2'); return ids; });
  check(r.length >= 4 && await until(ids => { const h = __ore.split().host; return ids.every(id => { const u = h.units.find(x => x.id === id); return u && u.order.type === 'amove' && u.order.mine; }); }, r), 'an order from the command view reaches the match and moves the bodies');
  r = await p.evaluate(() => { const h = __ore.split().host; return h.leads.filter(u => u.pilot === 1).length; });
  check(r === 0, 'a player in the command view leads nobody');
  await p.evaluate(() => { __ore.game.pressed.add('KeyN'); });
  check(await until(() => { const h = __ore.split().host, u = h.units.find(x => x.pilot === 1); return !__ore.game.cmd.on && !!u && !u.aloft && h.leads.includes(u); }), 'back in the body, that player leads again');
} finally { await b.close(); }
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall passed'); process.exit(fail.length ? 1 : 0);
