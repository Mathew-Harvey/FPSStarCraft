// Boot, input, the frame loop, and the menu screens.
import * as THREE from 'three';
import { Pipeline, V3, makeSky } from './gfx';
import * as MD from './models';
import { Game } from './game';
import { Hud } from './hud';
import { initAudio, setVolume, setMusic } from './audio';
import { UNIT, DIFFS, Kind } from './data';
import { MISSIONS } from './campaign';
import { Net, Lobby } from './net';

THREE.ColorManagement.enabled = false;
const $ = (id: string) => document.getElementById(id)!;
const canvas = $('c') as HTMLCanvasElement;
const pipe = new Pipeline(canvas);
const hud = new Hud();
let quality = 1, slow = 0, fast = 0;
/** True when the browser would not lock the mouse, so the game runs with a free cursor instead. */
let freeMouse = false;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const sc = Math.min(Math.min(window.devicePixelRatio || 1, 1.5), 1080 / h) * (gfxI === 1 ? .6 : gfxI === 2 ? .8 : gfxI === 3 ? 1 : quality);
  pipe.resize(w * sc, h * sc); hud.setSize(w, h);
}

/** Renders a small head-and-shoulders picture of each unit for the HUD. */
function portraits() {
  const scene = new THREE.Scene(); scene.add(makeSky());
  const cam = new THREE.PerspectiveCamera(30, 1, .1, 4000);
  pipe.resize(236, 236);
  for (const kind of ['rigger', 'linesman', 'breacher', 'gantry', 'longshot', 'patch', 'cantor', 'lancer', 'warden'] as Kind[]) {
    const m = MD.unit(kind), st = UNIT[kind], y = st.headY * (kind === 'breacher' ? 1.0 : .97), dist = st.headY * 1.5 + (kind === 'warden' ? 2 : .3); m.obj.rotation.y = .5; scene.add(m.obj);
    if (m.rig.flash) m.rig.flash.visible = false; if (m.rig.pack) m.rig.pack.visible = false;
    cam.position.set(0, y + .15, dist); cam.lookAt(0, y, 0); cam.updateMatrixWorld();
    pipe.draw(scene, cam, V3(0, 0, 0), 8);
    hud.portraits[kind] = canvas.toDataURL('image/jpeg', .85);
    scene.remove(m.obj);
  }
}

