// A sound board: every sound in the game, grouped, with the old synthesised version beside the sampled one where there is one.
// Built by tools/sfx/board.mjs into dist/sound-board.html.
import { initAudio, setVolume, sets, soundsReady, kit } from '../../src/audio';
import { CAST, lowNote } from '../../src/sound-abilities';
const ARGS: Record<string, any[]> = { ko: [1, true], step: [false, false], streak: [4], reload: [1.5], zoom: [true] };
const EXTRA: [string, string, any[]][] = [['ko', 'Ironhold body down', [1, false]], ['step', 'Heavy step', [true, false]], ['step', 'Gantry walker step', [true, true]], ['boom', 'Distant boom', [.3]], ['shot', 'Distant shot', [.25]],
  ['impact', 'Bullet on Veyl crystal', [1, 1, true]], ['impact', 'Bullet on Gloam hide', [1, 2, true]], ['ricochet', 'Ricochet off metal', [1, 2]], ['shatter', 'Big Veyl break', [1, true]], ['splat', 'Big Gloam burst', [1, true]], ['zoom', 'Zoom in', [false]]];
const FIGHT: Record<string, string> = {
  rifle: 'Rifle (yours)', pistol: 'Pistol (yours)', sniper: 'Longshot rifle (yours)', scatter: 'Breacher scattergun (yours)', cannon: 'Gantry salvo (yours)', reload: 'Reload', dry: 'Dry fire',
  shot: 'Rifle (AI)', turret: 'Turret', blast: 'Heavy weapon (AI)', hit: 'Hit marker', crit: 'Weak-spot hit', kill: 'Kill confirmed', streak: 'Kill streak x4',
  boom: 'Explosion', clang: 'Shield block', hurt: 'You get hit', ko: 'Veyl body breaks', slash: 'Veyl blade', zap: 'Veyl bolt', dash: 'Dash', charge: 'Warden charge',
  step: 'Footstep', jump: 'Jump to a new body', throw: 'Grenade throw', impact: 'Bullet on Ironhold plate', ricochet: 'Ricochet off dirt', bodyfall: 'Body falls', shatter: 'Veyl crystal breaks', splat: 'Gloam body bursts',
};
const BASE: Record<string, string> = { ore: 'Drill bites ore', bank: 'Pack banked', place: 'Place building', built: 'Building done', hatch: 'Gloam body hatches', trained: 'Body trained' };
const UI: Record<string, string> = { blip: 'Click', select: 'Select', order: 'Move order', attack: 'Attack order', cast: 'Ability ordered', queue: 'Queue a body', cancel: 'Cancel', tick: 'Cycle or rotate', open: 'Open a menu', close: 'Close a menu', zoom: 'Zoom out', deny: 'Not allowed', card: 'Unit title card', alarm: 'Raid alarm', callout: 'Callout', win: 'Win', lose: 'Lose' };
const SIDE = ['Ironhold', 'Veyl', 'Gloam'], NAME = (k: string) => k.replace(/^\w+\./, '').replace(/^./, c => c.toUpperCase());
const SIDE_OF: Record<string, number> = {};
for (const k of ['linesman', 'gantry', 'gantryflak', 'longshot', 'patch', 'sapper', 'dustbike', 'piledriver', 'piledriverset', 'hopper', 'flakkite', 'flakwalker', 'gadfly', 'surveyor', 'claimbarge']) SIDE_OF[k] = 0;
for (const k of ['cantor', 'lancer', 'tuner', 'mute', 'choirmaster', 'knell', 'listener', 'ferry', 'swift', 'prism', 'omen', 'warden', 'cantus']) SIDE_OF[k] = 1;
const tb = document.getElementById('rows')!;
const head = (t: string, sub = '') => { const tr = document.createElement('tr'); tr.innerHTML = `<th colspan="3">${t}${sub ? `<span>${sub}</span>` : ''}</th>`; tb.appendChild(tr); };
const btn = (label: string, f: () => void, loud = false) => { const b = document.createElement('button'); b.textContent = label; if (loud) b.className = 'new';
  b.onclick = () => { initAudio(); setVolume(.7); if (!soundsReady()) { b.textContent = '…'; setTimeout(() => { b.textContent = label; b.click(); }, 300); return; } f(); }; return b; };
const row = (label: string, old: (() => void) | null, now: () => void) => {
  const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'), c = document.createElement('td'); a.textContent = label;
  if (old) b.appendChild(btn('Old', old)); c.appendChild(btn('Play', now, true)); tr.append(a, b, c); tb.appendChild(tr);
};
const pair = (k: string, label: string, args: any[]) => row(label, (sets.synth as any)[k] ? () => (sets.synth as any)[k](...args) : null, () => (sets.sampled as any)[k](...args));
head('Fighting'); for (const k in FIGHT) pair(k, FIGHT[k], ARGS[k] || []); for (const [k, l, a] of EXTRA) pair(k, l, a);
head('Base and economy'); for (const k in BASE) pair(k, BASE[k], ARGS[k] || []);
head('Interface', 'one sound per kind of action'); for (const k in UI) pair(k, UI[k], ARGS[k] || []);
for (let s = 0; s < 3; s++) {
  head(`${SIDE[s]} abilities`, ['machines: ratchets, latches, hatches, engines', 'glass and song: bells tuned to one scale', 'wet and alive: mud, slime, bubbles, dirt'][s]);
  const seen = new Set<any>();
  for (const k of Object.keys(CAST)) { const kind = k.split('.')[0]; if ((SIDE_OF[kind] ?? 2) !== s || seen.has(CAST[k])) continue; seen.add(CAST[k]); row(`${kind[0].toUpperCase() + kind.slice(1)}: ${NAME(k)}`, null, () => CAST[k](1)); }
  if (s === 1) row('Warden: Low Note (driven)', null, () => lowNote(1));
}
head('Beds and engines', 'these loop in the game; here you hear a few seconds');
for (const [k, l] of [['engine_low', 'Ironhold big flier'], ['rotor', 'Ironhold small flier'], ['veylhum', 'Veyl flier'], ['buzz', 'Gloam flier'], ['crickets', 'Night'], ['swamp', 'Near the Bloom']]) row(l, null, () => kit.S(k, .4, { jit: 0 }));
document.addEventListener('pointerdown', () => initAudio(), { once: true });
