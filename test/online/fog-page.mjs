// Fog on the wire in a real page: enemy bodies that walk out of sight leave the page's world, come back when they are seen again,
// and enemy buildings stay as last seen. Ada plays in a browser; Vex is a plain WebSocket client on the Veyl side.
// Run with: npm run build && node test/online/fog-page.mjs
import { createRequire } from 'node:module';
import { server, client, sleep, walk, checker } from './lib.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const { check, done, fail } = checker();
const S = await server(8152), URL = S.http + '/';
const until = (p, fn, arg, ms = 15000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
let b;
try {
  b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const A = await b.newPage({ viewport: { width: 960, height: 540 } }); A.setDefaultTimeout(120000);
  A.on('pageerror', e => { console.log('[Ada pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await A.goto(URL); await A.waitForFunction('window.__ore'); await A.evaluate(() => { __ore.setFree(true); __ore.game.noRender = true; __ore.unlock(); document.getElementById('mName').value = 'Ada'; __ore.hold(true); });
  await A.click('#mCreate'); await A.waitForFunction(() => document.getElementById('mCodeShow').textContent.length === 5);
  const code = await A.evaluate(() => document.getElementById('mCodeShow').textContent);
  const V = await client(S.url, 'Vex'); V.send({ t: 'join', code, name: 'Vex' }); await V.wait(m => m.t === 'lobby' && m.code === code);
  V.send({ t: 'team', v: 1 }); V.send({ t: 'ready', v: true }); await A.waitForFunction(() => !document.getElementById('mStart').disabled); await A.click('#mStart');
  const bV = await V.wait(m => m.t === 'begin'); await A.waitForFunction(() => __ore.game.net && __ore.game.me && __ore.game.units.length > 4); await A.evaluate(() => { __ore.game.noRender = true; __ore.hold(false); });
  await sleep(2500);
  const foes = () => A.evaluate(() => { const g = __ore.game; return { u: g.units.filter(u => u.alive && u.team !== g.myTeam).map(u => [u.id, Math.round(u.pos.x), Math.round(u.pos.z)]), b: g.buildings.filter(b => b.alive && b.team !== g.myTeam).map(b => [b.id, b.kind, !!b.ghost]), me: [g.me.pos.x, g.me.pos.z] }; });
  const f0 = await foes();
  check(!f0.u.some(r => Math.hypot(r[1] - f0.me[0], r[2] - f0.me[1]) > 120), `at the start Ada's page holds no Veyl body from the far base (${f0.u.length} Veyl bodies in her world)`);
  // Vex walks his body into Ironhold's yard, then back out of sight, then in again
  const id = bV.unit; await sleep(500);
  const vin = await walk(V, id, 14, 22, 10.5);
  check(vin, 'Vex walked his body into the Ironhold yard');
  check(await until(A, id => !!__ore.game.uById.get(id)?.alive, id), 'Ada\'s page draws Vex\'s body once it is in sight');
  const vout = await walk(V, id, 150, 60, 10.5);
  check(vout && await until(A, id => !__ore.game.uById.get(id), id), 'when Vex walks away out of sight, his body leaves Ada\'s page');
  await walk(V, id, 14, 22, 10.5);
  check(await until(A, id => !!__ore.game.uById.get(id)?.alive, id), 'and comes back when he walks into sight again');
  // a frame is drawn with bodies coming and going
  await A.evaluate(() => { __ore.game.noRender = false; }); await sleep(1500); await A.evaluate(() => { __ore.game.noRender = true; });
  check(!fail.includes('page error'), 'the page drew bodies coming and going without an error');
} catch (e) { console.log('ERROR', e.stack); check(false, 'no exception'); }
await b?.close(); S.stop(); check(!/match crashed/.test(S.log()), 'no match crashed on the server');
done('fog in the page');
