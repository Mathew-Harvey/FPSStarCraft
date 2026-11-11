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

  // 1b. Hand drilling fills the Rigger's pack, which only counts once it is walked to the Headframe.
  const pack = await p.evaluate(() => {
    __ore.pickMap(0); __ore.start(); const g = __ore.game; g.noRender = true; g.introT = 0; g.dir.auto = false; const me = g.me, n = g.ores[0]; for (const u of g.own('rigger')) if (u !== me) u.alive = false; g.update(1 / 30); const ore0 = g.ore;
    me.pos.set(n.pos.x - 3, 0, n.pos.z); const drill = secs => { for (let i = 0; i < secs * 30; i++) { if (g.phase === 'card') g.phase = 'play'; g.tool = 1; g.yaw = Math.atan2(n.pos.x - me.pos.x, n.pos.z - me.pos.z); g.pitch = Math.atan2(-.5, Math.hypot(n.pos.x - me.pos.x, n.pos.z - me.pos.z)); g.lmb = true; g.update(1 / 30); } };
    drill(12); const held = me.carrying, bank0 = g.ore - ore0;
    me.pos.set(0, 0, 7); g.lmb = false; for (let i = 0; i < 10; i++) g.update(1 / 30);
    return { held, cap: g.packCap(), bank0, banked: g.ore - ore0, after: me.carrying };
  });
  check(pack.held === pack.cap && pack.bank0 === 0, `twelve seconds on the drill fills the pack and stops (${pack.held} of ${pack.cap}), with nothing banked yet`);
  check(pack.banked === pack.cap && pack.after === 0, `walking the pack to the Headframe banks it (${pack.banked} ore)`);

  // 1c. A drilled-out seam settles and comes back, so a long shift does not run dry for good.
  const seam = await p.evaluate(() => { const g = __ore.game, n = g.ores[1]; n.amount = 0; g.oreCheck(n); ff(160); return { back: n.amount, max: n.max }; });
  check(seam.back > 0 && seam.back < seam.max, `an empty seam comes back after a while (${seam.back} of ${seam.max})`);

  // 1d. A push that dies on their doorstep makes the next muster bigger.
  const muster = await p.evaluate(() => {
    const g = __ore.game, d = g.dir; for (const u of g.soldiers()) u.alive = false; d.plan = null; d.callout = null; d.raidIn = 999; d.raidLive = false; d.warned = false;
    for (let i = 0; i < 7; i++) { const u = g.spawn('linesman', 0, 6 + i, 14); u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; }
    d.fails = 0; d.nextPlan = 0; d.squad(.1); const first = !!d.plan; d.plan = null; d.callout = null;
    d.fails = 1; d.nextPlan = 0; d.squad(.1); const after = !!d.plan; d.plan = null; d.callout = null;
    for (let i = 0; i < 1; i++) { const u = g.spawn('linesman', 0, 6 + i, 17); u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; } d.nextPlan = 0; d.squad(.1); const bigger = !!d.plan; __ore.quit(); return { first, after, bigger };
  });
  check(muster.first && !muster.after && muster.bigger, 'after a failed push the squad waits for two more before it pitches again');

  // 10. Maps: sizes, ore fields for new bases, a second Headframe, and the undiscovered map.
  const maps = await p.evaluate(() => {
    const out = {}; for (const [size, name] of [[1, 'small'], [0, 'medium'], [2, 'large']]) { __ore.pickMap(0); __ore.pickSize(size); __ore.start(); const g = __ore.game; out[name] = { fields: g.ores.length, out: Math.round(Math.hypot(g.stones()[0].pos.x, g.stones()[0].pos.z)) }; }
    __ore.pickMap(0); __ore.pickSize(0); __ore.start(); const g = __ore.game; g.noRender = true; g.introT = 0; g.dir.auto = false; g.fog.update(g, 1, true);
    const st = g.stones()[0], far = g.ores.filter(n => g.stones().every(t => Math.hypot(n.pos.x - t.pos.x, n.pos.z - t.pos.z) > 60)).pop();   // the Veyl home seams sit behind the outpost
    const fog = { yard: g.fog.sees(0, 0), outpost: g.fog.seen(st.pos.x, st.pos.z), field: g.fog.seen(far.pos.x, far.pos.z) };
    // a second Headframe out on a field: Riggers bank there, and losing the first one is not the end
    const [sx, sz] = [far.pos.x, far.pos.z], l = Math.hypot(sx, sz), at = g.dir.freeSpot('headframe', Math.round(sx - sx / l * 14), Math.round(sz - sz / l * 14)) || [0, 30], [hx, hz] = at; g.ore = 1000;
    const can = g.unlocked('headframe') && g.canPlace('headframe', hx, hz, false); const h2 = g.place('headframe', hx, hz, false); h2.progress = 1; ff(1);
    const r = g.spawn('rigger', 0, sx + 3, sz); r.state = 'toHQ'; r.carrying = 7; const ore0 = g.ore; ff(6); const banked = g.ore - ore0;
    g.fog.update(g, 1, true); const seenNow = g.fog.seen(far.pos.x, far.pos.z);
    const home = g.ownB('headframe').find(b => b !== h2); g.damage(home, 1e6, null); ff(4); const after = g.phase;
    __ore.quit(); return { out, fog, can, banked, seenNow, after };
  });
  check(maps.out.small.fields < maps.out.medium.fields && maps.out.medium.fields < maps.out.large.fields && maps.out.small.out < maps.out.medium.out && maps.out.medium.out < maps.out.large.out, `small, medium and large maps grow in size and ore fields (${['small', 'medium', 'large'].map(k => maps.out[k].fields + ' seams, ' + maps.out[k].out + 'm').join(' / ')})`);
  check(maps.fog.yard && !maps.fog.outpost && !maps.fog.field, 'the map starts undiscovered: the yard is in sight, the outpost and the far fields are not');
  check(maps.can && maps.banked >= 7, `a second Headframe can go up on a far field and Riggers bank there (${maps.banked} ore)`);
  check(maps.seenNow, 'a base on a far field lights up the map around it');
  check(maps.after !== 'over', 'losing the first Headframe is not the end while another stands');

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
    body.pos.x = node.pos.x + 3; body.pos.z = node.pos.z; body.carrying = 0; for (let i = 0; i < 60; i++) g.net.cmd('mn', n, 3); g.net.flush(null); ff(.05);
    const mined = body.carrying; body.carrying = 0;
    const x = Math.round(body.pos.x) + 8, z = Math.round(body.pos.z) + 8; h.ore += 300; const b = h.addBuilding('depot', 0, x, z, false); body.pos.x = x - 5; body.pos.z = z;
    for (let i = 0; i < 60; i++) g.net.cmd('wd', b.id, .6); g.net.flush(null); h.units.forEach(u => { if (u.kind === 'rigger') u.site = null; }); b.builder = body; ff(.05);
    return { mined, progress: b.progress, far: (() => { body.carrying = 0; const far = h.ores.findIndex(o => o.amount > 0 && o.pos.distanceTo(body.pos) > 30); for (let i = 0; i < 5; i++) g.net.cmd('mn', far, 3); g.net.flush(null); ff(.05); return body.carrying; })() };
  });
  check(cheat.mined <= 13, `sixty drill claims in one go put at most a few seconds of drilling in the pack (${cheat.mined} ore)`);
  check(cheat.far === 0, 'drilling a seam from across the map gets nothing');
  check(cheat.progress < .3, `sixty weld claims do not finish a Depot (${Math.round(cheat.progress * 100)}%)`);

  // 5. Split screen versus: the Veyl player's kills count, and the Veyl HUD has no squad orders or broken objectives.
  await p.evaluate(() => __ore.startSplit(true)); await p.waitForFunction(() => __ore.game2() && __ore.game2().me && __ore.game2().myTeam === 1);
  const vs = await p.evaluate(() => {
    const h = __ore.split().host, c = __ore.game2(), body = h.units.find(u => u.alive && u.pilot === 2), victim = h.spawn('rigger', 0, body.pos.x + 1, body.pos.z);
    h.damage(victim, 9999, body); ff(1);
    for (let i = 0; i < 3; i++) h.spawn('linesman', 0, 4 + i, 12); ff(1);
    c.noRender = false; c.update(1 / 30); c.noRender = true;
    const objs = c.dir.objectives();
    return { kills: h.score[2][0], objs: objs.length, eco: h.eco };
  });
  check(vs.kills >= 1, `the Veyl player's kills reach the scoreboard (${vs.kills})`);
  check(vs.eco && vs.objs > 0, 'versus runs the Veyl economy and the Veyl player has objectives of their own');

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
