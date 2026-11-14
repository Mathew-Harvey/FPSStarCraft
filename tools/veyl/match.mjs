// The in-match check of the Veyl art: a real skirmish (the built game, dist/play.html with every faction's art), Veyl bodies and buildings
// made the way a match makes them (Game.spawn, Game.addBuilding: the registry's figure, pose and model hooks), and each one shot at the
// five zooms a player sees it at, in each stance, with each ability going off through Game.useAbility, and each building state.
//   npm run build && node tools/veyl/match.mjs <out dir> [kind ...]        (no kinds: every Veyl body and building)
// Writes <out>/<kind>-<shot>.png and <out>/<kind>.txt (the shot names, in order, with a caption each), which tools/veyl/matchsheet.py
// lays out as one sheet per kind. The shots:
//   fp         first person, driving the body (its own view model, the way the game draws it)
//   close      about 5 m off, three quarters, the game's own light
//   cmd-near   the command view at its nearest stop, centred on the body
//   cmd-far    the command view at its furthest stop
//   map        the whole map (the big map the M key opens), centred on it
//   stance-*   close, in each stance the game puts it in: resting, walking, running, attacking, carrying out an order
//   ab-*       close, part way through each of its abilities, cast for real
//   state-*    a building being sung up, standing in a song field, silent (out of any field), and badly hurt
// Env: HOUR (default 13); FP_ONLY=1 shoots only the bodies' first person views.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { testPage } from '../../test/page.mjs';
// each kind's abilities and their target, read from the Veyl rules (src/factions/veyl/units.ts, its ABS table)
const ABS = (() => { const s = readFileSync('src/factions/veyl/units.ts', 'utf8'), i = s.indexOf('const ABS'), blk = s.slice(i, s.indexOf('\n};', i)), o = {}; let cur = null;
  for (const l of blk.split('\n')) { const m = l.match(/^  (\w+): \[/); if (m) cur = m[1]; if (cur) for (const a of l.matchAll(/key: '(\w+)'[^}]*?target: '(\w+)'/g)) (o[cur] = o[cur] || []).push([a[1], a[2]]); } return o; })();
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const out = process.argv[2], only = process.argv.slice(3);
if (!out) { console.log('node tools/veyl/match.mjs <out dir> [kind ...]'); process.exit(1); }
mkdirSync(out, { recursive: true });
const W = 1280, H = 720;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: W, height: H } }); p.setDefaultTimeout(0);
const errors = [];
p.on('pageerror', e => { errors.push(e.message); console.log('page error', e.message.slice(0, 300)); });
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[m]')) console.log('console', m.text().slice(0, 300)); });
await p.goto(await testPage()); await p.waitForFunction('window.__ore && __ore.game', null, { timeout: 180000 });
await p.evaluate((hour) => {
  localStorage.clear(); __ore.setFree(true); __ore.pickMap(0); document.querySelectorAll('#diff button')[0].click(); __ore.start(); __ore.hold(true);
  const g = __ore.game; g.introT = 0; g.hourFix = hour; g.wxFix = 'clear'; g.truce = true; g.dir.raidIn = 1e9; g.dir.auto = false; g.safeT = 1e9; g.fog.all = true;
  // both bot brains off: a side nobody plays is switched back on each tick, so both count as played (the match itself still runs)
  g.human[0] = g.human[1] = true; g.dir.auto = false; if (g.dir.vs) g.dir.vs.auto = false;
  window.step = (n, draw = true) => { for (let i = 0; i < n; i++) { if (g.phase === 'card') g.phase = 'play'; g.noRender = !draw || i < n - 1; __ore.pipe.flash = 0; g.update(1 / 30); __ore.pipe.flash = 0; } g.noRender = false; };
  // open ground away from both bases, with nobody about
  let best = 1e9, X = 0, Z = 0;
  for (let x = -90; x <= 90; x += 6) for (let z = -90; z <= 90; z += 6) { let n = 0; for (const q of g.props) { const d = Math.hypot(q.x - x, q.z - z); if (d < 22) n += (q.r + q.h) * (22 - d); } for (const bb of g.buildings) if (Math.hypot(bb.pos.x - x, bb.pos.z - z) < 40) n += 80; n += Math.hypot(x, z) * .02; if (n < best) { best = n; X = x; Z = z; } }
  window.__spot = [X, Z];
  for (const u of g.units) if (u !== g.me && Math.hypot(u.pos.x - X, u.pos.z - Z) < 70) { u.alive = false; u.obj.visible = false; }
  window.__home = g.me; g.me.pos.set(X + 60, 0, Z + 60);
  window.__pilot = g.spawn('tender', 1, X - 30, Z - 30); window.__pilot.order = { type: 'guard', x: X - 30, z: Z - 30 };
  for (const k of Object.keys(g.upOf(1))) g.upOf(1)[k] = true;            // every Veyl song known, so each ability can be cast
  const ups = ['vrush', 'vskip', 'vstep', 'vferry', 'vlisten', 'vomen', 'vstride', 'vtoll', 'vstepthru', 'vshatter', 'vreach', 'vshard', 'vswift', 'vhum', 'vbreath', 'vbloom', 'vfar']; for (const k of ups) g.upOf(1)[k] = true;
}, +(process.env.HOUR || 13));
await p.evaluate(() => step(10));
await p.evaluate(() => { const g = __ore.game, [X, Z] = window.__spot, V = g.cam.position.constructor; g.phase = 'cut'; g.shot = { pos: new V(X + 5, 3, Z + 5), look: new V(X, 1, Z), fov: 40 }; step(3); });   // the first drawn frame after the hold can come out black
const cdp = await p.context().newCDPSession(p);
const snap = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, name + '.png'), Buffer.from(r.data, 'base64')); };
const hud = (on) => p.evaluate(on => { for (const e of document.querySelectorAll('#hud, #cmdUI, #mini, #bigmap')) e.style.visibility = on ? '' : 'hidden'; }, on);

