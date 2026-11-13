// The sculpted models and their painted pictures. A published page carries them as files beside it (art/<kind>.wasm, art/<name>.webp;
// a model is named .wasm only because the artifact service refuses .bin, its bytes are the deflated model)
// and fetches them before the game starts, so the page itself stays small. A page built with INLINE=1 (dist/index.html, which has to
// open from disk) carries them inside instead, as base64 in the `mesh:bank` module. The match server and the Node tests get neither and
// build every body from code (src/units.ts, src/models.ts keep a code-built stand-in for each kind).
import BANK from 'mesh:bank';
import FILES from 'art:files';

/** Deflated model bytes by kind (src/meshes.ts inflates them). */
const BIN: Record<string, Uint8Array> = {};
/** Picture address by key (`<kind>.tex` for a painted figure, `<kind>.wear.tex` for a building's wear). */
const TEX: Record<string, string> = {};
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

export type ArtFile = { name: string; bytes: number; v: string };
/** The files this page expects beside it (filled in by build.mjs; empty for an inlined page, the server and the tests). */
export const ART_FILES: ArtFile[] = (FILES as ArtFile[]) || [];
export const ART_DIR = 'art/';
/** What the last load found: how many files came, which did not, and how long it took. Read by tests through __ore.art. */
export const artState = { want: ART_FILES.length, got: 0, missing: [] as string[], cached: 0, ms: 0, done: ART_FILES.length === 0 };

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
    if (c) try { await c.put(url, new Response(ab.slice(0), { headers: { 'content-type': f.name.endsWith('.webp') ? 'image/webp' : 'application/wasm' } })); } catch { /* full or refused: fine */ }
    return ab;
  } catch { return null; }
}

/** Loads every art file. `progress(0..1)` is called as bytes arrive. Never rejects: a file that will not come is left out and that
 *  kind falls back to its code-built body. Six at a time, biggest first, so the bar moves evenly. */
export async function loadArt(progress: (f: number) => void): Promise<void> {
  const t0 = performance.now(); if (!ART_FILES.length) { artState.done = true; progress(1); return; }
  const total = ART_FILES.reduce((s, f) => s + f.bytes, 0) || 1; let have = 0;
  const tick = (n: number) => { have += n; progress(Math.min(1, have / total)); };
  const c = await openCache(), queue = ART_FILES.slice().sort((a, b) => b.bytes - a.bytes);
  const work = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const ab = await fetchOne(c, f, tick);
      if (!ab) { artState.missing.push(f.name); tick(0); continue; }
      artState.got++;
      if (f.name.endsWith('.wasm')) BIN[f.name.slice(0, -5)] = new Uint8Array(ab);
      else if (f.name.endsWith('.webp')) TEX[f.name.slice(0, -5) + '.tex'] = URL.createObjectURL(new Blob([ab], { type: 'image/webp' }));
    }
  };
  await Promise.all([work(), work(), work(), work(), work(), work()]);
  // A painted figure whose picture did not come would draw black: drop its model too, so it gets the code-built body.
  for (const k of Object.keys(BIN)) if (ART_FILES.some(f => f.name === k + '.webp') && !TEX[k + '.tex']) delete BIN[k];
  artState.ms = Math.round(performance.now() - t0); artState.done = true; progress(1);
}
