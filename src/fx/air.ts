// Fliers and lifted buildings: a soft shadow on the ground under each and a thin line down to it, so a flier's height and place can be read
// from any zoom. src/core/air.ts calls AIR.shadow every tick for each body in the air; a body that lands, dies or leaves the scene loses its
// shadow at the next draw.
import * as THREE from 'three';
import { AIR } from '../core/air';
import { UNIT } from '../data';
import type { Unit, Building } from '../data';
import { PRE_DRAW } from '../gfx';
import { FxKit, lift } from './kit';

type Entry = { fx: ReturnType<typeof lift>; t: Unit | Building };
const KITS = new Map<THREE.Scene, { kit: FxKit; on: Map<THREE.Object3D, Entry> }>();
const flat = () => 0;

AIR.shadow = (g, t, alt) => {
  const scene = g.scene as THREE.Scene; let k = KITS.get(scene);
  if (!k) KITS.set(scene, k = { kit: new FxKit(scene), on: new Map() });
  const obj = t.obj; let e = k.on.get(obj);
  if (!e) {
    if (!(alt > .3)) return;
    const u = t as Unit, b = t as Building, r = 'hx' in b && b.hx ? Math.max(b.hx, b.hz) * 1.1 : (UNIT[u.kind]?.rad ?? .6) * 2.2;
    e = { fx: k.kit.add(lift(obj, { r, ground: flat })), t }; k.on.set(obj, e);
  }
};

PRE_DRAW.push(scene => {
  const k = KITS.get(scene); if (!k) return;
  for (const [obj, e] of k.on) if (!e.t.alive || !obj.parent || !(e.t.air || (e.t.alt || 0) > .3)) { e.fx.off(); k.on.delete(obj); }
  k.kit.update(0);
});
/** Only for tests: how many shadows are up in a scene. */
export const airShadows = (scene: THREE.Scene) => KITS.get(scene)?.on.size ?? 0;
