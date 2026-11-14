// Hangs the new Veyl figures (figures.ts) on the registry: the model a body of each kind is built from, and its stances laid over the
// shared Veyl glide each frame. Only how they look: the rules stream gives these kinds their numbers, and until it does nothing spawns them.
import type * as THREE from 'three';
import * as T from 'three';
import { defineUnits, defineBuildings, defineFaction, type VmPose } from '../../../core/registry';
import { abilitiesOf } from '../../../core/ability';
import { figure } from '../../../meshes';
import { M, heldMaterial } from '../../../gfx';
import type { Model } from '../../../models';
import type { Game } from '../../../game';
import type { Unit } from '../../../data';
import { V_TUNE } from '../numbers';
import { unfolded } from '../fields';
import * as F from './figures';
import { VEYL_NEW, VEYL_HALLS, POSES, veylBody, pose } from './figures';

/** The model for a new kind: its sculpt, or the stand-in with the same groups. */
function model(kind: string): Model {
  const root = veylBody(kind), f = (n: string) => root.getObjectByName(n) as THREE.Object3D | undefined;
  let top = 0; root.updateMatrixWorld(true); root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.computeBoundingBox(); top = Math.max(top, m.geometry.boundingBox!.max.y + m.getWorldPosition(m.position.clone().set(0, 0, 0)).y); } });
  return { obj: root, rig: { body: f('body') || root, head: f('head'), armL: f('armL'), armR: f('armR'), legL: f('legL'), legR: f('legR'), halo: f('halo'), height: Math.max(1, top) } };
}
/** Which stance a body is in this frame: an ability or attack while it swings, a run while dashing, a walk while moving, else one of
 *  its rest poses picked by its number so neighbours do not stand alike. */