const list = await p.evaluate(() => {
  const g = __ore.game, u = [], b = [];
  for (const k of ['tender', 'cantor', 'lancer', 'warden', 'tuner', 'mute', 'choirmaster', 'chord', 'bell', 'reedwalker', 'knell', 'listener', 'ferry', 'swift', 'prism', 'omen', 'lyre', 'shard', 'cantus']) u.push(k);
  for (const k of ['choir', 'hushwell', 'siphonbell', 'broodpit', 'wardpylon', 'thornspire', 'reedgate', 'mendingpool', 'duskhall', 'kiln', 'skyloft', 'tuningfork', 'quiethouse', 'songarchive', 'highbeacon']) b.push(k);
  return { u, b };
});
const want = k => !only.length || only.includes(k);

// cameras. Each sets the view, steps the real game once so its own update draws the frame, and snaps it.
const close = (name, o = {}) => p.evaluate(o => {
  // framed on the body's own bounds as drawn (a flier is framed up where it flies), three quarters on, about 5 m for a person-sized body
  const g = __ore.game, t = window.__t, V = g.cam.position.constructor, a = (o.turn ?? .6) + (window.__yaw || 0);
  g.phase = 'cut'; g.cutSat = 1; g.shake = 0; g.me = window.__home; g.cmd.z = g.cmd.zt = 0; g.myTeam = 1; if (!(t.status || []).some(s => s.k === 'revealed')) (t.status ||= []).push({ k: 'revealed', t: 1e9 });   /* seen by its own side, and an always-unseen body (Listener, Mute) shown plain so its pose can be judged: in play its own side sees a shimmer */
  /* one drawn frame with the camera already near it, so the level swap puts its near meshes up (seen from afar it is drawn in the far crowd, with none of its own meshes showing) */
  { const c0 = t.obj.getWorldPosition(new V()); g.shot = { pos: new V(c0.x + Math.sin(a) * 8, c0.y + 3, c0.z + Math.cos(a) * 8), look: c0, fov: 38 }; step(1); }
  step(1, false); t.obj.updateMatrixWorld(true);
  let lo = null, hi = null; t.obj.traverse(q => { if (!q.isMesh) return; for (let o = q; o && o !== t.obj.parent; o = o.parent) if (!o.visible) return; /* only what is drawn now: whichever level (near, middle, far) is up, never a hidden part */ q.geometry.computeBoundingBox(); const bb = q.geometry.boundingBox.clone().applyMatrix4(q.matrixWorld); if (!isFinite(bb.min.x)) return; if (!lo) { lo = bb.min.clone(); hi = bb.max.clone(); } else { lo.min(bb.min); hi.max(bb.max); } });
  if (!lo) { lo = new V(t.pos.x - 1, 0, t.pos.z - 1); hi = new V(t.pos.x + 1, 2, t.pos.z + 1); }
  const c = lo.clone().add(hi).multiplyScalar(.5), size = Math.max(hi.y - lo.y, (hi.x - lo.x) * .8, (hi.z - lo.z) * .8, 1.2), d = (size * 1.7 + 1.6) * (o.wide || 1);
  g.shot = { pos: new V(c.x + Math.sin(a) * d, c.y + size * .25 + .4, c.z + Math.cos(a) * d), look: new V(c.x, c.y, c.z), fov: 38 };
  step(o.n || 1);
}, o).then(() => snap(name));
// close shots are taken as the Ironhold onlooker (the body must not be the one being driven, or the game hides it from its own eyes)
const away = () => p.evaluate(() => { const g = __ore.game, t = window.__t; if (g.me !== window.__home) { if (g.me) g.bodyLayer(g.me, false); g.me = window.__home; } g.myTeam = 0; if (t && !t.hx) g.bodyLayer(t, false); });
const fp = (name) => p.evaluate(() => {
  const g = __ore.game, u = window.__t; g.phase = 'play'; g.cmd.z = g.cmd.zt = 0; g.me = u; g.myTeam = 1; g.staticT = 0; g.drawT = 0; g.introT = 0; g.ads = 0; g.recoil = 0;
  const [X, Z] = window.__spot; g.yaw = 0; g.pitch = -.05;
  const f = window.__foe; if (f) f.pos.set(u.pos.x, 0, u.pos.z + 10);
  g.fog.update(g, 1, true); step(45, false); step(1);      // taking a body raises its view model over the first second
}).then(() => snap(name)).then(away);
// the command view and the map, seen from the Veyl seat: lifted from the body (or, for a building, from a Tender beside it)
const cmd = (name, z) => p.evaluate(z => {
  const g = __ore.game, t = window.__t, C = g.cmd; g.phase = 'play'; g.myTeam = 1; g.staticT = 0;
  g.me = t.hx ? window.__pilot : t; if (t.hx) window.__pilot.pos.set(t.pos.x - t.hx - 3, 0, t.pos.z + t.hz + 3);
  g.fog.update(g, 1, true); C.focus.set(t.pos.x, 0, t.pos.z); C.z = C.zt = z; if (z >= 1) C.back = .5; step(6); C.focus.set(t.pos.x, 0, t.pos.z); C.z = C.zt = z; g.fog.update(g, 1, true); step(2);
}, z).then(() => snap(name)).then(() => p.evaluate(() => { const C = __ore.game.cmd; C.z = C.zt = 0; step(3); })).then(away);

