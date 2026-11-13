// The undiscovered map. Each side only knows the ground its own bodies and buildings have looked at.
// It is worked out on each player's own screen from the bodies it can see, so the server never needs it.
import type { Game } from './game';
import { MAP } from './data';
import { isFriend } from './core/sides';

const CELL = 4;
/** How far each kind of body or building sees, in metres. */
export const SIGHT: Record<string, number> = { longshot: 46, gantry: 38, warden: 40, watchpost: 48, headframe: 36, choir: 40 };

export class Fog {
  /** Cells this side has ever seen (1), and cells it can see right now (2). */
  cells: Uint8Array; n: number; x0: number; z0: number; private t = 0;
  constructor() {
    const [cx, cz] = MAP.mid!, half = MAP.rad! * 1.15;
    this.n = Math.ceil(half * 2 / CELL); this.x0 = cx - half; this.z0 = cz - half; this.cells = new Uint8Array(this.n * this.n);
  }
  private idx(x: number, z: number) { const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL); return i < 0 || j < 0 || i >= this.n || j >= this.n ? -1 : j * this.n + i; }
  /** Ever seen by this side. */
  seen(x: number, z: number) { const i = this.idx(x, z); return i >= 0 && this.cells[i] > 0; }
  /** In sight right now. */
  sees(x: number, z: number) { const i = this.idx(x, z); return i >= 0 && this.cells[i] === 2; }
  private stamp(x: number, z: number, r: number) {
    const c = this.cells, n = this.n, ci = (x - this.x0) / CELL, cj = (z - this.z0) / CELL, rr = r / CELL;
    for (let j = Math.max(0, Math.floor(cj - rr)); j <= Math.min(n - 1, Math.ceil(cj + rr)); j++) for (let i = Math.max(0, Math.floor(ci - rr)); i <= Math.min(n - 1, Math.ceil(ci + rr)); i++) if ((i + .5 - ci) ** 2 + (j + .5 - cj) ** 2 <= rr * rr) c[j * n + i] = 2;
  }
  /** Redraws what this side sees, a few times a second. */
  update(g: Game, dt: number, force = false) {
    this.t -= dt; if (this.t > 0 && !force) return; this.t = .25; const c = this.cells, team = g.myTeam;
    for (let i = 0; i < c.length; i++) if (c[i] === 2) c[i] = 1;
    for (const u of g.units) if (u.alive && (u.team === team || isFriend(u.team, team))) this.stamp(u.pos.x, u.pos.z, SIGHT[u.kind] || 30);
    for (const b of g.buildings) if (b.alive && (b.team === team || isFriend(b.team, team))) this.stamp(b.pos.x, b.pos.z, SIGHT[b.kind] || (b.built ? 26 : 14));
  }
}
