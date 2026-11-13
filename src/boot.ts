// The page's entry. It fetches the art files that sit beside a published page (src/artfiles.ts) with a bar showing how much has come,
// then starts the game (src/main.ts). esbuild keeps main.ts and everything it pulls in unrun until the import below, so no model is
// asked for before its bytes are here. A page with the art inside it (INLINE=1) has no files to fetch and starts at once.
import { loadArt, artState, ART_FILES } from './artfiles';

(window as any).__oreArt = artState;
let bar: HTMLElement | null = null;
if (ART_FILES.length) {
  bar = document.createElement('div'); bar.id = 'artLoad';
  bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Loading the models and paint');
  bar.style.cssText = 'position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#14110d;color:#e9dcc0;font:600 18px "Barlow Condensed",sans-serif;letter-spacing:.08em;text-transform:uppercase';
  bar.innerHTML = '<div style="font:44px Anton,Impact,sans-serif;letter-spacing:.04em">ORE ELSE</div><div id="artLoadT">Loading models and paint 0%</div><div style="width:min(420px,80vw);height:10px;border:2px solid #e9dcc0;border-radius:6px;overflow:hidden"><i id="artLoadI" style="display:block;height:100%;width:0;background:#f2b33a"></i></div>';
  document.body.appendChild(bar);
}
const show = (f: number) => {
  if (!bar) return; const p = Math.round(f * 100);
  (bar.querySelector('#artLoadI') as HTMLElement).style.width = p + '%'; (bar.querySelector('#artLoadT') as HTMLElement).textContent = 'Loading models and paint ' + p + '%';
};
loadArt(show).then(() => import('./main')).then(() => { bar?.remove(); if (artState.missing.length) console.warn('Ore Else: these art files did not load, their bodies use the plain built-in shapes:', artState.missing.join(', ')); });
