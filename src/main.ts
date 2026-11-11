// Boot, input, the frame loop, and the menu screens.
import * as THREE from 'three';
import { Pipeline, ViewPipe, V3, makeSky } from './gfx';
import * as MD from './models';
import { Game } from './game';
import { Hud } from './hud';
import { initAudio, setVolume, setMusic, audioSeat, hush } from './audio';
import { LocalMatch } from './split';
import { UNIT, BLD, UPGRADES, TRAINS, UNIT_NEEDS, DIFFS, Kind, BKind } from './data';
import { MISSIONS } from './campaign';
import { Net, Lobby } from './net';

THREE.ColorManagement.enabled = false;
const $ = (id: string) => document.getElementById(id)!;
const canvas = $('c') as HTMLCanvasElement;
const pipe = new Pipeline(canvas);
// Player two's HUD in split screen is a copy of the first, made before the first one fills itself in.
const hudEl2 = $('hud').cloneNode(true) as HTMLElement; hudEl2.querySelector('#chat')?.remove(); hudEl2.classList.add('p2');
{ const j = document.createElement('div'); j.className = 'p2join c out'; j.id = 'p2join'; hudEl2.appendChild(j); }
$('hud').after(hudEl2);
{ const bar = document.createElement('div'); bar.id = 'splitBar'; hudEl2.after(bar); }
const hud = new Hud(), hud2 = new Hud(hudEl2);
const view1 = new ViewPipe(pipe), view2 = new ViewPipe(pipe);
/** Split screen: the match both halves are playing, and player two's copy of the game. */
let split: LocalMatch | null = null, game2: Game | null = null, splitSide = true, splitVs = false;
let quality = 1, slow = 0, fast = 0;
/** True when the browser would not lock the mouse, so the game runs with a free cursor instead. */
let freeMouse = false;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const sc = Math.min(Math.min(window.devicePixelRatio || 1, 1.5), 1080 / h) * (gfxI === 1 ? .6 : gfxI === 2 ? .8 : gfxI === 3 ? 1 : quality);
  if (split) {
    const vw = splitSide ? w / 2 : w, vh = splitSide ? h : h / 2; pipe.resize(vw * sc, vh * sc, w * sc, h * sc);
    const W = pipe.w, H = pipe.h; view1.rect = splitSide ? [0, 0, W, H] : [0, pipe.ch - H, W, H]; view2.rect = splitSide ? [pipe.cw - W, 0, W, H] : [0, 0, W, H];
    hud.setSize(vw, vh); hud2.setSize(vw, vh, splitSide ? w / 2 : 0, splitSide ? 0 : h / 2); return;
  }
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

