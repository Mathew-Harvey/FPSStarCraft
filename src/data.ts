// Shared types, stat tables and map constants.
import type * as THREE from 'three';
import type { Rig } from './models';

import { G_UNIT, G_BLD, G_UPGRADES, G_BUILDABLE, G_UNLOCK, type GKind, type GBKind, type GUpKey } from './gloam';
export type Kind = 'rigger' | 'linesman' | 'breacher' | 'gantry' | 'longshot' | 'patch' | 'cantor' | 'lancer' | 'warden' | 'tender' | GKind;
export type BKind = 'headframe' | 'bunkhouse' | 'depot' | 'watchpost' | 'machineshop' | 'foundry' | 'choir' | 'reedgate' | 'broodpit' | 'thornspire' | 'wardpylon' | 'assay' | 'mast' | 'hushwell' | GBKind;

export interface UnitDef { name: string; team: number; hp: number; shield: number; speed: number; eye: number; headY: number; bodyY: number; rad: number; cost: number; time: number; supply: number; quip: string; ack: string[] }
export const UNIT: Record<Kind, UnitDef> = {
  rigger: { name: 'Rigger', team: 0, hp: 45, shield: 0, speed: 4.6, eye: 1.5, headY: 1.52, bodyY: .9, rad: .66, cost: 50, time: 8, supply: 1, quip: '"I dig holes. You point at where."', ack: ['Drill\'s warm, boss.', 'Back in the dirt.', 'Hard hat on. Mostly.'] },
  linesman: { name: 'Linesman', team: 0, hp: 60, shield: 0, speed: 4.8, eye: 1.58, headY: 1.56, bodyY: .9, rad: .66, cost: 60, time: 11, supply: 1, quip: '"Paid by the bullet. Tips welcome."', ack: ['Boss is in my head again.', 'Point me at something purple.', 'Safety\'s off. So is my shift.'] },
  breacher: { name: 'Breacher', team: 0, hp: 150, shield: 0, speed: 4.2, eye: 1.78, headY: 1.78, bodyY: 1.02, rad: .8, cost: 110, time: 15, supply: 2, quip: '"I knock. Then there is no door."', ack: ['Shield up. Manners down.', 'Somebody order a wall?', 'Big gun, short walk.'] },
  gantry: { name: 'Gantry', team: 0, hp: 420, shield: 0, speed: 3.9, eye: 2.95, headY: 3.2, bodyY: 2.1, rad: 1.25, cost: 220, time: 22, supply: 4, quip: '"Two legs, two cannons, zero paperwork."', ack: ['Walker\'s yours. Mind the paint.', 'Stomping on your say-so.', 'Big rig, bigger invoice.'] },
  longshot: { name: 'Longshot', team: 0, hp: 50, shield: 0, speed: 4.7, eye: 1.58, headY: 1.56, bodyY: .9, rad: .66, cost: 120, time: 16, supply: 2, quip: '"I bill by the mile."', ack: ['Scope\'s yours. Breathe out first.', 'One round, one invoice.', 'I was comfortable back there.'] },
  patch: { name: 'Patch', team: 0, hp: 70, shield: 0, speed: 5.0, eye: 1.55, headY: 1.56, bodyY: .9, rad: .66, cost: 90, time: 13, supply: 1, quip: '"Hold still. This is mostly glue."', ack: ['Clinic is open.', 'Who\'s leaking?', 'I do stitches and rivets.'] },
  cantor: { name: 'Cantor', team: 1, hp: 90, shield: 50, speed: 5.4, eye: 2.2, headY: 2.42, bodyY: 1.3, rad: .66, cost: 60, time: 11, supply: 1, quip: '"We sing first. It is only polite."', ack: ['The verse is yours.', 'One voice, borrowed.', 'Blades in tune.'] },
  lancer: { name: 'Lancer', team: 1, hp: 50, shield: 30, speed: 4.4, eye: 2.0, headY: 2.12, bodyY: 1.25, rad: .6, cost: 65, time: 12, supply: 1, quip: '"A long note, held until something breaks."', ack: ['The lance hums for you.', 'Hold the note.', 'Far voice, listening.'] },
  warden: { name: 'Warden', team: 1, hp: 900, shield: 300, speed: 3.3, eye: 3.8, headY: 4.0, bodyY: 2.7, rad: 1.5, cost: 300, time: 30, supply: 6, quip: '"The low note. The one the ground hears."', ack: ['The deep voice wakes.', 'Step loudly.', 'The ground is listening.'] },
  ...G_UNIT,
  tender: { name: 'Tender', team: 1, hp: 40, shield: 20, speed: 4.8, eye: 1.75, headY: 1.86, bodyY: 1.05, rad: .62, cost: 50, time: 8, supply: 1, quip: '"The rock hums. I hum back. We agree on a price."', ack: ['Humming.', 'The seam is listening.', 'A small voice, but useful.'] },
};
export interface BldDef { name: string; hp: number; hx: number; hz: number; h: number; cost: number; time: number; blurb: string; needs?: BKind[] }
export const BLD: Record<BKind, BldDef> = {
  headframe: { name: 'Headframe', hp: 2400, hx: 6.6, hz: 4.6, h: 5, cost: 400, time: 50, blurb: 'A new base: Riggers bank ore here' },
  bunkhouse: { name: 'Bunkhouse', hp: 1500, hx: 3.9, hz: 3.0, h: 2.8, cost: 150, time: 14, blurb: 'Trains your soldiers' },
  depot: { name: 'Depot', hp: 800, hx: 2.8, hz: 2.6, h: 4.6, cost: 100, time: 9, blurb: 'Eight more beds' },
  watchpost: { name: 'Watchpost', hp: 550, hx: 1.6, hz: 1.6, h: 8, cost: 125, time: 11, blurb: 'Gun tower', needs: ['bunkhouse'] },
  machineshop: { name: 'Machine Shop', hp: 1900, hx: 4.6, hz: 3.6, h: 4, cost: 150, time: 16, blurb: 'Breachers, Patches, first upgrades', needs: ['bunkhouse'] },
  foundry: { name: 'Foundry', hp: 2000, hx: 4.4, hz: 3.8, h: 6, cost: 200, time: 20, blurb: 'Gantry walkers, second upgrades', needs: ['machineshop'] },
  choir: { name: 'Choir Stone', hp: 2000, hx: 1.5, hz: 1.5, h: 11, cost: 400, time: 50, blurb: 'A new Stone: Tenders bring ore here' },
  reedgate: { name: 'Reed Gate', hp: 1600, hx: 3.6, hz: 1.4, h: 8, cost: 200, time: 20, blurb: 'Wakes Wardens, second songs', needs: ['wardpylon'] },
  broodpit: { name: 'Brood Pit', hp: 1500, hx: 3.2, hz: 3.2, h: 4.2, cost: 150, time: 14, blurb: 'Hatches Cantors and Lancers' },
  thornspire: { name: 'Thorn Spire', hp: 380, hx: 1.2, hz: 1.2, h: 7.6, cost: 110, time: 11, blurb: 'Bolt tower', needs: ['broodpit'] },
  wardpylon: { name: 'Ward Pylon', hp: 520, hx: 1.5, hz: 1.5, h: 7, cost: 150, time: 16, blurb: 'Shields buildings near it, first songs', needs: ['broodpit'] },
  assay: { name: 'Assay Office', hp: 1400, hx: 3.6, hz: 3.2, h: 4.2, cost: 125, time: 14, blurb: 'Longshots, infantry research', needs: ['bunkhouse'] },
  mast: { name: 'Signal Mast', hp: 1100, hx: 2.3, hz: 2.3, h: 12, cost: 250, time: 22, blurb: 'Third upgrades, top research', needs: ['foundry', 'assay'] },
  hushwell: { name: 'Hush Well', hp: 800, hx: 2.4, hz: 2.4, h: 4.4, cost: 100, time: 9, blurb: 'Eight more voices' },
  ...(G_BLD as Record<GBKind, BldDef>),
};
export const BUILDABLE: BKind[] = ['bunkhouse', 'depot', 'watchpost', 'machineshop', 'assay', 'foundry', 'mast', 'headframe'];
/** Everything about a side that the shared code needs to know. Keyed by team: 0 is the Ironhold Charter, 1 the Veyl Chorus. */
export interface Faction { name: string; short: string; hq: BKind; worker: Kind; supply: BKind; builds: BKind[]; voice: string; squad: string; lead: Kind; ore: string }
export const FACTION: Record<number, Faction> = {
  0: { name: 'Ironhold Charter', short: 'Ironhold', hq: 'headframe', worker: 'rigger', supply: 'depot', builds: BUILDABLE, voice: 'Quartermaster', squad: 'Alpha', lead: 'linesman', ore: 'ore' },
  1: { name: 'Veyl Chorus', short: 'Veyl', hq: 'choir', worker: 'tender', supply: 'hushwell', builds: ['broodpit', 'hushwell', 'thornspire', 'wardpylon', 'reedgate', 'choir'], voice: 'Conductor', squad: 'Chorus Lead', lead: 'cantor', ore: 'ore' },
  2: { name: 'The Gloam', short: 'Gloam', hq: 'mothercap', worker: 'grazer', supply: 'sporesac', builds: G_BUILDABLE, voice: 'Overgrowth', squad: 'Swarm', lead: 'snapper', ore: 'ore' },
};
/** Who speaks for which side in the message feed. A player only hears their own side, plus Signal and chat. */
export const VOICE_SIDE: Record<string, number> = { Conductor: 1, Chorus: 1, 'Chorus Lead': 1, Cantor: 1, Lancer: 1, Warden: 1, Tender: 1, Watcher: 1, Overgrowth: 2, Swarm: 2, Grazer: 2, Snapper: 2, Quillback: 2, Blister: 2, Mulcher: 2, Rootwatch: 2 };
/** Which faction holds the far end of the map this match. The Ironhold always hold the yard; the Veyl or the Gloam hold the outpost. Set before a Game is made. */
export const SIDE = { out: 1 };
/** The side two sides fight: every match has two. */
export const foeOf = (team: number) => team === 0 ? SIDE.out : 0;
export const isWorker = (k: Kind) => k === 'rigger' || k === 'tender' || k === 'grazer';
export const isGloam = (k: Kind) => k === 'grazer' || k === 'snapper' || k === 'quillback' || k === 'blister' || k === 'mulcher';
/** What each building trains, and the extra building a unit needs standing before it can be trained. */
export const TRAINS: Partial<Record<BKind, Kind[]>> = { headframe: ['rigger'], bunkhouse: ['linesman', 'breacher', 'patch', 'longshot'], foundry: ['gantry'], choir: ['tender'], broodpit: ['cantor', 'lancer'], reedgate: ['warden'], mothercap: ['grazer', 'snapper', 'blister', 'quillback'], tuskhollow: ['mulcher'] };
export const UNIT_NEEDS: Partial<Record<Kind, BKind>> = { breacher: 'machineshop', patch: 'machineshop', longshot: 'assay', snapper: G_UNLOCK.snapper, quillback: G_UNLOCK.quillback, blister: G_UNLOCK.blister, mulcher: G_UNLOCK.mulcher };
export type UpKey = 'dmg' | 'armor' | 'dmg2' | 'armor2' | 'dmg3' | 'armor3' | 'drill' | 'beds' | 'post' | 'pay' | 'glass' | 'stitch' | 'frag' | 'servo' | 'weld' | 'buckets'
  | 'vedge' | 'vglass' | 'vedge2' | 'vglass2' | 'vhum' | 'vwide' | 'vstep' | 'vbreath' | 'vthorn' | 'vbloom' | GUpKey;
