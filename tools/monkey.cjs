// Mashes every control at random in each mode and watches for crashes and broken game state.
// Usage: node tools/monkey.cjs [seconds of game time per run, default 240] [only one scenario name]
// Scenarios: sp-<map>-<diff> (map 0 to 2, or 10 to 12 Small and 20 to 22 Large), job-<n>, split-coop, split-vs. Exits non-zero if anything went wrong.
const { chromium } = require('playwright');
const SECS = +(process.argv[2] || 240), ONLY = process.argv[3] || '';
const SCEN = [];
for (const m of [0, 1, 2]) for (const d of [0, 1, 2]) SCEN.push({ name: `sp-${m}-${d}`, kind: 'sp', map: m, diff: d });
// the bigger and smaller sizes (map numbers 10 to 12 are Small, 20 to 22 Large)
for (const [m, d] of [[10, 1], [11, 2], [20, 1], [21, 0], [22, 1]]) SCEN.push({ name: `sp-${m}-${d}`, kind: 'sp', map: m, diff: d });
for (let j = 0; j < 5; j++) SCEN.push({ name: `job-${j + 1}`, kind: 'job', job: j });
SCEN.push({ name: 'split-coop', kind: 'split', vs: false }, { name: 'split-vs', kind: 'split', vs: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  let failed = 0;
  for (const sc of SCEN.filter(s => !ONLY || s.name === ONLY)) {
    const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(900000); const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 300) + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ').slice(0, 300)));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
    await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'dist', 'index.html')).href); await p.waitForFunction('window.__ore && __ore.game');
    await p.evaluate(sc => {
      __ore.setFree(true);
      if (sc.kind === 'sp') { __ore.pickMap(sc.map % 10); __ore.pickSize(Math.floor(sc.map / 10)); document.querySelectorAll('#diff button')[sc.diff].click(); __ore.start(); }
      else if (sc.kind === 'job') { __ore.pickJob(sc.job); __ore.start(); }
      else { document.querySelectorAll('#diff button')[1].click(); __ore.startSplit(sc.vs); }
      const KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'Space', 'KeyF', 'KeyQ', 'KeyE', 'KeyR', 'KeyC', 'Digit1', 'Digit2', 'Digit3', 'KeyG', 'KeyZ', 'KeyX', 'KeyV', 'KeyB', 'KeyT', 'KeyY', 'KeyU', 'Mouse0', 'Mouse1', 'Mouse2'];
      const bad = window.bad = {}, note = k => { bad[k] = (bad[k] || 0) + 1; };
      // the middle of the map: halfway between the yard and the Veyl outpost
      const vb = (__ore.split() ? __ore.split().host : __ore.game).buildings.filter(x => x.team === 1), MID = [vb.reduce((a, x) => a + x.pos.x, 0) / vb.length / 2, vb.reduce((a, x) => a + x.pos.z, 0) / vb.length / 2];
      const monkey = g => {
        if (!g || g.phase === 'over') return; if (g.phase === 'card') g.phase = 'play'; g.noRender = true;
        if (Math.random() < .25) { g.keys.clear(); for (let i = 0; i < 3; i++) { const k = KEYS[Math.floor(Math.random() * 6)]; g.keys.add(k); } }
        if (Math.random() < .08) { const k = KEYS[Math.floor(Math.random() * KEYS.length)]; g.pressed.add(k); if (k === 'Mouse0') g.lmb = true; if (k === 'Mouse2') g.rmb = true; }
        if (Math.random() < .05) g.lmb = !g.lmb; if (Math.random() < .03) g.rmb = !g.rmb;
        if (Math.random() < .02) g.keys.add('Tab'); else if (Math.random() < .05) g.keys.delete('Tab');
        if (Math.random() < .03) g.wheel = Math.random() < .5 ? 1 : -1;
        g.mdx += (Math.random() - .5) * 60; g.mdy += (Math.random() - .5) * 20; if (Math.abs(g.pitch) > .6) g.mdy += g.pitch * 40;
        // Steer toward the enemy now and then so the fighting actually happens.
        if (g.me && Math.random() < .01) { const f = g.units.find(u => u.alive && u.team !== g.myTeam); if (f) g.yaw = Math.atan2(f.pos.x - g.me.pos.x, f.pos.z - g.me.pos.z); }
      };
      const check = (g, tag) => {
        if (!g) return;
        for (const u of g.units) { if (!u.alive) continue; if (!isFinite(u.pos.x + u.pos.z + u.hp + u.yaw + u.pitch)) note(tag + 'nan ' + u.kind); if (Math.hypot(u.pos.x - MID[0], u.pos.z - MID[1]) > 212 * [1, .75, 1.4][Math.floor((__ore.split() ? __ore.split().host : __ore.game).mapI / 10)]) note(tag + 'oob ' + u.kind); if (u.hp > u.maxHp + .01) note(tag + 'hp>max ' + u.kind); if (u.shield > u.maxShield + .01 || u.shield < -.01) note(tag + 'shield ' + u.kind); }
        for (const x of g.buildings) { if (!x.alive) continue; if (!isFinite(x.hp)) note(tag + 'nan bld'); if (x.hp > x.maxHp + .01) note(tag + 'bld hp>max ' + x.kind); }
        if (!isFinite(g.ore) || g.ore < -.01) note(tag + 'ore ' + g.ore);
        if (g.me && !g.units.includes(g.me) && g.staticT <= 0 && g.phase === 'play') note(tag + 'me missing');
        const ids = new Set(); for (const u of g.units) { if (ids.has(u.id)) note(tag + 'dup id'); ids.add(u.id); }
        if (!isFinite(g.cam.fov) || !isFinite(g.yaw + g.pitch)) note(tag + 'nan view');
      };
      window.run = n => {
        const sp = __ore.split && __ore.split(), g1 = __ore.game, g2 = __ore.game2 && __ore.game2();
        for (let k = 0; k < n; k++) {
          monkey(g1); monkey(g2);
          if (sp) { sp.host.noRender = true; sp.frame(1 / 30); g1.update(1 / 30); g2.update(1 / 30); } else g1.update(1 / 30);
          if (k % 30 === 0) { check(g1, ''); check(g2, 'p2 '); if (sp) { check(sp.host, 'host ');
            // replicas should hold the same world as the match
            const hu = sp.host.units.filter(u => u.alive).length; if (sp.host.time > 2) for (const g of [g1, g2]) if (Math.abs(g.units.length - hu) > 8) note('replica units ' + g.units.length + ' vs ' + hu);
            if (Math.abs(g1.ore - Math.floor(sp.host.ore)) > 60) note('replica ore');
            for (const s of sp.seats) if (s.inbox.length > 40) note('seat inbox ' + s.inbox.length); } }
          if (g1.phase === 'over') break;
        }
        const h = sp ? sp.host : g1;
        return { t: Math.round(h.time), phase: g1.phase, won: g1.won, units: h.units.length, stones: h.stones().length, hq: h.ownB('headframe').length, me: g1.me && g1.me.kind, me2: g2 && g2.me && g2.me.kind };
      };
    }, sc);
    let r; const steps = Math.ceil(SECS * 30 / 900);
    for (let i = 0; i < steps; i++) { r = await p.evaluate(() => run(900)); if (r.phase === 'over') break; }
    const bad = await p.evaluate(() => window.bad); const n = Object.keys(bad).length + errs.length; if (n) failed++;
    console.log(`${n ? 'FAIL' : 'ok  '} ${sc.name.padEnd(11)} ${r.t}s ${r.phase}${r.phase === 'over' ? (r.won ? ' won' : ' lost') : ''} units ${r.units} stones ${r.stones} hq ${r.hq} body ${r.me}${r.me2 ? '/' + r.me2 : ''} ${JSON.stringify(bad)}`);
    for (const e of [...new Set(errs)].slice(0, 6)) console.log('   ', e);
    await p.close();
  }
  await b.close(); process.exit(failed ? 1 : 0);
})();
