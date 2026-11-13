// What each Gloam ability looks like, built from the shared effect kit (src/fx/kit.ts) so it keeps the same look and reads at every
// zoom. Each entry takes the kit and where it happens; the rules call GLOAM_FX[name](kit, o) when the ability goes off (stream D).
// For show only: nothing here changes the match, and it draws from no shared random stream.
import * as THREE from 'three';
import { FxKit, Fx, tell, beam, orb, cloud, ring, borrow } from '../../../fx/kit';

/** The Gloam colours: lime sap, bile, rot, acid, spore dust and the brown of turned earth. */
export const GC = { sap: '#b8ff3a', bile: '#9fd01c', rot: '#9b5cff', acid: '#e2ff2e', spore: '#8f9b52', soil: '#8a6a44', mend: '#7dffb0', cloud: '#6f8a6a' } as const;

type V3 = THREE.Vector3;
type At = V3 | (() => V3);
const pos = (a: At) => (typeof a === 'function' ? a() : a);
/** Where and when one ability goes off. Not every effect uses every field. */
export interface GfxAt { from?: At; to?: At; x?: number; z?: number; r?: number; time?: number; target?: THREE.Object3D; n?: number }

/** A thrown blob: an orb that arcs from `from` to `to` over `time`, `peak` metres over the straight line, a landing mark that fills
 *  while it flies, and `land` called where it comes down. */
export function arc(kit: FxKit, from: V3, to: V3, o: { time: number; peak: number; r: number; color: THREE.ColorRepresentation; land?: (at: V3) => void; mark?: boolean }): Fx {
  const P = new THREE.Vector3(); let t = 0, landed = false;
  const at = () => { const k = Math.min(1, t / o.time); return P.lerpVectors(from, to, k).setY(from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * o.peak); };
  const ball = orb({ at, r: o.r, color: o.color, time: o.time + .02, pulse: 1.5 });
  if (o.mark !== false) kit.add(tell({ x: to.x, z: to.z, r: Math.max(1, o.r * 4), time: o.time, color: o.color }));
  return kit.add({ obj: ball.obj, view: ball.view, dispose: ball.dispose,
    update(dt: number) { t += dt; const live = ball.update(dt); if (t >= o.time && !landed) { landed = true; o.land?.(to.clone()); } return live; } });
}