/** Research. `at` is the building that sells it, and `needs` is the research that has to be bought first. */
export interface UpDef { key: UpKey; name: string; cost: number; blurb: string; at: BKind; say: string; needs?: UpKey; /** The side that can buy it. Ironhold when left out. */ team?: number }
export const UPGRADES: UpDef[] = [
  { key: 'dmg', name: 'Hollow Points', cost: 150, blurb: '+25% gun damage', at: 'machineshop', say: 'Hollow Points issued. Try to hit something with them.' },
  { key: 'armor', name: 'Plating', cost: 150, blurb: '+25% health', at: 'machineshop', say: 'Plating bolted on. Everyone walk heavier.' },
  { key: 'dmg2', name: 'Tungsten Core', cost: 200, blurb: '+20% gun damage', at: 'foundry', needs: 'dmg', say: 'Tungsten Core rounds. Each one costs more than you do.' },
  { key: 'armor2', name: 'Reactive Plating', cost: 200, blurb: '+20% health', at: 'foundry', needs: 'armor', say: 'Reactive Plating fitted. It bites back, allegedly.' },
  { key: 'dmg3', name: 'Charter Specials', cost: 250, blurb: '+15% gun damage', at: 'mast', needs: 'dmg2', say: 'Charter Specials. Head office signed for these in person.' },
  { key: 'armor3', name: 'Vault Plate', cost: 250, blurb: '+15% health', at: 'mast', needs: 'armor2', say: 'Vault Plate. You are now worth more than the safe.' },
  { key: 'drill', name: 'Diamond Bits', cost: 100, blurb: 'Riggers dig 30% faster', at: 'headframe', say: 'Diamond Bits fitted. The rock has filed a complaint.' },
  { key: 'beds', name: 'Bunk Stacks', cost: 125, blurb: '+4 beds, and +2 more per Depot', at: 'headframe', say: 'Bunk Stacks in. Top bunk pays extra.' },
  { key: 'post', name: 'Twin Mounts', cost: 125, blurb: 'Watchposts fire faster and reach further', at: 'machineshop', say: 'Twin Mounts on every Watchpost. Twice the noise.' },
  { key: 'pay', name: 'Hazard Pay', cost: 100, blurb: 'Infantry move 12% faster', at: 'assay', say: 'Hazard Pay approved. Watch them run now.' },
  { key: 'glass', name: 'Long Glass', cost: 125, blurb: 'Longshots reach further and hit 15% harder', at: 'assay', say: 'Long Glass ground and fitted. They can see your mistakes from here.' },
  { key: 'stitch', name: 'Field Stitches', cost: 125, blurb: 'Patches heal 60% faster', at: 'assay', say: 'Field Stitches. Faster, and nearly as tidy.' },
  { key: 'frag', name: 'Short Fuses', cost: 100, blurb: 'Grenades come back in 5 seconds', at: 'assay', say: 'Short Fuses issued. Count faster.' },
  { key: 'servo', name: 'Servo Legs', cost: 150, blurb: 'Gantry walks 20% faster and stomps more often', at: 'foundry', say: 'Servo Legs in the walker. It skips now. Nobody likes it.' },
  { key: 'weld', name: 'Field Welders', cost: 200, blurb: 'Everyone out of a fight slowly heals', at: 'mast', say: 'Field Welders on call. Stand still and get better.' },
  { key: 'buckets', name: 'Deep Buckets', cost: 200, blurb: 'Riggers carry 10 ore a trip', at: 'mast', needs: 'drill', say: 'Deep Buckets. Same back, more rock.' },
  // The Veyl Chorus. Songs are learned at the buildings that sing them.
  { team: 1, key: 'vedge', name: 'Keener Edges', cost: 150, blurb: '+25% Veyl damage', at: 'wardpylon', say: 'Keener Edges. The blades hum a half step higher.' },
  { team: 1, key: 'vglass', name: 'Thicker Glass', cost: 150, blurb: '+25% health and shields', at: 'wardpylon', say: 'Thicker Glass. Every shell rings a little lower.' },
  { team: 1, key: 'vstep', name: 'Quick Step', cost: 100, blurb: 'Veyl move 12% faster', at: 'wardpylon', say: 'Quick Step. The Chorus learns to hurry.' },
  { team: 1, key: 'vthorn', name: 'Twin Thorns', cost: 125, blurb: 'Thorn Spires fire faster and reach further', at: 'wardpylon', say: 'Twin Thorns. The Spires grow a second eye.' },
  { team: 1, key: 'vedge2', name: 'Bright Edges', cost: 200, blurb: '+20% Veyl damage', at: 'reedgate', needs: 'vedge', say: 'Bright Edges. You can hear them cut.' },
  { team: 1, key: 'vglass2', name: 'Deep Glass', cost: 200, blurb: '+20% health and shields', at: 'reedgate', needs: 'vglass', say: 'Deep Glass. Rivets ring off it now.' },
  { team: 1, key: 'vbreath', name: 'Long Breath', cost: 125, blurb: 'Lancers reach further and hit 15% harder', at: 'reedgate', say: 'Long Breath. The Lancers hold the note longer.' },
  { team: 1, key: 'vbloom', name: 'Quick Bloom', cost: 150, blurb: 'Shields come back twice as fast', at: 'reedgate', say: 'Quick Bloom. A broken shell grows back before the echo fades.' },
  { team: 1, key: 'vhum', name: 'Low Hum', cost: 100, blurb: 'Tenders gather 30% faster', at: 'choir', say: 'Low Hum. The seams give up their ore sooner.' },
  { team: 1, key: 'vwide', name: 'Wide Chorus', cost: 125, blurb: '+4 voices, and +2 more per Hush Well', at: 'choir', say: 'Wide Chorus. More room in the song.' },
  // The Gloam. Research is grown at the buildings that hold it.
  ...G_UPGRADES.map(u => ({ ...u, team: 2 })),
];
/** Research a side can buy. */
export const upsOf = (team: number) => UPGRADES.filter(u => (u.team || 0) === team);

