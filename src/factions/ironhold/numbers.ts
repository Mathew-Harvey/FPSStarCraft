// The Ironhold Charter's numbers: units, buildings, research, and what trains where. Shared code reads these through src/data.ts.
// Costs, beds, tech needs and what each ability does come from the full-depth plan (/mnt/project-files/full-depth/plan.md). Health, damage,
// range, speed, build time and ability numbers are this file's, each with the reason it was picked; the ability numbers are in I_TUNE.
import type { UnitDef, BldDef, Faction } from '../../data';

export type IKind = 'rigger' | 'linesman' | 'breacher' | 'gantry' | 'longshot' | 'patch'
  | 'hauldrone' | 'sapper' | 'dustbike' | 'piledriver' | 'hopper' | 'flakkite' | 'gadfly' | 'surveyor' | 'claimbarge'
  /** Second forms (mode switches) and things a unit leaves behind. Nobody trains these. */
  | 'piledriverset' | 'flakwalker' | 'gantryflak' | 'shaftmine' | 'staketurret';
export type IBKind = 'headframe' | 'bunkhouse' | 'depot' | 'watchpost' | 'machineshop' | 'foundry' | 'assay' | 'mast'
  | 'pumpjack' | 'twinbay' | 'labbay' | 'dugout' | 'flaktower' | 'hangar' | 'annex' | 'surveyrig' | 'bastion';
export type IUpKey = 'dmg' | 'armor' | 'dmg2' | 'armor2' | 'dmg3' | 'armor3' | 'drill' | 'beds' | 'post' | 'pay' | 'glass' | 'stitch' | 'frag' | 'servo' | 'weld' | 'buckets'
  | 'overtime' | 'hobble' | 'kitbelt' | 'hotspout' | 'quickanchor' | 'minedrill' | 'smoke' | 'rotors' | 'battery'
  | 'mdmg' | 'mdmg2' | 'mdmg3' | 'marm' | 'marm2' | 'marm3' | 'sdmg' | 'sdmg2' | 'sdmg3' | 'ghillie' | 'spotlight' | 'foreclose' | 'relocate';

/** Which research line a body's guns and plate follow: infantry (Assay Office), machines (Foundry) or ships (Signal Mast for guns, Foundry for plate). */
export type ICat = 'inf' | 'mech' | 'ship';
export const I_CAT: Partial<Record<IKind, ICat>> = {
  rigger: 'inf', linesman: 'inf', breacher: 'inf', patch: 'inf', sapper: 'inf', longshot: 'inf',
  hauldrone: 'mech', dustbike: 'mech', piledriver: 'mech', piledriverset: 'mech', gantry: 'mech', gantryflak: 'mech', flakwalker: 'mech', shaftmine: 'mech', staketurret: 'mech',
  hopper: 'ship', flakkite: 'ship', gadfly: 'ship', surveyor: 'ship', claimbarge: 'ship',
};

