// The Gloam's numbers. Their signature systems, Buds that ripen into units at a Mother Cap and Bloom, the living carpet their buildings spread
// and their units run faster and heal on, are in rules.ts and bloom.ts. The full-depth roster (Keeper, Shellback and the rest, Cap tiers, dig
// in, tunnels) is in roster.ts, abilities.ts and tiers.ts.
//
// The plan (full-depth plan, "Rosters and tech trees") sets each kind's role, price (ore / Flux), beds and what it needs. Everything else here
// (health, armour, speed, damage, ranges, times, ability numbers) is this stream's first guess, each with its reason on the line. The balance
// stream (L) sets the final numbers.
import type { Faction, UnitDef, BldDef } from '../../data';
import type { Tag } from '../../core/combat';

export type GKind = 'grazer' | 'snapper' | 'quillback' | 'blister' | 'mulcher'
  | 'keeper' | 'shellback' | 'lobber' | 'needler' | 'smother' | 'seeder' | 'husk' | 'gnatwing' | 'bloater' | 'sower' | 'pup' | 'hooksail'
  | 'drifter' | 'lookoutsac' | 'stingerwalk' | 'puffwalk';
export type GBKind = 'mothercap' | 'sporesac' | 'warren' | 'stinger' | 'quillgarden' | 'blisterbed' | 'tuskhollow' | 'oldgrowth'
  | 'ventbladder' | 'shellpit' | 'puffball' | 'rotden' | 'wingspire' | 'tallspire' | 'deeproot' | 'tunnelroot' | 'needleden' | 'sporepod'
  | 'eldercap' | 'ancientcap';
export const GLOAM = 2;

const L: Tag[] = ['living'], LP: Tag[] = ['living', 'plated'], LH: Tag[] = ['living', 'huge'];
/** Units. `pair` units hatch two to a Bud for the listed cost. Same fields as the other factions' UnitDef, plus the engine core's (flux, tags,
 *  armour, hits, air, energy, detect, cargo). A ripened kind's cost is the whole price; ripening charges the difference. */
