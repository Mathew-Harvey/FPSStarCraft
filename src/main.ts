// Boot, input, the frame loop, and the menu screens.
import * as THREE from 'three';
import { Pipeline, V3, makeSky } from './gfx';
import * as MD from './models';
import { Game } from './game';
import { Hud } from './hud';
import { initAudio, setVolume, setMusic } from './audio';
import { UNIT, DIFFS, Kind } from './data';

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
  for (const kind of ['rigger', 'linesman', 'breacher', 'cantor', 'lancer', 'warden'] as Kind[]) {
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
let diffI = 1, sens = 1, vol = .5, mus = true, curX = .5, moved = false;
try { const o = JSON.parse(localStorage.getItem('ore-else') || '{}'); if (o.d >= 0 && o.d < 3) diffI = o.d; if (o.s > 0) sens = o.s; if (o.v >= 0) vol = o.v; if (o.m === false) mus = false; } catch (e) { /* storage is optional */ }
const save = () => { try { localStorage.setItem('ore-else', JSON.stringify({ d: diffI, s: sens, v: vol, m: mus })); } catch (e) { /* storage is optional */ } };
let game = new Game(pipe, hud, DIFFS[diffI]); game.sens = sens;
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

function fresh() { hud.reset(); game = new Game(pipe, hud, DIFFS[diffI]); game.sens = sens; (window as any).__ore.game = game; }
function start() { initAudio(); setVolume(vol); setMusic(mus); if (game.diff !== DIFFS[diffI]) fresh(); $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); game.phase = 'play'; game.introT = 1.8; lock(); }
function pause() { if (game.phase !== 'play' && game.phase !== 'card') return; game.phase = 'paused'; game.keys.clear(); game.lmb = game.rmb = false; $('pause').hidden = false; }
function resume() { if (game.phase !== 'paused') return; initAudio(); $('pause').hidden = true; game.phase = 'play'; lock(); }
$('start').addEventListener('click', start);
$('resume').addEventListener('click', resume);
$('again').addEventListener('click', () => { fresh(); start(); });
const diffBtns = Array.from($('diff').querySelectorAll('button')) as HTMLButtonElement[];
const showDiff = () => diffBtns.forEach((b, i) => { b.classList.toggle('on', i === diffI); b.setAttribute('aria-pressed', String(i === diffI)); });
diffBtns.forEach((b, i) => b.addEventListener('click', () => { diffI = i; showDiff(); save(); })); showDiff();
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
  // Drop the render resolution if the machine can't keep up, and bring it back if it can.
  if (dt > .034) { slow++; fast = 0; } else if (dt < .02) { fast++; slow = Math.max(0, slow - 1); }
  if (slow > 50 && quality > .5) { quality = Math.max(.5, quality * .85); slow = 0; resize(); }
  if (fast > 900 && quality < 1) { quality = Math.min(1, quality / .85); fast = 0; resize(); }
  requestAnimationFrame(frame);
}
(window as any).__ore = { atlasUsed: MD.atlasUsed, game, start, pipe, hud, setFree: (v: boolean) => { freeMouse = v; } };
requestAnimationFrame(frame);
