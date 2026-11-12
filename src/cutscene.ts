// Cut scenes: comic panels shot live in the game's own renderer. Each scene builds a small stage on a real map (a few bodies, a building,
// a broken Stone), points the camera, and lays a caption box and speech balloons over the frame. Click or Space turns the page; Esc skips.
import * as THREE from 'three';
import type { Game } from './game';
import type { Kind, BKind, Unit } from './data';
import { ROAD, OUTPOST, VHOME, MAP, roadPt, veylPt } from './data';

type P3 = [number, number, number];
export interface Panel {
  /** Where the camera stands and what it looks at. `to` is where it drifts to over the panel. Worked out when the panel opens. */
  shot: (g: Game) => { cam: P3; look: P3; to?: P3; fov?: number };
  /** The caption box: who is talking or what is happening, in plain words. */ cap?: string;
  /** Speech balloons, in reading order. */ say?: [string, string][];
  /** Puts bodies and buildings on the stage before the camera opens. */ stage?: (g: Game) => void;
  /** Lets the world run under the camera (fights, falling buildings). */ sim?: boolean;
  /** Colour, 1 is normal. Memories are drawn low. */ sat?: number; shake?: number; /** A black panel with only words on it. */ black?: boolean;
}
export interface Cut { id: string; title: string; /** [yard end, outpost end] factions. */ sides: [number, number]; map: number; dusk: number; charter?: 'home' | 'out'; panels: Panel[] }

// ---------------------------------------------------------------- stage helpers
/** A body standing still at a spot, facing a point. */
function put(g: Game, kind: Kind, team: number, x: number, z: number, fx = x, fz = z + 10): Unit {
  const u = g.spawn(kind, team, x, z); u.yaw = Math.atan2(fx - x, fz - z); u.obj.rotation.y = u.yaw; u.order = { type: 'guard', x, z }; return u;
}
const ring = (g: Game, kind: Kind, team: number, cx: number, cz: number, r: number, n: number) => { for (let i = 0; i < n; i++) { const a = i / n * 6.283; put(g, kind, team, cx + Math.cos(a) * r, cz + Math.sin(a) * r, cx, cz); } };
const crack = (): [number, number] => roadPt(ROAD.len * .52, 34);
const toPlate = (x: number, y: number, z: number): P3 => [x + 50, y + 30, z - 100];
const bld = (g: Game, k: BKind, team: number, x: number, z: number) => g.addBuilding(k, team, x, z, true);
/** Empties the stage for a memory: no bodies, no buildings, none of the yard's own clutter (lamps, drums, fences, pipes, road markers). */
const clear = (g: Game) => {
  for (const u of g.units) if (u.alive && u !== g.me) { u.alive = false; g.scene.remove(u.obj); }
  for (const b of g.buildings) if (b.team % 3 !== 2) b.obj.visible = false;
  for (const q of g.props) if (q.alive && (q.kind === 'metal' || q.kind === 'barrel')) { q.alive = false; for (const r of q.ranges) { const a = r.attr.array as Float32Array; for (let k = r.start * 3, e = (r.start + r.count) * 3; k < e; k += 3) a[k + 1] = -80; r.attr.needsUpdate = true; } }
  for (const o of g.ores) o.obj.visible = false;
};

