// The Veyl Chorus's numbers: units, buildings, songs (research), and what trains where. Shared code reads these through src/data.ts.
// Costs, beds (supply) and tech requirements are the full-depth plan's. Health, shields, damage, ranges, energy and cooldowns are first
// guesses by the Veyl rules stream, each with its reason; the balance stream sets the final numbers.
import type { UnitDef, BldDef, Faction } from '../../data';

export type VKind = 'cantor' | 'lancer' | 'warden' | 'tender' | 'tuner' | 'mute' | 'choirmaster' | 'chord' | 'bell' | 'reedwalker' | 'knell' | 'listener'
  | 'ferry' | 'swift' | 'prism' | 'omen' | 'lyre' | 'shard' | 'cantus';
export type VBKind = 'choir' | 'reedgate' | 'broodpit' | 'thornspire' | 'wardpylon' | 'hushwell' | 'siphonbell' | 'mendingpool' | 'duskhall' | 'kiln'
  | 'skyloft' | 'tuningfork' | 'quiethouse' | 'songarchive' | 'highbeacon';
export type VUpKey = 'vedge' | 'vedge2' | 'vedge3' | 'vglass' | 'vglass2' | 'vglass3' | 'vshell' | 'vshell2' | 'vshell3' | 'vaedge' | 'vaedge2' | 'vaedge3'
  | 'vaglass' | 'vaglass2' | 'vaglass3' | 'vfar' | 'vhum' | 'vrush' | 'vskip' | 'vbreath' | 'vbloom' | 'vstep' | 'vferry' | 'vlisten' | 'vomen' | 'vstride'
  | 'vtoll' | 'vstepthru' | 'vshatter' | 'vreach' | 'vshard' | 'vswift'
  // Kept so old saves and story jobs that name them still load; nothing sells them now.
  | 'vthorn' | 'vwide';

