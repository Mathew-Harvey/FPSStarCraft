// Rendering: hand-painted procedural textures, the comic toon shader with real shadows,
// and the ink-outline post pass.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
const FOG = new THREE.Color('#ecd2c2');
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
#ifdef GROUND
uniform vec4 uRoad; uniform float uRoadW;
vec2 h2(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
// Distance to the nearest edge of a field of cracked plates, and a random number for the plate.
vec2 crackle(vec2 p){
  vec2 i=floor(p), f=fract(p), mg=vec2(0.), mr=vec2(0.); float md=8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)); vec2 r=g+h2(i+g)-f; float d=dot(r,r); if(d<md){ md=d; mr=r; mg=g; } }
  md=8.;
  for(int y=-2;y<=2;y++) for(int x=-2;x<=2;x++){ vec2 g=mg+vec2(float(x),float(y)); vec2 r=g+h2(i+g)-f; vec2 dr=r-mr; if(dot(dr,dr)>.00001) md=min(md,dot(.5*(mr+r),normalize(dr))); }
  return vec2(md,hash(i+mg));
}
// The desert floor is painted here rather than in a tiled picture, so it never repeats and stays crisp underfoot:
// big two-tone patches with a broken pen contour, wind-bleached drifts, cracked plates, pebbles, and the road with its ruts.
vec3 groundAt(vec2 p){
  vec2 gx=dFdx(p), gy=dFdy(p); float fw=max((length(gx)+length(gy))*.5,1e-4), lod=max(min(length(gx),length(gy)),1e-4);
  vec2 w=p+(vec2(vnoise(p*.13),vnoise(p*.13+17.))-.5)*9.;
  float n1=vnoise(w*.028)*.62+vnoise(w*.075+3.)*.38, a1=fwidth(n1)+.0004;
  float dr=vnoise(vec2(w.x*.02+w.y*.012,w.y*.11-w.x*.05)+60.), a2=fwidth(dr)+.0004;
  vec3 sand=vec3(.71,.53,.375), earth=vec3(.59,.4,.285), deep=vec3(.47,.31,.235), pale=vec3(.79,.63,.455), inkc=vec3(.2,.1,.09);
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
    float st=(1.-smoothstep(.06,.06+fw/.2,abs(fract(hv)-.5)))*smoothstep(.5,.6,vnoise(vec2(hu*2.4,floor(hv)*3.7)));
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
    ink=max(ink,(1.-smoothstep(.014,.014+fw,abs(r-rad)))*pf*on*clamp(.03/fw,0.,1.)); }
  c*=(.97+.06*vnoise(p*3.1))*(.91+.18*vnoise(p*.011+5.));
  return mix(c,inkc,ink*.78);
}
#endif
void main(){
  vec3 n=normalize(vN); vec3 wn=normalize(vWn); if(!gl_FrontFacing){ n=-n; wn=-wn; }
#ifdef GROUND
  vec3 base=uColor*groundAt(vW.xz);
#else
  vec3 base=uColor*texture2D(uMap,vUv).rgb;
#endif
  float nz=vnoise(vW.xz*2.3+vW.y*1.9)-.5;
  float t=dot(n,normalize(vL))+nz*.24; t=mix(t,1.,uFlat*.6);
  float sh=shadowAt(vW+wn*.07);
  float lit=smoothstep(-.03,.03,t)*smoothstep(.3,.7,sh), hi=smoothstep(.74,.78,t)*sh, deep=1.-smoothstep(-.6,-.54,t);
  vec3 shc=base*vec3(.36,.3,.48)+vec3(.02,.01,.055);
  vec3 col=mix(shc,base*vec3(.8,.75,.8),lit);
  col=mix(col,base,smoothstep(.3,.36,t)*lit);
  col=mix(col,min(base*1.2+vec3(.08,.07,.03),vec3(1.)),hi*.75*(1.-uFlat));
  vec2 fc=gl_FragCoord.xy/uPx+(vnoise(gl_FragCoord.xy/uPx*.045)-.5)*7.;
  float a1=(fc.x+fc.y)/9., a2=(fc.x-fc.y)/9.;
  float br1=smoothstep(.3,.5,vnoise(vec2(a2*.11,floor(a1)*7.3))), br2=smoothstep(.36,.56,vnoise(vec2(a1*.11,floor(a2)*5.1)+9.));
  float l1=smoothstep(.6,.8,abs(fract(a1)-.5)*2.)*br1;
  float l2=smoothstep(.6,.8,abs(fract(a2)-.5)*2.)*br2;
  float term=smoothstep(-.42,-.3,t)*(1.-smoothstep(-.05,.03,t));
  float cst=smoothstep(-.03,.03,t)*(1.-smoothstep(.3,.7,sh));
  float hatch=term*l1*.62+deep*(l1*.5+l2*.5)+cst*l1*.2;
  col=mix(col,col*.4,clamp(hatch,0.,1.)*uHatch);
  float fres=1.-max(dot(n,normalize(-vP)),0.);
  col=mix(col,min(base*1.22+vec3(.1,.09,.06),vec3(1.)),smoothstep(.7,.78,fres)*lit*.45*(1.-uFlat)*uHatch);
  float rim=pow(1.-max(dot(n,normalize(-vP)),0.),3.)*(1.-lit)*.4; col+=rim*vec3(.45,.6,.95);
  float em=min(1.,uEmis+vEm); col=mix(col,base*1.08,em);
  float d=length(vP); col=mix(col,uFog,(1.-exp(-d*uFogK))*.92*(1.-em*.6));
  gl_FragColor=vec4(col,uOpacity);
}`;
const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); WHITE.needsUpdate = true;
// Uniforms shared by every toon material so the shadow map and pixel scale update in one place.
export const SHARED = { uShadow: { value: WHITE as THREE.Texture }, uShadowMat: { value: new THREE.Matrix4() }, uShadowTex: { value: 1 / 2048 }, uPx: { value: 1 }, uL: { value: LIGHT }, uFog: { value: FOG } };
export interface ToonOpts { color?: string; emis?: number; hatch?: number; fog?: number; flat?: number; rx?: number; ry?: number; side?: THREE.Side; ground?: boolean }
export function T(map?: THREE.Texture | null, o: ToonOpts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(o.color || '#ffffff') }, uMap: { value: map || WHITE }, uEmis: { value: o.emis || 0 }, uOpacity: { value: 1 }, uHatch: { value: o.hatch === undefined ? 1 : o.hatch }, uFogK: { value: o.fog === undefined ? .0032 : o.fog }, uFlat: { value: o.flat || 0 }, uRep: { value: new THREE.Vector2(o.rx || 1, o.ry || 1) }, ...(o.ground ? { uRoad: { value: new THREE.Vector4() }, uRoadW: { value: 0 } } : {}), ...SHARED },
    vertexShader: TOON_VS, fragmentShader: TOON_FS, side: o.side || THREE.FrontSide, defines: o.ground ? { GROUND: 1 } : {},
  });
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
    rock: T(TX.rock), mesa: T(TX.mesa, { rx: 3, ry: 1 }), ground: T(null, { hatch: .55, flat: 1, ground: true }), ore: T(TX.ore, { emis: .35 }), oreDead: T(TX.rock, { color: '#b9b0a8' }),
    indigo: T(TX.indigo), indigoL: T(TX.indigo, { color: '#c9c2ff' }), indigoD: T(TX.indigoD), smoke: T(TX.smoke, { hatch: .5 }), soot: T(TX.smoke, { color: '#6d5f68' }), dust: T(TX.smoke, { hatch: .3, color: '#f0b98a' }),
    visor: T(null, { color: '#ffe27a', emis: 1 }), cyan: T(null, { color: '#8ff2ff', emis: 1 }), teal: T(null, { color: '#35e0c8', emis: .9 }), mag: T(null, { color: '#ff4f9a', emis: .9 }), red: T(null, { color: '#ff4b3a', emis: 1 }),
    planet: T(TX.planet, { fog: 0, hatch: .4 }), ring: T(null, { color: '#ffe9c4', emis: .8, fog: 0, side: THREE.DoubleSide }),
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
const POST_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tC,tD,tN; uniform vec2 uRes; uniform float uNear,uFar,uOrtho,uPx,uSat,uStatic,uTime,uFlash,uDusk,uBold,uProj,uAO; ${NOISE}
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
  float edge=(edgeAt(u+h,sp)+edgeAt(u-h,sp)+edgeAt(u+h*vec2(1.,-1.),sp)+edgeAt(u+h*vec2(-1.,1.),sp))*.25;
  vec3 col=texture2D(tC,vUv).rgb;
  if(uOrtho<.5&&uAO>0.){ float d0=lin(vUv); if(d0<140.){ float oc=hollow(vUv,d0)*uAO; col*=mix(vec3(1.),vec3(.42,.36,.56),oc); } }
  col=mix(col,vec3(.05,.045,.075),min(1.,edge*.95));
  col=mix(col,col*vec3(1.1,.8,.84)+vec3(.03,0.,.07),uDusk*.75);
  col=mix(vec3(dot(col,vec3(.3,.59,.11))),col,1.18*uSat);
  col*=.95+.08*vnoise(sp*.5);
  float v=smoothstep(1.3,.5,length((vUv-.5)*vec2(1.25,1.))); col*=mix(.8,1.,v);
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
  sat = 1; static = 0; time = 0; flash = 0; private aaNow = -1;
  /** Redraw the shadow map every Nth frame. Low picture quality uses 3. */
  shadowEvery = 1; private frameN = 0;
  /** Samples per pixel when drawing the colour picture, so slanted edges come out clean rather than stepped. 0 turns it off. */
  aa = 4;
  /** How much heavier the outside line of a thing is than the lines inside it, close up. 0 is one pen for everything. */
  bold = 1;
  /** Strength of the contact shading under and between things. Low picture quality turns it off. */
  ao = 1;
  /** Size of the canvas itself. It is larger than `w` by `h` only when the screen is split into views. */
  cw = 1; ch = 1;
  /** Where on the canvas the finished picture goes, in canvas pixels from the bottom left. Null fills the canvas. */
  rect: [number, number, number, number] | null = null;

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
      uniforms: { tC: { value: null }, tD: { value: null }, tN: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: .06 }, uFar: { value: 4000 }, uOrtho: { value: 0 }, uPx: SHARED.uPx, uSat: { value: 1 }, uFlash: { value: 0 }, uStatic: { value: 0 }, uTime: { value: 0 }, uDusk: DUSK, uBold: { value: 1 }, uProj: { value: 1 }, uAO: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
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
    const u = this.postMat.uniforms; u.tC.value = this.rtC.texture; u.tD.value = this.rtC.depthTexture; u.tN.value = this.rtN.texture; u.uRes.value.set(w, h);
  }

  /** Moves the sun toward the horizon and warms the grade. 0 is midday, 1 is sunset. */
  setDusk(k: number) { if (Math.abs(k - DUSK.value) < .002 && k !== 0) return; DUSK.value = k; LIGHT.set(-.55 - k * .2, .62 - k * .22, .56).normalize(); FOG.set('#ecd2c2').lerp(DUSKFOG, k); }
  /** Renders the scene with shadows centred on `focus`, covering `span` metres. */
  draw(scene: THREE.Scene, cam: THREE.PerspectiveCamera | THREE.OrthographicCamera, focus: THREE.Vector3, span: number, shadows = false) {
    const r = this.renderer, sun = this.sun;
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
  draw(scene: THREE.Scene, cam: THREE.PerspectiveCamera | THREE.OrthographicCamera, focus: THREE.Vector3, span: number) {
    const b = this.base; b.time = this.time; b.flash = this.flash; b.static = this.static; b.sat = this.sat; b.rect = this.rect;
    b.draw(scene, cam, focus, span, true); b.rect = null;
  }
}
/** Builds the shared textures and materials without a renderer, for the match server. */
export function initHeadless() { makeTextures(); makeMaterials(); }