const caption = [];
const say = (k, n, c) => caption.push(`${k}-${n}\t${c}`);
const five = async (k) => {
  if (process.env.FP_ONLY) { if (await p.evaluate(() => !window.__t.hx)) { await fp(`${k}-fp`); say(k, 'fp', 'first person'); } return; }
  await hud(false); await close(`${k}-close`); say(k, 'close', 'close, 5 m');
  await hud(true);
  await cmd(`${k}-cmdnear`, .2); say(k, 'cmdnear', 'command view, nearest');
  await cmd(`${k}-cmdfar`, .8); say(k, 'cmdfar', 'command view, furthest');
  await cmd(`${k}-map`, 1); say(k, 'map', 'whole map');
  if (await p.evaluate(() => !window.__t.hx)) { await fp(`${k}-fp`); say(k, 'fp', 'first person'); }
  await hud(false);
};

for (const k of list.u) {
  if (!want(k)) continue;
  const t0 = Date.now(); caption.length = 0;
  await p.evaluate(() => step(420, false));           // lets the last kind's effects run out
  const info = await p.evaluate(k => {
    const g = __ore.game, [X, Z] = window.__spot;
    for (const u of window.__made || []) { u.alive = false; u.obj.visible = false; } window.__made = [];
    for (const o of g.units) if (o.alive && o !== window.__pilot && o !== window.__home && Math.hypot(o.pos.x - X, o.pos.z - Z) < 40) { o.alive = false; o.obj.visible = false; }   // copies, Shards and the like left by the last kind
    const u = g.spawn(k, 1, X, Z); u.order = { type: 'guard', x: X, z: Z }; if (k === 'shard') { const L = g.spawn('lyre', 1, X - 14, Z - 14); L.order = { type: 'guard', x: X - 14, z: Z - 14 }; u.lyre = L; window.__made.push(L); } /* a Shard without its Lyre falls */ u.yaw = 0; u.energy = 999; window.__t = u; window.__made.push(u);
    // something to face: an Ironhold Linesman 10 m ahead (the truce keeps both still)
    const f = g.spawn('linesman', 0, X, Z + 10); f.order = { type: 'guard', x: X, z: Z + 10 }; window.__foe = f; window.__made.push(f);
    step(3, false);
    u.obj.updateMatrixWorld(true); let top = 0; u.obj.traverse(o => { if (o.isMesh && o.visible) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); top = Math.max(top, bb.max.y - (u.alt || 0)); } });
    window.__h = Math.max(1.2, Math.min(12, top)); window.__yaw = 0;
    let meshes = 0, stand = !!u.obj.getObjectByName('stand-in'); u.obj.traverse(o => { if (o.isMesh) meshes++; });
    return { h: window.__h, meshes, stand, alt: u.alt || 0, air: !!u.air };
  }, k);
  console.log(k, JSON.stringify(info));
  await five(k);
  if (process.env.FP_ONLY) { writeFileSync(join(out, `${k}.txt`), caption.join('\n')); continue; }
  // stances, as the game puts the body in them
  const stances = [['rest', 'resting', 0], ['walk', 'walking (a move order)', 1], ['run', 'dashing', 2], ['attack', 'attacking', 3]];
  for (const [n, c, how] of stances) {
    await p.evaluate(how => {
      const g = __ore.game, u = window.__t, [X, Z] = window.__spot; g.phase = 'play';     // a cut scene holds every body still
      u.pos.set(X, u.pos.y, Z); u.order = { type: 'guard', x: X, z: Z }; u.swing = 0; u.dashT = 0; u.moving = false;
      if (how === 1 || how === 2) { u.order = { type: 'amove', x: X + 60, z: Z, mine: true }; step(14, false); if (how === 2) u.dashT = .4; window.__yaw = Math.PI / 2 - .6 - .9; }
      else window.__yaw = 0;
      if (how === 3) { step(1, false); u.swing = .55; u.wind = .4; }
      else step(2, false);
    }, how);
    await close(`${k}-stance-${n}`, { n: 1 }); say(k, `stance-${n}`, c);
  }
  // each ability, cast for real at the Linesman or the ground ahead, caught part way through
  for (const [key, tgt] of ABS[k] || []) {
    const ok = await p.evaluate(([key, tgt]) => {
      const g = __ore.game, u = window.__t, f = window.__foe, [X, Z] = window.__spot; g.phase = 'play';
      g.myTeam = 1;                                          // seen from the Veyl seat: traps and blinks only show to their own side
      u.pos.set(X, u.pos.y, Z); u.order = { type: 'guard', x: X, z: Z }; u.swing = 0; u.moving = false; u.energy = 999; if (u.abCd) for (const q in u.abCd) u.abCd[q] = 0; window.__yaw = 0;
      f.pos.set(X, 0, Z + 6); f.alive = true; f.hp = UNIT_HP(f); f.energy = f.maxEnergy = 200; u.cast = null;   // Drain wants a mark with energy
      const t = tgt === 'body' ? (key === 'voice' || key === 'quicken' ? { x: X + 2, z: Z + 2, id: window.__made[0].id } : { x: f.pos.x, z: f.pos.z, id: f.id }) : tgt === 'self' ? { x: X, z: Z } : { x: X, z: Z + 6 };
      function UNIT_HP(o) { return o.hp > 0 ? o.hp : 1; }
      if (key === 'join') { const o = g.spawn('choirmaster', 1, X + 2.5, Z); window.__made.push(o); o.order = { type: 'guard', x: X + 2.5, z: Z }; }
      if (key === 'voice') { const o = g.spawn('cantor', 1, X + 2, Z + 2); window.__made.push(o); o.order = { type: 'guard', x: X + 2, z: Z + 2 }; t.id = o.id; t.x = o.pos.x; t.z = o.pos.z; }
      if (key === 'drop') { const o = g.spawn('cantor', 1, X + 1, Z); window.__made.push(o); g.useAbility(u, 'load', { x: X, z: Z }); }
      if (key === 'unfold' && u.vUnfold) return 'skip';
      const r = g.useAbility(u, key, t); for (let i = 0; i < 75 && u.cast; i++) step(1); step(8); return r === undefined ? 'cast' : String(r);
    }, [key, tgt]);
    await close(`${k}-ab-${key}`, { n: 1, wide: 1.9, turn: Math.PI + .7 }); say(k, `ab-${key}`, `${key}: ${ok}`);
    await p.evaluate(() => { __ore.game.myTeam = 0; });
    await p.evaluate(() => step(90, false));
  }
  writeFileSync(join(out, `${k}.txt`), caption.join('\n'));
  console.log(k, 'shot in', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}

