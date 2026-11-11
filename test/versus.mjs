// One player on each side of a versus match: Ada runs the Ironhold yard, Vex sings for the Veyl.
// Run with: npm run build && node test/versus.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const PORT = 8139, URL = `http://localhost:${PORT}/`, SHOTS = process.env.SHOTS || '';
const srv = spawn('node', ['dist/server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = ''; srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Polls a condition in the page, because a headless browser on software rendering can take a while to catch up. */
const until = (p, fn, arg, ms = 12000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
try {
  await sleep(1200);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const open = async name => { const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(120000); p.on('pageerror', e => { console.log(`[${name} pageerror]`, e.message.slice(0, 400)); fail.push(name + ' page error'); }); await p.goto(URL); await p.waitForFunction('window.__ore'); await p.evaluate(n => { __ore.setFree(true); __ore.game.noRender = true; __ore.unlock(); document.getElementById('mName').value = n; }, name); return p; };
  const A = await open('Ada'), V = await open('Vex');
  await A.click('#mCreate'); await A.waitForFunction(() => document.getElementById('mCodeShow').textContent.length === 5);
  const code = await A.evaluate(() => document.getElementById('mCodeShow').textContent);
  await V.fill('#mCode', code); await V.click('#mJoinBtn'); await V.waitForFunction(() => !document.getElementById('mLobby').hidden);
  await V.click('#mSide'); await A.waitForFunction(() => /Veyl Chorus/.test(document.getElementById('mPlayers').textContent)); check(true, 'Vex picks the Veyl side and Ada sees it in the lobby');
  await A.click('#mDiff button:nth-child(1)'); await V.click('#mReady'); await A.waitForFunction(() => !document.getElementById('mStart').disabled); await A.click('#mStart');
  for (const p of [A, V]) { await p.waitForFunction(() => __ore.game.net && __ore.game.me && __ore.game.units.length > 6); await p.evaluate(() => { __ore.game.noRender = true; }); }
  const st = p => p.evaluate(() => { const g = __ore.game; return { me: g.me && g.me.id, team: g.me && g.me.team, kind: g.me && g.me.kind, my: g.myTeam, ore: g.ore, bld: g.buildings.filter(b => b.alive).length, hq: g.ownB('headframe')[0]?.hp, phase: g.phase, won: g.won, raidIn: g.dir.raidIn }; });
  let a = await st(A), v = await st(V);
  check(a.team === 0 && v.team === 1 && v.my === 1, `Ada is a ${a.kind} for Ironhold and Vex is a ${v.kind} for the Veyl`);
  // Vex tries Ironhold business and is refused, then calls the raid
  await V.evaluate(() => { const g = __ore.game; for (let i = 0; i < 10; i++) g.net.cmd('mn', 0, 3); g.net.cmd('pl', 'depot', 14, 20, 0); g.net.cmd('rd'); });
  await sleep(1200); const a2 = await st(A);
  check(Math.abs(a2.ore - a.ore) < 12 && a2.bld === a.bld, 'a Veyl player cannot mine or build for Ironhold');
  check(a2.raidIn <= 6, `Vex calls the raid early (${a2.raidIn.toFixed(1)}s out)`);
  // every Veyl body works in first person, with the picture on
  const kinds = await V.evaluate(async () => {
    const g = __ore.game, out = [], sleep = ms => new Promise(r => setTimeout(r, ms)); g.noRender = false;
    for (const k of ['cantor', 'lancer', 'warden']) { const u = g.units.find(u => u.alive && u.team === 1 && u.kind === k && (!u.pilot || u === g.me)); if (!u) continue; if (u !== g.me) { g.jumpCd = 0; g.possess(u); await sleep(600); if (g.phase === 'card') await sleep(1400); } g.lmb = true; await sleep(2600); g.lmb = false; out.push(k + (g.me === u ? '' : '?')); }
    g.keys.add('Tab'); await sleep(500); const tabs = g.tabList.length; g.keys.delete('Tab'); await sleep(300); g.noRender = true; return out.join(' ') + ' tab=' + tabs;
  });
  check(/cantor/.test(kinds) && !/\?/.test(kinds), 'Vex jumps between Veyl bodies and swings each one: ' + kinds);
  if (SHOTS) { await V.evaluate(() => { const g = __ore.game; g.noRender = false; g.pitch = 0; }); await sleep(2500); await V.screenshot({ path: `${SHOTS}/versus-vex.jpg`, type: 'jpeg', quality: 88 }); await V.evaluate(() => { __ore.game.noRender = true; }); }
  // each side hurts the other through the server
  v = await st(V);
  const hpV = await A.evaluate(id => { const g = __ore.game, u = g.uById.get(id); g.net.cmd('dm', id, 20, 0); return u.hp + u.shield; }, v.me);
  await V.evaluate(() => { const g = __ore.game, h = g.ownB('headframe')[0]; g.net.cmd('dm', h.id, 300, 0); });
  check(await until(V, was => { const g = __ore.game; return !g.me.alive || g.me.hp + g.me.shield < was; }, hpV), "Ada's shot lands on the body Vex is driving");
  check(await until(A, () => __ore.game.ownB('headframe')[0].hp <= 2100), "Vex's blow lands on the Headframe");
  a = await st(A); await A.evaluate(() => { const g = __ore.game; g.net.cmd('dm', g.ownB('headframe')[0].id, 300, 0); }); await sleep(1500);
  check((await st(A)).hq === a.hq, 'Ada cannot damage her own side');
  // Vex is killed and comes back in another body
  await A.evaluate(id => { const g = __ore.game; for (let i = 0; i < 4; i++) g.net.cmd('dm', id, 600, 0); }, v.me);
  check(await until(V, was => { const g = __ore.game; return g.me && g.me.alive && g.me.id !== was && g.me.team === 1; }, v.me, 20000), 'when Vex dies, Vex wakes up in another Veyl body');
  // Vex finishes the Headframe: Vex wins, Ada loses
  await V.evaluate(() => { const g = __ore.game, h = g.ownB('headframe')[0]; for (let i = 0; i < 8; i++) g.net.cmd('dm', h.id, 600, 0); });
  await A.waitForFunction(() => __ore.game.phase === 'over', null, { timeout: 30000 }); await V.waitForFunction(() => __ore.game.phase === 'over', null, { timeout: 30000 });
  a = await st(A); v = await st(V); check(a.won === false && v.won === true, 'the Headframe falls: Vex sees a win and Ada sees a loss');
  if (SHOTS) { await V.evaluate(() => { __ore.game.noRender = false; }); await sleep(1500); await V.screenshot({ path: `${SHOTS}/versus-end.jpg`, type: 'jpeg', quality: 88 }); }
  await b.close();
} catch (e) { console.log('ERROR', e); fail.push('exception'); }
srv.kill(); if (srvLog.includes('crashed') || srvLog.includes('bad command')) { console.log(srvLog.slice(0, 3000)); fail.push('server errors'); }
console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASSED'); process.exit(fail.length ? 1 : 0);
