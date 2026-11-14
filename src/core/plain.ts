// Stand-in models for a kind of body or building that has no art yet: a plain painted block with the named parts the poses move
// (body, head, arms, legs), so a new kind can be played and tested before its model is made. The art streams replace these with
// `figure` and `model` hooks in src/factions/<faction>/look/.
import * as THREE from 'three';
import { M, G, mk } from '../gfx';
import type { Model } from '../models';
import { UNIT } from '../data';

export function plainBody(kind: string): Model {
  const st = UNIT[kind as keyof typeof UNIT], h = st ? st.headY : 1.6, r = st ? st.rad : .6, root = new THREE.Group(), mat = M.steel;
  const body = new THREE.Group(); body.name = 'body'; body.position.y = h * .55; root.add(body);
  mk(G.box, mat, [0, 0, 0], [r * 1.4, h * .45, r], [0, 0, 0], body);
  const head = new THREE.Group(); head.name = 'head'; head.position.y = h * .32; body.add(head); mk(G.box, mat, [0, 0, 0], [r * .7, h * .16, r * .7], [0, 0, 0], head);
  const arms = new THREE.Group(); arms.name = 'arms'; arms.position.set(0, h * .12, r * .3); body.add(arms); mk(G.box, mat, [0, 0, r * .5], [r * .3, r * .3, r * 1.2], [0, 0, 0], arms);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) { const l = new THREE.Group(); l.name = s < 0 ? 'legL' : 'legR'; l.position.set(s * r * .35, h * .5, 0); root.add(l); mk(G.box, mat, [0, -h * .25, 0], [r * .35, h * .5, r * .35], [0, 0, 0], l); legs.push(l); }
  return { obj: root, rig: { body, head, arms, legL: legs[0], legR: legs[1], height: h } };
}
