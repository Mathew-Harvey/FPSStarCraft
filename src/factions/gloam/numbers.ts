// The Gloam's numbers. Their two signature systems, Buds that ripen into units at a Mother Cap and Bloom, the living carpet their
// buildings spread and their units run faster and heal on, are in rules.ts and bloom.ts.
import type { Faction } from '../../data';

export type GKind = 'grazer' | 'snapper' | 'quillback' | 'blister' | 'mulcher';
export type GBKind = 'mothercap' | 'sporesac' | 'warren' | 'stinger' | 'quillgarden' | 'blisterbed' | 'tuskhollow' | 'oldgrowth';
export const GLOAM = 2;

/** Units. `pair` units hatch two to a Bud for the listed cost. Same fields as the other factions' UnitDef. */
export const G_UNIT = {
  grazer: { name: 'Grazer', team: 2, hp: 40, shield: 0, speed: 5.0, eye: .85, headY: .62, bodyY: .5, rad: .6, cost: 45, time: 7, supply: 1, quip: '"Chew. Swallow. Carry. Chew."', ack: ['Mouth is full. Of ore.', 'Back to the seam.', 'The ground tastes good here.'] },
  snapper: { name: 'Snapper', team: 2, hp: 50, shield: 0, speed: 6.6, eye: .78, headY: .64, bodyY: .5, rad: .5, cost: 25, time: 6, supply: .5, quip: '"Two of us. Always two."', ack: ['Teeth out.', 'Point. We bite.', 'Run, run, bite.'] },
  quillback: { name: 'Quillback', team: 2, hp: 90, shield: 0, speed: 4.6, eye: 2.05, headY: 2.0, bodyY: 1.2, rad: .7, cost: 85, time: 10, supply: 1, quip: '"Every quill finds a home."', ack: ['Bristles up.', 'Spit and stick.', 'I see a soft spot.'] },
  blister: { name: 'Blister', team: 2, hp: 30, shield: 0, speed: 6.0, eye: .9, headY: .7, bodyY: .6, rad: .55, cost: 40, time: 6, supply: .5, quip: '"Squeeze me. Go on."', ack: ['Sloshing.', 'Hold me near the walls.', 'So full. So ready.'] },
  mulcher: { name: 'Mulcher', team: 2, hp: 520, shield: 0, speed: 4.0, eye: 2.9, headY: 2.6, bodyY: 1.7, rad: 1.6, cost: 240, time: 22, supply: 4, quip: '"Everything is soil eventually."', ack: ['The old one walks.', 'Tusks low.', 'Trample on your word.'] },
};
/** Buildings. All but the Mother Cap need Bloom under them and use up the Grazer that roots them. */
export const G_BLD = {
  mothercap: { name: 'Mother Cap', hp: 2200, hx: 5.6, hz: 4.6, h: 9.8, cost: 400, time: 55, blurb: 'A new base: grows Buds, banks ore' },
  sporesac: { name: 'Spore Sac', hp: 600, hx: 2.2, hz: 2.0, h: 4.6, cost: 75, time: 12, blurb: 'Eight more beds' },
  warren: { name: 'Warren', hp: 1200, hx: 3.6, hz: 3.0, h: 4.2, cost: 150, time: 16, blurb: 'Snappers' },
  stinger: { name: 'Stinger Stalk', hp: 500, hx: 1.6, hz: 1.6, h: 8, cost: 110, time: 12, blurb: 'Defence: whips anything close', needs: ['warren'] },
  quillgarden: { name: 'Quill Garden', hp: 1300, hx: 3.6, hz: 3.1, h: 6, cost: 150, time: 18, blurb: 'Quillbacks, first research', needs: ['warren'] },
  blisterbed: { name: 'Blister Bed', hp: 1100, hx: 3.6, hz: 3.6, h: 3.4, cost: 125, time: 14, blurb: 'Blisters', needs: ['warren'] },
  tuskhollow: { name: 'Tusk Hollow', hp: 1800, hx: 4.6, hz: 3.8, h: 6, cost: 200, time: 22, blurb: 'Mulchers, second research', needs: ['quillgarden'] },
  oldgrowth: { name: 'Old Growth', hp: 1200, hx: 3.0, hz: 3.0, h: 10, cost: 250, time: 24, blurb: 'Top research', needs: ['tuskhollow', 'blisterbed'] },
};
export const G_BUILDABLE: GBKind[] = ['sporesac', 'warren', 'stinger', 'quillgarden', 'blisterbed', 'tuskhollow', 'oldgrowth', 'mothercap'];
/** Which building unlocks each unit. Units themselves are ripened from Buds at a Mother Cap. */
export const G_UNLOCK: Record<GKind, GBKind> = { grazer: 'mothercap', snapper: 'warren', quillback: 'quillgarden', blister: 'blisterbed', mulcher: 'tuskhollow' };
export const G_PAIR: Partial<Record<GKind, boolean>> = { snapper: true };

