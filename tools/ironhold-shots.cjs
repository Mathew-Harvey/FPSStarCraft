// Captures figures from the Ironhold bench page (tools/ironhold-bench.mjs) with the game's own renderer.
// node tools/ironhold-shots.cjs bench.html shots.json outdir
// shots.json: [{ name, w, h, figs: [{ kind, x, z, yaw, pose? }], cam: { at: [x,y,z], look: [x,y,z], fov } | { top: [x,z], span } }]
// Positions are relative to a clear patch of ground the script finds; yaw 0 faces +z.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [page_, spec, out] = process.argv.slice(2);
  const shots = JSON.parse(fs.readFileSync(spec, 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = []; p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); }); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.goto('file://' + require('path').resolve(page_), { timeout: 180000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__ore && window.__fig, null, { timeout: 120000 });
  await p.evaluate(() => { localStorage.clear(); const o = window.__ore; o.setFree(true); o.pickMap(0); document.querySelectorAll('#diff button')[0].click(); o.start(); o.hold(true); for (const id of ['menu', 'hud']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
  await p.waitForTimeout(1500);
  for (const s of shots) {
    const w = s.w || 1280, h = s.h || 800;
    await p.setViewportSize({ width: w, height: h });
    await p.evaluate((s) => {
      const o = window.__ore, g = o.game, T = window.__three, pipe = o.pipe, w = s.w || 1280, h = s.h || 800;
      g.phase = 'play'; pipe.flash = 0; pipe.flashK = 0;
      if (window.__placed) for (const q of window.__placed) q.parent && q.parent.remove(q);
      window.__placed = [];
      // a patch of open ground: the first spot with nothing in 30 m
      if (!window.__spot) { let best = null, bs = -1; for (let r = 50; r < 200; r += 6) for (let a = 0; a < 6.28; a += .2) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (!o.models.isClear(x, z, 0)) continue; let d = 99; for (const b of g.buildings) d = Math.min(d, Math.hypot(b.pos.x - x, b.pos.z - z) - 8); for (const q of g.props) if (q.alive && q.solid) d = Math.min(d, Math.hypot(q.x - x, q.z - z) - q.r); for (const n of g.ores) d = Math.min(d, Math.hypot(n.pos.x - x, n.pos.z - z) - 3); if (d > bs) { bs = d; best = [x, z]; } } window.__spot = best || [0, 0]; console.warn('spot ' + JSON.stringify(best) + ' clear ' + bs); }
      const [ox, oz] = window.__spot, Y = (x, z) => (g.groundY ? g.groundY(x, z) : 0);
      for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - ox, u.pos.z - oz) < 60) u.obj.visible = false;
      for (const f of s.figs) {
        const L = window.__look, fg = L.KINDS.includes(f.kind) ? L.model(f.kind) : window.__fig(f.kind); if (!fg) { console.error('no figure ' + f.kind); continue; }
        const r = fg.root; r.position.set(ox + f.x, Y(ox + f.x, oz + f.z), oz + f.z); r.rotation.y = f.yaw || 0; if (f.scale) r.scale.setScalar(f.scale);
        if (f.state) L.animate(f.kind, fg, Object.assign({ t: 3, id: 1, speed: 0, dist: 0, kick: 0, pitch: 0, aim: 0, work: false, load: false, anchor: 0, idle: 0 }, f.state));
        if (f.clay) { const cm = window.__ore.mats.oreDead; r.traverse(m => { if (m.isMesh) m.material = cm; }); }
        if (f.fp) { const F = L.FIRST[f.kind]; for (const k of F.hide) if (fg.groups[k]) fg.groups[k].visible = false; if (F.vm) { const q = fg.groups[F.vm.group]; if (q) { q.position.x += F.vm.at[0]; q.position.y += F.vm.at[1]; q.position.z += F.vm.at[2]; } } window.__fp = { root: r, F }; }
        if (f.groups) for (const k in f.groups) { const q = fg.groups[k]; if (q) { const v = f.groups[k]; if (v.r) q.rotation.set(...v.r); if (v.p) q.position.set(...v.p); if (v.hide) q.visible = false; } }
        g.scene.add(r); window.__placed.push(r);
      }
      if (window.__hid) { for (const o of window.__hid) o.visible = true; window.__hid = null; }
      if (s.only) { window.__hid = []; for (const o of g.scene.children) if (o.visible && !window.__placed.includes(o) && !o.isLight) { o.visible = false; window.__hid.push(o); } }
      let cam;
      if (s.cam.fp) { const { root, F } = window.__fp; root.updateMatrixWorld(true); cam = new T.PerspectiveCamera(F.fov, w / h, .03, 4000); const e = root.localToWorld(new T.Vector3(...F.eye)), l = root.localToWorld(new T.Vector3(F.eye[0], F.eye[1] - (F.drop ?? .45), F.eye[2] + 3)); cam.position.copy(e); cam.lookAt(l); }
      else if (s.cam.top) { const sp = s.cam.span; cam = new T.OrthographicCamera(-sp / 2 * w / h, sp / 2 * w / h, sp / 2, -sp / 2, .1, 600); cam.position.set(ox + s.cam.top[0], 300, oz + s.cam.top[1]); cam.up.set(0, 0, 1); cam.lookAt(ox + s.cam.top[0], 0, oz + s.cam.top[1]); }
      else { cam = new T.PerspectiveCamera(s.cam.fov || 50, w / h, .05, 4000); const a = s.cam.at, l = s.cam.look; cam.position.set(ox + a[0], Y(ox + a[0], oz + a[2]) + a[1], oz + a[2]); cam.lookAt(ox + l[0], Y(ox + l[0], oz + l[2]) + l[1], oz + l[2]); }
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      pipe.resize && pipe.resize(w, h);
      window.__draw = () => { for (let i = 0; i < 3; i++) pipe.draw(g.scene, cam, new T.Vector3(ox, 0, oz), s.span || 40, true); };
      window.__draw();
    }, s);
    await p.waitForTimeout(400);
    await p.evaluate(() => window.__draw());   // painted pictures load a moment after a figure is first made
    await p.screenshot({ path: out + '/' + s.name + '.png' });
  }
  fs.writeFileSync(out + '/console.txt', logs.join('\n'));
  await b.close();
})();