const U = (d: UnitDef) => d;
export const I_UNIT: Record<IKind, UnitDef> = {
  rigger: { name: 'Rigger', team: 0, hp: 45, shield: 0, speed: 4.6, eye: 1.5, headY: 1.52, bodyY: .9, rad: .66, cost: 50, time: 8, supply: 1, tags: ['soft'], quip: '"I dig holes. You point at where."', ack: ['Drill\'s warm, boss.', 'Back in the dirt.', 'Hard hat on. Mostly.'] },
  // Plan cost 50 (was 60). Health and gun unchanged: the plan made it cheaper, the cheapest rifle should stay the baseline.
  linesman: { name: 'Linesman', team: 0, hp: 60, shield: 0, speed: 4.8, eye: 1.58, headY: 1.56, bodyY: .9, rad: .66, cost: 50, time: 11, supply: 1, tags: ['soft'], hits: 'both', quip: '"Paid by the bullet. Tips welcome."', ack: ['Boss is in my head again.', 'Point me at something purple.', 'Safety\'s off. So is my shift.'] },
  // Beats plated: +6 a volley against plated (rules.ts adds it, split over the pellets in first person), about +40% against a Warden.
  breacher: { name: 'Breacher', team: 0, hp: 150, shield: 0, speed: 4.2, eye: 1.78, headY: 1.78, bodyY: 1.02, rad: .8, cost: 100, flux: 25, time: 15, supply: 2, tags: ['plated'], quip: '"I knock. Then there is no door."', ack: ['Shield up. Manners down.', 'Somebody order a wall?', 'Big gun, short walk.'] },
  gantry: { name: 'Gantry', team: 0, hp: 500, shield: 0, speed: 3.9, eye: 2.95, headY: 3.2, bodyY: 2.1, rad: 1.25, cost: 300, flux: 200, time: 30, supply: 6, tags: ['plated', 'machine', 'huge'], hits: 'both', quip: '"Two legs, two cannons, zero paperwork."', ack: ['Walker\'s yours. Mind the paint.', 'Stomping on your say-so.', 'Big rig, bigger invoice.'] },
  longshot: { name: 'Longshot', team: 0, hp: 60, shield: 0, speed: 4.7, eye: 1.58, headY: 1.56, bodyY: .9, rad: .66, cost: 150, flux: 125, time: 20, supply: 2, energy: 200, tags: ['soft'], hits: 'both', quip: '"I bill by the mile."', ack: ['Scope\'s yours. Breathe out first.', 'One round, one invoice.', 'I was comfortable back there.'] },
  patch: { name: 'Patch', team: 0, hp: 70, shield: 0, speed: 5.0, eye: 1.55, headY: 1.56, bodyY: .9, rad: .66, cost: 75, flux: 50, time: 13, supply: 1, energy: 200, tags: ['soft'], quip: '"Hold still. This is mostly glue."', ack: ['Clinic is open.', 'Who\'s leaking?', 'I do stitches and rivets.'] },

  // Called down from a Survey Rig for 50 of its energy, mines twice as fast for 64 s, then flies off. Free beds, no gun.
  hauldrone: U({ name: 'Haul Drone', team: 0, hp: 60, shield: 0, speed: 4.4, eye: 1.2, headY: 1.3, bodyY: .8, rad: .7, cost: 0, time: 0, supply: 0, worker: true, tags: ['machine'], hits: 'ground', quip: '"Rented. Return by sundown."', ack: ['Bin\'s empty.', 'Hauling.', 'Clock\'s running.'] } as UnitDef),
  // A light body like a Linesman, a weaker carbine, and the two charges that are its real job.
  sapper: { name: 'Sapper', team: 0, hp: 55, shield: 0, speed: 4.9, eye: 1.55, headY: 1.56, bodyY: .9, rad: .66, cost: 75, flux: 25, time: 14, supply: 1, tags: ['soft'], quip: '"Stand back. Further. Further than that."', ack: ['Cord\'s on the reel.', 'Mind where you step.', 'Something wants knocking down?'] },
  // Fast and fragile: Linesman speed times 1.5, health between a Linesman and a Breacher. The flame does +7 a puff to soft bodies.
  dustbike: { name: 'Dustbike', team: 0, hp: 90, shield: 0, speed: 7.2, eye: 1.4, headY: 1.5, bodyY: .85, rad: .9, cost: 100, time: 15, supply: 2, tags: ['machine'], bonus: { soft: 7 }, quip: '"Two wheels, one tank, no brakes."', ack: ['Revving.', 'Point me at the soft ones.', 'Spout\'s lit.'] },
  // Moves as a light tank, anchors as artillery (second form below). Plated and a machine, so Breachers and Jam both answer it.
  piledriver: { name: 'Pile Driver', team: 0, hp: 175, shield: 0, speed: 4.0, eye: 2.0, headY: 2.0, bodyY: 1.1, rad: 1.3, cost: 150, flux: 125, time: 24, supply: 3, tags: ['plated', 'machine'], armour: 1, bonus: { plated: 10 }, quip: '"Plant it. Wait. Flatten it."', ack: ['Stakes are greased.', 'Where do I drive in?', 'Tracks rolling.'] },
  piledriverset: { name: 'Pile Driver (anchored)', team: 0, hp: 175, shield: 0, speed: 0, eye: 2.4, headY: 2.0, bodyY: 1.1, rad: 1.3, cost: 150, flux: 125, time: 24, supply: 3, tags: ['plated', 'machine'], armour: 1, bonus: { plated: 25 }, quip: '', ack: ['Anchored.', 'Stakes are down.', 'Give me a spot.'] },
  // Transport: carries 8 beds, no gun.
  hopper: { name: 'Hopper', team: 0, hp: 150, shield: 0, speed: 7.0, eye: 2.0, headY: 2.2, bodyY: 1.6, rad: 1.5, cost: 100, flux: 100, time: 20, supply: 2, air: true, cargo: 8, tags: ['plated', 'machine'], armour: 1, quip: '"Eight seats. Belts optional."', ack: ['Doors open.', 'Climb in.', 'Where to, boss?'] },
  // Air fighter: rockets that only reach the air, +8 against huge (carriers, big fliers). Lands as a walker with a short gun.
  flakkite: { name: 'Flak Kite', team: 0, hp: 135, shield: 0, speed: 6.4, eye: 2.0, headY: 2.0, bodyY: 1.4, rad: 1.2, cost: 150, flux: 75, time: 20, supply: 2, air: true, tags: ['plated', 'machine'], hits: 'air', bonus: { huge: 8 }, quip: '"Anything with wings owes me money."', ack: ['Kite\'s up.', 'Sky\'s mine.', 'Rockets warm.'] },
  flakwalker: { name: 'Flak Kite (landed)', team: 0, hp: 135, shield: 0, speed: 4.3, eye: 2.2, headY: 2.4, bodyY: 1.4, rad: 1.1, cost: 150, flux: 75, time: 20, supply: 2, tags: ['plated', 'machine'], hits: 'ground', quip: '', ack: ['Boots on the dirt.', 'Walking.', 'Short gun, short temper.'] },
  // Gunship: two guns down at ground bodies. Cloaks with energy.
  gadfly: { name: 'Gadfly', team: 0, hp: 140, shield: 0, speed: 6.6, eye: 2.0, headY: 2.0, bodyY: 1.4, rad: 1.2, cost: 150, flux: 100, time: 24, supply: 3, air: true, energy: 200, tags: ['soft', 'machine'], hits: 'ground', quip: '"You won\'t see me. That\'s the point."', ack: ['Rotors hot.', 'Going quiet.', 'Mark it.'] },
  // Flying detector and caster. No gun.
  surveyor: { name: 'Surveyor', team: 0, hp: 140, shield: 0, speed: 5.4, eye: 2.0, headY: 2.0, bodyY: 1.4, rad: 1.1, cost: 100, flux: 150, time: 22, supply: 2, air: true, energy: 200, detect: 11, tags: ['soft', 'machine'], quip: '"I measure things. Then I bill them."', ack: ['Theodolite\'s level.', 'Marking it.', 'I see you. All of you.'] },
  // Capital ship: thick, armoured, two gun decks (ground and air), and two big spells.
  claimbarge: { name: 'Claim Barge', team: 0, hp: 550, shield: 0, speed: 3.0, eye: 4.0, headY: 4.2, bodyY: 3.0, rad: 2.6, cost: 400, flux: 300, time: 50, supply: 6, air: true, energy: 200, tags: ['plated', 'machine', 'huge'], armour: 3, hits: 'both', quip: '"This land is now under new management."', ack: ['Barge is moving.', 'Paperwork\'s ready.', 'Reading them their rights.'] },
  // Gantry in flak mode: the cannons swap to bursting shells that reach the air and nothing on the ground.
  gantryflak: { name: 'Gantry (flak)', team: 0, hp: 500, shield: 0, speed: 3.9, eye: 2.95, headY: 3.2, bodyY: 2.1, rad: 1.25, cost: 300, flux: 200, time: 30, supply: 6, tags: ['plated', 'machine', 'huge'], hits: 'air', quip: '', ack: ['Flak loaded.', 'Watching the sky.', 'Air guns up.'] },
  // A Sapper's mine: dug in, unseen, goes off at the first foe within 5 m. Not trained.
  shaftmine: { name: 'Shaft Mine', team: 0, hp: 30, shield: 0, speed: 0, eye: .3, headY: .3, bodyY: .15, rad: .5, cost: 0, time: 0, supply: 0, cloak: true, tags: ['machine'], quip: '', ack: [''] },
  // A Surveyor's Stake Gun turret: 10 s of fire, then it falls over.
  staketurret: { name: 'Stake Gun', team: 0, hp: 120, shield: 0, speed: 0, eye: 1.0, headY: 1.0, bodyY: .6, rad: .6, cost: 0, time: 0, supply: 0, tags: ['machine'], armour: 1, hits: 'ground', quip: '', ack: [''] },
};