/** Each Gloam ability's effect, by the names the rules use (look/cast2.ts ACTS has the matching poses). */
export const GLOAM_FX: Record<string, (kit: FxKit, o: GfxAt) => void> = {
  /** Keeper: three Buds lobbed onto the Cap, each landing with a soft lime ring. */
  seed(kit, o) {
    const a = pos(o.from!), b = pos(o.to!);
    for (let i = 0; i < 3; i++) { const to = b.clone().add(new THREE.Vector3(Math.cos(i * 2.1) * 2.2, 1.5, Math.sin(i * 2.1) * 2.2)); arc(kit, a.clone().setY(a.y + 1.6), to, { time: .7 + i * .12, peak: 3, r: .35, color: GC.sap, mark: false, land: p => kit.add(ring({ x: p.x, z: p.z, y: p.y, r: 1.6, time: .5, color: GC.sap })) }); }
  },
  /** Keeper: the Spore Pod goes in, and a ring of Bloom runs out from it with a puff of spores. */
  pod(kit, o) { kit.add(ring({ x: o.x!, z: o.z!, r: o.r ?? 6, time: 1.4, color: GC.sap, band: .5 })); kit.add(cloud({ x: o.x!, z: o.z!, r: 1.6, color: GC.spore, time: 2.2, puffs: 5 })); },
  /** Keeper: a thread of lime sap from the gland to the patient, and a green pulse on it. */
  mend(kit, o) { kit.add(beam({ a: o.from!, b: o.to!, width: .22, color: GC.mend, time: .8 })); const t = pos(o.to!); kit.add(ring({ x: t.x, z: t.z, y: .1, r: 1.6, time: .7, color: GC.mend })); },
  /** Lobber: a fat gob of bile, a long high throw with a mark where it will land, and a splash that lingers as a small cloud. */
  lob(kit, o) {
    const a = pos(o.from!), b = pos(o.to!), d = a.distanceTo(b);
    arc(kit, a, b, { time: o.time ?? Math.max(.8, d / 14), peak: Math.max(3, d * .35), r: .6, color: GC.bile, land: p => { kit.add(ring({ x: p.x, z: p.z, r: o.r ?? 2.5, time: .4, color: GC.bile, band: .7 })); kit.add(cloud({ x: p.x, z: p.z, r: (o.r ?? 2.5) * .8, color: GC.bile, time: 1.6, puffs: 5 })); } });
  },
  /** Smother: Choke Spores, a dark cloud that rolls out over the circle and holds what is in it. */
  choke(kit, o) { kit.add(ring({ x: o.x!, z: o.z!, r: o.r ?? 3.5, time: .5, color: GC.spore })); kit.add(cloud({ x: o.x!, z: o.z!, r: o.r ?? 3.5, color: GC.spore, time: o.time ?? 3, seed: 7 })); },
  /** Smother: Rot Mind, a violet thread to the victim and the victim stained violet while it is borrowed (returns nothing; the stain
   *  comes off after `time`). */
  rot(kit, o) {
    kit.add(beam({ a: o.from!, b: o.to!, width: .08, color: GC.rot, time: .9 }));
    if (o.target) { const st = borrow(o.target, GC.rot, .5); let t = 0; const dur = o.time ?? 12; kit.add({ obj: new THREE.Group(), update(dt: number) { t += dt; st.update(t); if (t >= dur) { st.off(); return false; } return true; } }); }
  },
  /** Seeder: two husks flung in arcs, each landing in a puff of dry dust. */
  fling(kit, o) {
    const a = pos(o.from!), b = pos(o.to!);
    for (const s of [-1, 1]) { const to = b.clone().add(new THREE.Vector3(s * 1.2, 0, 0)); arc(kit, a.clone().setY(a.y + 1.8), to, { time: .9, peak: 4, r: .4, color: GC.soil, mark: false, land: p => kit.add(cloud({ x: p.x, z: p.z, r: 1.2, color: GC.soil, time: .9, puffs: 4 })) }); }
  },
  /** Bloater: a spray of acid onto the target and a sizzle of yellow round it. */
  acid(kit, o) { kit.add(beam({ a: o.from!, b: o.to!, width: .16, color: GC.acid, time: .35 })); const t = pos(o.to!); kit.add(cloud({ x: t.x, z: t.z, y: t.y - .6, r: 1.1, color: GC.acid, time: 1.2, puffs: 4 })); },
  /** Gnatwing: the bite jumping on to the next bodies, a quick lime spark from each to the next. */
  bite(kit, o) { kit.add(beam({ a: o.from!, b: o.to!, width: .06, color: GC.sap, time: .2 })); },
  /** Sower: the Pups dropping, each with a small ring where it lands. */
  drop(kit, o) { const a = pos(o.from!); for (let i = 0; i < (o.n ?? 4); i++) { const to = new THREE.Vector3(a.x + Math.cos(i * 1.7) * 1.8, 0, a.z + Math.sin(i * 1.7) * 1.8); arc(kit, a, to, { time: .55, peak: .2, r: .25, color: GC.sap, mark: false, land: p => kit.add(ring({ x: p.x, z: p.z, r: 1, time: .35, color: GC.soil })) }); } },
  /** Hooksail: Reel, the tail line thrown out to the body and hauled in. */
  reel(kit, o) { kit.add(beam({ a: o.from!, b: o.to!, width: .07, color: GC.bile, time: o.time ?? .9 })); },
  /** Hooksail: Spore Cloud, a wide drifting cloud that shots will not get through. */
  cloud(kit, o) { kit.add(cloud({ x: o.x!, z: o.z!, r: o.r ?? 5, color: GC.cloud, time: o.time ?? 8, seed: 11 })); },
  /** Hooksail: Drink, sap drawn up out of its own growth into it. */
  drink(kit, o) { kit.add(beam({ a: o.from!, b: o.to!, width: .2, color: GC.sap, time: o.time ?? 1.2 })); const t = pos(o.from!); kit.add(ring({ x: t.x, z: t.z, r: 3, time: .8, color: GC.sap })); },
  /** Any body digging in or coming up: a ring of thrown earth and a little dust. */
  dig(kit, o) { kit.add(ring({ x: o.x!, z: o.z!, r: o.r ?? 1.6, time: .5, color: GC.soil, band: .6 })); kit.add(cloud({ x: o.x!, z: o.z!, r: (o.r ?? 1.6) * .8, color: GC.soil, time: .9, puffs: 4 })); },
  /** Stinger Stalk or Puffball rooting or uprooting: the same, bigger. */
  root(kit, o) { GLOAM_FX.dig(kit, { ...o, r: o.r ?? 2.6 }); },
  /** Needler: a line of spines along the ground, a mark the length of the line. */
  fire(kit, o) { kit.add(beam({ a: o.from!, b: o.to!, width: .1, color: '#e8e0c0', time: .3 })); },
};
