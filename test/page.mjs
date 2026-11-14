// Serves dist/ over http for the browser tests, and gives the address of the page with every faction's art fetched before the game
// starts (play.html?art=all), so a test can start any match at once. A page opened from disk cannot fetch its art files.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPE = { html: 'text/html; charset=utf-8', js: 'text/javascript', webp: 'image/webp', wasm: 'application/wasm', json: 'application/json' };
let base = '';
/** Starts the server once per test process; it does not keep the process alive. */
export async function serveDist() {
  if (base) return base;
  const srv = createServer((req, res) => {
    const path = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'play.html', file = join(dist, path);
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPE[path.split('.').pop()] || 'application/octet-stream' }); res.end(readFileSync(file));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); srv.unref();
  return base = `http://127.0.0.1:${srv.address().port}/`;
}
/** The page with all the art, for a test that starts matches. */
export const testPage = async () => (await serveDist()) + 'play.html?art=all';

/** At most one picture per turn of the page. A test call that steps and draws many frames in one go never lets the browser show one,
 *  and the browser keeps every one of them until it does: the controls test's page climbed from 1 GB to 4 to 8 GB and was killed
 *  ("Target crashed"). The game itself draws once per animation frame, so this is the tests' own load, not a leak in the game.
 *  A frame skipped this way is drawn with the latest view as soon as the call ends, before any screenshot is taken.
 *  A test that reads the picture inside the same call sets `__ore.pipe.must = true` before the frame it reads, and that one is drawn. */
export const oneDrawPerTurn = p => p.evaluate(() => { const P = __ore.pipe; if (P.oneDraw) return; P.oneDraw = true; const real = P.draw.bind(P); let busy = false, late = null;
  P.draw = (...a) => { if (busy && !P.must) { late = a; return; } P.must = false; late = null; busy = true; real(...a); setTimeout(() => { busy = false; if (late) { const l = late; late = null; P.draw(...l); } }, 0); }; });