for (const k of list.b) {
  if (!want(k) || process.env.FP_ONLY) continue;
  const t0 = Date.now(); caption.length = 0;
  await p.evaluate(() => step(420, false));
  const made = async (state) => p.evaluate(([k, state]) => {
    const g = __ore.game, [X, Z] = window.__spot; g.phase = 'play';   // buildings only tick in play
    for (const u of window.__made || []) { u.alive = false; u.obj.visible = false; } window.__made = [];
    for (const b of window.__bmade || []) { b.alive = false; for (const o of [b.obj, b.holo]) if (o) { o.visible = false; o.removeFromParent(); } } window.__bmade = [];   // its build-up cage too
    if (state !== 'silent' && k !== 'choir' && k !== 'hushwell') { const s = g.addBuilding('hushwell', 1, X - __ore.reg.BLD[k].hx - 5, Z - __ore.reg.BLD[k].hz - 3, true); window.__bmade.push(s); }   // the song field it stands in (6.5 m from a Hush Well)
    const b = g.addBuilding(k, 1, X, Z, state !== 'build'); window.__bmade.push(b); window.__t = b;
    if (state === 'build') { b.progress = .45; }
    if (state === 'hurt') g.damage(b, b.hp * .8, null);
    step(4);
    b.obj.updateMatrixWorld(true); let top = 0; b.obj.traverse(o => { if (o.isMesh && o.visible) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); top = Math.max(top, bb.max.y); } });
    window.__h = Math.max(3, Math.min(18, top)) * 1.25; window.__yaw = 0;
    return { h: top, built: b.built, silent: g.rate(b) === 0, why: g.silent(b), look: !!b.obj.userData.silent };
  }, [k, state]);
  const info = await made('sung');
  console.log(k, JSON.stringify(info));
  await five(k);
  say(k, 'close', `close (sung: ${!info.silent})`);
  for (const [st, c] of [['build', 'being sung up'], ['silent', 'silent: out of any song field'], ['hurt', 'badly hurt']]) {
    const i = await made(st); await close(`${k}-state-${st}`, { n: 2 }); say(k, `state-${st}`, `${c}${st === 'silent' ? ` (rule: ${i.silent}, look: ${i.look})` : ''}`);
  }
  writeFileSync(join(out, `${k}.txt`), caption.join('\n'));
  console.log(k, 'shot in', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
console.log(errors.length ? `${errors.length} page errors` : 'no page errors');
await b.close();