export const G_UNIT: Record<GKind, UnitDef> = {
  grazer: { name: 'Grazer', team: 2, hp: 40, shield: 0, speed: 5.0, eye: .85, headY: .62, bodyY: .5, rad: .6, cost: 45, time: 7, supply: 1, tags: L, quip: '"Chew. Swallow. Carry. Chew."', ack: ['Mouth is full. Of ore.', 'Back to the seam.', 'The ground tastes good here.'] },
  snapper: { name: 'Snapper', team: 2, hp: 50, shield: 0, speed: 6.6, eye: .78, headY: .64, bodyY: .5, rad: .5, cost: 25, time: 6, supply: .5, tags: L, quip: '"Two of us. Always two."', ack: ['Teeth out.', 'Point. We bite.', 'Run, run, bite.'] },
  // Was 85 ore and 1 bed; the plan makes it 100 / 50 and 2 beds. It keeps its quills and now reaches fliers (the plan: ground and air).
  quillback: { name: 'Quillback', team: 2, hp: 90, shield: 0, speed: 4.6, eye: 2.05, headY: 2.0, bodyY: 1.2, rad: .7, cost: 85, time: 10, supply: 1, tags: L, hits: 'both', quip: '"Every quill finds a home."', ack: ['Bristles up.', 'Spit and stick.', 'I see a soft spot.'] },
  blister: { name: 'Blister', team: 2, hp: 30, shield: 0, speed: 6.0, eye: .9, headY: .7, bodyY: .6, rad: .55, cost: 40, time: 6, supply: .5, tags: L, quip: '"Squeeze me. Go on."', ack: ['Sloshing.', 'Hold me near the walls.', 'So full. So ready.'] },
  // From a Bud now (needs the Tusk Hollow, tier 3) and dearer (275 / 200, 6 beds), so it gets more health and 2 armour to match the Gantry tier.
  mulcher: { name: 'Mulcher', team: 2, hp: 520, shield: 0, speed: 4.0, eye: 2.9, headY: 2.6, bodyY: 1.7, rad: 1.6, cost: 240, time: 22, supply: 4, tags: LH, quip: '"Everything is soil eventually."', ack: ['The old one walks.', 'Tusks low.', 'Trample on your word.'] },
  // Bud keeper and home defender: tough and slow off Bloom, a short spit that reaches fliers, and the energy for Seed Cap, Spore Pod and Mend.
  keeper: { name: 'Keeper', team: 2, hp: 175, shield: 0, speed: 3.4, eye: 2.1, headY: 2.0, bodyY: 1.1, rad: .9, cost: 150, time: 20, supply: 2, tags: L, armour: 1, hits: 'both', energy: 200, quip: '"Every Bud is mine to count."', ack: ['I keep them.', 'The Cap is fed.', 'Slowly. I am never far from home.'] },
  // Armoured spitter: a Breacher's weight at 100 total, 1 armour, a 13 m spit. Its trick is healing fast dug in.
  shellback: { name: 'Shellback', team: 2, hp: 145, shield: 0, speed: 4.5, eye: 1.3, headY: 1.2, bodyY: .75, rad: .8, cost: 75, flux: 25, time: 13, supply: 2, tags: LP, armour: 1, quip: '"Roll me over. I dare you."', ack: ['Shell down.', 'Spitting.', 'I can wait under the dirt.'] },
  // Ripened Shellback: a little frailer, longer reach, and the Bile Lob that breaks set-up guns and walls.
  lobber: { name: 'Lobber', team: 2, hp: 130, shield: 0, speed: 5.0, eye: 1.9, headY: 1.8, bodyY: 1.1, rad: .8, cost: 100, flux: 100, time: 9, supply: 3, tags: L, armour: 1, quip: '"Up, over, down. Splash."', ack: ['Sac is full.', 'Mark the spot.', 'Lobbing.'] },
  // Ripened Quillback: tanky, and fires only dug in, a line of spines from under the ground.
  needler: { name: 'Needler', team: 2, hp: 200, shield: 0, speed: 4.6, eye: 1.6, headY: 1.5, bodyY: .9, rad: .9, cost: 150, flux: 150, time: 14, supply: 3, tags: LP, armour: 1, quip: '"Walk over me. Please."', ack: ['Going under.', 'Spines set.', 'I wait.'] },
  // Caster: frail, all energy. Choke Spores and Rot Mind.
  smother: { name: 'Smother', team: 2, hp: 90, shield: 0, speed: 4.0, eye: 1.5, headY: 1.4, bodyY: .8, rad: .75, cost: 100, flux: 150, time: 16, supply: 2, tags: L, energy: 200, quip: '"Breathe in. Deeper."', ack: ['The spores are ready.', 'I will make them still.', 'Quietly.'] },
  // Dug-in thrower: no bite of its own; it throws Husks that walk at the foe.
  seeder: { name: 'Seeder', team: 2, hp: 160, shield: 0, speed: 4.0, eye: 1.6, headY: 1.5, bodyY: .9, rad: .95, cost: 100, flux: 75, time: 16, supply: 3, tags: L, armour: 1, quip: '"Go, little husks. Go and bite."', ack: ['Seeds are swelling.', 'Throwing.', 'From under the ground, then.'] },
  husk: { name: 'Husk', team: 2, hp: 50, shield: 0, speed: 4.6, eye: .9, headY: .8, bodyY: .5, rad: .5, cost: 0, time: 0, supply: 0, tags: L, ward: true, quip: '"..."', ack: ['...'] },
  // Fast flier: fragile for its price, quick, and its bite jumps to two more bodies.
  gnatwing: { name: 'Gnatwing', team: 2, cruise: 4.2, hp: 120, shield: 0, speed: 7.2, eye: 1.2, headY: 1.1, bodyY: .7, rad: .8, cost: 100, flux: 100, time: 16, supply: 2, tags: L, air: true, hits: 'both', quip: '"Bzzt. Bite. Bzzt."', ack: ['Wings up.', 'Zip.', 'Through the gap.'] },
  // Air fighter: tough, hits only fliers, and its acid takes 2 armour off what it hits for 10 s.
  bloater: { name: 'Bloater', team: 2, cruise: 5.0, hp: 200, shield: 0, speed: 6.0, eye: 1.6, headY: 1.5, bodyY: 1.0, rad: 1.1, cost: 150, flux: 100, time: 18, supply: 2, tags: L, armour: 2, air: true, hits: 'air', bonus: { huge: 6 }, quip: '"Pop goes the sky."', ack: ['Full of acid.', 'Up, up.', 'Point me at the fliers.'] },
  // Ripened Bloater: slow, high, drops Pups on the ground below from 10 m.
  sower: { name: 'Sower', team: 2, cruise: 5.6, hp: 260, shield: 0, speed: 3.0, eye: 1.9, headY: 1.8, bodyY: 1.2, rad: 1.4, cost: 300, flux: 250, time: 20, supply: 4, tags: LH, armour: 1, air: true, hits: 'ground', quip: '"My children are hungry."', ack: ['Dropping.', 'The litter is ready.', 'Below me, everything.'] },
  pup: { name: 'Pup', team: 2, hp: 20, shield: 0, speed: 6.4, eye: .6, headY: .5, bodyY: .35, rad: .4, cost: 0, time: 0, supply: 0, tags: L, ward: true, quip: '"Yip."', ack: ['Yip.'] },
  // Flying caster: Reel, Spore Cloud, Drink. No weapon.
  hooksail: { name: 'Hooksail', team: 2, cruise: 4.8, hp: 150, shield: 0, speed: 6.2, eye: 1.6, headY: 1.5, bodyY: 1.0, rad: 1.1, cost: 100, flux: 200, time: 20, supply: 3, tags: L, armour: 1, air: true, energy: 200, quip: '"Come closer. Closer."', ack: ['Hooks out.', 'Sails full.', 'I will fetch it.'] },
  // A Spore Sac that uprooted: keeps its 8 beds while afloat, very slow until Quick Drift. Carries 8 after Belly Sacs.
  drifter: { name: 'Drifter', team: 2, cargo: 8, cruise: 6.0, hp: 200, shield: 0, speed: 1.6, eye: 1.8, headY: 1.7, bodyY: 1.2, rad: 1.3, cost: 0, time: 0, supply: 0, tags: L, air: true, quip: '"Up here, everything looks like food."', ack: ['Drifting.', 'The wind takes me there.', 'Eight beds aboard.'] },
  // A Drifter that ripened: sees dug-in and unseen bodies 11 m round it.
  lookoutsac: { name: 'Lookout Sac', team: 2, cruise: 6.0, hp: 220, shield: 0, speed: 2.8, eye: 2.0, headY: 1.9, bodyY: 1.3, rad: 1.3, cost: 50, flux: 50, time: 14, supply: 0, tags: L, armour: 1, air: true, detect: 11, quip: '"I see the ones under the dirt."', ack: ['Watching.', 'Eyes open.', 'Nothing hides from me.'] },
  // A Stinger Stalk and a Puffball that pulled up their roots to walk somewhere else. They root again on Bloom.
  stingerwalk: { name: 'Stinger Stalk (walking)', team: 2, ward: true, hp: 500, shield: 0, speed: 1.3, eye: 3, headY: 3, bodyY: 2, rad: 1.4, cost: 0, time: 0, supply: 0, tags: L, quip: '"Slowly, slowly."', ack: ['Shuffling.', 'Roots up.'] },
  puffwalk: { name: 'Puffball (walking)', team: 2, ward: true, hp: 400, shield: 0, speed: 1.3, eye: 3, headY: 3, bodyY: 2, rad: 1.3, cost: 0, time: 0, supply: 0, tags: L, quip: '"Wobble."', ack: ['Wobbling.', 'Roots up.'] },
};
/** Buildings. All but the Mother Cap, the Tunnel Root and the Spore Pod need Bloom under them; all but those two use up the Grazer that roots them.
 *  `eldercap` and `ancientcap` are the Mother Cap's ripened tiers: the building stays a Mother Cap (so it is still the home building everywhere)
 *  and these rows give their names, prices (the difference) and ripening times. */