export const I_BLD: Record<IBKind, BldDef> = {
  headframe: { name: 'Headframe', hp: 2400, hx: 6.6, hz: 4.6, h: 5, cost: 400, time: 50, blurb: 'A new base: Riggers bank ore here' },
  bunkhouse: { name: 'Bunkhouse', hp: 1500, hx: 3.9, hz: 3.0, h: 2.8, cost: 150, time: 14, blurb: 'Trains your soldiers' },
  depot: { name: 'Depot', hp: 800, hx: 2.8, hz: 2.6, h: 4.6, cost: 100, time: 9, blurb: 'Eight more beds. Sinks into the ground so your own crew walk over it' },
  pumpjack: { name: 'Pump Jack', hp: 750, hx: 1.6, hz: 1.6, h: 5.5, cost: 75, time: 10, blurb: 'Goes on a Flux vent: Riggers carry Flux from it' },
  twinbay: { name: 'Twin Bay', hp: 500, hx: 1.6, hz: 1.6, h: 2.6, cost: 50, flux: 50, time: 8, blurb: 'Add-on: the building trains two at once' },
  labbay: { name: 'Lab Bay', hp: 500, hx: 1.6, hz: 1.6, h: 3.2, cost: 50, flux: 25, time: 8, blurb: 'Add-on: heavier units and that building\'s research' },
  watchpost: { name: 'Watchpost', hp: 550, hx: 1.6, hz: 1.6, h: 8, cost: 100, time: 11, blurb: 'Gun tower', needs: ['bunkhouse'] },
  dugout: { name: 'Dugout', hp: 600, hx: 2.4, hz: 2.4, h: 2.2, cost: 100, time: 12, blurb: 'Four beds of crew shoot from inside. Sells back for 75%', needs: ['bunkhouse'], cargo: 4, armour: 1 },
  assay: { name: 'Assay Office', hp: 1400, hx: 3.6, hz: 3.2, h: 4.2, cost: 125, time: 14, blurb: 'Infantry guns and plate', needs: ['bunkhouse'] },
  flaktower: { name: 'Flak Tower', hp: 500, hx: 1.5, hz: 1.5, h: 7, cost: 100, time: 12, blurb: 'Shoots fliers and sees unseen bodies', needs: ['assay'], detect: 11, hits: 'air', armour: 1 },
  machineshop: { name: 'Machine Shop', hp: 1900, hx: 4.6, hz: 3.6, h: 4, cost: 150, flux: 100, time: 20, blurb: 'Dustbikes and, with a Lab Bay, Pile Drivers', needs: ['bunkhouse'] },
  foundry: { name: 'Foundry', hp: 2000, hx: 4.4, hz: 3.8, h: 6, cost: 150, flux: 100, time: 22, blurb: 'Gantry walkers, machine guns and plate', needs: ['machineshop'] },
  hangar: { name: 'Hangar', hp: 1800, hx: 4.8, hz: 4.0, h: 5, cost: 150, flux: 100, time: 22, blurb: 'Hoppers, Flak Kites and, with a Lab Bay, the bigger fliers', needs: ['machineshop'] },
  mast: { name: 'Signal Mast', hp: 1100, hx: 2.3, hz: 2.3, h: 12, cost: 150, flux: 50, time: 22, blurb: 'Longshots, Ghillie, ship guns, Deep Charges', needs: ['assay'] },
  annex: { name: 'Head Office Annex', hp: 1500, hx: 3.6, hz: 3.6, h: 6, cost: 150, flux: 150, time: 26, blurb: 'Claim Barges, Foreclosure, Relocate', needs: ['hangar'] },
  // The Headframe's two second forms. Same footprint, bought from the Headframe itself.
  surveyrig: { name: 'Survey Rig', hp: 2400, hx: 6.6, hz: 4.6, h: 6, cost: 150, time: 25, blurb: 'Scans the map and calls Haul Drones' },
  bastion: { name: 'Bastion Head', hp: 3000, hx: 6.6, hz: 4.6, h: 6, cost: 150, flux: 150, time: 36, blurb: 'Armoured, with a heavy gun', armour: 3 },
};
export const I_BUILDABLE: IBKind[] = ['bunkhouse', 'depot', 'pumpjack', 'watchpost', 'dugout', 'machineshop', 'assay', 'flaktower', 'foundry', 'hangar', 'mast', 'annex', 'headframe'];
export const I_FACTION: Faction = { name: 'Ironhold Charter', short: 'Ironhold', hq: 'headframe', worker: 'rigger', supply: 'depot', builds: I_BUILDABLE, voice: 'Quartermaster', squad: 'Alpha', lead: 'linesman', ore: 'ore', barracks: 'bunkhouse' };
export const I_TRAINS: Partial<Record<IBKind, IKind[]>> = {
  headframe: ['rigger'], surveyrig: ['rigger'], bastion: ['rigger'],
  bunkhouse: ['linesman', 'breacher', 'sapper', 'patch', 'longshot'],
  machineshop: ['dustbike', 'piledriver'], foundry: ['gantry'],
  hangar: ['hopper', 'flakkite', 'gadfly', 'surveyor', 'claimbarge'],
};
/** A building of the side's that must stand before a kind can be trained (on top of the Lab Bay on the training building, see LAB). */
export const I_NEEDS: Partial<Record<IKind, IBKind>> = { patch: 'assay', longshot: 'mast', claimbarge: 'annex' };
/** Kinds that need a Lab Bay on the building that trains them. */
export const LAB: IKind[] = ['breacher', 'sapper', 'patch', 'longshot', 'piledriver', 'gadfly', 'surveyor', 'claimbarge'];
/** Buildings that take an add-on, and the add-ons. A building has at most one. */
export const HOSTS: IBKind[] = ['bunkhouse', 'machineshop', 'hangar'];
export const ADDONS: IBKind[] = ['twinbay', 'labbay'];
/** Buildings that pack onto skids and crawl to a new spot. */
export const CRAWLERS: IBKind[] = ['headframe', 'surveyrig', 'bastion', 'bunkhouse', 'machineshop', 'hangar'];
/** Bodies a Rigger can repair: everything with the machine tag. */

