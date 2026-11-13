// Ironhold's second wave of buildings (art/yard2.py): the hulls come from the mesh bank, and this file bolts on the doors
// and lit windows, turns the moving parts and lists the lamps. Importing it registers the looks for the kinds below; the
// rules for those kinds (cost, health, size) live with the rest of Ironhold's numbers.
// Kinds: pumpjack, twinbay, labbay, dugout, flaktower, hangar, annex, surveyrig, bastion (both Headframe forms: a
// Headframe with its extras on top). skids(hx, hz) and depotSunk() are parts the game shows while a building crawls or
// a Depot is sunk. A bay's joining tunnel is on its +x side; the rules turn the bay so +x faces its host.
import * as THREE from 'three';
import * as MD from '../../../models';
import { M } from '../../../gfx';
import { put } from '../../../units';
import { plate, rrect, rbox } from '../../../sculpt';
import { figure } from '../../../meshes';
import { defineBuildings } from '../../../core/registry';

type P3 = [number, number, number];
type Anim = ((t: number) => void)[];
const H2 = Math.PI / 2;

/** A lit window in a steel frame, as on the first wave of sheds. */
function win(g: THREE.Object3D, p: P3, w: number, h: number, ry = 0) { put(plate(rrect(w + .24, h + .24, .08), .16, .04), M.gunm, g, p, [0, ry, 0]); put(plate(rrect(w, h, .05), .2, .02), M.visG, g, p, [0, ry, 0]); }
/** A door leaf set into an opening. */
function door(g: THREE.Object3D, p: P3, w: number, h: number, ry = 0, mat = M.doorP) { put(plate(rrect(w, h, .08), .16, .04), mat, g, p, [0, ry, 0]); }
/** The hull, or a plain block where the mesh bank is missing (the match server and tests carry no meshes). */
function hull(kind: string, w: number, h: number, d: number) {
  const fig = figure(kind);
  if (fig) return fig;
  const root = new THREE.Group(); put(rbox(w, h, d, .1), M.wallS, root, [0, h / 2, 0]);
  return { root, groups: {} as Record<string, THREE.Group>, points: {} };
}

export function pumpjack(anim: Anim) {
  const f = hull('pumpjack', 4.6, 4, 3), g = f.root, { beam, crank, pitman, rod } = f.groups;
  if (beam && crank && pitman && rod) {
    // The beam rocks on the saddle, the crank turns, the pitman arms follow the crank pins and the rod rides the horse head.
    const PV = new THREE.Vector2(0, 3.72), C = new THREE.Vector2(-1.75, 1.3), d0 = Math.atan2(-2.3, -.3);
    anim.push(t => {
      const w = t * 1.7, b = -.2 * Math.sin(w);
      beam.rotation.z = b; crank.rotation.z = -w;
      const top = new THREE.Vector2(-2.38, -.12).rotateAround(new THREE.Vector2(), b).add(PV), pin = new THREE.Vector2(-.85, 0).rotateAround(new THREE.Vector2(), -w).add(C);
      pitman.position.set(top.x, top.y, 0); pitman.rotation.z = Math.atan2(pin.y - top.y, pin.x - top.x) - d0;
      rod.position.y = 2.4 + Math.sin(b) * 2.45;
    });
  }
  return MD.bake(g);
}

export function twinbay() {
  const g = hull('twinbay', 3.9, 3.2, 4.2).root;
  door(g, [-.975, 1.35, 2.09], 1.5, 2.25); door(g, [.975, 1.35, 2.09], 1.5, 2.25);
  win(g, [-1.97, 2.0, 0], 1.1, .7, -H2);
  return MD.bake(g);
}

export function labbay(anim: Anim) {
  const f = hull('labbay', 3.9, 3.2, 4.2), g = f.root, { fan } = f.groups;
  door(g, [-1.0, 1.3, 2.09], 1.15, 2.15);
  win(g, [.9, 1.88, 2.1], 1.3, .95); win(g, [-1.97, 1.95, 0], 1.7, .8, -H2);
  if (fan) anim.push(t => { fan.rotation.y = t * 7; });
  return MD.bake(g);
}

export function dugout() { return MD.bake(hull('dugout', 4.4, 1.6, 4.4).root); }