portraits();
pipe.w = 0; resize();
let camp = 0, mpOpen = false, mode = 'camp', jobI = 0, pname = '', srv = '';
let net: Net | null = null;
/** Rebindable actions: [what the game code listens for, label]. A player's choice is stored as action code to physical key. */
const ACTIONS: [string, string][] = [['KeyW', 'Forward'], ['KeyS', 'Back'], ['KeyA', 'Left'], ['KeyD', 'Right'], ['ShiftLeft', 'Sprint'], ['Space', 'Dash'], ['Tab', 'Jump wheel'], ['KeyF', 'Jump to target'], ['KeyQ', 'Last body'], ['KeyE', 'Use or train'], ['KeyR', 'Reload or rotate'], ['KeyC', 'Grenade or ability'], ['Digit1', 'Drill'], ['Digit2', 'Build'], ['KeyG', 'Quartermaster or raid'], ['KeyZ', 'Yes to the squad'], ['KeyX', 'Hold'], ['KeyV', 'Follow me'], ['KeyB', 'Ping'], ['Enter', 'Chat']];
let binds: Record<string, string> = {}, gfxI = 0, cbOn = false, optsOpen = false, fpsOn = false, fpsN = 0, fpsT = 0, fpsWorst = 0;
const keyOf = (action: string) => binds[action] || action;
const keyText = (code: string) => code.replace(/^Key|^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'R Shift').replace('ControlLeft', 'Ctrl').replace('AltLeft', 'Alt').replace(/^Arrow/, '').replace(/^Numpad/, 'Num ');
/** The key a player pressed, as the action the game code listens for. A default key that has been given away does nothing. */
function logical(code: string) { for (const a in binds) if (binds[a] === code) return a; return binds[code] ? 'Unbound' : code; }
let diffI = 1, mapI = 0, sens = 1, vol = .5, mus = true, curX = .5, moved = false;
try { const o = JSON.parse(localStorage.getItem('ore-else') || '{}'); if (o.d >= 0 && o.d < 3) diffI = o.d; if (o.map >= 0 && o.map < 3) mapI = o.map; if (o.camp > 0) camp = Math.min(MISSIONS.length, o.camp); if (o.mp) mpOpen = true; if (o.mode === 'skirm') mode = 'skirm'; if (typeof o.name === 'string') pname = o.name.slice(0, 14); if (typeof o.srv === 'string') srv = o.srv.slice(0, 200); if (o.s > 0) sens = o.s; if (o.v >= 0) vol = o.v; if (o.m === false) mus = false; if (o.q >= 0 && o.q < 4) gfxI = o.q | 0; cbOn = !!o.cb; fpsOn = !!o.fps; if (o.k && typeof o.k === 'object') for (const [a] of ACTIONS) if (typeof o.k[a] === 'string' && o.k[a] !== a) binds[a] = o.k[a]; } catch (e) { /* storage is optional */ }
const save = () => { try { localStorage.setItem('ore-else', JSON.stringify({ d: diffI, map: mapI, camp, mp: mpOpen, mode: mode === 'multi' ? 'camp' : mode, name: pname, srv, s: sens, v: vol, m: mus, q: gfxI, cb: cbOn, fps: fpsOn, k: binds })); } catch (e) { /* storage is optional */ } };
jobI = Math.min(camp, MISSIONS.length - 1);
const want = () => mode !== 'skirm' ? { d: DIFFS[MISSIONS[jobI].diff], map: MISSIONS[jobI].map, m: MISSIONS[jobI] } : { d: DIFFS[diffI], map: mapI, m: null };
let game = new Game(pipe, hud, want().d, want().map, want().m); game.sens = sens;
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- input
const locked = () => document.pointerLockElement === canvas;
const live = () => game.phase === 'play' || game.phase === 'card';
let lastCode = '';
let rebinding = '';
const chat = $('chat') as HTMLInputElement;
const chatClose = () => { chat.hidden = true; chat.value = ''; chat.blur(); };
chat.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { const t = chat.value.trim(); if (t && game.net) game.net.cmd('ch', t); chatClose(); } else if (e.key === 'Escape') { e.preventDefault(); chatClose(); } });
chat.addEventListener('keyup', e => e.stopPropagation()); chat.addEventListener('blur', () => { chat.hidden = true; });
addEventListener('keydown', e => {
  const code = logical(e.code);
  if (rebinding) return;
  if (game.net && game.phase === 'play' && code === 'Enter') { e.preventDefault(); game.keys.clear(); chat.hidden = false; chat.focus(); return; }
  if (live()) { if (!e.ctrlKey && !e.metaKey && e.code !== 'Escape' && !/^F\d/.test(e.code)) e.preventDefault(); if (!e.repeat) game.pressed.add(code); game.keys.add(code); }
  if (e.code === 'Escape' && freeMouse) { if (game.phase === 'play') pause(); else if (game.phase === 'paused') resume(); }
});
addEventListener('keyup', e => game.keys.delete(logical(e.code)));
addEventListener('blur', () => { game.keys.clear(); game.lmb = game.rmb = false; });
canvas.addEventListener('mousedown', e => { if (!live()) return; e.preventDefault(); game.pressed.add('Mouse' + e.button); if (e.button === 0) game.lmb = true; if (e.button === 2) game.rmb = true; if (!locked() && !freeMouse) lock(); });
addEventListener('mouseup', e => { if (e.button === 0) game.lmb = false; if (e.button === 2) game.rmb = false; });
addEventListener('mousemove', e => { curX = e.clientX / innerWidth; if (e.movementX || e.movementY) moved = true; if (live() && (locked() || freeMouse)) { game.mdx += e.movementX || 0; game.mdy += e.movementY || 0; } });
addEventListener('wheel', e => { if (live()) { game.wheel = Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('auxclick', e => e.preventDefault());

function lock() { try { const p: any = (canvas as any).requestPointerLock(); if (p && p.catch) p.catch(() => { freeMouse = true; }); } catch (e) { freeMouse = true; } }
document.addEventListener('pointerlockerror', () => { freeMouse = true; });
document.addEventListener('pointerlockchange', () => { if (!locked() && live() && !freeMouse) pause(); });

function fresh() { hud.reset(); const w = want(); game = new Game(pipe, hud, w.d, w.map, w.m); game.sens = sens; ended = false; (window as any).__ore.game = game; }
function start() { initAudio(); setVolume(vol); setMusic(mus); { const w = want(); if (game.diff !== w.d || game.mapI !== w.map || game.mission !== w.m || game.time > 0) fresh(); } $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); game.phase = 'play'; game.introT = 1.8; lock(); }
function pause() { if (game.phase !== 'play' && game.phase !== 'card') return; if (game.net) { game.phase = 'paused'; game.keys.clear(); game.lmb = game.rmb = false; $('pause').hidden = false; return; } game.phase = 'paused'; game.keys.clear(); game.lmb = game.rmb = false; $('pause').hidden = false; }
function resume() { if (game.phase !== 'paused') return; initAudio(); $('pause').hidden = true; game.phase = 'play'; lock(); }
$('start').addEventListener('click', start);
$('resume').addEventListener('click', resume);
$('again').addEventListener('click', () => { if (game.net) { toMenu(); return; } if (game.mission && game.won && jobI < MISSIONS.length - 1) jobI++; fresh(); start(); });
$('startJob').addEventListener('click', start);
function toMenu() { $('end').hidden = true; $('pause').hidden = true; hud.show(false); if (document.pointerLockElement) document.exitPointerLock(); showMode(); fresh(); $('menu').hidden = false; }
$('toMenu').addEventListener('click', toMenu);
// ---- campaign and mode tabs
let ended = false;
const modeBtns = Array.from($('modes').querySelectorAll('button')) as HTMLButtonElement[];
function showJobs() {
  $('jobs').innerHTML = MISSIONS.map((m, i) => `<button type="button" data-j="${i}" class="${i === jobI ? 'on' : ''} ${i < camp ? 'dn' : ''}" ${i > camp ? 'disabled' : ''} aria-pressed="${i === jobI}">${m.tag}<b>${m.name}</b><small>${i < camp ? 'Done' : i === camp ? 'Next up' : 'Locked'}</small></button>`).join('');
  const m = MISSIONS[jobI]; $('bName').textContent = `${m.tag}: ${m.name}`; $('bTeach').textContent = 'Teaches: ' + m.teaches; $('bText').textContent = m.brief;
  $('skipCamp').hidden = camp >= MISSIONS.length && mpOpen;
}
function showMode() {
  modeBtns.forEach(b => { const on = optsOpen ? b.dataset.m === 'opts' : b.dataset.m === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  $('pOpts').hidden = !optsOpen; $('pCamp').hidden = optsOpen || mode !== 'camp'; $('pSkirm').hidden = optsOpen || mode !== 'skirm'; $('pMulti').hidden = optsOpen || mode !== 'multi';
  $('multiBtn').classList.toggle('locked', !mpOpen); $('multiNote').textContent = mpOpen ? 'Unlocked' : 'Locked. Finish the campaign.';
  $('mLocked').hidden = mpOpen; $('mJoin').hidden = !mpOpen || !!(net && net.lobby && net.lobby.code); $('mLobby').hidden = !mpOpen || !(net && net.lobby && net.lobby.code);
  $('mTitle').textContent = mpOpen ? 'Joint operations: cleared' : 'Joint operations: locked';
  $('mText').textContent = mpOpen ? 'You are cleared for multiplayer. Lobbies open as soon as the game server is switched on, which is the next part of the build. Until then, Skirmish has all three maps.' : 'The Charter does not let strangers share a payroll. Finish the five campaign jobs to unlock multiplayer, or use the unlock button on the Campaign tab if you have done them before.';
  showJobs();
}
modeBtns.forEach(b => b.addEventListener('click', () => { optsOpen = b.dataset.m === 'opts'; if (optsOpen) { showMode(); return; } mode = (b.dataset.m || 'camp') as typeof mode; save(); showMode(); if (mode !== 'multi') { const w = want(); if (game.mapI !== w.map || game.mission !== w.m) fresh(); } }));
$('jobs').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b || b.disabled) return; jobI = +(b.dataset.j || 0); showJobs(); const w = want(); if (game.mapI !== w.map || game.mission !== w.m) fresh(); });
$('skipCamp').addEventListener('click', () => { camp = MISSIONS.length; mpOpen = true; save(); showMode(); });
// ---- multiplayer lobby
const mName = $('mName') as HTMLInputElement, mServer = $('mServer') as HTMLInputElement, mCode = $('mCode') as HTMLInputElement;
const defaultServer = () => /^https?:$/.test(location.protocol) && location.host ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' : '';
mName.value = pname; mServer.value = srv || defaultServer();
const mErr = (t: string) => { $('mErr').textContent = t; $('mErr2').textContent = t; };
const mDiffB = Array.from($('mDiff').querySelectorAll('button')) as HTMLButtonElement[], mMapB = Array.from($('mMaps').querySelectorAll('button')) as HTMLButtonElement[];
function showLobby(l: Lobby) {
  const inLobby = !!l.code; $('mJoin').hidden = inLobby || !mpOpen; $('mLobby').hidden = !inLobby; if (!inLobby) return;
  const host = l.host === l.you, me = l.players.find(p => p.id === l.you);
  $('mCodeShow').textContent = l.code; $('mHint').textContent = host ? 'Read the code out to your crew. You pick the map and start the shift when everyone is ready.' : 'Waiting for the host to start. Hit Ready when you are.';
  $('mPlayers').innerHTML = l.players.map(p => `<button type="button" disabled class="${p.ready || p.id === l.host ? 'dn' : ''}${p.team ? ' v' : ''}">${p.team ? 'Veyl Chorus' : p.id === l.host ? 'Host' : 'Crew'}<b>${p.name.replace(/[<>&]/g, '')}</b><small>${p.id === l.host ? 'Runs the shift' : p.ready ? 'Ready' : 'Not ready'}</small></button>`).join('');
  mDiffB.forEach((b, i) => { b.classList.toggle('on', i === l.diff); b.disabled = !host; }); mMapB.forEach((b, i) => { b.classList.toggle('on', i === l.map); b.disabled = !host; });
  $('mSide').textContent = me && me.team ? 'Play as Ironhold' : 'Play as the Veyl'; if (l.players.some(p => p.team)) $('mHint').textContent = (host ? 'Versus shift. ' : 'Versus shift. ') + 'Veyl players drive the raids against the Ironhold crew. ' + (host ? 'You start it when everyone is ready.' : 'Hit Ready when you are.');
  $('mStart').hidden = !host; $('mReady').hidden = host; $('mReady').textContent = me && me.ready ? 'Not ready' : 'Ready'; ($('mStart') as HTMLButtonElement).disabled = !l.players.every(p => p.ready || p.id === l.host);
}
async function mpConnect(then: (n: Net) => void) {
  pname = mName.value.trim().slice(0, 14) || 'Rigger'; srv = mServer.value.trim(); save(); mErr('');
  if (!srv) { mErr('This copy of the game is not on a game server, so there is nobody to connect to. Open the game from its server address, or paste a server address above.'); return; }
  if (net && net.open) { then(net); return; }
  mErr('Connecting...'); const n = new Net();
  n.onLobby = l => { showLobby(l); if (l.code) { mErr(''); lastCode = l.code; } }; n.onError = m => mErr(m);
  n.onClose = () => { net = null; if (game.net) { game.net = null; toMenu(); } showMode(); if (lastCode) { mCode.value = lastCode; mErr('Lost the connection. Press Join to get back into lobby ' + lastCode + '.'); } else mErr('Lost the connection to the server.'); };
  n.onBegin = m => {
    mode = 'multi'; hud.reset(); game = new Game(pipe, hud, DIFFS[m.diff], m.map, null, n); game.sens = sens; game.names = m.names; game.myTeam = m.team || 0; game.teams = m.teams || {}; if (m.ph) { game.applying = true; for (const r of m.ph) { const q = game.props[r[0]]; if (q && q.alive && q.hp > r[1]) game.damageProp(q, q.hp - r[1], null); } game.applying = false; } ended = false; (window as any).__ore.game = game;
    initAudio(); setVolume(vol); setMusic(mus); $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); game.phase = 'play'; game.introT = 1.8; lock();
  };
  try { await n.connect(srv); net = n; mErr(''); then(n); } catch (e) { mErr(String((e as Error).message || e) + ' Check the server address.'); }
}
$('mCreate').addEventListener('click', () => mpConnect(n => n.send({ t: 'create', name: pname })));
$('mJoinBtn').addEventListener('click', () => { const c = mCode.value.trim().toUpperCase(); if (c.length !== 5) { mErr('Lobby codes are five letters.'); return; } mpConnect(n => n.send({ t: 'join', code: c, name: pname })); });
mCode.addEventListener('keydown', e => { if (e.key === 'Enter') $('mJoinBtn').click(); });
$('mLeave').addEventListener('click', () => { net?.send({ t: 'leave' }); });
$('mSide').addEventListener('click', () => { const l = net?.lobby, me = l?.players.find(p => p.id === l.you); net?.send({ t: 'team', v: me && me.team ? 0 : 1 }); });
$('mReady').addEventListener('click', () => { const l = net?.lobby, me = l?.players.find(p => p.id === l.you); net?.send({ t: 'ready', v: !(me && me.ready) }); });
$('mStart').addEventListener('click', () => net?.send({ t: 'start' }));
mDiffB.forEach((b, i) => b.addEventListener('click', () => net?.send({ t: 'set', diff: i }))); mMapB.forEach((b, i) => b.addEventListener('click', () => net?.send({ t: 'set', map: i })));
showMode();
const diffBtns = Array.from($('diff').querySelectorAll('button')) as HTMLButtonElement[];
const showDiff = () => diffBtns.forEach((b, i) => { b.classList.toggle('on', i === diffI); b.setAttribute('aria-pressed', String(i === diffI)); });
diffBtns.forEach((b, i) => b.addEventListener('click', () => { diffI = i; showDiff(); save(); })); showDiff();
const mapBtns = Array.from($('maps').querySelectorAll('button')) as HTMLButtonElement[];
const showMap = () => mapBtns.forEach((b, i) => { b.classList.toggle('on', i === mapI); b.setAttribute('aria-pressed', String(i === mapI)); });
const pickMap = (i: number) => { mode = 'skirm'; mapI = i; showMap(); showMode(); save(); if (game.mapI !== mapI || game.mission) fresh(); };
mapBtns.forEach((b, i) => b.addEventListener('click', () => pickMap(i))); showMap();
const sensEl = $('sens') as HTMLInputElement, volEl = $('vol') as HTMLInputElement; sensEl.value = String(sens); volEl.value = String(vol);
sensEl.addEventListener('input', () => { sens = +sensEl.value; game.sens = sens; save(); });
volEl.addEventListener('input', () => { vol = +volEl.value; setVolume(vol); save(); });
const musEl = $('mus') as HTMLInputElement; musEl.checked = mus; musEl.addEventListener('change', () => { mus = musEl.checked; setMusic(mus); save(); syncOpts(); });
// ---- options tab
const sens2 = $('sens2') as HTMLInputElement, vol2 = $('vol2') as HTMLInputElement, mus2 = $('mus2') as HTMLInputElement, cbEl = $('cb') as HTMLInputElement, gfxB = Array.from($('gfx').querySelectorAll('button')) as HTMLButtonElement[];
function applyOpts() { document.body.classList.toggle('cb', cbOn); hud.cb = cbOn; pipe.shadowEvery = gfxI === 1 ? 3 : 1; hud.keyLabel = Object.keys(binds).length ? k => keyText(keyOf(k === 'Tab' || k === 'Space' ? k : 'Key' + k)) : null; resize(); }
function syncOpts() { sens2.value = sensEl.value = String(sens); vol2.value = volEl.value = String(vol); mus2.checked = musEl.checked = mus; cbEl.checked = cbOn; gfxB.forEach((b, i) => b.classList.toggle('on', i === gfxI)); }
function showKeys() { $('keys').innerHTML = ACTIONS.map(([a, label]) => `<button type="button" data-a="${a}" class="${rebinding === a ? 'on' : ''}">${label}<b>${rebinding === a ? 'Press a key' : keyText(keyOf(a))}</b></button>`).join(''); }
sens2.addEventListener('input', () => { sens = +sens2.value; game.sens = sens; save(); syncOpts(); }); vol2.addEventListener('input', () => { vol = +vol2.value; setVolume(vol); save(); syncOpts(); });
sensEl.addEventListener('input', syncOpts); volEl.addEventListener('input', syncOpts);
mus2.addEventListener('change', () => { mus = mus2.checked; setMusic(mus); save(); syncOpts(); });
cbEl.addEventListener('change', () => { cbOn = cbEl.checked; save(); applyOpts(); });
const fpsEl = $('fpsOn') as HTMLInputElement; fpsEl.checked = fpsOn; $('fps').hidden = !fpsOn; fpsEl.addEventListener('change', () => { fpsOn = fpsEl.checked; $('fps').hidden = !fpsOn; save(); });
gfxB.forEach((b, i) => b.addEventListener('click', () => { gfxI = i; quality = 1; save(); syncOpts(); applyOpts(); }));
$('keys').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return; rebinding = rebinding === b.dataset.a ? '' : b.dataset.a || ''; showKeys(); });
$('keysReset').addEventListener('click', () => { binds = {}; rebinding = ''; save(); showKeys(); applyOpts(); });
addEventListener('keydown', e => {
  if (!rebinding) return; e.preventDefault(); e.stopImmediatePropagation();
  if (e.code !== 'Escape') { const a = rebinding, was = keyOf(a), other = ACTIONS.find(([x]) => x !== a && keyOf(x) === e.code); if (other) { if (was === other[0]) delete binds[other[0]]; else binds[other[0]] = was; } if (e.code === a) delete binds[a]; else binds[a] = e.code; save(); }
  rebinding = ''; showKeys(); applyOpts();
}, true);
syncOpts(); showKeys(); applyOpts();
$('full').addEventListener('click', () => { try { const p: any = document.fullscreenElement ? document.exitFullscreen() : $('game').requestFullscreen(); if (p && p.catch) p.catch(() => { /* optional */ }); } catch (e) { /* optional */ } });

