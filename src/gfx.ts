// Rendering: hand-painted procedural textures, the comic toon shader with real shadows,
// and the ink-outline post pass.
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const INK = '#0e0d14';
/** Direction towards the sun. */
export const LIGHT = V3(-0.55, 0.62, 0.56).normalize();

// Layers: 0 solid world, 1 effects without outlines, 2 first-person view-model, 3 the player's own body (shadow only).
export const L_FX = 1, L_VM = 2, L_SELF = 3;

let seed = 11;
export const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const R = (a: number, b: number) => a + rnd() * (b - a);
/** Restarts the random sequence. The world is laid out from a fixed seed so every player in a match gets the same map. */
export const reseed = (s: number) => { seed = s | 0; };

function tone(hex: string, k: number) { const c = new THREE.Color(hex); if (k >= 1) c.lerp(new THREE.Color('#ffffff'), k - 1); else c.multiplyScalar(k); return '#' + c.getHexString(); }

// ---------------------------------------------------------------- painted textures
type Ctx = CanvasRenderingContext2D;
function wob(g: Ctx, pts: number[][], w: number, col?: string) {
  g.strokeStyle = col || INK; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.lineWidth = w * (pass ? .55 : 1); g.beginPath();
    pts.forEach((p, i) => { const x = p[0] + R(-1.4, 1.4), y = p[1] + R(-1.4, 1.4); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
}
function paint(base: string, draw?: (g: Ctx, s: number) => void, o: { size?: number; blot?: number } = {}) {
  const s = o.size || 512;
  const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  const n = o.blot === undefined ? 150 : o.blot;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = R(.05, .15); g.fillStyle = tone(base, rnd() < .5 ? R(.68, .92) : R(1.1, 1.35));
    g.save(); g.translate(R(0, s), R(0, s)); g.rotate(R(-.6, .6)); g.beginPath(); g.ellipse(0, 0, R(20, 110) * s / 512, R(5, 26) * s / 512, 0, 0, 7); g.fill(); g.restore();
  }
  g.globalAlpha = 1; if (draw) draw(g, s);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function scratches(g: Ctx, s: number, n: number, col: string, len = 46) {
  for (let i = 0; i < n; i++) { g.globalAlpha = R(.3, .8); const x = R(0, s), y = R(0, s), a = R(0, 6.3), l = R(6, len); wob(g, [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], R(1, 2.4), col); }
  g.globalAlpha = 1;
}
function chips(g: Ctx, s: number, n: number, col: string, rmax = 20) {
  for (let i = 0; i < n; i++) {
    const x = R(0, s), y = R(0, s), r = R(4, rmax); g.beginPath();
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283, rr = r * R(.45, 1.15); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();
  }
}
function panels(g: Ctx, s: number, nx: number, ny: number, w = 5) {
  for (let i = 0; i <= nx; i++) { const x = Math.min(s - 3, Math.max(3, i * s / nx)); wob(g, [[x, 0], [x, s / 2], [x, s]], w); }
  for (let j = 0; j <= ny; j++) { const y = Math.min(s - 3, Math.max(3, j * s / ny)); wob(g, [[0, y], [s / 2, y], [s, y]], w); }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (const [dx, dy] of [[.1, .1], [.9, .1], [.1, .9], [.9, .9]]) {
    const x = (i + dx) * s / nx, y = (j + dy) * s / ny; g.fillStyle = INK; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(x - 1.5, y - 1.5, 1.8, 0, 7); g.fill();
  }
}
function grime(g: Ctx, s: number, n: number) {
  for (let i = 0; i < n; i++) { const x = R(0, s), y = R(0, s * .5), l = R(30, 160); const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(30,18,24,.42)'); gr.addColorStop(1, 'rgba(30,18,24,0)'); g.fillStyle = gr; g.fillRect(x, y, R(3, 10), l); }
}
function hatchPatch(g: Ctx, s: number, n: number) {
  for (let i = 0; i < n; i++) { const x = R(0, s), y = R(0, s), w = R(20, 70); g.globalAlpha = .7; for (let k = 0; k < 6; k++) wob(g, [[x + k * 7, y], [x + k * 7 - w * .4, y + w * .5]], 1.8); }
  g.globalAlpha = 1;
}
function stencil(g: Ctx, txt: string, x: number, y: number, px: number, col: string, rot = 0) { g.save(); g.translate(x, y); g.rotate(rot); g.font = '900 ' + px + 'px Impact, "Arial Narrow", sans-serif'; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, 0); g.restore(); }
function ribs(g: Ctx, s: number, n: number) { for (let i = 0; i < n; i++) wob(g, [[i * s / n, 0], [i * s / n, s]], 3.5); }

export const TX: Record<string, THREE.Texture> = {};
function makeTextures() {
  TX.steel = paint('#b4bac2', (g, s) => { grime(g, s, 26); panels(g, s, 2, 2); scratches(g, s, 60, '#eef2f5'); scratches(g, s, 30, INK, 20); hatchPatch(g, s, 5); });
  TX.steelD = paint('#5d6474', (g, s) => { panels(g, s, 2, 2, 4); scratches(g, s, 50, '#aab2c4'); grime(g, s, 14); });
  TX.yellow = paint('#ffc21a', (g, s) => { grime(g, s, 16); chips(g, s, 26, '#9aa0aa'); panels(g, s, 1, 1, 7); scratches(g, s, 50, '#fff3c0'); scratches(g, s, 26, INK, 22); stencil(g, '07', s * .5, s * .52, 190, 'rgba(14,13,20,.85)', -.06); hatchPatch(g, s, 4); });
  TX.yellowP = paint('#ffc21a', (g, s) => { chips(g, s, 18, '#9aa0aa', 14); scratches(g, s, 40, '#fff3c0'); scratches(g, s, 20, INK, 18); wob(g, [[0, s * .5], [s, s * .5]], 6); });
  TX.hazard = paint('#ffc21a', (g, s) => { g.fillStyle = INK; for (let i = -2; i < 8; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128 + 64, 0); g.lineTo(i * 128 - 64, s); g.lineTo(i * 128 - 128, s); g.fill(); } chips(g, s, 16, '#9aa0aa', 16); scratches(g, s, 40, '#fff3c0'); }, { blot: 60 });
  TX.rubber = paint('#2b2933', (g, s) => { scratches(g, s, 50, '#6c6a7c', 30); for (let i = 0; i < 9; i++) wob(g, [[0, i * 60 + 20], [s, i * 60 + 20]], 4, '#15141b'); });
  TX.cloth = paint('#8a5a3c', (g, s) => { for (let i = 0; i < 6; i++) { const y = R(0, s); g.setLineDash([10, 9]); wob(g, [[0, y], [s, y + R(-20, 20)]], 3, '#e0b890'); g.setLineDash([]); } chips(g, s, 5, '#6d7a52', 34); scratches(g, s, 30, INK, 30); hatchPatch(g, s, 8); });
  TX.vest = paint('#ff7d1a', (g, s) => { g.fillStyle = '#f6f0d4'; g.fillRect(0, s * .3, s, s * .1); g.fillRect(0, s * .62, s, s * .1); for (const y of [.3, .4, .62, .72]) wob(g, [[0, s * y], [s, s * y]], 5); grime(g, s, 20); scratches(g, s, 30, INK, 24); });
  TX.gun = paint('#40434f', (g, s) => { panels(g, s, 3, 1, 4); scratches(g, s, 60, '#aab2c4', 30); });
  TX.helmet = paint('#e4dcc6', (g, s) => { for (const u of [.25, .75]) { g.fillStyle = '#ffc21a'; g.fillRect(s * u - 40, 0, 80, s); wob(g, [[s * u - 40, 0], [s * u - 40, s]], 5); wob(g, [[s * u + 40, 0], [s * u + 40, s]], 5); } chips(g, s, 22, '#8d939c', 14); scratches(g, s, 60, INK, 22); grime(g, s, 12); });
  TX.hardhat = paint('#ffc21a', (g, s) => { for (const u of [.25, .75]) { wob(g, [[s * u - 26, 0], [s * u - 26, s]], 5); wob(g, [[s * u + 26, 0], [s * u + 26, s]], 5); } chips(g, s, 16, '#f6f0d4', 12); scratches(g, s, 40, INK, 22); grime(g, s, 10); });
  TX.skin = paint('#e2a678', (g, s) => { scratches(g, s, 24, '#9a5a3c', 16); });
  TX.corr = paint('#7d9a72', (g, s) => { for (let i = 0; i < 16; i++) { const x = i * s / 16; g.fillStyle = 'rgba(20,30,20,.25)'; g.fillRect(x, 0, s / 32, s); } ribs(g, s, 16); grime(g, s, 30); chips(g, s, 14, '#b8492e', 18); scratches(g, s, 30, '#d9eccc'); stencil(g, 'B-01', s * .5, s * .5, 110, 'rgba(244,234,210,.9)'); });
  TX.rust = paint('#c04a2c', (g, s) => { ribs(g, s, 12); grime(g, s, 30); chips(g, s, 16, '#6a2a1c', 22); scratches(g, s, 40, '#f4b090'); stencil(g, 'IHC', s * .5, s * .5, 150, 'rgba(244,234,210,.9)'); });
  TX.tealC = paint('#2f9a94', (g, s) => { ribs(g, s, 12); grime(g, s, 30); chips(g, s, 16, '#b8492e', 20); scratches(g, s, 40, '#bff5ee'); stencil(g, '22', s * .5, s * .5, 200, 'rgba(244,234,210,.9)'); });
  TX.door = paint('#33313d', (g, s) => { for (let i = 0; i < 10; i++) wob(g, [[0, i * s / 10], [s, i * s / 10]], 5, '#121118'); scratches(g, s, 40, '#8088a0'); stencil(g, '▲', s * .5, s * .5, 120, '#ffc21a'); });
  TX.concrete = paint('#9a8f86', (g, s) => { scratches(g, s, 40, INK, 60); grime(g, s, 20); chips(g, s, 10, '#6f655e', 24); });
  TX.rock = paint('#b0553a', (g, s) => { for (let i = 0; i < 9; i++) { const y = R(0, s); wob(g, [[0, y], [s * .3, y + R(-14, 14)], [s * .7, y + R(-14, 14)], [s, y]], R(2, 5)); } for (let i = 0; i < 14; i++) { const x = R(0, s), y = R(0, s); wob(g, [[x, y], [x + R(-20, 20), y + R(20, 60)], [x + R(-30, 30), y + R(60, 120)]], R(2, 4)); } hatchPatch(g, s, 14); scratches(g, s, 30, '#f0a078'); });
  TX.mesa = paint('#c8653c', (g, s) => { const cols = ['#d97a48', '#a94a30', '#e09058', '#8e3d2c']; for (let i = 0; i < 9; i++) { g.globalAlpha = .55; g.fillStyle = cols[i % 4]; const y = i * s / 9 + R(-8, 8); g.fillRect(0, y, s, R(14, 40)); g.globalAlpha = 1; wob(g, [[0, y], [s * .25, y + R(-6, 6)], [s * .5, y + R(-6, 6)], [s * .75, y + R(-6, 6)], [s, y]], R(2.5, 5)); } for (let i = 0; i < 12; i++) { const x = R(0, s); wob(g, [[x, R(0, s * .3)], [x + R(-12, 12), R(s * .4, s)]], R(2, 4)); } hatchPatch(g, s, 10); });
  TX.ground = paint('#c9743f', (g, s) => {
    for (let i = 0; i < 46; i++) { let x = R(0, s), y = R(0, s); const pts = [[x, y]]; for (let k = 0; k < 5; k++) { x += R(-50, 50); y += R(-50, 50); pts.push([x, y]); } g.globalAlpha = R(.35, .8); wob(g, pts, R(1.6, 3.6), '#4a2218'); }
    g.globalAlpha = 1;
    for (let i = 0; i < 160; i++) { const x = R(0, s), y = R(0, s), r = R(2, 7); g.fillStyle = rnd() < .5 ? '#8f4a2c' : '#e39a62'; g.beginPath(); g.ellipse(x, y, r * 1.4, r, R(0, 3), 0, 7); g.fill(); g.strokeStyle = '#4a2218'; g.lineWidth = 1.4; g.stroke(); }
    hatchPatch(g, s, 26);
  }, { size: 1024, blot: 420 });
  TX.road = paint('#8f5a3c', (g, s) => { for (const y of [.2, .36, .64, .8]) { for (let i = 0; i < 26; i++) { const x = i * s / 26; wob(g, [[x, s * y - 16], [x + 8, s * y + 16]], 5, '#4a2218'); } } scratches(g, s, 40, '#4a2218', 60); }, { blot: 200 });
  TX.ore = paint('#b8f58c', (g, s) => { for (let i = 0; i < 12; i++) { const x = R(0, s); g.globalAlpha = .6; g.fillStyle = '#f2ffe0'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + R(20, 60), 0); g.lineTo(x + R(-40, 40), s); g.fill(); g.globalAlpha = 1; wob(g, [[x, 0], [x + R(-40, 40), s]], 3, '#3c7a3a'); } }, { blot: 60 });
  TX.indigo = paint('#4433b8', (g, s) => { for (let i = 0; i < 14; i++) { let x = R(0, s), y = 0; const pts = [[x, y]]; while (y < s) { y += R(30, 70); x += R(-36, 36); pts.push([x, y]); } wob(g, pts, R(2, 4), '#35e0c8'); } scratches(g, s, 30, INK, 26); hatchPatch(g, s, 8); });
  TX.indigoD = paint('#2a1f78', (g, s) => { scratches(g, s, 40, '#6a5ae0', 30); hatchPatch(g, s, 10); });
  TX.smoke = paint('#f2e9d8', (g, s) => { scratches(g, s, 30, '#b8ae9c', 60); }, { blot: 80 });
  TX.planet = paint('#f3d9b0', (g, s) => { const cols = ['#e8b98a', '#f8e8c8', '#d99a78', '#f0c8a0']; for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 4]; g.globalAlpha = .8; const y = i * s / 12 + R(-6, 6); g.fillRect(0, y, s, R(10, 36)); g.globalAlpha = 1; wob(g, [[0, y], [s / 2, y + R(-5, 5)], [s, y]], R(2, 4), '#8a5a48'); } }, { blot: 40 });
  TX.sign = paint('#f4ead2', (g, s) => { g.fillStyle = INK; g.fillRect(0, 0, s, 30); g.fillRect(0, s - 30, s, 30); stencil(g, 'IRONHOLD', s * .5, s * .5, 104, INK); chips(g, s, 12, '#b8492e', 14); scratches(g, s, 30, INK, 20); grime(g, s, 12); }, { blot: 30 });
}

