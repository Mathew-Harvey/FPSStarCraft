// The light of the world: the hour, the weather, and the lamps.
//
// The picture is drawn with plain shapes and flat tones, so most of what a place feels like comes from its light. This file says what that
// light is at every hour and in every weather, as one row of numbers: the colour of sunlight, the colour that fills the shade, how strong the
// one is against the other, what colour the air is far off and how thick, how much mist lies on the ground, what the sky is doing, how far
// lamps spill. The renderer (gfx.ts) reads the row every frame. Nothing here is read by the rules of a match: it is all for show.
import * as THREE from 'three';

type C3 = [number, number, number];
/** One row: the light at one moment. Colours are red, green, blue. */
export interface Env {
  /** Tint of whatever the key light falls on, against the plain midday picture (1, 1, 1). */ sun: C3;
  /** Tint of whatever is in shade. Over 1 lifts the shade, which is how a night stays readable. */ amb: C3;
  /** Strength of the key light, 0 to 1. At 0 nothing is lit or shadowed, which is when the sun hands over to the planet. */ key: number;
  /** Colour of the far air looking away from the light, and looking toward it. */ fog: C3; fogS: C3;
  /** Thickness of the air, 1 being a clear noon. */ fogK: number;
  /** Mist lying on the ground, as extra thickness per metre at ground level. */ mist: number;
  /** Sky overhead and part way down. The horizon is the colour of the far air. */ top: C3; mid: C3;
  cloud: C3; /** How much of the sky the clouds take, 0 to 1. */ cover: number; stars: number;
  /** Colour of the sun's disc and of the shafts it throws through the air, and how strong those shafts are. */ disc: C3; shaft: number;
  /** How far glowing things spill, against midday. */ glow: number;
  /** How much sunlit sand, bright sky and lamp-lit ground glow of their own accord. */ hot: number;
  /** The bright line the key light draws down the edge of a body that turns toward it. */ rim: number;
  /** How strongly lamps, fires and crystals light the ground round them. */ pool: number;
  /** The last grade over the whole picture: a multiply and a lift. */ tint: C3; lift: C3;
  /** Dust in the air: how much, and how hard the wind drives it. */ motes: number; wind: number;
}
const NIGHT: Env = { sun: [.42, .55, 1], amb: [.68, .9, 1.62], key: .62, fog: [.07, .1, .2], fogS: [.14, .19, .34], fogK: 1.3, mist: .006, top: [.016, .03, .09], mid: [.045, .085, .2], cloud: [.16, .22, .38], cover: .4, stars: 1, disc: [.6, .75, 1], shaft: .5, glow: 2.2, hot: .2, rim: .75, pool: 1.2, tint: [.96, 1, 1.08], lift: [0, .004, .018], motes: .5, wind: .5 };
/** The day, hour by hour. Anything between two rows is a blend of them. */
const DAY: [number, Env][] = [
  [0, NIGHT], [4.7, NIGHT],
  // first light: the key light is out, the sky is already going pink at one end, mist is rising
  [5.4, { sun: [.6, .6, .85], amb: [1.12, 1.18, 1.5], key: 0, fog: [.3, .29, .42], fogS: [.78, .46, .42], fogK: 1.5, mist: .016, top: [.06, .09, .23], mid: [.28, .26, .42], cloud: [.78, .44, .46], cover: .5, stars: .3, disc: [1, .6, .4], shaft: .3, glow: 1.9, hot: .6, rim: 0, pool: 1.05, tint: [1, 1, 1.03], lift: [.004, 0, .012], motes: .5, wind: .4 }],
  // dawn: a low pink sun through thick mist, long shafts
  [6.4, { sun: [1.2, .84, .68], amb: [1.05, .98, 1.1], key: .8, fog: [.8, .67, .7], fogS: [1, .76, .54], fogK: 1.7, mist: .024, top: [.2, .35, .58], mid: [.76, .62, .66], cloud: [1, .74, .62], cover: .55, stars: 0, disc: [1, .8, .55], shaft: 1.7, glow: 1.65, hot: .7, rim: .9, pool: .4, tint: [1.02, 1, .99], lift: [.01, 0, .006], motes: .9, wind: .4 }],
  [8, { sun: [1.07, .99, .87], amb: [.96, 1, 1.13], key: 1, fog: [.88, .85, .82], fogS: [1, .93, .77], fogK: 1.4, mist: .008, top: [.09, .36, .57], mid: [.42, .77, .81], cloud: [1, .97, .88], cover: .5, stars: 0, disc: [1, .95, .72], shaft: .85, glow: 1.3, hot: .55, rim: .45, pool: .08, tint: [1, 1, 1], lift: [0, 0, 0], motes: .7, wind: .6 }],
  // noon: hard white light, short shadows, pale haze over the far rock
  [12, { sun: [1.03, 1, .95], amb: [.96, .98, 1.08], key: 1, fog: [.87, .84, .82], fogS: [1, .92, .78], fogK: 1.12, mist: .003, top: [.07, .33, .5], mid: [.36, .78, .76], cloud: [1, .93, .78], cover: .5, stars: 0, disc: [1, .95, .7], shaft: .6, glow: 1.2, hot: .4, rim: .25, pool: 0, tint: [1, 1, 1], lift: [0, 0, 0], motes: .6, wind: .7 }],
  [16, { sun: [1.05, .97, .86], amb: [.97, .97, 1.1], key: 1, fog: [.93, .8, .72], fogS: [1, .86, .64], fogK: 1.32, mist: .002, top: [.08, .3, .5], mid: [.45, .72, .74], cloud: [1, .9, .72], cover: .5, stars: 0, disc: [1, .92, .66], shaft: .8, glow: 1.25, hot: .5, rim: .45, pool: .04, tint: [1, 1, 1], lift: [0, 0, 0], motes: .7, wind: .7 }],
  // golden hour: orange light, violet shade, the air lit up toward the sun
  [17.8, { sun: [1.3, .88, .54], amb: [.9, .85, 1.18], key: 1, fog: [.9, .66, .58], fogS: [1, .75, .43], fogK: 1.55, mist: .003, top: [.12, .2, .46], mid: [.86, .57, .5], cloud: [1, .72, .46], cover: .5, stars: 0, disc: [1, .82, .5], shaft: 1.7, glow: 1.6, hot: .7, rim: 1, pool: .25, tint: [1.03, 1, .97], lift: [.01, 0, .01], motes: 1, wind: .5 }],
  [19, { sun: [1.34, .6, .4], amb: [.78, .74, 1.16], key: .78, fog: [.7, .43, .5], fogS: [1, .5, .3], fogK: 1.45, mist: .006, top: [.13, .1, .36], mid: [.7, .34, .46], cloud: [1, .5, .4], cover: .5, stars: .15, disc: [1, .6, .34], shaft: 1.6, glow: 1.85, hot: 1, rim: 1, pool: .8, tint: [1.04, .97, .97], lift: [.015, 0, .02], motes: .9, wind: .4 }],
  // the blue hour: the sun is down and the planet has not taken over yet, an ember band at one end of the sky
  [19.8, { sun: [.7, .6, .9], amb: [1.2, 1.25, 1.45], key: 0, fog: [.25, .21, .41], fogS: [.62, .3, .36], fogK: 1.4, mist: .008, top: [.045, .055, .19], mid: [.19, .15, .35], cloud: [.5, .3, .45], cover: .45, stars: .6, disc: [1, .5, .3], shaft: .15, glow: 2.05, hot: .3, rim: 0, pool: 1.1, tint: [1, .99, 1.04], lift: [.004, 0, .018], motes: .6, wind: .4 }],
  [21, NIGHT], [24, NIGHT],
];
/** What a weather does to the row it is laid over. */
interface Wx { fogK: number; mist: number; key: number; shaft: number; /** Air and sky pulled this far toward `hue`, at `dim` times the brightness of the hour. */ pull: number; hue: C3; dim: number; /** Sky blotted out toward the colour of the air. */ blot: number; sun: C3; amb: C3; cover: number; motes: number; wind: number }
export const WEATHER: Record<string, Wx> = {
  clear: { fogK: 1, mist: 0, key: 1, shaft: 1, pull: 0, hue: [1, 1, 1], dim: 1, blot: 0, sun: [1, 1, 1], amb: [1, 1, 1], cover: 0, motes: 1, wind: 1 },
  // dust hanging in still air: everything far off goes soft and the sun throws long shafts through it
  haze: { fogK: 1.9, mist: .004, key: .9, shaft: 1.6, pull: .25, hue: [1, .86, .66], dim: 1, blot: .25, sun: [1, .97, .9], amb: [1.05, 1.03, 1], cover: .1, motes: 2, wind: .5 },
  // a dust storm off the flats: the sky goes, the sun is a dull coin, and you see a stone's throw
  dust: { fogK: 4.6, mist: .014, key: .4, shaft: .5, pull: .7, hue: [1, .7, .42], dim: .74, blot: .85, sun: [1, .84, .66], amb: [1.3, 1.12, .92], cover: .2, motes: 7, wind: 4.5 },
  // a lid of cloud: no shadows to speak of, cool even light
  overcast: { fogK: 1.45, mist: .003, key: .3, shaft: .15, pull: .5, hue: [.86, .9, 1], dim: .74, blot: .75, sun: [.94, .97, 1.04], amb: [1.45, 1.34, 1.1], cover: .9, motes: .8, wind: 1.4 },
  // mist off the ground: thick below the knee, thin above the rooftops
  mist: { fogK: 1.3, mist: .03, key: .72, shaft: 1.3, pull: .3, hue: [.9, .96, 1], dim: 1, blot: .3, sun: [1, 1, 1], amb: [1.06, 1.06, 1.06], cover: .1, motes: .4, wind: .3 },
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mix3 = (o: C3, a: C3, b: C3, k: number) => { o[0] = lerp(a[0], b[0], k); o[1] = lerp(a[1], b[1], k); o[2] = lerp(a[2], b[2], k); return o; };
const lum = (c: C3) => c[0] * .3 + c[1] * .59 + c[2] * .11;
const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
const blank = (): Env => ({ sun: [1, 1, 1], amb: [1, 1, 1], key: 1, fog: [1, 1, 1], fogS: [1, 1, 1], fogK: 1, mist: 0, top: [0, 0, 0], mid: [0, 0, 0], cloud: [1, 1, 1], cover: .5, stars: 0, disc: [1, 1, 1], shaft: 0, glow: 1, hot: .4, rim: 0, pool: 0, tint: [1, 1, 1], lift: [0, 0, 0], motes: 1, wind: 1 });
const TRI: (keyof Env)[] = ['sun', 'amb', 'fog', 'fogS', 'top', 'mid', 'cloud', 'disc', 'tint', 'lift'], ONE: (keyof Env)[] = ['key', 'fogK', 'mist', 'cover', 'stars', 'shaft', 'glow', 'hot', 'rim', 'pool', 'motes', 'wind'];

/** The row the renderer is reading this frame. */
export const ENV: Env = blank();
/** Which way the key light comes from (the sun by day, the ringed planet by night), and where the sun's disc sits in the sky. */
export const KEYDIR = new THREE.Vector3(-.55, .62, .56).normalize(), SUNDIR = KEYDIR.clone();
/** The hour the row was last worked out for, and the weather over it. */
export const NOW = { hour: 12, wx: 'clear', w: 0 };
const NOON_AZ = Math.atan2(.56, -.55), NOON_EL = Math.asin(KEYDIR.y), PLANET = new THREE.Vector3(.42, .5, -.76).normalize(), T3: C3 = [0, 0, 0];

/** The old dial (0 midday, 1 night) as an hour of the day. Maps, story jobs and cut scenes still speak in it. */
export const hourOf = (dusk: number) => 12 + dusk * 10;
/** The hour a match has reached: it starts at the map's own hour, the day runs at a little under a minute to the hour, and the night at twice that. */
export function matchHour(dusk0: number, time: number) {
  let h = hourOf(dusk0), t = Math.max(0, time - 40) / 52;
  for (let i = 0; i < 64 && t > 0; i++) { h %= 24; const night = h >= 20.5 || h < 4.7, rate = night ? 2 : 1, end = night ? (h >= 20.5 ? 28.7 : 4.7) : 20.5, room = (end - h) / rate; if (t < room) { h += t * rate; t = 0; } else { h = end; t -= room; } }
  return h % 24;
}
/** The weather a match has at a given time. It is the same for everyone playing the same map with the same `salt`, changes every few minutes, and always clears in between. */
export function matchWeather(salt: number, time: number, hour: number): [string, number] {
  const W = 150, n = Math.floor(time / W), t = time - n * W; if (n < 1) return ['clear', 0];
  const r = hash(salt + 3.7, n), dark = hour > 20 || hour < 7.5;
  const wx = r < .46 ? 'clear' : r < .64 ? 'haze' : r < .76 ? (dark ? 'mist' : 'overcast') : r < .88 ? (dark ? 'mist' : 'haze') : 'dust', dur = wx === 'dust' ? 95 : W;
  const w = Math.min(1, t / 22) * Math.min(1, Math.max(0, (dur - t) / 22)); return [wx, w * w * (3 - 2 * w)];
}
/** Works out the row for an hour of the day (0 to 24) under a weather laid over it at strength `w`. */
export function setLight(hour: number, wx = 'clear', w = 0) {
  hour = ((hour % 24) + 24) % 24; NOW.hour = hour; NOW.wx = wx; NOW.w = w;
  let i = 0; while (i < DAY.length - 2 && DAY[i + 1][0] <= hour) i++;
  const a = DAY[i], b = DAY[i + 1], k0 = (hour - a[0]) / Math.max(1e-6, b[0] - a[0]), k = k0 * k0 * (3 - 2 * k0), e = ENV as any;
  for (const f of TRI) mix3(e[f], (a[1] as any)[f], (b[1] as any)[f], k); for (const f of ONE) e[f] = lerp((a[1] as any)[f], (b[1] as any)[f], k);
  // where the sun is: it climbs from one end of the map and goes down at the other, and at noon it stands where the picture was always lit from
  const day = hour >= 5.4 && hour <= 19.8, half = hour < 12 ? 6.6 : 7.8, ph = (hour - 12) / half, el = NOON_EL * Math.cos(Math.max(-1.25, Math.min(1.25, ph)) * Math.PI / 2), az = NOON_AZ - (hour - 12) * .16;
  SUNDIR.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
  if (day) { const le = Math.max(.26, el); KEYDIR.set(Math.cos(az) * Math.cos(le), Math.sin(le), Math.sin(az) * Math.cos(le)).normalize(); } else KEYDIR.copy(PLANET);
  const x = WEATHER[wx]; if (!x || w <= 0) return;
  ENV.fogK *= lerp(1, x.fogK, w); ENV.mist += x.mist * w; ENV.key *= lerp(1, x.key, w); ENV.shaft *= lerp(1, x.shaft, w); ENV.cover = Math.min(1, ENV.cover + x.cover * w); ENV.motes *= lerp(1, x.motes, w); ENV.wind *= lerp(1, x.wind, w);
  for (let j = 0; j < 3; j++) { ENV.sun[j] *= lerp(1, x.sun[j], w); ENV.amb[j] *= lerp(1, x.amb[j], w); }
  for (const f of ['fog', 'fogS'] as const) { const c = ENV[f], l = lum(c) * 1.06 * x.dim; T3[0] = x.hue[0] * l; T3[1] = x.hue[1] * l; T3[2] = x.hue[2] * l; mix3(c, c, T3, x.pull * w); }
  for (const f of ['top', 'mid'] as const) mix3(ENV[f], ENV[f], ENV.fog, x.blot * w);
  mix3(ENV.cloud, ENV.cloud, ENV.fog, x.blot * w); for (let j = 0; j < 3; j++) ENV.cloud[j] *= lerp(1, x.dim, w); ENV.stars *= 1 - x.blot * w; mix3(ENV.disc, ENV.disc, ENV.fogS, x.blot * w * .5);
}

// ---------------------------------------------------------------- lamps
/** How many lamps can light the ground at once. The nearest and brightest are picked each frame. */
export const LAMPS = 8;
interface Lamp { x: number; y: number; z: number; r: number; c: C3; k: number; /** A burst, which shows by day as well. */ f: boolean }
const pile: Lamp[] = []; let pn = 0;
const flashes: { x: number; y: number; z: number; r: number; c: C3; t: number; life: number }[] = [];
/** What the shader reads: where each lamp is and how far it reaches, and its colour. */
export const LAMP_P = Array.from({ length: LAMPS }, () => new THREE.Vector4(0, -999, 0, 1)), LAMP_C = Array.from({ length: LAMPS }, () => new THREE.Vector3()), LAMP_N = { value: 0 };
/** Turns lamp light off altogether (Low picture quality). */
export const LAMP_ON = { value: true };
/** Clears the list for a new frame. */
export function lampsBegin() { pn = 0; }
/** Adds a lamp for this frame: where, how far it reaches in metres, its colour, and how bright against the others. */
export function lamp(x: number, y: number, z: number, r: number, c: C3, k = 1, f = false) { if (!f && ENV.pool < .02) return; const l = pile[pn] || (pile[pn] = { x: 0, y: 0, z: 0, r: 1, c: [1, 1, 1], k: 1, f: false }); pn++; l.x = x; l.y = y; l.z = z; l.r = r; l.c = c; l.k = k; l.f = f; }
/** A burst of light that dies away: a muzzle flash, a blast. */
export function flashLamp(x: number, y: number, z: number, r: number, c: C3, life = .12) { if (flashes.length > 24) flashes.shift(); flashes.push({ x, y, z, r, c, t: life, life }); }
/** Picks the lamps that matter most from where the camera stands and hands them to the shader. */
export function lampsCommit(cam: THREE.Vector3, dt: number) {
  for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t -= dt; if (f.t <= 0) { flashes.splice(i, 1); continue; } const a = f.t / f.life; lamp(f.x, f.y, f.z, f.r * (.6 + .4 * a), f.c, a * 1.4, true); }
  if (!LAMP_ON.value || !pn) { LAMP_N.value = 0; return; }
  const score = (l: Lamp) => l.k * l.r * l.r / ((l.x - cam.x) ** 2 + (l.y - cam.y) ** 2 + (l.z - cam.z) ** 2 + l.r * l.r * 4);
  let n = 0; const used: Lamp[] = [];
  for (; n < LAMPS; n++) { let best: Lamp | null = null, bs = 2e-4; for (let i = 0; i < pn; i++) { const l = pile[i]; if (used.includes(l)) continue; const s = score(l); if (s > bs) { bs = s; best = l; } } if (!best) break; used.push(best); const p = (best.f ? Math.max(ENV.pool, .75) : ENV.pool) * best.k; LAMP_P[n].set(best.x, best.y, best.z, best.r); LAMP_C[n].set(best.c[0] * p, best.c[1] * p, best.c[2] * p); }
  LAMP_N.value = n;
}
/** A lamp's flicker: a fire gutters, a tube hums. Plain arithmetic on the clock, no dice. */
export const flicker = (t: number, id: number, deep = .2) => 1 - deep * (.5 + .5 * Math.sin(t * 11.3 + id * 5.1) * Math.sin(t * 7.1 + id * 2.3)) - deep * .5 * hash(id, Math.floor(t * 14));
