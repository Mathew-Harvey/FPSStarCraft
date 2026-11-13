// Phones and tablets: the game spots a touch screen, shows on-screen controls, and they drive the player.
// A desktop browser keeps the keyboard and mouse. Run with: npm run build && node test/touch.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { testPage } from './page.mjs';
const require = createRequire(import.meta.url); const { chromium, devices } = require('playwright');
const page = await testPage(), SHOTS = process.env.SHOTS || '';
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const begin = async p => { await p.goto(page); await p.waitForFunction('window.__ore && __ore.game'); await p.evaluate(() => { __ore.pickSide(0); __ore.start(); }); await p.waitForFunction(() => __ore.game.me, null, { timeout: 60000 }); await p.evaluate(() => { const g = __ore.game; if (g.phase === 'card') { g.phase = 'play'; g.hud.titleCard('', '', ''); } }); };
try {
  // desktop first: nothing changes
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }), p = await ctx.newPage(); p.setDefaultTimeout(120000); await begin(p);
    check(await p.evaluate(() => !document.body.classList.contains('touch') && document.getElementById('touch').hidden), 'desktop browser: no touch controls'); await ctx.close(); }
  for (const dev of ['iPhone 13 landscape', 'Pixel 7 landscape', 'iPad Pro 11 landscape']) {
    const ctx = await b.newContext({ ...devices[dev] }), p = await ctx.newPage(); p.setDefaultTimeout(120000);
    p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
    await begin(p); await p.waitForTimeout(500);
    const vp = p.viewportSize(), cdp = await ctx.newCDPSession(p), T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const st = () => p.evaluate(() => { const g = __ore.game; return { x: g.me.pos.x, z: g.me.pos.z, yaw: g.yaw, tool: g.tool, tab: g.tab, lmb: g.lmb, id: g.me.id, phase: g.phase }; });
    const box = async sel => { const r = await p.locator(sel).boundingBox(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; };
    // a new unit kind shows a title card that holds input for a second; the test does not wait for it
    p.evaluate(() => setInterval(() => { const g = __ore.game; if (g.phase === 'card') { g.phase = 'play'; g.hud.titleCard('', '', ''); } }, 50));
    // software rendering is slow, so wait for the game to see a press instead of sleeping a fixed time
    const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 15000 }).then(() => true, () => false);
    const tap = async sel => { const c = await box(sel); if (c) { await p.touchscreen.tap(c[0], c[1]); await p.waitForTimeout(300); } return !!c; };

    // checked before any finger touches the page, since a touch would switch the controls on by itself anyway
    const on = await until(() => document.body.classList.contains('touch') && !document.getElementById('touch').hidden);
    check(on, `${dev}: touch controls switched on by themselves` + (on ? '' : ' ' + JSON.stringify(await p.evaluate(() => ({ cls: document.body.className, hidden: document.getElementById('touch').hidden, pts: navigator.maxTouchPoints, ua: navigator.userAgent.slice(0, 60), phase: __ore.game.phase })))));
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/touch-${dev.split(' ')[0]}.png` });
    const s0 = await st(), sx = vp.width * .2, sy = vp.height * .7;
    await T('touchStart', [{ x: sx, y: sy, id: 1 }]); for (let i = 1; i <= 5; i++) { await T('touchMove', [{ x: sx, y: sy - i * 16, id: 1 }]); await p.waitForTimeout(16); }
    await p.waitForTimeout(700); const s1 = await st();
    check(Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1, `${dev}: the left thumb stick walks (${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(1)} m)`);
    // keep walking with one thumb and look with the other
    await T('touchStart', [{ x: sx, y: sy - 80, id: 1 }, { x: vp.width * .6, y: vp.height * .4, id: 2 }]);
    for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: sx, y: sy - 80, id: 1 }, { x: vp.width * .6 + i * 20, y: vp.height * .4, id: 2 }]); await p.waitForTimeout(30); }
    await T('touchEnd', []); await p.waitForTimeout(200); const s2 = await st();
    check(Math.abs(s2.yaw - s1.yaw) > .1, `${dev}: dragging on the right turns the view while the other thumb walks`);
    const f = await box('[data-b=fire]'); await T('touchStart', [{ x: f[0], y: f[1], id: 3 }]); const held = await until(() => __ore.game.lmb); await T('touchEnd', []);
    check(held && await until(() => !__ore.game.lmb), `${dev}: holding the big button drills or fires, letting go stops`);
    await tap('[data-b=tool]'); check(await until(() => __ore.game.tool === 2), `${dev}: Build opens the build menu`);
    await tap('[data-b=next]'); check(await until(() => __ore.game.buildSel === 1), `${dev}: the arrows pick a building`);
    const row = await box('#buildRows > div:nth-child(1)'); await p.touchscreen.tap(row[0], row[1]); check(await until(() => __ore.game.buildSel === 0), `${dev}: tapping a row in the build menu picks it`);
    await tap('[data-b=aim]'); check(await until(() => __ore.game.tool === 1), `${dev}: Cancel puts the build menu away`);
    const was = (await st()).id; await tap('[data-b=jump]'); check(await until(() => __ore.game.tab), `${dev}: Jump opens the bodies`);
    const card = await box('#hud .card:nth-child(1)'); await p.touchscreen.tap(card[0], card[1]);
    check(await until(w => !__ore.game.tab && __ore.game.me.id !== w, was), `${dev}: tapping a body jumps into it`);
    await tap('[data-b=pause]'); check(await until(() => __ore.game.phase === 'paused' && !document.getElementById('pause').hidden && document.getElementById('touch').hidden), `${dev}: the pause button pauses and hides the controls`);
    await ctx.close();
  }
} finally { await b.close(); }
console.log(fail.length ? `\n${fail.length} touch check(s) failed` : '\nall touch checks passed'); process.exit(fail.length ? 1 : 0);