portraits(); hud2.portraits = hud.portraits;
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
try { const o = JSON.parse(localStorage.getItem('ore-else') || '{}'); if (o.d >= 0 && o.d < 3) diffI = o.d; if (o.map >= 0 && o.map < 3) mapI = o.map; if (o.camp > 0) camp = Math.min(MISSIONS.length, o.camp); if (o.mp) mpOpen = true; if (o.mode === 'skirm') mode = 'skirm'; if (typeof o.name === 'string') pname = o.name.slice(0, 14); if (typeof o.srv === 'string') srv = o.srv.slice(0, 200); if (o.s > 0) sens = o.s; if (o.v >= 0) vol = o.v; if (o.m === false) mus = false; if (o.q >= 0 && o.q < 4) gfxI = o.q | 0; cbOn = !!o.cb; fpsOn = !!o.fps; splitSide = o.ss !== 0; if (o.k && typeof o.k === 'object') for (const [a] of ACTIONS) if (typeof o.k[a] === 'string' && o.k[a] !== a) binds[a] = o.k[a]; } catch (e) { /* storage is optional */ }
const save = () => { try { localStorage.setItem('ore-else', JSON.stringify({ d: diffI, map: mapI, camp, mp: mpOpen, mode: mode === 'multi' ? 'camp' : mode, name: pname, srv, s: sens, v: vol, m: mus, q: gfxI, cb: cbOn, fps: fpsOn, ss: splitSide ? 1 : 0, k: binds })); } catch (e) { /* storage is optional */ } };
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
  if (split && game2 && !padTwo && logical(e.code) === e.code && P2KEYS[e.code]) { if (live()) { e.preventDefault(); const k = P2KEYS[e.code]; if (k === 'Tool') { if (!e.repeat) game2.pressed.add(game2.myTeam ? 'Digit' + ((game2.verse + 1) % 3 + 1) : game2.tool === 2 ? 'Digit1' : 'Digit2'); } else if (k === 'Wheel-' || k === 'Wheel+') { if (!e.repeat) game2.wheel = k === 'Wheel+' ? 1 : -1; } else if (k === 'Mouse0' || k === 'Mouse2') { if (!e.repeat) game2.pressed.add(k); if (k === 'Mouse0') game2.lmb = true; else game2.rmb = true; } else if (k.startsWith('Look')) look2.add(k); else { if (!e.repeat) game2.pressed.add(k); game2.keys.add(k); } p2Seen = true; } return; }
  if (game.net && !split && game.phase === 'play' && code === 'Enter') { e.preventDefault(); game.keys.clear(); chat.hidden = false; chat.focus(); return; }
  if (live()) { if (!e.ctrlKey && !e.metaKey && e.code !== 'Escape' && !/^F\d/.test(e.code)) e.preventDefault(); if (!e.repeat) game.pressed.add(code); game.keys.add(code); }
  if (e.code === 'Escape' && freeMouse) { if (game.phase === 'play' || game.phase === 'card') pause(); else if (game.phase === 'paused') resume(); }
});
addEventListener('keyup', e => { const k = split && game2 && logical(e.code) === e.code ? P2KEYS[e.code] : ''; if (k && game2) { if (k === 'Mouse0') game2.lmb = false; else if (k === 'Mouse2') game2.rmb = false; else if (k.startsWith('Look')) look2.delete(k); else game2.keys.delete(k); if (!padTwo) return; } game.keys.delete(logical(e.code)); });
addEventListener('blur', () => { game.keys.clear(); game.lmb = game.rmb = false; if (game2) { game2.keys.clear(); game2.lmb = game2.rmb = false; } look2.clear(); });
canvas.addEventListener('mousedown', e => { if (!live()) return; e.preventDefault(); game.pressed.add('Mouse' + e.button); if (e.button === 0) game.lmb = true; if (e.button === 2) game.rmb = true; if (!locked() && !freeMouse) lock(); });
addEventListener('mouseup', e => { if (e.button === 0) game.lmb = false; if (e.button === 2) game.rmb = false; });
addEventListener('mousemove', e => { curX = e.clientX / innerWidth; if (e.movementX || e.movementY) moved = true; if (live() && (locked() || freeMouse)) { game.mdx += e.movementX || 0; game.mdy += e.movementY || 0; } });
addEventListener('wheel', e => { if (live()) { game.wheel = Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('auxclick', e => e.preventDefault());

function lock() { try { const p: any = (canvas as any).requestPointerLock(); if (p && p.catch) p.catch(() => { freeMouse = true; }); } catch (e) { freeMouse = true; } }
document.addEventListener('pointerlockerror', () => { freeMouse = true; });
document.addEventListener('pointerlockchange', () => { if (!locked() && live() && !freeMouse) pause(); });

function fresh() { endSplit(); hush(); hud.reset(); const w = want(); game.dispose(); game = new Game(pipe, hud, w.d, w.map, w.m); game.sens = sens; ended = false; (window as any).__ore.game = game; }
function start() { initAudio(); setVolume(vol); setMusic(mus); { const w = want(); if (game.diff !== w.d || game.mapI !== w.map || game.mission !== w.m || game.time > 0) fresh(); } $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); game.phase = 'play'; game.introT = 1.8; lock(); }
/** The pause screen shows the whole tech tree: what is standing, what can be built next and what each building sells. */
function showTree() {
  const g = game, tiers: BKind[][] = [['headframe'], ['bunkhouse', 'depot'], ['watchpost', 'machineshop', 'assay'], ['foundry'], ['mast']];
  $('tree').innerHTML = tiers.map(row => `<div class="tier">${row.map(k => {
    const have = g.ownB(k, true).length > 0, miss = g.missing(k), off = !!g.mission && k !== 'headframe' && !g.mission.allow.includes(k);
    const units = (TRAINS[k] || []).map(u => { const nb = UNIT_NEEDS[u], ok = have && (!nb || g.ownB(nb, true).length > 0); return `<li class="${ok ? 'ok' : ''}"><b>${UNIT[u].name}</b><small>${nb ? 'Needs ' + BLD[nb].name : 'Unit'} · ${UNIT[u].cost}</small></li>`; }).join('');
    const ups = UPGRADES.filter(u => u.at === k).map(u => { const nu = u.needs ? UPGRADES.find(x => x.key === u.needs)! : null; return `<li class="${g.up[u.key] ? 'dn' : have && (!nu || g.up[nu.key]) ? 'ok' : ''}"><b>${u.name}</b><small>${g.up[u.key] ? 'Bought' : u.blurb + ' · ' + u.cost}${nu && !g.up[u.key] ? ' · after ' + nu.name : ''}</small></li>`; }).join('');
    return `<div class="node ${have ? 'have' : off || miss.length ? 'lock' : 'can'}"><h4>${BLD[k].name}</h4><p>${have ? 'Standing' : off ? 'Not on this job' : miss.length ? 'Needs ' + miss.map(n => BLD[n].name).join(' and ') : k === 'headframe' ? '' : 'Ready to build · ' + BLD[k].cost}</p>${units || ups ? `<ul>${units}${ups}</ul>` : `<ul><li class="${have ? 'ok' : ''}"><small>${BLD[k].blurb}</small></li></ul>`}</div>`;
  }).join('')}</div>`).join('');
}
function pause() { if (game.phase !== 'play' && game.phase !== 'card') return; hush(); showTree(); for (const g of [game, game2]) if (g && g.phase === 'card') g.hud.titleCard('', '', ''); if (game2) { game2.phase = 'paused'; game2.keys.clear(); game2.lmb = game2.rmb = false; look2.clear(); } if (game.net) { game.phase = 'paused'; game.keys.clear(); game.lmb = game.rmb = false; $('pause').hidden = false; return; } game.phase = 'paused'; game.keys.clear(); game.lmb = game.rmb = false; $('pause').hidden = false; }
function resume(byPad = false) { if (game.phase !== 'paused') return; initAudio(); $('pause').hidden = true; game.phase = 'play'; if (game2) game2.phase = 'play'; if (!byPad) lock(); }
$('start').addEventListener('click', start);
$('resume').addEventListener('click', () => resume());
$('again').addEventListener('click', () => { if (split) { startSplit(splitVs); return; } if (game.net) { toMenu(); return; } if (game.mission && game.won && jobI < MISSIONS.length - 1) jobI++; fresh(); start(); });
$('startJob').addEventListener('click', start);
function toMenu() { $('end').hidden = true; $('pause').hidden = true; hud.show(false); if (document.pointerLockElement) document.exitPointerLock(); showMode(); fresh(); $('menu').hidden = false; }
$('toMenu').addEventListener('click', toMenu);
/** Walks out of a shift that is still running. Online, that means leaving the lobby too, so nobody is left holding an empty body. */
function quit() { if (net && game.net === net) { net.send({ t: 'leave' }); net.inbox.length = 0; game.net = null; } toMenu(); }
$('quit').addEventListener('click', quit);
// ---- split screen
/** Player two without a controller: the right-hand side of the keyboard. Values are the keys the game code listens for. */
const P2KEYS: Record<string, string> = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD', KeyI: 'LookU', KeyK: 'LookD', KeyJ: 'LookL', KeyL: 'LookR', KeyO: 'Mouse0', KeyP: 'Mouse2', KeyH: 'KeyE', KeyN: 'KeyR', KeyM: 'KeyC', Semicolon: 'KeyF', Quote: 'Tab', Comma: 'Wheel-', Period: 'Wheel+', Slash: 'Tool', ShiftRight: 'ShiftLeft', ControlRight: 'Space', Digit8: 'KeyT', Digit9: 'KeyY', Digit0: 'KeyU', Backspace: 'KeyQ', Backslash: 'Mouse1', Minus: 'KeyV', BracketLeft: 'KeyZ', BracketRight: 'KeyX' };
const PADKEYS: Record<string, string> = { E: 'Y', R: 'X', C: 'B', F: 'RB', Tab: 'LB', Space: 'A', RMB: 'LT', T: '◄', Y: '▲', U: '►', Q: '▼', Z: '▲', X: '▼', V: 'Back', B: 'R3', MMB: 'R3' };
const KBDKEYS: Record<string, string> = { E: 'H', R: 'N', C: 'M', F: ';', Tab: "'", Space: 'R Ctrl', RMB: 'P', T: '8', Y: '9', U: '0', Q: 'Bksp', MMB: '\\', V: '-', Z: '[', X: ']' };
const look2 = new Set<string>();
/** True once player two has a controller. Until then the keyboard fallback is live. */
let padTwo = false, padBlocked = false, p2Seen = false, p2Hint = 0;
const padHeld: Set<string>[] = [new Set(), new Set()], padWas: boolean[][] = [[], []], padRun = [false, false], padFire = [[false, false], [false, false]];
function pads(): Gamepad[] { try { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(p => !!p && p.connected && p.buttons.length >= 10) as Gamepad[]; } catch (e) { padBlocked = true; return []; } }
/** Turns one controller into the keys and mouse movement the game already understands. */
function padDrive(g: Game, p: Gamepad, slot: number, dt: number) {
  const ax = (i: number) => { const v = p.axes[i] || 0, a = Math.abs(v); return a < .18 ? 0 : Math.sign(v) * (a - .18) / .82; };
  const was = padWas[slot], down = (i: number) => !!p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > .35), hit = (i: number) => down(i) && !was[i];
  const mine = padHeld[slot], hold = (code: string, on: boolean) => { if (on) { if (!mine.has(code)) { mine.add(code); g.keys.add(code); g.pressed.add(code); } } else if (mine.has(code)) { mine.delete(code); g.keys.delete(code); } };
  const tap = (i: number, code: string) => { if (hit(i)) g.pressed.add(code); };
  if (game.phase === 'play' || game.phase === 'card') {
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    hold('KeyW', ly < -.3); hold('KeyS', ly > .3); hold('KeyA', lx < -.3); hold('KeyD', lx > .3);
    if (hit(10)) padRun[slot] = true; if (ly > -.5) padRun[slot] = false; hold('ShiftLeft', padRun[slot]);
    g.mdx += rx * (.35 + .65 * Math.abs(rx)) * 1500 * dt; g.mdy += ry * (.35 + .65 * Math.abs(ry)) * 1000 * dt;
    const f = padFire[slot], rt = down(7), lt = down(6);
    if (rt !== f[0]) { f[0] = rt; g.lmb = rt; if (rt) g.pressed.add('Mouse0'); } if (lt !== f[1]) { f[1] = lt; g.rmb = lt; if (lt) g.pressed.add('Mouse2'); }
    tap(0, 'Space'); tap(1, 'KeyC'); tap(2, 'KeyR'); tap(3, 'KeyE'); tap(5, 'KeyF'); tap(8, 'KeyV'); tap(11, 'Mouse1'); if (g.net && hit(11)) g.pressed.add('KeyB');
    hold('Tab', down(4));
    // the D-pad does whatever the screen is offering
    const pr = g.prompt || '', train = /<b>[TYU]<\/b>/.test(pr), picking = g.tab || (g.tool === 2 && g.me?.kind === 'rigger'), call = !!g.dir.callout;
    if (train) { tap(14, 'KeyT'); tap(12, 'KeyY'); tap(15, 'KeyU'); }
    else { if (picking) { if (hit(14)) g.wheel = -1; if (hit(15)) g.wheel = 1; } if (call) { tap(12, 'KeyZ'); tap(13, 'KeyX'); } else { if (hit(12) && g.myTeam) g.pressed.add('Digit' + ((g.verse + 1) % 3 + 1)); else if (hit(12) && g.me?.kind === 'rigger') g.pressed.add(g.tool === 2 ? 'Digit1' : 'Digit2'); tap(13, 'KeyQ'); } }
    if (hit(9)) pause();
  } else if (game.phase === 'paused' && hit(9)) resume(true);
  for (let i = 0; i < p.buttons.length; i++) was[i] = down(i);
}
function padPoll(dt: number) {
  if (!game2) return; const ps = pads();
  // One controller belongs to player two. With two, player one may use the first and keep the keyboard as well.
  const two = ps.length > 1 ? ps[1] : ps[0], one = ps.length > 1 ? ps[0] : null;
  if (!!two !== padTwo) { padTwo = !!two; look2.clear(); game2.keys.clear(); game2.lmb = game2.rmb = false; padHeld[1].clear(); p2Labels(); }
  if (one) padDrive(game, one, 0, dt); if (two) { padDrive(game2, two, 1, dt); if (two.buttons.some(b => b.pressed) || two.axes.some(a => Math.abs(a) > .5)) p2Seen = true; }
  else if (game.phase === 'play') { const lx = (look2.has('LookR') ? 1 : 0) - (look2.has('LookL') ? 1 : 0), ly = (look2.has('LookD') ? 1 : 0) - (look2.has('LookU') ? 1 : 0); game2.mdx += lx * 1100 * dt; game2.mdy += ly * 700 * dt; }
  p2Hint += dt; $('p2join').hidden = p2Seen || p2Hint > 40 || game.phase !== 'play';
}
/** Player two's HUD names controller buttons, or the right-hand keys when there is no controller. */
function p2Labels() {
  const m = padTwo ? PADKEYS : KBDKEYS; hud2.relabel(k => m[k] ?? k);
  hudEl2.querySelector('.jump .foot')!.innerHTML = padTwo ? 'D-pad left or right to pick · Let go of <span class="k">LB</span> to jump' : 'Comma or full stop to pick · Let go of <span class="k">\'</span> to jump';
  hudEl2.querySelector('#build p')!.textContent = padTwo ? 'D-pad left or right pick · X rotate · RT place · D-pad up puts it away' : 'Comma or full stop pick · N rotate · O place · / puts it away';
  $('p2join').innerHTML = padTwo ? '<b>Player two</b>Left stick moves · right stick looks · RT fires · LT aims · hold LB to jump bodies · D-pad up for the build menu' : padBlocked ? '<b>Player two</b>This page is not allowed to read controllers, so player two is on the keyboard: arrows move · I J K L look · O fires · P aims · H uses · / build menu' : '<b>Player two</b>Press any button on a controller to take over this half. No controller? Arrows move · I J K L look · O fires · P aims · H uses · / build menu';
  if (game2 && game2.myTeam) $('p2join').innerHTML = $('p2join').innerHTML.replace(/H uses · \/ build menu/g, 'H calls the raid · / changes its verse').replace('D-pad up for the build menu', 'Y calls the raid · D-pad up changes its verse');
}
function startSplit(versus = splitVs) {
  splitVs = versus === true; initAudio(); setVolume(vol); setMusic(mus); mode = 'skirm'; hud.reset(); hud2.reset();
  const prev = split, m = split = new LocalMatch(mapI, diffI, 2, splitVs), mk = (i: number) => { const g = new Game(i ? view2 : view1, i ? hud2 : hud, DIFFS[diffI], mapI, null, m.seats[i]); g.sens = i ? 1 : sens; g.names = m.names; g.teams = m.teams; g.myTeam = m.teams[i + 1] || 0; g.phase = 'play'; g.introT = 1.8; return g; };
  const old = [game, game2, prev?.host]; game = mk(0); game2 = mk(1); for (const g of old) if (g && g !== game) g.dispose(); view1.time = view2.time = pipe.time; ended = false; (window as any).__ore.game = game;
  padTwo = pads().length > 0; p2Seen = false; p2Hint = 0; padHeld[0].clear(); padHeld[1].clear(); look2.clear(); p2Labels();
  $('game').classList.add('split'); $('game').classList.toggle('stack', !splitSide);
  $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); hud2.show(true); resize(); lock();
}
function endSplit() { if (!split && !game2) return; split?.host.dispose(); game2?.dispose(); split = null; game2 = null; hud2.show(false); $('game').classList.remove('split', 'stack'); pipe.w = 0; resize(); }
$('startSplit').addEventListener('click', () => startSplit(false)); $('startSplitVs').addEventListener('click', () => startSplit(true));
const splitBtns = Array.from($('splitDir').querySelectorAll('button')) as HTMLButtonElement[];
const showSplit = () => splitBtns.forEach((b, i) => { const on = (i === 0) === splitSide; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
splitBtns.forEach((b, i) => b.addEventListener('click', () => { splitSide = i === 0; showSplit(); save(); })); showSplit();
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
  $('mText').textContent = mpOpen ? 'You are cleared for multiplayer. Make a lobby and read its code out to your crew, or join one with theirs. Two players on one machine can play split screen from the Skirmish tab.' : 'The Charter does not let strangers share a payroll. Finish the five campaign jobs to unlock multiplayer, or use the unlock button on the Campaign tab if you have done them before.';
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
  n.onClose = () => { net = null; if (game.net === n) { game.net = null; toMenu(); } showMode(); if (lastCode) { mCode.value = lastCode; mErr('Lost the connection. Press Join to get back into lobby ' + lastCode + '.'); } else mErr('Lost the connection to the server.'); };
  n.onBegin = m => {
    endSplit(); mode = 'multi'; hud.reset(); game.dispose(); game = new Game(pipe, hud, DIFFS[m.diff], m.map, null, n); game.sens = sens; game.names = m.names; game.myTeam = m.team || 0; game.teams = m.teams || {}; if (m.ph) { game.applying = true; for (const r of m.ph) { const q = game.props[r[0]]; if (q && q.alive && q.hp > r[1]) game.damageProp(q, q.hp - r[1], null); } game.applying = false; } ended = false; (window as any).__ore.game = game;
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
function applyOpts() { document.body.classList.toggle('cb', cbOn); hud.cb = hud2.cb = cbOn; pipe.shadowEvery = gfxI === 1 ? 3 : 1; hud.keyLabel = Object.keys(binds).length ? k => keyText(keyOf(k === 'Tab' || k === 'Space' ? k : 'Key' + k)) : null; resize(); }
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
  if (split && game2) {
    if (game.phase !== 'paused') split.frame(dt);
    padPoll(dt);
    audioSeat(.65, 0); game.update(dt); audioSeat(.65, 1); game2.update(dt); audioSeat(1, 0);
  } else game.update(dt);
  if (fpsOn) { fpsN++; fpsT += dt; fpsWorst = Math.max(fpsWorst, dt); if (fpsT >= .5) { const info = pipe.renderer.info.render; $('fps').textContent = `${Math.round(fpsN / fpsT)} fps · worst ${Math.round(fpsWorst * 1000)} ms · ${pipe.w | 0}×${pipe.h | 0} · ${game.units.length} units`; fpsN = 0; fpsT = 0; fpsWorst = 0; void info; } }
  if (game.phase === 'over' && !ended && split && splitVs && game2) { $('endTitle').textContent = game.won ? 'Ironhold holds the valley' : 'The Veyl take the valley'; $('endTitle').className = 'logo sm'; $('endLine').textContent = game.won ? 'Player one broke every Choir Stone. Player two, the singing has stopped.' : 'Player two broke the Headframe. Player one, the Charter will be billing your next of kin.'; }
  if (game.phase === 'over' && !ended) { ended = true; const m = game.mission; if (m && game.won) { const i = MISSIONS.indexOf(m); camp = Math.max(camp, i + 1); if (camp >= MISSIONS.length) mpOpen = true; save(); } $('again').textContent = split ? 'Another shift' : game.net ? 'Back to the lobby' : m ? (game.won ? (MISSIONS.indexOf(m) < MISSIONS.length - 1 ? 'Next job' : 'Run it again') : 'Try that again') : 'Another shift'; }
  // Drop the render resolution if the machine can't keep up, and bring it back if it can.
  if (dt > .034) { slow++; fast = 0; } else if (dt < .02) { fast++; slow = Math.max(0, slow - 1); }
  if (gfxI === 0)
  if (slow > 50 && quality > .5) { quality = Math.max(.5, quality * .85); slow = 0; resize(); }
  if (gfxI === 0)
  if (fast > 900 && quality < 1) { quality = Math.min(1, quality / .85); fast = 0; resize(); }
  requestAnimationFrame(frame);
}
(window as any).__ore = { quit, atlasUsed: MD.atlasUsed, game, start, pipe, hud, hud2, startSplit, split: () => split, game2: () => game2, setFree: (v: boolean) => { freeMouse = v; }, pickMap, unlock: () => { camp = MISSIONS.length; mpOpen = true; mode = 'multi'; showMode(); }, net: () => net, pickJob: (i: number) => { mode = 'camp'; camp = Math.max(camp, i); jobI = i; showMode(); fresh(); } };
requestAnimationFrame(frame);
