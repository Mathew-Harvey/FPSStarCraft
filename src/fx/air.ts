// Fliers and lifted buildings: a soft shadow on the ground under each and a thin line down to it, so a flier's height and place can be read
// from any zoom. src/core/air.ts calls AIR.shadow every tick for each body in the air; a body that lands, dies or leaves the scene loses its
// shadow at the next draw.
import * as THREE from 'three';
import { L_FX } from '../gfx';
import { AIR } from '../core/air';
import { UNIT } from '../data';
import type { Unit, Building } from '../data';
import { PRE_DRAW } from '../gfx';
import { FxKit, lift } from './kit';

type Entry = { fx: ReturnType<typeof lift>; t: Unit | Building };
const KITS = new Map<THREE.Scene, { kit: FxKit; on: Map<THREE.Object3D, Entry> }>();
const flat = () => 0, BOX = new THREE.Box3(), TMP = new THREE.Box3();

AIR.shadow = (g, t, alt) => {
  const scene = g.scene as THREE.Scene; let k = KITS.get(scene);
  if (!k) KITS.set(scene, k = { kit: new FxKit(scene), on: new Map() });
  const obj = t.obj; let e = k.on.get(obj);
  if (!e) {
    if (!(alt > .3)) return;
    // As wide as the body seen from above (its wings and all), not its footprint on the ground: a small flier gets a small shadow.
    const u = t as Unit, b = t as Building; let r = 'hx' in b && b.hx ? Math.max(b.hx, b.hz) * 1.1 : (UNIT[u.kind]?.rad ?? .6) * 1.2;
    BOX.makeEmpty(); obj.updateMatrixWorld(true); obj.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh && m.visible && m.geometry && !(m.layers.mask & (1 << L_FX))) { m.geometry.boundingBox || m.geometry.computeBoundingBox(); BOX.union(TMP.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld)); } });
    if (!BOX.isEmpty()) r = Math.max(.3, Math.min(r * 2, .42 * Math.max(BOX.max.x - BOX.min.x, BOX.max.z - BOX.min.z)));
    const fx = k.kit.add(lift(obj, { r, ground: flat })); e = { fx, t }; k.on.set(obj, e);
  }
};

PRE_DRAW.push(scene => {
  const k = KITS.get(scene); if (!k) return;
  for (const [obj, e] of k.on) if (!e.t.alive || !obj.parent || !(e.t.air || (e.t.alt || 0) > .3)) { e.fx.off(); k.on.delete(obj); }
  k.kit.update(0);
});
/** Only for tests: how many shadows are up in a scene. */
export const airShadows = (scene: THREE.Scene) => KITS.get(scene)?.on.size ?? 0;
