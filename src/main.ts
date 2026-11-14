// Boot, input, the frame loop, and the menu screens.
import { TER, MADE } from './terrain';
import { openMaker } from './mapmaker';
import { usePlan, planMap } from './mapcode';
import * as THREE from 'three';
import { Pipeline, ViewPipe, V3, makeSky, TX, M } from './gfx';
import { LAMP_ON } from './light';
import * as MD from './models';
import { GLOAM_BUILDINGS, bloomPatch } from './factions/gloam/look/art';
import { Game } from './game';
import { Hud } from './hud';
import { initAudio, setVolume, setMusic, audioSeat, hush, soundsReady, sfx } from './audio';
import { LocalMatch, SplitMode } from './split';
import { MAPS, UNIT, BLD, UPGRADES, TRAINS, UNIT_NEEDS, DIFFS, Kind, BKind, mapCode, validMap, rollMap, baseOf, sizeOf, MAP, FACTION, SIDE, STORY, setSides, setSidesCode, setTeamGame, sidesCode, fac, isWorker } from './data';
import { MISSIONS, STORY_JOBS, ACTS, missionSides, charterTeam, Mission } from './campaign';
import { CUTS, CutPlayer } from './cutscene';
import { Net, Lobby } from './net';
import { watchInit, watchFrame } from './watch';
import { treeHtml, treeTabs } from './tree';
import { TEAM_LAYOUTS } from './teammaps';
import { isFriend, planTeams, type TeamPlan } from './core/sides';
import { defineBuildings } from './core/registry';
import { defineAbilities } from './core/ability';
import { artGate, artSoon } from './artgate';
import { TouchPad, TouchPref, touchDevice, touchWords } from './touch';

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
/** Touch controls: whether they are showing, and the player's choice (auto follows the device). */
let touchOn = false, touchPref: TouchPref = 'auto';

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  // Phones have tiny, dense screens and slow graphics chips: draw at no more than one pixel per CSS pixel there.
  // High draws every pixel of a sharp screen, up to 1440 lines. Auto stops at 1080 lines so it has room to hold its frame rate.
  const top = gfxI === 3 && !touchOn, sc = Math.min(Math.min(window.devicePixelRatio || 1, touchOn ? 1 : top ? 2 : 1.5), (top ? 1440 : 1080) / h) * (gfxI === 1 ? .6 : gfxI === 2 ? .8 : gfxI === 3 ? 1 : quality);
  if (split && game2) {
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
  for (const kind of ['rigger', 'linesman', 'breacher', 'gantry', 'longshot', 'patch', 'cantor', 'lancer', 'warden', 'tender', 'grazer', 'snapper', 'quillback', 'blister', 'mulcher'] as Kind[]) {
    const gl = UNIT[kind].team === 2, m = MD.unit(kind), st = UNIT[kind], y = st.headY * (kind === 'breacher' ? 1.0 : gl ? .8 : .97), dist = st.headY * 1.5 + (kind === 'warden' ? 2 : kind === 'mulcher' ? 3.2 : gl ? 1.3 : .3); m.obj.rotation.y = .5; scene.add(m.obj);
    if (m.rig.flash) m.rig.flash.visible = false; if (m.rig.pack) m.rig.pack.visible = false;
    cam.position.set(0, y + .15, dist); cam.lookAt(0, y, 0); cam.updateMatrixWorld();
    pipe.draw(scene, cam, V3(0, 0, 0), 8);
    hud.portraits[kind] = canvas.toDataURL('image/jpeg', .85);
    scene.remove(m.obj);
  }
}

portraits(); hud2.portraits = hud.portraits;
pipe.w = 0; resize();
// Multiplayer is open from the first launch: friends who want to play together should not have to finish the story first.
let camp = 0, sideDone = 0, mpOpen = true, mode = 'camp', jobI = 0, pname = '', srv = '';
/** Story jobs after which an old save that still had multiplayer locked opens it: the end of Act 1. */
const MP_AFTER = 8;
let net: Net | null = null;
/** Rebindable actions: [what the game code listens for, label]. A player's choice is stored as action code to physical key. */
const ACTIONS: [string, string][] = [['KeyW', 'Forward'], ['KeyS', 'Back'], ['KeyA', 'Left'], ['KeyD', 'Right'], ['ShiftLeft', 'Sprint'], ['Space', 'Dash'], ['Tab', 'Jump wheel'], ['KeyF', 'Jump to target'], ['KeyQ', 'Last body'], ['KeyE', 'Use or train'], ['KeyR', 'Reload or rotate'], ['KeyC', 'Grenade or ability'], ['Digit1', 'Drill'], ['Digit2', 'Build'], ['KeyG', 'Quartermaster or raid'], ['KeyZ', 'Yes to the squad'], ['KeyX', 'Hold'], ['KeyV', 'Follow me'], ['KeyH', 'Send a scout'], ['KeyB', 'Ping'], ['KeyN', 'Command view'], ['KeyM', 'Map'], ['Enter', 'Chat']];
let binds: Record<string, string> = {}, gfxI = 0, cbOn = false, optsOpen = false, fpsOn = false, fpsN = 0, fpsT = 0, fpsWorst = 0;
const keyOf = (action: string) => binds[action] || action;
const keyText = (code: string) => code.replace(/^Key|^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'R Shift').replace('ControlLeft', 'Ctrl').replace('AltLeft', 'Alt').replace(/^Arrow/, '').replace(/^Numpad/, 'Num ');
/** The key a player pressed, as the action the game code listens for. A default key that has been given away does nothing. */
function logical(code: string) { for (const a in binds) if (binds[a] === code) return a; return binds[code] ? 'Unbound' : code; }
let diffI = 1, mapI = 0, sideI = 0, foeI = 0, sens = 1, vol = .5, mus = true, curX = .5, moved = false;
try { const o = JSON.parse(localStorage.getItem('ore-else') || '{}'); if (o.d >= 0 && o.d < 3) diffI = o.d; if (o.side >= 0 && o.side < 3) sideI = o.side; if (o.vs >= 0 && o.vs < 3) foeI = o.vs; else if (sideI) foeI = 2; else if (o.foe === 1) foeI = 1; if (validMap(o.map)) mapI = o.map % 100; if (o.st === 2) { if (o.camp > 0) camp = Math.min(STORY_JOBS, o.camp); if (o.sd > 0) sideDone = o.sd | 0; if (o.ore > 0) STORY.oreTotal = o.ore; } else if (o.camp > 0) camp = [0, 1, 2, 3, 3, 8][Math.min(5, o.camp)]; if (o.mp) mpOpen = true; if (o.mode === 'skirm') mode = 'skirm'; if (o.tp === 'on' || o.tp === 'off') touchPref = o.tp; if (typeof o.name === 'string') pname = o.name.slice(0, 14); if (typeof o.srv === 'string') srv = o.srv.slice(0, 200); if (o.s > 0) sens = o.s; if (o.v >= 0) vol = o.v; if (o.m === false) mus = false; if (o.q >= 0 && o.q < 4) gfxI = o.q | 0; cbOn = !!o.cb; fpsOn = !!o.fps; splitSide = o.ss !== 0; if (o.side === 1) sideI = 1; if (o.k && typeof o.k === 'object') for (const [a] of ACTIONS) if (typeof o.k[a] === 'string' && o.k[a] !== a) binds[a] = o.k[a]; } catch (e) { /* storage is optional */ }
const save = () => { try { localStorage.setItem('ore-else', JSON.stringify({ d: diffI, map: mapI, camp, st: 2, sd: sideDone, ore: Math.floor(STORY.oreTotal), mp: mpOpen, mode: mode === 'multi' ? 'camp' : mode, name: pname, srv, s: sens, v: vol, m: mus, q: gfxI, cb: cbOn, fps: fpsOn, ss: splitSide ? 1 : 0, side: sideI, vs: foeI, k: binds, tp: touchPref })); } catch (e) { /* storage is optional */ } };
jobI = Math.min(camp, STORY_JOBS - 1);
const jobOpen = (i: number) => i < STORY_JOBS ? i <= camp : camp >= (MISSIONS[i].opens || 0);
const jobDone = (i: number) => i < STORY_JOBS ? i < camp : !!(sideDone & (1 << (i - STORY_JOBS)));
/** The faction each foe button picks, in button order: the Veyl, the Gloam, Ironhold. */
const FOE_FAC = [1, 2, 0];
/** Which faction holds each end in a skirmish, as [yard, outpost]. Ironhold players take the yard; anyone else takes the outpost and their foe
 *  takes the yard. Split screen versus puts player one at the yard. Campaign jobs are always Ironhold against the Veyl. */