export interface Order { type: 'guard' | 'amove' | 'follow' | 'raid'; x: number; z: number; path?: number[][]; lead?: Unit }
export interface Unit {
  /** Set once a Veyl guard has broken off to regrow its shield, so it only does that once. */
  fled?: boolean; leashed?: boolean;
  /** Scenery a Veyl Lancer is sheltering behind, if any. */
  cover?: Prop | null;
  id: number; kind: Kind; team: number; pos: THREE.Vector3; yaw: number; hp: number; maxHp: number; shield: number; maxShield: number;
  obj: THREE.Group; rig: Rig; ring: THREE.Mesh; alive: boolean; speed: number; moving: boolean; phase: number; cd: number; think: number;
  target: Unit | Building | null; order: Order; lastHit: number; state: string; timer: number; carrying: number; node: OreNode | null; site: Building | null;
  dashCd: number; dashT: number; swing: number; slot: number; flashT: number; pop: number; wind: number; windX: number; windZ: number; kx: number; kz: number; pitch: number; brace: boolean; mend?: Unit | null;
  /** Multiplayer: which player is driving this body (0 for nobody), and where the server last said it was. */
  pilot: number; nx: number; nz: number;
}
export interface Building {
  id: number; kind: BKind; team: number; pos: THREE.Vector3; hx: number; hz: number; h: number; hp: number; maxHp: number; obj: THREE.Group; holo: THREE.Group | null;
  built: boolean; progress: number; /** progress already paid out as health, so damage to a site sticks */ pdone: number; queue: { kind: Kind; t: number }[]; alive: boolean; cd: number; builder: Unit | null; lastHit: number; rot: boolean; smokeT: number; stage: number;
  /** A Mother Cap's ripe Buds, and how far the next one has grown. */
  buds?: number; budT?: number;
}
/** A piece of map scenery that can be shot, blown up or drilled apart. */
export interface Prop {
  id: number; kind: 'rock' | 'mesa' | 'metal' | 'barrel' | 'plant' | 'crystal' | 'veyl'; name: string; x: number; z: number; r: number; y0: number; h: number;
  hp: number; maxHp: number; alive: boolean; solid: boolean; stage: number; stages: number;
  ranges: { attr: THREE.BufferAttribute; start: number; count: number }[]; obj?: THREE.Object3D; owner?: Prop; link: Prop[];
}
export interface OreNode { pos: THREE.Vector3; amount: number; max: number; obj: THREE.Group; /** Seconds the seam has been empty. */ dryT?: number }
export interface Callout { who: string; text: string; t: number; dur: number; keys: [string, string][] }
export interface Difficulty { name: string; enemy: number; raid: number; blurb: string }
export const DIFFS: Difficulty[] = [
  { name: 'Day shift', enemy: .75, raid: 1.25, blurb: 'Smaller raids, more time' },
  { name: 'Night shift', enemy: 1, raid: 1, blurb: 'The intended fight' },
  { name: 'Double shift', enemy: 1.15, raid: .9, blurb: 'Bigger raids, sooner' },
];

