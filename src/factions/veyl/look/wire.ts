// Hangs the new Veyl figures (figures.ts) on the registry: the model a body of each kind is built from, and its stances laid over the
// shared Veyl glide each frame. Only how they look: the rules stream gives these kinds their numbers, and until it does nothing spawns them.
import type * as THREE from 'three';
import * as T from 'three';
import { defineUnits, defineBuildings } from '../../../core/registry';
import { figure } from '../../../meshes';
import { M } from '../../../gfx';
import type { Model } from '../../../models';
import { VEYL_NEW, VEYL_HALLS, POSES, veylBody, pose } from './figures';

/** The model for a new kind: its sculpt, or the stand-in with the same groups. */
function model(kind: string): Model {
  const root = veylBody(kind), f = (n: string) => root.getObjectByName(n) as THREE.Object3D | undefined;
  let top = 0; root.updateMatrixWorld(true); root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.computeBoundingBox(); top = Math.max(top, m.geometry.boundingBox!.max.y + m.getWorldPosition(m.position.clone().set(0, 0, 0)).y); } });
  return { obj: root, rig: { body: f('body') || root, head: f('head'), armL: f('armL'), armR: f('armR'), legL: f('legL'), legR: f('legR'), halo: f('halo'), height: Math.max(1, top) } };
}
/** Which stance a body is in this frame: an ability or attack while it swings, a run while dashing, a walk while moving, else one of
 *  its rest poses picked by its number so neighbours do not stand alike. */
function stanceOf(kind: string, u: any): string {
  const P = POSES[kind as keyof typeof POSES]; if (!P) return '';
  if (u.swing > .05 && P.attack) return 'attack';
  if (u.moving) return u.dashT > 0 && P.run ? 'run' : P.walk ? 'walk' : '';
  const rests = Object.keys(P).filter(n => n.startsWith('rest')); return rests.length ? rests[u.id % rests.length] : '';
}
const looks: Record<string, any> = {};
for (const kind of VEYL_NEW) looks[kind] = {
  figure: () => model(kind),
  pose(g: any, u: any) {
    let full = u.vRig as Record<string, THREE.Object3D | undefined> | undefined;
    if (!full || u.vRigOf !== u.obj) { full = { ...u.rig }; u.obj.traverse((o: THREE.Object3D) => { if (o.name && !full![o.name] && !(o as THREE.Mesh).isMesh) full![o.name] = o; }); u.vRig = full; u.vRigOf = u.obj; u.vUndo = null; }   // with the extra groups: orb, wings, leaves, bodyB
    if (u.vUndo) u.vUndo();
    const n = stanceOf(kind, u), fn = n ? POSES[kind as keyof typeof POSES][n] : null;
    u.vUndo = fn ? pose(full, fn, n === 'attack' ? Math.min(1, u.swing) : g.time + u.id, 1) : null;
    return true;
  },
};
defineUnits(looks);

// The new buildings: the sculpt with its moving parts turned each frame (rings spin, the bell sways, the drop, note, lens and pages float),
// or a plain plated mound with a crystal on it when the page carries no sculpt (the match server, tests).
const HALL_H: Record<string, number> = { siphonbell: 6.4, mendingpool: 4.6, duskhall: 6.6, kiln: 7.4, skyloft: 9.6, tuningfork: 11, quiethouse: 6.2, songarchive: 8, highbeacon: 15 };
function hall(kind: string, anim: ((t: number) => void)[]): T.Group {
  const fig = figure(kind);
  if (!fig) {
    const g = new T.Group(), h = HALL_H[kind] || 6, base = new T.Mesh(new T.CylinderGeometry(1.6, 2.4, 1, 10), M.vD), top = new T.Mesh(new T.ConeGeometry(.5, h - 1, 6), M.vC);
    base.position.y = .5; top.position.y = 1 + (h - 1) / 2; g.add(base, top); return g;
  }
  const G = fig.groups, base: Record<string, number> = {}; for (const k in G) base[k] = G[k].position.y;
  anim.push(t => {
    for (const [n, sp] of [['ring0', .5], ['ring1', -.7], ['halo', .4]] as [string, number][]) if (G[n]) { G[n].rotation.y = t * sp; G[n].position.y = base[n] + Math.sin(t * .8 + sp) * .12; }
    if (G.bell) { G.bell.rotation.z = Math.sin(t * .9) * .05; G.bell.rotation.x = Math.cos(t * .7) * .04; }
    for (const n of ['drop', 'note', 'pages']) if (G[n]) { G[n].position.y = base[n] + Math.sin(t * 1.1) * .15; G[n].rotation.y = t * (n === 'pages' ? .35 : .6); }
    if (G.lens) G.lens.rotation.y = Math.sin(t * .25) * .5;
  });
  return fig.root;
}
const halls: Record<string, any> = {};
for (const kind of VEYL_HALLS) halls[kind] = { model: (anim: ((t: number) => void)[]) => hall(kind, anim) };
defineBuildings(halls);
