// The loading bar, and the gate in front of every match: a match whose factions' art has not come yet shows the bar until it has,
// then starts. Used by src/boot.ts for the first load and by src/main.ts before a match.
import { artFor, artHas, artState, rememberFactions, ART_FILES } from './artfiles';

let bar: HTMLElement | null = null;
function showBar(f: number) {
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'artLoad';
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Loading the models and paint');
    bar.style.cssText = 'position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#14110d;color:#e9dcc0;font:600 18px "Barlow Condensed",sans-serif;letter-spacing:.08em;text-transform:uppercase';
    bar.innerHTML = '<div style="font:44px Anton,Impact,sans-serif;letter-spacing:.04em">ORE ELSE</div><div id="artLoadT">Loading models and paint 0%</div><div style="width:min(420px,80vw);height:10px;border:2px solid #e9dcc0;border-radius:6px;overflow:hidden"><i id="artLoadI" style="display:block;height:100%;width:0;background:#f2b33a"></i></div>';
    document.body.appendChild(bar);
  }
  const p = Math.round(f * 100);
  (bar.querySelector('#artLoadI') as HTMLElement).style.width = p + '%'; (bar.querySelector('#artLoadT') as HTMLElement).textContent = 'Loading models and paint ' + p + '%';
}
export function hideBar() {
  bar?.remove(); bar = null;
  if (artState.missing.length) console.warn('Ore Else: these art files did not load, their bodies use the plain built-in shapes:', artState.missing.join(', '));
}
/** The first load: the art for `facs` with the bar up. */
export const firstLoad = (load: (progress: (f: number) => void) => Promise<void>) => load(ART_FILES.length ? showBar : () => {});

/** True when the art for these factions is here, and the match can start now. Otherwise puts the bar up, fetches it, and calls `later`
 *  when it has come; `later` should make its match again, since bodies made before the art came are code-built. */
export function artGate(facs: number[], later: () => void): boolean {
  rememberFactions(facs);
  if (artHas(facs)) return true;
  showBar(0); artFor(facs, showBar).then(() => { hideBar(); later(); });
  return false;
}
/** Starts fetching these factions' art in the background (a side picked in the menu, a lobby joined), with no bar. */
export function artSoon(facs: number[], then?: () => void) { if (!artHas(facs)) artFor(facs).then(() => then?.()); }
