// The command card: the grid of buttons in the command view for whatever is picked. Five across and three down, each with its own key.
// This file only works out which buttons there are, what each one does and why one is greyed out. The HUD draws them and the command
// view (command.ts) presses them, by key or by a click on the card.
import type { Game } from './game';
import { UNIT, BLD, FACTION, TRAINS, UNIT_NEEDS, UPGRADES, Kind, BKind, UpKey, Unit, Building, fac, isWorker } from './data';
import { G_PAIR } from './gloam';

/** One button. `off` is the reason it cannot be pressed now, said plainly; empty when it can. */
export interface Btn {
  id: string; key: string; label: string; sub: string; off: string;
  /** A unit kind or building kind whose picture goes on the button. */
  icon?: string;
  /** The button is lit: the order it starts is waiting for a click on the map. */
  on?: boolean;
  /** What pressing it does, given which of the picked bodies or which building it is for. */
  act: { t: 'train'; k: Kind } | { t: 'research'; k: UpKey } | { t: 'aim'; aim: Aim } | { t: 'stop' } | { t: 'release' } | { t: 'jump' } | { t: 'buildMenu' } | { t: 'back' } | { t: 'cancel' };
}
/** An order that waits for a spot or a body to be clicked. */
export type Aim = { k: 'move' } | { k: 'patrol' } | { k: 'gather' } | { k: 'rally' } | { k: 'stake'; b: BKind };

