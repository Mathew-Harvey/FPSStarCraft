// The undiscovered map. Each side only knows the ground its own bodies and buildings have looked at.
// It is worked out on each player's own screen from the bodies it can see, so the server never needs it.
import type { Game } from './game';
import { MAP } from './data';
import { isFriend } from './core/sides';
import { TER, STEP, BEACON, h as groundH } from './terrain';

const CELL = 4;
/** How far each kind of body or building sees, in metres. */
export const SIGHT: Record<string, number> = { longshot: 46, gantry: 38, warden: 40, watchpost: 48, headframe: 36, choir: 40 };

export class Fog {
  /** Cells this side has ever seen (1), and cells it can see right now (2). */
  cells: Uint8Array; n: number; x0: number; z0: number; private t = 0;
  /** Everything in sight: someone watching a match online, who is sent the whole world (src/watch.ts). */
  all = false;
  /** How high the ground stands in each cell, in tenths of a metre (high ground, see terrain.ts). */
  lvl: Uint8Array;
  constructor() {
    const [cx, cz] = MAP.mid!, half = MAP.rad! * 1.15;
    this.n = Math.ceil(half * 2 / CELL); this.x0 = cx - half; this.z0 = cz - half; this.cells = new Uint8Array(this.n * this.n); this.lvl = new Uint8Array(this.n * this.n);
    if (TER.ridges.length) for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) this.lvl[j * this.n + i] = Math.min(255, Math.round(groundH(this.x0 + (i + .5) * CELL, this.z0 + (j + .5) * CELL) * 10));
  }
  private idx(x: number, z: number) { const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL); return i < 0 || j < 0 || i >= this.n || j >= this.n ? -1 : j * this.n + i; }
  /** Ever seen by this side. */
  seen(x: number, z: number) { const i = this.idx(x, z); return i >= 0 && this.cells[i] > 0; }
  /** In sight right now. */
  sees(x: number, z: number) { const i = this.idx(x, z); return i >= 0 && this.cells[i] === 2; }
  /** Marks what a body at (x, z) standing `y` metres up sees: everything within r, except high ground above it. */
  private stamp(x: number, z: number, r: number, y = 99) {
    const c = this.cells, L = this.lvl, top = (y + STEP) * 10, n = this.n, ci = (x - this.x0) / CELL, cj = (z - this.z0) / CELL, rr = r / CELL;
    for (let j = Math.max(0, Math.floor(cj - rr)); j <= Math.min(n - 1, Math.ceil(cj + rr)); j++) for (let i = Math.max(0, Math.floor(ci - rr)); i <= Math.min(n - 1, Math.ceil(ci + rr)); i++) if ((i + .5 - ci) ** 2 + (j + .5 - cj) ** 2 <= rr * rr && L[j * n + i] <= top) c[j * n + i] = 2;
  }
  /** How high the ground is in the cell under (x, z), in metres. */
  level(x: number, z: number) { const i = this.idx(x, z); return i < 0 ? 0 : this.lvl[i] / 10; }
  /** Redraws what this side sees, a few times a second. */
  update(g: Game, dt: number, force = false) {
    this.t -= dt; if (this.t > 0 && !force) return; this.t = .25; const c = this.cells, team = g.myTeam;
    if (this.all) { c.fill(2); return; }
    for (let i = 0; i < c.length; i++) if (c[i] === 2) c[i] = 1;
    for (const u of g.units) if (u.alive && (u.team === team || isFriend(u.team, team))) this.stamp(u.pos.x, u.pos.z, SIGHT[u.kind] || 30, u.pos.y);
    for (const b of g.buildings) if (b.alive && (b.team === team || isFriend(b.team, team))) this.stamp(b.pos.x, b.pos.z, SIGHT[b.kind] || (b.built ? 26 : 14), b.pos.y);
    // A Survey Beacon this side holds sees round it, high ground included.
    for (const B of TER.beacons) if (B.alive && B.held & (1 << team)) this.stamp(B.x, B.z, BEACON.SEE);
  }
}
