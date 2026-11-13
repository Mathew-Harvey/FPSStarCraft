// Bloom, the Gloam's living carpet: their buildings spread it, and their units run faster and heal on it.
import * as THREE from 'three';
import { bloomPatch } from './look/art';
import { G_TUNE, type GBKind } from './numbers';

/** One spreading patch of Bloom under a building. */
export interface Patch { x: number; z: number; r: number; max: number; base: number; obj: THREE.Group; grow: THREE.Object3D; dying: boolean; owner: any }
/** All the Bloom on the map: grows patches toward their size, withers them when their building is gone, and answers "is this spot on Bloom". */
export class Bloom {
  patches: Patch[] = []; seed = 1; /** Teams that have grown Deep Bloom. */ deep = new Set<number>();
  isDeep(team: number) { return this.deep.has(team); }
  constructor(public scene: THREE.Scene | null) {}
  add(owner: any, kind: GBKind, x: number, z: number, full = false) {
    const max = G_TUNE.bloomR[kind] * (this.deep.has(owner?.team) ? 1.4 : 1), sd = this.seed++, obj = bloomPatch(sd, max), grow = obj.getObjectByName('grow')!;
    obj.position.set(x, .02 + (sd % 9) * .004, z); const p: Patch = { x, z, r: full ? max : 1.5, max, base: max, obj, grow, dying: false, owner }; grow.scale.set(p.r / max, 1, p.r / max);
    if (this.scene) this.scene.add(obj); this.patches.push(p); return p;
  }
  drop(owner: any) { for (const p of this.patches) if (p.owner === owner) p.dying = true; }
  deepen(team: number) { if (this.deep.has(team)) return; this.deep.add(team); for (const p of this.patches) if (p.owner?.team === team) p.max *= 1.4; }
  update(dt: number) {
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const p = this.patches[i];
      if (p.dying) { p.r -= dt * G_TUNE.bloomRate * 2; if (p.r <= .5) { if (this.scene) this.scene.remove(p.obj); this.patches.splice(i, 1); continue; } }
      else if (p.r < p.max) p.r = Math.min(p.max, p.r + dt * G_TUNE.bloomRate * (this.deep.has(p.owner?.team) ? 1.4 : 1));
      const k = p.r / p.base; p.grow.scale.set(k, 1, k);
    }
  }
  /** Is (x, z) on Bloom? `pad` shrinks the test so a building's whole footprint has to fit. */
  /** `team` limits it to one side's Bloom, for a match with the Gloam at both ends. */
  on(x: number, z: number, pad = 0, team = -1) { for (const p of this.patches) if (!p.dying && (team < 0 || p.owner?.team === team) && Math.hypot(x - p.x, z - p.z) < p.r * .9 - pad) return true; return false; }
  clear() { if (this.scene) for (const p of this.patches) this.scene.remove(p.obj); this.patches.length = 0; }
}
