// A scripted player that uses the real first-person controls. Usage: node bot.cjs <mode> <diff> [map]
const { chromium } = require('playwright');
(async () => {
  const [mode, d, map] = [process.argv[2], +(process.argv[3] || 1), +(process.argv[4] || 0)];
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(900000);
  p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300)));
  await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'dist', 'index.html')).href); await p.waitForFunction('window.__ore && __ore.game');
  await p.evaluate(([mode, d, map]) => { __ore.setFree(true); __ore.pickMap(map); document.querySelectorAll('#diff button')[d].click(); __ore.start(); const g = __ore.game; g.noRender = true; g.introT = 0;
    const S = window.S = { deaths: 0, lastMe: null, stuck: 0, px: 0, pz: 0, strafe: 0, dealt: 0 };
    window.step = () => { const me = g.me; g.keys.clear(); g.lmb = false; g.rmb = false; if (g.phase === 'card') return; if (!me || !me.alive || g.staticT > 0) { if (S.lastMe) { S.deaths++; S.lastMe = null; } return; } S.lastMe = me;
      const want = mode === 'rigger' ? 'rigger' : mode === 'longshot' ? 'longshot' : mode === 'gantry' ? 'gantry' : 'linesman';
      if (mode === 'afk') return;
      if (mode === 'longshot' && g.time > 240 && !g.own('longshot').length) g.spawn('longshot', 0, 10, 10);
      if (me.kind !== want) { const u = g.own(want).filter(x => x !== me && !x.pilot)[0]; if (u && g.jumpCd <= 0) g.possess(u); if (g.me.kind !== want) return; }
      const m = g.me, foes = g.units.filter(u => u.alive && u.team === 1), near = foes.map(u => [Math.hypot(u.pos.x - m.pos.x, u.pos.z - m.pos.z), u]).sort((a, b) => a[0] - b[0])[0];
      const bl = g.buildings.filter(x => x.alive && x.team === 1), pri = k => k === 'wardpylon' ? 0 : k === 'thornspire' ? 1 : k === 'choir' ? 2 : 3;
      const tb = bl.map(x => [pri(mode === 'rigger' || mode === 'longshot' ? (x.kind === 'choir' ? 'wardpylon' : 'reedgate') : x.kind) * 1000 + Math.hypot(x.pos.x - m.pos.x, x.pos.z - m.pos.z), x]).sort((a, b) => a[0] - b[0])[0];
      const range = mode === 'rigger' ? 2.2 : mode === 'longshot' ? 95 : mode === 'gantry' ? 30 : 38;
      let T = null, ty = 1.2, tr = range; if (near && near[0] < (mode === 'longshot' ? 60 : 40) && mode !== 'rigger') { T = near[1]; ty = 1.5; } else if (tb) { T = tb[1]; ty = Math.min(3, T.h * .5); if (mode === 'rigger') tr = Math.max(T.hx, T.hz) + 1.6; }
      if (mode === 'squad') { if (g.dir.callout) g.pressed.add('KeyZ'); const push = g.dir.plan && g.dir.plan.phase === 'go'; if (!push) { T = near && near[0] < 50 ? near[1] : null; ty = 1.5; if (!T) { const hx = 12 - m.pos.x, hz = 12 - m.pos.z; if (Math.hypot(hx, hz) > 4) { g.yaw = Math.atan2(hx, hz); g.pitch = 0; g.keys.add('KeyW'); } return; } } }
      if (!T) return; const dx = T.pos.x - m.pos.x, dz = T.pos.z - m.pos.z, dist = Math.hypot(dx, dz);
      // walk the road until close, then go straight at it
      let gx = T.pos.x, gz = T.pos.z; if (dist > 45 && Math.abs(m.pos.z - 14) > 6 && m.pos.x < 100) { gx = m.pos.x + 12; gz = 14; }
      const inR = dist <= tr; const mx = inR ? dx : gx - m.pos.x, mz = inR ? dz : gz - m.pos.z;
      g.yaw = Math.atan2(inR ? dx : mx, inR ? dz : mz); g.pitch = inR ? Math.atan2(ty - 1.55, dist) : 0;
      if (!inR) { g.keys.add('KeyW'); if (dist > 60) g.keys.add('ShiftLeft'); if (Math.hypot(m.pos.x - S.px, m.pos.z - S.pz) < .02) S.stuck++; else S.stuck = 0; if (S.stuck > 20) { S.strafe = 25; S.stuck = 0; } if (S.strafe > 0) { S.strafe--; g.keys.add('KeyA'); } }
      else { if (mode === 'longshot') g.rmb = true; g.lmb = true; g.pressed.add('Mouse0'); }
      S.px = m.pos.x; S.pz = m.pos.z; };
  }, [mode, d, map]);
  for (let i = 0; i < 70; i++) {
    const r = await p.evaluate(() => { const g = __ore.game; for (let k = 0; k < 600 && (g.phase === 'play' || g.phase === 'card'); k++) { step(); g.update(.05); } const m = g.me; return { t: Math.round(g.time), phase: g.phase, won: g.won, kind: m && m.kind, at: m ? [Math.round(m.pos.x), Math.round(m.pos.z)] : 0, hp: m ? Math.round(m.hp) : 0, deaths: S.deaths, army: g.soldiers().length, stones: g.stones().length, vb: g.buildings.filter(x => x.alive && x.team === 1).length, ve: g.units.filter(u => u.alive && u.team === 1).length, kills: g.stats.kills }; });
    if (i % 3 === 2 || r.phase === 'over') console.log(`  ${r.t}s ${r.kind} at ${r.at} hp ${r.hp} deaths ${r.deaths} army ${r.army} veyl ${r.ve} veyl buildings ${r.vb} stones ${r.stones} kills ${r.kills}`);
    if (r.phase === 'over') { console.log(`BOT ${mode} DIFF ${d} MAP ${map}: ${r.won ? 'WON' : 'LOST'} at ${r.t}s, deaths ${r.deaths}`); break; }
    if (i === 69) console.log(`BOT ${mode} DIFF ${d}: UNFINISHED at ${r.t}s`);
  }
  await b.close();
})();