export const CUTS: Record<string, Cut> = {
  arrival: { id: 'arrival', title: 'Arrival', sides: [0, 1], map: 0, dusk: .05, panels: [
    { shot: () => ({ cam: [60, 46, 70], look: [0, 4, 0], to: [44, 30, 52], fov: 50 }), cap: 'Tithe. Claim 4471-T. The Charter shuttle has already left. Your helmet prints the bill for the trip down.' },
    { shot: () => ({ cam: [9, 3, 12], look: [0, 6, 0], to: [8, 2.6, 10], fov: 46 }), say: [['Quartermaster', 'Welcome to Tithe, Nineteen. Your balance is minus eleven thousand ore. Noted.']] },
    { shot: () => ({ cam: [10, 2.2, 15], look: [6, 1.6, 9], fov: 40 }), stage: g => { put(g, 'rigger', 0, 6, 9, 10, 15); }, say: [['Aggie', 'Aggie Pell. I run this yard. Here\'s your drill. Hold the trigger, fill the pack, walk it home.']] },
    { shot: () => ({ cam: [22, 2.4, 18], look: [17, 1.7, 13], fov: 40 }), stage: g => { put(g, 'linesman', 0, 17, 13, 22, 18); put(g, 'linesman', 0, 15, 11.5, 22, 18); }, say: [['Moss', 'Desmond Moss. I run the book. Four to one you\'re gone inside a week.'], ['Pim', 'I\'m Pim. I watch the road and I give everything on it a name. You\'re Nineteen.']] },
  ] },
  rings: { id: 'rings', title: 'Ring inside ring', sides: [0, 1], map: 0, dusk: .8, panels: [
    { shot: () => ({ cam: [-30, 5, 14], look: [-22, 2, 4], to: [-28, 4, 12], fov: 44 }), stage: g => { bld(g, 'assay', 0, -22, 4); put(g, 'rigger', 0, -26, 9, -22, 4); }, cap: 'The Assay Office, after midnight. Aggie has cut the core sample open.' },
    { shot: () => ({ cam: [-25.5, 2.3, 10.5], look: [-26, 1.6, 9], fov: 34 }), say: [['Aggie', 'Ore doesn\'t grow in rings.']], cap: 'The ore in the core is laid down in rings, one inside the next, like a tree trunk.' },
    { shot: () => ({ cam: [-12, 9, 22], look: [-22, 3, 4], fov: 50 }), say: [['Quartermaster', 'Core sample logged as geological settling. Noted.']] },
  ] },
  queue: { id: 'queue', title: 'The message queue', sides: [0, 1], map: 2, dusk: .85, panels: [
    { shot: () => ({ cam: [14, 4, 20], look: [0, 8, 0], to: [12, 3, 18], fov: 48 }), stage: g => { bld(g, 'mast', 0, -6, -10); put(g, 'rigger', 0, 4, 8, 0, 0); }, cap: 'Head office is forty minutes away by message. Every reply is about something that happened forty minutes ago.' },
    { shot: () => ({ cam: [6, 2.2, 13], look: [4, 1.7, 8], fov: 36 }), say: [['Abbot-Lyle', 'Further to your previous message: quota remains outstanding. Please clear the Switchback outpost. Kind regards.'], ['Aggie', 'You can\'t hear me, can you. No. Course not.']] },
  ] },
  seal: { id: 'seal', title: 'The seal breaks', sides: [0, 2], map: 3, dusk: .7, panels: [
    { shot: g => { const [x, z] = crack(); return { cam: [x + 22, 7, z + 26], look: [x, 4, z], fov: 46 }; }, sim: true, shake: .4, stage: g => { const [x, z] = crack(); const b = bld(g, 'choir', 1, x, z); g.damage(b, b.hp + 10, null); }, cap: 'The last Choir Stone falls.' },
    { shot: g => { const [x, z] = crack(); return { cam: [x + 3, 7, z + 4], look: [x, 0, z], to: [x + 2, 5, z + 3], fov: 58 }; }, sat: .7, cap: 'Under the canyon floor the glass is in layers, hundreds of them, and every layer is cracked through. Pale fungus is pushing up through the cracks.' },
    { shot: g => { const [x, z] = crack(); return { cam: [x + 14, 3, z + 16], look: [x, 1.5, z], to: [x + 11, 2.4, z + 13], fov: 50 }; }, sim: true, shake: .3, stage: g => { const [x, z] = crack(); for (let i = 0; i < 9; i++) put(g, 'snapper', 2, x + (i % 3) * 3 - 3, z + Math.floor(i / 3) * 3 - 3, x + 14, z + 16); put(g, 'linesman', 0, x + 8, z + 9, x, z); }, say: [['Pim', 'What is that? Nineteen, what is that?'], ['Moss', 'Go! I\'ll cover you. I had money on this, you know.']] },
    { shot: () => ({ cam: [0, 40, 0], look: [0, 0, 1], fov: 40 }), black: true, cap: 'Moss goes under. Then the canyon takes your body down with it.' },
  ] },
  wrongbody: { id: 'wrongbody', title: 'Wrong body', sides: [2, 1], map: 13, dusk: .35, panels: [
    { shot: () => ({ cam: [VHOME.x - 10, 2.2, VHOME.z + 12], look: [VHOME.x, 4, VHOME.z], to: [VHOME.x - 8, 2, VHOME.z + 10], fov: 44 }), stage: g => { for (const i of [0, 1, 2]) put(g, 'tender', 1, VHOME.x - 5 + i * 2.2, VHOME.z + 7, VHOME.x - 10, VHOME.z + 12); }, cap: 'You wake up. Your hands are glass. You are inside a Veyl Tender.' },
    { shot: () => ({ cam: [VHOME.x - 13, 3.4, VHOME.z + 17], look: [VHOME.x - 3, 4, VHOME.z + 4], fov: 42 }), stage: g => { put(g, 'warden', 1, VHOME.x - 3, VHOME.z + 4, VHOME.x - 13, VHOME.z + 17); }, say: [['Held Fifth', 'YOUR LINK CAME LOOSE WHEN THE CANYON FELL. WE PULLED IT INTO THIS BODY.'], ['Phrasebook 3', '[PAID VERSION] WE NEED HANDS. YOU BROKE OUR STONES. YOU WILL HELP US FIX THEM.']] },
  ] },
  howsealed: { id: 'howsealed', title: 'How the seal was made', sides: [2, 1], map: 4, dusk: .2, panels: [
    { shot: () => ({ cam: [40, 14, 40], look: [0, 1, 0], to: [32, 10, 34], fov: 50 }), sat: .35, stage: g => { clear(g); for (let i = 0; i < 14; i++) put(g, i % 4 ? 'snapper' : 'mulcher', 2, (i % 5) * 5 - 10, Math.floor(i / 5) * 5 - 6, 40, 40); }, cap: 'Nine hundred years ago, the Gloam covered the surface of Tithe.' },
    { shot: () => ({ cam: [30, 9, 24], look: [8, 5, 4], fov: 46 }), sat: .35, stage: g => { ring(g, 'warden', 1, 8, 4, 9, 5); ring(g, 'tender', 1, 8, 4, 14, 9); }, cap: 'The Veyl came down from the sky and stood in rings around it.' },
    { shot: () => ({ cam: [-24, 18, 30], look: [-40, 10, -4], fov: 50 }), sat: .45, cap: 'They sang until the ground turned to glass on top of the Gloam. They have sung every night since, to keep the glass thick.', say: [['Held Fifth', 'THE ORE YOU DIG IS THAT GLASS.']] },
  ] },
  warning: { id: 'warning', title: 'The full warning', sides: [0, 1], map: 10, dusk: .55, panels: [
    { shot: () => ({ cam: [14, 3, 22], look: [3, 2, 9], to: [12, 2.6, 19], fov: 44 }), stage: g => { put(g, 'lancer', 1, 4, 10, 0, 0); put(g, 'rigger', 0, 1, 5, 4, 10); put(g, 'linesman', 0, -2, 6, 4, 10); }, say: [['Pim', 'I paid for the full phrasebook. Here is what the Veyl told the first crew, thirty-one years ago. All four hours of it.']] },
    { shot: () => ({ cam: [0, 30, 0], look: [0, 0, 1], fov: 40 }), black: true, cap: 'PHRASEBOOK 3: ...LEAVE THE GLASS IN THE GROUND, OR ELSE THE GLOAM GETS OUT. TAKE ONLY WHAT GROWS BACK.' },
    { shot: () => ({ cam: [5, 2, 9.5], look: [1, 1.4, 5], fov: 36 }), cap: 'Thirty-one years ago the free phrasebook translated only the last two words, OR ELSE. The first crew painted them on the yard sign as ORE ELSE.', say: [['Aggie', 'It was a warning. I only read them two words.']] },
  ] },
  clause9queue: { id: 'clause9queue', title: 'Clause 9 is on its way', sides: [0, 1], map: 10, dusk: .65, panels: [
    { shot: () => ({ cam: [10, 12, 18], look: [0, 6, 0], fov: 46 }), say: [['Quartermaster', 'Head office has read about the canyon. The claim is now impaired. Clause 9 is in the queue. Have a lovely evening.']] },
  ] },
  lastverse: { id: 'lastverse', title: 'The last verse', sides: [2, 1], map: 23, dusk: .3, panels: [
    { shot: g => { const [x, z] = crack(); return { cam: [x + 30, 12, z + 30], look: [x, 3, z], to: [x + 24, 9, z + 24], fov: 48 }; }, stage: g => { const [x, z] = crack(); for (const k of [-30, 0, 30]) { const c = roadPt(ROAD.len * .52 + k, 34 + (k ? -14 : 16)); bld(g, 'choir', 1, c[0], c[1]); } ring(g, 'warden', 1, x, z, 12, 3); }, cap: 'Three Choir Stones round the crack. The crack is starting to close.' },
    { shot: g => { const [x, z] = crack(); return { cam: [x + 8, 3, z + 8], look: [x, 3.5, z], fov: 40 }; }, say: [['Held Fifth', 'NOW WE TURN ALL THE OPEN GROUND TO GLASS. ALL OF IT. THE YARD TOO.'], ['Phrasebook 3', '...AND THE SMALL LOUD ONES [TRANSLATION: HUMANS] GO UNDER THE GLASS WITH THE REST.']] },
    { shot: g => { const [x, z] = crack(); return { cam: [x + 2.2, .9, z + 2.2], look: [x, .7, z], fov: 70 }; }, shake: .5, stage: g => { const [x, z] = crack(); put(g, 'snapper', 2, x + .6, z + .6, x + 3, z + 3); }, cap: 'You hesitate. The Gloam takes the Stone you are standing on.' },
  ] },
  longshift: { id: 'longshift', title: 'Long shift?', sides: [1, 2], map: 13, dusk: .35, panels: [
    { shot: () => ({ cam: [VHOME.x - 7, .8, VHOME.z + 7], look: [VHOME.x, .9, VHOME.z], to: [VHOME.x - 6, .7, VHOME.z + 6], fov: 60 }), stage: g => { for (let i = 0; i < 5; i++) put(g, 'grazer', 2, VHOME.x - 3 + i * 1.4, VHOME.z + 3 + (i % 2), VHOME.x - 7, VHOME.z + 7); }, cap: 'You wake up close to the ground, with too many legs. You are a Gloam Grazer.' },
    { shot: () => ({ cam: [VHOME.x - 12, 6, VHOME.z + 14], look: [VHOME.x, 2, VHOME.z], fov: 50 }), say: [['Moss', 'Hello, Nineteen. Long shift?'], ['The Gloam', 'A CLEAN YARD IS A SAFE YARD. HELLO, NINETEEN. WE HAVE BEEN UNDER FOR NINE HUNDRED YEARS.']], cap: 'Moss\'s voice comes out of every Gloam body at once.' },
  ] },
  beforeglass: { id: 'beforeglass', title: 'Before the glass', sides: [1, 2], map: 24, dusk: .1, panels: [
    { shot: () => ({ cam: [-14, 6, 24], look: [-40, 9, -4], to: [-18, 5, 20], fov: 50 }), cap: 'At the First Stone, the Gloam shows you what it remembers.' },
    { shot: () => ({ cam: [30, 10, 30], look: [0, 3, 0], fov: 52 }), sat: .3, stage: g => { clear(g); for (let i = 0; i < 16; i++) put(g, i % 5 ? 'snapper' : 'quillback', 2, (i % 4) * 5 - 8, Math.floor(i / 4) * 5 - 8, 30, 30); }, cap: 'Open sky. Spores going up. This was the Gloam\'s season.' },
    { shot: () => ({ cam: [18, 26, 26], look: [0, 0, 0], fov: 54 }), sat: .3, stage: g => { ring(g, 'warden', 1, 0, 0, 16, 6); }, say: [['The Gloam', 'THEN THE SINGERS CAME DOWN. THEY SANG THE GROUND SHUT ON TOP OF US.'], ['Moss', 'The Veyl weren\'t here first either, Nineteen. The Gloam was.']] },
  ] },
  clause9: { id: 'clause9', title: 'Clause 9', sides: [0, 2], map: 25, dusk: .85, charter: 'home', panels: [
    { shot: () => ({ cam: [0, 30, 0], look: [0, 0, 1], fov: 40 }), black: true, cap: 'CLAUSE 9. If a claim is impaired, the Charter may recover its value by any means. Signed, Fenwick Abbot-Lyle, Asset Recovery.' },
    { shot: () => { const [x, z] = roadPt(ROAD.len * .3, -30); return { cam: [x + 36, 8, z + 30], look: [x, 16, z], to: [x + 30, 6, z + 26], fov: 46 }; }, cap: 'The drill tower on the Glass Flats goes down through the glass to a Deep Charge, a bomb big enough to crack the whole basin open so the company can mine it from orbit.' },
    { shot: () => { const [x, z] = roadPt(ROAD.len * .3, -30); return { cam: [x, 3, z + 10], look: toPlate(x, 3, z + 10), fov: 50 }; }, cap: 'The order to set it off is already in the message queue. It arrives in 39 minutes.', say: [['Quartermaster', 'Nobody on the surface is in the plan. Noted.']] },
  ] },
  receiver: { id: 'receiver', title: 'The receiver', sides: [0, 1], map: 0, dusk: .7, panels: [
    { shot: () => ({ cam: [-2, 4, 4], look: [-6, 8, -10], to: [-1, 3.4, 3], fov: 46 }), stage: g => { bld(g, 'mast', 0, -6, -10); put(g, 'rigger', 0, -3, -4, 0, 4); }, cap: 'Pim has wired a receiver into the Signal Mast. It pulls your mind out of the Gloam and into a Rigger.' },
    { shot: () => ({ cam: [8, 2.2, 12], look: [5, 1.6, 8], fov: 38 }), stage: g => { put(g, 'rigger', 0, 5, 8, 8, 12); }, say: [['Aggie', 'New drill. Same debt. Welcome back.'], ['Pim', 'Moss didn\'t come with you. He says he\'s fine where he is.']] },
  ] },
  mossstays: { id: 'mossstays', title: 'Moss stays', sides: [0, 2], map: 25, dusk: .85, charter: 'home', panels: [
    { shot: () => ({ cam: [OUTPOST.x - 18, 4, OUTPOST.z + 18], look: [OUTPOST.x, 2, OUTPOST.z], fov: 48 }), stage: g => { for (let i = 0; i < 12; i++) put(g, i % 3 ? 'snapper' : 'grazer', 2, OUTPOST.x - 8 + (i % 4) * 3, OUTPOST.z + 4 + Math.floor(i / 4) * 3, OUTPOST.x - 18, OUTPOST.z + 18); }, say: [['Moss', 'I\'m staying, Nineteen. The odds are good down here.'], ['Moss', 'Here\'s everything I owe you lot. I lost every bet on you.']] },
  ] },
  reserve: { id: 'reserve', title: 'Reserve price', sides: [0, 1], map: 0, dusk: .65, panels: [
    { shot: () => ({ cam: [0, 30, 0], look: [0, 0, 1], fov: 40 }), black: true, cap: 'Forty minutes later, head office replies. The asset failed to liquidate. Claim 4471-T is written off and goes to auction. Reserve price: one ore.' },
    { shot: () => ({ cam: [6, 2.2, 11], look: [3, 1.4, 7], fov: 36 }), stage: g => { put(g, 'rigger', 0, 3, 7, 6, 11); put(g, 'rigger', 0, 5, 6, 3, 7); }, cap: 'Aggie tips your pack out on the desk. One chip of glass falls out.', say: [['Aggie', 'One ore. We bid it.']] },
    { shot: () => ({ cam: [40, 24, 50], look: [0, 4, 0], fov: 50 }), cap: 'The crew owns Tithe.' },
  ] },
  grows: { id: 'grows', title: 'Take only what grows back', sides: [0, 1], map: 0, dusk: .55, panels: [
    { shot: () => { const m = roadPt(MAP.arch || 68, 0); return { cam: [m[0] - 16, 3, m[1] + 14], look: [m[0], 3, m[1]], to: [m[0] - 13, 2.6, m[1] + 11], fov: 46 }; }, stage: g => { const m = roadPt(MAP.arch || 68, 0); put(g, 'rigger', 0, m[0] - 4, m[1] + 2, m[0], m[1]); put(g, 'linesman', 0, m[0] - 5, m[1] - 1, m[0], m[1]); put(g, 'warden', 1, m[0] + 4, m[1] + 1, m[0], m[1]); put(g, 'tender', 1, m[0] + 3, m[1] - 2, m[0], m[1]); put(g, 'snapper', 0, m[0], m[1] + 5, m[0], m[1]); put(g, 'grazer', 0, m[0] + 1.5, m[1] + 6, m[0], m[1]); }, cap: 'The three sides meet under the Needle\'s Eye. You are the only one who has been all three.' },
    { shot: () => { const m = roadPt(MAP.arch || 68, 0); return { cam: [m[0] - 5, 1.8, m[1] + 4], look: [m[0] + 3, 2.4, m[1]], fov: 38 }; }, say: [['Nineteen', 'Take only what grows back.']], cap: 'You speak for the first time.' },
    { shot: () => ({ cam: [0, 30, 0], look: [0, 0, 1], fov: 40 }), black: true, cap: 'The yard digs only what grows back. The Chorus sings it back. The Gloam gets the Glass Flats every spore season. Moss pays everyone who bet on you to survive.' },
  ] },
  invoice: { id: 'invoice', title: 'Invoice', sides: [0, 1], map: 0, dusk: .9, panels: [
    { shot: () => ({ cam: [0, 4, 30], look: toPlate(0, 4, 30), fov: 50 }), cap: 'One more message drops out of the queue, forty minutes late.', say: [['Abbot-Lyle', 'Congratulations to the new owners of Claim 4471-T. Please find attached our invoice for the message service. Kind regards.']] },
  ] },
};
void veylPt;

