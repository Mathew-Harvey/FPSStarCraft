// The effect kit: the pieces ability effects are built from, so the roughly fifty abilities in the full-depth plan share one look and
// one set of rules. Each piece is a plain three.js object on the effects layer (no ink outline), with an `update(dt)` that returns
// false when it is finished, and a version for far zoom: from high up a thin line or a small glow would vanish, so every piece keeps a
// width of a few pixels on screen and grows a flat ground mark that reads from above.
//
//   tell     a mark on the ground where something is about to land, filling up as its timer runs out
//   beam     a line of energy between two points (or two moving things)
//   orb      a glowing ball (a shot in flight, a charge in a hand)
//   cloud    a slow drifting cloud over an area (spores, smoke, a gas)
//   pane     an upright sheet of light (a wall, a shield face)
//   ring     a ring that runs outward from a point (a blast front, a pulse)
//   veil     what a body looks like while hidden from sight (shimmer), for the side that can still see it
//   borrow   the colour laid over a body that another side has taken over
//
// Use: const fx = new FxKit(scene); fx.add(tell({ x, z, r: 4, time: 1.5, color: '#ff4f9a' })); fx.update(dt) each frame.
// The far-zoom rules run on their own before every draw (PRE_DRAW), from the camera and the picture height.
import * as THREE from 'three';
import { L_FX, NOISE, PRE_DRAW, farInkOf } from '../gfx';

export interface Fx { obj: THREE.Object3D; update(dt: number): boolean; /** Called before each draw: metres per pixel at the effect, and how far up the view is (0 to 1). */ view?(perPx: number, far: number, cam: THREE.Camera): void; dispose?(): void }

const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;
const col = (c: THREE.ColorRepresentation) => new THREE.Color(c);
const onFx = <T extends THREE.Object3D>(o: T) => { o.traverse(c => c.layers.set(L_FX)); return o; };
const FLAT = (() => { const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); return g; })();
const QUAD = new THREE.PlaneGeometry(1, 1);

/** Keeps every live effect ticking and removes the finished ones. */
export class FxKit {
  list: Fx[] = [];
  constructor(public scene: THREE.Scene) { LIVE.add(this); }
  add<T extends Fx>(f: T): T { this.scene.add(f.obj); this.list.push(f); return f; }
  update(dt: number) { this.list = this.list.filter(f => { if (f.update(dt)) return true; this.scene.remove(f.obj); f.dispose?.(); return false; }); }
  clear() { for (const f of this.list) { this.scene.remove(f.obj); f.dispose?.(); } this.list = []; }
  dispose() { this.clear(); LIVE.delete(this); }
}
const LIVE = new Set<FxKit>();
const WP = new THREE.Vector3(), CP = new THREE.Vector3();
PRE_DRAW.push((scene, cam, h) => {
  const far = farInkOf(cam), pe = cam.projectionMatrix.elements, ortho = (cam as any).isOrthographicCamera; cam.getWorldPosition(CP);
  for (const k of LIVE) if (k.scene === scene) for (const f of k.list) if (f.view) { f.obj.getWorldPosition(WP); f.view(ortho ? 2 / (pe[5] * h) : 2 * Math.max(.1, WP.distanceTo(CP)) / (pe[5] * h), far, cam); }
});

// ---------------------------------------------------------------- tell
/** A warning on the ground: an inked rim, faint hatching inside, and a fill that grows from the middle out as `time` runs down.
 *  When full it flashes once and is gone. From high up the rim keeps three pixels and the hatching is dropped for a flat tint. */
