// Rendering: hand-painted procedural textures, the comic toon shader with real shadows,
// and the ink-outline post pass.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ENV, NOW, KEYDIR, SUNDIR, setLight, hourOf, LAMPS, LAMP_P, LAMP_C, LAMP_N } from './light';

THREE.ColorManagement.enabled = false;

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const INK = '#0e0d14';
/** Direction towards the key light: the sun by day, the ringed planet by night. light.ts moves it with the hour. */
export const LIGHT = KEYDIR;

// Layers: 0 solid world, 1 effects without outlines, 2 first-person view-model, 3 the player's own body (shadow only).
export const L_FX = 1, L_VM = 2, L_SELF = 3;

let seed = 11;
export const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const R = (a: number, b: number) => a + rnd() * (b - a);
/** Restarts the random sequence. The world is laid out from a fixed seed so every player in a match gets the same map. */
export const reseed = (s: number) => { seed = s | 0; };

export function tone(hex: string, k: number) { const c = new THREE.Color(hex); if (k >= 1) c.lerp(new THREE.Color('#ffffff'), k - 1); else c.multiplyScalar(k); return '#' + c.getHexString(); }

// ---------------------------------------------------------------- painted textures
export type Ctx = CanvasRenderingContext2D;
/** Ink lines are drawn at this share of their old width: Mat found the pen "a bit heavy all round". Coloured strokes keep their width. */
export const INK_W = (col?: string) => !col || col === INK ? .5 : 1;
export function wob(g: Ctx, pts: number[][], w: number, col?: string) {
  g.strokeStyle = col || INK; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.lineWidth = w * INK_W(col) * (pass ? .55 : 1); g.beginPath();
    pts.forEach((p, i) => { const x = p[0] + R(-1.4, 1.4), y = p[1] + R(-1.4, 1.4); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
}
export function paint(base: string, draw?: (g: Ctx, s: number) => void, o: { size?: number; blot?: number } = {}) {
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
export function scratches(g: Ctx, s: number, n: number, col: string, len = 46) {
  for (let i = 0; i < n; i++) { g.globalAlpha = R(.3, .8); const x = R(0, s), y = R(0, s), a = R(0, 6.3), l = R(6, len); wob(g, [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], R(1, 2.4), col); }
  g.globalAlpha = 1;
}
export function chips(g: Ctx, s: number, n: number, col: string, rmax = 20) {
  for (let i = 0; i < n; i++) {
    const x = R(0, s), y = R(0, s), r = R(4, rmax); g.beginPath();
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283, rr = r * R(.45, 1.15); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();
  }
}
export function panels(g: Ctx, s: number, nx: number, ny: number, w = 5) {
  for (let i = 0; i <= nx; i++) { const x = Math.min(s - 3, Math.max(3, i * s / nx)); wob(g, [[x, 0], [x, s / 2], [x, s]], w); }
  for (let j = 0; j <= ny; j++) { const y = Math.min(s - 3, Math.max(3, j * s / ny)); wob(g, [[0, y], [s / 2, y], [s, y]], w); }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (const [dx, dy] of [[.1, .1], [.9, .1], [.1, .9], [.9, .9]]) {
    const x = (i + dx) * s / nx, y = (j + dy) * s / ny; g.fillStyle = INK; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(x - 1.5, y - 1.5, 1.8, 0, 7); g.fill();
  }
}
export function grime(g: Ctx, s: number, n: number) {
  for (let i = 0; i < n; i++) { const x = R(0, s), y = R(0, s * .5), l = R(30, 160); const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(30,18,24,.42)'); gr.addColorStop(1, 'rgba(30,18,24,0)'); g.fillStyle = gr; g.fillRect(x, y, R(3, 10), l); }
}
export function hatchPatch(g: Ctx, s: number, n: number) {
  for (let i = 0; i < n; i++) { const x = R(0, s), y = R(0, s), w = R(20, 70); g.globalAlpha = .7; for (let k = 0; k < 6; k++) wob(g, [[x + k * 7, y], [x + k * 7 - w * .4, y + w * .5]], 1.8); }
  g.globalAlpha = 1;
}
export function stencil(g: Ctx, txt: string, x: number, y: number, px: number, col: string, rot = 0) { g.save(); g.translate(x, y); g.rotate(rot); g.font = '900 ' + px + 'px Impact, "Arial Narrow", sans-serif'; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; const w = g.measureText(txt).width, max = g.canvas.width * .84; if (w > max) g.scale(max / w, 1); g.fillText(txt, 0, 0); g.restore(); }
export function ribs(g: Ctx, s: number, n: number) { for (let i = 0; i < n; i++) wob(g, [[i * s / n, 0], [i * s / n, s]], 3.5); }

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
  TX.mesa = paint('#c8653c', (g, s) => { const cols = ['#d97a48', '#a94a30', '#e09058', '#8e3d2c']; for (let i = 0; i < 9; i++) { g.globalAlpha = .55; g.fillStyle = cols[i % 4]; const y = i * s / 9 + R(-8, 8); g.fillRect(0, y, s, R(14, 40)); g.globalAlpha = 1; wob(g, [[0, y], [s * .25, y + R(-6, 6)], [s * .5, y + R(-6, 6)], [s * .75, y + R(-6, 6)], [s, y]], R(2.5, 5)); } for (let i = 0; i < 9; i++) { const x = R(0, s), y = R(0, s * .8), l = R(.1, .3) * s, mx = x + R(-14, 14); wob(g, [[x, y], [mx, y + l * .5], [mx + R(-12, 12), y + l]], R(2, 3.6)); if (i % 3 === 0) wob(g, [[mx, y + l * .5], [mx + R(14, 30) * (i % 2 ? 1 : -1), y + l * .78]], 2); } hatchPatch(g, s, 12); });
  TX.ore = paint('#b8f58c', (g, s) => { for (let i = 0; i < 12; i++) { const x = R(0, s); g.globalAlpha = .6; g.fillStyle = '#f2ffe0'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + R(20, 60), 0); g.lineTo(x + R(-40, 40), s); g.fill(); g.globalAlpha = 1; wob(g, [[x, 0], [x + R(-40, 40), s]], 3, '#3c7a3a'); } }, { blot: 60 });
  TX.indigo = paint('#4433b8', (g, s) => { for (let i = 0; i < 14; i++) { let x = R(0, s), y = 0; const pts = [[x, y]]; while (y < s) { y += R(30, 70); x += R(-36, 36); pts.push([x, y]); } wob(g, pts, R(2, 4), '#35e0c8'); } scratches(g, s, 30, INK, 26); hatchPatch(g, s, 8); });
  TX.indigoD = paint('#2a1f78', (g, s) => { scratches(g, s, 40, '#6a5ae0', 30); hatchPatch(g, s, 10); });
  TX.smoke = paint('#f2e9d8', (g, s) => { scratches(g, s, 30, '#b8ae9c', 60); }, { blot: 80 });
  TX.planet = paint('#f3d9b0', (g, s) => { const cols = ['#e8b98a', '#f8e8c8', '#d99a78', '#f0c8a0']; for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 4]; g.globalAlpha = .8; const y = i * s / 12 + R(-6, 6); g.fillRect(0, y, s, R(10, 36)); g.globalAlpha = 1; wob(g, [[0, y], [s / 2, y + R(-5, 5)], [s, y]], R(2, 4), '#8a5a48'); } }, { blot: 40 });
  TX.sign = paint('#f4ead2', (g, s) => { g.fillStyle = INK; g.fillRect(0, 0, s, 30); g.fillRect(0, s - 30, s, 30); stencil(g, 'IRONHOLD', s * .5, s * .5, 104, INK); chips(g, s, 12, '#b8492e', 14); scratches(g, s, 30, INK, 20); grime(g, s, 12); }, { blot: 30 });
}

