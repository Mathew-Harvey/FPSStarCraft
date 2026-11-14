// Cut scenes: comic panels shot live in the game's own renderer. Each scene builds a small stage on a real map (a few bodies, a building,
// a broken Stone), points the camera, and lays a caption box and speech balloons over the frame. Click or Space turns the page; Esc skips.
import * as THREE from 'three';
import type { Game } from './game';
import type { Kind, BKind, Unit } from './data';
import { ROAD, OUTPOST, VHOME, MAP, UNIT, roadPt, veylPt } from './data';
import { sfx } from './audio';

type P3 = [number, number, number];
export interface Panel {
  /** Where the camera stands and what it looks at. `to` is where it drifts to over the panel. Worked out when the panel opens. */
  shot: (g: Game) => { cam: P3; look: P3; to?: P3; fov?: number };
  /** The caption box: who is talking or what is happening, in plain words. */ cap?: string;
  /** Speech balloons, in reading order. */ say?: [string, string][];
  /** Puts bodies and buildings on the stage before the camera opens. */ stage?: (g: Game) => void;
  /** Lets the world run under the camera (fights, falling buildings). */ sim?: boolean;
  /** Colour, 1 is normal. Memories are drawn low. */ sat?: number; shake?: number; /** A black panel with only words on it. */ black?: boolean;
  /** A rubber stamp slammed across the panel (the Quartermaster's NOTED, and so on). */ stamp?: string;
  /** Nineteen's balance with the Charter, shown in the corner like a bill. */ bal?: number;
  /** A sound when the panel opens. */ sfx?: 'card' | 'blip' | 'boom' | 'alarm' | 'bank' | 'built' | 'kill' | 'slash' | 'win';
}
export interface Cut { id: string; title: string; /** [yard end, outpost end] factions. */ sides: [number, number]; map: number; dusk: number; charter?: 'home' | 'out'; panels: Panel[] }

// ---------------------------------------------------------------- stage helpers
/** Every body the scene put on its stage, and the named cast among them: one body per name, walked from mark to mark between panels. */
let placed = new Set<Unit>(), cast: Record<string, Unit> = {};
/** A body standing still at a spot, facing a point. */
function put(g: Game, kind: Kind, team: number, x: number, z: number, fx = x, fz = z + 10): Unit {
  const u = g.spawn(kind, team, x, z); u.yaw = Math.atan2(fx - x, fz - z); u.obj.rotation.y = u.yaw; u.order = { type: 'guard', x, z }; placed.add(u); return u;
}
/** One of the named cast. The first call puts the body on the stage; later calls walk the same body to a new mark. Its name floats over its head. */
function who(g: Game, name: string, kind: Kind, team: number, x: number, z: number, fx: number, fz: number): Unit {
  const u = cast[name]; if (!u || !u.alive || u.kind !== kind) return cast[name] = put(g, kind, team, x, z, fx, fz);
  u.pos.x = x; u.pos.z = z; u.obj.position.x = x; u.obj.position.z = z; u.yaw = Math.atan2(fx - x, fz - z); u.obj.rotation.y = u.yaw; u.order = { type: 'guard', x, z }; return u;
}
const ring = (g: Game, kind: Kind, team: number, cx: number, cz: number, r: number, n: number) => { for (let i = 0; i < n; i++) { const a = i / n * 6.283; put(g, kind, team, cx + Math.cos(a) * r, cz + Math.sin(a) * r, cx, cz); } };
const crack = (): [number, number] => roadPt(ROAD.len * .52, 34);
/** The island south of the Needle's Eye road on the large map (map 20). */
const ISLE: [number, number] = [91, -103];
const toPlate = (x: number, y: number, z: number): P3 => [x + 50, y + 30, z - 100];
const bld = (g: Game, k: BKind, team: number, x: number, z: number) => g.addBuilding(k, team, x, z, true);
const gone = (g: Game, u: Unit) => { u.alive = false; g.scene.remove(u.obj); };
/** Empties the stage for a memory: no bodies, no buildings, none of the yard's own clutter (lamps, drums, fences, pipes, road markers). */
const clear = (g: Game) => {
  for (const u of g.units) if (u.alive && u !== g.me) gone(g, u);
  for (const b of g.buildings) if (b.team % 3 !== 2) b.obj.visible = false;
  for (const q of g.props) if (q.alive && (q.kind === 'metal' || q.kind === 'barrel')) { q.alive = false; for (const r of q.ranges) { const a = r.attr.array as Float32Array; for (let k = r.start * 3, e = (r.start + r.count) * 3; k < e; k += 3) a[k + 1] = -80; r.attr.needsUpdate = true; } }
  for (const o of g.ores) o.obj.visible = false;
};
/** The yard's own bodies wander where they like. Any that stand on top of the camera, or between it and what it is looking at, leave the shot. */
function shoo(g: Game, cam: P3, look: P3) {
  const dx = look[0] - cam[0], dz = look[2] - cam[2], len = Math.hypot(dx, dz) || 1;
  for (const u of g.units) { if (!u.alive || placed.has(u) || u === g.me) continue;
    const px = u.pos.x - cam[0], pz = u.pos.z - cam[2], t = (px * dx + pz * dz) / len, off = Math.abs(px * dz - pz * dx) / len;
    if (Math.hypot(px, pz) < 7 || (t > 0 && t < Math.min(len, 30) && off < 2.4)) gone(g, u); }
}
/** Gary: a Veyl Cantor Pim named on the first day. He turns up in every act. */
const gary = (g: Game, x: number, z: number, fx: number, fz: number) => who(g, 'Gary', 'cantor', 1, x, z, fx, fz);
const black = (): ReturnType<Panel['shot']> => ({ cam: [0, 30, 0], look: [0, 0, 1], fov: 40 });
const eye = (): [number, number] => roadPt(MAP.arch || 68, 0);