function stanceOf(kind: string, u: any, now: number): string {
  const P = POSES[kind as keyof typeof POSES]; if (!P) return '';
  const ab = u.vAb as { pose: string; t: number } | undefined;          // an ability just went off (see the show wrap below): its own pose
  if (ab && now - ab.t < 1.1 && P[ab.pose]) return ab.pose;
  if (kind === 'listener' && u.settled && P.settle) return 'settle';     // the two that stay changed until told otherwise
  if (kind === 'ferry' && unfolded(u) && P.unfold) return 'unfold';
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
    const n = stanceOf(kind, u, g.time), fn = n ? POSES[kind as keyof typeof POSES][n] : null;
    const once = n === 'attack' ? Math.min(1, u.swing) : u.vAb && n === u.vAb.pose && n !== 'settle' && n !== 'unfold' ? Math.min(1, (g.time - u.vAb.t) / 1.1) : -1;   // a one-off pose runs 0 to 1 once
    u.vUndo = fn ? pose(full, fn, once >= 0 ? once : g.time + u.id, 1) : null;
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


// ------------------------------------------------------------------------------------------------- first person
// A new kind driven from its seat holds its own sculpted arms (figures.ts VM table) in front of the camera instead of the old Veyl hand and
// blade. Each mode is made once per game and kept on g.vm, the way Ironhold's view models are. Just after an ability, the arms take that
// ability's mode when the table has one (the Tuner lifts its pane for Glass Wall, the Knell heaves its orb for Toll).
const VM_OF: Record<string, string> = { wall: 'pane', step: 'step', shatter: 'cast', drain: 'cast', join: 'cast', toll: 'toll', stone: 'still', gather: 'cast', hold: 'cast' };
const NO_VM = new Set<string>();
function seat(g: Game, vp: VmPose) {
  const me = g.me as any, modes = F.VM[me.kind]; if (!modes) return;
  const ab = me.vAb as { key: string; t: number } | undefined, cast = ab && g.time - ab.t < .9 ? VM_OF[ab.key] : '', mode = cast && modes[cast] ? cast : Object.keys(modes)[0], key = `v_${me.kind}_${mode}`;
  let v = g.vm[key];
  if (!v) {
    if (NO_VM.has(key)) return; const made = F.viewModel(me.kind, mode); if (!made) { NO_VM.add(key); return; }
    v = new T.Group(); v.add(made); v.userData.rest = [0, 0, 0, 0, 0, 0]; v.traverse(o => { const q = o as THREE.Mesh; if (q.isMesh && !Array.isArray(q.material)) q.material = heldMaterial(q.material); });
    g.cam.add(v); g.vm[key] = v;
  }
  vp(v, 0, g.recoil * .08, 0);
}
const views: Record<string, any> = {};
for (const kind of VEYL_NEW) if (F.VM[kind]) views[kind] = { view: (g: Game, vp: VmPose) => seat(g, vp) };
defineUnits(views);

// ------------------------------------------------------------------------------------------------- ability effects
// The rules stream's abilities (units.ts) draw a puff and a sound; this lays the sketched effect from figures.ts over each, and marks the
// caster so its pose hook plays the matching pose. All of it is for show: it runs wherever the ability's show runs, rolls no dice, and a
// fault in it never stops the game. Glass Wall, Toll and Shatter Note keep the rules stream's own looks (a pane, a rolling orb, a marked
// circle), so they only get the pose.
type Live = { fx: F.Fx; t0: number; follow?: Unit; keep?: () => boolean };
const LIVE = new WeakMap<Game, Live[]>();
const V3 = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
function play(g: Game, fx: F.Fx, x: number, y: number, z: number, yaw = 0, follow?: Unit, keep?: () => boolean) {
  if (g.noRender || typeof window === 'undefined') return;
  fx.obj.position.set(x, y, z); fx.obj.rotation.y = yaw; g.scene.add(fx.obj); fx.tick(0);
  let L = LIVE.get(g); if (!L) LIVE.set(g, L = []); L.push({ fx, t0: g.time, follow, keep });
}
const POSE_OF: Record<string, string> = { wall: 'glasswall', hum: 'wardhum', voice: 'falsevoice', step: 'stepthrough', shatter: 'shatter', drain: 'drain', join: 'join', toll: 'toll', settle: 'settle', unfold: 'unfold', lift: 'lift', burn: 'burnbright', reveal: 'reveal', stone: 'still', gather: 'gather', hold: 'holdtime', shrill: 'attack' };
const TN = V_TUNE as any;
const FX_OF: Record<string, (g: Game, u: Unit, t: { x: number; z: number; id?: number }, o: any) => void> = {
  hum: (g, u) => play(g, F.wardHum(TN.tuner.humR, Math.min(6, TN.tuner.humT)), u.pos.x, 0, u.pos.z, 0, u),
  step: (g, u) => { if (g.myTeam !== u.team) return; play(g, F.stepThrough(.01), u.pos.x, 0, u.pos.z, u.yaw); },      // unseen: only its own side sees where it came out
  skip: (g, u) => play(g, F.skip(4), u.pos.x, 0, u.pos.z, u.yaw + Math.PI),
  drain: (g, u, _t, o) => { if (o) play(g, F.drain(V3(o.pos.x, 1.4 + (o.alt || 0), o.pos.z), V3(u.pos.x, 2, u.pos.z)), 0, 0, 0); },
  join: (g, u) => { const o = g.units.find(x => x !== u && x.alive && x.team === u.team && x.kind === 'choirmaster' && Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z) < 8); play(g, F.join(V3(u.pos.x, 0, u.pos.z), o ? V3(o.pos.x, 0, o.pos.z) : V3(u.pos.x + 2, 0, u.pos.z)), 0, 0, 0); },
  settle: (g, u) => { if ((u as any).settled) play(g, F.settle(8), u.pos.x, 0, u.pos.z, 0, u, () => !!(u as any).settled); },   // stays while it sits
  unfold: (g, u) => { if (unfolded(u)) play(g, F.unfold(5), u.pos.x, 0, u.pos.z, 0, u, () => unfolded(u)); },
  lift: (g, _u, _t, o) => { if (o) play(g, F.lift(3, TN.swift.liftT), o.pos.x, 0, o.pos.z, 0, o); },
  burn: (g, u) => play(g, F.burnBright(6, 3), u.pos.x, (u.alt || 0) + 1, u.pos.z, u.yaw, u),
  shrill: (g, u) => play(g, F.shrill(5, 1.2), u.pos.x, (u.alt || 0) + .9, u.pos.z, u.yaw, u),
  reveal: (g, _u, t) => play(g, F.reveal(TN.omen.revealR, Math.min(8, TN.omen.revealT)), t.x, 0, t.z),
  stone: (g, u, t) => { if (g.myTeam === u.team) play(g, F.stillStone(TN.omen.stoneR, TN.omen.stoneArm, 6), t.x, 0, t.z); },   // a trap: its own side only
  gather: (g, _u, t) => play(g, F.gather(TN.cantus.gatherR, 2.5), t.x, 0, t.z),
  hold: (g, _u, t) => play(g, F.holdTime(TN.cantus.holdR, TN.cantus.holdT), t.x, 0, t.z),
};
const KINDS = ['cantor', 'lancer', ...VEYL_NEW];
function wrapShows() {
  for (const kind of KINDS) for (const a of abilitiesOf(kind)) {
    const orig = a.show, key = a.key, fx = FX_OF[key], ps = POSE_OF[key];
    if ((!fx && !ps) || (a as any).vLook) continue;      // each ability once, and again if a later table replaces it
    (a as any).vLook = true;
    a.show = (g, u, t, o) => {
      orig?.(g, u, t, o);
      try { (u as any).vAb = { key, pose: ps || '', t: g.time }; fx?.(g, u, t, o); } catch (e) { console.warn('veyl look', key, e); }
    };
  }
}
// The rules stream fills the ability table when its module loads, after this one; the wrap goes on before the first frame.
defineFaction(1, { fx(g: Game) {
  wrapShows();
  const L = LIVE.get(g); if (!L || !L.length) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const e = L[i], t = g.time - e.t0;
    if (e.follow) { if (!e.follow.alive) { e.fx.obj.removeFromParent(); L.splice(i, 1); continue; } e.fx.obj.position.x = e.follow.pos.x; e.fx.obj.position.z = e.follow.pos.z; }
    let on = false; try { on = e.fx.tick(t) && (!e.keep || e.keep()); } catch { on = false; }
    if (!on) { e.fx.obj.removeFromParent(); L.splice(i, 1); }
  }
} });