// ---------------------------------------------------------------- toon shader
const FOG = new THREE.Color('#ecd2c2'), FOGS = new THREE.Color('#ffe6bd');
export const NOISE = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}`;
const TOON_VS = `uniform vec3 uL; uniform vec2 uRep; attribute float aEm; varying vec3 vN,vL,vP,vW,vWn,vO,vOn; varying vec2 vUv; varying float vEm,vSh,vCav;
#ifdef WEAR
attribute vec2 aWear; varying vec2 vUv2;
#endif
void main(){ vUv=uv*uRep;
#ifdef WEAR
  vUv2=aWear;
#endif
  float cq=floor(aEm/32.+.001), er=aEm-32.*cq; vCav=cq<.5?0.:(cq-16.)/15.; float sq=floor(er*.5+.001); vEm=er-2.*sq; vSh=sq*.1; vO=position*length(modelMatrix[0].xyz); vOn=normal; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=viewMatrix*w; vP=mv.xyz; vN=normalize(normalMatrix*normal); vWn=normalize(mat3(modelMatrix)*normal); vL=(viewMatrix*vec4(uL,0.)).xyz; gl_Position=projectionMatrix*mv; }`;
const TOON_FS = `precision highp float;
uniform vec3 uColor,uFog; uniform sampler2D uMap,uShadow; uniform mat4 uShadowMat; uniform float uEmis,uOpacity,uHatch,uFogK,uFlat,uPx,uShadowTex,uGrit,uShine,uKey,uFogD,uMist,uCloudK,uCloudTh,uRimK; uniform vec2 uCloudO; uniform vec3 uRimC;
uniform vec3 uSunT,uAmbT,uFogS; uniform vec4 uPLp[8]; uniform vec3 uPLc[8]; uniform int uPLn;
varying vec3 vN,vL,vP,vW,vWn,vO,vOn; varying vec2 vUv; varying float vEm,vSh,vCav;
#ifdef WEAR
uniform sampler2D uWear; varying vec2 vUv2;
#endif
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
#if defined(GROUND)||defined(BLOOM)
vec2 h2(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
// Distance to the nearest edge of a field of cracked plates, and a random number for the plate.
vec2 crackle(vec2 p){
  vec2 i=floor(p), f=fract(p), mg=vec2(0.), mr=vec2(0.); float md=8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)); vec2 r=g+h2(i+g)-f; float d=dot(r,r); if(d<md){ md=d; mr=r; mg=g; } }
  md=8.;
  for(int y=-2;y<=2;y++) for(int x=-2;x<=2;x++){ vec2 g=mg+vec2(float(x),float(y)); vec2 r=g+h2(i+g)-f; vec2 dr=r-mr; if(dot(dr,dr)>.00001) md=min(md,dot(.5*(mr+r),normalize(dr))); }
  return vec2(md,hash(i+mg));
}
#endif
#ifdef GROUND
uniform vec4 uRoad; uniform float uRoadW;
// The desert floor is painted here rather than in a tiled picture, so it never repeats and stays crisp underfoot:
// big two-tone patches with a broken pen contour, wind-bleached drifts, cracked plates, pebbles, and the road with its ruts.
vec3 groundAt(vec2 p){
  vec2 gx=dFdx(p), gy=dFdy(p); float fw=max((length(gx)+length(gy))*.5,1e-4), lod=max(min(length(gx),length(gy)),1e-4);
  vec2 w=p+(vec2(vnoise(p*.13),vnoise(p*.13+17.))-.5)*9.;
  float n1=vnoise(w*.028)*.62+vnoise(w*.075+3.)*.38, a1=fwidth(n1)+.0004;
  float dr=vnoise(vec2(w.x*.02+w.y*.012,w.y*.11-w.x*.05)+60.), a2=fwidth(dr)+.0004;
  vec3 sand=vec3(.75,.56,.4), earth=vec3(.63,.43,.305), deep=vec3(.47,.31,.235), pale=vec3(.79,.63,.455), inkc=vec3(.2,.1,.09);
  float eM=smoothstep(.55-a1,.55+a1,n1), dM=smoothstep(.68-a1,.68+a1,n1), pM=smoothstep(.74-a2,.74+a2,dr)*(1.-eM);
  vec3 c=mix(mix(mix(sand,earth,eM),deep,dM),pale,pM); float ink=0.;
  // a pen line round each patch, lifted off the page here and there
  float brk=smoothstep(.36,.5,vnoise(p*.21+9.));
  ink=max(ink,(1.-smoothstep(.05,.05+fw,abs(n1-.55)/a1*fw))*brk*clamp(.1/fw,0.,1.));
  ink=max(ink,(1.-smoothstep(.03,.03+fw,abs(dr-.74)/a2*fw))*(1.-brk)*(1.-eM)*.5*clamp(.06/fw,0.,1.));
  // each darker patch sits a little proud of the sand: a shaded lip inside its edge, scribbled in, and a bleached line outside it
  float dM1=(n1-.55)/a1*fw*1.4, lip=(1.-smoothstep(0.,.5,dM1))*step(0.,dM1)*brk;
  c=mix(c,deep*.9,lip*.55); c=mix(c,pale,(1.-smoothstep(0.,.1+fw,-dM1))*step(dM1,0.)*(1.-brk)*.5*clamp(.2/fw,0.,1.));
  // dry-brush scribble: bunches of short slanted strokes, as an inker roughs in dirt. Far off they settle into a flat tone.
  { vec2 pw2=p+(vec2(vnoise(p*.7+5.),vnoise(p*.7+25.))-.5)*.5; float hv=(pw2.x+pw2.y*.8)/.2, hu=pw2.x*.8-pw2.y, bun=smoothstep(.6,.66,vnoise(p*.42+41.)+lip*.3), near=clamp((.04-lod)/.02,0.,1.);
    float st=(1.-smoothstep(.06,.06+fw/.2,abs(fract(hv)-.5)))*smoothstep(.52,.6,vnoise(vec2(hu*3.6,floor(hv)*3.7)));
    ink=max(ink,st*bun*near*.42*clamp(.03/fw,0.,1.)); c*=1.-bun*(1.-near)*.05; }
  // the road: packed earth, ragged at the edges, two ruts with tread marks
  vec2 ab=uRoad.zw-uRoad.xy; float len=max(length(ab),.01); vec2 ad=ab/len, rp=p-uRoad.xy; float along=clamp(dot(rp,ad),0.,len), side=dot(rp,vec2(-ad.y,ad.x)), rd=length(rp-ad*along);
  float re=uRoadW+(vnoise(p*.33)-.5)*1.5+(vnoise(p*1.9)-.5)*.3, rm=(1.-smoothstep(re-fw,re+fw,rd))*step(.5,uRoadW);
  float rut=1.-smoothstep(.24,.3+fw,abs(abs(side)-1.2));
  vec3 rc=mix(vec3(.62,.39,.27),vec3(.5,.29,.21),rut*.8); rc=mix(rc,rc*1.12,smoothstep(.5,.7,vnoise(p*vec2(.9,.9)+ad*along*.2)));
  c=mix(c,rc,rm);
  ink*=1.-rm;
  ink=max(ink,rm*rut*(1.-smoothstep(.03,.03+fw,abs(fract(along/.52+side*.35)-.5)*.52))*.5*smoothstep(.42,.58,vnoise(vec2(along*.5,side*2.)+70.))*clamp((.09-lod)/.05,0.,1.));
  ink=max(ink,(1.-smoothstep(.055,.055+fw,abs(rd-re)))*smoothstep(.38,.52,vnoise(p*.3+4.))*clamp(.11/fw,0.,1.)*step(.5,uRoadW));
  // cracked plates inside the darker earth
  float cm=eM*(1.-rm)*smoothstep(.46,.6,vnoise(p*.07+21.))*clamp((.16-lod)/.08,0.,1.);
  if(cm>.01){ vec2 v=crackle(p*.4+(vnoise(p*.9)-.5)*.5); float d=v.x/.4, cw=.02+.03*v.y;
    c=mix(c,c*(.88+.22*v.y),cm); ink=max(ink,(1.-smoothstep(cw,cw+fw,d))*cm*clamp(cw*2.5/fw,0.,1.)); }
  // wind ripples, pencilled across the open sand in bunches
  float rf=clamp((.06-lod)/.03,0.,1.)*(1.-eM)*(1.-rm);
  if(rf>.01){ float rv=p.x*.42+p.y*.9+(vnoise(p*.35+13.)-.5)*3.2, rl=abs(fract(rv/1.6)-.5)*1.6;
    ink=max(ink,(1.-smoothstep(.016,.016+fw,rl))*rf*smoothstep(.55,.68,vnoise(p*vec2(.18,.5)+33.))*.45*clamp(.03/fw,0.,1.)); }
  // pebbles
  float pf=clamp((.07-lod)/.035,0.,1.);
  if(pf>.01){ vec2 q=p*1.15, ci=floor(q), hh=h2(ci); float on=step(.66,hash(ci+5.));
    vec2 dd=(fract(q)-(.22+.56*hh))*vec2(1.,1.4+hh.x)/1.15; float r=length(dd), rad=.03+.065*hh.y;
    float sr=length(dd-vec2(.5,-.5)*rad); c=mix(c,deep*.72,(1.-smoothstep(rad*.95-fw*.5,rad*.95+fw*.5,sr))*pf*on*.8);
    c=mix(c,hh.x>.5?pale*1.04:earth*.92,(1.-smoothstep(rad-fw*.5,rad+fw*.5,r))*pf*on);
    ink=max(ink,(1.-smoothstep(.014,.014+fw,abs(r-rad)))*pf*on*clamp(.03/fw,0.,1.)*(.35+.65*smoothstep(-.2,.6,dd.x-dd.y)/1.)); }
  c*=(.97+.06*vnoise(p*3.1))*(.91+.18*vnoise(p*.011+5.));
  return mix(c,inkc,ink*.78);
}
#endif
#ifdef CLIFF
// Cliffs are painted in place too: beds of rock in four tones, an inked line along each bed, a scribbled shadow under the ledges,
// cracks running down through a bed, and a dusty cap. It is drawn in metres, so a mesa eighty metres wide is as crisp as a boulder.
vec3 cliffAt(vec3 w, vec3 wn){
  float u=abs(wn.x)>abs(wn.z)?w.z:w.x, fy=max(fwidth(w.y),1e-4), fu=min(max(fwidth(u),1e-4),4.), fm=max(fy,fu);
  float yy=w.y+(vnoise(w.xz*.045)-.5)*5.+(vnoise(vec2(u*.3,w.y*.2))-.5)*.7, b=yy/4.2, id=floor(b), f=fract(b);
  float r1=hash(vec2(id,3.)), r2=hash(vec2(id,9.));
  vec3 col=r1<.25?vec3(.66,.3,.2):r1<.5?vec3(.8,.42,.25):r1<.8?vec3(.87,.53,.32):vec3(.58,.26,.185), inkc=vec3(.2,.08,.07);
  float far=clamp(.5/fm,0.,1.), ink=0.;
  // the line along the top of each bed, lifted here and there, and a finer seam inside it
  float lw=.045+.05*r1, d=min(f,1.-f)*4.2;
  ink=max(ink,(1.-smoothstep(lw,lw+fy,d))*smoothstep(.22,.34,vnoise(vec2(u*.11,id*5.3)))*clamp(lw*3./fy,.25,1.));
  ink=max(ink,(1.-smoothstep(.022,.022+fy,abs(f-(.3+.4*r2))*4.2))*smoothstep(.5,.6,vnoise(vec2(u*.2,id*3.1+40.)))*.7*clamp(.07/fy,0.,1.));
  // under a ledge: a band of shade with slanted strokes
  float led=smoothstep(.66,.98,f)*step(.42,hash(vec2(id+1.,5.)));
  col*=1.-led*.2;
  { float hv=(u+w.y*.8)/.42, st=(1.-smoothstep(.09,.09+fm/.42,abs(fract(hv)-.5)))*smoothstep(.35,.5,vnoise(vec2((u-w.y)*1.3,floor(hv)*2.3)));
    ink=max(ink,st*led*.6*clamp(.05/fm,0.,1.)); col*=1.-led*.1*(1.-clamp(.05/fm,0.,1.)); }
  // cracks that run down through one bed
  { float cu=floor((u+id*2.6)/7.), cx=(hash(vec2(cu,id))*.6+.2)*7., du=abs(mod(u+id*2.6,7.)-cx+(vnoise(vec2(w.y*.7,cu))-.5)*.9);
    float on=step(.5,hash(vec2(cu,id+11.)))*smoothstep(0.,.12,f)*smoothstep(0.,.3,1.-f), cw=.035+.03*r2;
    ink=max(ink,(1.-smoothstep(cw,cw+fu,du))*on*clamp(cw*3./fu,0.,1.));
    // a chip of shade on one side of the crack
    col*=1.-on*.14*(1.-smoothstep(0.,.5,mod(u+id*2.6,7.)-cx))*step(cx,mod(u+id*2.6,7.)); }
  // weather: grain, and long stains running down
  col*=(.93+.14*vnoise(vec2(u*.9,w.y*2.4)))*(.9+.2*vnoise(vec2(u*.45,w.y*.05)+3.));
  col=mix(col,vec3(.86,.62,.42)*(.95+.1*vnoise(w.xz*1.3)),smoothstep(.55,.75,wn.y));
  return mix(col,inkc,ink*.85*(.4+.6*far));
}
#endif
#ifdef BLOOM
// The Gloam's carpet is painted in place as well: fat moss pads with an inked gap between them, each one cushioned,
// tufted up close, glowing spore freckles, and a dark lip that creeps over the sand in fingers instead of ending in a clean circle.
// Returns the colour, with the glow of the freckles in w. e runs from 0 at the middle to 1 at the ragged lip.
vec4 bloomAt(vec2 p, float e){
  float fw=max(length(fwidth(p)),1e-4), near=clamp(.05/fw,0.,1.);
  vec2 w=p+(vec2(vnoise(p*.3),vnoise(p*.3+11.))-.5)*1.7+(vec2(vnoise(p*2.3+2.),vnoise(p*2.3+31.))-.5)*.34;
  vec2 c=crackle(w*.85);
  vec3 deep=vec3(.115,.215,.085), mid=vec3(.25,.43,.125), lite=vec3(.37,.56,.15), inkc=vec3(.04,.085,.045);
  vec3 col=c.y<.2?deep*1.5:c.y<.62?mid:lite;
  // each pad is a little cushion: darker down at its gap, lighter on its crown
  col*=.84+.24*smoothstep(0.,.3,c.x)*near+.1*(1.-near);
  col*=.9+.2*vnoise(p*.16+3.);
  float gn=vnoise(w*1.1+7.), gw=.018+.045*gn, g=(1.-smoothstep(gw,gw+fw*.6,c.x))*clamp(gw*5./(fw*.6),0.,1.);
  col=mix(col,inkc,g*(.35+.6*smoothstep(.3,.55,gn)));
  // short veins on the bigger pads
  { vec2 q=w*2.6; float v=abs(fract(q.x+q.y*.4+vnoise(q*.7)*1.3)-.5), on=step(.55,c.y)*smoothstep(.1,.2,c.x)*smoothstep(.45,.6,vnoise(q*.45+20.));
    col=mix(col,col*.62,(1.-smoothstep(.035,.035+fw*2.6,v))*on*near); }
  // up close each pad is tufted: short curved nicks, as an inker flicks in moss
  { vec2 q=w*5.5, qi=floor(q), qf=fract(q)-.5, o=(h2(qi+7.)-.5)*.5; float h=hash(qi+1.), an=h*6.283; vec2 d=qf-o, r=vec2(d.x*cos(an)+d.y*sin(an),-d.x*sin(an)+d.y*cos(an));
    float nick=(1.-smoothstep(.03,.03+fw*5.5,abs(r.y-r.x*r.x*2.)))*step(abs(r.x),.2)*step(.45,h)*smoothstep(.08,.16,c.x);
    col=mix(col,col*.6,nick*clamp(.012/fw,0.,1.)); }
  // the lip: darker, thinner growth creeping outward, then the inked edge
  float lip=smoothstep(.8,.97,e); col=mix(col,deep*.8,lip*.8);
  float fe=max(fwidth(e),1e-4); col=mix(col,inkc,smoothstep(1.-max(.035,fe*2.5),1.-max(.02,fe*1.2),e));
  // spore freckles that glow
  vec2 q=w*1.7, qi=floor(q), o=(h2(qi)-.5)*.6; float h=hash(qi+3.), dd=length(fract(q)-.5-o), r=.05+.07*h;
  float sp=step(.72,h)*(1.-smoothstep(r,r+fw*1.7,dd))*(1.-lip)*clamp(r*3./(fw*1.7),0.,1.);
  col=mix(col,inkc,step(.72,h)*(1.-smoothstep(r+.035,r+.035+fw*1.7,dd))*(1.-lip)*near*.8);
  col=mix(col,vec3(.8,1.,.32),sp);
  return vec4(col,sp);
}
#endif
void main(){
  vec3 n=normalize(vN); vec3 wn=normalize(vWn); if(!gl_FrontFacing){ n=-n; wn=-wn; }
#ifdef GROUND
  vec3 base=uColor*groundAt(vW.xz);
  // Under the grade the ground goes dusty: paler and a third less orange, so the dark things standing on it read against it.
  base=mix(base,vec3(dot(base,vec3(.3,.59,.11)))*vec3(1.12,1.03,.93),.34*uGrit)*mix(vec3(1.),vec3(.97,.95,.95),uGrit);
#elif defined(CLIFF)
  vec3 base=uColor*cliffAt(vW,wn);
  base=mix(base,vec3(dot(base,vec3(.3,.59,.11)))*vec3(1.08,1.,.95),.3*uGrit)*mix(vec3(1.),vec3(.84,.79,.8),uGrit);
#elif defined(BLOOM)
  float be=vUv.x+(vnoise(vW.xz*.5)-.5)*.2+(vnoise(vW.xz*1.6+4.)-.5)*.1+(vnoise(vW.xz*5.+9.)-.5)*.035, bfe=max(fwidth(be),1e-4), ba=clamp((1.-be)/bfe+.5,0.,1.);
  if(ba<=0.) discard;
  vec4 bl=bloomAt(vW.xz,be); vec3 base=uColor*bl.rgb;
#else
  vec3 base=uColor*texture2D(uMap,vUv).rgb;
#endif
#ifdef WEAR
  // A building's own picture of wear lies over its tiled skin: mid grey leaves the skin alone. Whatever glows shows through it.
  { vec3 wr=texture2D(uWear,vUv2).rgb*2.-1.; base*=max(vec3(.3),1.+wr*2.6*(1.-min(1.,uEmis+vEm))); }   // the wear is painted gently and laid on firmly
#endif
#ifdef CLIFF
  // A mesa is one huge slow curve, so a fine wobble on its shadow edge turns into a field of speckle. Break it in big brush shapes instead.
  float nz=(vnoise(vW.xz*.16+vW.y*.21)-.5)*.8+(vnoise(vW.xz*.55+vW.y*.7+3.)-.5)*.3;
#else
  float nz=vnoise(vW.xz*2.3+vW.y*1.9)-.5;
#endif
  float t=dot(n,normalize(vL))+nz*.24; t=mix(t,1.,uFlat*.6);
#ifdef VM
  // The thing in your hands is lit like a hero prop: its own light over your left shoulder, and your own body never shades it.
  float sh=1., ky=max(uKey,.6); t=dot(n,normalize(vec3(-.5,.72,.48)))+nz*.12;
#else
  float ky=uKey;
  float sh=shadowAt(vW+wn*.07);
  // Clouds go over: their shadows slide across the land, soft-edged, and whatever stands under one is in shade until it has passed.
  if(uCloudK>0.&&!isOrthographic){ float cs=vnoise(vW.xz*.016+uCloudO)*.62+vnoise(vW.xz*.041+uCloudO*1.6+5.)*.38; sh*=1.-uCloudK*smoothstep(uCloudTh,uCloudTh+.1,cs); }
#endif
  // ky is how strong the key light is this hour: with none, nothing is lit and nothing is in shadow, and the inker's shading eases off
  float lit=smoothstep(-.03,.03,t)*smoothstep(.3,.7,sh)*ky, hi=smoothstep(.74,.78,t)*sh*ky, dk=mix(.35,1.,ky), deep=(1.-smoothstep(-.6,-.54,t))*dk;
  vec3 shc=base*mix(vec3(.36,.3,.48),vec3(.27,.228,.325),uGrit)+mix(vec3(.02,.01,.055),vec3(.016,.01,.036),uGrit);
  vec3 col=mix(shc,base*vec3(.8,.75,.8),lit);
  col=mix(col,base,smoothstep(.3,.36,t)*lit);
  col=mix(col,min(base*1.2+vec3(.08,.07,.03),vec3(1.)),hi*.75*(1.-uFlat));
  // Inside each flat tone the form still turns a little, the way their painters grade a panel by hand, and hard things take a
  // streak of shine where the sun glances off them.
  { float soft=smoothstep(-.55,.95,t); col*=mix(1.,.66+.46*soft,uGrit*(1.-uFlat));
    float shn=uShine+vSh; vec3 hv=normalize(normalize(vL)+normalize(-vP)); float sp=pow(max(dot(n,hv),0.),mix(6.,70.,shn));
    col+=smoothstep(.3,.62,sp)*lit*shn*uGrit*(1.-uFlat)*(base*.45+vec3(.3,.28,.22)); }
  // A sculpted model says where it tucks in and where it stands proud. Tucks take the dark an inker lays into a fold, down to a
  // near-black line at the bottom of the crease, and proud edges catch a little light.
  col=mix(col,col*vec3(.46,.4,.54)+vec3(.008,.005,.016),smoothstep(.06,.8,vCav)*.82); col=mix(col,vec3(.05,.04,.075),smoothstep(.72,.97,vCav)*.6);
  col=mix(col,min(base*1.22+vec3(.07,.06,.04),vec3(1.)),smoothstep(.2,.85,-vCav)*.4*lit);
  // Shading strokes are drawn on the thing, not on the screen, so they stay put when it or you move. They are laid out in its own
  // space on whichever side faces most squarely, and step down a size with distance so they stay about nine pixels apart.
  vec3 an=abs(vOn); vec2 hc=an.y>an.x&&an.y>an.z?vO.xz:an.x>an.z?vO.zy:vO.xy;
  hc+=(vec2(vnoise(hc*2.1),vnoise(hc*2.1+7.))-.5)*.05;
  float wpp=max(length(fwidth(hc))*.7,1e-5), ls=log2(9.*uPx*wpp), s0=exp2(floor(ls)), fr=fract(ls);
  float q1=(hc.x+hc.y)/s0, q2=(hc.x-hc.y)/s0, i1=floor(q1+.5), i2=floor(q2+.5), aw=fwidth(q1)*.9+.02;
  float k1=i1*s0, k2=i2*s0, u1=(hc.x-hc.y), u2=(hc.x+hc.y);
  float br1=mix(smoothstep(.3,.5,vnoise(vec2(u1/s0*.13,k1*41.7))),smoothstep(.3,.5,vnoise(vec2(u1/s0*.065,k1*41.7))),fr);
  float br2=mix(smoothstep(.36,.56,vnoise(vec2(u2/s0*.13,k2*37.1)+9.)),smoothstep(.36,.56,vnoise(vec2(u2/s0*.065,k2*37.1)+9.)),fr);
  float l1=(1.-smoothstep(.13,.13+aw,abs(q1-i1)))*br1*mix(1.,1.-fr,mod(i1,2.));
  float l2=(1.-smoothstep(.13,.13+aw,abs(q2-i2)))*br2*mix(1.,1.-fr,mod(i2,2.));
  float term=smoothstep(-.42,-.3,t)*(1.-smoothstep(-.05,.03,t))*dk;
  float cst=smoothstep(-.03,.03,t)*(1.-smoothstep(.3,.7,sh))*ky;
  float hatch=term*l1*.62+deep*(l1*.5+l2*.5)+cst*l1*.2;
  col=mix(col,col*.4,clamp(hatch,0.,1.)*uHatch);
  // and where a form turns right away from the sun the inker fills it in: a pool of near black, as comics spot their blacks
  col=mix(col,col*.34+vec3(.012,.008,.03),(1.-smoothstep(-.86,-.78,t))*uHatch*(1.-uFlat)*dk);
  float fres=1.-max(dot(n,normalize(-vP)),0.);
  col=mix(col,min(base*1.22+vec3(.1,.09,.06),vec3(1.)),smoothstep(.7,.78,fres)*lit*.45*(1.-uFlat)*uHatch);
  float rim=pow(1.-max(dot(n,normalize(-vP)),0.),3.)*(1.-lit)*.4; col+=rim*vec3(.45,.6,.95);
  // The hour: whatever the key light reaches takes its colour, and the shade takes the colour of the sky that fills it.
  { float wl=lit/(lit+.3*(1.-lit)); col*=mix(uAmbT,uSunT,wl); }
#if !defined(GROUND)&&!defined(CLIFF)&&!defined(BLOOM)
  // A low sun, or the planet at night, catches the edge of whatever turns toward it: a hard bright line down one side, as a comic backlights a figure.
  { vec3 Lr=normalize(vL); col+=smoothstep(.58,.66,fres)*smoothstep(-.45,.2,dot(n,Lr))*smoothstep(.1,.5,sh)*(1.+1.8*max(0.,dot(normalize(vP),Lr)))*uRimK*uRimC*(base*.5+.32)*(1.-uFlat); }
#endif
  // Lamps, fires and crystals each throw a pool of light with a hard-edged heart, the way a comic paints lamplight.
  { vec3 pl=vec3(0.); for(int i=0;i<8;i++){ if(i>=uPLn) break; vec3 dl=uPLp[i].xyz-vW; float r=uPLp[i].w, dd=dot(dl,dl);
      if(dd<r*r){ float q=1.-sqrt(dd)/r+nz*.05, nl=dot(wn,dl)*inversesqrt(dd+1e-4); pl+=uPLc[i]*(smoothstep(0.,.55,q)*.4+smoothstep(.42,.47,q)*.28+smoothstep(.72,.77,q)*.32)*(smoothstep(-.3,.2,nl)*.82+.18); } }
    // inside a pool the lamp is the light you see by, so the colour of the hour steps back and the lamp's own comes forward
    pl=min(pl,vec3(1.05,.92,.8)); col=col*(1.-.55*clamp(max(pl.r,max(pl.g,pl.b)),0.,1.))+(base*1.12+.03)*pl; }
#ifdef BLOOM
  float em=min(1.,uEmis+vEm+bl.a*.8);
#else
  float em=min(1.,uEmis+vEm);
#endif
  col=mix(col,base*1.08,em);
#ifndef VM
  // The air: far things fade into its colour, which is warmer looking toward the light. Mist lies on the ground and thins with height.
  // The map view looks straight down through all of it from high up, so weather is kept from blotting it out.
  float d=length(vP); vec3 fc=mix(uFog,uFogS,pow(max(dot(vP/d,normalize(vL)),0.),3.));
  float e0=exp(-.16*max(cameraPosition.y,0.)), e1=exp(-.16*max(vW.y,0.)), dy=vW.y-cameraPosition.y, hk=abs(dy)<.05?e0:(e0-e1)/(.16*dy);
  float od=isOrthographic?d*uFogK*min(uFogD,1.3):d*(uFogK*uFogD+uMist*hk*step(1e-6,uFogK));
  col=mix(col,fc,(1.-exp(-od))*.92*(1.-em*.6));
#endif
#ifdef BLOOM
  gl_FragColor=vec4(col,ba);
#else
  // an opaque thing that glows says so in alpha, which nothing else reads; the post pass lets it spill light
  gl_FragColor=vec4(col,uOpacity*(1.-min(em,1.)*.9));
#endif
}`;
const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); WHITE.needsUpdate = true;
// Uniforms shared by every toon material so the shadow map and pixel scale update in one place.
export const SHARED = { uShadow: { value: WHITE as THREE.Texture }, uShadowMat: { value: new THREE.Matrix4() }, uShadowTex: { value: 1 / 2048 }, uPx: { value: 1 }, uL: { value: LIGHT }, uFog: { value: FOG }, uGrit: { value: 1 },
  uCloudK: { value: 0 }, uCloudTh: { value: .55 }, uCloudO: { value: new THREE.Vector2() }, uRimK: { value: 0 }, uRimC: { value: V3(1, 1, 1) }, uFogS: { value: FOGS }, uSunT: { value: V3(1, 1, 1) }, uAmbT: { value: V3(1, 1, 1) }, uKey: { value: 1 }, uFogD: { value: 1 }, uMist: { value: 0 }, uPLp: { value: LAMP_P }, uPLc: { value: LAMP_C }, uPLn: LAMP_N };
if (LAMPS !== 8) throw new Error('the toon shader is written for eight lamps');
export interface ToonOpts { color?: string; emis?: number; hatch?: number; fog?: number; flat?: number; rx?: number; ry?: number; side?: THREE.Side; ground?: boolean; cliff?: boolean; bloom?: boolean; /** 0 is chalk, 1 is polished metal. */ shine?: number }
export function T(map?: THREE.Texture | null, o: ToonOpts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(o.color || '#ffffff') }, uMap: { value: map || WHITE }, uEmis: { value: o.emis || 0 }, uOpacity: { value: 1 }, uHatch: { value: o.hatch === undefined ? 1 : o.hatch }, uFogK: { value: o.fog === undefined ? .0032 : o.fog }, uFlat: { value: o.flat || 0 }, uShine: { value: o.shine === undefined ? .2 : o.shine }, uRep: { value: new THREE.Vector2(o.rx || 1, o.ry || 1) }, ...(o.ground ? { uRoad: { value: new THREE.Vector4() }, uRoadW: { value: 0 } } : {}), ...SHARED },
    vertexShader: TOON_VS, fragmentShader: TOON_FS, side: o.side || THREE.FrontSide, defines: o.ground ? { GROUND: 1 } : o.cliff ? { CLIFF: 1 } : o.bloom ? { BLOOM: 1 } : {},
  });
}
/** A copy of a toon material for things held in the hand: see VM in the shader. Copies are kept, one per material. */
const HELD = new Map<THREE.Material, THREE.ShaderMaterial>();
export function heldMaterial(m: THREE.Material) {
  const src = m as THREE.ShaderMaterial; if (!src.isShaderMaterial || !src.uniforms || !src.uniforms.uShadow) return m;
  let c = HELD.get(m); if (!c) { c = src.clone(); c.defines = { ...src.defines, VM: 1 }; for (const k of Object.keys(SHARED)) (c.uniforms as any)[k] = (SHARED as any)[k]; c.uniforms.uMap.value = src.uniforms.uMap.value; HELD.set(m, c); }
  return c;
}
export const M: Record<string, THREE.ShaderMaterial> = {};
/** Other modules add their materials here; they are built together with the rest. */
export const EXTRA: (() => void)[] = [];
export { T as toonMaterial };
function makeMaterials() {
  Object.assign(M, {
    steel: T(TX.steel), steelD: T(TX.steelD), yellow: T(TX.yellow), yellowP: T(TX.yellowP), hazard: T(TX.hazard, { rx: 3 }), hazard1: T(TX.hazard),
    rubber: T(TX.rubber), cloth: T(TX.cloth), vest: T(TX.vest), gun: T(TX.gun), helmet: T(TX.helmet), hardhat: T(TX.hardhat), skin: T(TX.skin),
    corr: T(TX.corr, { rx: 2 }), rust: T(TX.rust), tealC: T(TX.tealC), door: T(TX.door), concrete: T(TX.concrete, { rx: 2, ry: 2 }),
    rock: T(TX.rock), mesa: T(null, { cliff: true }), ground: T(null, { hatch: .55, flat: 1, ground: true }), ore: T(TX.ore, { emis: .35 }), oreDead: T(TX.rock, { color: '#b9b0a8' }),
    indigo: T(TX.indigo), indigoL: T(TX.indigo, { color: '#c9c2ff' }), indigoD: T(TX.indigoD), smoke: T(TX.smoke, { hatch: .5 }), soot: T(TX.smoke, { color: '#6d5f68' }), dust: T(TX.smoke, { hatch: .3, color: '#f0b98a' }),
    visor: T(null, { color: '#ffe27a', emis: 1 }), cyan: T(null, { color: '#8ff2ff', emis: 1 }), teal: T(null, { color: '#35e0c8', emis: .9 }), mag: T(null, { color: '#ff4f9a', emis: .9 }), red: T(null, { color: '#ff4b3a', emis: 1 }),
    planet: T(TX.planet, { fog: 0, hatch: .4 }), ring: T(null, { color: '#f4d9ae', emis: .3, fog: 0, side: THREE.DoubleSide }),
    orange: T(TX.yellowP, { color: '#ff9a5c' }), helmetB: T(TX.helmet, { color: '#ffb08a' }), gold: T(TX.yellowP, { color: '#ffe2a0', emis: .35 }), crys: T(TX.ore, { color: '#8ff7ff', emis: .5 }),
    scorch: T(null, { color: '#2a1a1c', hatch: 0, flat: 1 }), bolt: T(null, { color: '#9dfcff', emis: 1 }), fire: T(null, { color: '#ffc04a', emis: .62, hatch: 0 }), fireD: T(null, { color: '#ff7a2a', emis: .7, hatch: 0 }), spark: T(null, { color: '#fff1a0', emis: 1 }),
    sign: T(TX.sign), violet: T(null, { color: '#b58cff', emis: .9 }), flash: T(null, { color: '#fff6c0', emis: 1, side: THREE.DoubleSide }),
  });
  for (const f of EXTRA) f();
  M.scorch.polygonOffset = true; M.scorch.polygonOffsetFactor = -3; M.scorch.polygonOffsetUnits = -3;
}
export const holoOK = new THREE.MeshBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide });
export const holoBad = new THREE.MeshBasicMaterial({ color: 0xff4b3a, transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide });
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
/** A flat shape from a ring of radii, like CircleGeometry but with a drawn edge. Uses its own random numbers so the map layout is not disturbed. */
function ragged(n: number, rad: (i: number, r: () => number) => number) {
  let q = 4242 + n; const r = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
  const pos: number[] = [0, 0, 0], uv: number[] = [.5, .5], idx: number[] = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, d = rad(i, r); pos.push(Math.cos(a) * d, Math.sin(a) * d, 0); uv.push(.5 + Math.cos(a) * d, .5 + Math.sin(a) * d); idx.push(0, i + 1, (i + 1) % n + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** An ink blot for scorch marks, and a comic starburst for the flash of a blast. */
/** A lumpy cloud for smoke, dust and fire: a ball pushed out into a dozen knuckles, so the ink line draws round each one like a comic puff. */
function cloud() {
  const g = new THREE.IcosahedronGeometry(.5, 4), a = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(); let seed = 23; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lobes: THREE.Vector3[] = []; for (let i = 0; i < 13; i++) { const y = 1 - (i + .5) / 13 * 2, q = Math.sqrt(1 - y * y), t = i * 2.39996 + r() * .5; lobes.push(new THREE.Vector3(Math.cos(t) * q, y, Math.sin(t) * q)); }
  const size = lobes.map(() => .75 + r() * .5);
  for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).normalize(); let m = 0; for (let k = 0; k < lobes.length; k++) { const d = v.dot(lobes[k]), c = Math.cos(.62 * size[k]); if (d > c) m = Math.max(m, Math.sqrt(1 - ((1 - d) / (1 - c)) ** 2) * size[k]); } v.multiplyScalar(.3 + .2 * m); a.setXYZ(i, v.x, v.y, v.z); }
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); const out = mergeVertices(g, 1e-4); out.computeVertexNormals();
  const q = out.attributes.position as THREE.BufferAttribute, uv = new Float32Array(q.count * 2); for (let i = 0; i < q.count; i++) { v.fromBufferAttribute(q, i).normalize(); uv[i * 2] = .5 + Math.atan2(v.z, v.x) / 6.2832; uv[i * 2 + 1] = .5 + v.y * .5; } out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return out;
}
G.cloud = cloud();
G.blot = ragged(36, (i, r) => i % 3 === 0 ? .36 + r() * .14 : .27 + r() * .1);
G.burst = ragged(26, (i, r) => i % 2 ? .19 + r() * .07 : .36 + r() * .14);
type P3 = [number, number, number];
export function mk(geo: THREE.BufferGeometry, mat: THREE.Material, p: P3 | 0, s: P3 | 0, r: P3 | 0, parent: THREE.Object3D) {
  const m = new THREE.Mesh(geo, mat); if (p) m.position.set(p[0], p[1], p[2]); if (s) m.scale.set(s[0], s[1], s[2]); if (r) m.rotation.set(r[0], r[1], r[2]); parent.add(m); return m;
}
const UP = V3(0, 1, 0);
export function beam(a: P3, b: P3, r: number, mat: THREE.Material, parent: THREE.Object3D) {
  const A = V3(...a), B = V3(...b), d = B.clone().sub(A); const m = new THREE.Mesh(r >= .1 ? G.cyl : G.cyl8, mat); m.scale.set(r * 2, d.length(), r * 2); m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); parent.add(m); return m;
}
export function setLayer(o: THREE.Object3D, layer: number) { o.traverse(x => x.layers.set(layer)); return o; }

// ---------------------------------------------------------------- sky
// Dust in the air: specks that drift on the wind in a box that follows the camera. Where the sun reaches them they catch it, and in the
// shadow of a building they go dull, so a shaft of light between two sheds shows as a shaft. Count, speed and colour come from the hour.
const MOTEU = { uCam: { value: V3() }, uDrift: { value: V3() }, uPxH: { value: 600 }, uCol: { value: V3(1, 1, 1) }, uAmt: { value: 0 }, uKey: { value: 1 } };
const MOTE_N = 1400; let moteGeo: THREE.BufferGeometry | null = null, moteMat: THREE.ShaderMaterial | null = null;
function makeMotes() {
  if (!moteGeo) { let sd = 5; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647, p = new Float32Array(MOTE_N * 3), a = new Float32Array(MOTE_N); for (let i = 0; i < MOTE_N; i++) { p[i * 3] = r(); p[i * 3 + 1] = r(); p[i * 3 + 2] = r(); a[i] = r(); }
    moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(p, 3)); moteGeo.setAttribute('aR', new THREE.BufferAttribute(a, 1)); }
  if (!moteMat) moteMat = new THREE.ShaderMaterial({ uniforms: { ...MOTEU, uShadow: SHARED.uShadow, uShadowMat: SHARED.uShadowMat }, transparent: true, depthWrite: false,
    // the picture's fourth channel says what glows: a speck takes a little off it, so it glows a little, as dust in a sunbeam and a firefly both do
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `uniform vec3 uCam,uDrift; uniform float uPxH; uniform mat4 uShadowMat; uniform sampler2D uShadow; attribute float aR; varying float vA,vLit; const vec3 B=vec3(26.,10.,26.);
    void main(){ vec3 q=position*B+uDrift*(.6+.8*aR); vec3 w=vec3(mod(q.x-uCam.x,B.x)-B.x*.5,mod(q.y,B.y),mod(q.z-uCam.z,B.z)-B.z*.5), wp=vec3(uCam.x+w.x,w.y+.15,uCam.z+w.z);
      vec4 mv=viewMatrix*vec4(wp,1.); gl_Position=projectionMatrix*mv; float dist=-mv.z; gl_PointSize=clamp(.06*(.5+aR)*uPxH/max(dist,.3),2.,uPxH*.017);
      vA=smoothstep(.6,3.,dist)*(1.-smoothstep(9.,13.,length(w.xz)))*(.4+.6*aR);
      vec4 sc=uShadowMat*vec4(wp,1.); vec3 p=sc.xyz/sc.w*.5+.5; vLit=(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.)?1.:step(p.z-.002,texture2D(uShadow,p.xy).x); }`,
    fragmentShader: `precision highp float; uniform vec3 uCol; uniform float uAmt,uKey; varying float vA,vLit;
    void main(){ float a=(1.-smoothstep(.2,.5,length(gl_PointCoord-.5)))*vA*uAmt*mix(.28,1.,mix(1.,vLit,uKey)); if(a<.004) discard; gl_FragColor=vec4(uCol,a); }` });
  const pts = new THREE.Points(moteGeo, moteMat); pts.frustumCulled = false; pts.renderOrder = 5; setLayer(pts, L_FX); return pts;
}
/** The cone of lit air under a floodlight. It is brightest near the lamp and along the middle, and fades out at its edges and toward the ground. */
export const CONEU = { uK: { value: 0 }, uCol: { value: V3(1, .76, .42) } };
let coneMat: THREE.ShaderMaterial | null = null, coneGeo: THREE.BufferGeometry | null = null;
export function makeCone() {
  if (!coneGeo) { coneGeo = new THREE.ConeGeometry(5.2, 6.4, 24, 1, true); coneGeo.translate(0, -3.2, 0); }
  if (!coneMat) coneMat = new THREE.ShaderMaterial({ uniforms: CONEU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN,vP; varying float vY; void main(){ vY=uv.y; vN=normalMatrix*normal; vec4 mv=modelViewMatrix*vec4(position,1.); vP=mv.xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `precision highp float; uniform float uK; uniform vec3 uCol; varying vec3 vN,vP; varying float vY;
    void main(){ float f=abs(dot(normalize(vN),normalize(-vP))); float a=uK*pow(f,1.4)*(.16+.84*vY*vY*(.4+.6*vY))*smoothstep(0.,.2,vY); if(a<.004) discard; gl_FragColor=vec4(uCol,a); }` });
  const m = new THREE.Mesh(coneGeo, coneMat); m.frustumCulled = true; m.renderOrder = 4; setLayer(m, L_FX); return m;
}
/** What the sky reads each frame. The far air is shared with everything else, so the land fades into the sky's own horizon. */
const SKYU = { uSunD: { value: SUNDIR }, uKeyD: { value: KEYDIR }, uTop: { value: V3() }, uMid: { value: V3() }, uCloud: { value: V3(1, 1, 1) }, uDisc: { value: V3(1, 1, 1) }, uStars: { value: 0 }, uCover: { value: .5 }, uTime: { value: 0 } };
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: SHARED.uPx, uFog: SHARED.uFog, uFogS: SHARED.uFogS, ...SKYU }, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `precision highp float; varying vec3 vD; uniform vec3 uSunD,uKeyD,uTop,uMid,uFog,uFogS,uCloud,uDisc; uniform float uPx,uStars,uCover,uTime; ${NOISE}
    void main(){ vec3 d=normalize(vD); float h=d.y;
      float t=h+(vnoise(d.xz*5.+d.y*3.)-.5)*.05; t=floor(t*14.)/14.;
      float sd=dot(d,normalize(uSunD)), kd=pow(max(dot(d,normalize(uKeyD)),0.),3.);
      // the horizon is the colour the land fades into, so the two meet without a seam
      vec3 hor=mix(uFog,uFogS,kd);
      vec3 col=t<.14?mix(hor,uMid,clamp(t/.14,0.,1.)):mix(uMid,uTop,clamp((t-.14)/.55,0.,1.));
      // the sky lights up round the sun in a few flat steps
      float up=smoothstep(-.12,.02,uSunD.y), hl=floor(pow(max(sd,0.),14.)*4.+.5)/4.; col=mix(col,mix(uDisc,hor,.35),hl*.4*up);
      vec2 p=vec2(d.x*4.+d.z*2.7+uTime*.006,h*24.); float c=vnoise(p)*.65+vnoise(p*2.3+7.)*.35, th=.56-(uCover-.5)*.34;
      float band=smoothstep(.03,.1,h)*(1.-smoothstep(.34+max(uCover-.5,0.)*.7,.5+max(uCover-.5,0.)*.9,h));
      vec3 cl=mix(uCloud,uDisc,kd*.35*up);
      col=mix(col,cl*.9,smoothstep(th,th+.02,c)*band*.85); col=mix(col,cl,smoothstep(th+.06,th+.08,c)*band);
      float disc=smoothstep(.9965,.9972,sd), halo=smoothstep(.985,.9855,sd);
      col=mix(col,uDisc,halo*.35); col=mix(col,min(uDisc*1.08,vec3(1.)),disc);
      vec2 q=gl_FragCoord.xy/uPx/8.; q.x+=mod(floor(q.y),2.)*.5; float dt=length(fract(q)-.5);
      col=mix(col,col*.84,step(dt,.36*(1.-clamp(h*3.2,0.,1.))));
      vec2 sv=vec2(atan(d.z,d.x)*150.,h*240.), sg=floor(sv); float st=hash(sg), sr=length(fract(sv)-.5);
      col=mix(col,vec3(1.,.95,.85),step(.988,st)*(1.-smoothstep(.1+.25*fract(st*77.),.16+.3*fract(st*77.),sr))*uStars*smoothstep(.06,.3,h)*(.6+.4*sin(uTime*(1.5+st*40.)+st*90.))*(1.-smoothstep(th,th+.02,c)*band));
      if(h<0.) col=hor;
      // the disc and the ring of sky round it glow
      gl_FragColor=vec4(col,1.-(disc*.8+halo*.25)*step(0.,h)); }`,
  });
  const g = new THREE.Group();
  setLayer(mk(new THREE.SphereGeometry(2600, 32, 20), mat, 0, 0, 0, g), L_FX); g.add(makeMotes());
  const pd = V3(.5, .3, -1).normalize().multiplyScalar(1500);
  mk(G.sph, M.planet, [pd.x, pd.y, pd.z], [470, 470, 470], [.3, 0, .35], g);
  mk(new THREE.RingGeometry(300, 430, 48), M.ring, [pd.x, pd.y, pd.z], 0, [Math.PI / 2 - .32, .35, 0], g);
  const md = V3(1, .2, .12).normalize().multiplyScalar(1500);
  mk(G.sph, M.planet, [md.x, md.y, md.z], [150, 150, 150], [1, 0, .2], g);
  return g;
}

// ---------------------------------------------------------------- pipeline
const POST_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tC,tD,tN; uniform vec2 uRes; uniform sampler2D tB; uniform vec2 uSun; uniform float uNear,uFar,uOrtho,uPx,uSat,uStatic,uTime,uFlash,uBold,uProj,uAO,uGrit,uGlow,uShaft; uniform sampler2D tB2,tB3,tS; uniform vec3 uTint,uLift,uShaftC; uniform float uVig,uPunch,uFlare,uAsp; uniform vec2 uSunUV; ${NOISE}
float lin(vec2 uv){ float d=texture2D(tD,uv).x; if(uOrtho>.5) return uNear+d*(uFar-uNear); float z=d*2.-1.; return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear)); }
vec3 nrm(vec2 uv){ return texture2D(tN,uv).xyz*2.-1.; }
float edgeAt(vec2 u, vec2 sp){
  float d0=lin(u);
  // Ink is drawn as if on the object, not on the screen: it narrows as the thing gets further away,
  // so a distant Rigger gets a fine line rather than one as thick as a close one's.
  // Two pens, as a comic inker uses: a heavy one round the outside of a thing, a fine one for the folds and seams inside it.
  float th=uOrtho>.5?.9:clamp(1.15/(1.+d0/16.),.28,1.15), tk=uOrtho>.5?1.:1.+uBold*clamp(1./(1.+d0/9.),0.,1.);
  float wv=(.8+.4*vnoise(sp/46.))*uPx; th*=wv;
  vec2 px=th*tk/uRes, pw=px*1.4, pn=th/uRes*.62;
  float dA=lin(u+px),dB=lin(u-px),dC=lin(u+px*vec2(-1.,1.)),dD=lin(u+px*vec2(1.,-1.));
  vec3 n0=nrm(u),nA=nrm(u+pn),nB=nrm(u-pn),nC=nrm(u+pn*vec2(-1.,1.)),nD=nrm(u+pn*vec2(1.,-1.));
  float de;
  if(uOrtho>.5){ de=smoothstep(.5,1.,(abs(dA-dB)+abs(dC-dD))); }
  else {
    float dmin=min(min(dA,dB),min(dC,dD)); float dd=(abs(dA-dB)+abs(dC-dD))/max(dmin,.01); de=smoothstep(.05,.09,dd*clamp(abs(n0.z),.08,1.));
    float eA=lin(u+pw),eB=lin(u-pw),eC=lin(u+pw*vec2(-1.,1.)),eD=lin(u+pw*vec2(1.,-1.)); float emin=min(min(eA,eB),min(eC,eD));
    de=max(de,smoothstep(.5,.8,(abs(eA-eB)+abs(eC-eD))/max(emin,.01))*(1.-smoothstep(30.,70.,emin)));
  }
  float nd=length(nA-nB)+length(nC-nD); float ne=smoothstep(.7,1.05,nd)*(1.-smoothstep(90.,220.,d0));
  // and it fades with distance, measured to the nearer side of the edge
  float near=uOrtho>.5?0.:min(d0,min(min(dA,dB),min(dC,dD)));
  return max(de,ne)*mix(1.,.4,smoothstep(12.,110.,near));
}
// Contact shading: where a thing meets the ground or tucks into a corner the page goes darker, which is what sits it in the world.
// Each sample is a point of the scene near this one; it shades this one only if it is close by and stands above this surface.
vec3 vpos(vec2 u){ float d=lin(u); return vec3((u*2.-1.)*vec2(uRes.x/uRes.y,1.)/uProj*d,-d); }
float hollow(vec2 u, float d0){
  vec3 p=vpos(u), n=normalize(nrm(u)); float R=.8, o=0.;
  vec2 r=vec2(uRes.y/uRes.x,1.)*min(R*uProj*.5/d0,.12);
  float jr=fract(52.9829189*fract(dot(floor(u*uRes),vec2(.06711056,.00583715))))*6.283;
  for(int k=0;k<14;k++){ float f=(float(k)+.5)/14., an=float(k)*2.399+jr; vec2 q=u+vec2(cos(an),sin(an))*r*sqrt(f);
    vec3 v=vpos(q)-p; float l=length(v)+1e-4; o+=max(0.,dot(n,v)/l-.15)*(1.-smoothstep(R*.6,R*1.3,l)); }
  return smoothstep(.14,.75,o/14.*3.6)*(1.-smoothstep(60.,140.,d0));
}
void main(){
  vec2 sp=vUv*uRes/uPx;
  vec2 wobv=(vec2(vnoise(sp/30.),vnoise(sp/30.+31.))-.5)*2.6*uPx/uRes;
  vec2 u=vUv+wobv; vec2 h=.3/uRes;
  // Four looks a third of a pixel apart smooth the line. Most of the page has no line near it, and there two looks are enough to know.
  float eA=edgeAt(u+h,sp), eB=edgeAt(u-h,sp), edge=(eA+eB)*.5;
  if(eA+eB>0.) edge=(eA+eB+edgeAt(u+h*vec2(1.,-1.),sp)+edgeAt(u+h*vec2(-1.,1.),sp))*.25;
  vec3 col=texture2D(tC,vUv).rgb;
  if(uOrtho<.5&&uAO>0.){ float d0=lin(vUv); if(d0<140.){ float oc=hollow(vUv,d0)*uAO; col*=mix(vec3(1.),vec3(.42,.36,.56),oc); } }
  // Worn edges: a light line just inside the ink on the side that faces the sun, along an outside edge or a ridge.
  if(uOrtho<.5&&uGrit>0.){ float d0=lin(vUv); if(d0<60.){
    vec2 o=uSun*2.5*uPx/uRes*clamp(1.5/(1.+d0/14.),.45,1.4); vec3 n0=nrm(vUv), n1=nrm(vUv+o); float d1=lin(vUv+o), d2=lin(vUv-o);
    float same=1.-smoothstep(.03,.08,abs(d2-d0)/d0), rimE=smoothstep(.06,.14,(d1-d0)/d0);
    float ridge=smoothstep(.45,.8,length(n1-n0))*(1.-smoothstep(.02,.06,abs(d1-d0)/d0))*smoothstep(0.,.004,((d1+d2)*.5-d0)/d0);
    float wear=max(rimE,ridge)*same*(1.-min(1.,edge*1.4))*(1.-smoothstep(25.,60.,d0))*(.6+.4*vnoise(sp/7.));
    col=mix(col,min(col*1.5+vec3(.1,.09,.06),vec3(1.)),wear*.5*uGrit); } }
  col=mix(col,vec3(.05,.045,.075),min(1.,edge*.95));
  // Lights spill: lamps, visors, fire and crystals glow into the air round them, tightly and then in a wide soft halo.
  if(uGlow>0.){ vec3 gl=(texture2D(tB,vUv).rgb*1.15+texture2D(tB2,vUv).rgb*1.25+texture2D(tB3,vUv).rgb*1.25)*uGlow;
    // the glow goes into the air round a bright thing far more than on top of it, so the thing itself keeps its colour and does not burn out to white
    col+=gl*(1.-col*.5)*(1.-.8*smoothstep(.3,.85,dot(col,vec3(.3,.59,.11)))); }
  // Shafts: where the sun comes past the edge of a thing, the dust in the air shows the light as rays.
  if(uShaft>0.){ float sf=texture2D(tS,vUv).r; col=1.-(1.-col)*(1.-uShaftC*min(sf*uShaft*.7,.86)); }
  // Looking into the sun: a glare round it, a long streak across the lens, and two faint rings thrown the other side of the middle.
  if(uFlare>0.){ vec2 fa=vec2(uAsp,1.), fd=(vUv-uSunUV)*fa; float fr=length(fd);
    float fl=exp(-fr*fr*16.)*.34+exp(-abs(fd.y)*70.)*exp(-abs(fd.x)*1.9)*.55+exp(-abs(fd.y)*300.)*exp(-abs(fd.x)*.9)*.35;
    vec2 gc=vec2(.5)+(vec2(.5)-uSunUV)*.42, gd=vec2(.5)+(vec2(.5)-uSunUV)*1.05; float g1=length((vUv-gc)*fa), g2=length((vUv-gd)*fa);
    fl+=smoothstep(.062,.055,g1)*(.05+.07*smoothstep(.03,.058,g1))+smoothstep(.13,.12,g2)*(.025+.05*smoothstep(.08,.125,g2));
    float fv=(texture2D(tS,uSunUV).r+texture2D(tS,uSunUV+vec2(.016,0.)).r+texture2D(tS,uSunUV-vec2(.016,0.)).r+texture2D(tS,uSunUV+vec2(0.,.028)).r+texture2D(tS,uSunUV-vec2(0.,.028)).r)*.2;
    col=1.-(1.-col)*(1.-uShaftC*min(fl*uFlare*fv,.9)); }
  col=col*uTint+uLift;
  // the corners fall off a little, which pulls the eye in and deepens the mood of the hour
  if(uOrtho<.5){ vec2 vq=vUv-.5; col*=1.-uVig*smoothstep(.25,.95,dot(vq,vq)*2.2); }
  // The sky steps back: paler and less teal under the grade, so it is a backdrop and not the loudest thing in the frame.
  if(uOrtho<.5&&uGrit>0.&&lin(vUv)>900.){ float sl=dot(col,vec3(.3,.59,.11)); col=mix(col,mix(vec3(sl),col,.6)*vec3(1.,.99,1.02)+vec3(.04,.035,.045),uGrit); }
  col=mix(vec3(dot(col,vec3(.3,.59,.11))),col,1.18*uSat);
  // The grade: a firmer curve so darks go properly dark, colour held back a little, cool shadows under warm lights.
  { vec3 g=clamp(col,0.,1.); float l=dot(g,vec3(.3,.59,.11)); g=mix(g,g*g*(3.-2.*g),min(1.,.75+.13*uPunch)); { float gl2=dot(g,vec3(.3,.59,.11)), sa=max(g.r,max(g.g,g.b))-min(g.r,min(g.g,g.b)); g=mix(vec3(gl2),g,.9+uPunch*(.34-.2*sa)); }
    g*=mix(vec3(.9,.93,1.08),vec3(1.05,1.,.93),smoothstep(.08,.6,l)); col=mix(col,g,uGrit); }
  col*=.95+.08*vnoise(sp*.5);
  float v=smoothstep(1.3,.5,length((vUv-.5)*vec2(1.25,1.))); col*=mix(mix(.8,.68,uGrit),1.,v);
  col=mix(col,vec3(1.,.97,.86),uFlash);
  if(uStatic>0.){ float s=hash(floor(sp/3.)+uTime*60.); float bar=step(.92,fract(vUv.y*6.+uTime*3.)); col=mix(col,vec3(s)*.9+bar*.1,uStatic); }
  gl_FragColor=vec4(col,1.);
}`;

