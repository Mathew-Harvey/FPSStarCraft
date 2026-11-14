// The sculpted models and their painted pictures. A published page carries them as files beside it (art/<kind>.wasm, art/<name>.webp;
// a model is named .wasm only because the artifact service refuses .bin, its bytes are the deflated model)
// and fetches them before the game starts, so the page itself stays small. A page built with INLINE=1 (dist/index.html, which has to
// open from disk) carries them inside instead, as base64 in the `mesh:bank` module. The match server and the Node tests get neither and
// build every body from code (src/units.ts, src/models.ts keep a code-built stand-in for each kind).
import BANK from 'mesh:bank';
import FILES from 'art:files';
import { I_UNIT, I_BLD } from './factions/ironhold/numbers';
import { V_UNIT, V_BLD } from './factions/veyl/numbers';
import { G_UNIT, G_BLD } from './factions/gloam/numbers';

/** Deflated model bytes by kind (src/meshes.ts inflates them). */
const BIN: Record<string, Uint8Array> = {};
/** Picture address by key (`<kind>.tex` for a painted figure, `<kind>.wear.tex` for a building's wear). */
const TEX: Record<string, string> = {};
/** The same pictures, already decoded (files beside the page only). */
const IMG: Record<string, HTMLImageElement> = {};
/** A decoded picture for `key`, when there is one. */
export const artImg = (key: string): HTMLImageElement | null => IMG[key] || null;
const b64 = (s: string) => { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };

/** The model bytes for `kind`, or null when this build has none (the caller builds the code-made stand-in). */
export function artBin(kind: string): Uint8Array | null {
  let u = BIN[kind]; if (u) return u;
  const s = (BANK as Record<string, string>)[kind]; if (!s) return null;
  return BIN[kind] = b64(s);
}
/** An address an <img> can load for a picture, or null when there is none. */
export function artTex(key: string): string | null {
  const t = TEX[key]; if (t) return t;
  const s = (BANK as Record<string, string>)[key]; return s ? TEX[key] = 'data:image/webp;base64,' + s : null;
}

export type ArtFile = { name: string; bytes: number; v: string; /** Its faction, from build.mjs: -1 for art any match may need. */ f?: number };
/** The files this page expects beside it (filled in by build.mjs; empty for an inlined page, the server and the tests). */
export const ART_FILES: ArtFile[] = (FILES as ArtFile[]) || [];
export const ART_DIR = 'art/';
/** What has been asked for and what came: how many files, which did not, how many bytes, how long. Read by tests through __oreArt. */
export const artState = { want: 0, got: 0, missing: [] as string[], cached: 0, bytes: 0, ms: 0, done: ART_FILES.length === 0, all: ART_FILES.length };

// ---- which files a match needs
// Each faction's art is fetched only when a match with that faction is about to start, and the middle and far models (seen only from
// high up) after the near ones, while the match is already running. A kind no faction table names (a neutral prop) comes with any.
const FAC: Record<string, number> = {};
for (const [f, tabs] of [[0, [I_UNIT, I_BLD]], [1, [V_UNIT, V_BLD]], [2, [G_UNIT, G_BLD]]] as [number, object[]][]) for (const t of tabs) for (const k of Object.keys(t)) FAC[k] = f;
/** The kind a file belongs to, and whether it is a middle or far model. */
const kindOf = (name: string) => name.replace(/\.(wasm|webp)$/, '').replace(/\.(mid|far|wear|top)$/, '');
const isLevel = (name: string) => /\.(mid|far)\.wasm$/.test(name);
const facOf = (f: ArtFile) => FAC[kindOf(f.name)] ?? f.f ?? -1;
const filesFor = (facs: number[], levels: boolean) => ART_FILES.filter(f => isLevel(f.name) === levels && (facOf(f) < 0 || facs.includes(facOf(f) % 3)));
/** Bumped whenever new files land, so whoever built a body from code before its art came knows to build it again. */
let version = 0;
export const artVersion = () => version;

async function openCache(): Promise<Cache | null> {
  try { return typeof caches !== 'undefined' ? await caches.open('ore-else-art') : null; } catch { return null; }
}
/** Fetches one file, through the browser's Cache Storage when the page is allowed one. A file whose version changed is fetched again. */
async function fetchOne(c: Cache | null, f: ArtFile, tick: (n: number) => void): Promise<ArrayBuffer | null> {
  const url = ART_DIR + f.name + '?v=' + f.v;
  if (c) try { const hit = await c.match(url); if (hit) { const ab = await hit.arrayBuffer(); artState.cached++; tick(f.bytes); return ab; } } catch { /* no cache in this frame */ }
  try {
    const r = await fetch(url); if (!r.ok) return null;
    let ab: ArrayBuffer;
    if (r.body && 'getReader' in r.body) {                     // stream it so the bar moves within a big file too
      const rd = r.body.getReader(), parts: Uint8Array[] = []; let n = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; tick(value.length); }
      const u = new Uint8Array(n); let o = 0; for (const p of parts) { u.set(p, o); o += p.length; } ab = u.buffer;
      if (n < f.bytes) tick(f.bytes - n);
    } else { ab = await r.arrayBuffer(); tick(f.bytes); }
    artState.bytes += ab.byteLength;
    if (c) try { await c.put(url, new Response(ab.slice(0), { headers: { 'content-type': f.name.endsWith('.webp') ? 'image/webp' : 'application/wasm' } })); } catch { /* full or refused: fine */ }
    return ab;
  } catch { return null; }
}

