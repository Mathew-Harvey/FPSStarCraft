const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  for (const [map, d] of JSON.parse(process.argv[2])) {
    const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(900000);
    p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300))); p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
    await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'dist', 'index.html')).href); await p.waitForFunction('window.__ore && __ore.game');
    await p.evaluate(([map, d]) => { __ore.setFree(true); __ore.pickMap(map); document.querySelectorAll('#diff button')[d].click(); __ore.setRaid(true); __ore.start(); const g = __ore.game; g.noRender = true; window.prev = new Map(); window.bad = {}; }, [map, d]);
    let res = null;
    for (let i = 0; i < 70 && !res; i++) {
      const r = await p.evaluate(() => { const g = __ore.game, note = k => { bad[k] = (bad[k] || 0) + 1; };
        for (let k = 0; k < 600 && g.phase === 'play'; k++) { g.update(.05);
          if (k % 100 === 0) { for (const u of g.units) { if (!u.alive) continue; if (!isFinite(u.pos.x + u.pos.z + u.hp)) note('nan ' + u.kind); if (Math.abs(u.pos.x) > 420 || Math.abs(u.pos.z) > 420) note('oob ' + u.kind); if (u.hp > u.maxHp + .01) note('hp>max ' + u.kind);
              const q = prev.get(u.id); if (q && u !== g.me && u.team === 0 && u.kind === 'rigger' && q.s === u.state && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < .05 && (u.state === 'toOre' || u.state === 'toHQ' || u.state === 'toSite')) note('stuck rigger ' + u.state);
              if (q && u.team === 1 && u.order.type === 'raid' && !u.target && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < .05) note('stuck raider ' + u.kind);
              prev.set(u.id, { x: u.pos.x, z: u.pos.z, s: u.state }); }
            if (g.ore < 0) note('negative ore'); if (g.supplyUsed() > g.supplyCap() + 4) note('over supply'); } }
        return { t: Math.round(g.time), phase: g.phase, won: g.won, army: g.soldiers().length, rig: g.own('rigger').length, stones: g.stones().length, ve: g.units.filter(u => u.alive && u.team === 1).length, up: Object.keys(g.up).filter(k => g.up[k]).length, b: g.ownB().length, st: g.stats, bad, idle: g.own('rigger').filter(u => u.state === 'idle' || u.state === 'wait').length }; });
      if (i % 6 === 5) console.log(`  ${r.t}s army ${r.army} riggers ${r.rig} (idle ${r.idle}) veyl ${r.ve} stones ${r.stones} bld ${r.b} research ${r.up}`);
      if (r.phase !== 'play') res = r; else if (i === 69) res = r;
    }
    console.log(`MAP ${map} DIFF ${d}: ${res.phase === 'over' ? (res.won ? 'WON' : 'LOST') : 'UNFINISHED'} at ${res.t}s kills ${res.st.kills} lost ${res.st.lost}`, JSON.stringify(res.bad));
    await p.close();
  }
  await b.close();
})();
