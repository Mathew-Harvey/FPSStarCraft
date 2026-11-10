// Boot, input, the frame loop, and the menu screens.
import * as THREE from 'three';
import { Pipeline, V3, makeSky } from './gfx';
import * as MD from './models';
import { Game } from './game';
import { Hud } from './hud';
import { initAudio } from './audio';

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
  for (const [kind, make, y, dist] of [['rigger', () => MD.rigger(), 1.45, 2.5], ['linesman', () => MD.trooper(), 1.5, 2.5], ['cantor', () => MD.cantor(), 2.3, 3.2]] as [string, () => MD.Model, number, number][]) {
    const m = make(); m.obj.rotation.y = .5; scene.add(m.obj);
    cam.position.set(0, y + .15, dist); cam.lookAt(0, y, 0); cam.updateMatrixWorld();
    pipe.draw(scene, cam, V3(0, 0, 0), 8);
    hud.portraits[kind] = canvas.toDataURL('image/jpeg', .85);
    scene.remove(m.obj);
  }
}

portraits();
pipe.w = 0; resize();
let game = new Game(pipe, hud);
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- input
const locked = () => document.pointerLockElement === canvas;
const live = () => game.phase === 'play' || game.phase === 'card';
addEventListener('keydown', e => {
  if (live()) { if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Digit') || e.code === 'KeyF' || e.code === 'KeyG') e.preventDefault(); if (!e.repeat) game.pressed.add(e.code); game.keys.add(e.code); }
  if (e.code === 'Escape' && freeMouse) { if (game.phase === 'play') pause(); else if (game.phase === 'paused') resume(); }
});
addEventListener('keyup', e => game.keys.delete(e.code));
addEventListener('blur', () => { game.keys.clear(); game.lmb = false; });
canvas.addEventListener('mousedown', e => { if (!live()) return; e.preventDefault(); game.pressed.add('Mouse' + e.button); if (e.button === 0) game.lmb = true; if (!locked() && !freeMouse) lock(); });
addEventListener('mouseup', e => { if (e.button === 0) game.lmb = false; });
addEventListener('mousemove', e => { if (live() && (locked() || freeMouse)) { game.mdx += e.movementX || 0; game.mdy += e.movementY || 0; } });
addEventListener('wheel', e => { if (live()) { game.wheel = Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('auxclick', e => e.preventDefault());

function lock() { try { const p: any = (canvas as any).requestPointerLock(); if (p && p.catch) p.catch(() => { freeMouse = true; }); } catch (e) { freeMouse = true; } }
document.addEventListener('pointerlockerror', () => { freeMouse = true; });
document.addEventListener('pointerlockchange', () => { if (!locked() && live() && !freeMouse) pause(); });

function start() { initAudio(); $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); game.phase = 'play'; lock(); }
function pause() { if (game.phase !== 'play' && game.phase !== 'card') return; game.phase = 'paused'; game.keys.clear(); game.lmb = false; $('pause').hidden = false; }
function resume() { if (game.phase !== 'paused') return; initAudio(); $('pause').hidden = true; game.phase = 'play'; lock(); }
$('start').addEventListener('click', start);
$('resume').addEventListener('click', resume);
$('again').addEventListener('click', () => { hud.reset(); game = new Game(pipe, hud); (window as any).__ore.game = game; start(); });

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now: number) {
  const dt = (now - last) / 1000; last = now;
  game.update(dt);
  // Drop the render resolution if the machine can't keep up, and bring it back if it can.
  if (dt > .034) { slow++; fast = 0; } else if (dt < .02) { fast++; slow = Math.max(0, slow - 1); }
  if (slow > 50 && quality > .5) { quality = Math.max(.5, quality * .85); slow = 0; resize(); }
  if (fast > 900 && quality < 1) { quality = Math.min(1, quality / .85); fast = 0; resize(); }
  requestAnimationFrame(frame);
}
(window as any).__ore = { game, start, pipe, hud, setFree: (v: boolean) => { freeMouse = v; } };
requestAnimationFrame(frame);