// ---------------------------------------------------------------- loop
let last = performance.now(), freeShown = false;
function frame(now: number) {
  const dt = (now - last) / 1000; last = now;
  // Without mouse capture, holding the cursor near a screen edge turns the view.
  if (freeMouse && moved && live() && !game.tab) { const ex = curX < .1 ? (curX - .1) / .1 : curX > .9 ? (curX - .9) / .1 : 0; game.mdx += ex * 900 * dt; }
  if (freeMouse !== freeShown) { freeShown = freeMouse; $('edgeNote').hidden = !freeMouse; $('freeNote').hidden = !freeMouse; }
  game.update(dt);
  if (fpsOn) { fpsN++; fpsT += dt; fpsWorst = Math.max(fpsWorst, dt); if (fpsT >= .5) { const info = pipe.renderer.info.render; $('fps').textContent = `${Math.round(fpsN / fpsT)} fps · worst ${Math.round(fpsWorst * 1000)} ms · ${pipe.w | 0}×${pipe.h | 0} · ${game.units.length} units`; fpsN = 0; fpsT = 0; fpsWorst = 0; void info; } }
  if (game.phase === 'over' && !ended) { ended = true; const m = game.mission; if (m && game.won) { const i = MISSIONS.indexOf(m); camp = Math.max(camp, i + 1); if (camp >= MISSIONS.length) mpOpen = true; save(); } $('again').textContent = game.net ? 'Back to the lobby' : m ? (game.won ? (MISSIONS.indexOf(m) < MISSIONS.length - 1 ? 'Next job' : 'Run it again') : 'Try that again') : 'Another shift'; }
  // Drop the render resolution if the machine can't keep up, and bring it back if it can.
  if (dt > .034) { slow++; fast = 0; } else if (dt < .02) { fast++; slow = Math.max(0, slow - 1); }
  if (gfxI === 0)
  if (slow > 50 && quality > .5) { quality = Math.max(.5, quality * .85); slow = 0; resize(); }
  if (gfxI === 0)
  if (fast > 900 && quality < 1) { quality = Math.min(1, quality / .85); fast = 0; resize(); }
  requestAnimationFrame(frame);
}
(window as any).__ore = { atlasUsed: MD.atlasUsed, game, start, pipe, hud, setFree: (v: boolean) => { freeMouse = v; }, pickMap, unlock: () => { camp = MISSIONS.length; mpOpen = true; mode = 'multi'; showMode(); }, net: () => net, pickJob: (i: number) => { mode = 'camp'; camp = Math.max(camp, i); jobI = i; showMode(); fresh(); } };
requestAnimationFrame(frame);