export function tell(o: { x: number; z: number; y?: number; r: number; time: number; color: THREE.ColorRepresentation; hold?: number }): Fx & { left: number } {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { uC: { value: col(o.color) }, uF: { value: 0 }, uRim: { value: .05 }, uFar: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: 'varying vec2 vP; varying vec2 vW; void main(){ vP=position.xz; vW=(modelMatrix*vec4(position,1.)).xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uC; uniform float uF,uRim,uFar,uFlash; varying vec2 vP; varying vec2 vW;
      void main(){ float d=length(vP); if(d>1.) discard; float aa=fwidth(d);
        float rim=smoothstep(1.-uRim-aa,1.-uRim,d);
        float hatch=step(.5,fract((vW.x+vW.y)*.9))*.5*(1.-uFar);
        float fill=1.-smoothstep(uF-aa*2.,uF,d);
        float a=rim*.95+(1.-rim)*(.1+.08*hatch+.25*uFar+fill*.38)+uFlash*.6;
        gl_FragColor=vec4(mix(uC,vec3(1.),uFlash*.7+rim*.15),a); }` });
  const mesh = onFx(new THREE.Mesh(FLAT, m)); mesh.position.set(o.x, (o.y ?? 0) + .06, o.z); mesh.scale.set(o.r, 1, o.r); mesh.renderOrder = 3;
  let t = 0, flash = 0; const hold = o.hold ?? 0;
  const f = { obj: mesh, left: o.time,
    update(dt: number) { t += dt; f.left = Math.max(0, o.time - t); m.uniforms.uF.value = Math.min(1, t / o.time); if (t >= o.time) { flash += dt; m.uniforms.uFlash.value = Math.max(0, 1 - flash / .25); } return t < o.time + Math.max(.25, hold); },
    view(perPx: number, far: number) { m.uniforms.uRim.value = Math.min(.5, Math.max(.05, 3 * perPx / o.r)); m.uniforms.uFar.value = far; },
    dispose() { m.dispose(); } };
  return f;
}

// ---------------------------------------------------------------- beam
/** A line of energy from `a` to `b`. Pass functions to follow moving ends. A bright core, coloured edges, a slow crawl along it.
 *  From high up it keeps at least `minPx` pixels across. */
export function beam(o: { a: THREE.Vector3 | (() => THREE.Vector3); b: THREE.Vector3 | (() => THREE.Vector3); width: number; color: THREE.ColorRepresentation; time: number; minPx?: number }): Fx {
  const m = new THREE.ShaderMaterial({ ...ADD, side: THREE.DoubleSide, uniforms: { uC: { value: col(o.color) }, uT: { value: 0 }, uLen: { value: 1 }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uC; uniform float uT,uLen,uK; varying vec2 vUv; ${NOISE}
      void main(){ float x=abs(vUv.y-.5)*2.; float n=vnoise(vec2(vUv.x*uLen*1.5-uT*6.,uT*2.));
        float core=1.-smoothstep(.12,.4,x), edge=(1.-smoothstep(.4,1.,x))*(.55+.45*n);
        gl_FragColor=vec4((uC*edge+vec3(1.)*core*.9)*uK,1.); }` });
  const mesh = onFx(new THREE.Mesh(QUAD, m)); mesh.frustumCulled = false; mesh.renderOrder = 4;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), S = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), MT = new THREE.Matrix4();
  const get = (p: THREE.Vector3 | (() => THREE.Vector3), v: THREE.Vector3) => v.copy(typeof p === 'function' ? p() : p);
  let t = 0, w = o.width;
  return { obj: mesh,
    update(dt: number) { t += dt; m.uniforms.uT.value = t; m.uniforms.uK.value = Math.min(1, t / .06) * Math.min(1, (o.time - t) / .12); return t < o.time; },
    view(perPx: number, _far: number, cam: THREE.Camera) {
      get(o.a, A); get(o.b, B); D.subVectors(B, A); const len = D.length() || 1e-3; w = Math.max(o.width, (o.minPx ?? 3) * perPx);
      // lie along the beam, face the camera as much as the beam allows
      cam.getWorldPosition(S); mesh.position.copy(A).addScaledVector(D, .5); X.copy(D).normalize(); Z.subVectors(S, mesh.position); Y.crossVectors(Z, X).normalize(); Z.crossVectors(X, Y).normalize();
      mesh.quaternion.setFromRotationMatrix(MT.makeBasis(X, Y, Z)); mesh.scale.set(len, w, 1); m.uniforms.uLen.value = len;
    },
    dispose() { m.dispose(); } };
}