const V = (o: Omit<UnitDef, 'team'>): UnitDef => ({ team: 1, ...o });
export const V_UNIT: Record<VKind, UnitDef> = {
  tender: V({ name: 'Tender', hp: 40, shield: 20, speed: 4.8, eye: 1.75, headY: 1.86, bodyY: 1.05, rad: .62, cost: 50, time: 8, supply: 1, tags: ['soft', 'sung'], quip: '"The rock hums. I hum back. We agree on a price."', ack: ['Humming.', 'The seam is listening.', 'A small voice, but useful.'] }),
  // The plan makes a Cantor 100 ore and 2 beds (it was 60 and 1): health, shields and its cut grow by the same 1.6 so a Cantor is worth its ore.
  cantor: V({ name: 'Cantor', hp: 140, shield: 80, speed: 5.4, eye: 2.2, headY: 2.42, bodyY: 1.3, rad: .66, cost: 100, time: 15, supply: 2, tags: ['soft', 'sung'], armour: 1, quip: '"We sing first. It is only polite."', ack: ['The verse is yours.', 'One voice, borrowed.', 'Blades in tune.'] }),
  // 125 ore and 50 Flux, 2 beds (was 65 and 1): tougher, and its bolt does 12 more to plated bodies (the plan: "beats plated"). It now hits fliers too.
  lancer: V({ name: 'Lancer', hp: 80, shield: 60, speed: 4.4, eye: 2.0, headY: 2.12, bodyY: 1.25, rad: .6, cost: 125, flux: 50, time: 17, supply: 2, tags: ['plated', 'sung'], armour: 1, bonus: { plated: 12 }, hits: 'both', quip: '"A long note, held until something breaks."', ack: ['The lance hums for you.', 'Hold the note.', 'Far voice, listening.'] }),
  // A support caster: as light as a Lancer, a weak bolt, and energy for its three songs.
  tuner: V({ name: 'Tuner', hp: 60, shield: 50, speed: 4.8, eye: 1.95, headY: 2.05, bodyY: 1.2, rad: .6, cost: 50, flux: 100, time: 14, supply: 2, energy: 200, tags: ['plated', 'sung'], armour: 1, hits: 'ground', quip: '"I tune the air until it holds."', ack: ['Listening for the pitch.', 'A pane, if you want one.', 'I hear the gap.'] }),
  // Always unseen. Two hits kill a Linesman: it is what an army without a detector loses to.
  mute: V({ name: 'Mute', hp: 60, shield: 80, speed: 5.6, eye: 2.1, headY: 2.3, bodyY: 1.25, rad: .62, cost: 125, flux: 125, time: 20, supply: 2, cloak: true, tags: ['soft', 'sung'], armour: 1, quip: '"..."', ack: ['...', '(a blade turns, once)', '(nothing you can hear)'] }),
  // An area caster with no weapon of its own: frail, slow, all energy.
  choirmaster: V({ name: 'Choirmaster', hp: 40, shield: 40, speed: 4.0, eye: 2.25, headY: 2.45, bodyY: 1.35, rad: .62, cost: 50, flux: 150, time: 22, supply: 2, energy: 200, tags: ['soft', 'sung'], quip: '"Every note I sing, somebody else regrets."', ack: ['The score is open.', 'I will conduct.', 'Pick a chord.'] }),
  // Two casters joined. Nearly all shield, splash at short range, extra against living bodies. Its price is the two casters it was made from.
  chord: V({ name: 'Chord', hp: 10, shield: 350, speed: 3.9, eye: 2.6, headY: 2.8, bodyY: 1.6, rad: 1.0, cost: 100, flux: 300, time: 12, supply: 4, tags: ['sung', 'huge'], bonus: { living: 10 }, hits: 'both', quip: '"Two of us. One voice. Stand back."', ack: ['We are one.', 'Both of us hear you.', 'The chord holds.'] }),
  // Beats heavy: plated and huge bodies take 30 more per hit. Ring Shell soaks 100 then grows back.
  bell: V({ name: 'Bell', hp: 200, shield: 100, speed: 3.6, eye: 2.6, headY: 2.7, bodyY: 1.5, rad: 1.1, cost: 275, flux: 100, time: 28, supply: 4, tags: ['plated', 'machine', 'sung'], armour: 1, bonus: { plated: 30, huge: 30 }, hits: 'ground', quip: '"Ring me once. You will not ring twice."', ack: ['The Bell turns.', 'Struck and ready.', 'One loud note.'] }),
  // Tall beam walker: sweeps a line, steps up cliffs, and anti-air guns reach its head.
  reedwalker: V({ name: 'Reedwalker', hp: 260, shield: 150, speed: 3.6, eye: 6.2, headY: 6.4, bodyY: 4.2, rad: 1.4, cost: 300, flux: 200, time: 40, supply: 6, tags: ['plated', 'huge', 'sung'], armour: 1, bonus: { soft: 6 }, hits: 'ground', tall: true, climb: true, quip: '"I walk where the reeds grew tallest."', ack: ['Stepping high.', 'The beam is warm.', 'I see over the ridge.'] } as UnitDef),
  // Slow, no gun: its Toll orb is its whole fight.
  knell: V({ name: 'Knell', hp: 100, shield: 100, speed: 3.6, eye: 2.0, headY: 2.2, bodyY: 1.3, rad: .9, cost: 150, flux: 150, time: 26, supply: 3, tags: ['plated', 'machine', 'sung'], armour: 1, hits: 'ground', quip: '"One toll. Count the silence after."', ack: ['The orb is ready.', 'Say where.', 'Mind your own feet.'] }),
  // Flying detector, always unseen, very cheap in ore.
  listener: V({ name: 'Listener', hp: 40, shield: 20, speed: 6.2, eye: 2, headY: 1.2, bodyY: .6, rad: .7, cost: 25, flux: 75, time: 18, supply: 1, air: true, cloak: true, detect: 12, tags: ['machine', 'sung'], quip: '"I hear the ones you cannot see."', ack: ['Listening.', 'Drifting over.', 'I hear footsteps.'] }),
  // Transport for eight beds; it unfolds into a song field anywhere it sits.
  ferry: V({ name: 'Ferry', hp: 100, shield: 100, speed: 6.4, eye: 2, headY: 1.6, bodyY: .9, rad: 1.3, cost: 250, time: 30, supply: 2, air: true, cargo: 8, tags: ['machine', 'sung'], armour: 1, quip: '"Climb in. Mind the hum."', ack: ['Room for eight.', 'Hold on to something.', 'The field folds with me.'] }),
  // Fast air fighter: only hits fliers, two bolts a volley. Lift takes a ground body up for 8 s.
  swift: V({ name: 'Swift', hp: 120, shield: 60, speed: 8.0, eye: 2, headY: 1.4, bodyY: .8, rad: 1.0, cost: 150, flux: 100, time: 26, supply: 2, air: true, energy: 200, tags: ['soft', 'sung'], bonus: { soft: 4 }, hits: 'air', quip: '"Up is where I live."', ack: ['Wings out.', 'Fast and high.', 'Point at a sky.'] }),
  // Beam ship: a steady beam, more against plated; Burn Bright makes it far more.
  prism: V({ name: 'Prism', hp: 150, shield: 100, speed: 4.6, eye: 2, headY: 1.6, bodyY: 1.0, rad: 1.4, cost: 250, flux: 150, time: 30, supply: 4, air: true, tags: ['plated', 'sung'], bonus: { plated: 4 }, hits: 'both', quip: '"I gather the light and give it back sharp."', ack: ['Focusing.', 'The beam is yours.', 'Bright and steady.'] }),
  // Raider caster in the air: a beam that melts soft bodies, Reveal, and the Still Stone trap.
  omen: V({ name: 'Omen', hp: 100, shield: 60, speed: 7.2, eye: 2, headY: 1.4, bodyY: .8, rad: 1.0, cost: 150, flux: 150, time: 26, supply: 3, air: true, energy: 200, tags: ['plated', 'sung'], hits: 'ground', quip: '"I see what is coming. Mostly you."', ack: ['Watching.', 'A bad sign for someone.', 'I know the way.'] }),
  // Carrier: no gun of its own; builds up to 8 Shards (15 ore each) that fly out and fight.
  lyre: V({ name: 'Lyre', hp: 300, shield: 150, speed: 3.4, eye: 2.4, headY: 2.2, bodyY: 1.4, rad: 2.2, cost: 350, flux: 250, time: 46, supply: 6, air: true, tags: ['plated', 'huge', 'sung'], armour: 2, hits: 'both', quip: '"Eight strings. Each one bites."', ack: ['Strings tuned.', 'The Shards are restless.', 'Slow, but never alone.'] }),
  shard: V({ name: 'Shard', hp: 40, shield: 30, speed: 9, eye: 1, headY: .7, bodyY: .5, rad: .4, cost: 15, time: 9, supply: 0, air: true, tags: ['machine', 'sung'], hits: 'both', quip: '"(a high, thin note)"', ack: ['(ting)'] }),
  // 300 ore and 200 Flux now (was 300): the same giant, with a little more health for the Flux.
  warden: V({ name: 'Warden', hp: 950, shield: 300, speed: 3.3, eye: 3.8, headY: 4.0, bodyY: 2.7, rad: 1.5, cost: 300, flux: 200, time: 34, supply: 6, tags: ['huge', 'sung'], armour: 1, quip: '"The low note. The one the ground hears."', ack: ['The deep voice wakes.', 'Step loudly.', 'The ground is listening.'] }),
  // Flagship, one per side: hides friends near it, calls a group to it, slows a circle.
  cantus: V({ name: 'Cantus', hp: 350, shield: 350, speed: 2.8, eye: 3, headY: 3.4, bodyY: 2.2, rad: 2.8, cost: 400, flux: 400, time: 70, supply: 8, air: true, energy: 200, tags: ['plated', 'huge', 'sung'], armour: 2, hits: 'both', quip: '"Every voice under me goes unheard."', ack: ['The Cantus listens.', 'Gather under me.', 'Slow, and certain.'] }),
};
export const V_BLD: Record<VBKind, BldDef> = {
  choir: { name: 'Choir Stone', hp: 2000, hx: 1.5, hz: 1.5, h: 11, cost: 400, time: 50, blurb: 'A new Stone: Tenders bring ore here. Makes a song field', tags: ['sung', 'huge'] },
  hushwell: { name: 'Hush Well', hp: 800, hx: 2.4, hz: 2.4, h: 4.4, cost: 100, time: 18, blurb: 'Eight more voices. Makes a song field', tags: ['sung'], armour: 1 },
  siphonbell: { name: 'Siphon Bell', hp: 450, hx: 1.6, hz: 1.6, h: 5, cost: 75, time: 18, blurb: 'Goes on a vent: Tenders carry Flux from it', tags: ['sung'], armour: 1 },
  broodpit: { name: 'Brood Pit', hp: 1500, hx: 3.2, hz: 3.2, h: 4.2, cost: 150, time: 30, blurb: 'Wakes Cantors, Lancers, Tuners, Mutes and Choirmasters', tags: ['sung', 'huge'], armour: 1 },
  wardpylon: { name: 'Ward Pylon', hp: 520, hx: 1.5, hz: 1.5, h: 7, cost: 150, time: 26, blurb: 'Shields buildings near it. Ground levels', needs: ['broodpit'], tags: ['sung'], armour: 1 },
  thornspire: { name: 'Thorn Spire', hp: 380, hx: 1.2, hz: 1.2, h: 7.6, cost: 150, time: 20, blurb: 'Bolt tower: hits ground and air, sees unseen bodies', needs: ['wardpylon'], detect: 11, hits: 'both', tags: ['sung'], armour: 1 },
  reedgate: { name: 'Reed Gate', hp: 1400, hx: 3.6, hz: 1.4, h: 8, cost: 150, time: 30, blurb: 'Wakes Wardens. Far Singing, air levels', needs: ['broodpit'], tags: ['sung', 'huge'], armour: 1 },
  mendingpool: { name: 'Mending Pool', hp: 550, hx: 2.0, hz: 2.0, h: 3, cost: 100, time: 24, blurb: 'Puts shields back on bodies and buildings near it', needs: ['reedgate'], tags: ['sung'], armour: 1 },
  duskhall: { name: 'Dusk Hall', hp: 1100, hx: 2.8, hz: 2.8, h: 6, cost: 150, flux: 100, time: 36, blurb: 'Rush, Skip, Long Breath, Quick Bloom', needs: ['reedgate'], tags: ['sung', 'huge'], armour: 1 },
  kiln: { name: 'Kiln', hp: 1500, hx: 3.4, hz: 3.0, h: 5.5, cost: 150, flux: 100, time: 46, blurb: 'Fires Bells, Listeners, Ferries, Reedwalkers and Knells', needs: ['reedgate'], tags: ['sung', 'huge'], armour: 1 },
  skyloft: { name: 'Skyloft', hp: 1400, hx: 3.2, hz: 3.2, h: 7, cost: 150, flux: 150, time: 44, blurb: 'Grows Swifts, Prisms, Omens and Lyres', needs: ['reedgate'], tags: ['sung', 'huge'], armour: 1 },
  tuningfork: { name: 'Tuning Fork', hp: 1000, hx: 2.2, hz: 2.2, h: 9, cost: 150, flux: 150, time: 46, blurb: 'Unlocks Reedwalkers and Knells', needs: ['kiln'], tags: ['sung'], armour: 1 },
  quiethouse: { name: 'Quiet House', hp: 900, hx: 2.4, hz: 2.4, h: 5, cost: 150, flux: 150, time: 46, blurb: 'Unlocks Mutes and Step Through', needs: ['duskhall'], tags: ['sung'], armour: 1 },
  songarchive: { name: 'Song Archive', hp: 1000, hx: 2.6, hz: 2.6, h: 6, cost: 150, flux: 200, time: 46, blurb: 'Unlocks Choirmasters and Wardens. Shatter Note', needs: ['duskhall'], tags: ['sung'], armour: 1 },
  highbeacon: { name: 'High Beacon', hp: 1200, hx: 2.2, hz: 2.2, h: 12, cost: 300, flux: 200, time: 46, blurb: 'Unlocks Lyres and the Cantus', needs: ['skyloft'], tags: ['sung'], armour: 1 },
};
export const V_BUILDABLE: VBKind[] = ['broodpit', 'hushwell', 'siphonbell', 'thornspire', 'wardpylon', 'reedgate', 'choir', 'mendingpool', 'duskhall', 'kiln', 'skyloft', 'tuningfork', 'quiethouse', 'songarchive', 'highbeacon'];
export const V_FACTION: Faction = { name: 'Veyl Chorus', short: 'Veyl', hq: 'choir', worker: 'tender', supply: 'hushwell', builds: V_BUILDABLE, voice: 'Conductor', squad: 'Chorus Lead', lead: 'cantor', ore: 'ore', barracks: 'broodpit' };
export const V_TRAINS: Partial<Record<VBKind, VKind[]>> = {
  choir: ['tender', 'cantus'], broodpit: ['cantor', 'lancer', 'tuner', 'mute', 'choirmaster'], reedgate: ['warden'],
  kiln: ['bell', 'listener', 'ferry', 'reedwalker', 'knell'], skyloft: ['swift', 'prism', 'omen', 'lyre'],
};
/** The extra building a unit needs standing before it can be trained. */
export const V_NEEDS: Partial<Record<VKind, VBKind>> = {
  lancer: 'reedgate', tuner: 'reedgate', mute: 'quiethouse', choirmaster: 'songarchive', warden: 'songarchive',
  reedwalker: 'tuningfork', knell: 'tuningfork', lyre: 'highbeacon', cantus: 'highbeacon',
};
/** Song fields: the buildings that make one, how far it reaches past their middle, and an unfolded Ferry's. Every other Veyl building
 *  must stand with some part of it inside a field to work (src/factions/veyl/fields.ts). */