export const G_BLD: Record<GBKind, BldDef> = {
  mothercap: { name: 'Mother Cap', hp: 2200, hx: 5.6, hz: 4.6, h: 9.8, cost: 400, time: 55, blurb: 'A new base: grows Buds and Keepers, banks ore', tags: L, armour: 1 },
  eldercap: { name: 'Elder Cap', hp: 2500, hx: 5.6, hz: 4.6, h: 12, cost: 150, flux: 100, time: 50, blurb: 'The Mother Cap ripened: opens tier 2', tags: L, armour: 1 },
  ancientcap: { name: 'Ancient Cap', hp: 2800, hx: 6, hz: 5, h: 15, cost: 200, flux: 150, time: 70, blurb: 'The Elder Cap ripened: opens tier 3', tags: L, armour: 1 },
  sporesac: { name: 'Spore Sac', hp: 600, hx: 2.2, hz: 2.0, h: 4.6, cost: 75, time: 12, blurb: 'Eight more beds; uproots into a Drifter', tags: L },
  ventbladder: { name: 'Vent Bladder', hp: 450, hx: 2.2, hz: 2.2, h: 4.6, cost: 25, time: 10, blurb: 'Swells over a vent: Grazers carry Flux from it', tags: L },
  warren: { name: 'Warren', hp: 1200, hx: 3.6, hz: 3.0, h: 4.2, cost: 150, time: 16, blurb: 'Snappers', needs: ['mothercap'], tags: L },
  oldgrowth: { name: 'Old Growth', hp: 1000, hx: 3.0, hz: 3.0, h: 10, cost: 75, time: 14, blurb: 'Bite, Spit and Hide levels', needs: ['mothercap'], tags: L },
  stinger: { name: 'Stinger Stalk', hp: 500, hx: 1.6, hz: 1.6, h: 8, cost: 110, time: 12, blurb: 'Defence: whips anything close; uproots and walks', needs: ['warren'], tags: L, armour: 1 },
  puffball: { name: 'Puffball', hp: 400, hx: 1.5, hz: 1.5, h: 5.8, cost: 75, time: 12, blurb: 'Shoots fliers, sees dug-in bodies; uproots and walks', needs: ['warren'], tags: L, armour: 1, detect: 11, hits: 'air' },
  blisterbed: { name: 'Blister Bed', hp: 1100, hx: 3.6, hz: 3.6, h: 3.4, cost: 125, time: 14, blurb: 'Blisters', needs: ['warren'], tags: L },
  shellpit: { name: 'Shell Pit', hp: 1100, hx: 3.6, hz: 3.6, h: 2.6, cost: 150, time: 16, blurb: 'Shellbacks; Lobber ripening', needs: ['warren'], tags: L },
  quillgarden: { name: 'Quill Garden', hp: 1300, hx: 3.6, hz: 3.1, h: 6, cost: 150, time: 18, blurb: 'Quillbacks', needs: ['warren'], tags: L },
  rotden: { name: 'Rot Den', hp: 1200, hx: 3.8, hz: 3.8, h: 5.6, cost: 100, flux: 100, time: 18, blurb: 'Smothers and Seeders', needs: ['eldercap'], tags: L },
  wingspire: { name: 'Wing Spire', hp: 1300, hx: 2.2, hz: 2.2, h: 10.5, cost: 200, flux: 200, time: 22, blurb: 'Gnatwings and Bloaters, flier levels', needs: ['eldercap'], tags: L },
  tallspire: { name: 'Tall Spire', hp: 1600, hx: 2.6, hz: 2.6, h: 14.5, cost: 100, flux: 150, time: 40, blurb: 'The Wing Spire ripened: Sower ripening', needs: ['ancientcap'], tags: L },
  deeproot: { name: 'Deep Root', hp: 1400, hx: 3.8, hz: 3.8, h: 5, cost: 150, flux: 150, time: 20, blurb: 'Grows Tunnel Roots to any spot you see', needs: ['eldercap'], tags: L },
  tunnelroot: { name: 'Tunnel Root', hp: 600, hx: 1.6, hz: 1.6, h: 1.4, cost: 50, flux: 50, time: 10, blurb: 'A tunnel mouth: bodies walk in one root and out another', needs: ['deeproot'], tags: L, armour: 1 },
  needleden: { name: 'Needle Den', hp: 1100, hx: 3.4, hz: 3.4, h: 5, cost: 100, flux: 150, time: 18, blurb: 'Needler ripening', needs: ['quillgarden', 'ancientcap'], tags: L },
  tuskhollow: { name: 'Tusk Hollow', hp: 1800, hx: 4.6, hz: 3.8, h: 6, cost: 200, time: 22, blurb: 'Mulchers', needs: ['quillgarden'], tags: L },
  sporepod: { name: 'Spore Pod', hp: 160, hx: 0.8, hz: 0.8, h: 2, cost: 0, time: 8, blurb: 'A Keeper planted it: spreads Bloom', tags: L },
};
/** What a Grazer can root, in build-menu order. The Tall Spire comes from a Wing Spire, and the Spore Pod from a Keeper, so neither is on it. */
export const G_BUILDABLE: GBKind[] = ['sporesac', 'ventbladder', 'warren', 'oldgrowth', 'stinger', 'puffball', 'blisterbed', 'shellpit', 'quillgarden', 'rotden', 'wingspire', 'deeproot', 'needleden', 'tuskhollow', 'tunnelroot', 'mothercap'];
/** What each unit needs standing before a Bud can ripen into it (FactionRules.has decides what counts: an Ancient Cap is a Mother Cap at tier 3). */
export const G_UNLOCK: Partial<Record<GKind, GBKind>> = { grazer: 'mothercap', keeper: 'mothercap', snapper: 'warren', blister: 'blisterbed', shellback: 'shellpit', quillback: 'quillgarden', smother: 'rotden', seeder: 'rotden', mulcher: 'tuskhollow', gnatwing: 'wingspire', bloater: 'wingspire', hooksail: 'ancientcap' };
export const G_PAIR: Partial<Record<GKind, boolean>> = { snapper: true };
/** Ripening: a body turns into the next kind where it stands, paying the difference. `research` must be bought and `at` must stand. */
export const G_RIPEN: Partial<Record<GKind, { to: GKind; research?: GUpKey; at: GBKind }>> = {
  shellback: { to: 'lobber', research: 'glob', at: 'shellpit' },
  quillback: { to: 'needler', research: 'gneedle', at: 'needleden' },
  bloater: { to: 'sower', research: 'gsower', at: 'tallspire' },
  drifter: { to: 'lookoutsac', at: 'eldercap' },
};

