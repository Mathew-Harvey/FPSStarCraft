// A bot side's money, ore and Flux together, for the faction brains. A brain asks its purse "can I buy this, keeping back what I am
// saving for?" instead of comparing cash() against an ore cost, so a kind or research that costs Flux is only bought when the Flux is there.
// It also puts workers on the vents the side has tapped. Nothing here runs unless a brain calls it.
import type { Game } from '../game';
import type { Unit, Kind, BKind, UpKey } from '../data';
import { isWorker } from '../data';
import { type Cost, costOf, canPay, shortOf, tapped, sendToVent } from './econ';

type Buyable = Kind | BKind | UpKey;
const asCost = (c: Buyable | Cost): Cost => Array.isArray(c) ? c : costOf(c);

/** One side's purse for one brain step. Make a fresh one each step: it reads the side's ore and Flux when asked. */
export class Purse {
  /** What the brain is keeping back this step (for a bigger body, a home building, research). */
  held: Cost = [0, 0];
  constructor(public g: Game, public team: number) {}
  /** Ore and Flux on hand. */
  get ore() { return this.g.cash(this.team); }
  get flux() { return this.g.flux(this.team); }
  /** Keeps a price back: later `can` checks leave it untouched. Returns the purse, so calls chain. */
  hold(c: Buyable | Cost, n = 1) { const p = asCost(c); this.held = [this.held[0] + p[0] * n, this.held[1] + p[1] * n]; return this; }
  /** Lets go of everything kept back. */
  free() { this.held = [0, 0]; return this; }
  /** Can the side buy this (n times over) and still have what it is keeping back? Pass keep false to spend into what is held. */
  can(c: Buyable | Cost, n = 1, keep = true) { const p = asCost(c), h = keep ? this.held : [0, 0]; return canPay(this.g, this.team, [p[0] * n + h[0], p[1] * n + h[1]]); }
  /** What the side is short of for this, in plain words ('' when it can pay). */
  short(c: Buyable | Cost, n = 1) { return shortOf(this.g, this.team, asCost(c), n); }
  /** Is Flux, not ore, the thing stopping this? (A brain then sends workers to the vents rather than waiting.) */
  wantsFlux(c: Buyable | Cost) { const p = asCost(c); return p[1] > 0 && this.flux < p[1] + this.held[1]; }
}
export const purseOf = (g: Game, team: number) => new Purse(g, team);

/** Puts a side's workers on the vents it has tapped: up to `per` on each (three is the StarCraft number), taken from the ore nearest the
 *  tap. While the side holds more than `enough` Flux it sends one a step back to ore instead. Returns how many are on Flux now. */
export function staffVents(g: Game, team: number, per = 3, enough = 600): number {
  const crew = g.units.filter(u => u.alive && u.team === team && isWorker(u.kind) && !u.pilot && !u.inside);
  const on = crew.filter(u => u.vent); if (!crew.length) return 0;
  if (g.flux(team) > enough) { const u = on.find(x => !(x.fluxing! > 0)); if (u) { sendToVent(g, u, null); return on.length - 1; } return on.length; }
  let n = on.length;
  for (const v of g.vents) {
    if (!tapped(g, v, team)) continue;
    for (let here = on.filter(u => u.vent === v).length; here < per; here++) {
      // Never strip the ore line bare: at least half the side's workers stay on ore.
      if (crew.length - n <= Math.ceil(crew.length / 2)) return n;
      const pick = crew.filter(u => !u.vent && !u.site && !(u.carrying > 0) && u.state !== 'building').sort((a, b) => Math.hypot(a.pos.x - v.pos.x, a.pos.z - v.pos.z) - Math.hypot(b.pos.x - v.pos.x, b.pos.z - v.pos.z))[0];
      if (!pick) break; sendToVent(g, pick, v); n++;
    }
  }
  return n;
}
/** True if a worker is carrying Flux or walking to a vent (a brain should not pull it off for building). */
export const onFlux = (u: Unit) => !!u.vent;