/** Research. `at` is the building that sells it, and `needs` is the research that has to be bought first. `cat` is the line of bodies a level
 *  applies to (infantry, machines, ships). `lab` research is sold by a Lab Bay bolted onto that building. `req` buildings must stand too. */
export const I_UPGRADES: { key: IUpKey; name: string; cost: number; blurb: string; at: IBKind; say: string; needs?: IUpKey; line?: 'atk' | 'arm' | 'shd'; /** A machine or ship level: kept off A's team-wide chains (which stay infantry) and applied by these rules. */ mline?: 'atk' | 'arm'; lvl?: number; pct?: number; flux?: number; cat?: ICat; lab?: boolean; req?: IBKind[] }[] = [
  // Infantry levels at the Assay Office. Levels 2 and 3 need the Signal Mast standing.
  { key: 'dmg', line: 'atk', lvl: 1, cat: 'inf', name: 'Infantry Guns 1', cost: 100, flux: 100, blurb: '+25% infantry gun damage', at: 'assay', say: 'Infantry Guns, level one. Hollow points for everyone.' },
  { key: 'armor', line: 'arm', lvl: 1, cat: 'inf', name: 'Infantry Plate 1', cost: 100, flux: 100, blurb: '+25% infantry health', at: 'assay', say: 'Infantry Plate, level one. Everyone walks heavier.' },
  { key: 'dmg2', line: 'atk', lvl: 2, cat: 'inf', name: 'Infantry Guns 2', cost: 175, flux: 175, blurb: '+20% infantry gun damage', at: 'assay', needs: 'dmg', req: ['mast'], say: 'Infantry Guns, level two. Tungsten cores. Each one costs more than you do.' },
  { key: 'armor2', line: 'arm', lvl: 2, cat: 'inf', name: 'Infantry Plate 2', cost: 175, flux: 175, blurb: '+20% infantry health', at: 'assay', needs: 'armor', req: ['mast'], say: 'Infantry Plate, level two. It stops more than it used to.' },
  { key: 'dmg3', line: 'atk', lvl: 3, cat: 'inf', name: 'Infantry Guns 3', cost: 250, flux: 250, blurb: '+15% infantry gun damage', at: 'assay', needs: 'dmg2', req: ['mast'], say: 'Infantry Guns, level three. Head office signed for these in person.' },
  { key: 'armor3', line: 'arm', lvl: 3, cat: 'inf', name: 'Infantry Plate 3', cost: 250, flux: 250, blurb: '+15% infantry health', at: 'assay', needs: 'armor2', req: ['mast'], say: 'Infantry Plate, level three. You are now worth more than the safe.' },
  // Machine guns and plate at the Foundry. Plate covers ships too.
  { key: 'mdmg', mline: 'atk', lvl: 1, cat: 'mech', name: 'Machine Guns 1', cost: 100, flux: 100, blurb: '+25% damage for walkers, bikes and Pile Drivers', at: 'foundry', say: 'Machine Guns, level one. Bigger bores on everything with an engine.' },
  { key: 'mdmg2', mline: 'atk', lvl: 2, cat: 'mech', name: 'Machine Guns 2', cost: 175, flux: 175, blurb: '+20% machine damage', at: 'foundry', needs: 'mdmg', say: 'Machine Guns, level two.' },
  { key: 'mdmg3', mline: 'atk', lvl: 3, cat: 'mech', name: 'Machine Guns 3', cost: 250, flux: 250, blurb: '+15% machine damage', at: 'foundry', needs: 'mdmg2', say: 'Machine Guns, level three. The barrels glow now.' },
  { key: 'marm', mline: 'arm', lvl: 1, cat: 'mech', name: 'Machine and Ship Plate 1', cost: 100, flux: 100, blurb: '+25% health for machines and ships', at: 'foundry', say: 'Machine and Ship Plate, level one. Thicker panels on everything that rolls or flies.' },
  { key: 'marm2', mline: 'arm', lvl: 2, cat: 'mech', name: 'Machine and Ship Plate 2', cost: 175, flux: 175, blurb: '+20% machine and ship health', at: 'foundry', needs: 'marm', say: 'Machine and Ship Plate, level two.' },
  { key: 'marm3', mline: 'arm', lvl: 3, cat: 'mech', name: 'Machine and Ship Plate 3', cost: 250, flux: 250, blurb: '+15% machine and ship health', at: 'foundry', needs: 'marm2', say: 'Machine and Ship Plate, level three. Even the paint is armoured.' },
  // Ship guns at the Signal Mast.
  { key: 'sdmg', mline: 'atk', lvl: 1, cat: 'ship', name: 'Ship Guns 1', cost: 100, flux: 100, blurb: '+25% damage for fliers', at: 'mast', say: 'Ship Guns, level one.' },
  { key: 'sdmg2', mline: 'atk', lvl: 2, cat: 'ship', name: 'Ship Guns 2', cost: 175, flux: 175, blurb: '+20% flier damage', at: 'mast', needs: 'sdmg', say: 'Ship Guns, level two.' },
  { key: 'sdmg3', mline: 'atk', lvl: 3, cat: 'ship', name: 'Ship Guns 3', cost: 250, flux: 250, blurb: '+15% flier damage', at: 'mast', needs: 'sdmg2', say: 'Ship Guns, level three.' },
  // The Headframe.
  { key: 'drill', name: 'Diamond Bits', cost: 100, blurb: 'Riggers dig 30% faster', at: 'headframe', say: 'Diamond Bits fitted. The rock has filed a complaint.' },
  { key: 'buckets', name: 'Deep Buckets', cost: 150, flux: 50, blurb: 'Riggers carry 10 ore a trip', at: 'headframe', needs: 'drill', say: 'Deep Buckets. Same back, more rock.' },
  // Lab Bay on a Bunkhouse.
  { key: 'overtime', lab: true, name: 'Overtime', cost: 100, flux: 100, blurb: 'Linesmen can trade 10 health for 11 s of faster fire and feet (key Q)', at: 'bunkhouse', say: 'Overtime approved. Nobody gets paid for it.' },
  { key: 'hobble', lab: true, name: 'Hobble Shells', cost: 50, flux: 50, blurb: 'Breacher hits slow what they hit for a second', at: 'bunkhouse', say: 'Hobble Shells loaded. They hit you in the knees.' },
  { key: 'kitbelt', lab: true, name: 'Kit Belts', cost: 100, flux: 100, blurb: 'Linesmen and Sappers get +15 health', at: 'bunkhouse', say: 'Kit Belts on. More pouches, more padding.' },
  // Lab Bay on a Machine Shop.
  { key: 'hotspout', lab: true, name: 'Hot Spout', cost: 150, flux: 150, blurb: 'Dustbike flame does +5 to soft bodies and reaches 2 m further', at: 'machineshop', say: 'Hot Spout fitted. The bikes burn blue now.' },
  { key: 'quickanchor', lab: true, name: 'Quick Anchor', cost: 100, flux: 100, blurb: 'Pile Drivers anchor and lift in 1.5 s', at: 'machineshop', say: 'Quick Anchor. The stakes go in before you finish swearing.' },
  { key: 'minedrill', lab: true, name: 'Mine Drill', cost: 75, flux: 75, blurb: 'Sappers dig a Shaft Mine in 1 s and keep four at once', at: 'machineshop', say: 'Mine Drill issued. Holes, faster.' },
  // Lab Bay on a Hangar.
  { key: 'smoke', lab: true, name: 'Smoke Cloak', cost: 100, flux: 100, blurb: 'Gadflies can hide in smoke (key Q)', at: 'hangar', say: 'Smoke Cloak fitted. The Gadflies vanish on cue.' },
  { key: 'rotors', lab: true, name: 'Fast Rotors', cost: 150, flux: 150, blurb: 'Gadflies and Hoppers fly 20% faster', at: 'hangar', say: 'Fast Rotors. Hold on to your hats.' },
  { key: 'battery', lab: true, name: 'Big Battery', cost: 150, flux: 150, blurb: 'Surveyors, Gadflies and Claim Barges start with 25 more energy and hold 50 more', at: 'hangar', say: 'Big Battery. More juice, more tricks.' },
  // Signal Mast and Annex.
  { key: 'ghillie', name: 'Ghillie', cost: 150, flux: 150, blurb: 'Longshots can go unseen (key Q, uses energy)', at: 'mast', say: 'Ghillie suits issued. Try not to lose them.' },
  { key: 'foreclose', name: 'Foreclosure', cost: 150, flux: 150, blurb: 'Claim Barges can fire a 240-damage shell (key Q)', at: 'annex', say: 'Foreclosure papers signed. The Barges can serve them now.' },
  { key: 'relocate', name: 'Relocate', cost: 150, flux: 150, blurb: 'Claim Barges can jump to any spot your side can see (key E)', at: 'annex', say: 'Relocate cleared. The Barges can be anywhere by Tuesday.' },
  // Older research kept: no plan row replaces these.
  { key: 'spotlight', name: 'Spotlight', cost: 100, flux: 50, blurb: 'Watchposts see unseen bodies within 11 m', at: 'assay', say: 'Spotlights on the Watchposts. Nothing hides from a lamp.' },
  { key: 'post', name: 'Twin Mounts', cost: 125, blurb: 'Watchposts fire faster and reach further', at: 'assay', say: 'Twin Mounts on every Watchpost. Twice the noise.' },
  { key: 'pay', name: 'Hazard Pay', cost: 100, flux: 100, blurb: 'Infantry move 12% faster', at: 'assay', say: 'Hazard Pay approved. Watch them run now.' },
  { key: 'frag', name: 'Short Fuses', cost: 100, blurb: 'Grenades come back in 5 seconds', at: 'assay', say: 'Short Fuses issued. Count faster.' },
  { key: 'glass', name: 'Long Glass', cost: 125, flux: 75, blurb: 'Longshots reach further and hit 15% harder', at: 'mast', say: 'Long Glass ground and fitted. They can see your mistakes from here.' },
  { key: 'stitch', name: 'Field Stitches', cost: 125, blurb: 'Patches heal 60% faster', at: 'assay', say: 'Field Stitches. Faster, and nearly as tidy.' },
  { key: 'servo', name: 'Servo Legs', cost: 150, flux: 150, blurb: 'Gantry walks 20% faster and stomps more often', at: 'foundry', say: 'Servo Legs in the walker. It skips now. Nobody likes it.' },
  { key: 'weld', name: 'Field Welders', cost: 200, flux: 100, blurb: 'Everyone out of a fight slowly heals', at: 'mast', say: 'Field Welders on call. Stand still and get better.' },
];

