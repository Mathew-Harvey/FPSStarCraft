import { setMap } from '../src/data';
import * as T from '../src/terrain';
const cnt = () => { let n = 0; for (let x = -150; x <= 300; x += 3) for (let z = -250; z <= 250; z += 3) if (T.h(x, z) > 1) n++; return n; };
setMap(0); console.log('normal', cnt()); (T.TERRAIN as any).noLedge = true; setMap(0); console.log('noLedge', cnt()); (T.TERRAIN as any).noLedge = false; (T.TERRAIN as any).noRing = true; setMap(0); console.log('noRing', cnt()); (T.TERRAIN as any).on = false; setMap(0); console.log('flat', cnt());
