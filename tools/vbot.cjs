// A scripted Veyl player on the real first-person controls, against the Ironhold bots. Usage: node tools/vbot.cjs <mode> <diff> [map] [minutes]
// Modes: afk (hands off, the Conductor runs everything), hum (stays a Tender and hums ore by hand), fight (drives a fighter at the yard and says yes to every push),
// squad (fights, but only with the squad: says yes to pitches and follows the march).
const { chromium } = require('playwright');
(async () => {
  const [mode, d, map, mins] = [process.argv[2] || 'fight', +(process.argv[3] || 1), +(process.argv[4] || 0), +(process.argv[5] || 30)];
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(900000);
  p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300), (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'dist', 'index.html')).href); await p.waitForFunction('window.__ore && __ore.game');
  await p.evaluate(([mode, d, map]) => { window.__wait = true; __ore.setFree(true); __ore.pickMap(map % 10); __ore.pickSize(Math.floor(map / 10)); document.querySelectorAll('#diff button')[d].click(); __ore.startVeyl();
    const sp = __ore.split(), g = __ore.game, h = sp.host; g.noRender = true; h.noRender = true; g.introT = 0;
    const S = window.S = { deaths: 0, lastMe: null, stuck: 0, px: 0, pz: 0, strafe: 0, hummed: 0, trips: 0, carry: 0, said: [] };
    const of = g.feed.bind(g); g.feed = (w, m, c) => { if (/Conductor|Chorus Lead|Watcher|Signal/.test(w)) S.said.push(Math.round(g.time) + ' ' + w + ': ' + m.replace(/<[^>]+>/g, '')); return of(w, m, c); };
    const go = (tx, tz, run) => { const m = g.me, dx = tx - m.pos.x, dz = tz - m.pos.z; g.yaw = Math.atan2(dx, dz); g.pitch = 0; g.keys.add('KeyW'); if (run) g.keys.add('ShiftLeft');
      if (Math.hypot(m.pos.x - S.px, m.pos.z - S.pz) < .02) S.stuck++; else S.stuck = 0; if (S.stuck > 20) { S.strafe = 25; S.stuck = 0; } if (S.strafe > 0) { S.strafe--; g.keys.add('KeyA'); } S.px = m.pos.x; S.pz = m.pos.z; };
    window.step = () => { const me = g.me; g.keys.clear(); g.lmb = false; g.rmb = false; if (g.phase === 'card') g.phase = 'play';
      if (!me || !me.alive || g.staticT > 0) { if (S.lastMe) { S.deaths++; S.lastMe = null; } return; } S.lastMe = me;
      if (mode === 'afk') return;
      const D = g.dir.side(1); if (D.callout && (mode === 'fight' || mode === 'squad')) g.pressed.add('KeyZ');
      if (mode === 'hum') {
        if (me.kind !== 'tender') { const u = g.units.find(x => x.alive && x.team === 1 && x.kind === 'tender' && !x.pilot); if (u && g.jumpCd <= 0) g.possess(u); return; }
        if (me.carrying !== S.carry) { if (me.carrying > S.carry) S.hummed += me.carrying - S.carry; else S.trips++; S.carry = me.carrying; }
        if (g.tool !== 1) { g.pressed.add('Digit1'); return; }
        const full = me.carrying >= g.packCap(1);
        if (full) { const st = g.nearHQ(me.pos.x, me.pos.z, 1); if (st) { go(st.pos.x, st.pos.z, true); S.dHQ = Math.round(g.distToBox(st, me.pos.x, me.pos.z) * 10) / 10; } return; }
        const n = g.ores.filter(o => o.amount > 0).map(o => [Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z) + (g.buildings.some(x => x.alive && x.team === 0 && Math.hypot(x.pos.x - o.pos.x, x.pos.z - o.pos.z) < 40) ? 1e4 : 0), o]).sort((a, b) => a[0] - b[0])[0];
        if (!n) return; const o = n[1], dist = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
        if (dist > 2.5) go(o.pos.x, o.pos.z, dist > 20); else { g.yaw = Math.atan2(o.pos.x - me.pos.x, o.pos.z - me.pos.z); g.pitch = -.3; g.lmb = true; g.pressed.add('Mouse0'); }
        return;
      }
      // fighters: take a Cantor or Lancer when there is one, else stay a Tender at home
      if (me.kind === 'tender') { const u = g.units.find(x => x.alive && x.team === 1 && (x.kind === 'lancer' || x.kind === 'cantor' || x.kind === 'warden') && !x.pilot); if (u && g.jumpCd <= 0) g.possess(u); return; }
      const m = g.me, foes = g.units.filter(u => u.alive && u.team === 0), near = foes.map(u => [Math.hypot(u.pos.x - m.pos.x, u.pos.z - m.pos.z), u]).sort((a, b) => a[0] - b[0])[0];
      const bl = g.buildings.filter(x => x.alive && x.team === 0), tb = bl.map(x => [Math.hypot(x.pos.x - m.pos.x, x.pos.z - m.pos.z), x]).sort((a, b) => a[0] - b[0])[0];
      const reach = m.kind === 'lancer' ? 30 : m.kind === 'warden' ? 6 : 1.9;
      const pushing = D.plan && D.plan.phase === 'go';
      let T = null, ty = 1.2;
      if (near && near[0] < 35) { T = near[1]; ty = 1.1; }
      else if (mode === 'fight' || pushing) { if (tb) { T = tb[1]; ty = Math.min(3, T.h * .5); } }
      if (!T) { const st = g.ownB('choir', true, 1)[0]; if (st && Math.hypot(st.pos.x - m.pos.x, st.pos.z - m.pos.z) > 14) go(st.pos.x - 8, st.pos.z, false); return; }
      const dx = T.pos.x - m.pos.x, dz = T.pos.z - m.pos.z, dist = Math.hypot(dx, dz) - (T.hx ? Math.max(T.hx, T.hz) : 0);
      if (dist > reach) go(T.pos.x, T.pos.z, dist > 40);
      else { g.yaw = Math.atan2(dx, dz); g.pitch = Math.atan2(ty - 2, Math.max(1, dist)); g.lmb = true; g.pressed.add('Mouse0'); if (Math.random() < .03) g.pressed.add('Mouse2'); }
    };
    window.UNIT_EYE = 1.75;
  }, [mode, d, map]);
  let last = null;
  for (let i = 0; ; i++) {
    const r = await p.evaluate(() => { const sp = __ore.split(), g = __ore.game, h = sp.host; for (let k = 0; k < 900 && g.phase !== 'over'; k++) { step(); sp.frame(1 / 30); g.update(1 / 30); }
      const side = t => ({ army: h.army(t).length, work: h.units.filter(u => u.alive && u.team === t && (u.kind === 'rigger' || u.kind === 'tender')).length, bld: h.buildings.filter(b => b.alive && b.team === t).length, ore: Math.floor(h.purse[t]) });
      const said = S.said.splice(0), I = h.dir, vb = h.buildings.filter(x => x.alive && x.team === 1).map(x => x.kind + (x.built ? '' : '?') + '@' + Math.round(x.pos.x) + ',' + Math.round(x.pos.z)).join(' '), ia = h.army(0), ip = I.plan ? I.plan.phase + (I.plan.target ? ' ' + I.plan.target.kind + '@' + Math.round(I.plan.target.pos.x) + ',' + Math.round(I.plan.target.pos.z) : '') : 'none', dbg = `iron plan ${ip} next ${Math.round(I.nextPlan)} live ${I.raidLive} fails ${I.fails} orders ${['guard', 'amove', 'follow'].map(k => ia.filter(u => u.order.type === k).length).join('/')} | veyl plan ${I.vs.plan ? I.vs.plan.phase : 'none'} live ${I.vs.raidLive} | veylB ${vb.length > 160 ? vb.slice(0, 160) + '...' : vb}`; return { dbg, t: Math.round(h.time), phase: g.phase, won: g.won, me: g.me && g.me.kind, deaths: S.deaths, hummed: S.hummed, trips: S.trips, dHQ: S.dHQ, carry: g.me && g.me.carrying, I: side(0), V: side(1), st: h.stats, said, up: Object.keys(h.up).filter(k => h.up[k] && k[0] === 'v').join(' ') }; });
    if (process.env.FEED) for (const l of r.said) console.log('    | ' + l);
    if (i % 2 === 1 || r.phase === 'over') if (process.env.DBG) console.log('    ~ ' + r.dbg); console.log(`  ${r.t}s me ${r.me} deaths ${r.deaths} hummed ${r.hummed}/${r.trips} trips carry ${r.carry} dHQ ${r.dHQ}  IRON ${JSON.stringify(r.I)}  VEYL ${JSON.stringify(r.V)} ${r.up}`);
    last = r; if (r.phase === 'over' || r.t > mins * 60) break;
  }
  console.log(`VBOT ${mode} DIFF ${d} MAP ${map}: ${last.phase === 'over' ? (last.won ? 'WON' : 'LOST') : 'UNFINISHED'} at ${last.t}s, deaths ${last.deaths}, minedV ${Math.floor(last.st.minedV)} mined ${Math.floor(last.st.mined)}`);
  await b.close();
})();
