// Boot, input, the frame loop, and the menu screens.
import * as THREE from 'three';
import { Pipeline, V3, makeSky } from './gfx';
import * as MD from './models';
import { Game } from './game';
import { Hud } from './hud';
import { initAudio, setVolume, setMusic } from './audio';
import { UNIT, DIFFS, Kind } from './data';
import { MISSIONS } from './campaign';

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
  const sc = Math.min(Math.min(window.devicePixelRatio || 1, 1.5), 1080 / h) * quality;
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
let camp = 0, mpOpen = false, mode = 'camp', jobI = 0;
let diffI = 1, mapI = 0, sens = 1, vol = .5, mus = true, curX = .5, moved = false;
try { const o = JSON.parse(localStorage.getItem('ore-else') || '{}'); if (o.d >= 0 && o.d < 3) diffI = o.d; if (o.map >= 0 && o.map < 3) mapI = o.map; if (o.camp > 0) camp = Math.min(MISSIONS.length, o.camp); if (o.mp) mpOpen = true; if (o.mode === 'skirm') mode = 'skirm'; if (o.s > 0) sens = o.s; if (o.v >= 0) vol = o.v; if (o.m === false) mus = false; } catch (e) { /* storage is optional */ }
const save = () => { try { localStorage.setItem('ore-else', JSON.stringify({ d: diffI, map: mapI, camp, mp: mpOpen, mode, s: sens, v: vol, m: mus })); } catch (e) { /* storage is optional */ } };
jobI = Math.min(camp, MISSIONS.length - 1);
const want = () => mode === 'camp' ? { d: DIFFS[MISSIONS[jobI].diff], map: MISSIONS[jobI].map, m: MISSIONS[jobI] } : { d: DIFFS[diffI], map: mapI, m: null };
let game = new Game(pipe, hud, want().d, want().map, want().m); game.sens = sens;
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- input
const locked = () => document.pointerLockElement === canvas;
const live = () => game.phase === 'play' || game.phase === 'card';
addEventListener('keydown', e => {
  if (live()) { if (!e.ctrlKey && !e.metaKey && e.code !== 'Escape' && !/^F\d/.test(e.code)) e.preventDefault(); if (!e.repeat) game.pressed.add(e.code); game.keys.add(e.code); }
  if (e.code === 'Escape' && freeMouse) { if (game.phase === 'play') pause(); else if (game.phase === 'paused') resume(); }
});
addEventListener('keyup', e => game.keys.delete(e.code));
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
function pause() { if (game.phase !== 'play' && game.phase !== 'card') return; game.phase = 'paused'; game.keys.clear(); game.lmb = game.rmb = false; $('pause').hidden = false; }
function resume() { if (game.phase !== 'paused') return; initAudio(); $('pause').hidden = true; game.phase = 'play'; lock(); }
$('start').addEventListener('click', start);
$('resume').addEventListener('click', resume);
$('again').addEventListener('click', () => { if (game.mission && game.won && jobI < MISSIONS.length - 1) jobI++; fresh(); start(); });
$('startJob').addEventListener('click', start);
function toMenu() { $('end').hidden = true; $('pause').hidden = true; hud.show(false); showMode(); fresh(); $('menu').hidden = false; }
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
  modeBtns.forEach(b => { const on = b.dataset.m === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  $('pCamp').hidden = mode !== 'camp'; $('pSkirm').hidden = mode !== 'skirm'; $('pMulti').hidden = mode !== 'multi';
  $('multiBtn').classList.toggle('locked', !mpOpen); $('multiNote').textContent = mpOpen ? 'Unlocked' : 'Locked. Finish the campaign.';
  $('mTitle').textContent = mpOpen ? 'Joint operations: cleared' : 'Joint operations: locked';
  $('mText').textContent = mpOpen ? 'You are cleared for multiplayer. Lobbies open as soon as the game server is switched on, which is the next part of the build. Until then, Skirmish has all three maps.' : 'The Charter does not let strangers share a payroll. Finish the five campaign jobs to unlock multiplayer, or use the unlock button on the Campaign tab if you have done them before.';
  showJobs();
}
modeBtns.forEach(b => b.addEventListener('click', () => { mode = b.dataset.m || 'camp'; save(); showMode(); if (mode !== 'multi') { const w = want(); if (game.mapI !== w.map || game.mission !== w.m) fresh(); } }));
$('jobs').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b || b.disabled) return; jobI = +(b.dataset.j || 0); showJobs(); const w = want(); if (game.mapI !== w.map || game.mission !== w.m) fresh(); });
$('skipCamp').addEventListener('click', () => { camp = MISSIONS.length; mpOpen = true; save(); showMode(); });
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
const musEl = $('mus') as HTMLInputElement; musEl.checked = mus; musEl.addEventListener('change', () => { mus = musEl.checked; setMusic(mus); save(); });
$('full').addEventListener('click', () => { try { const p: any = document.fullscreenElement ? document.exitFullscreen() : $('game').requestFullscreen(); if (p && p.catch) p.catch(() => { /* optional */ }); } catch (e) { /* optional */ } });

// ---------------------------------------------------------------- loop
let last = performance.now(), freeShown = false;
function frame(now: number) {
  const dt = (now - last) / 1000; last = now;
  // Without mouse capture, holding the cursor near a screen edge turns the view.
  if (freeMouse && moved && live() && !game.tab) { const ex = curX < .1 ? (curX - .1) / .1 : curX > .9 ? (curX - .9) / .1 : 0; game.mdx += ex * 900 * dt; }
  if (freeMouse !== freeShown) { freeShown = freeMouse; $('edgeNote').hidden = !freeMouse; $('freeNote').hidden = !freeMouse; }
  game.update(dt);
  if (game.phase === 'over' && !ended) { ended = true; const m = game.mission; if (m && game.won) { const i = MISSIONS.indexOf(m); camp = Math.max(camp, i + 1); if (camp >= MISSIONS.length) mpOpen = true; save(); } $('again').textContent = m ? (game.won ? (MISSIONS.indexOf(m) < MISSIONS.length - 1 ? 'Next job' : 'Run it again') : 'Try that again') : 'Another shift'; }
  // Drop the render resolution if the machine can't keep up, and bring it back if it can.
  if (dt > .034) { slow++; fast = 0; } else if (dt < .02) { fast++; slow = Math.max(0, slow - 1); }
  if (slow > 50 && quality > .5) { quality = Math.max(.5, quality * .85); slow = 0; resize(); }
  if (fast > 900 && quality < 1) { quality = Math.min(1, quality / .85); fast = 0; resize(); }
  requestAnimationFrame(frame);
}
(window as any).__ore = { atlasUsed: MD.atlasUsed, game, start, pipe, hud, setFree: (v: boolean) => { freeMouse = v; }, pickMap, pickJob: (i: number) => { mode = 'camp'; camp = Math.max(camp, i); jobI = i; showMode(); fresh(); } };
requestAnimationFrame(frame);
