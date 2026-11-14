// Plain stand-in bodies and buildings for the new Veyl kinds, so each one can be played and tested before stream F's figure lands. Each has
// the right size and the named parts the poses move (body, head, arms, armL, armR, legL, legR, halo; orb, wingL, wingR where the kind has
// one). The art stream's look file registers `figure` / `model` for the same kind later, which replaces these (look loads after rules).
import * as THREE from 'three';
import { M, G, mk } from '../../gfx';
import type { Model } from '../../models';
import { UNIT, BLD, type Kind, type BKind } from '../../data';
import { defineUnits, defineBuildings } from '../../core/registry';

type Shape = 'walker' | 'robe' | 'tall' | 'flier' | 'orb' | 'ship';
const SHAPE: Partial<Record<Kind, Shape>> = {
  tuner: 'robe', mute: 'walker', choirmaster: 'robe', chord: 'orb', bell: 'walker', reedwalker: 'tall', knell: 'orb',
  listener: 'flier', ferry: 'ship', swift: 'flier', prism: 'ship', omen: 'flier', lyre: 'ship', shard: 'flier', cantus: 'ship',
};
const grp = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };

export function standIn(kind: Kind): Model {
  const st = UNIT[kind], h = st.headY, r = st.rad, sh = SHAPE[kind] || 'walker', root = new THREE.Group(), glass = M.crys, cloth = M.indigo, glow = M.cyan;
  const fly = !!st.air, base = fly ? 0 : 0;
  const body = grp('body', root, 0, fly ? h * .5 : h * .55 + base);
  if (sh === 'robe') mk(G.cone, cloth, [0, -h * .18, 0], [r * 1.8, h * .7, r * 1.8], 0, body);
  else if (sh === 'orb') mk(G.sph, glow, [0, 0, 0], [r * 1.5, r * 1.5, r * 1.5], 0, body);
  else if (sh === 'flier') mk(G.cone4, glass, [0, 0, 0], [r * 1.6, r * 1.8, r * .5], [Math.PI / 2, 0, 0], body);
  else if (sh === 'ship') { mk(G.oct, glass, [0, 0, 0], [r * 2, r * .8, r * 2.4], 0, body); mk(G.torus, glow, [0, 0, 0], [r * 2.2, r * 2.2, r * 2.2], [Math.PI / 2, 0, 0], body); }
  else mk(G.hexT, glass, [0, 0, 0], [r * 1.4, h * (sh === 'tall' ? .25 : .45), r], 0, body);
  const head = grp('head', body, 0, sh === 'flier' || sh === 'ship' ? r * .5 : h * .32); mk(G.oct, glass, [0, 0, 0], [r * .7, h * .14 + .2, r * .7], 0, head);
  const halo = grp('halo', head, 0, .35); mk(G.torus, glow, [0, 0, 0], [r * .9, r * .9, r * .9], [Math.PI / 2, 0, 0], halo);
  const arms = grp('arms', body, 0, h * .1, r * .2), armL = grp('armL', arms, -r * .8), armR = grp('armR', arms, r * .8);
  for (const a of [armL, armR]) mk(G.box, cloth, [0, -h * .12, r * .2], [r * .25, h * .3, r * .25], 0, a);
  let legL: THREE.Group | undefined, legR: THREE.Group | undefined;
  if (!fly && sh !== 'orb') {
    const legH = sh === 'tall' ? h * .62 : h * .5;
    legL = grp('legL', root, -r * .4, legH); legR = grp('legR', root, r * .4, legH);
    for (const l of [legL, legR]) mk(G.box, glass, [0, -legH * .5, 0], [r * .3, legH, r * .3], 0, l);
    if (sh === 'tall') body.position.y = legH + h * .12;
  }
  if (sh === 'flier' || kind === 'lyre') { const wl = grp('wingL', body, -r), wr = grp('wingR', body, r); mk(G.box, glass, [-r * .8, 0, 0], [r * 1.6, .06, r * .8], 0, wl); mk(G.box, glass, [r * .8, 0, 0], [r * 1.6, .06, r * .8], 0, wr); }
  if (kind === 'knell' || kind === 'chord') { const orb = grp('orb', body, 0, r * 1.2); mk(G.sph, glow, [0, 0, 0], [r * .6, r * .6, r * .6], 0, orb); }
  return { obj: root, rig: { body, head, halo, arms, armL, armR, legL, legR, height: h } as any };
}

export function standInBuilding(kind: BKind): THREE.Group {
  const st = BLD[kind], g = new THREE.Group(), w = st.hx * 2, d = st.hz * 2;
  mk(G.hexT, M.indigo, [0, st.h * .3, 0], [w * .9, st.h * .6, d * .9], 0, g);
  mk(G.oct, M.crys, [0, st.h * .75, 0], [Math.min(w, d) * .5, st.h * .5, Math.min(w, d) * .5], 0, g);
  mk(G.torus, M.cyan, [0, st.h * .62, 0], [Math.min(w, d) * .7, Math.min(w, d) * .7, Math.min(w, d) * .7], [Math.PI / 2, 0, 0], g);
  return g;
}

defineUnits(Object.fromEntries((Object.keys(SHAPE) as Kind[]).map(k => [k, { figure: () => standIn(k) }])));
defineBuildings(Object.fromEntries((['siphonbell', 'mendingpool', 'duskhall', 'kiln', 'skyloft', 'tuningfork', 'quiethouse', 'songarchive', 'highbeacon'] as BKind[]).map(k => [k, { model: () => standInBuilding(k) }])));