export type GUpKey = 'gfat' | 'gtongue' | 'gdmg' | 'garmor' | 'gquill' | 'glegs' | 'gsap' | 'gdmg2' | 'garmor2' | 'gcharge' | 'gdmg3' | 'garmor3' | 'gbloom' | 'ggut'
  | 'gdig' | 'gdrift' | 'gbelly' | 'ghunger' | 'gspit1' | 'gspit2' | 'gspit3' | 'groll' | 'glob' | 'gmend' | 'gcrawl' | 'gneck' | 'gwings' | 'grot'
  | 'gfly1' | 'gfly2' | 'gfly3' | 'gfhide1' | 'gfhide2' | 'gfhide3' | 'gneedle' | 'gspines' | 'gsower' | 'gbark';
type GUp = { key: GUpKey; name: string; cost: number; flux?: number; blurb: string; at: GBKind; say: string; needs?: GUpKey; after?: GBKind; line?: 'atk' | 'arm' | 'shd'; lvl?: number; pct?: number; cat?: string };
export const G_UPGRADES: GUp[] = [
  // The Mother Cap: the economy, digging in and the Drifters.
  { key: 'gfat', name: 'Fat Buds', cost: 125, blurb: 'Mother Caps hold 4 Buds and grow them 30% faster', at: 'warren', say: 'Fat Buds. The Cap is heavy with them.' },
  { key: 'gtongue', name: 'Long Tongues', cost: 100, blurb: 'Grazers chew 30% faster', at: 'warren', say: 'Long Tongues. The rock goes down easier.' },
  { key: 'ggut', name: 'Fat Gut', cost: 175, blurb: 'Grazers carry 21 ore', at: 'mothercap', needs: 'gtongue', after: 'eldercap', say: 'Fat Gut. Bellies dragging.' },
  { key: 'gdig', name: 'Dig In', cost: 100, flux: 100, blurb: 'Every Gloam body on the ground can dig in (Ctrl): unseen without a detector, cannot move.', at: 'mothercap', say: 'Dig In. Every one of us can go under now.' },
  { key: 'gdrift', name: 'Quick Drift', cost: 100, flux: 100, blurb: 'Drifters and Lookout Sacs fly twice as fast', at: 'mothercap', say: 'Quick Drift. The sacs catch the wind.' },
  { key: 'gbelly', name: 'Belly Sacs', cost: 150, flux: 150, blurb: 'Drifters carry 8 beds of bodies and drip Bloom where they float still', at: 'mothercap', after: 'eldercap', say: 'Belly Sacs. The Drifters can carry us now.' },
  // The Warren.
  { key: 'glegs', name: 'Quick Legs', cost: 100, blurb: 'Snappers and Blisters run 15% faster', at: 'warren', say: 'Quick Legs. Catch us if you can.' },
  { key: 'ghunger', name: 'Hunger', cost: 200, flux: 200, blurb: 'Snappers bite 20% faster', at: 'warren', after: 'ancientcap', say: 'Hunger. The Snappers cannot stop chewing.' },
  // Old Growth: the three ground levels. Bite is melee, Spit is everything that spits, Hide is health (percent mode) or armour (flat mode).
  { key: 'gdmg', line: 'atk', lvl: 1, name: 'Bite 1', cost: 150, blurb: 'Gloam bites hit 25% harder', at: 'oldgrowth', say: 'Bite, first level. Everything bites deeper.' },
  { key: 'gdmg2', line: 'atk', lvl: 2, name: 'Bite 2', cost: 150, flux: 150, blurb: 'Gloam bites hit 20% harder again', at: 'oldgrowth', needs: 'gdmg', after: 'eldercap', say: 'Bite, second level. Saw, then swallow.' },
  { key: 'gdmg3', line: 'atk', lvl: 3, name: 'Bite 3', cost: 200, flux: 200, blurb: 'Gloam bites hit 15% harder again', at: 'oldgrowth', needs: 'gdmg2', after: 'ancientcap', say: 'Bite, third level. They crack steel now.' },
  { key: 'gspit1', name: 'Spit 1', cost: 125, blurb: 'Gloam spit and quills hit 25% harder', at: 'oldgrowth', say: 'Spit, first level. It burns going in.' },
  { key: 'gspit2', name: 'Spit 2', cost: 150, flux: 150, blurb: 'Gloam spit and quills hit 20% harder again', at: 'oldgrowth', needs: 'gspit1', after: 'eldercap', say: 'Spit, second level. Thicker and hotter.' },
  { key: 'gspit3', name: 'Spit 3', cost: 200, flux: 200, blurb: 'Gloam spit and quills hit 15% harder again', at: 'oldgrowth', needs: 'gspit2', after: 'ancientcap', say: 'Spit, third level. It eats through plate.' },
  { key: 'garmor', line: 'arm', lvl: 1, name: 'Hide 1', cost: 150, blurb: 'Gloam bodies on the ground take 25% more to kill', at: 'oldgrowth', say: 'Hide, first level. Let them try.' },
  { key: 'garmor2', line: 'arm', lvl: 2, name: 'Hide 2', cost: 225, flux: 225, blurb: 'Gloam bodies on the ground take 20% more again', at: 'oldgrowth', needs: 'garmor', after: 'eldercap', say: 'Hide, second level. Old and hard.' },
  { key: 'garmor3', line: 'arm', lvl: 3, name: 'Hide 3', cost: 300, flux: 300, blurb: 'Gloam bodies on the ground take 15% more again', at: 'oldgrowth', needs: 'garmor2', after: 'ancientcap', say: 'Hide, third level. We are the ground.' },
  { key: 'gbloom', name: 'Deep Bloom', cost: 175, blurb: 'Bloom spreads 40% wider and heals twice as fast', at: 'oldgrowth', after: 'eldercap', say: 'Deep Bloom. The carpet runs to the horizon.' },
  // The Blister Bed.
  { key: 'gsap', name: 'Volatile Sap', cost: 125, blurb: 'Blisters burst 40% harder', at: 'blisterbed', say: 'Volatile Sap. Mind where you step.' },
  { key: 'groll', name: 'Rolling Run', cost: 100, flux: 100, blurb: 'Blisters roll 25% faster and have 10 more health', at: 'blisterbed', say: 'Rolling Run. The Blisters bounce now.' },
  // The Shell Pit.
  { key: 'glob', name: 'Lobber Ripening', cost: 150, flux: 150, blurb: 'Shellbacks can ripen into Lobbers (25 ore, 75 Flux each)', at: 'shellpit', after: 'eldercap', say: 'Lobber Ripening. The Shellbacks are swelling.' },
  { key: 'gmend', name: 'Quick Mend', cost: 100, flux: 100, blurb: 'Shellbacks dug in heal twice as fast', at: 'shellpit', say: 'Quick Mend. Under the dirt, the shells knit.' },
  { key: 'gcrawl', name: 'Dug Crawl', cost: 100, flux: 100, blurb: 'Shellbacks and Lobbers move while dug in', at: 'shellpit', after: 'eldercap', say: 'Dug Crawl. We move under their feet.' },
  // The Quill Garden.
  { key: 'gquill', name: 'Barbed Quills', cost: 125, blurb: 'Quillbacks reach 5 m further and hit 15% harder', at: 'quillgarden', say: 'Barbed Quills. They stick, and they stay.' },
  { key: 'gneck', name: 'Strong Neck', cost: 100, flux: 100, blurb: 'Quillbacks run 25% faster off Bloom', at: 'quillgarden', say: 'Strong Neck. The Quillbacks keep up now.' },
  // The Rot Den.
  { key: 'gwings', name: 'Husk Wings', cost: 150, flux: 150, blurb: 'Husks fly for their first 6 s, over cliffs and walls', at: 'rotden', say: 'Husk Wings. The husks glide in.' },
  { key: 'grot', name: 'Deep Rot', cost: 150, flux: 150, blurb: 'Smothers start with 75 energy; Rot Mind holds a body 16 s instead of 12', at: 'rotden', say: 'Deep Rot. The spores sink in further.' },
  // The Wing Spire: the flier levels.
  { key: 'gfly1', name: 'Flier Bite 1', cost: 100, flux: 100, blurb: 'Gloam fliers hit 25% harder', at: 'wingspire', say: 'Flier Bite, first level.' },
  { key: 'gfly2', name: 'Flier Bite 2', cost: 175, flux: 175, blurb: 'Gloam fliers hit 20% harder again', at: 'wingspire', needs: 'gfly1', after: 'eldercap', say: 'Flier Bite, second level.' },
  { key: 'gfly3', name: 'Flier Bite 3', cost: 250, flux: 250, blurb: 'Gloam fliers hit 15% harder again', at: 'wingspire', needs: 'gfly2', after: 'ancientcap', say: 'Flier Bite, third level.' },
  { key: 'gfhide1', name: 'Flier Hide 1', cost: 150, flux: 150, blurb: 'Gloam fliers take 25% more to kill', at: 'wingspire', say: 'Flier Hide, first level.' },
  { key: 'gfhide2', name: 'Flier Hide 2', cost: 225, flux: 225, blurb: 'Gloam fliers take 20% more to kill again', at: 'wingspire', needs: 'gfhide1', after: 'eldercap', say: 'Flier Hide, second level.' },
  { key: 'gfhide3', name: 'Flier Hide 3', cost: 300, flux: 300, blurb: 'Gloam fliers take 15% more to kill again', at: 'wingspire', needs: 'gfhide2', after: 'ancientcap', say: 'Flier Hide, third level.' },
  // Tier 3.
  { key: 'gneedle', name: 'Needler Ripening', cost: 150, flux: 150, blurb: 'Quillbacks can ripen into Needlers (50 ore, 100 Flux each)', at: 'needleden', say: 'Needler Ripening. The Quillbacks want to go under.' },
  { key: 'gspines', name: 'Deep Spines', cost: 150, flux: 150, blurb: 'Needler spines reach 13 m instead of 10', at: 'needleden', say: 'Deep Spines. Longer, and further.' },
  { key: 'gsower', name: 'Sower Ripening', cost: 150, flux: 150, blurb: 'Bloaters can ripen into Sowers (150 ore, 150 Flux each)', at: 'tallspire', say: 'Sower Ripening. The Bloaters are heavy with young.' },
  { key: 'gcharge', name: 'Bull Charge', cost: 150, blurb: 'Mulchers charge twice as often', at: 'tuskhollow', say: 'Bull Charge. The old one is restless.' },
  { key: 'gbark', name: 'Bark Plates', cost: 150, flux: 150, blurb: 'Mulchers take 2 less from every hit', at: 'tuskhollow', say: 'Bark Plates. The old one wears a coat of wood.' },
];

