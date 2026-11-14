// The Gloam, three ways: a solo skirmish as the Gloam, Ironhold against Gloam bots, and an online versus with a Gloam player.
// Run with: npm run build && node test/gloam.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { testPage } from './page.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const page = await testPage(), SHOTS = process.env.SHOTS || '';
const PORT = 8141, URL = `http://localhost:${PORT}/`;
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
let srv = null;
try {
  const open = async (url, name) => { const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(120000); p.on('pageerror', e => { console.log(`[${name} pageerror]`, e.message.slice(0, 400)); fail.push(name + ' page error'); }); p.on('crash', () => console.log(`[${name} crashed]`)); p.on('close', () => console.log(`[${name} closed]`)); await p.goto(url); await p.waitForFunction('window.__ore && __ore.game'); return p; };
  const until = (p, fn, arg, ms = 60000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

  // ---- 1. a solo skirmish as the Gloam
  let p = await open(page, 'solo');
  await p.evaluate(() => { __ore.setFree(true); document.querySelector('[data-m="skirm"]').click(); document.querySelectorAll('#sides button')[2].click(); });
  check(await p.evaluate(() => document.getElementById('start').textContent) === 'Start growing', 'picking the Gloam relabels the start button');
  await p.evaluate(() => document.getElementById('start').click());
  check(await until(p, () => __ore.game.me && __ore.split() && __ore.game.units.length > 6), 'the Gloam run starts and hands over a body');
  const s = await p.evaluate(() => { const g = __ore.game, h = __ore.split().host; return { team: g.myTeam, kind: g.me.kind, eco: h.eco, human: h.human.join(), caps: h.buildings.filter(b => b.alive && b.team === 2 && b.kind === 'mothercap').length, grazers: h.units.filter(u => u.alive && u.kind === 'grazer').length, veyl: h.units.filter(u => u.alive && u.team === 1).length + h.buildings.filter(b => b.alive && b.team === 1).length, iron: h.units.filter(u => u.alive && u.team === 0).length, bloom: h.carpet.patches.length, bloomHere: g.carpet.patches.length, buds: h.buildings.find(b => b.kind === 'mothercap')?.buds }; });
  console.log(JSON.stringify(s));
  check(s.team === 2 && s.kind === 'grazer', 'the player is a Gloam Grazer');
  check(s.eco && s.human.split(',').slice(0, 3).join() === 'false,false,true', 'the match runs the Gloam economy, with Ironhold left to the bots');
  check(s.caps === 1 && s.grazers >= 6 && s.iron >= 4 && s.veyl === 0, `one Mother Cap, ${s.grazers} Grazers, an Ironhold crew and no Veyl`);
  check(s.bloom >= 1 && s.bloomHere >= 1 && s.buds >= 0 && s.buds <= 3, `the Mother Cap spreads Bloom on both copies and grows Buds (${s.buds} ripe)`);
  if (SHOTS) { await p.waitForTimeout(3000); await p.screenshot({ path: SHOTS + '/gloam-start.png' }); }
  await p.evaluate(() => { __ore.game.noRender = true; });   // software rendering is slow; the rest is about the rules
  const c0 = await p.evaluate(() => __ore.game.purse[2]);
  check(await until(p, c => __ore.game.purse[2] > c + 20, c0, 90000), 'the Grazers chew ore into the Gloam purse');
  await p.evaluate(() => { const h = __ore.split().host; h.dir.vs.auto = false; h.purse[2] = 2000; });
  await until(p, () => __ore.game.purse[2] >= 1500);
  // root a Warren on the Bloom: it costs a Grazer as well as ore, and bare ground is refused
  const root = await p.evaluate(() => { const g = __ore.game, h = __ore.split().host, cap = h.buildings.find(b => b.team === 2 && b.kind === 'mothercap'), n0 = h.units.filter(u => u.alive && u.kind === 'grazer').length;
    const bare = h.canPlace('warren', cap.pos.x + 60, cap.pos.z, false, 2); let at = null;
    for (let r = 9; r < 20 && !at; r += 1) for (let a = 0; a < 6.3 && !at; a += .3) { const x = Math.round(cap.pos.x + Math.cos(a) * r), z = Math.round(cap.pos.z + Math.sin(a) * r); if (h.canPlace('warren', x, z, false, 2)) at = [x, z]; }
    if (at) g.place('warren', at[0], at[1], false, 2); return { bare, at, n0 }; });
  check(!root.bare && !!root.at, 'a Warren fits on the Bloom but not on bare ground');
  check(await until(p, n => { const h = __ore.split().host; return h.buildings.some(b => b.team === 2 && b.kind === 'warren') && h.units.filter(u => u.alive && u.kind === 'grazer').length === n - 1; }, root.n0, 20000), 'the host roots the Warren and a Grazer is used up');
  await p.evaluate(() => { for (const b of __ore.split().host.buildings) if (b.team === 2 && !b.built) b.progress = 1; });
  check(await until(p, () => __ore.game.buildings.some(b => b.team === 2 && b.kind === 'warren' && b.built)), 'the Warren grows in and the player sees it');
  // Snappers ripen two to a Bud at the Mother Cap
  await p.evaluate(() => { const c = __ore.split().host.buildings.find(b => b.kind === 'mothercap'); c.buds = 3; c.queue.length = 0; });
  await until(p, () => __ore.game.buildings.find(b => b.kind === 'mothercap')?.buds === 3, null, 10000);
  const tr = await p.evaluate(() => { const g = __ore.game, cap = g.buildings.find(b => b.team === 2 && b.kind === 'mothercap'); return g.train(cap, 'snapper'); });
  check(tr && await until(p, () => { const c = __ore.split().host.buildings.find(b => b.kind === 'mothercap'); return c.queue.filter(q => q.kind === 'snapper').length === 2 && c.buds === 2; }, null, 20000), 'one Bud becomes a pair of Snappers');
  check(await until(p, () => __ore.split().host.units.filter(u => u.alive && u.kind === 'snapper').length >= 2, null, 30000), 'the pair hatches');
  check(await until(p, () => __ore.game.buildings.find(b => b.kind === 'mothercap')?.buds === __ore.split().host.buildings.find(b => b.kind === 'mothercap')?.buds, null, 20000), 'the player sees the Bud count');
  // jump into a Snapper and bite: the attack crosses to the host
  await until(p, () => __ore.game.units.some(u => u.alive && u.kind === 'snapper' && u.team === 2), null, 20000);   // the hatch is on the host first; wait for the player's copy
  const jumped = await p.evaluate(() => { const g = __ore.game, s = g.units.find(u => u.kind === 'snapper' && u.team === 2); if (!s) return false; g.possess(s, true); return true; });
  check(jumped && await until(p, () => __ore.game.me && __ore.game.me.kind === 'snapper', null, 20000), 'the player can drive a Snapper');
  // research at the Warren
  check(await p.evaluate(() => __ore.game.buyUpgrade('glegs')) && await until(p, () => __ore.split().host.upOf(2).glegs, null, 20000), 'the player can grow Quick Legs at the Warren');
  // a Blister bursts on command and takes nearby Ironhold with it
  const pop = await p.evaluate(() => { const h = __ore.split().host, cap = h.buildings.find(b => b.kind === 'mothercap'), bl = h.spawn('blister', 2, cap.pos.x + 20, cap.pos.z), v = h.spawn('linesman', 0, cap.pos.x + 23, cap.pos.z); bl.pilot = __ore.split().seats[0].pid; v.pilot = 99; h.dir.vs.auto = false; return [bl.id, v.id]; });
  await p.evaluate(([id]) => { const g = __ore.game; return new Promise(r => { let n = 0; const t = setInterval(() => { const u = g.units.find(x => x.id === id); if (u || ++n > 300) { clearInterval(t); if (u) { u.pilot = 0; g.possess(u, true); } r(); } }, 50); }); }, pop);
  await until(p, id => __ore.game.me && __ore.game.me.id === id, pop[0], 20000);
  await p.evaluate(() => { __ore.game.lmb = true; }); await sleep(800); await p.evaluate(() => { __ore.game.lmb = false; });
  check(await until(p, ([bid, vid]) => { const h = __ore.split().host, bl = h.units.find(u => u.id === bid), v = h.units.find(u => u.id === vid); return (!bl || !bl.alive) && (!v || !v.alive || v.hp < v.maxHp); }, pop, 20000), 'a driven Blister bursts and hurts the Linesman next to it');
  check(await until(p, () => __ore.game.me && __ore.game.me.alive && __ore.game.me.kind !== 'blister', null, 30000), 'the player gets a new Gloam body after bursting');
  // the end screen reads from the Gloam point of view
  await p.evaluate(() => { const h = __ore.split().host; for (const b of h.buildings) if (b.team === 0 && b.kind === 'headframe' && b.alive) h.damage(b, 1e6, null); });
  check(await until(p, () => __ore.game.phase === 'over', null, 30000), 'breaking every Headframe ends the match');
  await p.waitForTimeout(600);
  const end = await p.evaluate(() => [__ore.game.won, document.getElementById('endTitle').textContent]);
  check(end[0] === true && /Gloam take/.test(end[1]), 'the Gloam player is told they won');
  await p.close();

  // ---- 2. Ironhold against Gloam bots
  p = await open(page, 'iron');
  await p.evaluate(() => { __ore.setFree(true); document.querySelector('[data-m="skirm"]').click(); document.querySelectorAll('#sides button')[0].click(); document.querySelectorAll('#foes button')[1].click(); document.getElementById('start').click(); });
  await until(p, () => __ore.game.phase === 'play' && __ore.game.me);
  const r = await p.evaluate(() => { const g = __ore.game; g.noRender = true; for (let i = 0; i < 3000; i++) g.update(.05); return { eco: g.eco, caps: g.buildings.filter(b => b.alive && b.team === 2).map(b => b.kind).join(), gloam: g.units.filter(u => u.alive && u.team === 2).length, veyl: g.units.filter(u => u.alive && u.team === 1).length, purse: Math.floor(g.purse[2]), mined: g.stats.minedV, goal: document.getElementById('goal')?.textContent }; });
  console.log(JSON.stringify(r));
  check(r.eco && r.veyl === 0 && /mothercap/.test(r.caps), 'against the Gloam the outpost is a Mother Cap with no Veyl');
  check(r.gloam > 8 && r.mined > 200 && /warren/.test(r.caps), `the Gloam bots dig, root a Warren and ripen a swarm (${r.gloam} bodies, ${r.mined} ore)`);
  await p.close();

  // ---- 3. online: Vex leads the Gloam against Ada's crew
  srv = spawn('node', ['dist/server.mjs'], { env: { ...process.env, PORT: String(PORT), ORE_TRUST_HITS: '1', ORE_WIRE_FOG: '0' /* both screens must agree on the whole world here; fog is tested in test/online */ }, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  await sleep(1200);
  // Two pages drawing at once starve each other under software rendering: a menu alone made the next page load five times slower, and a kick-off could stall long enough to drop the connection. Both hold still until a check needs a picture.
  const A = await open(URL, 'Ada'); await A.evaluate(() => { __ore.hold(true); }); const V = await open(URL, 'Vex'); await V.evaluate(() => { __ore.hold(true); });
  for (const q of [A, V]) await q.evaluate(() => { __ore.setFree(true); __ore.unlock(); });
  await A.click('#mCreate'); await A.waitForFunction(() => document.getElementById('mCodeShow').textContent.length === 5);
  const code = await A.evaluate(() => document.getElementById('mCodeShow').textContent);
  await A.click('#mFoes button:nth-child(2)');
  await V.fill('#mCode', code); await V.click('#mJoinBtn'); await V.waitForFunction(() => !document.getElementById('mLobby').hidden);
  check(await until(V, () => /Gloam/.test(document.getElementById('mSide').textContent), null, 10000), 'the lobby offers the Gloam side once the host picks them');
  await V.click('#mSide'); check(await until(A, () => /The Gloam/.test(document.getElementById('mPlayers').textContent), null, 10000), 'Ada sees Vex on the Gloam side');
  await V.click('#mReady'); await A.waitForFunction(() => !document.getElementById('mStart').disabled); await A.click('#mStart');
  for (const q of [A, V]) { await q.waitForFunction(() => __ore.game.net && __ore.game.me && __ore.game.units.length > 6); await q.evaluate(() => { __ore.hold(false); __ore.game.noRender = true; }); }
  const st = q => q.evaluate(() => { const g = __ore.game; return { team: g.me && g.me.team, kind: g.me && g.me.kind, my: g.myTeam, eco: g.eco, caps: g.buildings.filter(b => b.alive && b.kind === 'mothercap').length, bloom: g.carpet.patches.length, purse: g.purse[2] }; });
  const a = await st(A), v = await st(V);
  console.log(JSON.stringify({ a, v }));
  check(a.team === 0 && v.team === 2 && v.my === 2 && v.kind === 'grazer', 'Ada is Ironhold and Vex is a Gloam Grazer');
  check(a.caps === 1 && v.caps === 1 && a.bloom >= 1 && v.bloom >= 1, 'both screens see the Mother Cap and its Bloom');
  check(await until(V, () => __ore.game.purse[2] > 110, null, 60000), 'the Gloam purse reaches Vex');
  // Vex roots a Spore Sac: refused off the Bloom, taken on it
  const spot = await V.evaluate(() => { const g = __ore.game, cap = g.buildings.find(b => b.kind === 'mothercap'); for (let r = 8; r < 18; r++) for (let k = 0; k < 20; k++) { const a = k / 20 * 6.283, x = Math.round(cap.pos.x + Math.cos(a) * r), z = Math.round(cap.pos.z + Math.sin(a) * r); if (g.canPlace('sporesac', x, z, false, 2)) { g.place('sporesac', x, z, false, 2); return [x, z]; } } return null; });
  check(!!spot && await until(A, () => __ore.game.buildings.some(b => b.alive && b.kind === 'sporesac'), null, 20000), 'Vex roots a Spore Sac and Ada sees it');
  check(await until(V, () => __ore.game.buildings.find(b => b.kind === 'mothercap')?.buds >= 1, null, 20000), 'Vex sees ripe Buds on the Mother Cap');
  const tr2 = await V.evaluate(() => { const g = __ore.game, cap = g.buildings.find(b => b.kind === 'mothercap'); return g.train(cap, 'grazer'); });
  check(tr2 && await until(A, () => __ore.game.units.filter(u => u.alive && u.kind === 'grazer').length >= 6, null, 30000), 'Vex ripens a Grazer from a Bud');
  if (/Error|TypeError/.test(log)) { console.log(log.slice(-1500)); check(false, 'server ran without errors'); } else check(true, 'server ran without errors');
} finally { await b.close(); if (srv) srv.kill(); }
if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); } else console.log('\nall passed');