export const FIELD = { src: ['choir', 'hushwell'] as VBKind[], r: 6.5, ferry: 5 };

/** Every dial of the Veyl rules in one place, so the balance stream and the tests can turn them. */
export const V_TUNE = {
  /** Melee: a Cantor's cut (was 13 at 60 ore), how far Rush carries it and the extra cut when it lands. Mute: its cut. */
  cantor: { cut: 20, cd: .95, rushRange: 10, rushHit: 10, rushCd: 9 },
  mute: { cut: 30, cd: 1.15, stepRange: 9, stepCd: 20 },
  /** Lancer: its bolt (was 20), seconds between bolts, reach, and Long Breath's extra reach. Skip: how far and how often. */
  lancer: { dmg: 18, cd: 2.2, range: 34, breath: 6, skip: 8, skipCd: 10 },
  /** Tuner: its bolt; Glass Wall's pane (length, seconds); Ward Hum (radius, seconds, taken off each hit); False Voice (copies, seconds). */
  tuner: { dmg: 6, cd: 1.1, range: 20, wallLen: 7, wallT: 11, humR: 5, humT: 11, humCut: 2, voiceN: 2, voiceT: 30 },
  /** Choirmaster: Shatter Note (total damage, seconds, radius, warning), Drain (energy burned, range), Join (seconds to fuse). */
  choirmaster: { shatter: 80, shatterT: 4, shatterR: 3, mark: 1.2, drain: 50, range: 12, joinT: 10 },
  /** Chord: its splash bolt (damage, radius, reach, seconds). */
  chord: { dmg: 25, splash: 2.2, range: 10, cd: 1.25 },
  /** Bell: its shot and the Ring Shell (how much it soaks, seconds to grow back). */
  bell: { dmg: 20, cd: 1.45, range: 18, shell: 100, shellBack: 30 },
  /** Reedwalker: the beam sweep (each of two passes, length of the line, reach, seconds) and Long Stride's extra reach. */
  reedwalker: { dmg: 16, line: 4, range: 22, cd: 1.5, stride: 6 },
  /** Knell: Toll (damage, radius, seconds the orb rolls, reach, cooldown) and Quick Toll's cooldown. */
  knell: { dmg: 145, r: 3.2, roll: 3, range: 13, cd: 21, quickCd: 15 },
  /** Listener: how far it sees unseen bodies settled, and Listener speed's boost. */
  listener: { settled: 18, fast: 1.4 },
  /** Ferry: unfolded field radius, seconds to unfold, and Ferry speed's boost. */
  ferry: { fold: 1.5, fast: 1.35 },
  /** Swift: its volley (two bolts), reach (and with Swift Range), Lift (seconds, energy, reach). */
  swift: { dmg: 10, cd: 1.1, range: 14, far: 4, liftT: 8, lift: 50, liftRange: 12 },
  /** Prism: its beam each tick, Burn Bright's extra against plated and its length and cooldown. */
  prism: { dmg: 6, cd: .4, range: 14, burn: 10, burnT: 12, burnCd: 40 },
  /** Omen: Shrill (energy to start, drain a second, damage, extra to soft), Reveal (energy, radius, seconds), Still Stone (energy, radius, seconds frozen). */
  omen: { shrill: 25, drain: 1.5, dmg: 12, soft: 8, cd: .86, range: 10, reveal: 50, revealR: 8, revealT: 20, stone: 50, stoneR: 4, stoneT: 20, stoneArm: 1.5 },
  /** Lyre: Shards it holds, ore each, seconds each, how far they fly out; Shard Launch builds them faster. Shard: its hit. */
  lyre: { max: 8, ore: 15, build: 9, leash: 16, launch: .6 },
  shard: { dmg: 5, cd: 1.5, range: 6 },
  /** Cantus: its beams (how many targets), the hide radius, Gather (radius, cooldown), Hold Time (energy, radius, slow, seconds). */
  cantus: { dmg: 6, beams: 4, cd: 1.2, range: 14, hide: 10, gatherR: 7, gatherCd: 120, hold: 75, holdR: 8, holdSlow: .6, holdT: 8 },
  /** Thorn Spire: hit, seconds, reach. */
  spire: { dmg: 12, cd: 1, range: 26 },
  /** Mending Pool: building energy (max, start, a second), shields put back for each point of energy, reach. Choir Stone: Quicken. */
  pool: { max: 100, start: 50, regen: .7875, per: 3, r: 7, rate: 50 },
  quicken: { energy: 50, t: 20, k: 1.5, max: 200, start: 50 },
  /** Far Singing: seconds a unit takes to be sung in at a field; the Brood Pit then rests so that one body every `cycle` of its training time
   *  comes out (0.9: a little quicker than training at home, the way a warp gate is; it was a rest of 1.25 times on top, which made a Pit 45% slower). */
  far: { arrive: 3, cycle: .9 },
  /** Air levels: damage and health per level for fliers (percent, like the ground levels). */
  air: [1.15, 1.12, 1.1],
  /** Shell levels: shield per level, as a share of the body's shield. */
  shell: [.1, .1, .1],
};

