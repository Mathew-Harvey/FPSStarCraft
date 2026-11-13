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