// ---------------------------------------------------------------- toon shader
const FOG = new THREE.Color('#f3c9a0');
/** 0 is midday, 1 is full sunset. Shared by the sky and the final grade. */
export const DUSK = { value: 0 };
const DUSKFOG = new THREE.Color('#f09a84');
export const NOISE = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}`;
const TOON_VS = `uniform vec3 uL; uniform vec2 uRep; attribute float aEm; varying vec3 vN,vL,vP,vW,vWn; varying vec2 vUv; varying float vEm;
void main(){ vUv=uv*uRep; vEm=aEm; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=viewMatrix*w; vP=mv.xyz; vN=normalize(normalMatrix*normal); vWn=normalize(mat3(modelMatrix)*normal); vL=(viewMatrix*vec4(uL,0.)).xyz; gl_Position=projectionMatrix*mv; }`;
const TOON_FS = `precision highp float;
uniform vec3 uColor,uFog; uniform sampler2D uMap,uShadow; uniform mat4 uShadowMat; uniform float uEmis,uOpacity,uHatch,uFogK,uFlat,uPx,uShadowTex;
varying vec3 vN,vL,vP,vW,vWn; varying vec2 vUv; varying float vEm;
${NOISE}
float shadowAt(vec3 wp){
  vec4 sc=uShadowMat*vec4(wp,1.); vec3 p=sc.xyz/sc.w*.5+.5;
  if(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.) return 1.;
  float s=0.; float b=.0016;
  vec2 uv=p.xy/uShadowTex-.5, f=fract(uv), c=(floor(uv)+.5)*uShadowTex; float z=p.z-b, t=uShadowTex;
  float r0=mix(step(z,texture2D(uShadow,c+vec2(-t,-t)).x),step(z,texture2D(uShadow,c+vec2(0.,-t)).x),f.x)+mix(step(z,texture2D(uShadow,c+vec2(0.,-t)).x),step(z,texture2D(uShadow,c+vec2(t,-t)).x),f.x);
  float r1=mix(step(z,texture2D(uShadow,c+vec2(-t,0.)).x),step(z,texture2D(uShadow,c).x),f.x)+mix(step(z,texture2D(uShadow,c).x),step(z,texture2D(uShadow,c+vec2(t,0.)).x),f.x);
  float r2=mix(step(z,texture2D(uShadow,c+vec2(-t,t)).x),step(z,texture2D(uShadow,c+vec2(0.,t)).x),f.x)+mix(step(z,texture2D(uShadow,c+vec2(0.,t)).x),step(z,texture2D(uShadow,c+vec2(t,t)).x),f.x);
  return (mix(r0,r1,f.y)+mix(r1,r2,f.y))*.25;
}
void main(){
  vec3 n=normalize(vN); vec3 wn=normalize(vWn); if(!gl_FrontFacing){ n=-n; wn=-wn; }
  vec3 base=uColor*texture2D(uMap,vUv).rgb;
  float nz=vnoise(vW.xz*2.3+vW.y*1.9)-.5;
  float t=dot(n,normalize(vL))+nz*.24; t=mix(t,1.,uFlat*.6);
  float sh=shadowAt(vW+wn*.07);
  float lit=smoothstep(-.03,.03,t)*smoothstep(.3,.7,sh), hi=smoothstep(.74,.78,t)*sh, deep=1.-smoothstep(-.6,-.54,t);
  vec3 shc=base*vec3(.44,.38,.66)+vec3(.03,.01,.07);
  vec3 col=mix(shc,base,lit);
  col=mix(col,min(base*1.2+vec3(.08,.07,.03),vec3(1.)),hi*.75);
  vec2 fc=gl_FragCoord.xy/uPx+(vnoise(gl_FragCoord.xy/uPx*.045)-.5)*7.;
  float l1=smoothstep(.56,.74,abs(fract((fc.x+fc.y)/10.)-.5)*2.);
  float l2=smoothstep(.56,.74,abs(fract((fc.x-fc.y)/10.)-.5)*2.);
  float mid=lit*(1.-smoothstep(.03,.34,t));
  float hatch=(1.-lit)*l1*.6+deep*l2*.6+mid*l1*.16;
  col=mix(col,col*.38,clamp(hatch,0.,1.)*uHatch);
  float rim=pow(1.-max(dot(n,normalize(-vP)),0.),3.)*(1.-lit)*.4; col+=rim*vec3(.45,.6,.95);
  float em=min(1.,uEmis+vEm); col=mix(col,base*1.08,em);
  float d=length(vP); col=mix(col,uFog,(1.-exp(-d*uFogK))*.92*(1.-em*.6));
  gl_FragColor=vec4(col,uOpacity);
}`;
const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); WHITE.needsUpdate = true;
// Uniforms shared by every toon material so the shadow map and pixel scale update in one place.
export const SHARED = { uShadow: { value: WHITE as THREE.Texture }, uShadowMat: { value: new THREE.Matrix4() }, uShadowTex: { value: 1 / 2048 }, uPx: { value: 1 }, uL: { value: LIGHT }, uFog: { value: FOG } };
export interface ToonOpts { color?: string; emis?: number; hatch?: number; fog?: number; flat?: number; rx?: number; ry?: number; side?: THREE.Side }
export function T(map?: THREE.Texture | null, o: ToonOpts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(o.color || '#ffffff') }, uMap: { value: map || WHITE }, uEmis: { value: o.emis || 0 }, uOpacity: { value: 1 }, uHatch: { value: o.hatch === undefined ? 1 : o.hatch }, uFogK: { value: o.fog === undefined ? .0026 : o.fog }, uFlat: { value: o.flat || 0 }, uRep: { value: new THREE.Vector2(o.rx || 1, o.ry || 1) }, ...SHARED },
    vertexShader: TOON_VS, fragmentShader: TOON_FS, side: o.side || THREE.FrontSide,
  });
}
export const M: Record<string, THREE.ShaderMaterial> = {};
export { T as toonMaterial };
function makeMaterials() {
  Object.assign(M, {
    steel: T(TX.steel), steelD: T(TX.steelD), yellow: T(TX.yellow), yellowP: T(TX.yellowP), hazard: T(TX.hazard, { rx: 3 }), hazard1: T(TX.hazard),
    rubber: T(TX.rubber), cloth: T(TX.cloth), vest: T(TX.vest), gun: T(TX.gun), helmet: T(TX.helmet), hardhat: T(TX.hardhat), skin: T(TX.skin),
    corr: T(TX.corr, { rx: 2 }), rust: T(TX.rust), tealC: T(TX.tealC), door: T(TX.door), concrete: T(TX.concrete, { rx: 2, ry: 2 }),
    rock: T(TX.rock), mesa: T(TX.mesa, { rx: 3, ry: 1 }), ground: T(TX.ground, { rx: 70, ry: 70, hatch: .55, flat: 1 }), road: T(TX.road, { rx: 30, ry: 1, hatch: .55, flat: 1 }), ore: T(TX.ore, { emis: .35 }), oreDead: T(TX.rock, { color: '#b9b0a8' }),
    indigo: T(TX.indigo), indigoL: T(TX.indigo, { color: '#c9c2ff' }), indigoD: T(TX.indigoD), smoke: T(TX.smoke, { hatch: .5 }), dust: T(TX.smoke, { hatch: .3, color: '#f0b98a' }),
    visor: T(null, { color: '#ffe27a', emis: 1 }), cyan: T(null, { color: '#8ff2ff', emis: 1 }), teal: T(null, { color: '#35e0c8', emis: .9 }), mag: T(null, { color: '#ff4f9a', emis: .9 }), red: T(null, { color: '#ff4b3a', emis: 1 }),
    planet: T(TX.planet, { fog: 0, hatch: .4 }), ring: T(null, { color: '#ffe9c4', emis: .8, fog: 0, side: THREE.DoubleSide }),
    orange: T(TX.yellowP, { color: '#ff9a5c' }), helmetB: T(TX.helmet, { color: '#ffb08a' }), gold: T(TX.yellowP, { color: '#ffe2a0', emis: .35 }), crys: T(TX.ore, { color: '#8ff7ff', emis: .5 }),
    scorch: T(null, { color: '#2a1a1c', hatch: 0, flat: 1 }), bolt: T(null, { color: '#9dfcff', emis: 1 }), fire: T(null, { color: '#ffb23a', emis: 1 }), spark: T(null, { color: '#fff1a0', emis: 1 }),
    sign: T(TX.sign), violet: T(null, { color: '#b58cff', emis: .9 }), flash: T(null, { color: '#fff6c0', emis: 1, side: THREE.DoubleSide }),
  });
  M.scorch.polygonOffset = true; M.scorch.polygonOffsetFactor = -3; M.scorch.polygonOffsetUnits = -3;
  M.road.polygonOffset = true; M.road.polygonOffsetFactor = -2; M.road.polygonOffsetUnits = -2;
}
export const holoOK = new THREE.MeshBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide });
export const holoBad = new THREE.MeshBasicMaterial({ color: 0xff4b3a, transparent: true, opacity: .34, depthWrite: false, side: THREE.DoubleSide });
export const holoLine = new THREE.LineBasicMaterial({ color: 0xc8fbff, transparent: true, depthWrite: false });
export const ringMat = new THREE.MeshBasicMaterial({ color: 0x8be04e, transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide });
export const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff3a8, depthWrite: false });

// ---------------------------------------------------------------- geometry kit
export const G: Record<string, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(.5, 20, 12), cyl: new THREE.CylinderGeometry(.5, .5, 1, 16), cyl8: new THREE.CylinderGeometry(.5, .5, 1, 8),
  taper: new THREE.CylinderGeometry(.32, .5, 1, 14), hexT: new THREE.CylinderGeometry(.4, .5, 1, 6), cone: new THREE.ConeGeometry(.5, 1, 16), cone4: new THREE.ConeGeometry(.5, 1, 4), cone6: new THREE.ConeGeometry(.5, 1, 6),
  hemi: new THREE.SphereGeometry(.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), torus: new THREE.TorusGeometry(.5, .06, 8, 28), torusF: new THREE.TorusGeometry(.5, .12, 8, 28), arc: new THREE.TorusGeometry(.5, .1, 8, 16, Math.PI),
  oct: new THREE.OctahedronGeometry(.5), dod: new THREE.DodecahedronGeometry(.5), half: new THREE.CylinderGeometry(.5, .5, 1, 18, 1, false, 0, Math.PI), disc: new THREE.CircleGeometry(.5, 24), ringG: new THREE.RingGeometry(.42, .5, 28),
};
type P3 = [number, number, number];
export function mk(geo: THREE.BufferGeometry, mat: THREE.Material, p: P3 | 0, s: P3 | 0, r: P3 | 0, parent: THREE.Object3D) {
  const m = new THREE.Mesh(geo, mat); if (p) m.position.set(p[0], p[1], p[2]); if (s) m.scale.set(s[0], s[1], s[2]); if (r) m.rotation.set(r[0], r[1], r[2]); parent.add(m); return m;
}
const UP = V3(0, 1, 0);
export function beam(a: P3, b: P3, r: number, mat: THREE.Material, parent: THREE.Object3D) {
  const A = V3(...a), B = V3(...b), d = B.clone().sub(A); const m = new THREE.Mesh(G.cyl8, mat); m.scale.set(r * 2, d.length(), r * 2); m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); parent.add(m); return m;
}
export function setLayer(o: THREE.Object3D, layer: number) { o.traverse(x => x.layers.set(layer)); return o; }

// ---------------------------------------------------------------- sky
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uL: { value: LIGHT }, uPx: SHARED.uPx, uDusk: DUSK }, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `precision highp float; varying vec3 vD; uniform vec3 uL; uniform float uPx; uniform float uDusk; ${NOISE}
    void main(){ vec3 d=normalize(vD); float h=d.y;
      float t=h+(vnoise(d.xz*5.+d.y*3.)-.5)*.05; t=floor(t*14.)/14.;
      vec3 hor=mix(vec3(1.,.86,.58),vec3(1.,.58,.3),uDusk), mid=mix(vec3(.36,.78,.76),vec3(.86,.42,.5),uDusk), top=mix(vec3(.07,.33,.50),vec3(.15,.09,.34),uDusk);
      vec3 col=t<.14?mix(hor,mid,clamp(t/.14,0.,1.)):mix(mid,top,clamp((t-.14)/.55,0.,1.));
      vec2 p=vec2(d.x*4.+d.z*2.7,h*24.); float c=vnoise(p)*.65+vnoise(p*2.3+7.)*.35;
      float band=smoothstep(.03,.1,h)*(1.-smoothstep(.34,.5,h));
      col=mix(col,vec3(1.,.9,.72),smoothstep(.56,.58,c)*band*.85); col=mix(col,vec3(1.,.98,.9),smoothstep(.62,.64,c)*band);
      float sd=dot(d,normalize(uL)); col=mix(col,vec3(1.,.95,.7),smoothstep(.9965,.9972,sd)); col=mix(col,vec3(1.,.9,.6),smoothstep(.985,.9855,sd)*.35);
      vec2 q=gl_FragCoord.xy/uPx/8.; q.x+=mod(floor(q.y),2.)*.5; float dt=length(fract(q)-.5);
      col=mix(col,col*.84,step(dt,.36*(1.-clamp(h*3.2,0.,1.))));
      vec2 sg=floor(vec2(atan(d.z,d.x)*90.,h*150.)); col=mix(col,vec3(1.,.95,.85),step(.992,hash(sg))*smoothstep(.5,.9,uDusk)*smoothstep(.25,.5,h));
      if(h<0.) col=hor;
      gl_FragColor=vec4(col,1.); }`,
  });
  const g = new THREE.Group();
  setLayer(mk(new THREE.SphereGeometry(2600, 32, 20), mat, 0, 0, 0, g), L_FX);
  const pd = V3(.5, .3, -1).normalize().multiplyScalar(1500);
  mk(G.sph, M.planet, [pd.x, pd.y, pd.z], [470, 470, 470], [.3, 0, .35], g);
  mk(new THREE.RingGeometry(300, 430, 48), M.ring, [pd.x, pd.y, pd.z], 0, [Math.PI / 2 - .32, .35, 0], g);
  const md = V3(1, .2, .12).normalize().multiplyScalar(1500);
  mk(G.sph, M.planet, [md.x, md.y, md.z], [150, 150, 150], [1, 0, .2], g);
  return g;
}

// ---------------------------------------------------------------- pipeline
const POST_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tC,tD,tN; uniform vec2 uRes; uniform float uNear,uFar,uOrtho,uPx,uSat,uStatic,uTime,uFlash,uDusk; ${NOISE}
float lin(vec2 uv){ float d=texture2D(tD,uv).x; if(uOrtho>.5) return uNear+d*(uFar-uNear); float z=d*2.-1.; return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear)); }
vec3 nrm(vec2 uv){ return texture2D(tN,uv).xyz*2.-1.; }
float edgeAt(vec2 u, vec2 sp){
  float d0=lin(u);
  float th=uOrtho>.5?1.5:mix(2.6,1.15,clamp(d0/45.,0.,1.));
  th*=(.8+.5*vnoise(sp/60.))*uPx;
  vec2 px=th/uRes;
  float dA=lin(u+px),dB=lin(u-px),dC=lin(u+px*vec2(-1.,1.)),dD=lin(u+px*vec2(1.,-1.));
  vec3 n0=nrm(u),nA=nrm(u+px),nB=nrm(u-px),nC=nrm(u+px*vec2(-1.,1.)),nD=nrm(u+px*vec2(1.,-1.));
  float de;
  if(uOrtho>.5){ de=smoothstep(.5,1.,(abs(dA-dB)+abs(dC-dD))); }
  else { float dmin=min(min(dA,dB),min(dC,dD)); float dd=(abs(dA-dB)+abs(dC-dD))/max(dmin,.01); de=smoothstep(.05,.09,dd*clamp(abs(n0.z),.08,1.)); }
  float nd=length(nA-nB)+length(nC-nD); float ne=smoothstep(.7,1.05,nd)*(1.-smoothstep(140.,320.,d0));
  return max(de,ne);
}
void main(){
  vec2 sp=vUv*uRes/uPx;
  vec2 wobv=(vec2(vnoise(sp/9.),vnoise(sp/9.+31.))-.5)*2.2*uPx/uRes;
  vec2 u=vUv+wobv; vec2 h=.3/uRes;
  float edge=(edgeAt(u+h,sp)+edgeAt(u-h,sp)+edgeAt(u+h*vec2(1.,-1.),sp)+edgeAt(u+h*vec2(-1.,1.),sp))*.25;
  vec3 col=texture2D(tC,vUv).rgb;
  col=mix(col,vec3(.055,.05,.08),edge*.97);
  col=mix(col,col*vec3(1.1,.8,.84)+vec3(.03,0.,.07),uDusk*.75);
  col=mix(vec3(dot(col,vec3(.3,.59,.11))),col,1.18*uSat);
  col*=.95+.08*vnoise(sp*.5);
  float v=smoothstep(1.3,.5,length((vUv-.5)*vec2(1.25,1.))); col*=mix(.7,1.,v);
  col=mix(col,vec3(1.,.97,.86),uFlash);
  if(uStatic>0.){ float s=hash(floor(sp/3.)+uTime*60.); float bar=step(.92,fract(vUv.y*6.+uTime*3.)); col=mix(col,vec3(s)*.9+bar*.1,uStatic); }
  gl_FragColor=vec4(col,1.);
}`;

