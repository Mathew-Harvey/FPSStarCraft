// Casts drawn online, in a real page: Wen watches a match in a browser, and a cast event in a picture from the server (a Linesman's
// Overtime) is drawn on her screen with the ability's own look (AbilityDef.show in src/core/ability.ts). A Gloam cast is drawn the same way. Who is sent which cast, wind-ups
// and building looks are checked without a browser in test/online/cast-looks.ts.
// Run with: npm run build && node test/online/cast-page.mjs
import { createRequire } from 'node:module';
import { server, client, sleep, versus, checker } from './lib.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const { check, done, fail } = checker();
const S = await server(8158, { ORE_TRUST_HITS: '1' }), URL = S.http + '/';
const until = (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
let b;
try {
  b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const { A, V, code } = await versus(S.url, { set: { rules: { ore: 5000, flux: 2000 } } });
  const W = await b.newPage({ viewport: { width: 960, height: 540 } }); W.setDefaultTimeout(120000);
  W.on('pageerror', e => { console.log('[Wen pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await W.goto(URL); await W.waitForFunction('window.__ore');
  await W.evaluate(code => { __ore.setFree(true); __ore.game.noRender = true; __ore.unlock(); document.getElementById('mName').value = 'Wen'; document.getElementById('mCode').value = code; }, code);
  await W.click('#mWatch');
  check(await until(W, () => __ore.game.net?.watch && __ore.game.phase === 'play' && __ore.game.units.length > 3), 'Wen joins to watch');
  await W.evaluate(() => { __ore.game.noRender = false; });
  const kit = () => W.evaluate(() => window.__ironShow?.kitOf(__ore.game)?.list.length ?? -1);
  // Ada's side's crew stakes out a Bunkhouse by itself; Ada trains a Linesman there
  await until(W, () => __ore.game.buildings.some(x => x.alive && x.team === 0 && x.built && x.kind === 'bunkhouse'), null, 120000);
  const bar = await W.evaluate(() => { const b = __ore.game.buildings.find(x => x.alive && x.team === 0 && x.built && x.kind === 'bunkhouse'); return b ? b.id : 0; });
  check(!!bar, 'the crew puts up a Bunkhouse');
  A.send({ t: 'in', me: null, c: [['tn', bar, 'linesman']] });
  check(await until(W, () => __ore.game.units.some(u => u.alive && u.team === 0 && u.kind === 'linesman' && !u.pilot), null, 60000), 'a Linesman comes out of training');
  const [lid, lx, lz] = await W.evaluate(() => { const u = __ore.game.units.find(x => x.alive && x.team === 0 && x.kind === 'linesman' && !x.pilot); return [u.id, u.pos.x, u.pos.z]; });
  // Overtime needs research and a Lab Bay, so the cast event is slipped into the next picture the server sends Wen, the way the server
  // sends it (the server side, with fog, is checked in cast-looks.ts). What this checks is the page: the event is drawn.
  await sleep(500); const k0 = await kit();
  await W.evaluate(([id, x, z]) => { const n = __ore.game.net, take = n.take.bind(n); let once = true; n.take = m => { if (once && m.t === 's') { once = false; m.e.push(['ab', id, 'overtime', x, z, 0]); } return take(m); }; }, [lid, lx, lz]);
  check(await until(W, k0 => (window.__ironShow?.kitOf(__ore.game)?.list.length ?? 0) > k0, k0, 8000), `a Linesman's Overtime sent as a cast event is drawn on Wen's screen (${k0} effects before, ${await kit()} after)`);
  const k1 = await kit();
  await W.evaluate(([id, x, z]) => { const n = __ore.game.net, take = n.take.bind(n); let once = true; n.take = m => { if (once && m.t === 's') { once = false; m.e.push(['ab', id, 'overtime', x, z, 0]); } return take(m); }; }, [9999999, lx, lz]);
  await sleep(1500); check(await kit() <= k1, 'a cast by a body the page does not have draws nothing and breaks nothing');
  A.close(); V.close(); await W.close();
  await sleep(800);
  // ---------------------------------------------------------------- the Gloam: a Grazer digging in, drawn with the Gloam's own look
  {
    const { A: A2, V: V2, code: c2 } = await versus(S.url, { set: { out: 5 } });   // the Veyl at the yard, the Gloam at the outpost
    const W2 = await b.newPage({ viewport: { width: 960, height: 540 } }); W2.setDefaultTimeout(120000);
    W2.on('pageerror', e => { console.log('[Wen pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
    await W2.goto(URL); await W2.waitForFunction('window.__ore');
    await W2.evaluate(code => { __ore.setFree(true); __ore.game.noRender = true; __ore.unlock(); document.getElementById('mName').value = 'Wen'; document.getElementById('mCode').value = code; }, c2);
    await W2.click('#mWatch');
    check(await until(W2, () => __ore.game.net?.watch && __ore.game.phase === 'play' && __ore.game.units.some(u => u.alive && u.kind === 'grazer')), 'Wen watches a Veyl against Gloam match');
    await W2.evaluate(() => { __ore.game.noRender = false; }); await sleep(800);
    const [gid, gx, gz] = await W2.evaluate(() => { const u = __ore.game.units.find(x => x.alive && x.kind === 'grazer'); return [u.id, u.pos.x, u.pos.z]; });
    const n0 = await W2.evaluate(() => __ore.game.scene.children.length);
    await W2.evaluate(([id, x, z]) => { const n = __ore.game.net, take = n.take.bind(n); let once = true; n.take = m => { if (once && m.t === 's') { once = false; m.e.push(['ab', id, 'dig', x, z, 0]); } return take(m); }; }, [gid, gx, gz]);
    check(await until(W2, n0 => __ore.game.scene.children.length > n0, n0, 8000), `a Grazer digging in, sent as a cast event, is drawn with the Gloam's look (${n0} things in the scene before, ${await W2.evaluate(() => __ore.game.scene.children.length)} after)`);
    A2.close(); V2.close(); await W2.close();
  }
} catch (err) { check(false, 'the test ran to the end: ' + err.message); }
try { await b?.close(); } catch (e) { /* gone */ }
S.stop(); done('casts on the page');
