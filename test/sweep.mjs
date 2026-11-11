// Checks for the bugs found in the November bug sweep. One browser, no server: single player and split screen.
// The split screen match runs the same server code (serverCmd) as an online match, so the server checks hold online too.
// Run with: npm run build && node test/sweep.mjs [path to index.html]
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const page = pathToFileURL(process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.html')).href;
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
try {
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.setDefaultTimeout(300000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  // Fast-forwards a single player shift, or a split screen match and both halves.
  await p.evaluate(() => {
    __ore.setFree(true);
    window.ff = (secs, each) => { const sp = __ore.split(), a = __ore.game, c = __ore.game2(); for (let i = 0; i < secs * 30; i++) { for (const g of [a, c]) if (g) { g.noRender = true; if (g.phase === 'card') g.phase = 'play'; } if (each) each(); if (sp) { sp.host.noRender = true; sp.frame(1 / 30); a.update(1 / 30); c.update(1 / 30); } else a.update(1 / 30); if (a.phase === 'over') break; } };
  });

  // 1. A building on the Quartermaster's planned spot no longer stops the whole build order.
  const qm = await p.evaluate(() => {
    __ore.pickMap(0); document.querySelectorAll('#diff button')[0].click(); __ore.start(); const g = __ore.game; g.noRender = true; g.introT = 0; g.ore = 400;
    g.place('depot', 15, 8, false); ff(200);
    return { bunk: g.ownB('bunkhouse').length, depotAt: g.ownB('depot').some(b => b.pos.x === 15 && b.pos.z === 8) };
  });
  check(qm.depotAt && qm.bunk > 0, 'the Quartermaster finds another spot when the player built on his Bunkhouse spot');

  // 2. Split screen co-op: a site placed next to a player's Rigger still gets built by the crew.
  await p.evaluate(() => { document.querySelectorAll('#diff button')[0].click(); __ore.startSplit(false); }); await p.waitForFunction(() => __ore.game.me && __ore.game2() && __ore.game2().me);
  const site = await p.evaluate(() => {
    const h = __ore.split().host, g = __ore.game, me = h.units.find(u => u.id === g.me.id); h.ore = 1000;
    // every other Rigger is out at the far seam, so the player's body is the nearest one to the new site
    for (const u of h.units) if (u.alive && u.kind === 'rigger' && !u.pilot) { u.pos.x = -60 + Math.random() * 4; u.pos.z = -40; }
    // Park player one's Rigger right beside the spot, as a player who has just staked it out would be.
    const x = Math.round(me.pos.x) + 5, z = Math.round(me.pos.z); let at = null;
    for (let dx = 0; dx < 30 && !at; dx += 2) for (let dz = -10; dz <= 10 && !at; dz += 2) if (h.canPlace('depot', x + dx, z + dz, false) && Math.hypot(x + dx, z + dz) > 10) at = [x + dx, z + dz];
    g.net.cmd('pl', 'depot', at[0], at[1], 0); ff(1);
    const b = h.ownB('depot').find(q => q.pos.x === at[0] && q.pos.z === at[1]); if (!b) return { placed: false };
    ff(40, () => { g.keys.clear(); g.lmb = false; }); return { placed: true, built: b.built, progress: b.progress, builderIsPlayer: !!(b.builder && b.builder.pilot) };
  });
  check(site.placed && site.built, `a building staked out by a player gets finished by the crew (progress ${Math.round((site.progress || 0) * 100)}%${site.builderIsPlayer ? ', builder was the player' : ''})`);

  // 3. Split screen co-op: the squad follows player two, and keeps following after player two's body dies.
  const follow = await p.evaluate(() => {
    const h = __ore.split().host, c = __ore.game2(); for (let i = 0; i < 5; i++) h.spawn('linesman', 0, 20 + i, 14); ff(1);
    // put player two in a Linesman and call the squad onto them
    const lm = h.units.find(u => u.alive && u.kind === 'linesman' && !u.pilot); c.jumpCd = 0; c.possess(c.units.find(u => u.id === lm.id)); ff(1);
    c.pressed.add('KeyV'); ff(1);
    const body = h.units.find(u => u.alive && u.pilot === 2), squad = h.soldiers().filter(u => !u.pilot);
    const followed = squad.filter(u => u.order.type === 'follow' && u.order.lead === body).length;
    h.damage(body, 9999, null); ff(5, () => { c.keys.clear(); });
    const nb = h.units.find(u => u.alive && u.pilot === 2); if (!nb) return { followed, moved: -1 };
    ff(3, () => c.keys.clear()); const rest = squad.filter(u => u.alive && u !== nb);
    return { followed, n: rest.length, moved: rest.filter(u => u.order.type === 'follow' && u.order.lead === nb).length };
  });
  check(follow.followed >= 3, `V puts the squad on player two (${follow.followed} following)`);
  check(follow.moved >= 2, `after player two's body dies, the squad follows the new body (${follow.moved} of ${follow.n})`);

  // 3b. A title card for a new kind of body does not freeze an online world.
  const card = await p.evaluate(() => {
    const h = __ore.split().host, c = __ore.game2(), b = h.spawn('breacher', 0, 6, 14); ff(1);
    c.seenKinds.delete('breacher'); c.jumpCd = 0; c.possess(c.units.find(u => u.id === b.id)); const t0 = c.time, ph = c.phase;
    // run the halves without the fast-forward helper, which skips title cards
    for (let i = 0; i < 20; i++) { h.noRender = true; __ore.split().frame(1 / 30); __ore.game.update(1 / 30); c.update(1 / 30); }
    return { ph, moved: c.time - t0 };
  });
  check(card.ph === 'card' && card.moved > .3, `the world keeps moving under a title card online (${card.moved.toFixed(2)}s passed)`);

  // 4. Doctored commands: the match caps ore, welding and the Patch pulse however many times they are claimed.
  const cheat = await p.evaluate(() => {
    const h = __ore.split().host, g = __ore.game, me = h.units.find(u => u.id === g.me.id); if (me.kind !== 'rigger') { const r = h.units.find(u => u.alive && u.kind === 'rigger' && !u.pilot); g.jumpCd = 0; g.possess(g.units.find(u => u.id === r.id)); ff(1); }
    const body = h.units.find(u => u.alive && u.pilot === 1), n = h.ores.reduce((a, o, i) => (o.amount > 0 && (a < 0 || o.pos.distanceTo(body.pos) < h.ores[a].pos.distanceTo(body.pos)) ? i : a), -1), node = h.ores[n];
    body.pos.x = node.pos.x + 3; body.pos.z = node.pos.z; const quiet = () => h.units.forEach(u => { if (u.kind === 'rigger' && !u.pilot) u.carrying = 0; }); quiet(); const ore0 = h.ore; for (let i = 0; i < 60; i++) g.net.cmd('mn', n, 3); g.net.flush(null); ff(.05);
    const mined = h.ore - ore0;
    const x = Math.round(body.pos.x) + 8, z = Math.round(body.pos.z) + 8; h.ore += 300; const b = h.addBuilding('depot', 0, x, z, false); body.pos.x = x - 5; body.pos.z = z;
    for (let i = 0; i < 60; i++) g.net.cmd('wd', b.id, .6); g.net.flush(null); h.units.forEach(u => { if (u.kind === 'rigger') u.site = null; }); b.builder = body; ff(.05);
    return { mined, progress: b.progress, far: (() => { quiet(); const o0 = h.ore, far = h.ores.findIndex(o => o.amount > 0 && o.pos.distanceTo(body.pos) > 30); for (let i = 0; i < 5; i++) g.net.cmd('mn', far, 3); g.net.flush(null); ff(.05); return h.ore - o0; })() };
  });
  check(cheat.mined <= 13, `sixty drill claims in one go bank at most a few seconds of drilling (${cheat.mined} ore)`);
  check(cheat.far === 0, 'drilling a seam from across the map banks nothing');
  check(cheat.progress < .3, `sixty weld claims do not finish a Depot (${Math.round(cheat.progress * 100)}%)`);

  // 5. Split screen versus: the Veyl player's kills count, and the Veyl HUD has no squad orders or broken objectives.
  await p.evaluate(() => __ore.startSplit(true)); await p.waitForFunction(() => __ore.game2() && __ore.game2().me && __ore.game2().myTeam === 1);
  const vs = await p.evaluate(() => {
    const h = __ore.split().host, c = __ore.game2(), body = h.units.find(u => u.alive && u.pilot === 2), victim = h.spawn('rigger', 0, body.pos.x + 1, body.pos.z);
    h.damage(victim, 9999, body); ff(1);
    for (let i = 0; i < 3; i++) h.spawn('linesman', 0, 4 + i, 12); ff(1);
    c.noRender = false; c.update(1 / 30); c.noRender = true; const hint = document.querySelector('.hud.p2 #hint').textContent;
    const early = h.dir.raidIn; c.pressed.add('KeyG'); ff(1); const refused = h.dir.raidIn > early - 3 && c.raidCall <= 0;
    h.time = Math.max(h.time, 125); ff(1); c.pressed.add('KeyG'); ff(1); const called = h.dir.raidIn <= 6 || h.dir.raidLive; ff(95, () => c.keys.clear());
    const objs = c.dir.objectives();
    return { kills: h.score[2][0], squadHint: /Squad on me|Send squad/.test(hint), called: objs[1].done, refused, accepted: called };
  });
  check(vs.kills >= 1, `the Veyl player's kills reach the scoreboard (${vs.kills})`);
  check(!vs.squadHint, 'the Veyl player is not offered squad orders they cannot give');
  check(vs.refused, 'the Veyl player cannot call a raid in the opening two minutes');
  check(vs.accepted, 'after two minutes the Veyl player can call the raid');
  check(vs.called, 'the "call a raid" objective stays ticked after the cooldown');

  // 6. The pause screen has a way out of a running shift.
  const quit = await p.evaluate(() => { const q = document.getElementById('quit'); if (!q) return 'no button'; document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); q.click(); return { split: !!__ore.split(), menu: !document.getElementById('menu').hidden }; });
  check(quit.menu && !quit.split, 'Quit on the pause screen ends the split screen match and opens the menu');
  // 8. Pausing during a title card does not leave the card stuck on screen.
  const tc = await p.evaluate(() => { __ore.pickMap(0); __ore.start(); const g = __ore.game; g.introT = 0; const u = g.spawn('linesman', 0, 4, 4); g.jumpCd = 0; g.possess(u); const was = g.phase;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); document.getElementById('resume').click(); g.update(1 / 30);
    const shown = !document.getElementById('tcard').hidden; __ore.quit(); return { was, shown }; });
  check(tc.was === 'card' && !tc.shown, 'pausing during a title card clears the card');

  // 7. Starting shift after shift does not pile up old worlds on the graphics card.
  const geo = await p.evaluate(async () => { const n = []; for (let i = 0; i < 4; i++) { __ore.pickMap(i % 3); __ore.start(); __ore.game.update(1 / 30); n.push(__ore.pipe.renderer.info.memory.geometries); __ore.quit(); } return n; });
  check(geo[3] < geo[0] + 40, `restarting shifts frees the old world (${geo.join(', ')} meshes on the card)`);

} catch (e) { console.log('ERROR', e); fail.push('exception'); }
await b.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall sweep checks passed'); process.exit(fail.length ? 1 : 0);
