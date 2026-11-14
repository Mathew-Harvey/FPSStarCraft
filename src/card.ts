// The command card: the grid of buttons in the command view for whatever is picked. Five across and three down, each with its own key.
// This file only works out which buttons there are, what each one does and why one is greyed out. The HUD draws them and the command
// view (command.ts) presses them, by key or by a click on the card.
import type { Game } from './game';
import { UNIT, BLD, FACTION, TRAINS, UNIT_NEEDS, UPGRADES, Kind, BKind, UpKey, Unit, Building, fac, isWorker } from './data';
import { unitRule, bldRule } from './core/registry';
import { costOf, canPay, shortOf, type Cost } from './core/econ';
import * as AB from './core/ability';
import { abilitiesOf, whyNot, type AbilityDef } from './core/ability';
import { roomOf } from './core/cargo';

/** Transport and the autocast switch come from the engine core (stream A); the buttons show once the game has them. */
export const hasBoard = (g: Game) => typeof (g as any).board === 'function' && typeof (g as any).unload === 'function';
export const hasAutocast = () => typeof (AB as any).setAutocast === 'function';

/** A price as a player reads it: "60 ore", or "100 ore · 50 Flux". */
export const price = (c: Cost, n = 1) => `${c[0] * n} ore` + (c[1] ? ` · ${c[1] * n} Flux` : '');

/** One button. `off` is the reason it cannot be pressed now, said plainly; empty when it can. */
export interface Btn {
  id: string; key: string; label: string; sub: string; off: string;
  /** A unit kind or building kind whose picture goes on the button. */
  icon?: string;
  /** The button is lit: the order it starts is waiting for a click on the map. */
  on?: boolean;
  /** What pressing it does, given which of the picked bodies or which building it is for. */
  act: { t: 'train'; k: Kind } | { t: 'research'; k: UpKey } | { t: 'aim'; aim: Aim } | { t: 'stop' } | { t: 'release' } | { t: 'jump' } | { t: 'buildMenu' } | { t: 'back' } | { t: 'cancel' }
    | { t: 'ability'; kind: Kind; key: string } | { t: 'bact'; key: string } | { t: 'unload' };
}
/** An order that waits for a spot or a body to be clicked. */
export type Aim = { k: 'move' } | { k: 'patrol' } | { k: 'gather' } | { k: 'rally' } | { k: 'stake'; b: BKind } | { k: 'ab'; kind: Kind; key: string; name: string } | { k: 'board' };

