// The Veyl Chorus's numbers: units, buildings, songs (research), and what trains where. Shared code reads these through src/data.ts.
import type { UnitDef, BldDef, Faction } from '../../data';

export type VKind = 'cantor' | 'lancer' | 'warden' | 'tender';
export type VBKind = 'choir' | 'reedgate' | 'broodpit' | 'thornspire' | 'wardpylon' | 'hushwell';
export type VUpKey = 'vedge' | 'vglass' | 'vedge2' | 'vglass2' | 'vhum' | 'vwide' | 'vstep' | 'vbreath' | 'vthorn' | 'vbloom';

export const V_UNIT: Record<VKind, UnitDef> = {
  cantor: { name: 'Cantor', team: 1, hp: 90, shield: 50, speed: 5.4, eye: 2.2, headY: 2.42, bodyY: 1.3, rad: .66, cost: 60, time: 11, supply: 1, quip: '"We sing first. It is only polite."', ack: ['The verse is yours.', 'One voice, borrowed.', 'Blades in tune.'] },
  lancer: { name: 'Lancer', team: 1, hp: 50, shield: 30, speed: 4.4, eye: 2.0, headY: 2.12, bodyY: 1.25, rad: .6, cost: 65, time: 12, supply: 1, quip: '"A long note, held until something breaks."', ack: ['The lance hums for you.', 'Hold the note.', 'Far voice, listening.'] },
  warden: { name: 'Warden', team: 1, hp: 900, shield: 300, speed: 3.3, eye: 3.8, headY: 4.0, bodyY: 2.7, rad: 1.5, cost: 300, time: 30, supply: 6, quip: '"The low note. The one the ground hears."', ack: ['The deep voice wakes.', 'Step loudly.', 'The ground is listening.'] },
  tender: { name: 'Tender', team: 1, hp: 40, shield: 20, speed: 4.8, eye: 1.75, headY: 1.86, bodyY: 1.05, rad: .62, cost: 50, time: 8, supply: 1, quip: '"The rock hums. I hum back. We agree on a price."', ack: ['Humming.', 'The seam is listening.', 'A small voice, but useful.'] },
};
export const V_BLD: Record<VBKind, BldDef> = {
  choir: { name: 'Choir Stone', hp: 2000, hx: 1.5, hz: 1.5, h: 11, cost: 400, time: 50, blurb: 'A new Stone: Tenders bring ore here' },
  reedgate: { name: 'Reed Gate', hp: 1600, hx: 3.6, hz: 1.4, h: 8, cost: 200, time: 20, blurb: 'Wakes Wardens, second songs', needs: ['wardpylon'] },
  broodpit: { name: 'Brood Pit', hp: 1500, hx: 3.2, hz: 3.2, h: 4.2, cost: 150, time: 14, blurb: 'Hatches Cantors and Lancers' },
  thornspire: { name: 'Thorn Spire', hp: 380, hx: 1.2, hz: 1.2, h: 7.6, cost: 110, time: 11, blurb: 'Bolt tower', needs: ['broodpit'] },
  wardpylon: { name: 'Ward Pylon', hp: 520, hx: 1.5, hz: 1.5, h: 7, cost: 150, time: 16, blurb: 'Shields buildings near it, first songs', needs: ['broodpit'] },
  hushwell: { name: 'Hush Well', hp: 800, hx: 2.4, hz: 2.4, h: 4.4, cost: 100, time: 9, blurb: 'Eight more voices' },
};
export const V_BUILDABLE: VBKind[] = ['broodpit', 'hushwell', 'thornspire', 'wardpylon', 'reedgate', 'choir'];
export const V_FACTION: Faction = { name: 'Veyl Chorus', short: 'Veyl', hq: 'choir', worker: 'tender', supply: 'hushwell', builds: V_BUILDABLE, voice: 'Conductor', squad: 'Chorus Lead', lead: 'cantor', ore: 'ore' };
export const V_TRAINS: Partial<Record<VBKind, VKind[]>> = { choir: ['tender'], broodpit: ['cantor', 'lancer'], reedgate: ['warden'] };
/** Songs are learned at the buildings that sing them. */
export const V_UPGRADES: { key: VUpKey; name: string; cost: number; blurb: string; at: VBKind; say: string; needs?: VUpKey }[] = [
  { key: 'vedge', name: 'Keener Edges', cost: 150, blurb: '+25% Veyl damage', at: 'wardpylon', say: 'Keener Edges. The blades hum a half step higher.' },
  { key: 'vglass', name: 'Thicker Glass', cost: 150, blurb: '+25% health and shields', at: 'wardpylon', say: 'Thicker Glass. Every shell rings a little lower.' },
  { key: 'vstep', name: 'Quick Step', cost: 100, blurb: 'Veyl move 12% faster', at: 'wardpylon', say: 'Quick Step. The Chorus learns to hurry.' },
  { key: 'vthorn', name: 'Twin Thorns', cost: 125, blurb: 'Thorn Spires fire faster and reach further', at: 'wardpylon', say: 'Twin Thorns. The Spires grow a second eye.' },
  { key: 'vedge2', name: 'Bright Edges', cost: 200, blurb: '+20% Veyl damage', at: 'reedgate', needs: 'vedge', say: 'Bright Edges. You can hear them cut.' },
  { key: 'vglass2', name: 'Deep Glass', cost: 200, blurb: '+20% health and shields', at: 'reedgate', needs: 'vglass', say: 'Deep Glass. Rivets ring off it now.' },
  { key: 'vbreath', name: 'Long Breath', cost: 125, blurb: 'Lancers reach further and hit 15% harder', at: 'reedgate', say: 'Long Breath. The Lancers hold the note longer.' },
  { key: 'vbloom', name: 'Quick Bloom', cost: 150, blurb: 'Shields come back twice as fast', at: 'reedgate', say: 'Quick Bloom. A broken shell grows back before the echo fades.' },
  { key: 'vhum', name: 'Low Hum', cost: 100, blurb: 'Tenders gather 30% faster', at: 'choir', say: 'Low Hum. The seams give up their ore sooner.' },
  { key: 'vwide', name: 'Wide Chorus', cost: 125, blurb: '+4 voices, and +2 more per Hush Well', at: 'choir', say: 'Wide Chorus. More room in the song.' },
];