const ASKED = new Map<string, Promise<void>>(), DONE = new Set<string>(), NOPIC = new Set<string>();
let cache: Promise<Cache | null> | null = null;
/** Fetches `files` (each only once however often it is asked for), six at a time, biggest first. Never rejects: a file that will not
 *  come is left out and that kind keeps its code-built body. */
async function fetchSet(files: ArtFile[], progress: (f: number) => void) {
  const t0 = performance.now(), fresh = files.filter(f => !ASKED.has(f.name));
  const total = files.reduce((s, f) => s + f.bytes, 0) || 1; let have = files.filter(f => DONE.has(f.name)).reduce((s, f) => s + f.bytes, 0);
  const tick = (n: number) => { have += n; progress(Math.min(1, have / total)); };
  const ends = new Map<string, () => void>();
  for (const f of fresh) ASKED.set(f.name, new Promise<void>(r => ends.set(f.name, r)));   // at once, before any wait: anyone asking again waits for that file
  artState.want += fresh.length; artState.done = false;
  if (!cache) cache = openCache(); const c = await cache;
  const queue = fresh.slice().sort((a, b) => b.bytes - a.bytes), mine: Promise<void>[] = [];
  const work = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const ab = await fetchOne(c, f, tick); DONE.add(f.name);
      // A painted figure whose picture did not come would draw black: its model is dropped too, so it gets the code-built body.
      if (!ab) { artState.missing.push(f.name); if (f.name.endsWith('.webp') && !f.name.includes('.wear.')) { NOPIC.add(kindOf(f.name)); delete BIN[kindOf(f.name)]; } }
      else {
        artState.got++; version++;
        if (f.name.endsWith('.wasm')) { if (!NOPIC.has(kindOf(f.name)) || isLevel(f.name)) BIN[f.name.slice(0, -5)] = new Uint8Array(ab); }
        else if (f.name.endsWith('.webp')) {
          // Decoded here, before anyone asks: a picture decoded only when its first body is drawn leaves that body black for a moment.
          const key = f.name.slice(0, -5) + '.tex', url = TEX[key] = URL.createObjectURL(new Blob([ab], { type: 'image/webp' }));
          if (typeof Image !== 'undefined') { const img = new Image(); img.src = url; try { await img.decode(); IMG[key] = img; } catch { /* drawn when it loads */ } }
        }
      }
      ends.get(f.name)!();
    }
  };
  for (let i = 0; i < 6; i++) mine.push(work());
  for (const f of files) if (!fresh.includes(f) && !DONE.has(f.name)) mine.push(ASKED.get(f.name)!.then(() => tick(f.bytes)));   // on the way in another batch
  await Promise.all(mine);
  artState.ms += Math.round(performance.now() - t0); artState.done = true; progress(1);
}

/** True when every near model and picture for these factions (0 Ironhold, 1 Veyl, 2 Gloam) has been fetched or given up on. */
export const artHas = (facs: number[]) => filesFor(facs, false).every(f => DONE.has(f.name));
/** Fetches what a match between these factions needs to start: their near models and pictures. Their middle and far models follow on
 *  their own afterwards (a body shows its near model until they come). `progress(0..1)` follows the near files. */
export function artFor(facs: number[], progress: (f: number) => void = () => {}): Promise<void> {
  return fetchSet(filesFor(facs, false), progress).then(() => { void fetchSet(filesFor(facs, true), () => {}); });
}
/** Everything, middle and far models too, before the game starts: for the browser tests (play.html?art=all). */
export async function artAll(progress: (f: number) => void) { await fetchSet(filesFor([0, 1, 2], false), progress); await fetchSet(filesFor([0, 1, 2], true), () => {}); }
/** The first load (src/boot.ts): the factions the player last played, or Ironhold and the Veyl on a first visit. */
export function loadArt(progress: (f: number) => void, facs = lastFactions()): Promise<void> {
  if (!ART_FILES.length) { artState.done = true; progress(1); return Promise.resolve(); }
  return artFor(facs, progress);
}
/** The factions the page last loaded art for, kept so the next visit starts with them. */
function lastFactions(): number[] { try { const v = JSON.parse(localStorage.getItem('ore-else-art') || 'null'); if (Array.isArray(v) && v.length && v.every(n => n >= 0 && n < 3)) return v; } catch { /* storage is optional */ } return [0, 1]; }
/** Remembers the factions of the match being started, for the next visit's first load. */
export function rememberFactions(facs: number[]) { try { localStorage.setItem('ore-else-art', JSON.stringify([...new Set(facs.map(f => f % 3))])); } catch { /* storage is optional */ } }