export function flaktower(anim: Anim) {
  const f = hull('flaktower', 3, 7, 3), g = f.root, { gun, barrels, dish } = f.groups;
  g.userData.gun = gun; g.userData.barrels = barrels;   // the game aims these at fliers; until it does they sweep the sky
  if (gun && barrels) anim.push(t => { if (g.userData.aimed) return; gun.rotation.y = Math.sin(t * .35) * 1.4; barrels.rotation.x = -.75 + Math.sin(t * .6) * .12; });
  if (dish) anim.push(t => { dish.rotation.y = t * 1.3; });
  return MD.bake(g);
}

export function hangar() {
  const f = hull('hangar', 10, 4.6, 8), g = f.root;
  put(rbox(6.2, 3.5, .1, .02), M.gunm, g, [0, 1.95, -3.8]);                // the dark back of the hall, seen through the door
  win(g, [4.45, 3.95, 3.07], 1.2, .55); win(g, [5.22, 3.95, 2.2], 1.3, .55, H2);
  g.userData.doors = [f.groups.doorL, f.groups.doorR];                       // slide on x to open or shut
  return MD.bake(g);
}

export function annex(anim: Anim) {
  const f = hull('annex', 6, 6, 4.6), g = f.root, { dish } = f.groups;
  door(g, [0, 1.47, 2.09], 1.55, 2.45);
  for (const x of [-2.1, 2.1]) win(g, [x, 1.97, 2.1], 1.0, 1.2);
  for (const sx of [-1, 1]) win(g, [sx * 3.02, 1.97, -.2], 2.3, 1.0, H2);
  for (const x of [-1.75, 0, 1.75]) win(g, [x, 4.58, 1.61], .85, 1.15);
  if (dish) anim.push(t => { dish.rotation.y = Math.sin(t * .25) * .9; });
  return MD.bake(g);
}

/** A Headframe with a form's extras on top. */
function hqForm(kind: string, anim: Anim, move: (groups: Record<string, THREE.Group>, t: number) => void) {
  const g = MD.headframe(anim), f = figure(kind);
  if (f) { const extra = MD.bake(f.root); g.add(extra); const groups: Record<string, THREE.Group> = {}; extra.traverse(o => { if (o.name && (o as THREE.Group).isGroup) groups[o.name] = o as THREE.Group; }); anim.push(t => move(groups, t)); }
  return g;
}
export function surveyrig(anim: Anim) { return hqForm('surveyrig', anim, (gr, t) => { if (gr.scan) gr.scan.rotation.y = t * .6; }); }
export function bastion(anim: Anim) { return hqForm('bastion', anim, (gr, t) => { if (gr.gun && !gr.gun.userData.aimed) gr.gun.rotation.y = Math.sin(t * .3) * .8; }); }

/** The skids a crawling building rides on, stretched to a footprint hx by hz (they are made for 4 by 3). */
export function skids(hx: number, hz: number) {
  const g = new THREE.Group(), f = figure('skids');
  if (f) { const s = MD.bake(f.root); s.scale.set(hx / 4, 1, hz / 3); g.add(s); }
  return g;
}
/** The tread-plate lid that sits flush with the ground over a sunk Depot. */
export function depotSunk() { const f = figure('depotsunk'); return f ? MD.bake(f.root) : new THREE.Group(); }

defineBuildings({
  pumpjack: { model: a => pumpjack(a), lamps: [[2.4, 1.6, 1.2, 7]] },
  twinbay: { model: () => twinbay(), lamps: [[0, 2.7, 2.9, 10]] },
  labbay: { model: a => labbay(a), lamps: [[-1.0, 2.6, 2.6, 9]] },
  dugout: { model: () => dugout(), lamps: [[0, 1.4, 0, 6]] },
  flaktower: { model: a => flaktower(a), lamps: [[0, 5.6, 0, 8]] },
  hangar: { model: () => hangar(), lamps: [[0, 4.3, 4.8, 14], [4.45, 3.9, 3.3, 8]] },
  annex: { model: a => annex(a), lamps: [[0, 3.0, 3.0, 11], [0, 7.9, 2.4, 8]] },
  surveyrig: { model: a => surveyrig(a), lamps: [[3.2, 5.6, 1.9, 9]] },
  bastion: { model: a => bastion(a) },
});