const sidesWanted = (versus = false): [number, number] => mode !== 'skirm' ? missionSides(MISSIONS[jobI]) : versus ? [sideI, FOE_FAC[foeI]] : sideI === 0 ? [0, FOE_FAC[foeI]] : [FOE_FAC[foeI], sideI];
const wantCode = () => { const [h, o] = sidesWanted(); return h * 3 + o; };
/** The kind of game on a map with more than two starts (Crossing, Wheel): an index into TEAM_LAYOUTS for its start count, 0 for one on one. */
let teamI = 0;
const startsHere = () => MAPS[baseOf(mapI)]?.ring || 0;
/** The team game the menu asks for, or null for a plain one on one. The player holds start 0 as Ironhold and the far start otherwise
 *  (as in a one on one); allies play the player's faction; the other side plays the faction picked under "Against", and in a free for all
 *  the other starts take turns between that faction and the third. */
function teamPlan(): TeamPlan | null {
  const n = startsHere(), L = mode === 'skirm' && n ? TEAM_LAYOUTS[n]?.[teamI] : null; if (!L || teamI <= 0) return null;
  const me = sideI === 0 ? 0 : n / 2, foe = FOE_FAC[foeI], others = [foe, [0, 1, 2].find(f => f !== foe && f !== sideI) ?? [0, 1, 2].find(f => f !== foe)!], facs: number[] = Array(n).fill(-1); let e = 0;
  for (const grp of L.teams) { const mine = grp.includes(me); for (const s of grp) facs[s] = mine ? sideI : L.teams.length === 2 ? foe : others[e++ % 2]; }
  return { n, groups: L.teams.map(t => t.slice()), facs };
}
/** The old raid match: Ironhold at the yard against a Veyl outpost that breeds raids for free and builds nothing. Off by default, since a
 *  skirmish now runs both economies; the menu's "Raid the Veyl outpost" button turns it on, and only while the player is Ironhold. */
