// Two headless browsers join one lobby on a local server and play a short co-op match.
// Run with: npm run build && node test/coop.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const PORT = 8137, URL = `http://localhost:${PORT}/`, SHOTS = process.env.SHOTS || '';
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
  const A = await open('Ada'), B = await open('Bo');
  await A.click('#mCreate'); await A.waitForFunction(() => document.getElementById('mCodeShow').textContent.length === 5);
  const code = await A.evaluate(() => document.getElementById('mCodeShow').textContent); check(/^[A-Z]{5}$/.test(code), 'lobby created with a five-letter code: ' + code);
  await B.fill('#mCode', code); await B.click('#mJoinBtn'); await B.waitForFunction(() => !document.getElementById('mLobby').hidden);
  await A.waitForFunction(() => document.querySelectorAll('#mPlayers button').length === 2); check(true, 'second player joined and both see two names');
  check(await A.evaluate(() => document.getElementById('mStart').disabled), 'host cannot start until the crew is ready');
  await A.click('#mMaps button:nth-child(1)'); await B.click('#mReady'); await A.waitForFunction(() => !document.getElementById('mStart').disabled); await A.click('#mStart');
  for (const p of [A, B]) { await p.waitForFunction(() => __ore.game.net && __ore.game.me && __ore.game.units.length > 6); await p.evaluate(() => { __ore.game.noRender = true; }); }
  const state = p => p.evaluate(() => { const g = __ore.game; return { me: g.me && g.me.id, kind: g.me && g.me.kind, units: g.units.filter(u => u.alive).length, bld: g.buildings.filter(b => b.alive).length, ore: g.ore, time: g.time, pilots: g.units.filter(u => u.pilot).map(u => u.id).sort(), props: g.props.length, propsAlive: g.props.filter(q => q.alive).length, stones: g.stones().length }; });
  let a = await state(A), c = await state(B);
  check(a.me && c.me && a.me !== c.me, `each player drives a different body (${a.me}, ${c.me})`);
  check(a.props === c.props && a.props > 300, `both built the same map (${a.props} props)`);
  check(a.units === c.units && a.bld === c.bld, `same world on both screens (${a.units} units, ${a.bld} buildings)`);
  check(a.pilots.length === 2 && String(a.pilots) === String(c.pilots), 'both see who is driving what');
  // Ada walks, drills and stakes out a Bunkhouse. Bo jumps into another Rigger.
  // She switches the Quartermaster off first, so the only new building is hers. The server only pays for drilling at a seam, a few ore at a time.
  const ax = await A.evaluate(async () => { const g = __ore.game, n = g.ores[0], sleep = ms => new Promise(r => setTimeout(r, ms)); g.net.cmd('or', 'G'); g.me.pos.x = n.pos.x + 3; g.me.pos.z = n.pos.z; await sleep(1500); for (let i = 0; i < 26; i++) { g.net.cmd('mn', 0, 3); await sleep(250); } g.net.cmd('pl', 'bunkhouse', -14, 10, 0); return g.me.pos.x; });
  const bo = await B.evaluate(() => { const g = __ore.game; const u = g.units.find(u => u.team === 0 && !u.pilot && u.kind === 'rigger'); g.possess(u, true); return u.id; });
  const built = () => __ore.game.buildings.filter(b => b.alive).length === 11;
  check(await until(A, built) && await until(B, built), "Ada's Bunkhouse reached both players"); a = await state(A); c = await state(B);
  check(Math.abs(a.ore - c.ore) < 12, `both see the same ore after the Bunkhouse was paid for (${a.ore}/${c.ore})`);
  check(await until(B, ([id, x]) => Math.abs(__ore.game.uById.get(id).pos.x - x) < .6, [a.me, ax]), 'Bo sees Ada where Ada is standing');
  check(await until(A, id => !!__ore.game.uById.get(id)?.pilot, bo) && (await state(B)).me === bo, 'Bo jumped bodies and Ada can see it');
  // Bo shoots a Choir Stone and a rock through the server; both worlds must agree afterwards.
  const [sid, qid, was] = await B.evaluate(() => { const g = __ore.game, s = g.stones()[0], q = g.props.filter(p => p.alive && p.name === 'Boulder').sort((a, b) => Math.hypot(a.x - g.me.pos.x, a.z - g.me.pos.z) - Math.hypot(b.x - g.me.pos.x, b.z - g.me.pos.z))[0]; g.net.cmd('dm', s.id, 500, 0); g.net.cmd('dp', q.id, 900); return [s.id, q.id, s.hp]; });
  const hurt = ([s, was]) => __ore.game.bById.get(s).hp < was, gone = q => !__ore.game.props[q].alive;
  check(await until(B, hurt, [sid, was]) && await until(A, hurt, [sid, was]), 'damage goes through the server and both see the Stone hurt');
  check(await until(B, gone, qid) && await until(A, gone, qid), 'a boulder Bo broke is broken for Ada too');
  // let the match run, then compare again
  await sleep(20000); a = await state(A); c = await state(B);
  check(a.time > 10 && Math.abs(a.time - c.time) < 2.5, `match clock advanced together (${a.time.toFixed(0)}s)`);
  check(a.units === c.units && a.bld === c.bld && a.propsAlive === c.propsAlive, `still the same world after twenty seconds (${a.units} units, ${a.bld} buildings, ${a.propsAlive} props standing)`);
  if (SHOTS) { for (const [p, n] of [[A, 'ada'], [B, 'bo']]) { await p.evaluate(() => { const g = __ore.game, o = g.units.find(u => u.pilot && u !== g.me); g.noRender = false; if (o) { g.yaw = Math.atan2(o.pos.x - g.me.pos.x, o.pos.z - g.me.pos.z); g.pitch = 0; } }); await sleep(2500); await p.screenshot({ path: `${SHOTS}/coop-${n}.jpg`, type: 'jpeg', quality: 88 }); await p.evaluate(() => { __ore.game.noRender = true; }); } }
  // pings, chat and the scoreboard
  await B.evaluate(() => { const g = __ore.game; g.net.cmd('pg', 40, 5); g.net.cmd('ch', 'on my way <b>'); });
  check(await until(A, () => __ore.game.pings.some(p => p.x === 40 && p.z === 5)), "Ada sees Bo's ping");
  check(await until(A, () => /Bo<\/b>on my way b/.test(document.getElementById('feed').innerHTML.replace(/\s+</g, '<'))), 'Ada reads what Bo typed, with markup stripped');
  check(await A.evaluate(() => { const g = __ore.game; return Object.keys(g.score).length === 2 && g.score[g.net.id][1] >= 60 && g.score[g.net.id][2] === 1; }), 'the scoreboard credits Ada with her ore and her Bunkhouse');
  // Bo leaves: Ada keeps playing and the body goes back to the AI
  await B.close();
  check(await until(A, () => __ore.game.units.filter(u => u.pilot).length === 1), 'when Bo leaves, his body goes back to the crew and the match carries on');
  // Bo comes back mid-match with the same code and gets a body and the same world
  const B2 = await open('Bo'); await B2.fill('#mCode', code); await B2.click('#mJoinBtn');
  await B2.waitForFunction(() => __ore.game.net && __ore.game.me && __ore.game.units.length > 6); await B2.evaluate(() => { __ore.game.noRender = true; }); c = await state(B2);
  // Bo's body can be shot out from under him by a raid while this runs, so ask for whichever body he is in now.
  let back = false; for (let i = 0; i < 40 && !back; i++) { const id = await B2.evaluate(() => { const g = __ore.game; return g.me && g.me.alive ? g.me.id : 0; }); back = !!id && await A.evaluate(id => __ore.game.units.filter(u => u.pilot).length === 2 && !!__ore.game.uById.get(id)?.pilot, id); if (!back) await sleep(400); }
  check(back, 'Bo rejoins the running match with the code and gets a body'); await sleep(1500);
  a = await state(A); c = await state(B2);
  check(a.units === c.units && a.bld === c.bld && a.propsAlive === c.propsAlive, `the rejoined world matches (${c.units} units, ${c.bld} buildings, ${c.propsAlive} props standing)`);
  await b.close();
} catch (e) { console.log('ERROR', e); fail.push('exception'); }
srv.kill(); if (srvLog.includes('crashed') || srvLog.includes('bad command')) { console.log(srvLog); fail.push('server errors'); }
console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASSED'); process.exit(fail.length ? 1 : 0);