type VUp = { key: VUpKey; name: string; cost: number; flux?: number; blurb: string; at: VBKind; say: string; needs?: VUpKey; line?: 'atk' | 'arm' | 'shd'; lvl?: number; pct?: number; cat?: string };
const LV = (base: VUpKey, line: 'atk' | 'arm' | 'shd' | undefined, names: string[], at: VBKind, what: string, pcts: string[], ore = [100, 150, 200]): VUp[] =>
  names.map((name, i) => ({ key: (i ? base + (i + 1) : base) as VUpKey, line, lvl: line ? i + 1 : undefined, name, cost: ore[i], flux: ore[i], at, needs: i ? (i > 1 ? base + i : base) as VUpKey : undefined,
    blurb: `${what} ${pcts[i]}`, say: `${name} learned. ${what} ${pcts[i]}.` }));
/** Songs are learned at the buildings that sing them. Each level line goes 1 to 3; level 2 and 3 need the one before. */
export const V_UPGRADES: VUp[] = [
  ...LV('vedge', 'atk', ['Ground Edge 1', 'Ground Edge 2', 'Ground Edge 3'], 'wardpylon', 'Veyl ground bodies hit', ['25% harder', '20% harder again', '15% harder again']),
  ...LV('vglass', 'arm', ['Ground Glass 1', 'Ground Glass 2', 'Ground Glass 3'], 'wardpylon', 'Veyl ground bodies get', ['25% more health and shield', '20% more again', '15% more again']),
  ...LV('vshell', 'shd', ['Shell 1', 'Shell 2', 'Shell 3'], 'wardpylon', 'Every Veyl shield is', ['10% bigger', '10% bigger again', '10% bigger again'], [150, 225, 300]),
  ...LV('vaedge', undefined, ['Air Edge 1', 'Air Edge 2', 'Air Edge 3'], 'reedgate', 'Veyl fliers hit', ['15% harder', '12% harder again', '10% harder again']),
  ...LV('vaglass', undefined, ['Air Glass 1', 'Air Glass 2', 'Air Glass 3'], 'reedgate', 'Veyl fliers get', ['15% more health and shield', '12% more again', '10% more again'], [150, 225, 300]),
  { key: 'vfar', name: 'Far Singing', cost: 50, flux: 50, blurb: 'Brood Pit units can be sung in at any song field you can see', at: 'reedgate', say: 'Far Singing learned. A Brood Pit now sings each new body in at the song field nearest the front, then rests.' },
  { key: 'vhum', name: 'Low Hum', cost: 100, blurb: 'Tenders gather 30% faster', at: 'choir', say: 'Low Hum learned. Tenders gather ore 30% faster.' },
  { key: 'vrush', name: 'Rush', cost: 100, flux: 100, blurb: 'Cantors close the last 10 m in a rush and hit harder when they land', at: 'duskhall', say: 'Rush learned. A Cantor now runs the last 10 m to a target and its first cut does 10 more.' },
  { key: 'vskip', name: 'Skip', cost: 150, flux: 150, blurb: 'Lancers can step 8 m in a blink', at: 'duskhall', say: 'Skip learned. A Lancer can now step 8 m in a blink, every 10 seconds.' },
  { key: 'vbreath', name: 'Long Breath', cost: 150, flux: 150, blurb: 'Lancers reach 6 m further and hit 15% harder', at: 'duskhall', say: 'Long Breath learned. Lancers now reach 6 m further and hit 15% harder.' },
  { key: 'vbloom', name: 'Quick Bloom', cost: 150, flux: 150, blurb: 'Shields come back twice as fast', at: 'duskhall', say: 'Quick Bloom learned. Veyl shields now grow back twice as fast.' },
  { key: 'vstep', name: 'Quick Step', cost: 100, flux: 100, blurb: 'Veyl ground bodies move 12% faster', at: 'duskhall', say: 'Quick Step learned. Veyl ground bodies now walk 12% faster.' },
  { key: 'vferry', name: 'Ferry Speed', cost: 100, flux: 100, blurb: 'Ferries fly 35% faster', at: 'kiln', say: 'Ferry Speed learned. Ferries now fly 35% faster.' },
  { key: 'vlisten', name: 'Listener Speed', cost: 100, flux: 100, blurb: 'Listeners fly 40% faster', at: 'kiln', say: 'Listener Speed learned. Listeners now fly 40% faster.' },
  { key: 'vomen', name: 'Omen Energy', cost: 150, flux: 150, blurb: 'Omens hold 50 more energy and start with it', at: 'skyloft', say: 'Omen Energy learned. Omens now hold 50 more energy.' },
  { key: 'vstride', name: 'Long Stride', cost: 150, flux: 150, blurb: 'Reedwalkers reach 6 m further', at: 'tuningfork', say: 'Long Stride learned. Reedwalker beams now reach 6 m further.' },
  { key: 'vtoll', name: 'Quick Toll', cost: 150, flux: 150, blurb: 'A Knell can roll a new orb 6 seconds sooner', at: 'tuningfork', say: 'Quick Toll learned. A Knell now rolls an orb every 15 seconds instead of 21.' },
  { key: 'vstepthru', name: 'Step Through', cost: 100, flux: 100, blurb: 'Mutes can blink 9 m, every 20 seconds', at: 'quiethouse', say: 'Step Through learned. A Mute can now blink 9 m, every 20 seconds.' },
  { key: 'vshatter', name: 'Shatter Note', cost: 200, flux: 200, blurb: 'Choirmasters can cast Shatter Note', at: 'songarchive', say: 'Shatter Note learned. A Choirmaster can now crack the air in a 3 m circle: 80 damage over 4 seconds to everyone in it.' },
  { key: 'vreach', name: 'Far Reach', cost: 150, flux: 150, blurb: 'Tuners and Choirmasters cast 3 m further', at: 'songarchive', say: 'Far Reach learned. Tuners and Choirmasters now cast 3 m further.' },
  { key: 'vshard', name: 'Shard Launch', cost: 150, flux: 150, blurb: 'Lyres build Shards 40% faster', at: 'highbeacon', say: 'Shard Launch learned. Lyres now build Shards 40% faster.' },
  { key: 'vswift', name: 'Swift Range', cost: 150, flux: 150, blurb: 'Swifts reach 4 m further', at: 'highbeacon', say: 'Swift Range learned. Swifts now reach 4 m further.' },
];

