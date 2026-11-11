// A sound board: every effect in the game, old synthesised set against the new sampled set.
// Built by tools/sfx/board.mjs into dist/sound-board.html.
import { initAudio, setVolume, sets, soundsReady } from '../../src/audio';
const ARGS: Record<string, any[]> = { ko: [1, true], step: [false, false], streak: [4], reload: [1.5] };
const EXTRA: [string, string, any[]][] = [['ko', 'Ironhold body down', [1, false]], ['step', 'Heavy step', [true, false]], ['step', 'Gantry walker step', [true, true]], ['boom', 'Distant boom', [.3]], ['shot', 'Distant shot', [.25]]];
const LABEL: Record<string, string> = {
  rifle: 'Rifle (yours)', pistol: 'Pistol (yours)', sniper: 'Longshot rifle (yours)', scatter: 'Breacher scattergun (yours)', cannon: 'Gantry salvo (yours)', reload: 'Reload', dry: 'Dry fire',
  shot: 'Rifle (AI)', turret: 'Turret', blast: 'Heavy weapon (AI)', hit: 'Hit marker', crit: 'Weak-spot hit', kill: 'Kill confirmed', streak: 'Kill streak x4',
  boom: 'Explosion', clang: 'Shield block', hurt: 'You get hit', ko: 'Veyl body breaks', slash: 'Veyl blade', zap: 'Veyl bolt', dash: 'Dash', charge: 'Warden charge',
  step: 'Footstep', jump: 'Jump to a new body', throw: 'Grenade throw', ore: 'Drill bites ore', bank: 'Pack banked', place: 'Place building', built: 'Building done',
  blip: 'Menu click', deny: 'Not allowed', card: 'Unit title card', alarm: 'Raid alarm', callout: 'Callout', win: 'Win', lose: 'Lose',
};
const row = (key: string, label: string, args: any[]) => {
  const tr = document.createElement('tr'); tr.innerHTML = `<td>${label}</td>`;
  for (const which of ['synth', 'sampled'] as const) {
    const td = document.createElement('td'), b = document.createElement('button'); b.textContent = which === 'synth' ? 'Old' : 'New';
    b.onclick = () => { initAudio(); setVolume(.7); if (which === 'sampled' && !soundsReady()) { b.textContent = 'Loading…'; setTimeout(() => b.click(), 300); return; } b.textContent = which === 'synth' ? 'Old' : 'New'; (sets[which] as any)[key](...args); };
    td.appendChild(b); tr.appendChild(td);
  }
  return tr;
};
const tb = document.getElementById('rows')!;
for (const k of Object.keys(LABEL)) tb.appendChild(row(k, LABEL[k], ARGS[k] || []));
for (const [k, l, a] of EXTRA) tb.appendChild(row(k, l, a));
document.addEventListener('pointerdown', () => initAudio(), { once: true });
