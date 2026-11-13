// The effect kit (src/fx/kit.ts) and the far-zoom rules (src/meshes.ts levels and side marks). Run after npm run build: node test/fx.mjs
// Puts one of each effect in front of the player, draws first person and the view from high up, and checks each shows, keeps its
// size on screen from high up, and is gone when its time is up. SHOTS=<dir> saves the pictures.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { testPage } from './page.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const page = await testPage(), SHOTS = process.env.SHOTS || '';
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
try {
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.setDefaultTimeout(300000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  await p.evaluate(() => {
    __ore.setFree(true); __ore.pickMap(0); document.querySelectorAll('#diff button')[0].click(); __ore.start(); __ore.hold(true);
    const g = __ore.game; g.introT = 0; g.hourFix = 13; g.wxFix = 'clear'; g.truce = true; g.dir.raidIn = 9999; g.dir.auto = false;
    window.step = n => { const g = __ore.game; for (let i = 0; i < n; i++) { if (g.phase === 'card') g.phase = 'play'; g.noRender = i < n - 1; g.update(1 / 30); if (window.kit) kit.update(1 / 30); } g.noRender = false; __ore.pipe.flash = 0; };
    window.grab = () => { const c = document.getElementById('c'); const x = document.createElement('canvas'); x.width = 240; x.height = 135; const t = x.getContext('2d'); t.drawImage(c, 0, 0, 240, 135); return t.getImageData(0, 0, 240, 135).data; };
    window.diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) n++; return n; };
    step(30);
  });
  const shot = async n => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.jpg`, type: 'jpeg', quality: 88 }); };

  // ---- one of each, in front of the player
  const r = await p.evaluate(() => {
    const g = __ore.game, F = window.__oreFx, me = g.me, V = me.pos.constructor, fwd = new V(Math.sin(me.yaw), 0, Math.cos(me.yaw));
    const at = (d, s = 0) => new V(me.pos.x + fwd.x * d + fwd.z * s, 0, me.pos.z + fwd.z * d - fwd.x * s);
    g.update(0); const a0 = (step(2), grab());
    window.kit = new F.FxKit(g.scene);
    const T = 30, p1 = at(14, -5), p2 = at(14, 5), p3 = at(22, 0), p4 = at(10, 0);
    const made = {
      tell: kit.add(F.tell({ x: p1.x, z: p1.z, r: 3, time: 2, color: '#ff4f9a' })),
      beam: kit.add(F.beam({ a: p4.clone().setY(1.2), b: p3.clone().setY(1.5), width: .12, color: '#7ff0e4', time: T })),
      orb: kit.add(F.orb({ at: p2.clone().setY(1.6), r: .35, color: '#f2c14a', time: T, pulse: 1 })),
      cloud: kit.add(F.cloud({ x: p3.x + 6, z: p3.z, r: 4, color: '#9fd06a', time: T })),
      pane: kit.add(F.pane({ x0: p2.x - 3, z0: p2.z + 4, x1: p2.x + 3, z1: p2.z + 4, h: 3, color: '#6a55e6', time: T })),
      ring: kit.add(F.ring({ x: p4.x, z: p4.z, r: 6, time: 3, color: '#ffffff' })),
    };
    step(12); const a1 = grab();
    return { n: kit.list.length, changed: diff(a0, a1), kinds: Object.keys(made) };
  });
  check(r.n === 6, `six effects running (${r.kinds.join(', ')})`);
  check(r.changed > 600, `they show in first person (${r.changed} of 32400 sample pixels changed)`);
  await shot('fx-first-person');

  // ---- from high up: sizes held on screen
  const far = await p.evaluate(() => {
    const g = __ore.game, C = g.cmd, kit = window.kit; if (!C) return null;
    C.zt = C.z = .85; C.focus.set(g.me.pos.x, 0, g.me.pos.z); step(3);
    const H = __ore.pipe.h, beam = kit.list.find(f => f.obj.isMesh && f.obj.material.uniforms?.uLen), b = beam.obj, cam = g.cam || null;
    const t = kit.list.find(f => f.obj.isMesh && f.obj.material.uniforms?.uRim);
    return { ink: __ore.pipe.postMat ? __ore.pipe.postMat.uniforms.uFarInk.value : -1, beamW: b.scale.y, rim: t ? t.obj.material.uniforms.uRim.value : 0, lod: __oreLOD.counts.slice(), H };
  });
  if (far) {
    check(far.ink > .5, `the view from high up turns the far-zoom rules on (${far.ink.toFixed(2)})`);
    check(far.beamW > .3, `a beam ${'0.12'} m wide is drawn at least three pixels wide from high up (${far.beamW.toFixed(2)} m)`);
    check(far.rim > .05, `a ground warning's rim keeps three pixels from high up (rim ${far.rim.toFixed(2)} of its radius)`);
    check(far.lod[0] === 0 && far.lod[2] > 0, `bodies seen from high up draw their far model (near ${far.lod[0]}, middle ${far.lod[1]}, far ${far.lod[2]})`);
    await shot('fx-high-up');
    await p.evaluate(() => { const C = __ore.game.cmd; C.zt = C.z = 0; step(20); });
  } else console.log('(no command view in this build: far-zoom checks skipped)');

  // ---- timers
  const end = await p.evaluate(() => { step(100); const a = kit.list.length; for (const f of kit.list) f.update(99); kit.update(0); return { a, b: kit.list.length, left: window.kit.scene.children.filter(o => o.layers && o.renderOrder === 3).length }; });
  check(end.a === 4, `the ground warning and the ring are gone when their time is up (${end.a} left of 6)`);
  check(end.b === 0, 'every effect leaves the scene when finished');

  // ---- veil and borrow on a body
  const vb = await p.evaluate(() => { const g = __ore.game, F = window.__oreFx, u = g.units.find(x => x.alive && x !== g.me); const mats0 = []; u.obj.traverse(o => { if (o.isMesh) mats0.push(o.material); });
    const vis0 = []; u.obj.traverse(o => { if (o.isMesh) vis0.push(o.visible); });
    const off = F.veil(u.obj), off2 = F.veil(u.obj); let shim = 0; u.obj.traverse(o => { if (o.isMesh && o.material.blending === 2) shim++; });
    off(); let still = 0; u.obj.traverse(o => { if (o.isMesh && o.material.blending === 2) still++; }); off2();
    let back = 0, i = 0, vis = 0; u.obj.traverse(o => { if (o.isMesh) { if (o.material === mats0[i]) back++; if (o.visible === vis0[i]) vis++; i++; } }); window.vbStill = still === shim; window.vbVis = vis === mats0.length;
    const bo = F.borrow(u.obj, '#ff4fd0'); bo.update(1); let tinted = 0; u.obj.traverse(o => { if (o.isMesh && o.material.uniforms?.uColor && o.material.uniforms.uColor.value.r > .9 && o.material.uniforms.uColor.value.g < .8) tinted++; }); bo.off();
    return { shim, back, n: mats0.length, tinted, still: window.vbStill, vis: window.vbVis }; });
  check(vb.shim > 0 && vb.back === vb.n && vb.vis, `a hidden body shimmers and gets its own paint and detail levels back after (${vb.shim} parts)`);
  check(vb.still, 'two hiders on one body: it stays hidden until both let go');
  check(vb.tinted > 0, `a taken-over body wears the other side's colour (${vb.tinted} parts)`);

  // ---- a flier gets a shadow on the ground and a height line, and loses them when it lands
  const air = await p.evaluate(() => { const g = __ore.game, F = window.__oreFx, u = g.units.find(x => x.alive && x !== g.me && !x.air);
    u.air = true; u.alt = 7; step(20); const up = F.airShadows(g.scene), y = u.obj.position.y;
    const sh = g.scene.children.find(o => o.isGroup && o.children.length === 2 && o.children[1].geometry?.type === 'CylinderGeometry');
    const line = sh ? sh.children[1].scale.y : 0; window.__flier = u; return { up, y, line }; });
  await shot('flier');
  air.down = await p.evaluate(() => { const u = window.__flier; u.air = false; u.alt = 0; step(30); return window.__oreFx.airShadows(__ore.game.scene); });
  check(air.up === 1 && air.line > 3, `a body in the air has a ground shadow and a line down to it (${air.up} shadow, line ${air.line.toFixed(1)} m, body at ${air.y.toFixed(1)} m)`);
  check(air.down === 0, 'the shadow goes when the body lands');
} finally { await b.close(); }
console.log(fail.length ? `${fail.length} failed` : 'all passed'); process.exit(fail.length ? 1 : 0);