export type GUpKey = 'gfat' | 'gtongue' | 'gdmg' | 'garmor' | 'gquill' | 'glegs' | 'gsap' | 'gdmg2' | 'garmor2' | 'gcharge' | 'gdmg3' | 'garmor3' | 'gbloom' | 'ggut';
export const G_UPGRADES = [
  { key: 'gfat', name: 'Fat Buds', cost: 125, blurb: 'Mother Caps hold 4 Buds and grow them 30% faster', at: 'warren', say: 'Fat Buds. The Cap is heavy with them.' },
  { key: 'gtongue', name: 'Long Tongues', cost: 100, blurb: 'Grazers chew 30% faster', at: 'warren', say: 'Long Tongues. The rock goes down easier.' },
  { key: 'gdmg', line: 'atk', lvl: 1, name: 'Sharp Mandibles', cost: 150, blurb: '+25% damage', at: 'quillgarden', say: 'Sharp Mandibles. Everything bites deeper.' },
  { key: 'garmor', line: 'arm', lvl: 1, name: 'Thick Hide', cost: 150, blurb: '+25% health', at: 'quillgarden', say: 'Thick Hide grown over. Let them try.' },
  { key: 'gquill', name: 'Barbed Quills', cost: 125, blurb: 'Quillbacks reach further and hit 15% harder', at: 'quillgarden', say: 'Barbed Quills. They stick, and they stay.' },
  { key: 'glegs', name: 'Quick Legs', cost: 100, blurb: 'Snappers and Blisters run 15% faster', at: 'warren', say: 'Quick Legs. Catch us if you can.' },
  { key: 'gsap', name: 'Volatile Sap', cost: 125, blurb: 'Blisters burst 40% harder', at: 'blisterbed', say: 'Volatile Sap. Mind where you step.' },
  { key: 'gdmg2', line: 'atk', lvl: 2, name: 'Serrated Mandibles', cost: 200, blurb: '+20% damage', at: 'tuskhollow', needs: 'gdmg', say: 'Serrated Mandibles. Saw, then swallow.' },
  { key: 'garmor2', line: 'arm', lvl: 2, name: 'Bark Hide', cost: 200, blurb: '+20% health', at: 'tuskhollow', needs: 'garmor', say: 'Bark Hide. Old and hard.' },
  { key: 'gcharge', name: 'Bull Charge', cost: 150, blurb: 'Mulchers charge twice as often', at: 'tuskhollow', say: 'Bull Charge. The old one is restless.' },
  { key: 'gdmg3', line: 'atk', lvl: 3, name: 'Bone Mandibles', cost: 250, blurb: '+15% damage', at: 'oldgrowth', needs: 'gdmg2', say: 'Bone Mandibles. They crack steel now.' },
  { key: 'garmor3', line: 'arm', lvl: 3, name: 'Stone Hide', cost: 250, blurb: '+15% health', at: 'oldgrowth', needs: 'garmor2', say: 'Stone Hide. We are the ground.' },
  { key: 'gbloom', name: 'Deep Bloom', cost: 175, blurb: 'Bloom spreads 40% wider and heals twice as fast', at: 'oldgrowth', say: 'Deep Bloom. The carpet runs to the horizon.' },
  { key: 'ggut', name: 'Fat Gut', cost: 175, blurb: 'Grazers carry 21 ore', at: 'oldgrowth', needs: 'gtongue', say: 'Fat Gut. Bellies dragging.' },
] as { key: GUpKey; name: string; cost: number; blurb: string; at: GBKind; say: string; needs?: GUpKey; line?: 'atk' | 'arm' | 'shd'; lvl?: number; pct?: number; flux?: number; cat?: string }[];

/** Tuning the game reads. */
export const G_TUNE = {
  budEvery: 7, buds: 3, fatBuds: 4, fatK: 1.3,
  /** Bloom radius by building, metres, and how fast it spreads (m/s). */
  bloomR: { mothercap: 20, sporesac: 8, warren: 10, stinger: 7, quillgarden: 10, blisterbed: 9, tuskhollow: 11, oldgrowth: 12 } as Record<GBKind, number>,
  bloomRate: .7, bloomSpeed: 1.25, bloomHeal: 2,
  pack: 15, packFat: 21,
  bite: { snapper: 7, grazer: 5, mulcher: 30, blister: 70, gnaw: 6 },
  biteCd: { snapper: .42, grazer: .7, mulcher: 1.0 },
  quill: { dmg: 11, cd: .55, speed: 70, fan: 5, fanCd: 6 },
  blister: { r: 4.2, bld: 2 },
  pounce: { cd: 3, v: 18 },
  charge: { cd: 12, v: 16, t: .8, dmg: 45 },
  stinger: { range: 9, dmg: 18, cd: 1.1 },
};

export const G_FACTION: Faction = { name: 'The Gloam', short: 'Gloam', hq: 'mothercap', worker: 'grazer', supply: 'sporesac', builds: G_BUILDABLE, voice: 'Overgrowth', squad: 'Swarm', lead: 'snapper', ore: 'ore', barracks: 'warren' };
export const G_TRAINS: Partial<Record<GBKind, GKind[]>> = { mothercap: ['grazer', 'snapper', 'blister', 'quillback'], tuskhollow: ['mulcher'] };