/** Keys for the card, by the code the keyboard sends. None of them pans the view (W A S D), lifts or drops it (M N), jumps (F) or is a number. */
export const KEYS = {
  move: 'KeyQ', stop: 'KeyH', patrol: 'KeyP', release: 'KeyR', jump: 'KeyF', gather: 'KeyO', build: 'KeyB', rally: 'KeyL', cancel: 'Backspace',
  /** Train and research slots on a building, in order: E T Y U are the keys the first-person shop already uses. */
  slots: ['KeyE', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'KeyJ', 'KeyK', 'KeyQ'],
  /** Buildings in the build list, in order. */
  builds: ['KeyQ', 'KeyE', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'],
};
export const keyName = (code: string) => code === 'Backspace' ? '⌫' : code.replace(/^Key|^Digit/, '');

/** The reason a building cannot train a kind now, or '' when it can. Mirrors the checks in Game.train so the button and the order agree. */
export function trainBlock(g: Game, b: Building, k: Kind): string {
  const st = UNIT[k], t = b.team, two = fac(t) === 2 && G_PAIR[k as keyof typeof G_PAIR] ? 2 : 1;
  const pp = g.paper(t); if (pp && !isWorker(k) && !pp.units.includes(k)) return 'Not on this job';
  const nb = UNIT_NEEDS[k]; if (nb && !g.ownB(nb, true, t).length) return 'Needs a ' + BLD[nb].name;
  if (!b.built) return 'Still going up';
  if (b.kind === 'mothercap' && !(b.buds! > 0)) return 'No Bud ripe';
  if (b.kind !== 'mothercap' && b.queue.length >= 5) return 'Queue full (5)';
  if (g.cash(t) < st.cost * two) return `Needs ${st.cost * two} ore`;
  if (g.supplyUsed(t) + st.supply * two > g.supplyCap(t)) return fac(t) === 2 ? 'No room: root a Spore Sac' : fac(t) ? 'No room: grow a Hush Well' : 'No beds: build a Depot';
  return '';
}
/** The reason research cannot be bought now, or '' when it can. Mirrors Game.buyUpgrade. */
export function researchBlock(g: Game, b: Building, key: UpKey): string {
  const u = UPGRADES.find(x => x.key === key)!, t = b.team;
  if (g.upOf(t)[key]) return 'Done';
  if (!b.built) return 'Still going up';
  if (u.needs && !g.upOf(t)[u.needs]) return 'Needs ' + UPGRADES.find(x => x.key === u.needs)!.name;
  if (g.cash(t) < u.cost) return `Needs ${u.cost} ore`;
  return '';
}
/** The reason a worker cannot stake out a building now, or '' when it can. Where it goes is checked when the spot is clicked. */
export function buildBlock(g: Game, k: BKind, team: number): string {
  if (!g.unlocked(k, team)) { const miss = g.missing(k, team); return miss.length ? 'Needs a ' + miss.map(n => BLD[n].name).join(' and ') : 'Not on this job'; }
  if (g.cash(team) < BLD[k].cost) return `Needs ${BLD[k].cost} ore`;
  return '';
}

/** The buttons for what is picked: a building's training and research, or the orders the picked bodies take. */
export function cardFor(g: Game, sel: Set<Unit>, selB: Building | null, menu: '' | 'build', aim: Aim | null): Btn[] {
  const out: Btn[] = [], lit = (k: string) => !!aim && aim.k === k;
  if (selB) {
    const b = selB, t = b.team; let i = 0;
    for (const k of TRAINS[b.kind] || []) { const two = fac(t) === 2 && G_PAIR[k as keyof typeof G_PAIR] ? 2 : 1; out.push({ id: 'tr:' + k, key: KEYS.slots[i++], label: UNIT[k].name + (two > 1 ? ' ×2' : ''), sub: `${UNIT[k].cost * two} ore · ${UNIT[k].supply * two} supply`, off: trainBlock(g, b, k), icon: k, act: { t: 'train', k } }); }
    for (const u of UPGRADES.filter(u => u.at === b.kind && (u.team || 0) === fac(t))) { if (g.upOf(t)[u.key]) continue; if (i >= KEYS.slots.length) break; out.push({ id: 'up:' + u.key, key: KEYS.slots[i++], label: u.name, sub: `${u.cost} ore · ${u.blurb}`, off: researchBlock(g, b, u.key), act: { t: 'research', k: u.key } }); }
    if (TRAINS[b.kind]) {
      out.push({ id: 'rally', key: KEYS.rally, label: 'Rally point', sub: 'Where new bodies go', off: b.built ? '' : 'Still going up', on: lit('rally'), act: { t: 'aim', aim: { k: 'rally' } } });
      if (b.kind !== 'mothercap') out.push({ id: 'cancel', key: KEYS.cancel, label: 'Cancel last', sub: 'Ore back in full', off: b.queue.length ? (g.net ? 'Not online yet' : '') : 'Nothing queued', act: { t: 'cancel' } });
    }
    return out;
  }
  if (!sel.size) return out;
  const us = [...sel], workers = us.filter(u => isWorker(u.kind)), team = us[0].team;
  if (menu === 'build' && workers.length) {
    FACTION[team].builds.forEach((k, i) => { if (i < KEYS.builds.length) out.push({ id: 'bd:' + k, key: KEYS.builds[i], label: BLD[k].name, sub: `${BLD[k].cost} ore · ${BLD[k].blurb}`, off: buildBlock(g, k, team), icon: k, on: !!aim && aim.k === 'stake' && aim.b === k, act: { t: 'aim', aim: { k: 'stake', b: k } } }); });
    out.push({ id: 'back', key: KEYS.build, label: 'Back', sub: 'To the orders', off: '', act: { t: 'back' } });
    return out;
  }
  out.push({ id: 'move', key: KEYS.move, label: 'Move', sub: 'Then click the ground', off: '', on: lit('move'), act: { t: 'aim', aim: { k: 'move' } } });
  out.push({ id: 'stop', key: KEYS.stop, label: 'Stop', sub: 'Stand where they are', off: '', act: { t: 'stop' } });
  if (us.length > workers.length) out.push({ id: 'patrol', key: KEYS.patrol, label: 'Patrol', sub: 'Back and forth, fighting', off: '', on: lit('patrol'), act: { t: 'aim', aim: { k: 'patrol' } } });
  out.push({ id: 'release', key: KEYS.release, label: workers.length === us.length ? 'Back to work' : 'Back to squad', sub: 'The side\'s own orders again', off: '', act: { t: 'release' } });
  out.push({ id: 'jump', key: KEYS.jump, label: 'Jump in', sub: 'Drive the first one picked', off: '', act: { t: 'jump' } });
  if (workers.length) {
    out.push({ id: 'gather', key: KEYS.gather, label: 'Gather', sub: 'Then click a seam', off: '', on: lit('gather'), act: { t: 'aim', aim: { k: 'gather' } } });
    out.push({ id: 'build', key: KEYS.build, label: fac(team) === 2 ? 'Root' : fac(team) ? 'Grow' : 'Build', sub: 'Pick a building, then a spot', off: '', act: { t: 'buildMenu' } });
  }
  return out;
}
