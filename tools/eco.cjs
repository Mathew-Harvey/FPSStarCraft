// Ironhold bots against Veyl bots, both running a full economy: the match a Veyl player steps into, with nobody at the wheel.
// Usage: npm run build && node tools/eco.cjs '[[map, diff], ...]' [minutes]
// Prints the state of both sides every few minutes and who won, so the two economies can be balanced against each other.
const { chromium } = require('playwright');
(async () => {
  const runs = JSON.parse(process.argv[2] || '[[0,1]]'), mins = +(process.argv[3] || 30), every = +(process.argv[4] || 6);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  for (const [map, d] of runs) {
    const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(900000);
    p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300)));
    await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'dist', 'index.html')).href); await p.waitForFunction('window.__ore && __ore.game');
    await p.evaluate(([map, d]) => { __ore.setFree(true); __ore.pickMap(map); document.querySelectorAll('#diff button')[d].click(); __ore.startVeyl(); const g = __ore.game; g.noRender = true; g.phase = 'paused';
      const h = __ore.split().host; h.human = [false, false]; for (const u of h.units) u.pilot = 0; window.bad = {}; window.fl = []; const f = h.feed.bind(h); h.feed = (w, m, c) => { if (!/chatter|^(Linesman|Cantor|Lancer|Breacher|Patch|Longshot|Gantry|Rigger|Tender|Warden)$/.test(w)) fl.push(Math.round(h.time) + ' ' + w + ': ' + m); return f(w, m, c); }; }, [map, d]);
    let res = null;
    for (let i = 0; !res; i++) {
      const r = await p.evaluate(() => { const h = __ore.split().host, note = k => { bad[k] = (bad[k] || 0) + 1; };
        for (let k = 0; k < 600 && h.phase !== 'over'; k++) { h.update(.05);
          if (k % 100 === 0) for (const u of h.units) if (u.alive && !isFinite(u.pos.x + u.pos.z + u.hp)) note('nan ' + u.kind);
          if (h.purse[0] < -1 || h.purse[1] < -1) note('negative ore'); }
        const side = t => { const a = h.army(t), hq = h.buildings.find(b => b.alive && b.team === t && b.kind === (t ? 'choir' : 'headframe')); return { army: a.length, away: hq ? a.filter(u => Math.hypot(u.pos.x - hq.pos.x, u.pos.z - hq.pos.z) > 50).length : -1, fighting: a.filter(u => u.target).length, kinds: a.reduce((o, u) => (o[u.kind] = (o[u.kind] || 0) + 1, o), {}), work: h.units.filter(u => u.alive && u.team === t && (u.kind === 'rigger' || u.kind === 'tender')).length, bld: h.buildings.filter(b => b.alive && b.team === t).length, hq: h.buildings.filter(b => b.alive && b.built && b.team === t && b.kind === (t ? 'choir' : 'headframe')).length, ore: Math.floor(h.purse[t]), sup: h.supplyUsed(t) + '/' + h.supplyCap(t) }; };
        return { t: Math.round(h.time), over: h.phase === 'over', won: h.won, I: side(0), V: side(1), up: Object.keys(h.up).filter(k => h.up[k]).join(' '), feed: fl.splice(0), st: { mined: Math.floor(h.stats.mined), minedV: Math.floor(h.stats.minedV), kills: h.stats.kills, lost: h.stats.lost }, bad }; });
      if (i % every === every - 1 || r.over) if (process.env.FEED) for (const l of r.feed) console.log('      | ' + l); console.log(`  ${r.t}s IRON ${JSON.stringify(r.I)}\n        VEYL ${JSON.stringify(r.V)}\n        up ${r.up} ${JSON.stringify(r.st)}`);
      if (r.over || r.t >= mins * 60) res = r;
    }
    console.log(`MAP ${map} DIFF ${d}: ${res.over ? (res.won ? 'IRONHOLD WON' : 'VEYL WON') : 'UNFINISHED'} at ${res.t}s`, JSON.stringify(res.bad));
    await p.close();
  }
  await b.close();
})();