export const CUTS: Record<string, Cut> = {
  // ---- full-depth scenes: each one shows the new bodies and buildings of the job it opens
  ironyard: { id: 'ironyard', title: 'New kit', sides: [0, 1], map: 0, dusk: .5, panels: [
    { shot: () => ({ cam: [-14, 4, 18], look: [-4, 3, 4], to: [-12, 3.6, 16], fov: 46 }), stage: g => { bld(g, 'machineshop', 0, -6, 2); put(g, 'dustbike', 0, -2, 9, -14, 18); put(g, 'dustbike', 0, 0, 10, -14, 18); who(g, 'Aggie', 'rigger', 0, -8, 9, -14, 18); },
      cap: 'Head office has sent the yard a Machine Shop and four crates of parts. The parts run on Flux, the blue gas from the vents.', say: [['Aggie', 'Pump Jack on the vent, Riggers carry the gas, the Shop builds bikes. Same as ore, but it smells worse.']] },
    { shot: () => ({ cam: [10, 2.4, 14], look: [4, 2, 6], fov: 40 }), stage: g => { put(g, 'piledriver', 0, 4, 5, 10, 14); who(g, 'Pim', 'linesman', 0, 7, 9, 10, 14); }, say: [['Pim', 'This one is called a Pile Driver. It bolts itself to the ground and shoots over the hill.'], ['Moss', 'Ten ore says Pim drives it into the canteen.']] },
  ] },
  chord: { id: 'chord', title: 'Two voices, one body', sides: [2, 1], map: 3, dusk: .25, panels: [
    { shot: g => { const [x, z] = crack(); return { cam: [x + 9, 3, z + 9], look: [x + 1, 2.4, z + 1], to: [x + 8, 2.6, z + 8], fov: 44 }; }, stage: g => { const [x, z] = crack(); put(g, 'choirmaster', 1, x, z + 1.4, x + 9, z + 9); put(g, 'choirmaster', 1, x + 1.6, z - .4, x + 9, z + 9); who(g, 'Held Fifth', 'warden', 1, x - 5, z - 3, x + 9, z + 9); },
      cap: 'Two Choirmasters stand at the crack and sing the same note.', say: [['Held Fifth', 'THEY WILL NOT BE TWO AGAIN AFTER THIS. THEY BOTH ASKED TO DO IT.']] },
    { shot: g => { const [x, z] = crack(); return { cam: [x + 7, 2.8, z + 7], look: [x + 1, 2.6, z + .6], fov: 42 }; }, sfx: 'built', stage: g => { const [x, z] = crack(); for (const u of [...placed]) if (u.kind === 'choirmaster') gone(g, u); put(g, 'chord', 1, x + .8, z + .5, x + 7, z + 7); gary(g, x + 5, z - 2, x + 7, z + 7); },
      cap: 'Ten seconds later one body stands where the two stood. The Chorus calls it a Chord.', say: [['Held Fifth', 'GARY WANTS TO KNOW IF IT HURTS. IT DOES NOT. IT IS VERY LOUD INSIDE.']] },
  ] },
  skychoir: { id: 'skychoir', title: 'The Skyloft', sides: [0, 1], map: 20, dusk: .5, panels: [
    { shot: () => ({ cam: [ISLE[0] + 26, 14, ISLE[1] + 22], look: [ISLE[0], 3, ISLE[1]], to: [ISLE[0] + 22, 12, ISLE[1] + 18], fov: 46 }), stage: g => { bld(g, 'pumpjack', 0, ISLE[0], ISLE[1]); bld(g, 'watchpost', 0, ISLE[0] + 6, ISLE[1] + 4); put(g, 'gadfly', 0, ISLE[0] - 3, ISLE[1] + 3, ISLE[0] + 26, ISLE[1] + 22); put(g, 'gadfly', 0, ISLE[0] + 3, ISLE[1] - 2, ISLE[0] + 26, ISLE[1] + 22); },
      cap: 'The Charter has put a Pump Jack and a Watchpost on the island south of the road. Nothing on the ground can walk there.', say: [['Quartermaster', '(Charter channel) No road to it means no Veyl claim to it. I checked.']] },
    { shot: () => ({ cam: [VHOME.x - 18, 5, VHOME.z + 16], look: [VHOME.x - 6, 4, VHOME.z + 4], fov: 46 }), stage: g => { bld(g, 'skyloft', 1, VHOME.x - 6, VHOME.z + 4); put(g, 'swift', 1, VHOME.x - 10, VHOME.z + 8, VHOME.x - 18, VHOME.z + 16); put(g, 'ferry', 1, VHOME.x - 3, VHOME.z + 10, VHOME.x - 18, VHOME.z + 16); put(g, 'omen', 1, VHOME.x - 8, VHOME.z + 12, VHOME.x - 18, VHOME.z + 16); who(g, 'Held Fifth', 'warden', 1, VHOME.x - 12, VHOME.z + 4, VHOME.x - 18, VHOME.z + 16); },
      cap: 'Held Fifth wakes the Skyloft. The Chorus has not used it in two hundred years.', say: [['Held Fifth', 'WE STOPPED FLYING WHEN THE GLASS WAS THICK ENOUGH. IT IS NOT THICK ENOUGH NOW.']] },
  ] },
  elder: { id: 'elder', title: 'An older Cap', sides: [1, 2], map: 3, dusk: .4, panels: [
    { shot: () => ({ cam: [VHOME.x - 16, 6, VHOME.z + 18], look: [VHOME.x, 5, VHOME.z], to: [VHOME.x - 14, 5, VHOME.z + 16], fov: 48 }), stage: g => { put(g, 'keeper', 2, VHOME.x - 6, VHOME.z + 8, VHOME.x - 16, VHOME.z + 18); put(g, 'grazer', 2, VHOME.x - 3, VHOME.z + 9, VHOME.x - 16, VHOME.z + 18); },
      cap: 'Moss has learned how the Gloam grows. A Mother Cap that eats enough ore grows into an Elder Cap, and an Elder Cap grows things a Mother Cap cannot.', say: [['Moss', 'I named it the Elder Cap. Nobody else was going to.']] },
    { shot: () => ({ cam: [VHOME.x - 9, 2.2, VHOME.z + 12], look: [VHOME.x - 4, 1.6, VHOME.z + 6], fov: 42 }), stage: g => { bld(g, 'rotden', 2, VHOME.x + 4, VHOME.z + 10); put(g, 'smother', 2, VHOME.x - 4, VHOME.z + 6, VHOME.x - 9, VHOME.z + 12); put(g, 'seeder', 2, VHOME.x - 1, VHOME.z + 7, VHOME.x - 9, VHOME.z + 12); },
      say: [['The Gloam', 'THE SMOTHER BREATHES ON AN ENEMY AND THE ENEMY FIGHTS FOR US. KEEP AWAY FROM HEAVY MACHINERY.'], ['Moss', 'Twelve seconds of it. Then they go back to hating you.']] },
  ] },
  threevoices: { id: 'threevoices', title: 'Three voices', sides: [0, 1], map: 0, dusk: .7, panels: [
    { shot: () => ({ cam: [12, 3.6, 18], look: [2, 2.6, 6], to: [10, 3.2, 16], fov: 46 }), stage: g => { who(g, 'Aggie', 'rigger', 0, 0, 6, 12, 18); who(g, 'Held Fifth', 'warden', 1, 5, 3, 12, 18); who(g, 'Moss', 'mulcher', 2, -4, 2, 12, 18); },
      cap: 'For the first time the yard, the Chorus and the Gloam stand in one place and nobody shoots.', say: [['Aggie', 'One rule. Nobody shoots anybody on this side of the fence.'], ['Held Fifth', 'AGREED.'], ['The Gloam', 'AGREED. WEAR YOUR HELMET.']] },
    { shot: () => ({ cam: [26, 8, 30], look: [4, 4, 4], fov: 50 }), stage: g => { put(g, 'reedwalker', 1, 10, -2, 26, 30); put(g, 'gantry', 0, -2, 12, 26, 30); put(g, 'hooksail', 2, -8, 8, 26, 30); },
      cap: 'Each side has brought the biggest thing it owns: a Gantry from the yard, a Reedwalker from the Chorus, a Hooksail from the Gloam.', say: [['Moss', 'I\'ve put my money on the Charter, so we\'re sure to win.']] },
  ] },
  arrival: { id: 'arrival', title: 'Arrival', sides: [0, 1], map: 0, dusk: .05, panels: [
    { shot: () => ({ cam: [60, 46, 70], look: [0, 4, 0], to: [44, 30, 52], fov: 50 }), cap: 'Tithe. Claim 4471-T. The Charter shuttle drops you off and leaves before your boots touch the ground.' },
    { shot: () => ({ cam: [9, 3, 12], look: [0, 6, 0], to: [8, 2.6, 10], fov: 46 }), bal: -11000, stamp: 'NOTED', sfx: 'card',
      say: [['Quartermaster', 'Welcome to Tithe, Nineteen. Your trip down cost eleven thousand ore. The trip back up is not for sale.'], ['Quartermaster', 'Seat: four thousand. Air: six thousand nine hundred and ninety. Printing this bill: ten.']] },
    { shot: () => ({ cam: [10, 2.2, 15], look: [6, 1.6, 9], fov: 40 }), stage: g => { who(g, 'Aggie', 'rigger', 0, 6, 9, 10, 15); }, say: [['Aggie', 'Aggie Pell. I run this yard. That\'s your drill. Hold the trigger, fill the pack, walk it home.'], ['Aggie', 'You don\'t talk much, do you?']], cap: 'You don\'t say anything.' },
    { shot: () => ({ cam: [22, 2.4, 18], look: [17, 1.7, 13], fov: 40 }), stage: g => { who(g, 'Moss', 'linesman', 0, 17.6, 13.6, 22, 18); who(g, 'Pim', 'linesman', 0, 15.2, 14.6, 22, 18); }, say: [['Moss', 'Desmond Moss. I run the book. Four to one you\'re gone inside a week.'], ['Pim', 'Take it as a compliment. He only bets against people he likes, and he has never won a bet.'], ['Moss', 'Which means I\'m due.']] },
    { shot: () => ({ cam: [12, 3.2, 10.5], look: [30, 2, 14], to: [13, 3, 10.8], fov: 34 }), stage: g => { gary(g, 30, 14, 12, 10.5); who(g, 'Pim', 'linesman', 0, 19, 10.6, 12, 10.5); who(g, 'Moss', 'linesman', 0, 21, 12.4, 30, 14); }, say: [['Pim', 'I\'m Pim. I watch the road and I name everything on it. You\'re Nineteen. That one\'s Gary.'], ['Pim', 'Things with names get shot less. I checked.']], cap: 'Gary is a Veyl Cantor. He has been standing on the road all morning, looking at the yard.' },
  ] },
  rings: { id: 'rings', title: 'Ring inside ring', sides: [0, 1], map: 0, dusk: .8, panels: [
    { shot: () => ({ cam: [-30, 5, 14], look: [-22, 2, 4], to: [-28, 4, 12], fov: 44 }), stage: g => { bld(g, 'assay', 0, -22, 4); who(g, 'Aggie', 'rigger', 0, -26, 9, -22.5, 12.5); who(g, 'Moss', 'linesman', 0, -28.4, 10.6, -22.5, 12.5); }, cap: 'The Assay Office, after midnight. Aggie has cut the core sample in half.' },
    { shot: () => ({ cam: [-22.5, 2.2, 12.5], look: [-27, 1.5, 9.8], fov: 44 }), cap: 'The ore in the core is laid down in rings, one inside the next, like the rings in a tree trunk.', say: [['Aggie', 'Ore doesn\'t grow in rings.'], ['Moss', 'Ten says it\'s a tree.'], ['Aggie', 'It\'s not a tree, Moss.'], ['Moss', 'Twenty says it\'s a tree.']] },
    { shot: () => ({ cam: [-12, 9, 22], look: [-22, 3, 4], fov: 50 }), bal: -11240, stamp: 'NOTED', sfx: 'card', say: [['Quartermaster', 'Core sample logged as geological settling. One saw blade, worn out, added to Nineteen\'s balance.']] },
  ] },
  queue: { id: 'queue', title: 'The message queue', sides: [0, 1], map: 2, dusk: .85, panels: [
    { shot: () => ({ cam: [14, 4, 20], look: [0, 8, 0], to: [12, 3, 18], fov: 48 }), stage: g => { bld(g, 'mast', 0, -6, -10); who(g, 'Aggie', 'rigger', 0, 4, 8, 6, 13); }, cap: 'The Signal Mast reaches head office. A message takes forty minutes to get there, and the reply takes forty minutes to come back.' },
    { shot: () => ({ cam: [6, 2.2, 13], look: [4, 1.7, 8], fov: 36 }), say: [['Aggie', 'Yard to head office. Three Headframes held all night. We need rifles, a medic and one day off.']] },
    { shot: black, black: true, cap: 'Eighty minutes later.', sfx: 'blip' },
    { shot: () => ({ cam: [6, 2.2, 13], look: [4, 1.7, 8], fov: 36 }), say: [['Abbot-Lyle', 'Thank you for your request for a day off. I will review it on my day off.'], ['Abbot-Lyle', 'Separately: quota remains outstanding. Please clear the Switchback outpost by the end of the week. Kind regards.']] },
    { shot: () => ({ cam: [9, 2.4, 14], look: [5, 1.7, 8.6], fov: 40 }), stage: g => { who(g, 'Pim', 'linesman', 0, 6.4, 9.2, 9, 14); }, say: [['Pim', 'So if we all die tonight, the sympathy card gets here on Thursday.'], ['Aggie', 'Second class. It\'ll be Friday.']] },
  ] },
  seal: { id: 'seal', title: 'The seal breaks', sides: [0, 2], map: 3, dusk: .7, panels: [
    { shot: g => { const [x, z] = crack(); return { cam: [x + 22, 7, z + 26], look: [x, 4, z], fov: 46 }; }, sim: true, shake: .4, sfx: 'boom', stage: g => { const [x, z] = crack(); const b = bld(g, 'choir', 1, x, z); g.damage(b, b.hp + 10, null); }, cap: 'The last Choir Stone falls.' },
    { shot: g => { const [x, z] = crack(); return { cam: [x + 3, 7, z + 4], look: [x, 0, z], to: [x + 2, 5, z + 3], fov: 58 }; }, sat: .7, cap: 'Under the canyon floor the glass is in layers, hundreds of them, and every layer is cracked through. Pale fungus is pushing up through the cracks.' },
    { shot: g => { const [x, z] = crack(); return { cam: [x + 14, 3, z + 16], look: [x, 1.5, z], to: [x + 11, 2.4, z + 13], fov: 50 }; }, shake: .3, stage: g => { const [x, z] = crack(); for (let i = 0; i < 9; i++) put(g, 'snapper', 2, x + (i % 3) * 3 - 3, z + Math.floor(i / 3) * 3 - 3, x + 14, z + 16); who(g, 'Moss', 'linesman', 0, x + 8, z + 9, x, z); },
      say: [['Pim', 'What is that? Nineteen, what is that?'], ['Moss', 'Go! I\'ll hold the road. Fifty says you make it out.'], ['Pim', 'Don\'t bet ON them, Moss! You always lose!']] },
    { shot: g => { const [x, z] = crack(); return { cam: [x + 11.5, 1.3, z + 12.5], look: [x + 3, 1.5, z + 4], to: [x + 10.5, 1.2, z + 11.5], fov: 54 }; }, sim: true, shake: .5, sfx: 'alarm', cap: 'Moss stays on the road, by himself.' },
    { shot: black, black: true, cap: 'Moss loses the bet. The canyon floor gives way, and you go down with it.' },
    { shot: black, black: true, bal: -12650, stamp: 'NOTED', sfx: 'card', cap: 'QUARTERMASTER: Moss and Nineteen are missing. The cost of their drills has been added to their balances.' },
  ] },
  wrongbody: { id: 'wrongbody', title: 'Wrong body', sides: [2, 1], map: 13, dusk: .35, panels: [
    { shot: () => ({ cam: [VHOME.x - 10, 2.2, VHOME.z + 12], look: [VHOME.x, 4, VHOME.z], to: [VHOME.x - 8, 2, VHOME.z + 10], fov: 44 }), stage: g => { for (const i of [0, 1, 2]) put(g, 'tender', 1, VHOME.x - 5 + i * 2.2, VHOME.z + 7, VHOME.x - 10, VHOME.z + 12); }, cap: 'You wake up. Your hands are glass. You are inside a Veyl Tender.' },
    { shot: () => ({ cam: [VHOME.x - 13, 3.4, VHOME.z + 17], look: [VHOME.x - 3, 4, VHOME.z + 4], fov: 42 }), stage: g => { who(g, 'Held Fifth', 'warden', 1, VHOME.x - 3, VHOME.z + 4, VHOME.x - 13, VHOME.z + 17); },
      say: [['Held Fifth', 'I AM HELD FIFTH. FOUR HELD THIS NOTE BEFORE ME. YOUR LINK CAME LOOSE WHEN THE CANYON FELL. WE CAUGHT IT AND PUT IT IN THIS BODY.'], ['Phrasebook 3', '[FREE VERSION] HELLO. BODY. HELP. [WORDS LEFT THIS MONTH: 9]']] },
    { shot: () => ({ cam: [VHOME.x + 4, 2.2, VHOME.z + 15], look: [VHOME.x + 8, 2.3, VHOME.z + 10], fov: 36 }), stage: g => { gary(g, VHOME.x + 8, VHOME.z + 10, VHOME.x + 4, VHOME.z + 15); }, cap: 'The Cantor next to you has a Linesman bullet hole in his shoulder. It is Gary.', say: [['Held Fifth', 'YOU HAVE MET. YOU SHOT HIM IN THE SHOULDER.'], ['Phrasebook 3', '[FREE VERSION] HE WANTS SORRY. [WORDS LEFT THIS MONTH: 6]']] },
  ] },
  howsealed: { id: 'howsealed', title: 'How the seal was made', sides: [2, 1], map: 4, dusk: .2, panels: [
    { shot: () => ({ cam: [40, 14, 40], look: [0, 1, 0], to: [32, 10, 34], fov: 50 }), sat: .35, stage: g => { clear(g); for (let i = 0; i < 14; i++) put(g, i % 4 ? 'snapper' : 'mulcher', 2, (i % 5) * 5 - 10, Math.floor(i / 5) * 5 - 6, 40, 40); }, cap: 'Nine hundred years ago, the Gloam covered the surface of Tithe.' },
    { shot: () => ({ cam: [30, 9, 24], look: [8, 5, 4], fov: 46 }), sat: .35, stage: g => { ring(g, 'warden', 1, 8, 4, 9, 5); ring(g, 'tender', 1, 8, 4, 14, 9); }, cap: 'The Veyl came down from the sky and stood in rings around it.' },
    { shot: () => ({ cam: [-24, 18, 30], look: [-40, 10, -4], fov: 50 }), sat: .45, cap: 'They sang until the ground on top of the Gloam turned to glass. They have sung every night since, to keep the glass thick.', say: [['Held Fifth', 'THE ORE YOU DIG IS THAT GLASS.']] },
    { shot: () => ({ cam: [-30, 4, 26], look: [-40, 6, -4], fov: 42 }), say: [['Held Fifth', 'YOUR COMPANY SELLS IT BY THE TONNE.'], ['Phrasebook 3', '[FREE VERSION] RUDE. [WORDS LEFT THIS MONTH: 0]']] },
  ] },
  warning: { id: 'warning', title: 'The full warning', sides: [0, 1], map: 10, dusk: .55, panels: [
    { shot: () => ({ cam: [14, 3, 22], look: [3, 2, 9], to: [12, 2.6, 19], fov: 44 }), stage: g => { who(g, 'Nineteen', 'lancer', 1, 4, 10, 0, 0); who(g, 'Aggie', 'rigger', 0, 1, 5, 4, 10); who(g, 'Pim', 'linesman', 0, -2, 6, 4, 10); }, say: [['Pim', 'I bought the paid phrasebook. Forty ore a month. Here is what the Veyl told the first crew, thirty-one years ago. All of it.']] },
    { shot: black, black: true, sfx: 'card', cap: 'PHRASEBOOK 3 [PAID VERSION]: ...LEAVE THE GLASS IN THE GROUND, OR ELSE THE GLOAM GETS OUT. TAKE ONLY WHAT GROWS BACK.' },
    { shot: () => ({ cam: [5, 2, 9.5], look: [1, 1.4, 5], fov: 36 }), cap: 'Thirty-one years ago the first crew had the free version. It translated two words: OR ELSE. The crew took it for the name of the place and spelled it wrong on the yard sign.', say: [['Aggie', 'I was holding the phrasebook that day. I was the new hire. I read them two words, and we laughed.']] },
    { shot: () => ({ cam: [-0.5, 2.1, 9], look: [-2, 1.6, 6], fov: 36 }), say: [['Pim', 'It\'s on the mugs, Aggie. It\'s on all the mugs.']] },
  ] },
  clause9queue: { id: 'clause9queue', title: 'Clause 9 is on its way', sides: [0, 1], map: 10, dusk: .65, panels: [
    { shot: () => ({ cam: [10, 12, 18], look: [0, 6, 0], fov: 46 }), stamp: 'IMPAIRED', sfx: 'card', say: [['Quartermaster', 'Head office has read about the canyon. The claim is now impaired. Clause 9 is in the queue. Have a lovely evening.']] },
    { shot: () => ({ cam: [5, 2, 9.5], look: [1, 1.4, 5], fov: 36 }), stage: g => { who(g, 'Aggie', 'rigger', 0, 1, 5, 5, 9.5); }, say: [['Aggie', 'What\'s Clause 9?'], ['Quartermaster', 'It is the one after Clause 8.']] },
  ] },
  lastverse: { id: 'lastverse', title: 'The last verse', sides: [2, 1], map: 23, dusk: .3, panels: [
    { shot: g => { const [x, z] = crack(); return { cam: [x + 30, 12, z + 30], look: [x, 3, z], to: [x + 24, 9, z + 24], fov: 48 }; }, stage: g => { const [x, z] = crack(); for (const k of [-30, 0, 30]) { const c = roadPt(ROAD.len * .52 + k, 34 + (k ? -14 : 16)); bld(g, 'choir', 1, c[0], c[1]); } ring(g, 'warden', 1, x, z, 12, 3); }, cap: 'Three Choir Stones round the crack. The crack was closing. Then you walked out from between them.' },
    { shot: g => { const [x, z] = crack(); return { cam: [x + 8, 3, z + 8], look: [x, 3.5, z], fov: 40 }; }, stage: g => { const [x, z] = crack(); who(g, 'Held Fifth', 'warden', 1, x + 1.5, z + 1.5, x + 8, z + 8); }, say: [['Held Fifth', 'I HAVE HELD THIS NOTE FOR TWO HUNDRED YEARS. FOUR HELD IT BEFORE ME, EACH UNTIL THEY DIED. I WANTED TO PUT IT DOWN.'], ['Phrasebook 3', '[PAID VERSION] TONE: VERY TIRED. [THE PAID VERSION INCLUDES TONE.]']] },
    { shot: g => { const [x, z] = crack(); return { cam: [x + 2.2, .9, z + 2.2], look: [x, .7, z], fov: 70 }; }, shake: .5, sfx: 'slash', stage: g => { const [x, z] = crack(); who(g, 'Held Fifth', 'warden', 1, x - 7, z - 6, x + 3, z + 3); put(g, 'snapper', 2, x + .6, z + .6, x + 3, z + 3); }, cap: 'With one voice gone, the glass stops closing. The Gloam comes up through the gap and takes the Stone nearest you. Your body goes down with the Stone.' },
  ] },
  longshift: { id: 'longshift', title: 'Long shift?', sides: [1, 2], map: 13, dusk: .35, panels: [
    { shot: () => ({ cam: [VHOME.x - 7, .8, VHOME.z + 7], look: [VHOME.x, .9, VHOME.z], to: [VHOME.x - 6, .7, VHOME.z + 6], fov: 60 }), stage: g => { for (let i = 0; i < 5; i++) put(g, 'grazer', 2, VHOME.x - 3 + i * 1.4, VHOME.z + 3 + (i % 2), VHOME.x - 7, VHOME.z + 7); }, cap: 'You wake up close to the ground, with too many legs. You are a Gloam Grazer.' },
    { shot: () => ({ cam: [VHOME.x - 12, 6, VHOME.z + 14], look: [VHOME.x, 2, VHOME.z], fov: 50 }), cap: 'Moss\'s voice comes out of every Gloam body at once.', say: [['Moss', 'Hello, Nineteen. Long shift?'], ['The Gloam', 'A CLEAN YARD IS A SAFE YARD.']] },
    { shot: () => ({ cam: [VHOME.x - 8, 1.6, VHOME.z + 9], look: [VHOME.x - 2, 1, VHOME.z + 3], fov: 44 }), cap: 'The Gloam learned to talk from Moss. Moss spent thirty years walking past the safety posters in the yard.', say: [['The Gloam', 'WEAR YOUR HELMET. REPORT ALL SPILLS. HELLO. WE HAVE BEEN UNDER THE GLASS FOR NINE HUNDRED YEARS.'], ['Moss', 'They\'re keen. Even money says you get used to it.']] },
  ] },
  beforeglass: { id: 'beforeglass', title: 'Before the glass', sides: [1, 2], map: 24, dusk: .1, panels: [
    { shot: () => ({ cam: [-14, 6, 24], look: [-40, 9, -4], to: [-18, 5, 20], fov: 50 }), cap: 'At the First Stone, the Gloam shows you what it remembers.' },
    { shot: () => ({ cam: [30, 10, 30], look: [0, 3, 0], fov: 52 }), sat: .3, stage: g => { clear(g); for (let i = 0; i < 16; i++) put(g, i % 5 ? 'snapper' : 'quillback', 2, (i % 4) * 5 - 8, Math.floor(i / 4) * 5 - 8, 30, 30); }, cap: 'Open sky. Spores going up. This was the Gloam\'s season.' },
    { shot: () => ({ cam: [18, 26, 26], look: [0, 0, 0], fov: 54 }), sat: .3, stage: g => { ring(g, 'warden', 1, 0, 0, 16, 6); }, say: [['The Gloam', 'THEN THE SINGERS CAME DOWN. THEY SANG THE GROUND SHUT ON TOP OF US.']] },
    { shot: () => ({ cam: [-14, 6, 24], look: [-40, 9, -4], fov: 44 }), say: [['Moss', 'So the Gloam was here first. Then the Veyl. Then us.'], ['Moss', 'The Charter got here last, and it\'s the one sending the bill.']] },
  ] },
  clause9: { id: 'clause9', title: 'Clause 9', sides: [0, 2], map: 25, dusk: .85, charter: 'home', panels: [
    { shot: black, black: true, sfx: 'card', cap: 'CLAUSE 9. If a claim is impaired, the Charter may recover its value by any means. Signed, Fenwick Abbot-Lyle, Asset Recovery.' },
    { shot: () => { const [x, z] = roadPt(ROAD.len * .3, -30); return { cam: [x + 36, 8, z + 30], look: [x, 16, z], to: [x + 30, 6, z + 26], fov: 46 }; }, cap: 'The drill tower on the Glass Flats goes down through the glass to a Deep Charge: a bomb big enough to crack the whole basin open, so the company can mine it from orbit.' },
    { shot: () => { const [x, z] = roadPt(ROAD.len * .3, -30); return { cam: [x, 3, z + 10], look: toPlate(x, 3, z + 10), fov: 50 }; }, cap: 'The order to set it off is already in the message queue. It arrives in 39 minutes.', say: [['Quartermaster', 'Nobody on the surface is in the plan. I have sent everyone a calendar invite.']], stamp: 'SCHEDULED', sfx: 'alarm' },
  ] },
  receiver: { id: 'receiver', title: 'The receiver', sides: [0, 1], map: 0, dusk: .7, panels: [
    { shot: () => ({ cam: [-20, 5, -26], look: [-24, 8, -14], to: [-19, 4.4, -25], fov: 48 }), stage: g => { bld(g, 'mast', 0, -24, -14); who(g, 'Pim', 'linesman', 0, -21, -20, -20, -26); }, cap: 'Pim has wired a receiver into the Signal Mast. It pulls your mind out of the Gloam and into a Rigger.' },
    { shot: () => ({ cam: [8, 2.2, 12], look: [5, 1.6, 8], fov: 38 }), stage: g => { who(g, 'Aggie', 'rigger', 0, 5, 8, 8, 12); }, say: [['Aggie', 'New drill. Same debt. Welcome back.']] },
    { shot: () => ({ cam: [9, 3, 12], look: [0, 6, 0], fov: 46 }), bal: -14882, stamp: 'NOTED', sfx: 'card', say: [['Quartermaster', 'Welcome back, Nineteen. Your balance has gathered interest while you were a fungus.']] },
    { shot: () => ({ cam: [8, 2.2, 12], look: [5.6, 1.6, 8.4], fov: 40 }), stage: g => { who(g, 'Pim', 'linesman', 0, 7, 8.4, 8, 12); }, say: [['Pim', 'Moss didn\'t come with you. He says he\'s fine where he is, and can he have his mug back.']] },
  ] },
  mossstays: { id: 'mossstays', title: 'Moss stays', sides: [0, 2], map: 25, dusk: .85, charter: 'home', panels: [
    { shot: () => ({ cam: [OUTPOST.x - 12, 5, OUTPOST.z + 24], look: [OUTPOST.x - 3, 1.5, OUTPOST.z + 8], fov: 48 }), stage: g => { for (let i = 0; i < 12; i++) put(g, i % 3 ? 'snapper' : 'grazer', 2, OUTPOST.x - 8 + (i % 4) * 3, OUTPOST.z + 4 + Math.floor(i / 4) * 3, OUTPOST.x - 12, OUTPOST.z + 24); }, say: [['Moss', 'I\'m staying, Nineteen. The odds are good down here.'], ['Moss', 'I bet against you twenty-three times and lost every one. That was the idea. Here\'s what I owe.']] },
    { shot: () => ({ cam: [OUTPOST.x - 11, 1.4, OUTPOST.z + 11], look: [OUTPOST.x - 6, .6, OUTPOST.z + 6], fov: 44 }), sfx: 'bank', cap: 'The Grazers cough up three hundred and twelve ore at your feet, in chewed lumps.', say: [['Moss', 'Count it. I know it\'s damp.']] },
  ] },
  reserve: { id: 'reserve', title: 'Reserve price', sides: [0, 1], map: 0, dusk: .65, panels: [
    { shot: black, black: true, sfx: 'blip', cap: 'Forty minutes later, head office replies. The Deep Charge did not go off. Claim 4471-T is written off and put up for auction. Reserve price: one ore.' },
    { shot: () => ({ cam: [6, 2.2, 11], look: [3, 1.4, 7], fov: 36 }), stage: g => { who(g, 'Aggie', 'rigger', 0, 3, 7, 6, 11); who(g, 'Pim', 'linesman', 0, 5.2, 6.2, 6, 11); }, cap: 'Aggie tips your pack out on the desk. One chip of glass falls out. It is the first ore you ever banked.', say: [['Aggie', 'One ore. We bid it.']] },
    { shot: () => ({ cam: [40, 24, 50], look: [0, 4, 0], fov: 50 }), stamp: 'SOLD', sfx: 'built', cap: 'There are no other bidders. Their messages were still in the queue. The crew owns Tithe.' },
  ] },
  grows: { id: 'grows', title: 'Take only what grows back', sides: [0, 1], map: 0, dusk: .55, panels: [
    { shot: () => { const m = eye(); return { cam: [m[0] - 16, 3, m[1] + 14], look: [m[0], 3, m[1]], to: [m[0] - 13, 2.6, m[1] + 11], fov: 46 }; }, stage: g => { const m = eye(); who(g, 'Aggie', 'rigger', 0, m[0] - 4, m[1] + 2, m[0], m[1]); who(g, 'Pim', 'linesman', 0, m[0] - 5, m[1] - 1, m[0], m[1]); who(g, 'Held Fifth', 'warden', 1, m[0] + 4, m[1] + 1, m[0], m[1]); put(g, 'tender', 1, m[0] + 3, m[1] - 2, m[0], m[1]); gary(g, m[0] + 5.5, m[1] - 3, m[0], m[1]); who(g, 'Moss', 'snapper', 0, m[0] - 1, m[1] + 3, m[0] - 3, m[1] - 1.5); put(g, 'grazer', 0, m[0] + .6, m[1] + 3.8, m[0] - 3, m[1] - 1.5); }, cap: 'The three sides meet under the Needle\'s Eye. You are the only one there who has been all three. Gary came too.' },
    { shot: () => { const m = eye(); return { cam: [m[0] - 5, 1.8, m[1] + 4], look: [m[0] + 3, 2.4, m[1]], fov: 38 }; }, cap: 'You speak for the first time.', say: [['Nineteen', 'Take only what grows back.']] },
    { shot: () => { const m = eye(); return { cam: [m[0] - 3.4, 1.3, m[1] - 1.2], look: [m[0] - .6, .8, m[1] + 3.2], fov: 44 }; }, sfx: 'kill', say: [['Pim', 'It talks!'], ['Moss', 'Pay up, all of you. I had twenty on Nineteen talking before the end.'], ['Moss', 'First bet I ever put on you instead of against you. First one I\'ve won in thirty years.']] },
    { shot: black, black: true, cap: 'The yard digs only what grows back. The Chorus sings one night in three. The Gloam gets the Glass Flats every spore season. Held Fifth sleeps for the first time in two hundred years. Moss runs the book from underground.' },
  ] },
  invoice: { id: 'invoice', title: 'Invoice', sides: [0, 1], map: 0, dusk: .9, panels: [
    { shot: () => ({ cam: [0, 4, 30], look: toPlate(0, 4, 30), fov: 50 }), sfx: 'blip', cap: 'One more message drops out of the queue, forty minutes late.', say: [['Abbot-Lyle', 'Congratulations to the new owners of Claim 4471-T. Please find attached our invoice for the message service. Kind regards.']] },
    { shot: () => ({ cam: [9, 3, 12], look: [0, 6, 0], fov: 46 }), bal: -11040, say: [['Quartermaster', 'Nineteen. Your balance is minus eleven thousand and forty ore. Noted.'], ['Aggie', 'We own the claim now. That makes us your head office. Clear it.']] },
    { shot: () => ({ cam: [9, 3, 12], look: [0, 6, 0], fov: 40 }), bal: 0, stamp: 'PAID', sfx: 'win', say: [['Quartermaster', '...Balance cleared. Noted.'], ['Quartermaster', 'Nobody has asked me to do that before. Also noted.']] },
  ] },
};
void veylPt;