/** Tuning the game reads. */
export const G_TUNE = {
  budEvery: 7, buds: 3, fatBuds: 4, fatK: 1.3,
  /** Bloom radius by building, metres, and how fast it spreads (m/s). Only the kinds the old look file grows models for are listed here
   *  (look/index.ts makes a model for every key); the newer kinds' radii are in BLOOM2. */
  bloomR: { mothercap: 20, sporesac: 8, warren: 10, stinger: 7, quillgarden: 10, blisterbed: 9, tuskhollow: 11, oldgrowth: 12 } as Record<string, number>,
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
/** Bloom radius for the kinds added in the full-depth roster. */
export const BLOOM2: Record<string, number> = { eldercap: 20, ancientcap: 20, ventbladder: 6, shellpit: 9, puffball: 6, rotden: 9, wingspire: 9, tallspire: 11, deeproot: 9, tunnelroot: 6, needleden: 9, sporepod: 10 };
export const bloomOf = (k: string) => G_TUNE.bloomR[k] ?? BLOOM2[k] ?? 6;

/** The full-depth roster's tuning: one block per kind, each number with its reason in roster.ts or abilities.ts where it is used. */
export const G2 = {
  // Cap tiers: seconds to ripen are BLD.eldercap.time and BLD.ancientcap.time.
  keeper: { spit: 8, cd: .9, range: 8, seed: { energy: 25, buds: 3, t: 20, range: 6 }, pod: { energy: 25, range: 8, grow: 12, hop: 14 }, mend: { energy: 50, now: 75, over: 50, t: 12, range: 7 } },
  shellback: { spit: 16, cd: 1.5, range: 13, dugHeal: 7, mendK: 2, crawl: .7 },
  lobber: { spit: 16, cd: 1.6, range: 14, lob: { cd: 7, range: 16, dmg: 60, r: 2.2, fuse: 2.5 } },
  needler: { dmg: 20, plated: 10, cd: 1.45, len: 10, deep: 13, width: 1.3 },
  smother: { choke: { energy: 75, range: 10, r: 2.8, root: 4, dmg: 30, t: 3, fuse: 1 }, mind: { energy: 100, range: 9, t: 12, deep: 16 } },
  seeder: { cd: 36, n: 2, life: 18, range: 40, fly: 6 },
  husk: { bite: 10, cd: .6 },
  gnatwing: { bite: 9, cd: 1.1, range: 4, jump: [1 / 3, 1 / 9], jumpR: 4 },
  bloater: { spit: 14, cd: 1.4, range: 9, acid: { arm: 2, t: 10 } },
  sower: { cd: 1.8, range: 10, land: 12, life: 8 },
  pup: { bite: 6, cd: .5 },
  hooksail: { reel: { energy: 75, range: 9, pull: 9 }, cloud: { energy: 100, range: 11, r: 4, t: 8 }, drink: { hp: 200, energy: 50, range: 4 } },
  puffball: { dmg: 12, cd: .9, range: 11 },
  drifter: { beds: 8, cargo: 8, drip: 7, quick: 2 },
  uproot: { t: 3, root: 4 },
  tunnel: { inT: 1.2, mouth: 3.2 },
  dig: { t: .6 },
  rotRun: { speed: 1.25, hp: 10 },
};

export const G_FACTION: Faction = { name: 'The Gloam', short: 'Gloam', hq: 'mothercap', worker: 'grazer', supply: 'sporesac', builds: G_BUILDABLE, voice: 'Overgrowth', squad: 'Swarm', lead: 'snapper', ore: 'ore', barracks: 'warren' };
/** Everything a Mother Cap grows. Each unit needs its building (G_UNLOCK); the Keeper takes no Bud. */
const CAP_LIST: GKind[] = ['grazer', 'snapper', 'blister', 'shellback', 'quillback', 'keeper', 'smother', 'seeder', 'gnatwing', 'bloater', 'hooksail'];
/** Every Cap tier ripens the same Buds; what a side can make depends on its other buildings (G_UNLOCK) and the Cap tier (gate in rules.ts). */
export const G_TRAINS: Partial<Record<GBKind, GKind[]>> = { mothercap: CAP_LIST, eldercap: CAP_LIST, ancientcap: CAP_LIST, tuskhollow: ['mulcher'] };
/** Ground kinds that can dig in once Dig In is bought. */
export const G_DIGS: GKind[] = ['grazer', 'snapper', 'blister', 'shellback', 'lobber', 'quillback', 'needler', 'smother', 'seeder', 'keeper', 'mulcher'];
/** Kinds that spit or shoot (Spit levels), and fliers (Flier Bite levels). Everything else bites (Bite levels). */
export const G_SPITS = new Set<string>(['quillback', 'shellback', 'lobber', 'needler', 'keeper', 'seeder']);
export const G_FLIES = new Set<string>(['gnatwing', 'bloater', 'sower', 'hooksail', 'drifter', 'lookoutsac']);