// Glow: the bright pass keeps what a material marked as glowing (alpha below one) and anything white-hot, at a quarter size; two blurs spread it.
const GLOW_PICK = `precision highp float; varying vec2 vUv; uniform sampler2D tC; uniform vec2 uT; uniform float uHot;
void main(){ vec3 a=vec3(0.); for(int i=0;i<4;i++){ vec2 o=vec2(i==0||i==2?-1.:1.,i<2?-1.:1.)*uT; vec4 c=texture2D(tC,vUv+o); float k=max(1.-c.a,max(smoothstep(.9,1.,min(c.r,min(c.g,c.b)))*.3,smoothstep(.6,1.,dot(c.rgb,vec3(.3,.59,.11)))*uHot*.42)); a+=c.rgb*k; } gl_FragColor=vec4(a*.25,1.); }`;
const GLOW_BLUR = `precision highp float; varying vec2 vUv; uniform sampler2D tC; uniform vec2 uT;
void main(){ vec3 a=texture2D(tC,vUv).rgb*.2; a+=(texture2D(tC,vUv+uT*1.45).rgb+texture2D(tC,vUv-uT*1.45).rgb)*.17; a+=(texture2D(tC,vUv+uT*3.4).rgb+texture2D(tC,vUv-uT*3.4).rgb)*.125; a+=(texture2D(tC,vUv+uT*5.35).rgb+texture2D(tC,vUv-uT*5.35).rgb)*.07; a+=(texture2D(tC,vUv+uT*7.3).rgb+texture2D(tC,vUv-uT*7.3).rgb)*.035; gl_FragColor=vec4(a,1.); }`;
// Sun shafts. First, at a quarter size, what lets the sun's light through: the sky and the far haze do, anything near blocks it.
const SHAFT_PICK = `precision highp float; varying vec2 vUv; uniform sampler2D tD; uniform vec2 uSunUV; uniform float uNear,uFar,uAsp;
void main(){ float z=texture2D(tD,vUv).x*2.-1., l=2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear)); float a=smoothstep(90.,700.,l)*(1.-smoothstep(0.,1.25,length((vUv-uSunUV)*vec2(uAsp,1.)))); gl_FragColor=vec4(vec3(a*a*a),1.); }`;
// Then that is smeared away from the sun, twice: a long smear and a short one to take the steps out of it.
// A step that lands off the edge of the picture is taken as open sky, or the edge would smear into rays of its own.
const SHAFT_BLUR = `precision highp float; varying vec2 vUv; uniform sampler2D tC; uniform vec2 uSunUV; uniform float uLen,uAsp,uOpen;
void main(){ vec2 st=(uSunUV-vUv)*uLen/12., p=vUv+st*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))); float a=0., w=1., ws=0.;
  for(int i=0;i<12;i++){ float v; if(uOpen>.5&&(p.x<0.||p.x>1.||p.y<0.||p.y>1.)){ v=1.-smoothstep(0.,1.25,length((p-uSunUV)*vec2(uAsp,1.))); v=v*v*v; } else v=texture2D(tC,p).r; a+=v*w; ws+=w; w*=.92; p+=st; } gl_FragColor=vec4(vec3(a/ws),1.); }`;
