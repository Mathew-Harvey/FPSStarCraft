// Prints the Ironhold roster as Markdown tables (for PR descriptions and reviews). Run: node tools/run-ts.mjs tools/iron-stats.ts
import { I_UNIT, I_BLD, I_UPGRADES } from '../src/factions/ironhold/numbers';
import { abilitiesOf } from '../src/core/ability';
import '../src/factions';
const rows: string[] = ['| Unit | Ore / Flux | Beds | Health | Armour | Speed | Hits | Tags | Abilities (key) |', '|---|---|---|---|---|---|---|---|---|'];
for (const [k, u] of Object.entries(I_UNIT) as [string, any][]) rows.push(`| ${u.name} | ${u.cost} / ${u.flux || 0} | ${u.supply} | ${u.hp} | ${u.armour || 0} | ${u.speed} | ${u.hits || 'ground'}${u.air ? ', flies' : ''}${u.detect ? ', detects' : ''}${u.cloak ? ', unseen' : ''} | ${(u.tags || []).join(' ')} | ${abilitiesOf(k as any).map(a => `${a.name} (${a.hotkey})`).join(', ')} |`);
rows.push('', '| Building | Ore / Flux | Health | Needs |', '|---|---|---|---|');
for (const b of Object.values(I_BLD) as any[]) rows.push(`| ${b.name} | ${b.cost} / ${b.flux || 0} | ${b.hp} | ${(b.needs || []).join(', ')} |`);
rows.push('', '| Research | At | Ore / Flux | Effect |', '|---|---|---|---|');
for (const u of I_UPGRADES as any[]) rows.push(`| ${u.name} | ${u.at}${u.lab ? ' + Lab Bay' : ''}${u.req ? ' + ' + u.req.join(', ') : ''} | ${u.cost} / ${u.flux || 0} | ${u.blurb} |`);
console.log(rows.join('\n'));