/** Plays one scene on a Game that was built for it. The game's own frame loop draws; this moves the camera and the words. */
export class CutPlayer {
  private cut: Cut | null = null; private i = 0; private t = 0; private dur = 1; private from = new THREE.Vector3(); private to = new THREE.Vector3(); private done: (() => void) | null = null; private g: Game | null = null;
  private tags = new Map<string, HTMLElement>(); private v = new THREE.Vector3();
  /** Panels turn by themselves once read. Tests and screenshots switch this off. */ auto = true;
  constructor(private el: HTMLElement) {}
  get on() { return !!this.cut; }
  start(cut: Cut, g: Game, done: () => void) { this.cut = cut; this.g = g; this.i = -1; this.done = done; placed = new Set(); cast = {}; this.wipeTags(); g.phase = 'cut'; this.el.hidden = false; this.el.querySelector('.ctitle')!.textContent = cut.title; this.next(); }
  next() {
    const c = this.cut, g = this.g; if (!c || !g) return; this.i++;
    if (this.i >= c.panels.length) { this.finish(); return; }
    const p = c.panels[this.i]; p.stage?.(g); const s = p.shot(g); if (!p.black) shoo(g, s.cam, s.look);
    // Balloons fill the bottom of the frame. On a close shot the camera tips down a little, so the speakers stand above their words.
    const n = (p.say || []).length, far = Math.hypot(s.look[0] - s.cam[0], s.look[1] - s.cam[1], s.look[2] - s.cam[2]);
    if (n && !p.black && far < 16) s.look = [s.look[0], s.look[1] - far * Math.tan((s.fov || 46) * (.07 + .05 * Math.min(n, 3)) * Math.PI / 180), s.look[2]];
    this.from.set(...s.cam); this.to.set(...(s.to || s.cam)); g.shot = { pos: this.from.clone(), look: new THREE.Vector3(...s.look), fov: s.fov || 46 }; g.cutSim = !!p.sim; g.cutSat = p.sat ?? 1; if (p.shake) g.shake = Math.max(g.shake, p.shake);
    const words = (p.cap || '').length + (p.say || []).reduce((n, l) => n + l[1].length, 0); this.dur = 3 + words * .055; this.t = 0;
    this.el.classList.toggle('black', !!p.black); this.el.querySelector('.cnum')!.textContent = `${this.i + 1} / ${c.panels.length}`;
    const cap = this.el.querySelector('.ccap') as HTMLElement; cap.hidden = !p.cap; cap.textContent = p.cap || '';
    const bubs = this.el.querySelector('.cbubs') as HTMLElement; bubs.innerHTML = (p.say || []).map(([w, t], k) => `<div class="cbub ${k % 2 ? 'r' : ''} ${/^[A-Z0-9 .,!?'[\]:()-]+$/.test(t) ? 'loud' : ''}"><h5>${w}</h5>${t.replace(/</g, '&lt;')}</div>`).join('');
    const st = this.el.querySelector('.cstamp') as HTMLElement; st.hidden = !p.stamp; st.textContent = p.stamp || ''; st.classList.remove('slam');
    const bal = this.el.querySelector('.cbal') as HTMLElement; bal.hidden = p.bal === undefined; if (p.bal !== undefined) bal.innerHTML = `<small>Nineteen · balance</small>${p.bal < 0 ? '−' : ''}${Math.abs(p.bal).toLocaleString('en')} ore`;
    if (p.sfx) try { (sfx as any)[p.sfx](); } catch { /* no sound in tests */ }
    this.el.classList.remove('turn'); void this.el.offsetWidth; this.el.classList.add('turn'); if (p.stamp) setTimeout(() => { st.classList.add('slam'); try { sfx.clang(); } catch { /* no sound in tests */ } }, 450);
    this.placeTags();
  }
  skip() { this.finish(); }
  private wipeTags() { for (const t of this.tags.values()) t.remove(); this.tags.clear(); }
  private finish() { const d = this.done; this.cut = null; this.done = null; if (this.g) { this.g.shot = null; this.g.cutSim = false; this.g.cutSat = 1; } this.g = null; this.wipeTags(); placed = new Set(); cast = {}; this.el.hidden = true; d?.(); }
  /** A name over the head of each of the cast the camera can see, so the reader knows which body is Aggie and which is Moss. */
  private placeTags() {
    const g = this.g, c = this.cut, box = this.el.querySelector('.ctags') as HTMLElement | null; if (!g || !c || !box || !g.shot) return;
    const hide = !!c.panels[this.i]?.black;
    for (const name of Object.keys(cast)) {
      const u = cast[name]; let t = this.tags.get(name); if (!t) { t = document.createElement('div'); t.className = 'ctag'; t.textContent = name; box.appendChild(t); this.tags.set(name, t); }
      const v = this.v.set(u.pos.x, u.pos.y + (UNIT[u.kind].headY || 1.6) + .55, u.pos.z), d = v.distanceTo(g.shot.pos); v.project(g.cam);
      const see = !hide && u.alive && v.z < 1 && Math.abs(v.x) < .9 && v.y > -.8 && v.y < .78 && d < 42 && d > 1.5;
      t.hidden = !see; if (see) { t.style.left = `${(v.x * .5 + .5) * 100}%`; t.style.top = `${(-v.y * .5 + .5) * 100}%`; }
    }
  }
  /** Moves the camera along the panel's drift. Panels turn on their own after enough time to read them. */
  frame(dt: number) {
    const g = this.g; if (!this.cut || !g || !g.shot) return; this.t += dt; const k = Math.min(1, this.t / Math.max(this.dur, 4)), e = k * k * (3 - 2 * k);
    g.shot.pos.lerpVectors(this.from, this.to, e); this.placeTags(); if (this.auto && this.t > this.dur + 2.5) this.next();
  }
}