const SUNV = new THREE.Vector3();
export class Pipeline {
  renderer: THREE.WebGLRenderer;
  w = 1; h = 1; px = 1;
  private rtC: THREE.WebGLRenderTarget; private rtN: THREE.WebGLRenderTarget; private rtS: THREE.WebGLRenderTarget;
  private normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  private depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  private rtG: THREE.WebGLRenderTarget[] = []; private rtW: THREE.WebGLRenderTarget[] = []; private rtX: THREE.WebGLRenderTarget[] = []; private rtR: THREE.WebGLRenderTarget[] = []; private glowMat: THREE.ShaderMaterial; private blurMat: THREE.ShaderMaterial; private pickMat: THREE.ShaderMaterial; private rayMat: THREE.ShaderMaterial; private fsq: THREE.Mesh;
  private postMat: THREE.ShaderMaterial; private postScene = new THREE.Scene(); private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private sun = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 500);
  sat = 1; static = 0; time = 0; flash = 0; private aaNow = -1;
  /** Redraw the shadow map every Nth frame. Low picture quality uses 3. */
  shadowEvery = 1; private frameN = 0;
  /** Samples per pixel when drawing the colour picture, so slanted edges come out clean rather than stepped. 0 turns it off. */
  aa = 4;
  /** How much heavier the outside line of a thing is than the lines inside it, close up. 0 is one pen for everything. */
  bold = .5;
  /** The moody grade: soft shading and shine, deeper darks, held-back colour, worn edges. 0 is the bright flat comic look. */
  grit = 1;
  /** How far lights spill into the air round them. 0 turns the glow off (Low picture quality does). */
  glow = 1;
  /** Strength of the contact shading under and between things. Low picture quality turns it off. */
  ao = 1;
  /** Sun shafts through the air, and the dust that drifts in it. Low picture quality turns them off. */
  shafts = 1; private gust = V3(); private lastT = 0;
  /** Size of the canvas itself. It is larger than `w` by `h` only when the screen is split into views. */
  cw = 1; ch = 1;
  /** Where on the canvas the finished picture goes, in canvas pixels from the bottom left. Null fills the canvas. */
  rect: [number, number, number, number] | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);
    makeTextures(); makeMaterials();
    // What is hard and polished takes a sharp streak of shine; painted plate and leather a duller one; cloth, rock and skin stay matt.
    for (const k in M) { const u = (M[k] as THREE.ShaderMaterial).uniforms; if (!u || !u.uShine) continue; u.uShine.value = /^(gun|steel|tank|drill|lens|vis|bS|bD|pS|nS|nD|helm|hard|chest|shield|rib$)/.test(k) ? .62 : /^(lea|glove|sole|[pbcn][A-Z]$|haz|wall|door)/.test(k) ? .36 : /^(fab|straw|post|sign|wood|rock|mesa|ground|skin|stache|vest|conc|dust|soot|g[A-Z])/.test(k) ? .08 : u.uShine.value; }
    const S = 2048;
    this.rtS = new THREE.WebGLRenderTarget(S, S, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtS.depthTexture = new THREE.DepthTexture(S, S); this.rtS.depthTexture.type = THREE.UnsignedIntType;
    this.rtS.depthTexture.minFilter = this.rtS.depthTexture.magFilter = THREE.NearestFilter;
    SHARED.uShadow.value = this.rtS.depthTexture; SHARED.uShadowTex.value = 1 / S;
    this.rtC = new THREE.WebGLRenderTarget(4, 4); this.rtN = new THREE.WebGLRenderTarget(4, 4);
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tC: { value: null }, tD: { value: null }, tN: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: .06 }, uFar: { value: 4000 }, uOrtho: { value: 0 }, uPx: SHARED.uPx, uSat: { value: 1 }, uFlash: { value: 0 }, uStatic: { value: 0 }, uTime: { value: 0 }, uBold: { value: 1 }, uProj: { value: 1 }, uAO: { value: 1 }, uGrit: SHARED.uGrit, uGlow: { value: 1 }, tB3: { value: null }, uPunch: { value: 1 }, uFlare: { value: 0 }, uAsp: { value: 1 }, uSunUV: { value: new THREE.Vector2(.5, .5) }, uSun: { value: new THREE.Vector2(-.6, .8) }, tB: { value: null }, tB2: { value: null }, tS: { value: null }, uShaft: { value: 0 }, uVig: { value: .2 }, uShaftC: { value: V3(1, 1, 1) }, uTint: { value: V3(1, 1, 1) }, uLift: { value: V3() } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    });
    this.postScene.add(this.fsq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
    const quad = (fs: string) => new THREE.ShaderMaterial({ uniforms: { tC: { value: null }, uT: { value: new THREE.Vector2() }, uHot: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`, fragmentShader: fs, depthTest: false, depthWrite: false });
    this.glowMat = quad(GLOW_PICK); this.blurMat = quad(GLOW_BLUR);
    this.pickMat = quad(SHAFT_PICK); Object.assign(this.pickMat.uniforms, { tD: { value: null }, uSunUV: { value: new THREE.Vector2() }, uNear: { value: .06 }, uFar: { value: 4000 }, uAsp: { value: 1 } });
    this.rayMat = quad(SHAFT_BLUR); Object.assign(this.rayMat.uniforms, { uSunUV: this.pickMat.uniforms.uSunUV, uLen: { value: 1 }, uAsp: this.pickMat.uniforms.uAsp, uOpen: { value: 1 } });
    setLight(12); this.light();
  }

  /** `w` by `h` is the size of one view. `cw` by `ch` is the whole canvas, when that is bigger because the screen is split. */
  resize(w: number, h: number, cw = w, ch = h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h)); cw = Math.max(2, Math.floor(cw)); ch = Math.max(2, Math.floor(ch));
    if (cw !== this.cw || ch !== this.ch) { this.cw = cw; this.ch = ch; this.renderer.setSize(cw, ch, false); }
    if (w === this.w && h === this.h && this.aa === this.aaNow) return;
    this.w = w; this.h = h; this.aaNow = this.aa; this.px = h / 900; SHARED.uPx.value = this.px;
    this.rtC.dispose(); this.rtN.dispose();
    this.rtC = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples: this.aa });
    this.rtC.depthTexture = new THREE.DepthTexture(w, h); this.rtC.depthTexture.type = THREE.UnsignedIntType;
    this.rtN = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    for (const t of this.rtG) t.dispose(); const gw = Math.max(2, w >> 2), gh = Math.max(2, h >> 2);
    this.rtG = [0, 1].map(() => new THREE.WebGLRenderTarget(gw, gh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }));
    for (const t of this.rtW) t.dispose(); for (const t of this.rtX) t.dispose(); for (const t of this.rtR) t.dispose(); const small = (x: number, y: number) => new THREE.WebGLRenderTarget(Math.max(2, x), Math.max(2, y), { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.rtW = [0, 1].map(() => small(w >> 3, h >> 3)); this.rtX = [0, 1].map(() => small(w >> 4, h >> 4)); this.rtR = [0, 1].map(() => small(w >> 2, h >> 2));
    const u = this.postMat.uniforms; u.tC.value = this.rtC.texture; u.tD.value = this.rtC.depthTexture; u.tN.value = this.rtN.texture; u.uRes.value.set(w, h); u.tB.value = this.rtG[0].texture; u.tB2.value = this.rtW[0].texture; u.tB3.value = this.rtX[0].texture; u.tS.value = this.rtR[0].texture;
  }

  /** How bright a lightning flash is this frame, 0 to 1. */ flashK = 0;
  /** Sets the light by the old dial: 0 is midday, about .7 sunset, 1 night. */
  setDusk(k: number) { this.setSky(hourOf(k)); }
  /** Sets the light for an hour of the day (0 to 24) under a weather at strength `w`. See light.ts. */
  setSky(hour: number, wx = 'clear', w = 0) {
    setLight(hour, wx, w); this.flashK = 0;
    // Dry lightning inside a dust storm: every so often the whole sky jumps, twice in quick succession. Plain arithmetic on the clock, no dice.
    if (wx === 'dust' && w > .35 && this.shafts > 0) { const n = Math.floor(this.time / 6.5), h = (a: number) => { const v = Math.sin(a * 127.1 + 31.7) * 43758.5453; return v - Math.floor(v); };
      if (h(n) < .6) { const d = this.time - (n * 6.5 + h(n + .5) * 5), L = (d < 0 || d > .5 ? 0 : d < .08 ? 1 : d < .15 ? .15 : d < .22 ? .75 : .75 * (1 - (d - .22) / .28)) * (w - .35) / .65;
        this.flashK = L; if (L > 0) for (let j = 0; j < 3; j++) { ENV.fog[j] *= 1 + L * .5; ENV.fogS[j] *= 1 + L * .5; ENV.amb[j] *= 1 + L * .6; ENV.top[j] *= 1 + L * 1.5; ENV.mid[j] *= 1 + L * 1.3; ENV.cloud[j] *= 1 + L * 1.2; } } }
    this.light();
  }
  /** Hands the hour's light to everything that draws. */
  private light() {
    const e = ENV, S = SHARED, u = this.postMat.uniforms;
    S.uSunT.value.fromArray(e.sun); S.uAmbT.value.fromArray(e.amb); S.uKey.value = e.key; S.uFogD.value = e.fogK; S.uMist.value = e.mist; FOG.fromArray(e.fog); FOGS.fromArray(e.fogS);
    SKYU.uTop.value.fromArray(e.top); SKYU.uMid.value.fromArray(e.mid); SKYU.uCloud.value.fromArray(e.cloud); SKYU.uDisc.value.fromArray(e.disc); SKYU.uStars.value = e.stars; SKYU.uCover.value = e.cover;
    u.uTint.value.fromArray(e.tint); u.uLift.value.fromArray(e.lift); u.uShaftC.value.fromArray(e.disc); u.uVig.value = .2 + e.stars * .16;
    S.uRimK.value = e.rim * e.key; S.uRimC.value.fromArray(e.disc); S.uCloudK.value = Math.min(.85, e.key * 1.2) * (e.cover > .82 ? Math.max(0, (.95 - e.cover) / .13) : 1) * .62; S.uCloudTh.value = 1.1 - e.cover * 1.04;
    this.glowMat.uniforms.uHot.value = e.hot / (Math.max(1, e.fogK * .75) * (1 + e.mist * 30));   // thick air is bright all over, and must not all glow
    // by night the ringed planet is what lights the land, so it shines
    if (M.planet) (M.planet as THREE.ShaderMaterial).uniforms.uEmis.value = e.stars * .2;
  }
  /** Renders the scene with shadows centred on `focus`, covering `span` metres. */
  draw(scene: THREE.Scene, cam: THREE.PerspectiveCamera | THREE.OrthographicCamera, focus: THREE.Vector3, span: number, shadows = false) {
    const r = this.renderer, sun = this.sun;
    // the dust in the air is placed round this view's camera before anything is drawn
    { const dt = Math.min(.1, Math.max(0, this.time - this.lastT)), wd = ENV.wind, m = MOTEU, ortho = !!(cam as any).isOrthographicCamera; this.lastT = this.time; this.gust.x += dt * wd * 1.5; this.gust.z += dt * wd * .5; this.gust.y -= dt * (.04 + wd * .02);
      m.uCam.value.copy(cam.position); m.uDrift.value.copy(this.gust); m.uPxH.value = this.h * cam.projectionMatrix.elements[5] * .5; m.uKey.value = ENV.key; m.uAmt.value = ortho || this.shafts <= 0 ? 0 : Math.min(.9, .42 + ENV.motes * .07);
      { const nk = ENV.stars, dk = 1 - nk; m.uCol.value.set(Math.min(1, ENV.fog[0] * .4 + .62) * dk + nk, Math.min(1, ENV.fog[1] * .4 + .6) * dk + .86 * nk, Math.min(1, ENV.fog[2] * .4 + .56) * dk + .36 * nk); }   // by night they are fireflies   // lighter than the air behind them, or they cannot be seen
      if (moteGeo) moteGeo.setDrawRange(0, Math.min(MOTE_N, Math.round(220 * ENV.motes))); }
    if (this.frameN++ % this.shadowEvery === 0 || shadows) {
      sun.left = sun.bottom = -span / 2; sun.right = sun.top = span / 2; sun.updateProjectionMatrix();
      sun.position.copy(focus).addScaledVector(LIGHT, 220); sun.lookAt(focus); sun.updateMatrixWorld();
      SHARED.uShadowMat.value.multiplyMatrices(sun.projectionMatrix, sun.matrixWorldInverse);
      sun.layers.set(0); sun.layers.enable(L_SELF);
      scene.overrideMaterial = this.depthMat; r.setRenderTarget(this.rtS); r.clear(); r.render(scene, sun); scene.overrideMaterial = null;
    }

    cam.layers.set(0); cam.layers.enable(L_FX); cam.layers.enable(L_VM);
    r.setRenderTarget(this.rtC); r.setClearColor(0xffdc94, 1); r.clear(); r.render(scene, cam);
    cam.layers.set(0); cam.layers.enable(L_VM); scene.overrideMaterial = this.normalMat;
    r.setRenderTarget(this.rtN); r.setClearColor(0x8080ff, 1); r.clear(); r.render(scene, cam); scene.overrideMaterial = null;

    const u = this.postMat.uniforms; u.uOrtho.value = (cam as any).isOrthographicCamera ? 1 : 0; u.uProj.value = cam.projectionMatrix.elements[5]; u.uBold.value = this.bold; u.uAO.value = this.ao; u.uNear.value = cam.near; u.uFar.value = cam.far; u.uSat.value = this.sat; u.uFlash.value = this.flash; u.uStatic.value = this.static; u.uTime.value = this.time;
    SUNV.copy(LIGHT).transformDirection(cam.matrixWorldInverse); u.uSun.value.set(SUNV.x, SUNV.y); if (u.uSun.value.lengthSq() < 1e-4) u.uSun.value.set(0, 1); u.uSun.value.normalize();
    SHARED.uGrit.value = this.grit; u.uGlow.value = this.glow * .9 * ENV.glow; SKYU.uTime.value = this.time; SHARED.uCloudO.value.set(this.time * .011 * (1 + ENV.wind * .6), this.time * .004);
    if (this.glow > 0) { const [a, b] = this.rtG, g = this.glowMat, bl = this.blurMat;
      this.fsq.material = g; g.uniforms.tC.value = this.rtC.texture; g.uniforms.uT.value.set(1 / this.w, 1 / this.h); r.setRenderTarget(a); r.render(this.postScene, this.postCam);
      this.fsq.material = bl; bl.uniforms.tC.value = a.texture; bl.uniforms.uT.value.set(1 / a.width, 0); r.setRenderTarget(b); r.render(this.postScene, this.postCam);
      bl.uniforms.tC.value = b.texture; bl.uniforms.uT.value.set(0, 1 / a.height); r.setRenderTarget(a); r.render(this.postScene, this.postCam);
      // the wide halo: the same blur again at half the size
      const [c, d] = this.rtW; bl.uniforms.tC.value = a.texture; bl.uniforms.uT.value.set(1 / c.width, 0); r.setRenderTarget(d); r.render(this.postScene, this.postCam);
      bl.uniforms.tC.value = d.texture; bl.uniforms.uT.value.set(0, 1 / c.height); r.setRenderTarget(c); r.render(this.postScene, this.postCam);
      // and once more at half that, for the glow that fills the air round a bright thing
      const [e, f] = this.rtX; bl.uniforms.tC.value = c.texture; bl.uniforms.uT.value.set(1 / e.width, 0); r.setRenderTarget(f); r.render(this.postScene, this.postCam);
      bl.uniforms.tC.value = f.texture; bl.uniforms.uT.value.set(0, 1 / e.height); r.setRenderTarget(e); r.render(this.postScene, this.postCam); this.fsq.material = this.postMat; }
    // Shafts are drawn only when the light is in front of you and somewhere near the picture.
    u.uShaft.value = 0; u.uFlare.value = 0;
    if (this.shafts > 0 && ENV.shaft > .02 && !(cam as any).isOrthographicCamera) {
      SUNV.copy(NOW.hour > 5.4 && NOW.hour < 19.8 ? SUNDIR : LIGHT).transformDirection(cam.matrixWorldInverse);
      if (SUNV.z < -.05) { const pe = cam.projectionMatrix.elements, sx = SUNV.x / -SUNV.z * pe[0], sy = SUNV.y / -SUNV.z * pe[5], off = Math.max(Math.abs(sx), Math.abs(sy)), k = this.shafts * ENV.shaft * Math.min(1, Math.max(0, (1.7 - off) / .7)) * Math.min(1, (-SUNV.z - .05) / .3);
        if (k > .01) { const [a, b] = this.rtR, pk = this.pickMat, ry = this.rayMat; pk.uniforms.uSunUV.value.set(sx * .5 + .5, sy * .5 + .5); u.uSunUV.value.copy(pk.uniforms.uSunUV.value); u.uAsp.value = this.w / this.h;
          u.uFlare.value = (NOW.hour > 5.4 && NOW.hour < 19.8 ? 1 : .3) * Math.min(1, ENV.shaft) * this.shafts * Math.min(1, Math.max(0, (1.1 - off) / .3)) * Math.min(1, (-SUNV.z - .05) / .3); pk.uniforms.tD.value = this.rtC.depthTexture; pk.uniforms.uNear.value = cam.near; pk.uniforms.uFar.value = cam.far; pk.uniforms.uAsp.value = this.w / this.h;
          this.fsq.material = pk; r.setRenderTarget(a); r.render(this.postScene, this.postCam);
          this.fsq.material = ry; ry.uniforms.tC.value = a.texture; ry.uniforms.uLen.value = .9; ry.uniforms.uOpen.value = 1; r.setRenderTarget(b); r.render(this.postScene, this.postCam);
          ry.uniforms.tC.value = b.texture; ry.uniforms.uLen.value = .16; ry.uniforms.uOpen.value = 0; r.setRenderTarget(a); r.render(this.postScene, this.postCam); this.fsq.material = this.postMat; u.uShaft.value = k; } } }
    r.setRenderTarget(null);
    if (this.rect) { const q = this.rect; r.setViewport(q[0], q[1], q[2], q[3]); r.setScissor(q[0], q[1], q[2], q[3]); r.setScissorTest(true); r.render(this.postScene, this.postCam); r.setScissorTest(false); r.setViewport(0, 0, this.cw, this.ch); }
    else r.render(this.postScene, this.postCam);
  }
}
/** One player's part of a split screen. It stands in for the pipeline, keeps that player's own flash and static, and draws into its own rectangle. */
export class ViewPipe {
  time = 0; flash = 0; static = 0; sat = 1; rect: [number, number, number, number] = [0, 0, 2, 2];
  constructor(public base: Pipeline) { }
  get w() { return this.base.w; } get h() { return this.base.h; }
  setDusk(k: number) { this.base.setDusk(k); }
  setSky(hour: number, wx = 'clear', w = 0) { this.base.setSky(hour, wx, w); }
  draw(scene: THREE.Scene, cam: THREE.PerspectiveCamera | THREE.OrthographicCamera, focus: THREE.Vector3, span: number) {
    const b = this.base; b.time = this.time; b.flash = this.flash; b.static = this.static; b.sat = this.sat; b.rect = this.rect;
    b.draw(scene, cam, focus, span, true); b.rect = null;
  }
}
/** Builds the shared textures and materials without a renderer, for the match server. */
export function initHeadless() { makeTextures(); makeMaterials(); }