/** One battlefield. The Ironhold yard always sits at the origin; everything else hangs off these numbers. */
export interface MapDef {
  /** Which of the three maps, and the size it was scaled to (see SIZES). */
  base?: number; size?: number; k?: number;
  /** Ore fields away from the yard, for new bases. Worked out by setMap; the first is the rich seam. */
  sites?: number[][];
  name: string; blurb: string; out: [number, number]; flank: number[][]; road: string; flankName: string; exp: [number, number]; arch: number; wreck: [number, number] | null;
  rocks: number; spireEvery: number; buttes: number; crystals: number; ground: number[]; mesa: number[]; rock: number[]; dusk: number;
}
export const MAPS: MapDef[] = [
  { name: 'Needle\'s Eye', blurb: 'One road east, one ridge north', out: [124, 13], flank: [[118, -40], [62, -50], [20, -30]], road: 'east road', flankName: 'north ridge', exp: [61, -28], arch: 68, wreck: [46, 30],
    rocks: 260, spireEvery: 8, buttes: 9, crystals: 22, ground: [1, 1, 1], mesa: [1, 1, 1], rock: [1, 1, 1], dusk: 0 },
  { name: 'Switchback', blurb: 'Tight canyon, long way round', out: [92, -98], flank: [[118, -62], [112, 4], [44, 22]], road: 'canyon road', flankName: 'south bend', exp: [-52, -44], arch: 0, wreck: [64, -22],
    rocks: 420, spireEvery: 4, buttes: 14, crystals: 14, ground: [1, .85, .72], mesa: [1, .79, .65], rock: [.91, .78, .7], dusk: .55 },
  { name: 'Glass Flats', blurb: 'Wide open, nowhere to hide', out: [-136, 62], flank: [[-96, 104], [-30, 92], [4, 40]], road: 'west causeway', flankName: 'salt shelf', exp: [-58, -30], arch: 76, wreck: null,
    rocks: 110, spireEvery: 14, buttes: 4, crystals: 60, ground: [.78, 1.2, 1.85], mesa: [.8, .92, 1.6], rock: [.8, 1, 1.5], dusk: .1 },
];
export let MAP: MapDef = MAPS[0];
/** Map sizes. A map number carries its size in the tens: 0 to 2 are Medium, 10 to 12 Small, 20 to 22 Large. */
export const SIZES = [{ name: 'Medium', k: 1, sites: 4, blurb: 'Four ore fields to take' }, { name: 'Small', k: .75, sites: 3, blurb: 'Close quarters, three fields' }, { name: 'Large', k: 1.4, sites: 7, blurb: 'A long way out, seven fields' }];
export const mapCode = (base: number, size: number) => base + 10 * size;
export const validMap = (code: number) => Number.isInteger(code) && code % 10 >= 0 && code % 10 < MAPS.length && Math.floor(code / 10) < SIZES.length;
const segD = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
export const OUTPOST = { x: 124, z: 13 };
export const GATE = { x: 138, z: 12 };
export const RALLY = { x: 25, z: 11 };
export const RALLY_N = { x: 14, z: -27 };
/** The Veyl squad's rally points, on the road and toward the ridge, and where a Veyl economy's first Choir Stone stands. */
export const VRALLY = { x: 98, z: 11 }, VRALLY_N = { x: 121, z: -15 }, VHOME = { x: 132, z: 13 };
export const NORTH_PATH: number[][] = [[118, -40], [62, -50], [20, -30]];
/** Where the road leaves the yard, its heading, and its length to the outpost. */
export const ROAD = { x: 0, z: 14, dx: 1, dz: 0, len: 124 };
/** A point given as distance along the road and offset to its right-hand side. */
export const roadPt = (s: number, off = 0): [number, number] => [ROAD.x + ROAD.dx * s - ROAD.dz * off, ROAD.z + ROAD.dz * s + ROAD.dx * off];
/** A point in the outpost's own frame: +x is deeper in, away from the yard. */
export const veylPt = (lx: number, lz: number): [number, number] => [OUTPOST.x + ROAD.dx * lx - ROAD.dz * lz, OUTPOST.z + ROAD.dz * lx + ROAD.dx * lz];
export function setMap(code: number) {
  if (!validMap(code)) code = 0; const base = code % 10, size = Math.floor(code / 10), S = SIZES[size], k = S.k, B = MAPS[base], sc = (p: number[]) => [Math.round(p[0] * k), Math.round(p[1] * k)];
  MAP = { ...B, base, size, k, out: sc(B.out) as [number, number], flank: B.flank.map(sc), exp: sc(B.exp) as [number, number], arch: Math.round(B.arch * k), wreck: B.wreck ? sc(B.wreck) as [number, number] : null, rocks: Math.round(B.rocks * k * k), buttes: Math.round(B.buttes * k), crystals: B.crystals };
  if (base === 0) MAP.out[1] = 13;
  const [ox, oz] = MAP.out;
  const ol = Math.hypot(ox, oz), px = -oz / ol, pz = ox / ol;
  if (base === 0) { ROAD.x = 0; ROAD.z = 14; } else { ROAD.x = px * 12; ROAD.z = pz * 12; }
  const ax = base === 0 ? ox : ox + px, az = base === 0 ? 14 : oz + pz, dx = ax - ROAD.x, dz = az - ROAD.z, l = Math.hypot(dx, dz);
  ROAD.dx = dx / l; ROAD.dz = dz / l; ROAD.len = l; OUTPOST.x = ox; OUTPOST.z = oz;
  const g = veylPt(14, -1); GATE.x = g[0]; GATE.z = g[1];
  const r = roadPt(25, -3); RALLY.x = r[0]; RALLY.z = r[1];
  NORTH_PATH.length = 0; for (const p of MAP.flank) NORTH_PATH.push([p[0], p[1]]);
  const e = MAP.flank[MAP.flank.length - 1], el = Math.hypot(e[0], e[1]) || 1; RALLY_N.x = e[0] - e[0] / el * 7; RALLY_N.z = e[1] - e[1] / el * 7;
  const vr = roadPt(ROAD.len - 24, 3); VRALLY.x = vr[0]; VRALLY.z = vr[1]; const f0 = MAP.flank[0]; VRALLY_N.x = ox + (f0[0] - ox) * .5; VRALLY_N.z = oz + (f0[1] - oz) * .5; const vh = veylPt(8, 1); VHOME.x = vh[0]; VHOME.z = vh[1];
  // Ore fields for new bases: the old rich seam first, then spots spread around the map, clear of the yard, the outpost and both routes.
  const sites: number[][] = [[MAP.exp[0], MAP.exp[1]]], cx = ox / 2, cz = oz / 2, end = roadPt(ROAD.len + 6);
  const ok = (x: number, z: number) => { if (Math.hypot(x, z) < 52 * k || Math.hypot(x - ox, z - oz) < 58 * k || Math.hypot(x - cx, z - cz) > 168 * k) return false; if (segD(x, z, ROAD.x, ROAD.z, end[0], end[1]) < 20) return false;
    let qx = ox, qz = oz; for (const [fx, fz] of MAP.flank) { if (segD(x, z, qx, qz, fx, fz) < 16) return false; qx = fx; qz = fz; } return segD(x, z, qx, qz, 0, 0) >= 16; };
  const cand: number[][] = []; for (let a = 0; a < 32; a++) for (const f of [.5, .72, .95]) { const x = Math.round(cx + Math.cos(a / 32 * 6.2832) * f * 150 * k), z = Math.round(cz + Math.sin(a / 32 * 6.2832) * f * 120 * k); if (ok(x, z)) cand.push([x, z]); }
  while (sites.length < S.sites && cand.length) { let best = -1, bd = -1; cand.forEach(([x, z], i) => { const d = Math.min(Math.hypot(x, z) * .8, ...sites.map(s => Math.hypot(x - s[0], z - s[1]))); if (d > bd) { bd = d; best = i; } }); if (bd < 34) break; sites.push(cand.splice(best, 1)[0]); }
  MAP.sites = sites;
}
export const isUnit = (t: any): t is Unit => !!t && t.rig !== undefined;
export const isSoldier = (u: Unit) => u.kind === 'linesman' || u.kind === 'breacher' || u.kind === 'gantry' || u.kind === 'longshot' || u.kind === 'patch';
/** A fighting body on either side: anything that is not a worker. */
export const isFighter = (u: Unit) => !isWorker(u.kind);
