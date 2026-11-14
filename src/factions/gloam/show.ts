// What each Gloam ability looks like when it goes off, for show only (AbilityDef.show): here offline, and online on every screen that
// can see the caster, from the server's cast event. The drawings are stream G's (look/effects.ts GLOAM_FX); this file only says which
// drawing goes with which ability and where. No rule, no dice: nothing here changes the match.
import * as THREE from 'three';
import type { Game } from '../../game';
import { UNIT, Unit, Building, Kind } from '../../data';
import { abilitiesOf, type Target } from '../../core/ability';
import { FxKit } from '../../fx/kit';
import { GLOAM_FX, type GfxAt } from './look/effects';
import { G2 } from './numbers';

const KITS = new WeakMap<Game, FxKit>();
function kitOf(g: Game): FxKit | null {
  if (g.noRender || typeof window === 'undefined') return null;
  let k = KITS.get(g); if (!k) KITS.set(g, k = new FxKit(g.scene)); return k;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** A body's chest (fliers at their height), or a building's middle. */
const mid = (o: Unit | Building) => 'kind' in o && (o as Unit).kind in UNIT ? V(o.pos.x, UNIT[(o as Unit).kind].bodyY + ((o as Unit).alt || 0), o.pos.z) : V(o.pos.x, ((o as Building).h || 4) * .5, o.pos.z);
const ground = (t: Target) => V(t.x, 0, t.z);
const self = (u: Unit) => () => mid(u);

/** Each ability key, the drawing it uses, and where. */
const CASTS: Record<string, (u: Unit, t: Target, o: Unit | Building | null) => [string, GfxAt] | null> = {
  seed: (u, t, o) => ['seed', { from: self(u), to: o ? V(o.pos.x, ((o as Building).h || 8) * .7, o.pos.z) : ground(t) }],
  pod: (_u, t) => ['pod', { x: t.x, z: t.z, r: 6 }],
  mend: (u, _t, o) => o ? ['mend', { from: self(u), to: () => mid(o) }] : null,
  bile: (u, t) => ['lob', { from: self(u), to: ground(t), r: G2.lobber.lob.r }],
  choke: (_u, t) => ['choke', { x: t.x, z: t.z, r: G2.smother.choke.r, time: G2.smother.choke.t }],
  mind: (u, _t, o) => o ? ['rot', { from: self(u), to: () => mid(o), target: o.obj, time: G2.smother.mind.t }] : null,
  fling: (u, t) => ['fling', { from: self(u), to: ground(t) }],
  reel: (u, _t, o) => o ? ['reel', { from: self(u), to: () => mid(o) }] : null,
  cloud: (_u, t) => ['cloud', { x: t.x, z: t.z, r: G2.hooksail.cloud.r, time: G2.hooksail.cloud.t }],
  drink: (u, _t, o) => o ? ['drink', { from: mid(o), to: self(u) }] : null,
  dig: u => ['dig', { x: u.pos.x, z: u.pos.z }],
  root: u => ['root', { x: u.pos.x, z: u.pos.z }],
  drop: u => ['dig', { x: u.pos.x, z: u.pos.z, r: 3 }],   // a Drifter letting its passengers out
};

/** Plays one of stream G's drawings by name, from the rules' own effects too (a Needler's line, a Gnatwing's jump, a Bloater's acid). */
export function gloamShow(g: Game, name: string, o: GfxAt) { const k = kitOf(g), f = GLOAM_FX[name]; if (k && f) try { f(k, o); } catch (e) { /* a look never stops the game */ } }
/** Ticks the kit; the faction's fx hook calls it every frame on every screen. */
export function gloamShowTick(g: Game, dt: number) { const k = KITS.get(g); if (k) k.update(dt); }

/** Gives every Gloam ability its look. Called once every rule file has defined its abilities. */
export function wrapGloamCasts() {
  for (const kind of Object.keys(UNIT) as Kind[]) {
    if (UNIT[kind].team !== 2) continue;
    for (const a of abilitiesOf(kind)) {
      const cast = CASTS[a.key]; if (!cast || a.show) continue;
      a.show = (g, u, t, tgt) => { const r = cast(u, t, tgt); if (r) gloamShow(g, r[0], r[1]); };
    }
  }
}
queueMicrotask(wrapGloamCasts);
