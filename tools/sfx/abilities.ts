// Lists every ability with the generic sfx its code still calls and whether it has its own cast sound (src/sound-abilities.ts).
// Run: node tools/run-ts.mjs tools/sfx/abilities.ts
import '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { UNIT, BLD, DIFFS } from '../../src/data';
import { abilitiesOf } from '../../src/core/ability';
import '../../src/factions';
import { CAST } from '../../src/sound-abilities';
initHeadless();
const sfxRe = /sfx\d*\.(\w+)/g;
const rows: string[] = [];
for (const k of Object.keys(UNIT)) for (const a of abilitiesOf(k)) {
  const e = a.effect.toString(), s = a.show ? a.show.toString() : '';
  const snd = [...new Set([...(e + s).matchAll(sfxRe)].map(m => m[1]))].join(',');
  rows.push([ (UNIT as any)[k].faction ?? (UNIT as any)[k].team, k, a.key, a.name, a.cast, a.show ? 'show' : '-', snd || '-', CAST[`${k}.${a.key}`] ? 'OWN SOUND' : 'NO SOUND'].join('\t'));
}
console.log(rows.join('\n')); console.log('kinds', Object.keys(UNIT).length, 'bld', Object.keys(BLD).length);