export class Pipeline {
  renderer: THREE.WebGLRenderer;
  w = 1; h = 1; px = 1;
  private rtC: THREE.WebGLRenderTarget; private rtN: THREE.WebGLRenderTarget; private rtS: THREE.WebGLRenderTarget;
  private normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  private depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  private postMat: THREE.ShaderMaterial; private postScene = new THREE.Scene(); private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private sun = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 500);
  sat = 1; static = 0; time = 0; flash = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);
    makeTextures(); makeMaterials();
    const S = 2048;
    this.rtS = new THREE.WebGLRenderTarget(S, S, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtS.depthTexture = new THREE.DepthTexture(S, S); this.rtS.depthTexture.type = THREE.UnsignedIntType;
    this.rtS.depthTexture.minFilter = this.rtS.depthTexture.magFilter = THREE.NearestFilter;
    SHARED.uShadow.value = this.rtS.depthTexture; SHARED.uShadowTex.value = 1 / S;
    this.rtC = new THREE.WebGLRenderTarget(4, 4); this.rtN = new THREE.WebGLRenderTarget(4, 4);
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tC: { value: null }, tD: { value: null }, tN: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: .06 }, uFar: { value: 4000 }, uOrtho: { value: 0 }, uPx: SHARED.uPx, uSat: { value: 1 }, uFlash: { value: 0 }, uStatic: { value: 0 }, uTime: { value: 0 }, uDusk: DUSK },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
  }

  resize(w: number, h: number) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h; this.px = h / 900; SHARED.uPx.value = this.px;
    this.renderer.setSize(w, h, false);
    this.rtC.dispose(); this.rtN.dispose();
    this.rtC = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtC.depthTexture = new THREE.DepthTexture(w, h); this.rtC.depthTexture.type = THREE.UnsignedIntType;
    this.rtN = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const u = this.postMat.uniforms; u.tC.value = this.rtC.texture; u.tD.value = this.rtC.depthTexture; u.tN.value = this.rtN.texture; u.uRes.value.set(w, h);
  }

  /** Moves the sun toward the horizon and warms the grade. 0 is midday, 1 is sunset. */
  setDusk(k: number) { if (Math.abs(k - DUSK.value) < .002 && k !== 0) return; DUSK.value = k; LIGHT.set(-.55 - k * .2, .62 - k * .22, .56).normalize(); FOG.set('#f3c9a0').lerp(DUSKFOG, k); }
  /** Renders the scene with shadows centred on `focus`, covering `span` metres. */
  draw(scene: THREE.Scene, cam: THREE.PerspectiveCamera | THREE.OrthographicCamera, focus: THREE.Vector3, span: number) {
    const r = this.renderer, sun = this.sun;
    sun.left = sun.bottom = -span / 2; sun.right = sun.top = span / 2; sun.updateProjectionMatrix();
    sun.position.copy(focus).addScaledVector(LIGHT, 220); sun.lookAt(focus); sun.updateMatrixWorld();
    SHARED.uShadowMat.value.multiplyMatrices(sun.projectionMatrix, sun.matrixWorldInverse);
    sun.layers.set(0); sun.layers.enable(L_SELF);
    scene.overrideMaterial = this.depthMat; r.setRenderTarget(this.rtS); r.clear(); r.render(scene, sun); scene.overrideMaterial = null;

    cam.layers.set(0); cam.layers.enable(L_FX); cam.layers.enable(L_VM);
    r.setRenderTarget(this.rtC); r.setClearColor(0xffdc94, 1); r.clear(); r.render(scene, cam);
    cam.layers.set(0); cam.layers.enable(L_VM); scene.overrideMaterial = this.normalMat;
    r.setRenderTarget(this.rtN); r.setClearColor(0x8080ff, 1); r.clear(); r.render(scene, cam); scene.overrideMaterial = null;

    const u = this.postMat.uniforms; u.uOrtho.value = (cam as any).isOrthographicCamera ? 1 : 0; u.uNear.value = cam.near; u.uFar.value = cam.far; u.uSat.value = this.sat; u.uFlash.value = this.flash; u.uStatic.value = this.static; u.uTime.value = this.time;
    r.setRenderTarget(null); r.render(this.postScene, this.postCam);
  }
}
/** Builds the shared textures and materials without a renderer, for the match server. */
export function initHeadless() { makeTextures(); makeMaterials(); }
