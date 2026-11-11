// One headless browser plays a short split screen match: two players, one page, no server.
// Run with: npm run build && node test/split.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const page = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.html')).href, SHOTS = process.env.SHOTS || '';
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(120000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  const until = (fn, arg, ms = 60000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  await p.evaluate(() => { __ore.setFree(true); __ore.startSplit(); });
  check(await until(() => __ore.game.me && __ore.game2() && __ore.game2().me && __ore.game.units.length > 6), 'both halves joined the match and got a body');
  const st = () => p.evaluate(() => { const a = __ore.game, c = __ore.game2(), h = __ore.split().host, pos = g => [g.me.pos.x, g.me.pos.z]; return { a: a.me.id, c: c.me.id, ua: a.units.length, uc: c.units.length, uh: h.units.filter(u => u.alive).length, pilots: h.units.filter(u => u.pilot).map(u => u.pilot).sort().join(), pa: pos(a), pc: pos(c), ore: [a.ore, c.ore, Math.floor(h.ore)], huds: document.querySelectorAll('.hud:not([hidden])').length, rect: [__ore.pipe.w, __ore.pipe.cw], time: h.time }; });
  let s = await st();
  check(s.a !== s.c, `each player drives a different body (${s.a}, ${s.c})`);
  check(s.pilots === '1,2', 'the match knows both players');
  check(s.ua === s.uh && s.uc === s.uh, `same world in both halves (${s.uh} units)`);
  check(s.huds === 2, 'each half has its own HUD');
  check(s.rect[1] >= s.rect[0] * 2 - 2, `the picture is split in two (${s.rect[0]} of ${s.rect[1]} pixels wide each)`);
  if (SHOTS) { await p.waitForTimeout(4000); await p.screenshot({ path: SHOTS + '/split-start.png' }); }
  // player two walks forward on the fallback keys while player one stands still
  await p.keyboard.down('ArrowUp');
  const moved = await until(([x, z]) => { const m = __ore.game2().me; return Math.hypot(m.pos.x - x, m.pos.z - z) > 1.5; }, s.pc);
  await p.keyboard.up('ArrowUp');
  const t = await st();
  check(moved, 'player two moves on their own keys');
  check(Math.hypot(t.pa[0] - s.pa[0], t.pa[1] - s.pa[1]) < .5, 'player one stays put while player two moves');
  check(await until(id => { const g = __ore.game, u = g.units.find(x => x.id === id), m = __ore.game2().me; return u && Math.hypot(u.pos.x - m.pos.x, u.pos.z - m.pos.z) < 1; }, t.c), "player one's half shows player two where they walked to");
  // shared economy: ore mined by the crew reaches both halves
  check(await until(() => { const h = __ore.split().host; h.ore += 0; return __ore.game.ore === __ore.game2().ore && __ore.game.ore === Math.floor(h.ore); }), 'both halves show the same ore');
  // player two takes a different body with the jump key, and the match agrees
  const jumped = await p.evaluate(() => { const g = __ore.game2(), u = g.units.find(x => x.alive && x.team === 0 && !x.pilot && x !== g.me); if (!u) return 0; g.possess(u); return u.id; });
  check(jumped && await until(id => __ore.split().host.units.some(u => u.id === id && u.pilot === 2), jumped), 'player two can jump into another body');
  // a controller takes over player two's half
  await p.evaluate(() => { const pad = { connected: true, axes: [0, -1, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; navigator.getGamepads = () => [pad]; window.__pad = pad; });
  const before = await p.evaluate(() => { const m = __ore.game2().me; return [m.pos.x, m.pos.z]; });
  check(await until(([x, z]) => { const m = __ore.game2().me; return Math.hypot(m.pos.x - x, m.pos.z - z) > 1.5; }, before), 'player two moves with a controller stick');
  check(await until(() => /LB/.test(document.querySelector('.hud.p2 #hint').textContent)), "player two's prompts name controller buttons");
  await p.evaluate(() => { __pad.axes[1] = 0; });
  // pause stops the match for both
  await p.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); });
  const t0 = await p.evaluate(() => [__ore.game.phase, __ore.game2().phase, __ore.split().host.time]); await p.waitForTimeout(1500);
  const t1 = await p.evaluate(() => __ore.split().host.time);
  check(t0[0] === 'paused' && t0[1] === 'paused' && t1 === t0[2], 'pausing stops the shift for both players');
  if (SHOTS) await p.screenshot({ path: SHOTS + '/split-paused.png' });
  // back to the menu puts the single view back
  await p.evaluate(() => document.getElementById('toMenu').click());
  const m = await p.evaluate(() => ({ split: !!__ore.split(), huds: document.querySelectorAll('.hud:not([hidden])').length, w: __ore.pipe.w, cw: __ore.pipe.cw, net: !!__ore.game.net }));
  check(!m.split && !m.net && m.w === m.cw, 'leaving goes back to a single full-screen view');
  // split screen versus: player two wakes up in the Veyl
  await p.evaluate(() => { navigator.getGamepads = () => []; __ore.startSplit(true); });
  check(await until(() => { const a = __ore.game, c = __ore.game2(); return a.me && c && c.me && c.myTeam === 1 && c.me.team === 1 && a.me.team === 0; }), 'versus: player one is Ironhold and player two drives a Veyl body');
  check(await p.evaluate(() => { const h = __ore.split().host, c = __ore.game2(); return h.units.some(u => u.id === c.me.id && u.pilot === 2 && u.team === 1) && h.teams[2] === 1 && h.coop === 1; }), 'versus: the match has player two on the Veyl side');
  await p.evaluate(() => { __ore.split().host.time = Math.max(__ore.split().host.time, 125); const c = __ore.game2(); c.pressed.add('Digit2'); });
  await p.waitForTimeout(300); await p.evaluate(() => { const c = __ore.game2(); if (c.phase === 'card') c.phase = 'play'; c.pressed.add('KeyG'); });
  check(await until(() => { const d = __ore.split().host.dir; return __ore.game2().verse === 1 && (d.raidIn <= 6 || d.raidLive); }), 'versus: player two picks the Lances verse and calls the raid');
  const ore0 = await p.evaluate(() => { const c = __ore.game2(), h = __ore.split().host; for (let i = 0; i < 5; i++) c.net.cmd('pl', 'depot', 14, 20, 0); return [Math.floor(h.ore), h.buildings.length]; }); await p.waitForTimeout(800);
  check(await p.evaluate(([o, n]) => { const h = __ore.split().host; return h.buildings.length === n && Math.abs(h.ore - o) < 40; }, ore0), 'versus: the Veyl player cannot build for Ironhold');
  if (SHOTS) { await p.waitForTimeout(3000); await p.screenshot({ path: SHOTS + '/split-versus.png' }); }
  await p.evaluate(() => { const h = __ore.split().host, b = h.ownB('headframe')[0]; h.damage(b, 99999, null); });
  check(await until(() => __ore.game.phase === 'over' && __ore.game2().phase === 'over'), 'versus: the match ends for both halves when the Headframe falls');
  check(await p.evaluate(() => __ore.game.won === false && __ore.game2().won === true && /Veyl/.test(document.getElementById('endTitle').textContent)), 'versus: player two wins, player one loses, and the end screen says who');
  await p.evaluate(() => document.getElementById('toMenu').click());
} catch (e) { console.log('ERROR', e); fail.push('exception'); }
await b.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall split screen checks passed'); process.exit(fail.length ? 1 : 0);
