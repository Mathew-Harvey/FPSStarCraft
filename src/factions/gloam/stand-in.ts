// Stand-in models for the new Gloam buildings until their own art lands (stream G's look files load after this and replace them):
// each is the nearest old Gloam building, stretched to the new building's footprint and height, so it still grows its Bloom,
// shows its Buds (the Caps) and falls like the rest. The new bodies use the engine's plain stand-in (src/core/plain.ts).
import * as THREE from 'three';
import * as MD from '../../models';
import { BLD } from '../../data';
import { defineBuildings } from '../../core/registry';
import type { GBKind } from './numbers';

const LIKE: Partial<Record<GBKind, GBKind>> = {
  eldercap: 'mothercap', ancientcap: 'mothercap', ventbladder: 'sporesac', shellpit: 'blisterbed', puffball: 'stinger', rotden: 'warren',
  wingspire: 'quillgarden', tallspire: 'quillgarden', deeproot: 'oldgrowth', tunnelroot: 'sporesac', needleden: 'quillgarden', sporepod: 'sporesac',
};
const BOX = new THREE.Box3(), SIZE = new THREE.Vector3();
function standIn(k: GBKind, like: GBKind, anim: ((t: number) => void)[]) {
  const inner = MD.gloamB(like, anim), st = BLD[k]; BOX.setFromObject(inner); BOX.getSize(SIZE);
  inner.scale.set(st.hx * 2 / Math.max(.1, SIZE.x), st.h / Math.max(.1, SIZE.y), st.hz * 2 / Math.max(.1, SIZE.z));
  const g = new THREE.Group(); g.add(inner); g.userData = inner.userData; g.name = k; return g;
}
defineBuildings(Object.fromEntries(Object.entries(LIKE).map(([k, like]) => [k, { model: (a: ((t: number) => void)[]) => standIn(k as GBKind, like!, a) }])));
