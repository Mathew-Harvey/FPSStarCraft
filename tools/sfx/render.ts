// Renders every sound the game can make to a WAV, through the game's own mix, so they can be measured (tools/sfx/audit.py)
// and looked at without ears. Built and driven by tools/sfx/render.mjs.
import { initAudio, sets, soundsReady, renderOffline, kit } from '../../src/audio';
import { CAST, lowNote } from '../../src/sound-abilities';
type Job = [string, number, () => void];
const jobs: Job[] = [];
const ARGS: Record<string, any[]> = { ko: [1, true], step: [false, false], streak: [4], reload: [1.5], impact: [1, 0, true], ricochet: [1, 2], bodyfall: [1, 0], shatter: [1, true], splat: [1, true], zoom: [true] };
for (const k of Object.keys(sets.sampled)) jobs.push(['ui-' + k, k === 'win' || k === 'lose' || k === 'reload' ? 2.4 : 1.6, () => (sets.sampled as any)[k](...(ARGS[k] || []))]);
for (const k of Object.keys(CAST)) jobs.push(['ab-' + k, 3.2, () => CAST[k](1)]);
jobs.push(['ab-player.lownote', 3.2, () => lowNote(1)]);
for (const k of ['brew', 'buzz', 'veylhum', 'engine_low', 'engine_small', 'rotor', 'crickets', 'swamp']) jobs.push(['loop-' + k, 2.5, () => kit.S(k, .4, { jit: 0 })]);
const b64 = (f: Float32Array) => { const u = new Uint8Array(f.buffer); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
(window as any).renderAll = async (only?: string) => {
  initAudio(); for (let i = 0; i < 100 && !soundsReady(); i++) await new Promise(r => setTimeout(r, 100));
  const out: Record<string, [string, string]> = {};
  for (const [name, secs, f] of jobs) { if (only && !name.includes(only)) continue; const b = await renderOffline(secs, f); if (b) out[name] = [b64(b.getChannelData(0)), b64(b.getChannelData(1))]; }
  return out;
};