/** Plays one scene on a Game that was built for it. The game's own frame loop draws; this moves the camera and the words. */
export class CutPlayer {
  private cut: Cut | null = null; private i = 0; private t = 0; private dur = 1; private from = new THREE.Vector3(); private to = new THREE.Vector3(); private done: (() => void) | null = null; private g: Game | null = null;
  /** Panels turn by themselves once read. Tests and screenshots switch this off. */ auto = true;
  constructor(private el: HTMLElement) {}
  get on() { return !!this.cut; }
  start(cut: Cut, g: Game, done: () => void) { this.cut = cut; this.g = g; this.i = -1; this.done = done; g.phase = 'cut'; this.el.hidden = false; this.el.querySelector('.ctitle')!.textContent = cut.title; this.next(); }
  next() {
    const c = this.cut, g = this.g; if (!c || !g) return; this.i++;
    if (this.i >= c.panels.length) { this.finish(); return; }
    const p = c.panels[this.i]; p.stage?.(g); const s = p.shot(g);
    this.from.set(...s.cam); this.to.set(...(s.to || s.cam)); g.shot = { pos: this.from.clone(), look: new THREE.Vector3(...s.look), fov: s.fov || 46 }; g.cutSim = !!p.sim; g.cutSat = p.sat ?? 1; if (p.shake) g.shake = Math.max(g.shake, p.shake);
    const words = (p.cap || '').length + (p.say || []).reduce((n, l) => n + l[1].length, 0); this.dur = 3 + words * .055; this.t = 0;
    this.el.classList.toggle('black', !!p.black); this.el.querySelector('.cnum')!.textContent = `${this.i + 1} / ${c.panels.length}`;
    const cap = this.el.querySelector('.ccap') as HTMLElement; cap.hidden = !p.cap; cap.textContent = p.cap || '';
    const bubs = this.el.querySelector('.cbubs') as HTMLElement; bubs.innerHTML = (p.say || []).map(([w, t], k) => `<div class="cbub ${k % 2 ? 'r' : ''} ${/^[A-Z0-9 .,!?'[\]:()-]+$/.test(t) ? 'loud' : ''}"><h5>${w}</h5>${t.replace(/</g, '&lt;')}</div>`).join('');
    this.el.classList.remove('turn'); void this.el.offsetWidth; this.el.classList.add('turn');
  }
  skip() { this.finish(); }
  private finish() { const d = this.done; this.cut = null; this.done = null; if (this.g) { this.g.shot = null; this.g.cutSim = false; this.g.cutSat = 1; } this.g = null; this.el.hidden = true; d?.(); }
  /** Moves the camera along the panel's drift. Panels turn on their own after enough time to read them. */
  frame(dt: number) {
    const g = this.g; if (!this.cut || !g || !g.shot) return; this.t += dt; const k = Math.min(1, this.t / Math.max(this.dur, 4)), e = k * k * (3 - 2 * k);
    g.shot.pos.lerpVectors(this.from, this.to, e); if (this.auto && this.t > this.dur + 2.5) this.next();
  }
}
