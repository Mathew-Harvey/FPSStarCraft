// The Ironhold Charter's numbers: units, buildings, research, and what trains where. Shared code reads these through src/data.ts.
import type { UnitDef, BldDef, Faction } from '../../data';

export type IKind = 'rigger' | 'linesman' | 'breacher' | 'gantry' | 'longshot' | 'patch';
export type IBKind = 'headframe' | 'bunkhouse' | 'depot' | 'watchpost' | 'machineshop' | 'foundry' | 'assay' | 'mast';
export type IUpKey = 'dmg' | 'armor' | 'dmg2' | 'armor2' | 'dmg3' | 'armor3' | 'drill' | 'beds' | 'post' | 'pay' | 'glass' | 'stitch' | 'frag' | 'servo' | 'weld' | 'buckets';

export const I_UNIT: Record<IKind, UnitDef> = {
  rigger: { name: 'Rigger', team: 0, hp: 45, shield: 0, speed: 4.6, eye: 1.5, headY: 1.52, bodyY: .9, rad: .66, cost: 50, time: 8, supply: 1, quip: '"I dig holes. You point at where."', ack: ['Drill\'s warm, boss.', 'Back in the dirt.', 'Hard hat on. Mostly.'] },
  linesman: { name: 'Linesman', team: 0, hp: 60, shield: 0, speed: 4.8, eye: 1.58, headY: 1.56, bodyY: .9, rad: .66, cost: 60, time: 11, supply: 1, quip: '"Paid by the bullet. Tips welcome."', ack: ['Boss is in my head again.', 'Point me at something purple.', 'Safety\'s off. So is my shift.'] },
  breacher: { name: 'Breacher', team: 0, hp: 150, shield: 0, speed: 4.2, eye: 1.78, headY: 1.78, bodyY: 1.02, rad: .8, cost: 110, time: 15, supply: 2, quip: '"I knock. Then there is no door."', ack: ['Shield up. Manners down.', 'Somebody order a wall?', 'Big gun, short walk.'] },
  gantry: { name: 'Gantry', team: 0, hp: 420, shield: 0, speed: 3.9, eye: 2.95, headY: 3.2, bodyY: 2.1, rad: 1.25, cost: 220, time: 22, supply: 4, quip: '"Two legs, two cannons, zero paperwork."', ack: ['Walker\'s yours. Mind the paint.', 'Stomping on your say-so.', 'Big rig, bigger invoice.'] },
  longshot: { name: 'Longshot', team: 0, hp: 50, shield: 0, speed: 4.7, eye: 1.58, headY: 1.56, bodyY: .9, rad: .66, cost: 120, time: 16, supply: 2, quip: '"I bill by the mile."', ack: ['Scope\'s yours. Breathe out first.', 'One round, one invoice.', 'I was comfortable back there.'] },
  patch: { name: 'Patch', team: 0, hp: 70, shield: 0, speed: 5.0, eye: 1.55, headY: 1.56, bodyY: .9, rad: .66, cost: 90, time: 13, supply: 1, quip: '"Hold still. This is mostly glue."', ack: ['Clinic is open.', 'Who\'s leaking?', 'I do stitches and rivets.'] },
};
export const I_BLD: Record<IBKind, BldDef> = {
  headframe: { name: 'Headframe', hp: 2400, hx: 6.6, hz: 4.6, h: 5, cost: 400, time: 50, blurb: 'A new base: Riggers bank ore here' },
  bunkhouse: { name: 'Bunkhouse', hp: 1500, hx: 3.9, hz: 3.0, h: 2.8, cost: 150, time: 14, blurb: 'Trains your soldiers' },
  depot: { name: 'Depot', hp: 800, hx: 2.8, hz: 2.6, h: 4.6, cost: 100, time: 9, blurb: 'Eight more beds' },
  watchpost: { name: 'Watchpost', hp: 550, hx: 1.6, hz: 1.6, h: 8, cost: 125, time: 11, blurb: 'Gun tower', needs: ['bunkhouse'] },
  machineshop: { name: 'Machine Shop', hp: 1900, hx: 4.6, hz: 3.6, h: 4, cost: 150, time: 16, blurb: 'Breachers, Patches, first upgrades', needs: ['bunkhouse'] },
  foundry: { name: 'Foundry', hp: 2000, hx: 4.4, hz: 3.8, h: 6, cost: 200, time: 20, blurb: 'Gantry walkers, second upgrades', needs: ['machineshop'] },
  assay: { name: 'Assay Office', hp: 1400, hx: 3.6, hz: 3.2, h: 4.2, cost: 125, time: 14, blurb: 'Longshots, infantry research', needs: ['bunkhouse'] },
  mast: { name: 'Signal Mast', hp: 1100, hx: 2.3, hz: 2.3, h: 12, cost: 250, time: 22, blurb: 'Third upgrades, top research', needs: ['foundry', 'assay'] },
};
export const I_BUILDABLE: IBKind[] = ['bunkhouse', 'depot', 'watchpost', 'machineshop', 'assay', 'foundry', 'mast', 'headframe'];
export const I_FACTION: Faction = { name: 'Ironhold Charter', short: 'Ironhold', hq: 'headframe', worker: 'rigger', supply: 'depot', builds: I_BUILDABLE, voice: 'Quartermaster', squad: 'Alpha', lead: 'linesman', ore: 'ore', barracks: 'bunkhouse' };
export const I_TRAINS: Partial<Record<IBKind, IKind[]>> = { headframe: ['rigger'], bunkhouse: ['linesman', 'breacher', 'patch', 'longshot'], foundry: ['gantry'] };
export const I_NEEDS: Partial<Record<IKind, IBKind>> = { breacher: 'machineshop', patch: 'machineshop', longshot: 'assay' };
/** Research. `at` is the building that sells it, and `needs` is the research that has to be bought first. */
export const I_UPGRADES: { key: IUpKey; name: string; cost: number; blurb: string; at: IBKind; say: string; needs?: IUpKey; line?: 'atk' | 'arm' | 'shd'; lvl?: number; pct?: number; flux?: number }[] = [
  { key: 'dmg', line: 'atk', lvl: 1, name: 'Hollow Points', cost: 150, blurb: '+25% gun damage', at: 'machineshop', say: 'Hollow Points issued. Try to hit something with them.' },
  { key: 'armor', line: 'arm', lvl: 1, name: 'Plating', cost: 150, blurb: '+25% health', at: 'machineshop', say: 'Plating bolted on. Everyone walk heavier.' },
  { key: 'dmg2', line: 'atk', lvl: 2, name: 'Tungsten Core', cost: 200, blurb: '+20% gun damage', at: 'foundry', needs: 'dmg', say: 'Tungsten Core rounds. Each one costs more than you do.' },
  { key: 'armor2', line: 'arm', lvl: 2, name: 'Reactive Plating', cost: 200, blurb: '+20% health', at: 'foundry', needs: 'armor', say: 'Reactive Plating fitted. It bites back, allegedly.' },
  { key: 'dmg3', line: 'atk', lvl: 3, name: 'Charter Specials', cost: 250, blurb: '+15% gun damage', at: 'mast', needs: 'dmg2', say: 'Charter Specials. Head office signed for these in person.' },
  { key: 'armor3', line: 'arm', lvl: 3, name: 'Vault Plate', cost: 250, blurb: '+15% health', at: 'mast', needs: 'armor2', say: 'Vault Plate. You are now worth more than the safe.' },
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
];