/** Keys for the card, by the code the keyboard sends. None of them pans the view (W A S D), lifts or drops it (M N), jumps (F) or is a number. */
export const KEYS = {
  move: 'KeyQ', stop: 'KeyH', board: 'KeyJ', unload: 'KeyK', patrol: 'KeyP', release: 'KeyR', jump: 'KeyF', gather: 'KeyO', build: 'KeyB', rally: 'KeyL', cancel: 'Backspace',
  /** Train and research slots on a building, in order: E T Y U are the keys the first-person shop already uses. Fourteen, so a Cap's
   *  eleven kinds all fit; V is left out because the squad orders use it. The last three (, . /) are for the Mother Cap, whose eleven
   *  kinds, four research and Ripen need seventeen. (With a second player on the keyboard those keys are theirs, as I O P J K already are; the buttons still click.) */
  slots: ['KeyE', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'KeyJ', 'KeyK', 'KeyQ', 'KeyZ', 'KeyX', 'KeyC', 'KeyG', 'Comma', 'Period', 'Slash'],
  /** Abilities of the picked bodies, in order, after the fixed orders. */
  abilities: ['KeyE', 'KeyT', 'KeyY', 'KeyU', 'KeyZ', 'KeyX', 'KeyC', 'KeyG'],
  /** Buildings in the build list, in order. */
  builds: ['KeyQ', 'KeyE', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'],
};
const PUNCT: Record<string, string> = { Backspace: '⌫', Comma: ',', Period: '.', Slash: '/', ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', ShiftLeft: 'Shift', ShiftRight: 'R Shift', AltLeft: 'Alt', Space: 'Space', Tab: 'Tab', Mouse0: 'LMB', Mouse2: 'RMB', Mouse1: 'MMB' };
export const keyName = (code: string) => PUNCT[code] ?? code.replace(/^Key|^Digit/, '');

/** The reason a building cannot train a kind now, or '' when it can. Mirrors the checks in Game.train so the button and the order agree. */
export function trainBlock(g: Game, b: Building, k: Kind): string {
  const st = UNIT[k], t = b.team, two = unitRule(k).pair ? 2 : 1, bud = !!bldRule(b.kind).buds && !unitRule(k).noBud;
  const pp = g.paper(t); if (pp && !isWorker(k) && !pp.units.includes(k)) return 'Not on this job';
  const nb = UNIT_NEEDS[k]; if (nb && !g.ownB(nb, true, t).length) return 'Needs a ' + BLD[nb].name;
  if (!b.built) return 'Still going up';
  { const why = bldRule(b.kind).trains?.(g, b, k) || g.silent(b); if (why) return why.replace(/\.$/, ''); }
  { const lim = unitRule(k).limit; if (lim !== undefined && g.own(k, t).length + g.buildings.reduce((n, x) => n + (x.alive && x.team === t ? x.queue.filter(q => q.kind === k).length : 0), 0) + two > lim) return lim === 1 ? 'Only one at a time' : `${lim} at most`; }
  { const need = g.gated(t, k); if (need) return 'Needs ' + (/^[AEIOU]/.test(need) ? 'an ' : 'a ') + need; }
  if (bud && !(b.buds! > 0)) return 'No Bud ripe';
  if (!bud && b.queue.length >= 5) return 'Queue full (5)';
  const c = costOf(k); if (!canPay(g, t, c, two)) return 'Needs ' + shortOf(g, t, c, two) + ' more';
  if (g.supplyUsed(t) + st.supply * two > g.supplyCap(t)) return fac(t) === 2 ? 'No room: root a Spore Sac' : fac(t) ? 'No room: grow a Hush Well' : 'No beds: build a Depot';
  return '';
}
/** The reason research cannot be bought now, or '' when it can. Mirrors Game.buyUpgrade. */
export function researchBlock(g: Game, b: Building, key: UpKey): string {
  const u = UPGRADES.find(x => x.key === key)!, t = b.team;
  if (g.upOf(t)[key]) return 'Done';
  if (!b.built) return 'Still going up';
  if (u.needs && !g.upOf(t)[u.needs]) return 'Needs ' + UPGRADES.find(x => x.key === u.needs)!.name;
  if (!g.ownB(u.at, true, t).some(x => g.rate(x) > 0)) return g.silent(b).replace(/\.$/, '');
  { const need = g.gated(t, key); if (need) return 'Needs ' + (/^[AEIOU]/.test(need) ? 'an ' : 'a ') + need; }
  const c = costOf(key); if (!canPay(g, t, c)) return 'Needs ' + shortOf(g, t, c) + ' more';
  return '';
}
/** The reason a worker cannot stake out a building now, or '' when it can. Where it goes is checked when the spot is clicked. */
export function buildBlock(g: Game, k: BKind, team: number): string {
  if (!g.unlocked(k, team)) { const miss = g.missing(k, team); return miss.length ? 'Needs a ' + miss.map(n => BLD[n].name).join(' and ') : 'Not on this job'; }
  const c = costOf(k); if (!canPay(g, team, c)) return 'Needs ' + shortOf(g, team, c) + ' more';
  return '';
}

/** A reason from core/ability.ts's whyNot, in plain words for the card. */
export function abilityWords(why: string, a: AbilityDef, u?: Unit): string {
  switch (why) {
    case 'energy': return `Needs ${a.energy} energy` + (u && u.maxEnergy ? ` (has ${Math.floor(u.energy ?? 0)})` : '');
    case 'cooldown': return `Ready in ${Math.ceil(u?.abCd?.[a.key] ?? 0)} s`;
    case 'busy': return 'Already casting'; case 'inside': return 'Inside a carrier'; case 'cannot act': return 'Cannot act now'; case 'dead': return 'Dead';
    case 'range': return 'Too far'; case 'target': return a.who === 'ally' ? 'Needs one of ours' : 'Needs an enemy'; case 'aim': return 'Needs a spot';
    case 'refused': return 'Cannot be used there';
    default: return why ? why[0].toUpperCase() + why.slice(1) : '';
  }
}
/** The picked bodies of one kind that could cast an ability now, ignoring where it is aimed (that is checked on the click). */
export function casters(g: Game, us: Unit[], kind: Kind, a: AbilityDef): { ready: Unit[]; why: string } {
  let why = '', best: Unit | undefined; const ready: Unit[] = [];
  for (const u of us) { if (u.kind !== kind) continue; const w = whyNot(g, u, a.key, { x: u.pos.x, z: u.pos.z });
    // Aimed casts are refused here for the aim alone (range, no target): the caster itself is fine.
    if (!w || (a.target !== 'self' && (w === 'range' || w === 'target' || w === 'aim' || w === 'refused'))) ready.push(u);
    else if (!best || (w === 'cooldown' && (u.abCd?.[a.key] ?? 0) < (best.abCd?.[a.key] ?? 1e9)) || (w === 'energy' && (u.energy ?? 0) > (best.energy ?? 0))) { best = u; why = w; } }
  return { ready, why: ready.length ? '' : abilityWords(why, a, best) };
}

/** The buttons for what is picked: a building's training and research, or the orders the picked bodies take. */
export function cardFor(g: Game, sel: Set<Unit>, selB: Building | null, menu: '' | 'build', aim: Aim | null): Btn[] {
  const out: Btn[] = [], lit = (k: string) => !!aim && aim.k === k;
  if (selB) {
    const b = selB, t = b.team; let i = 0;
    for (const k of TRAINS[b.kind] || []) { const two = unitRule(k).pair ? 2 : 1; out.push({ id: 'tr:' + k, key: KEYS.slots[i++], label: UNIT[k].name + (two > 1 ? ' ×2' : ''), sub: `${price(costOf(k), two)} · ${UNIT[k].supply * two} supply`, off: trainBlock(g, b, k), icon: k, act: { t: 'train', k } }); }
    for (const u of UPGRADES.filter(u => u.at === b.kind && (u.team || 0) === fac(t))) { if (g.upOf(t)[u.key]) continue; if (i >= KEYS.slots.length) break; out.push({ id: 'up:' + u.key, key: KEYS.slots[i++], label: u.name, sub: `${price(costOf(u.key))} · ${u.blurb}`, off: researchBlock(g, b, u.key), act: { t: 'research', k: u.key } }); }
    for (const ac of bldRule(b.kind).actions?.(g, b) || []) { if (i >= KEYS.slots.length) break;
      const why = (ac.ok?.(g, b) || '') || (ac.cost && !canPay(g, t, ac.cost) ? 'Needs ' + shortOf(g, t, ac.cost) + ' more' : '') || (b.built ? '' : 'Still going up');
      out.push({ id: 'ba:' + ac.key, key: KEYS.slots[i++], label: ac.name, sub: (ac.cost ? price(ac.cost) + ' · ' : '') + (ac.blurb || ''), off: why.replace(/\.$/, ''), act: { t: 'bact', key: ac.key } }); }
    if (roomOf(b) > 0 && hasBoard(g)) out.push({ id: 'unload', key: KEYS.unload, label: 'Unload all', sub: `${b.cargo?.length || 0} of ${roomOf(b)} inside`, off: b.cargo?.length ? '' : 'Nobody inside', act: { t: 'unload' } });
    if (TRAINS[b.kind]) {
      out.push({ id: 'rally', key: KEYS.rally, label: 'Rally point', sub: 'Where new bodies go', off: b.built ? '' : 'Still going up', on: lit('rally'), act: { t: 'aim', aim: { k: 'rally' } } });
      if (!bldRule(b.kind).buds) out.push({ id: 'cancel', key: KEYS.cancel, label: 'Cancel last', sub: 'Paid back in full', off: b.queue.length ? '' : 'Nothing queued', act: { t: 'cancel' } });
    }
    return out;
  }
  if (!sel.size) return out;
  const us = [...sel], workers = us.filter(u => isWorker(u.kind)), team = us[0].team;
  if (menu === 'build' && workers.length) {
    FACTION[team].builds.forEach((k, i) => { if (i < KEYS.builds.length) out.push({ id: 'bd:' + k, key: KEYS.builds[i], label: BLD[k].name, sub: `${price(costOf(k))} · ${BLD[k].blurb}`, off: buildBlock(g, k, team), icon: k, on: !!aim && aim.k === 'stake' && aim.b === k, act: { t: 'aim', aim: { k: 'stake', b: k } } }); });
    out.push({ id: 'back', key: KEYS.build, label: 'Back', sub: 'To the orders', off: '', act: { t: 'back' } });
    return out;
  }
  out.push({ id: 'move', key: KEYS.move, label: 'Move', sub: 'Then click the ground', off: '', on: lit('move'), act: { t: 'aim', aim: { k: 'move' } } });
  out.push({ id: 'stop', key: KEYS.stop, label: 'Stop', sub: 'Stand where they are', off: '', act: { t: 'stop' } });
  if (us.length > workers.length) out.push({ id: 'patrol', key: KEYS.patrol, label: 'Patrol', sub: 'Back and forth, fighting', off: '', on: lit('patrol'), act: { t: 'aim', aim: { k: 'patrol' } } });
  out.push({ id: 'release', key: KEYS.release, label: workers.length === us.length ? 'Back to work' : 'Back to squad', sub: 'The side\'s own orders again', off: '', act: { t: 'release' } });
  out.push({ id: 'jump', key: KEYS.jump, label: 'Jump in', sub: 'Drive the first one picked', off: '', act: { t: 'jump' } });
  if (hasBoard(g)) {
    const carriers = us.filter(u => roomOf(u) > 0), riders = us.filter(u => !roomOf(u));
    if (riders.length) out.push({ id: 'board', key: KEYS.board, label: 'Get in', sub: 'Then click a carrier or bunker', off: '', on: !!aim && aim.k === 'board', act: { t: 'aim', aim: { k: 'board' } } });
    if (carriers.length) out.push({ id: 'unload', key: KEYS.unload, label: 'Unload all', sub: carriers.reduce((n, c) => n + (c.cargo?.length || 0), 0) + ' inside', off: carriers.some(c => c.cargo?.length) ? '' : 'Nobody inside', act: { t: 'unload' } });
  }
  { let j = 0; const kinds = [...new Set(us.map(u => u.kind))];
    for (const kind of kinds) for (const a of abilitiesOf(kind)) { if (j >= KEYS.abilities.length) break;
      const { why } = casters(g, us, kind, a), many = kinds.length > 1 ? ' (' + UNIT[kind].name + ')' : '';
      const auto = a.autocast && hasAutocast() ? (us.some(u => u.kind === kind && !(u as any).autoOff?.[a.key]) ? 'Casts by itself · right click: off' : 'Right click: cast by itself') : '';
      out.push({ id: `ab:${kind}:${a.key}`, key: KEYS.abilities[j++], label: a.name + many, sub: [auto, a.energy ? a.energy + ' energy' : '', a.cd ? a.cd + ' s' : '', auto ? '' : a.blurb || ''].filter(Boolean).join(' · '), off: why, icon: kind,
        on: !!aim && aim.k === 'ab' && aim.kind === kind && aim.key === a.key, act: { t: 'ability', kind, key: a.key } }); } }
  if (workers.length) {
    out.push({ id: 'gather', key: KEYS.gather, label: 'Gather', sub: 'Then click a seam', off: '', on: lit('gather'), act: { t: 'aim', aim: { k: 'gather' } } });
    out.push({ id: 'build', key: KEYS.build, label: fac(team) === 2 ? 'Root' : fac(team) ? 'Grow' : 'Build', sub: 'Pick a building, then a spot', off: '', act: { t: 'buildMenu' } });
  }
  return out;
}