/** Ability and system numbers. Every one is read at the time it is used, so the balance stream can turn them in a test. */
export const I_TUNE = {
  // Overtime: health it costs, seconds, and how much faster fire and feet get.
  overtime: { hp: 10, t: 11, fire: 1.5, pace: 1.5 },
  // Hobble Shells: the slow and how long.
  hobble: { n: .5, t: 1.1 },
  // Painkiller: energy, flat armour added to every hit and seconds.
  painkiller: { energy: 50, armour: 2, t: 8, range: 9 },
  // Shaft Mine: seconds to dig in, how close a foe sets it off, blast damage and radius, mines one Sapper keeps, cooldown.
  mine: { dig: 2.5, digQuick: 1, trip: 5, dmg: 90, r: 4, keep: 3, keepDrill: 4, cd: 6 },
  // Satchel: fuse seconds, damage to the building, cooldown, reach.
  satchel: { fuse: 2.5, dmg: 160, cd: 22, range: 3 },
  // Dustbike flame: reach, cone half-width, seconds between puffs, damage a puff. Kick Start: seconds, speed, cooldown.
  flame: { range: 7, hot: 9, width: .5, cd: .35, dmg: 8, hotDmg: 5 }, kick: { t: 2.5, pace: 1.7, cd: 18 },
  // Pile Driver: on the move and anchored (min and max range, splash radius, damage, seconds between shells), anchor time.
  pile: { range: 18, dmg: 15, cd: 1.1, min: 13, max: 30, splash: 2.6, setDmg: 42, setCd: 2.8, anchor: 3, quick: 1.5 },
  // Hopper Afterburn, Flak Kite land/take off seconds, Gadfly cloak drain, Gantry flak switch.
  afterburn: { t: 4, pace: 1.8, cd: 14 }, land: 2, cloak: { energy: 25, drain: 1.3 }, flakSwitch: 2,
  // Surveyor: Stake Gun (energy, seconds), Jam (energy, seconds, range), Flare (energy, radius, seconds, range).
  stake: { energy: 50, t: 10, range: 6 }, jam: { energy: 75, t: 6, range: 9 }, flare: { energy: 75, r: 3.5, t: 8, range: 10 },
  // Longshot: Ghillie (energy to start, drain a second), Tranq (energy, radius, range), Deep Charge (cast seconds, damage, radius).
  ghillie: { energy: 25, drain: .9 }, tranq: { energy: 75, r: 2.5, range: 12, burn: 100 }, deep: { cast: 14, dmg: 300, r: 8, range: 12, cost: [100, 100] as [number, number] },
  // Claim Barge: Foreclosure (energy, charge, damage, range), Relocate (charge, cooldown).
  foreclose: { energy: 125, cast: 3, dmg: 240, range: 18 }, relocate: { cast: 4, cd: 70 },
  // HQ forms: Survey Rig energy cap, regen, a scan (energy, radius, seconds), a Haul Drone (energy, seconds alive). Bastion gun.
  rig: { max: 200, start: 50, scan: 50, scanR: 18, scanT: 12, drone: 50, droneT: 64 }, bastion: { range: 18, dmg: 30, cd: 1.1 },
  // Crawling speed (walking pace), Dugout sell-back share, Rigger repair speed (share of health a second) and ore per 100 health.
  crawl: 3, sell: .75, repair: .06, repairOre: 12,
};
