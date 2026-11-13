// Watching from above: a watcher lifts the view off the followed body to the command view's camera, with nothing hidden, moves it
// around, zooms, opens the whole map and drops back. And the income graph in a team game: one line per side, in each side's colour.
// Run with: npm run build && node test/online/watch-above.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { server, client, sleep, versus, checker } from './lib.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const { check, done, fail } = checker();
const SHOTS = process.env.SHOTS || '/mnt/project-files/full-depth/K'; try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* optional */ }
const S = await server(8157, { ORE_TRUST_HITS: '1' }), URL = S.http + '/';
const until = (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const shot = async (p, name) => { try { await p.evaluate(() => { __ore.game.noRender = false; }); await sleep(1500); await p.screenshot({ path: join(SHOTS, name) }); await p.evaluate(() => { __ore.game.noRender = true; }); } catch (e) { console.log('no screenshot', name, e.message); } };
let b;
async function watcher(code) {
  const W = await b.newPage({ viewport: { width: 1280, height: 720 } }); W.setDefaultTimeout(120000);
  W.on('pageerror', e => { console.log('[Wen pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await W.goto(URL); await W.waitForFunction('window.__ore');
  await W.evaluate(code => { __ore.setFree(true); __ore.game.noRender = true; __ore.unlock(); document.getElementById('mName').value = 'Wen'; document.getElementById('mCode').value = code; }, code);
  await W.click('#mWatch');
  check(await until(W, () => __ore.game.net?.watch && __ore.game.me && __ore.game.phase === 'play'), 'Wen joins to watch');
  return W;
}
try {
  b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  // ---------------------------------------------------------------- one-on-one, from above
  {
    const { A, V, code } = await versus(S.url);
    const W = await watcher(code);
    check(await W.evaluate(() => __ore.game.fog.all), 'a watcher\'s page keeps nothing in the dark');
    await W.keyboard.press('KeyO');
    check(await until(W, () => __ore.game.cmd.caster && __ore.game.cmd.z > .3), 'O lifts the view to the command view\'s camera');
    const seen = await W.evaluate(() => { const g = __ore.game; return { foes: g.units.filter(u => u.alive && u.team !== g.myTeam).length, shown: g.units.filter(u => u.alive && u.team !== g.myTeam && u.obj.visible).length, card: g.cmd.card.length, sel: g.cmd.sel.size }; });
    check(seen.foes > 0 && seen.shown === seen.foes, `from above every body of the other side shows too (${seen.shown} of ${seen.foes})`);
    check(seen.card === 0 && seen.sel === 0, 'and there is nothing to pick or order');
    await shot(W, 'watch-above.png');
    const f0 = await W.evaluate(() => ({ x: __ore.game.cmd.focus.x, z: __ore.game.cmd.focus.z }));
    await W.keyboard.down('KeyD'); await sleep(1500); await W.keyboard.up('KeyD');
    const f1 = await W.evaluate(() => ({ x: __ore.game.cmd.focus.x, z: __ore.game.cmd.focus.z }));
    check(f1.x - f0.x > 5, `D moves the camera across the ground (${(f1.x - f0.x).toFixed(0)} m)`);
    const z0 = await W.evaluate(() => __ore.game.cmd.zt); await W.mouse.move(640, 360); await W.mouse.wheel(0, 300); await sleep(500);
    check(await W.evaluate(z0 => __ore.game.cmd.zt > z0, z0), 'the wheel pulls it further out');
    await W.keyboard.press('KeyM');
    check(await until(W, () => __ore.game.cmd.map), 'M opens the whole map');
    await shot(W, 'watch-map.png');
    await W.mouse.click(700, 300); await sleep(400);
    check(await until(W, () => !__ore.game.cmd.map && __ore.game.cmd.caster), 'a click on the map goes there');
    await W.keyboard.press('KeyF'); await sleep(2500);
    check(await W.evaluate(() => { const g = __ore.game, me = g.me; return !!me && Math.hypot(g.cmd.focus.x - me.pos.x, g.cmd.focus.z - me.pos.z) < 12; }), 'F brings it back over the followed player');
    await W.keyboard.press('KeyO');
    check(await until(W, () => !__ore.game.cmd.caster && __ore.game.cmd.z < .02), 'O drops back into their eyes');
    A.close(); V.close(); await W.close();
    await sleep(1000);
  }
  // ---------------------------------------------------------------- a two-against-two: one income line per side
  {
    const A = await client(S.url, 'Ada'); A.send({ t: 'create', name: 'Ada' }); const code = (await A.wait(m => m.t === 'lobby' && m.code)).code;
    A.send({ t: 'set', map: 6 }); await sleep(200); A.send({ t: 'set', mt: { n: 4, groups: [[0, 1], [2, 3]], facs: [0, 1, 2, 0] } }); await A.wait(m => m.t === 'lobby' && m.mt);
    A.send({ t: 'start' }); await A.wait(m => m.t === 'begin');
    const W = await watcher(code);
    check(await until(W, () => { const g = __ore.game; return Object.keys(g.stats.bySide).filter(t => g.stats.bySide[t] > 0).length >= 3; }, null, 90000), 'the watcher is sent what every side has banked');
    await sleep(12000);
    const inc = await W.evaluate(() => { const c = document.querySelector('#watch .w-inc canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, cols = new Set(); for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) cols.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4); return { keys: [...document.querySelectorAll('#watch .w-inc .w-keys span')].map(s => s.textContent), cols: cols.size }; });
    check(inc.keys.length === 4, `the income graph lists all four sides (${inc.keys.join(' · ')})`);
    check(inc.cols >= 4, `and draws them in their own colours (${inc.cols} colours on the graph)`);
    await W.keyboard.press('KeyO'); await until(W, () => __ore.game.cmd.z > .3);
    await shot(W, 'watch-team.png');
    A.close(); await W.close();
  }
} catch (err) { check(false, 'the test ran to the end: ' + err.message); }
try { await b?.close(); } catch (e) { /* gone */ }
S.stop(); done('watching from above');