let raid = false;
const raidOn = () => raid && mode === 'skirm' && sideI === 0 && foeI === 0 && teamI <= 0;
const teamKey = () => JSON.stringify([teamPlan(), raidOn()]);
/** Every faction in the match the menu would start: two in a one-on-one, up to three in a team game. Their art comes before it starts. */
const matchFacs = () => { const tp = teamPlan(); return tp ? [...new Set(tp.facs)] : sidesWanted(); };
let builtTeam = 'null';
const setWanted = () => { const tp = teamPlan(); if (!tp || !setTeamGame(tp)) setSides(...sidesWanted()); builtTeam = teamKey(); };
const want = () => { setWanted(); STORY.charter = mode === 'skirm' ? -1 : charterTeam(MISSIONS[jobI]); return want0(); };
/** The skirmish map with its turn: a Vast map is turned a new way for every new match (see rollMap). `__ore.turn` pins it, for tests and pictures. */
let playMap = 0; const reroll = () => playMap = rollMap(mapI, (window as any).__ore?.turn | 0);
const want0 = () => mode !== 'skirm' ? { d: DIFFS[MISSIONS[jobI].diff], map: MISSIONS[jobI].map, m: MISSIONS[jobI], eco: false } : { d: DIFFS[diffI], map: playMap, m: null, eco: !raidOn() };
reroll();
let game = new Game(pipe, hud, want().d, want().map, want().m, null, want().eco); game.sens = sens;
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
  if (cutP.on) { e.preventDefault(); if (e.code === 'Escape') skipCuts(); else if (!e.repeat && (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight')) cutP.next(); return; }
  if (split && game2 && !padTwo && logical(e.code) === e.code && P2KEYS[e.code]) { if (live()) { e.preventDefault(); const k = P2KEYS[e.code]; if (k === 'Tool') { if (!e.repeat) game2.pressed.add(game2.tool === 2 ? 'Digit1' : 'Digit2'); } else if (k === 'Wheel-' || k === 'Wheel+') { if (!e.repeat) game2.wheel = k === 'Wheel+' ? 1 : -1; } else if (k === 'Mouse0' || k === 'Mouse2') { if (!e.repeat) game2.pressed.add(k); if (k === 'Mouse0') game2.lmb = true; else game2.rmb = true; } else if (k.startsWith('Look')) look2.add(k); else { if (!e.repeat) game2.pressed.add(k); game2.keys.add(k); } p2Seen = true; } return; }
  if (game.net && !split && game.phase === 'play' && code === 'Enter') { e.preventDefault(); game.keys.clear(); chat.hidden = false; chat.focus(); return; }
  // Ctrl and a number keeps a control group, Ctrl+A picks the army, F1 and F2 pick idle workers and the army: the browser's own uses of those keys are held back during play.
  const rts = (e.ctrlKey && (/^Digit\d$/.test(e.code) || e.code === 'KeyA')) || e.code === 'F1' || e.code === 'F2';
  if (live()) { if ((!e.ctrlKey && !e.metaKey && e.code !== 'Escape' && !/^F\d/.test(e.code)) || rts) e.preventDefault(); if (!e.repeat) game.pressed.add(code); game.keys.add(code); }
  if (e.code === 'Escape' && freeMouse) { if (game.phase === 'play' || game.phase === 'card') pause(); else if (game.phase === 'paused') resume(); }
});
addEventListener('keyup', e => { const k = split && game2 && logical(e.code) === e.code ? P2KEYS[e.code] : ''; if (k && game2) { if (k === 'Mouse0') game2.lmb = false; else if (k === 'Mouse2') game2.rmb = false; else if (k.startsWith('Look')) look2.delete(k); else game2.keys.delete(k); if (!padTwo) return; } game.keys.delete(logical(e.code)); });
addEventListener('blur', () => { game.keys.clear(); game.lmb = game.rmb = game.mmb = false; if (game2) { game2.keys.clear(); game2.lmb = game2.rmb = false; } look2.clear(); });
canvas.addEventListener('mousedown', e => { if (!live()) return; e.preventDefault(); game.pressed.add('Mouse' + e.button); if (e.button === 0) game.lmb = true; if (e.button === 2) game.rmb = true; if (e.button === 1) game.mmb = true; if (!locked() && !freeMouse) lock(); });
addEventListener('mouseup', e => { if (e.button === 0) game.lmb = false; if (e.button === 2) game.rmb = false; if (e.button === 1) game.mmb = false; });
addEventListener('mousemove', e => { curX = e.clientX / innerWidth; if (e.movementX || e.movementY) moved = true; if (live() && (locked() || freeMouse)) { game.mdx += e.movementX || 0; game.mdy += e.movementY || 0; } });
addEventListener('wheel', e => { if (live()) { game.wheel = Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('auxclick', e => e.preventDefault());

function lock() { if (touchOn) { phoneScreen(); return; } try { const p: any = (canvas as any).requestPointerLock(); if (p && p.catch) p.catch(() => { freeMouse = true; }); } catch (e) { freeMouse = true; } }
/** On a phone, starting a match goes full screen and holds the screen sideways where the browser allows it. */
function phoneScreen() {
  try { const el: any = $('game'); if (!document.fullscreenElement && el.requestFullscreen) { const p = el.requestFullscreen({ navigationUI: 'hide' }); if (p && p.then) p.then(() => { try { const o: any = screen.orientation; o?.lock?.('landscape')?.catch?.(() => { /* not every browser lets a page turn the screen */ }); } catch (e) { /* optional */ } }).catch(() => { /* optional */ }); } } catch (e) { /* optional */ }
}
const pad = new TouchPad($('game'), () => game, { live: () => live(), pause: () => pause(), chat: () => { if (!game.net) return; game.keys.clear(); chat.hidden = false; chat.focus(); } });
function setTouch(on: boolean) {
  if (on === touchOn && pad.on === on) return; touchOn = on; pad.enable(on); hud.fit = on ? [1000, 640] : [1280, 900]; hud.words = on ? touchWords : null; showJobs();
  if (on) freeMouse = false;
  $('jump').querySelector('.foot')!.innerHTML = on ? 'Tap a body to jump into it · <span class="k">GO</span> jumps to the yellow one' : 'Press a number or scroll · Let go of <span class="k">TAB</span> to jump';
  $('build').querySelector('p')!.textContent = on ? 'Tap a row or ◀ ▶ to pick · Rotate · Place' : 'Wheel or 2 pick · R rotate · Click place';
  $('sensL').textContent = on ? 'Look speed' : 'Mouse speed'; $('sensL2').textContent = on ? 'Look speed' : 'Mouse speed';
  pipe.w = 0; applyOpts();
}
const touchWanted = () => touchPref === 'on' || (touchPref === 'auto' && touchDevice());
// A touch on a machine that did not look like a phone (a tablet in desktop mode, say) still switches the controls on.
addEventListener('touchstart', () => { if (touchPref === 'auto' && !touchOn) setTouch(true); }, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pad.reset(); if (touchOn) pause(); } });
document.addEventListener('pointerlockerror', () => { freeMouse = true; });
document.addEventListener('pointerlockchange', () => { if (!locked() && live() && !freeMouse) pause(); });

function fresh() { endSplit(); hush(); hud.reset(); reroll(); const w = want(); game.dispose(); game = new Game(pipe, hud, w.d, w.map, w.m, null, w.eco); game.sens = sens; ended = false; (window as any).__ore.game = game;
  artSoon(matchFacs(), () => { if (!$('menu').hidden && game.phase !== 'play' && !game.net && !split) fresh(); }); }   // the art for sides picked in the menu comes while the player looks
function start() { if (!artGate(matchFacs(), () => { fresh(); start(); })) return; if (mode === 'skirm' && sideI) { startVeyl(); return; } if (mode !== 'skirm' && MISSIONS[jobI].out) { startStory(MISSIONS[jobI]); return; } if (sidesCode() !== wantCode() || builtTeam !== teamKey()) fresh(); initAudio(); setVolume(vol); setMusic(mus); { const w = want(); if (game.diff !== w.d || game.mapI !== w.map || game.mission !== w.m || game.time > 0) fresh(); } $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); game.phase = 'play'; game.introT = 1.8; lock(); }
/** The pause screen shows the whole tech tree: what is standing, what can be built next and what each building sells. */
let treeF = -1;
function showTree() {
  const g = game, t = g.myTeam, mine = fac(t); if (treeF < 0) treeF = mine;
  $('ttabs').innerHTML = treeTabs(mine, treeF);
  $('tree').innerHTML = treeF === mine ? treeHtml(mine, g, t) : treeHtml(treeF);
  // What the scouts have seen of the other side: the buildings, how long ago, and what that says about their plan. Not shown on story jobs.
  const I = g.intel, show = !g.mission; $('intel').hidden = !show; if (!show) return;
  const tl = I.tally(t), rd = I.read(t), recs = [...I.seen[I.ix(t)].values()], ago = recs.length ? Math.max(0, Math.round(g.time - Math.max(...recs.map(r => r.t)))) : 0, when = ago < 8 ? 'in sight now' : ago < 90 ? ago + ' seconds ago' : Math.round(ago / 60) + ' minutes ago';
  $('intelBody').innerHTML = !tl.length ? `<p><b>Not found yet.</b> ${MAP.hid ? 'One of the roads out of your base ends at theirs. Press H to send a scout down one, or walk it yourself.' : 'Nobody has looked at their base. Press H to send a scout.'}</p>`
    : `<p><b>${rd.short}.</b> ${rd.line}</p><ul>${tl.map(([k, n]) => `<li>${n > 1 ? n + ' × ' : ''}${BLD[k].name}</li>`).join('')}</ul><p><small>Last seen ${when}. Press H to send a scout for another look.</small></p>`;
}
let pausedAt = 0;
function pause() { if (game.phase !== 'play' && game.phase !== 'card') return; pausedAt = performance.now(); hush(); treeF = -1; showTree(); for (const g of [game, game2]) if (g && g.phase === 'card') g.hud.titleCard('', '', ''); if (game2) { game2.phase = 'paused'; game2.keys.clear(); game2.lmb = game2.rmb = false; look2.clear(); } if (game.net) { game.phase = 'paused'; game.keys.clear(); game.lmb = game.rmb = false; $('pause').hidden = false; return; } game.phase = 'paused'; game.keys.clear(); game.lmb = game.rmb = false; $('pause').hidden = false; }
function resume(byPad = false) { if (game.phase !== 'paused') return; initAudio(); $('pause').hidden = true; game.phase = 'play'; if (game2) game2.phase = 'play'; if (!byPad) lock(); }
$('start').addEventListener('click', start);
// A tap on the touch pause button is followed by the browser's own click where the finger was, which can land on this button as the
// pause screen opens: clicks in the first 400 ms are not taken as a press.
$('resume').addEventListener('click', () => { if (performance.now() - pausedAt > 400) resume(); });
$('again').addEventListener('click', () => {
  const st = game.story; if (st && mode !== 'skirm') { const i = MISSIONS.indexOf(st); if (game.won && i < STORY_JOBS - 1) { jobI = i + 1; const nx = MISSIONS[jobI]; playCuts([...(st.cutOut || []), ...(nx.cutIn || [])], () => { fresh(); start(); }); } else if (game.won && i === STORY_JOBS - 1) playCuts(st.cutOut || [], () => { mode = 'camp'; toMenu(); }); else { fresh(); start(); } return; }
  if (split && !game2) { startVeyl(); return; } if (split) { startSplit(splitMode); return; } if (game.net) { toMenu(); return; } fresh(); start(); });
$('startJob').addEventListener('click', startJob);
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
const padViewT = [0, 0], padViewDone = [false, false];
const padHeld: Set<string>[] = [new Set(), new Set()], padWas: boolean[][] = [[], []], padRun = [false, false], padFire = [[false, false], [false, false]];
function pads(): Gamepad[] { try { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(p => !!p && p.connected && p.buttons.length >= 10) as Gamepad[]; } catch (e) { padBlocked = true; return []; } }
/** Turns one controller into the keys and mouse movement the game already understands. */
function padDrive(g: Game, p: Gamepad, slot: number, dt: number) {
  const ax = (i: number) => { const v = p.axes[i] || 0, a = Math.abs(v); return a < .18 ? 0 : Math.sign(v) * (a - .18) / .82; };
  const was = padWas[slot], down = (i: number) => !!p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > .35), hit = (i: number) => down(i) && !was[i];
  const mine = padHeld[slot], hold = (code: string, on: boolean) => { if (on) { if (!mine.has(code)) { mine.add(code); g.keys.add(code); g.pressed.add(code); } } else if (mine.has(code)) { mine.delete(code); g.keys.delete(code); } };
  const tap = (i: number, code: string) => { if (hit(i)) g.pressed.add(code); };
  // Holding View (button 8) for under half a second is the squad's follow order, as before; holding it longer lifts the player into the
  // command view, and a tap there drops back down.
  // Counted in game time, not the clock: a slow frame must not turn a tap into a hold.
  if (down(8)) padViewT[slot] = was[8] ? padViewT[slot] + dt : 0;
  const viewTap = !down(8) && was[8] && padViewT[slot] < .4, viewHeld = down(8) && padViewT[slot] >= .4 && !padViewDone[slot];
  if (!down(8)) padViewDone[slot] = false;
  if ((game.phase === 'play' || game.phase === 'card') && g.cmd.on) {
    // From above: left stick slides the view (W A S D), right stick moves the cursor, RT picks or presses the card under the cursor,
    // LT gives an order, D-pad up and down zoom, left and right step through the card and A presses it, X idle worker, Y whole army.
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3), C = g.cmd;
    hold('KeyW', ly < -.3); hold('KeyS', ly > .3); hold('KeyA', lx < -.3); hold('KeyD', lx > .3); hold('ShiftLeft', false); hold('Tab', false);
    g.mdx += rx * (.35 + .65 * Math.abs(rx)) * 1100 * dt; g.mdy += ry * (.35 + .65 * Math.abs(ry)) * 1100 * dt;
    const f = padFire[slot], rt = down(7), lt = down(6);
    if (rt !== f[0]) { f[0] = rt; g.lmb = rt; if (rt) g.pressed.add('Mouse0'); } if (lt !== f[1]) { f[1] = lt; g.rmb = lt; if (lt) g.pressed.add('Mouse2'); }
    if (hit(12)) g.wheel = -1; if (hit(13)) g.wheel = 1; if (hit(14)) C.padStep(-1); if (hit(15)) C.padStep(1);
    if (hit(0)) C.padPress(); tap(2, 'F1'); tap(3, 'F2'); if (viewTap) g.pressed.add('KeyN');
    if (hit(9)) pause();
  } else if (game.phase === 'play' || game.phase === 'card') {
    if (viewHeld) { padViewDone[slot] = true; g.keys.delete('KeyV'); g.pressed.add('KeyN'); }
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    hold('KeyW', ly < -.3); hold('KeyS', ly > .3); hold('KeyA', lx < -.3); hold('KeyD', lx > .3);
    if (hit(10)) padRun[slot] = true; if (ly > -.5) padRun[slot] = false; hold('ShiftLeft', padRun[slot]);
    g.mdx += rx * (.35 + .65 * Math.abs(rx)) * 1500 * dt; g.mdy += ry * (.35 + .65 * Math.abs(ry)) * 1000 * dt;
    const f = padFire[slot], rt = down(7), lt = down(6);
    if (rt !== f[0]) { f[0] = rt; g.lmb = rt; if (rt) g.pressed.add('Mouse0'); } if (lt !== f[1]) { f[1] = lt; g.rmb = lt; if (lt) g.pressed.add('Mouse2'); }
    tap(0, 'Space'); tap(1, 'KeyC'); tap(2, 'KeyR'); tap(3, 'KeyE'); tap(5, 'KeyF'); if (viewTap) g.pressed.add('KeyV'); tap(11, 'Mouse1'); if (g.net && hit(11)) g.pressed.add('KeyB');
    hold('Tab', down(4));
    // the D-pad does whatever the screen is offering
    const pr = g.prompt || '', train = /<b>[TYU]<\/b>/.test(pr), picking = g.tab || (g.tool === 2 && !!g.me && isWorker(g.me.kind)), call = !!g.dir.side(g.myTeam).callout;
    if (train) { tap(14, 'KeyT'); tap(12, 'KeyY'); tap(15, 'KeyU'); }
    else { if (picking) { if (hit(14)) g.wheel = -1; if (hit(15)) g.wheel = 1; } if (call) { tap(12, 'KeyZ'); tap(13, 'KeyX'); } else { if (hit(12) && g.me && isWorker(g.me.kind)) g.pressed.add(g.tool === 2 ? 'Digit1' : 'Digit2'); tap(13, 'KeyQ'); } }
    if (hit(9)) pause();
  } else if (game.phase === 'paused' && hit(9)) resume(true);
  for (let i = 0; i < p.buttons.length; i++) was[i] = down(i);
}
function padPoll(dt: number) {
  // Playing alone, the first controller drives player one (keyboard and mouse keep working too).
  if (!game2) { const p = pads()[0]; if (p) padDrive(game, p, 0, dt); return; }
  const ps = pads();
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
}
/** The match a split screen or a solo Veyl run is playing: co-op, versus, or the Veyl side. */
let splitMode: SplitMode = 'coop';
function startSplit(how: SplitMode | boolean = splitMode) {
  { const sm = how === true ? 'versus' : how === false ? 'coop' : how; if (!artGate(sidesWanted(sm === 'versus'), () => startSplit(how))) return; }
  splitMode = how === true ? 'versus' : how === false ? 'coop' : how; splitVs = splitMode === 'versus'; setSides(...sidesWanted(splitVs)); STORY.charter = -1; initAudio(); setVolume(vol); setMusic(mus); mode = 'skirm'; hud.reset(); hud2.reset();
  reroll(); const prev = split, m = split = new LocalMatch(playMap, diffI, 2, splitMode), mk = (i: number) => { const g = new Game(i ? view2 : view1, i ? hud2 : hud, DIFFS[diffI], playMap, null, m.seats[i], m.host.eco); g.sens = i ? 1 : sens; g.names = m.names; g.teams = m.teams; g.myTeam = m.teams[i + 1] ?? SIDE.home; g.phase = 'play'; g.introT = 1.8; return g; };
  const old = [game, game2, prev?.host]; game = mk(0); game2 = mk(1); game2.cmd.locked = true; for (const g of old) if (g && g !== game) g.dispose(); view1.time = view2.time = pipe.time; ended = false; (window as any).__ore.game = game;
  padTwo = pads().length > 0; p2Seen = false; p2Hint = 0; padHeld[0].clear(); padHeld[1].clear(); look2.clear(); p2Labels();
  $('game').classList.add('split'); $('game').classList.toggle('stack', !splitSide);
  $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); hud2.show(true); resize(); lock();
}
/** A skirmish as the Veyl: the Ironhold bots run on a local host, and this screen is its only seat. */
function startVeyl() {
  endSplit(); splitMode = 'veyl'; splitVs = false; setWanted(); STORY.charter = -1; initAudio(); setVolume(vol); setMusic(mus); hush(); hud.reset();
  reroll(); const m = split = new LocalMatch(playMap, diffI, 1, 'veyl'), old = game;
  game = new Game(pipe, hud, DIFFS[diffI], playMap, null, m.seats[0], true); game.sens = sens; game.names = m.names; game.teams = m.teams; game.myTeam = SIDE.out; game.phase = 'play'; game.introT = 1.8; old.dispose(); ended = false; (window as any).__ore.game = game;
  $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); resize(); lock();
}
/** A story job played from the outpost end: the job's script runs on a hidden local host, and this screen is its one seat. */
function startStory(mi: Mission) {
  endSplit(); splitMode = 'veyl'; splitVs = false; want(); initAudio(); setVolume(vol); setMusic(mus); hush(); hud.reset();
  STORY.on = true; const m = split = new LocalMatch(mi.map, mi.diff, 1, 'veyl', mi), old = game;
  game = new Game(pipe, hud, DIFFS[mi.diff], mi.map, null, m.seats[0], true); STORY.on = false; game.story = mi; game.sens = sens; game.names = m.names; game.teams = m.teams; game.myTeam = SIDE.out; game.phase = 'play'; game.introT = 1.8; old.dispose(); ended = false; (window as any).__ore.game = game;
  $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); resize(); lock();
}
// ---- cut scenes
const cutP = new CutPlayer($('cut'));
let cutQ: string[] = [], cutThen: (() => void) | null = null;
/** Plays the named scenes one after another, each on its own small stage, then runs `then`. Esc skips the lot. */
function playCuts(ids: string[], then: () => void) {
  cutQ = ids.filter(id => CUTS[id]); cutThen = then; if (!cutQ.length) { cutThen = null; then(); return; }
  initAudio(); setVolume(vol); setMusic(mus); nextCut();
}
function nextCut() {
  const id = cutQ.shift(); if (!id) { const t = cutThen; cutThen = null; t?.(); return; }
  const c = CUTS[id]; if (!artGate(c.sides, () => { cutQ.unshift(id); nextCut(); })) return; endSplit(); hush(); hud.reset(); setSides(...c.sides); STORY.charter = c.charter === 'home' ? SIDE.home : c.charter === 'out' ? SIDE.out : -1;
  game.dispose(); STORY.on = true; game = new Game(pipe, hud, DIFFS[1], c.map, null); STORY.on = false; game.duskFix = c.dusk; game.sens = sens; ended = false; (window as any).__ore.game = game;
  $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(false); if (document.pointerLockElement) document.exitPointerLock();
  cutP.start(c, game, nextCut);
}
function skipCuts() { cutQ = []; cutP.skip(); }
$('cut').addEventListener('click', e => { e.preventDefault(); if ((e.target as HTMLElement).closest('.cskip')) skipCuts(); else cutP.next(); });
/** Starts the selected job, with its opening scenes the first time through. */
function startJob() { const m = MISSIONS[jobI]; if (mode !== 'skirm' && m.cutIn && !jobDone(jobI)) playCuts(m.cutIn, () => { fresh(); start(); }); else start(); }
function endSplit() { if (!split && !game2) return; split?.host.dispose(); game2?.dispose(); split = null; game2 = null; hud2.show(false); $('game').classList.remove('split', 'stack'); pipe.w = 0; resize(); }
$('ttabs').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('[data-f]') as HTMLElement | null; if (!b) return; treeF = +b.dataset.f!; showTree(); });
$('startSplit').addEventListener('click', () => startSplit(sideI ? 'veyl' : 'coop')); $('startSplitVs').addEventListener('click', () => startSplit(true));
const splitBtns = Array.from($('splitDir').querySelectorAll('button')) as HTMLButtonElement[];
const showSplit = () => splitBtns.forEach((b, i) => { const on = (i === 0) === splitSide; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
splitBtns.forEach((b, i) => b.addEventListener('click', () => { splitSide = i === 0; showSplit(); save(); })); showSplit();
// ---- which side a skirmish plays
const sideBtns = Array.from($('sides').querySelectorAll('button')) as HTMLButtonElement[];
const foeBtns = Array.from($('foes').querySelectorAll('button:not(#raid)')) as HTMLButtonElement[], raidBtn = $('raid') as HTMLButtonElement;
const showSide = () => { sideBtns.forEach((b, i) => { const on = i === sideI; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); foeBtns.forEach((b, i) => { const on = i === foeI && !raidOn(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); raidBtn.hidden = sideI !== 0 || teamI > 0; raidBtn.classList.toggle('on', raidOn()); raidBtn.setAttribute('aria-pressed', String(raidOn())); $('foes').hidden = false; $('start').textContent = sideI === 2 ? 'Start growing' : sideI ? 'Start singing' : 'Clock in'; $('startSplit').textContent = sideI === 2 ? 'Split screen co-op as the Gloam' : sideI ? 'Split screen co-op as the Veyl' : 'Split screen co-op'; };
sideBtns.forEach((b, i) => b.addEventListener('click', () => { if (i !== sideI) foeI = i ? 2 : 0; sideI = i; showSide(); save(); if (mode === 'skirm' && (sidesCode() !== wantCode() || builtTeam !== teamKey())) fresh(); }));
foeBtns.forEach((b, i) => b.addEventListener('click', () => { foeI = i; raid = false; showSide(); save(); if (mode === 'skirm' && (sidesCode() !== wantCode() || builtTeam !== teamKey())) fresh(); })); showSide();
raidBtn.addEventListener('click', () => { raid = true; foeI = 0; showSide(); save(); if (mode === 'skirm' && (sidesCode() !== wantCode() || builtTeam !== teamKey())) fresh(); });
// ---- campaign and mode tabs
let ended = false;
const modeBtns = Array.from($('modes').querySelectorAll('button')) as HTMLButtonElement[];
function showJobs() {
  const btn = (m: Mission, i: number) => `<button type="button" data-j="${i}" class="${i === jobI ? 'on' : ''} ${jobDone(i) ? 'dn' : ''}" ${jobOpen(i) ? '' : 'disabled'} aria-pressed="${i === jobI}">${m.tag}<b>${m.name}</b><small>${jobDone(i) ? 'Done' : jobOpen(i) ? (i < STORY_JOBS ? 'Next up' : 'Open') : i < STORY_JOBS ? 'Locked' : `After job ${m.opens}`}</small></button>`;
  const actOf = Math.max(1, MISSIONS[Math.min(jobI, STORY_JOBS - 1)].act || 4);
  $('jobs').innerHTML = `<div class="acts">${ACTS.map(a => { const first = MISSIONS.findIndex(m => m.act === a.n), open = jobOpen(first); return `<button type="button" class="act ${a.n === (MISSIONS[jobI].act || actOf) ? 'on' : ''}" data-a="${a.n}" ${open ? '' : 'disabled'}>Act ${a.n}<b>${a.name}</b><small>${a.side}</small></button>`; }).join('')}<button type="button" class="act ${MISSIONS[jobI].act === 0 ? 'on' : ''}" data-a="0">Side<b>Jobs</b><small>Optional</small></button></div>`
    + `<div class="jrow">${MISSIONS.map((m, i) => m.act === (MISSIONS[jobI].act) ? btn(m, i) : '').join('')}</div>`;
  const m = MISSIONS[jobI]; $('bName').textContent = `${m.tag}: ${m.name}`; $('bTeach').textContent = 'Teaches: ' + m.teaches; $('bText').textContent = touchOn ? touchWords(m.brief) : m.brief;
  $('skipCamp').hidden = camp >= STORY_JOBS && mpOpen;
}
function showMode() {
  modeBtns.forEach(b => { const on = optsOpen ? b.dataset.m === 'opts' : b.dataset.m === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  $('pOpts').hidden = !optsOpen; $('pCamp').hidden = optsOpen || mode !== 'camp'; $('pSkirm').hidden = optsOpen || mode !== 'skirm'; $('pMulti').hidden = optsOpen || mode !== 'multi';
  $('multiBtn').classList.toggle('locked', !mpOpen); $('multiNote').textContent = mpOpen ? 'Online or one screen' : 'Locked. Finish Act 1.';
  $('mLocked').hidden = mpOpen; $('mJoin').hidden = !mpOpen || !!(net && net.lobby && net.lobby.code); $('mLobby').hidden = !mpOpen || !(net && net.lobby && net.lobby.code);
  $('mTitle').textContent = mpOpen ? 'Joint operations: cleared' : 'Joint operations: locked';
  $('mText').textContent = mpOpen ? 'You are cleared for multiplayer. Make a lobby and read its code out to your crew, or join one with theirs. Two players on one machine can play split screen from the Skirmish tab.' : 'The Charter does not let strangers share a payroll. Finish Act 1 of the campaign to unlock multiplayer, or use the unlock button on the Campaign tab if you have done them before.';
  showJobs();
}
modeBtns.forEach(b => b.addEventListener('click', () => { optsOpen = b.dataset.m === 'opts'; if (optsOpen) { showMode(); return; } mode = (b.dataset.m || 'camp') as typeof mode; save(); showMode(); if (mode !== 'multi') { const w = want(); if (game.mapI !== w.map || game.mission !== w.m) fresh(); } }));
$('jobs').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b || b.disabled) return; if (b.dataset.a !== undefined) { const a = +b.dataset.a; const list = MISSIONS.map((m, i) => i).filter(i => MISSIONS[i].act === a && jobOpen(i)); if (list.length) jobI = list[list.length - 1]; } else jobI = +(b.dataset.j || 0); showJobs(); const w = want(); if (game.mapI !== w.map || game.mission !== w.m) fresh(); });
$('skipCamp').addEventListener('click', () => { camp = STORY_JOBS; mpOpen = true; save(); showMode(); });
// ---- multiplayer lobby
const mName = $('mName') as HTMLInputElement, mServer = $('mServer') as HTMLInputElement, mCode = $('mCode') as HTMLInputElement;
const defaultServer = () => /^https?:$/.test(location.protocol) && location.host ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' : '';
mName.value = pname; mServer.value = srv || defaultServer();
const mErr = (t: string) => { $('mErr').textContent = t; $('mErr2').textContent = t; };
const mFoeB = Array.from($('mFoes').querySelectorAll('button')) as HTMLButtonElement[], mHomeB = Array.from($('mHome').querySelectorAll('button')) as HTMLButtonElement[], mDiffB = Array.from($('mDiff').querySelectorAll('button')) as HTMLButtonElement[], mMapB = Array.from($('mMaps').querySelectorAll('button')) as HTMLButtonElement[], mSizeB = Array.from($('mSizes').querySelectorAll('button')) as HTMLButtonElement[]; let lobMap = 0;
function showLobby(l: Lobby) {
  const inLobby = !!l.code; $('mJoin').hidden = inLobby || !mpOpen; $('mLobby').hidden = !inLobby; if (!inLobby) return;
  const host = l.host === l.you, me = l.players.find(p => p.id === l.you);
  $('mCodeShow').textContent = l.code; $('mHint').textContent = host ? 'Read the code out to your crew. You pick the map and start the shift when everyone is ready.' : 'Waiting for the host to start. Hit Ready when you are.';
  // The lobby's match code says who holds each end: yard faction * 3 + outpost faction (1 and 2 are the classic Ironhold matches).
  const code = l.out ?? 1, lh = Math.floor(code / 3), lf = code % 3, outT = lf === lh ? lf + 3 : lf, onOut = (p: { team: number }) => p.team === outT, FN = ['Ironhold', 'Veyl Chorus', 'The Gloam'];
  $('mPlayers').innerHTML = l.players.map(p => `<button type="button" disabled class="${p.ready || p.id === l.host || p.team < 0 ? 'dn' : ''}${onOut(p) ? ' v' : ''}">${p.team < 0 ? 'Watching' : onOut(p) ? FN[lf] + (lf === lh ? ' (outpost)' : '') : lh ? FN[lh] + (lf === lh ? ' (yard)' : '') : p.id === l.host ? 'Host' : 'Crew'}<b>${p.name.replace(/[<>&]/g, '')}</b><small>${p.id === l.host ? 'Runs the shift' : p.ready ? 'Ready' : 'Not ready'}</small></button>`).join('');
  mDiffB.forEach((b, i) => { b.classList.toggle('on', i === l.diff); b.disabled = !host; }); lobMap = l.map; { const mb = $('mMade') as HTMLButtonElement; mb.classList.toggle('on', !!l.plan); mb.disabled = !host || (!MADE.code && !l.plan); } mMapB.forEach((b, i) => { b.classList.toggle('on', !l.plan && +(b.dataset.b ?? i) === baseOf(l.map)); b.disabled = !host; }); mSizeB.forEach(b => { b.classList.toggle('on', +(b.dataset.s || 0) === sizeOf(l.map)); b.disabled = !host; });
  const nm = ['Ironhold', 'the Veyl', 'the Gloam'], foeName = nm[lf] + (lf === lh ? ' at the outpost' : ''), homeName = nm[lh] + (lf === lh ? ' at the yard' : '');
  mFoeB.forEach((b, i) => { b.classList.toggle('on', FOE_FAC[i] === lf); b.disabled = !host; }); mHomeB.forEach((b, i) => { b.classList.toggle('on', i === lh); b.disabled = !host; });
  $('mSide').textContent = me && onOut(me) ? 'Play as ' + homeName : 'Play as ' + foeName; { const v = l.players.filter(onOut).length, c = l.players.length - v; if (v) $('mHint').textContent = (c ? 'Versus shift. Both sides dig, build and train, and any side with nobody on it is run by bots. ' : `Everyone is on ${foeName}. ${homeName[0].toUpperCase() + homeName.slice(1)} will be bots. `) + (host ? 'You start it when everyone is ready.' : 'Hit Ready when you are.'); }
  // A team game on a map with more than two starts: the host picks the kind of game, and everyone picks a start.
  { const n = MAPS[baseOf(l.map)]?.ring || 0, L = n && !l.plan ? TEAM_LAYOUTS[n] || [] : [], cur = l.mt ? L.findIndex(x => JSON.stringify(x.teams) === JSON.stringify(l.mt!.groups)) : 0;
    $('mTeamRow').hidden = L.length < 2;
    if (L.length >= 2) {
      $('mTeams').innerHTML = L.map((x, i) => `<button type="button" data-t="${i}" class="${i === cur ? 'on' : ''}"${host ? '' : ' disabled'}>${x.name}</button>`).join('');
      const t = l.mt ? planTeams(l.mt) : null, FN = ['Ironhold', 'Veyl', 'Gloam'];
      $('mStarts').hidden = !t;
      if (t) $('mStarts').innerHTML = t.at.map((s, j) => [s, j]).sort((x, y) => x[0] - y[0]).map(([s, j]) => { const team = t.teams[j], side = l.mt!.groups.findIndex(gr => gr.includes(s)) + 1, who = l.players.filter(p => p.team === team).map(p => p.name.replace(/[<>&]/g, '')).join(', ');
        return `<button type="button" data-s="${s}" class="${me && me.team === team ? 'on' : ''}">Start ${s + 1} · ${FN[fac(team)]}<small>Team ${side}${who ? ' · ' + who : ' · bots'}</small></button>`; }).join('');
      $('mSide').hidden = !!t;
    } else $('mSide').hidden = false; }
  $('mStart').hidden = !host; $('mReady').hidden = host; $('mReady').textContent = me && me.ready ? 'Not ready' : 'Ready'; ($('mStart') as HTMLButtonElement).disabled = !l.players.every(p => p.ready || p.id === l.host || p.team < 0);
}
/** A match starts on the server (or a replay starts in the page): the page's game becomes a copy of it. */
function netBegin(n: Net, m: any) {
    endSplit(); mode = 'multi'; hud.reset(); game.dispose(); usePlan(m.plan || null); setSidesCode(m.out ?? 1); setTeamGame(m.mt || null); STORY.charter = -1; game = new Game(pipe, hud, DIFFS[m.diff], m.map, null, n, !!m.eco); game.sens = sens; game.names = m.names; game.myTeam = (m.team ?? 0) >= 0 ? m.team ?? SIDE.home : SIDE.home; game.teams = m.teams || {}; if (m.ph) { game.applying = true; for (const r of m.ph) { const q = game.props[r[0]]; if (q && q.alive && q.hp > r[1]) game.damageProp(q, q.hp - r[1], null); } game.applying = false; } ended = false; (window as any).__ore.game = game;
    initAudio(); setVolume(vol); setMusic(mus); $('menu').hidden = true; $('pause').hidden = true; $('end').hidden = true; hud.show(true); game.phase = 'play'; game.introT = 1.8; if (!m.watch) lock(); /* a watcher keeps the mouse for the watching bar */}
async function mpConnect(then: (n: Net) => void) {
  artSoon([0, 1, 2]);   // any side may be picked in a lobby: fetch every faction's art while the players gather
  pname = mName.value.trim().slice(0, 14) || 'Rigger'; srv = mServer.value.trim(); save(); mErr('');
  if (!srv) { mErr('This copy of the game is not on a game server, so there is nobody to connect to. Open the game from its server address, or paste a server address above.'); return; }
  if (net && net.open) { then(net); return; }
  mErr('Connecting...'); const n = new Net();
  n.onLobby = l => { showLobby(l); if (l.code) { mErr(''); lastCode = l.code; } }; n.onError = m => mErr(m);
  n.onClose = () => { net = null; if (game.net === n) { game.net = null; toMenu(); } showMode(); if (lastCode) { mCode.value = lastCode; mErr('Lost the connection. Press Join to get back into lobby ' + lastCode + '.'); } else mErr('Lost the connection to the server.'); };
  // A match from the server waits for every side's art (its world pictures queue up in the Net meanwhile).
  n.onBegin = m => { const f = m.mt?.facs ? [...new Set(m.mt.facs as number[])] : [Math.floor((m.out ?? 1) / 3), (m.out ?? 1) % 3]; if (artGate(f, () => netBegin(n, m))) netBegin(n, m); };

  try { await n.connect(srv); net = n; mErr(''); then(n); } catch (e) { mErr(String((e as Error).message || e) + ' Check the server address.'); }
}
watchInit({ begin: netBegin, connect: mpConnect, server: () => mServer.value.trim() || defaultServer(), name: () => mName.value.trim().slice(0, 14) || 'Rigger', code: () => mCode.value, net: () => net, err: mErr });
$('mCreate').addEventListener('click', () => mpConnect(n => n.send({ t: 'create', name: pname })));
$('mJoinBtn').addEventListener('click', () => { const c = mCode.value.trim().toUpperCase(); if (c.length !== 5) { mErr('Lobby codes are five letters.'); return; } mpConnect(n => n.send({ t: 'join', code: c, name: pname })); });
mCode.addEventListener('keydown', e => { if (e.key === 'Enter') $('mJoinBtn').click(); });
$('mLeave').addEventListener('click', () => { net?.send({ t: 'leave' }); });
$('mSide').addEventListener('click', () => { const l = net?.lobby, me = l?.players.find(p => p.id === l.you), c = l?.out ?? 1, outT = c % 3 === Math.floor(c / 3) ? c % 3 + 3 : c % 3; net?.send({ t: 'team', v: me && me.team === outT ? 0 : 1 }); });
$('mReady').addEventListener('click', () => { const l = net?.lobby, me = l?.players.find(p => p.id === l.you); net?.send({ t: 'ready', v: !(me && me.ready) }); });
$('mStart').addEventListener('click', () => net?.send({ t: 'start' }));
$('mMade').addEventListener('click', () => { if (MADE.code) net?.send({ t: 'set', plan: MADE.code }); });
mDiffB.forEach((b, i) => b.addEventListener('click', () => net?.send({ t: 'set', diff: i })));
// The host's kind of game: the yard's faction holds the yard's team, the outpost's the other; in a free for all the starts take turns.
$('mTeams').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('[data-t]') as HTMLButtonElement | null, l = net?.lobby; if (!b || !l || b.disabled) return;
  const n = MAPS[baseOf(l.map)]?.ring || 0, L = TEAM_LAYOUTS[n]?.[+b.dataset.t!]; if (!L) return; if (+b.dataset.t! === 0) { net?.send({ t: 'set', mt: null }); return; }
  const code = l.out ?? 1, lh = Math.floor(code / 3), lf = code % 3, cyc = [lh, lf, ...[0, 1, 2].filter(f => f !== lh && f !== lf)], facs: number[] = Array(n).fill(-1);
  L.teams.forEach((grp, gi) => { for (const s of grp) facs[s] = L.teams.length === 2 ? (gi === 0 ? lh : lf) : cyc[gi % cyc.length]; });
  net?.send({ t: 'set', mt: { n, groups: L.teams.map(x => x.slice()), facs } }); });
$('mStarts').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('[data-s]') as HTMLElement | null; if (b) net?.send({ t: 'team', s: +b.dataset.s! }); }); mFoeB.forEach((b, i) => b.addEventListener('click', () => { const c = net?.lobby?.out ?? 1; net?.send({ t: 'set', out: Math.floor(c / 3) * 3 + FOE_FAC[i] }); })); mHomeB.forEach((b, i) => b.addEventListener('click', () => { const c = net?.lobby?.out ?? 1; net?.send({ t: 'set', out: i * 3 + c % 3 }); })); mMapB.forEach((b, i) => b.addEventListener('click', () => net?.send({ t: 'set', map: mapCode(+(b.dataset.b ?? i), sizeOf(lobMap)) }))); mSizeB.forEach(b => b.addEventListener('click', () => net?.send({ t: 'set', map: mapCode(baseOf(lobMap), +(b.dataset.s || 0)) })));
showMode();
const diffBtns = Array.from($('diff').querySelectorAll('button')) as HTMLButtonElement[];
const showDiff = () => diffBtns.forEach((b, i) => { b.classList.toggle('on', i === diffI); b.setAttribute('aria-pressed', String(i === diffI)); });
diffBtns.forEach((b, i) => b.addEventListener('click', () => { diffI = i; showDiff(); save(); })); showDiff();
const mapBtns = Array.from($('maps').querySelectorAll('button')) as HTMLButtonElement[];
const sizeBtns = Array.from($('sizes').querySelectorAll('button')) as HTMLButtonElement[];
const teamRow = $('teams');
/** The kind-of-game buttons, for a map with more than two starts only. */
const showTeams = () => {
  const n = startsHere(), L = n ? TEAM_LAYOUTS[n] || [] : []; teamRow.hidden = L.length < 2; if (teamI >= L.length) teamI = 0;
  const say: Record<string, string> = { '1v1': 'One on one, the rest of the starts left empty', '2v2': 'You and one ally against two', '3v3': 'You and two allies against three', '4v4': 'You and three allies against four', 'Free for all': 'Every start for itself' };
  teamRow.innerHTML = L.map((l, i) => `<button type="button" data-t="${i}" class="${i === teamI ? 'on' : ''}" aria-pressed="${i === teamI}">${l.name}<small>${say[l.name] || ''}</small></button>`).join('');
};
teamRow.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('[data-t]') as HTMLElement | null; if (!b) return; teamI = +b.dataset.t!; showTeams(); showSide(); if (mode === 'skirm' && builtTeam !== teamKey()) fresh(); });
const showMap = () => { showTeams(); mapBtns.forEach((b, i) => { const on = +(b.dataset.b ?? i) === baseOf(mapI); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); sizeBtns.forEach(b => { const on = +(b.dataset.s || 0) === sizeOf(mapI); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); };
/** Picks a map, keeping the size; a number of 10 or more is a whole map code with its size. */
const useMap = (code: number) => { mode = 'skirm'; mapI = code % 100; showMap(); showMode(); save(); if (game.mapI % 100 !== mapI || game.mission) fresh(); };
// Picking a map from the list puts any made map away; the map maker's Play button puts it back in use.
const pickMap = (i: number) => { usePlan(null); showMade(); useMap(i >= 10 ? i : mapCode(i, sizeOf(mapI))); };
const pickSize = (s: number) => { usePlan(null); showMade(); useMap(mapCode(baseOf(mapI), s)); };
const showMade = () => { const n = $('makerNote'); if (n) n.textContent = MADE.plan ? 'Your made map is in use. Pick any map above to put it away.' : 'Lay out your own map and share it as a code'; };
const playMade = (code: number) => { mapI = code % 100; mode = 'skirm'; showMap(); showMode(); showMade(); fresh(); start(); };
$('makerBtn').addEventListener('click', () => openMaker(playMade));
// A made map's code after #map= in the address loads it, once the page is up.
queueMicrotask(() => { const hm = location.hash.match(/map=(M[\w-]+)/); const P = hm ? usePlan(hm[1]) : null; if (P) { mapI = planMap(P) % 100; mode = 'skirm'; showMap(); showMode(); showMade(); fresh(); } });
mapBtns.forEach((b, i) => b.addEventListener('click', () => pickMap(+(b.dataset.b ?? i)))); sizeBtns.forEach(b => b.addEventListener('click', () => pickSize(+(b.dataset.s || 0)))); showMap();
const sensEl = $('sens') as HTMLInputElement, volEl = $('vol') as HTMLInputElement; sensEl.value = String(sens); volEl.value = String(vol);
sensEl.addEventListener('input', () => { sens = +sensEl.value; game.sens = sens; pad.sens = sens; save(); });
volEl.addEventListener('input', () => { vol = +volEl.value; setVolume(vol); save(); });
const musEl = $('mus') as HTMLInputElement; musEl.checked = mus; musEl.addEventListener('change', () => { mus = musEl.checked; setMusic(mus); save(); syncOpts(); });
// ---- options tab
const sens2 = $('sens2') as HTMLInputElement, vol2 = $('vol2') as HTMLInputElement, mus2 = $('mus2') as HTMLInputElement, cbEl = $('cb') as HTMLInputElement, gfxB = Array.from($('gfx').querySelectorAll('button')) as HTMLButtonElement[];
// Edge smoothing is the first thing to go when Auto has had to drop the resolution.
const aoFor = () => gfxI === 1 || (gfxI === 0 && quality < .75) ? 0 : 1;
const glowFor = () => gfxI === 1 || (gfxI === 0 && quality < .6) ? 0 : 1;
const aaFor = () => gfxI === 1 || (gfxI === 0 && quality < 1) ? 0 : 4;
function applyOpts() { document.body.classList.toggle('cb', cbOn); hud.cb = hud2.cb = cbOn; pipe.shadowEvery = gfxI === 1 ? 3 : 1; pipe.aa = aaFor(); pipe.ao = aoFor(); pipe.glow = pipe.shafts = glowFor(); LAMP_ON.value = (gfxI as number) !== 1; pipe.w = 0; hud.relabel(touchOn ? k => TOUCHKEYS[k] ?? k : Object.keys(binds).length ? k => keyText(keyOf(k === 'Tab' || k === 'Space' ? k : 'Key' + k)) : null); resize(); }
/** On a touch screen the HUD names the on-screen buttons instead of keys. */
const TOUCHKEYS: Record<string, string> = { RMB: 'Aim', MMB: 'Send', TAB: 'Jump', Tab: 'Jump', Space: 'Dash', C: 'Ability', Q: 'Back', V: 'Squad', G: 'QM', R: 'Reload' };
function syncOpts() { sens2.value = sensEl.value = String(sens); vol2.value = volEl.value = String(vol); mus2.checked = musEl.checked = mus; cbEl.checked = cbOn; gfxB.forEach((b, i) => b.classList.toggle('on', i === gfxI)); }
function showKeys() { $('keys').innerHTML = ACTIONS.map(([a, label]) => `<button type="button" data-a="${a}" class="${rebinding === a ? 'on' : ''}">${label}<b>${rebinding === a ? 'Press a key' : keyText(keyOf(a))}</b></button>`).join(''); }
sens2.addEventListener('input', () => { sens = +sens2.value; game.sens = sens; pad.sens = sens; save(); syncOpts(); }); vol2.addEventListener('input', () => { vol = +vol2.value; setVolume(vol); save(); syncOpts(); });
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
const touchB = Array.from($('touchPick').querySelectorAll('button')) as HTMLButtonElement[], TP: TouchPref[] = ['auto', 'on', 'off'];
const showTouch = () => touchB.forEach((b, i) => { const on = TP[i] === touchPref; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
touchB.forEach((b, i) => b.addEventListener('click', () => { touchPref = TP[i]; save(); showTouch(); setTouch(touchWanted()); }));
syncOpts(); showKeys(); applyOpts(); showTouch(); setTouch(touchWanted());
$('full').addEventListener('click', () => { try { const p: any = document.fullscreenElement ? document.exitFullscreen() : $('game').requestFullscreen(); if (p && p.catch) p.catch(() => { /* optional */ }); } catch (e) { /* optional */ } });

// ---------------------------------------------------------------- loop
let last = performance.now(), freeShown = false;
/** Tests that only care about the rules hold the picture still: no game on this page draws until they let go. */
let still = false;
function frame(now: number) {
  const dt = (now - last) / 1000; last = now; watchFrame(game, dt); if (still) { game.noRender = true; if (game2) game2.noRender = true; }
  // Without mouse capture, holding the cursor near a screen edge turns the view.
  pad.frame(); if (touchOn) document.body.classList.toggle('playing', live());
  if (freeMouse && !touchOn && moved && live() && !game.tab) { const ex = curX < .1 ? (curX - .1) / .1 : curX > .9 ? (curX - .9) / .1 : 0; game.mdx += ex * 900 * dt; }
  if (freeMouse !== freeShown) { freeShown = freeMouse; $('edgeNote').hidden = !freeMouse; $('freeNote').hidden = !freeMouse; }
  if (split && game2) {
    if (game.phase !== 'paused') split.frame(dt);
    padPoll(dt);
    audioSeat(.65, 0); game.update(dt); audioSeat(.65, 1); game2.update(dt); audioSeat(1, 0);
  } else { if (split && game.phase !== 'paused') split.frame(dt); if (cutP.on) cutP.frame(dt); if (!still) padPoll(dt); game.update(dt); }
  if (fpsOn) { fpsN++; fpsT += dt; fpsWorst = Math.max(fpsWorst, dt); if (fpsT >= .5) { const info = pipe.renderer.info.render; $('fps').textContent = `${Math.round(fpsN / fpsT)} fps · worst ${Math.round(fpsWorst * 1000)} ms · ${pipe.w | 0}×${pipe.h | 0} · ${game.units.length} units`; fpsN = 0; fpsT = 0; fpsWorst = 0; void info; } }
  const GL = SIDE.out === 2, classic = fac(SIDE.home) === 0 && fac(SIDE.out) !== 0, hqN = (t: number) => BLD[FACTION[t].hq].name;
  if (game.story) { /* a story job writes its own end screen */ }
  else if (game.phase === 'over' && !ended && !game.story && split && !classic && splitMode === 'veyl') { const mine = SIDE.out, foe = SIDE.home; $('endTitle').textContent = game.won ? `${FACTION[mine].name} take the valley` : `${FACTION[mine].name} lose the valley`; $('endTitle').className = 'logo sm'; $('endLine').textContent = game.won ? `Every ${hqN(foe)} at the yard is down.` : `The last ${hqN(mine)} at the outpost fell.`; }
  else if (game.phase === 'over' && !ended && !game.story && split && !classic && splitVs && game2) { const a = SIDE.home, b = SIDE.out, same = fac(a) === fac(b); $('endTitle').textContent = game.won ? (same ? 'Player one holds the valley' : `${FACTION[a].short} holds the valley`) : same ? 'Player two takes the valley' : `${FACTION[b].short} takes the valley`; $('endTitle').className = 'logo sm'; $('endLine').textContent = game.won ? `Player one broke every ${hqN(b)} at the outpost.` : `Player two broke every ${hqN(a)} at the yard.`; }
  else if (!classic) { /* the generic lines above, or the standard end screen */ }
  else if (game.phase === 'over' && !ended && !game.story && split && splitMode === 'veyl' && GL) { $('endTitle').textContent = game.won ? 'The Gloam take the valley' : 'The swarm withers'; $('endTitle').className = 'logo sm'; $('endLine').textContent = game.won ? 'Every Headframe is chewed to scrap. The Bloom runs to the horizon.' : 'The last Mother Cap is mulch. The crew are already burning the carpet.'; }
  else if (game.phase === 'over' && !ended && !game.story && split && splitMode === 'veyl') { $('endTitle').textContent = game.won ? 'The Veyl take the valley' : 'The Chorus falls silent'; $('endTitle').className = 'logo sm'; $('endLine').textContent = game.won ? 'Every Headframe is down. The Ironhold dig somewhere else now.' : 'The last Choir Stone broke. The crew are already pricing the glass.'; }
  if (game.phase === 'over' && !ended && split && classic && splitVs && game2 && !game.story) { $('endTitle').textContent = game.won ? 'Ironhold holds the valley' : GL ? 'The Gloam take the valley' : 'The Veyl take the valley'; $('endTitle').className = 'logo sm'; $('endLine').textContent = game.won ? (GL ? 'Player one squashed every Mother Cap. Player two, the Bloom is drying out.' : 'Player one broke every Choir Stone. Player two, the singing has stopped.') : 'Player two broke the Headframe. Player one, the Charter will be billing your next of kin.'; }
  if (game.phase === 'over' && !ended) { ended = true; const m = mode !== 'skirm' ? game.story : null; if (m && game.won) { const i = MISSIONS.indexOf(m); if (i < STORY_JOBS) { if (i >= camp) STORY.oreTotal += m.out ? game.stats.minedV : game.stats.mined; camp = Math.max(camp, i + 1); } else sideDone |= 1 << (i - STORY_JOBS); if (camp >= MP_AFTER) mpOpen = true; save(); } $('again').textContent = m ? (game.won ? (MISSIONS.indexOf(m) < STORY_JOBS - 1 ? 'Next job' : MISSIONS.indexOf(m) === STORY_JOBS - 1 ? 'Watch the ending' : 'Run it again') : 'Try that again') : split ? 'Another shift' : game.net ? 'Back to the lobby' : 'Another shift'; }
  // Drop the render resolution if the machine can't keep up, and bring it back if it can.
  // A machine that is far behind should not have to suffer fifty frames before the picture gets lighter, so very slow frames count for more.
  if (dt > .034) { slow += dt > .15 ? 10 : dt > .07 ? 3 : 1; fast = 0; } else if (dt < .02) { fast++; slow = Math.max(0, slow - 1); }
  if (gfxI === 0)
  if (slow > 50 && quality > .5) { quality = Math.max(.5, quality * .85); slow = 0; pipe.aa = aaFor(); pipe.ao = aoFor(); pipe.glow = pipe.shafts = glowFor(); LAMP_ON.value = (gfxI as number) !== 1; resize(); }
  // Resolution is the only thing the Auto setting gave up, but a phone that is still slow at half resolution is short of geometry, not pixels:
  // the shadow pass draws the whole scene a third time. At the floor, Auto redraws shadows every third frame, the same as Low.
  if (gfxI === 0) { const every = quality <= .5 ? 3 : 1; if (pipe.shadowEvery !== every && (every === 3 ? slow > 50 : fast > 900)) { pipe.shadowEvery = every; slow = fast = 0; } }
  if (gfxI === 0)
  if (fast > 900 && quality < 1) { quality = Math.min(1, quality / .85); fast = 0; pipe.aa = aaFor(); pipe.ao = aoFor(); pipe.glow = pipe.shafts = glowFor(); LAMP_ON.value = (gfxI as number) !== 1; resize(); }
  requestAnimationFrame(frame);
}
(window as any).__ore = { MAP: () => MAP, ter: () => TER, models: MD, tx: TX, mats: M, gloamB: GLOAM_BUILDINGS, gloamBloom: bloomPatch, sounds: { ready: soundsReady, sfx }, quit, atlasUsed: MD.atlasUsed, game, start, pipe, hud, hud2, startSplit, startVeyl, pause, resume, touch: pad, setTouch, reg: { defineAbilities, defineBuildings, UNIT, BLD, isFriend }, padDrive: (p: Gamepad, dt = 1 / 30) => padDrive(game, p, 0, dt), split: () => split, game2: () => game2, setFree: (v: boolean) => { freeMouse = v; }, hold: (v: boolean) => { still = v; if (!v) { game.noRender = false; if (game2) game2.noRender = false; } }, pickMap, pickSize, setRaid: (v: boolean) => { raid = v; showSide(); if (mode === 'skirm' && builtTeam !== teamKey()) fresh(); }, pickSide: (s: number, f = 0) => { mode = "skirm"; sideI = s; foeI = s ? s - 1 : f; showSide(); fresh(); }, unlock: () => { camp = STORY_JOBS; mpOpen = true; mode = 'multi'; showMode(); }, net: () => net, pickJob: (i: number) => { mode = 'camp'; camp = Math.max(camp, Math.min(i, STORY_JOBS)); jobI = i; showMode(); fresh(); }, playCuts, cuts: CUTS, cutP, startStory: (i: number) => { mode = 'camp'; jobI = i; camp = Math.max(camp, Math.min(i, STORY_JOBS)); start(); } };
requestAnimationFrame(frame);