// ---------------------------------------------------------------- orb
/** A glowing ball that always faces the camera. `at` may follow something. Never smaller than `minPx` pixels, and from high up it
 *  throws a small bright spot on the ground under it so a shot in flight can be followed. */
export function orb(o: { at: THREE.Vector3 | (() => THREE.Vector3); r: number; color: THREE.ColorRepresentation; time: number; minPx?: number; pulse?: number }): Fx {
  const m = new THREE.ShaderMaterial({ ...ADD, uniforms: { uC: { value: col(o.color) }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uC; uniform float uK; varying vec2 vUv; void main(){ float d=length(vUv-.5)*2.; if(d>1.) discard; float core=1.-smoothstep(.15,.45,d), halo=pow(1.-d,2.); gl_FragColor=vec4((vec3(1.)*core+uC*halo*1.4)*uK,1.); }' });
  const g = new THREE.Group(), ball = new THREE.Mesh(QUAD, m); g.add(ball); onFx(g); ball.renderOrder = 4;
  const spot = new THREE.Mesh(FLAT, new THREE.MeshBasicMaterial({ color: col(o.color), transparent: true, opacity: 0, depthWrite: false })); spot.layers.set(L_FX); g.add(spot);
  const P = new THREE.Vector3(); let t = 0;
  const place = () => g.position.copy(typeof o.at === 'function' ? o.at() : o.at);
  place();
  return { obj: g,
    update(dt: number) { t += dt; place(); const p = o.pulse ? 1 + .15 * Math.sin(t * o.pulse * 6.283) : 1; m.uniforms.uK.value = Math.min(1, t / .05) * Math.min(1, (o.time - t) / .1) * p; return t < o.time; },
    view(perPx: number, far: number, cam: THREE.Camera) {
      const r = Math.max(o.r, (o.minPx ?? 4) * perPx); ball.scale.setScalar(r * 2); ball.quaternion.copy(cam.quaternion);
      P.copy(g.position); spot.position.set(0, .07 - P.y, 0); spot.scale.setScalar(r * .8); (spot.material as THREE.MeshBasicMaterial).opacity = far * .5;
    },
    dispose() { m.dispose(); (spot.material as THREE.Material).dispose(); } };
}

// ---------------------------------------------------------------- cloud
/** A slow cloud over a circle: soft puffs that drift and breathe. From high up the puffs flatten into a painted disc with a broken
 *  edge, so the area still reads when the puffs are a pixel or two. */
export function cloud(o: { x: number; z: number; y?: number; r: number; color: THREE.ColorRepresentation; time: number; puffs?: number; seed?: number }): Fx {
  const n = o.puffs ?? Math.round(Math.min(18, 5 + o.r * 1.5)), g = onFx(new THREE.Group()); g.position.set(o.x, o.y ?? 0, o.z);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uC: { value: col(o.color) }, uK: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying float vS; void main(){ vUv=uv; vS=fract(modelMatrix[3].x*.37+modelMatrix[3].z*.71); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uC; uniform float uK,uT; varying vec2 vUv; varying float vS; ${NOISE}
      void main(){ vec2 p=vUv-.5; float d=length(p)*2.; float n=vnoise(p*3.+vS*20.+uT*.15)*.6+vnoise(p*7.-uT*.2)*.4;
        float a=(1.-smoothstep(.35,1.,d+.35*(n-.5)))*uK; if(a<.01) discard; gl_FragColor=vec4(uC*(.8+.4*n),a*.55); }` });
  const puffs: { mesh: THREE.Mesh; ph: number; dx: number; dz: number; s: number }[] = [];
  let sd = o.seed ?? 1; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * o.r * .75, mesh = new THREE.Mesh(QUAD, m); mesh.layers.set(L_FX); mesh.position.set(Math.cos(a) * rr, .6 + rnd() * o.r * .25, Math.sin(a) * rr); g.add(mesh); puffs.push({ mesh, ph: rnd() * 6.283, dx: rnd() - .5, dz: rnd() - .5, s: o.r * (.45 + rnd() * .35) }); }
  const disc = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uC: { value: col(o.color) }, uK: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP=position.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uC; uniform float uK; varying vec2 vP; ${NOISE} void main(){ float d=length(vP)+(vnoise(vP*4.)-.5)*.18; float a=(1.-smoothstep(.85,1.,d))*(.35+.4*smoothstep(.8,.95,d)); gl_FragColor=vec4(uC,a*uK); }` });
  const ground = new THREE.Mesh(FLAT, disc); ground.layers.set(L_FX); ground.position.y = .07; ground.scale.set(o.r, 1, o.r); g.add(ground);
  let t = 0, k = 0;
  return { obj: g,
    update(dt: number) { t += dt; k = Math.min(1, t / .6) * Math.min(1, (o.time - t) / .8); m.uniforms.uT.value = t;
      for (const p of puffs) { p.mesh.position.x += p.dx * dt * .3; p.mesh.position.z += p.dz * dt * .3; const s = p.s * (1 + .08 * Math.sin(t * .7 + p.ph)); p.mesh.scale.set(s, s, s); } return t < o.time; },
    view(_perPx: number, far: number, cam: THREE.Camera) { for (const p of puffs) { p.mesh.quaternion.copy(cam.quaternion); p.mesh.visible = far < .95; } disc.uniforms.uK.value = k * far; m.uniforms.uK.value = k * (1 - far * .7); },
    dispose() { m.dispose(); disc.dispose(); } };
}

// ---------------------------------------------------------------- pane
/** An upright sheet of light from (x0, z0) to (x1, z1), `h` tall: a faint cell pattern that ripples, a bright top and bottom edge,
 *  and where it stands a hard line on the ground that keeps three pixels from high up. */
export function pane(o: { x0: number; z0: number; x1: number; z1: number; h: number; color: THREE.ColorRepresentation; time: number }): Fx {
  const len = Math.hypot(o.x1 - o.x0, o.z1 - o.z0), g = onFx(new THREE.Group());
  g.position.set((o.x0 + o.x1) / 2, 0, (o.z0 + o.z1) / 2); g.rotation.y = -Math.atan2(o.z1 - o.z0, o.x1 - o.x0);
  const m = new THREE.ShaderMaterial({ ...ADD, side: THREE.DoubleSide, uniforms: { uC: { value: col(o.color) }, uK: { value: 0 }, uT: { value: 0 }, uA: { value: new THREE.Vector2(len, o.h) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uC; uniform float uK,uT; uniform vec2 uA; varying vec2 vUv;
      void main(){ vec2 p=vUv*uA*1.6; vec2 q=vec2(p.x+p.y*.5,p.y*.866); vec2 c=abs(fract(q)-.5); float cell=smoothstep(.42,.5,max(c.x,c.y));
        float rip=.5+.5*sin(p.y*2.-uT*3.+p.x*.6); float edge=smoothstep(.9,1.,abs(vUv.y-.5)*2.)+smoothstep(.96,1.,abs(vUv.x-.5)*2.);
        gl_FragColor=vec4(uC*(.12+cell*.35*rip+edge*.9)*uK,1.); }` });
  const sheet = new THREE.Mesh(QUAD, m); sheet.layers.set(L_FX); sheet.scale.set(len, o.h, 1); sheet.position.y = o.h / 2; g.add(sheet);
  const lineM = new THREE.MeshBasicMaterial({ color: col(o.color), transparent: true, opacity: 0, depthWrite: false });
  const line = new THREE.Mesh(FLAT, lineM); line.layers.set(L_FX); line.position.y = .08; g.add(line);
  let t = 0;
  return { obj: g,
    update(dt: number) { t += dt; m.uniforms.uT.value = t; m.uniforms.uK.value = Math.min(1, t / .2) * Math.min(1, (o.time - t) / .3); return t < o.time; },
    view(perPx: number, far: number) { line.scale.set(len / 2, 1, Math.max(.12, 1.5 * perPx)); lineM.opacity = (.4 + .55 * far) * m.uniforms.uK.value; },
    dispose() { m.dispose(); lineM.dispose(); } };
}

// ---------------------------------------------------------------- ring
/** A ring that runs out from (x, z) to radius `r` over `time` and fades: a blast front, a pulse. Its band keeps two pixels. */
export function ring(o: { x: number; z: number; y?: number; r: number; time: number; color: THREE.ColorRepresentation; band?: number }): Fx {
  const m = new THREE.ShaderMaterial({ ...ADD, uniforms: { uC: { value: col(o.color) }, uR: { value: 0 }, uB: { value: o.band ?? .12 }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main(){ vP=position.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uC; uniform float uR,uB,uK; varying vec2 vP; void main(){ float d=length(vP); float a=1.-smoothstep(0.,uB,abs(d-uR)); a*=step(d,1.); gl_FragColor=vec4(mix(uC,vec3(1.),a*.4)*a*uK,1.); }' });
  const mesh = onFx(new THREE.Mesh(FLAT, m)); mesh.position.set(o.x, (o.y ?? 0) + .1, o.z); mesh.scale.set(o.r, 1, o.r); mesh.renderOrder = 3;
  let t = 0;
  return { obj: mesh,
    update(dt: number) { t += dt; const k = t / o.time; m.uniforms.uR.value = Math.min(1, Math.sqrt(k)) * .95; m.uniforms.uK.value = 1 - k * k; return t < o.time; },
    view(perPx: number) { m.uniforms.uB.value = Math.max(o.band ?? .12, 2 * perPx / o.r); },
    dispose() { m.dispose(); } };
}

// ---------------------------------------------------------------- veil and borrow
/** Hides a body for the side that cannot see it and shows the side that can a shimmer where it stands: its own shape, nearly
 *  clear, with a moving bright edge. Returns a function that puts the body back. `seen` false hides it outright. */
export function veil(body: THREE.Object3D, seen = true): () => void {
  const was = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>(); const mats: THREE.ShaderMaterial[] = [];
  body.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh || o.layers.mask & (1 << L_FX)) return; was.set(m, m.material);
    if (!seen) { m.visible = false; return; }
    const sh = new THREE.ShaderMaterial({ ...ADD, uniforms: { uT: SHIMMER_T },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=viewMatrix*w; vV=-mv.xyz; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*mv; }',
      fragmentShader: `uniform float uT; varying vec3 vN; varying vec3 vV; varying vec3 vW; ${NOISE}
        void main(){ float f=1.-abs(dot(normalize(vN),normalize(vV))); float n=vnoise(vW.xy*3.+vec2(0.,uT*1.5))*vnoise(vW.zy*3.-uT); float a=pow(f,2.5)*.55+n*.08;
          gl_FragColor=vec4(vec3(.75,.9,1.)*a,1.); }` });
    mats.push(sh); m.material = sh; });
  return () => { for (const [m, mat] of was) { m.material = mat; m.visible = true; } for (const s of mats) s.dispose(); };
}
const SHIMMER_T = { value: 0 };
/** Moves the shimmer along; call once a frame with the game clock. */
export const veilTime = (t: number) => { SHIMMER_T.value = t; };

/** Lays a colour over a body another side has taken over (the toon materials multiply their picture by uColor). Returns a function
 *  that takes it off. The colour pulses gently so it is not mistaken for a side's own paint. */
export function borrow(body: THREE.Object3D, color: THREE.ColorRepresentation, amount = .55): { off(): void; update(t: number): void } {
  const c = col(color), was = new Map<THREE.Mesh, THREE.Material>(), mine: THREE.ShaderMaterial[] = [];
  body.traverse(o => { const m = o as THREE.Mesh; const mat = m.material as THREE.ShaderMaterial; if (!m.isMesh || Array.isArray(m.material) || !mat.uniforms?.uColor) return;
    const t = mat.clone(); t.uniforms = { ...mat.uniforms, uColor: { value: (mat.uniforms.uColor.value as THREE.Color).clone() } }; t.userData = { ...mat.userData, base: (mat.uniforms.uColor.value as THREE.Color).clone() };
    was.set(m, mat); m.material = t; mine.push(t); });
  return {
    update(t: number) { const k = amount * (.8 + .2 * Math.sin(t * 4)); for (const m of mine) (m.uniforms.uColor.value as THREE.Color).copy(m.userData.base).lerp(c, k); },
    off() { for (const [m, mat] of was) m.material = mat; for (const m of mine) m.dispose(); } };
}

// ---------------------------------------------------------------- fliers
/** What keeps a flier readable at every zoom: a soft dark shadow on the ground straight under it (on the ground's own height, so it
 *  sits on a cliff top when the flier is over one), and a thin line from the shadow up to the body. Both keep a few pixels from
 *  high up. Fliers draw after the ground things (renderOrder), so they are never hidden by a body walking under them.
 *  `ground(x, z)` gives the height of the ground; `r` is the flier's size. Lives until `off()`. */
export function lift(body: THREE.Object3D, o: { r: number; ground: (x: number, z: number) => number; color?: THREE.ColorRepresentation }): Fx & { off(): void } {
  const g = onFx(new THREE.Group());
  const shM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, uniforms: { uK: { value: .5 } },
    vertexShader: 'varying vec2 vP; void main(){ vP=position.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float uK; varying vec2 vP; void main(){ float d=length(vP); gl_FragColor=vec4(.08,.05,.1,(1.-smoothstep(.45,1.,d))*uK); }' });
  const shadow = new THREE.Mesh(FLAT, shM); shadow.layers.set(L_FX); shadow.renderOrder = 2; g.add(shadow);
  const lineM = new THREE.MeshBasicMaterial({ color: col(o.color ?? '#f4ead2'), transparent: true, opacity: .55, depthWrite: false });
  const line = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 1, 5, 1, true).translate(0, .5, 0), lineM); line.layers.set(L_FX); g.add(line);
  const P = new THREE.Vector3(); let alive = true;
  body.traverse(c => { if ((c as THREE.Mesh).isMesh) c.renderOrder = Math.max(c.renderOrder, 5); });
  return { obj: g,
    update() { return alive && !!body.parent; },
    view(perPx: number, far: number) {
      body.getWorldPosition(P); const y0 = o.ground(P.x, P.z), hgt = Math.max(0, P.y - y0);
      g.position.set(P.x, y0 + .08, P.z);
      const k = Math.max(0, 1 - hgt / 60);                                        // the shadow spreads and softens the higher it is
      shadow.scale.setScalar(Math.max(o.r * (1 + hgt * .02), 3 * perPx)); shM.uniforms.uK.value = .25 + .35 * k + .2 * far;
      line.scale.set(Math.max(.03, 1.2 * perPx), Math.max(.01, hgt - o.r * .3), Math.max(.03, 1.2 * perPx)); line.visible = hgt > o.r * .5; lineM.opacity = .35 + .4 * far;
    },
    off() { alive = false; },
    dispose() { shM.dispose(); lineM.dispose(); line.geometry.dispose(); } };
}
