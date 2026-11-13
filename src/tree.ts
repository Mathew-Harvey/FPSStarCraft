// The tech tree screen on the pause menu, drawn from the data files: each faction's buildings in rows by what they need, and under each
// building what it trains and what research it sells, with prices, what each one needs, and (for the player's own side) what is
// standing, bought or open now. A tab row shows the other two factions' trees too, with no marks, so a player can read what they face.
import type { Game } from './game';
import { UNIT, BLD, FACTION, TRAINS, UNIT_NEEDS, UPGRADES, BKind, Kind, UpDef, fac } from './data';
import { unitRule } from './core/registry';
import { costOf } from './core/econ';
import { price } from './card';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
const an = (n: string) => (/^[AEIOU]/.test(n) ? 'an ' : 'a ') + n;

/** The buildings of a faction in rows: the main building first, then each building one row below the deepest building it needs. */
export function tiers(f: number): BKind[][] {
  const F = FACTION[f], kinds = [...new Set<BKind>([F.hq, ...F.builds])], depth = new Map<BKind, number>();
  const d = (k: BKind, seen: Set<BKind> = new Set()): number => {
    if (depth.has(k)) return depth.get(k)!;
    if (k === F.hq || seen.has(k)) return 0;
    seen.add(k);
    const needs = (BLD[k].needs || []).filter(n => kinds.includes(n));
    const v = needs.length ? 1 + Math.max(...needs.map(n => d(n, seen))) : 1;
    depth.set(k, v); return v;
  };
  const rows: BKind[][] = [];
  for (const k of kinds) { const v = k === F.hq ? 0 : d(k); (rows[v] ||= []).push(k); }
  return rows.filter(Boolean);
}

/** Research a faction can buy at one building, in the data's order. */
const upsAt = (f: number, k: BKind) => UPGRADES.filter(u => u.at === k && (u.team || 0) === f);

/** One faction's tree as HTML. With `g` and `team`, marks what that side has: standing, open, locked, bought. */
export function treeHtml(f: number, g?: Game, team?: number): string {
  const own = !!g && team !== undefined && fac(team) === f, t = team ?? f, F = FACTION[f];
  const has = (k: BKind) => own && g!.ownB(k, true, t).length > 0, bought = (u: UpDef) => own && !!g!.upOf(t)[u.key];
  const paper = own ? g!.paper(t) : null;
  return tiers(f).map(row => `<div class="tier">${row.map(k => {
    const B = BLD[k], have = has(k), miss = own ? g!.missing(k, t) : (B.needs || []), off = !!paper && k !== F.hq && !paper.allow.includes(k);
    const gate = own ? g!.gated(t, k) : '';
    const units = (TRAINS[k] || []).map(u => {
      const nb = UNIT_NEEDS[u], two = unitRule(u).pair ? 2 : 1, lim = unitRule(u).limit, g8 = own ? g!.gated(t, u) : '';
      const ok = have && (!nb || has(nb)) && !g8;
      const needs = [nb ? 'Needs ' + BLD[nb].name : '', g8 ? 'Needs ' + g8 : '', lim !== undefined ? (lim === 1 ? 'Only one at a time' : lim + ' at most') : ''].filter(Boolean).join(' · ');
      return `<li class="${own && ok ? 'ok' : ''}" data-k="${u}"><b>${esc(UNIT[u].name)}${two > 1 ? ' ×2' : ''}</b><small>${price(costOf(u), two)} · ${UNIT[u].supply * two} supply${needs ? ' · ' + esc(needs) : ''}</small></li>`;
    }).join('');
    const ups = upsAt(f, k).map(u => {
      const nu = u.needs ? UPGRADES.find(x => x.key === u.needs)! : null, dn = bought(u), g8 = own ? g!.gated(t, u.key) : '';
      const ok = have && (!nu || bought(nu)) && !g8;
      const tail = dn ? 'Bought' : `${price(costOf(u.key))} · ${u.blurb}${nu ? ' · after ' + nu.name : ''}${g8 ? ' · needs ' + g8 : ''}`;
      return `<li class="${dn ? 'dn' : own && ok ? 'ok' : ''}" data-k="${u.key}"><b>${esc(u.name)}${u.lvl ? ' ' + 'I'.repeat(Math.min(3, u.lvl)) : ''}</b><small>${esc(tail)}</small></li>`;
    }).join('');
    const state = !own ? (miss.length ? 'Needs ' + miss.map(n => BLD[n].name).join(' and ') : k === F.hq ? 'Main building' : 'Open from the start')
      : have ? 'Standing' : off ? 'Not on this job' : miss.length ? 'Needs ' + miss.map(n => BLD[n].name).join(' and ') : gate ? 'Needs ' + an(gate) : k === F.hq ? '' : 'Ready to build';
    const cls = !own ? 'can' : have ? 'have' : off || miss.length || gate ? 'lock' : 'can';
    const body = units || ups ? `<ul>${units}${ups}</ul>` : `<ul><li class="${have ? 'ok' : ''}"><small>${esc(B.blurb)}</small></li></ul>`;
    return `<div class="node ${cls}" data-b="${k}"><h4>${esc(B.name)}</h4><p>${esc(state)}${k === F.hq && !have && own ? '' : ' · ' + price(costOf(k))}</p>${body}</div>`;
  }).join('')}</div>`).join('');
}

/** The tab row over the tree: the player's own faction first, then the other two. */
export function treeTabs(mine: number, open: number): string {
  return [mine, ...[0, 1, 2].filter(f => f !== mine)].map(f => `<button type="button" class="ttab${f === open ? ' on' : ''}" data-f="${f}">${esc(FACTION[f].short)}${f === mine ? ' (you)' : ''}</button>`).join('');
}
