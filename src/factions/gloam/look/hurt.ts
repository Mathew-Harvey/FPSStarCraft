// A hurt growth: as a Gloam building loses health its skin darkens and browns toward dead wood, and below half health it bleeds lime
// sap in slow puffs, faster as it nears death. The engine already leans it over at two thirds and one third (Game.crack). Read on every
// screen from the building's health (which every snapshot carries), so a player, a watcher and a replay all see it; it reads from
// close up to the full map. For show only: nothing here changes the match, and it draws from no shared random stream.
import * as THREE from 'three';
import { M } from '../../../gfx';
import { fac, type Building } from '../../../data';
import type { Game } from '../../../game';

/** Where the skin goes as a growth dies: dry, dark brown. */
const DEAD = new THREE.Color('#3b2e22');
type Hurt = { k: number; mats: { m: THREE.ShaderMaterial; base: THREE.Color }[]; sapT: number; n: number };
const HURT = new WeakMap<THREE.Object3D, Hurt>();
const P = new THREE.Vector3();

/** The building's own copies of its painted materials, made the first time it is hurt (the shared ones stay as they are). */
function own(obj: THREE.Object3D): Hurt['mats'] {
  const out: Hurt['mats'] = [], done = new Map<THREE.Material, THREE.ShaderMaterial>();
  obj.traverse(o => {
    const m = o as THREE.Mesh; const mat = m.material as THREE.ShaderMaterial;
    if (!m.isMesh || Array.isArray(m.material) || !mat.uniforms?.uColor) return;
    let c = done.get(mat);
    if (!c) { c = mat.clone(); c.uniforms = { ...mat.uniforms, uColor: { value: (mat.uniforms.uColor.value as THREE.Color).clone() } }; c.userData = { ...mat.userData }; done.set(mat, c); out.push({ m: c, base: (mat.uniforms.uColor.value as THREE.Color).clone() }); }
    m.material = c;
  });
  return out;
}

/** Every frame on every screen: darken and bleed each hurt Gloam growth. */
export function hurtLook(g: Game, dt: number) {
  if (g.noRender) return;
  for (const b of g.buildings as Building[]) {
    if (!b.alive || !b.built || fac(b.team) !== 2 || !b.obj) continue;
    const k = Math.max(0, Math.min(1, 1 - b.hp / Math.max(1, b.maxHp)));
    let h = HURT.get(b.obj);
    if (!h) { if (k < .08) continue; h = { k: -1, mats: own(b.obj), sapT: 0, n: b.id * 7 }; HURT.set(b.obj, h); }
    if (Math.abs(k - h.k) > .015) {
      h.k = k; const d = Math.max(0, (k - .08) / .92);
      for (const { m, base } of h.mats) (m.uniforms.uColor.value as THREE.Color).copy(base).lerp(DEAD, d * .85).multiplyScalar(1 - d * .4);
    }
    // sap: below 60% health, a lime puff from the growth's crown, every 1.4 s at 60% down to every .3 s near death. Seen from
    // high up (the command view) the puffs grow with the distance and glow, so they still read as specks of light.
    if (k > .4) {
      h.sapT -= dt;
      if (h.sapT <= 0) {
        h.sapT = 1.4 - (k - .4) * 1.83; h.n++;
        const a = h.n * 2.399, r = Math.max(b.hx, b.hz) * (.35 + .25 * ((h.n * .618) % 1));
        P.set(b.pos.x + Math.cos(a) * r * .6, (b.h || 4) * (.85 + .2 * ((h.n * .382) % 1)) + .3, b.pos.z + Math.sin(a) * r * .6); // from its crown, where a puff is not lost inside the growth
        const far = Math.max(1, Math.min(2.6, g.cam.position.distanceTo(P) / 24));
        g.puff(P, 4 + Math.round(k * 4), (.7 + k * .7) * far, far > 1.4 ? M.gGlow : M.gS, .35, .8, far > 1.4 ? 2.4 : 1.6);
        if (far > 1.4) h.sapT *= .6;
      }
    }
  }
}
