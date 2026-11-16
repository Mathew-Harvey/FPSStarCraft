// The three sides' badges, drawn as inked SVG: a thick pen line, a flat fill, a hard drop shadow and a few hatch strokes,
// the same comic look as the rest of the screens. Used by the skirmish menu and the end screen.

const INK = '#0e0d14';

/** A gear's outline round (50, 50): n teeth, outer radius r1, root radius r0, with a little wobble so it reads as drawn. */
function gear(n: number, r0: number, r1: number) {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, w = Math.PI / n, j = (k: number) => 1 + Math.sin(i * 3.7 + k) * .015;
    for (const [da, r] of [[-w * .95, r0], [-w * .45, r1], [w * .45, r1], [w * .95, r0]] as [number, number][]) pts.push(`${(50 + Math.cos(a + da) * r * j(da)).toFixed(1)},${(50 + Math.sin(a + da) * r * j(da)).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

const IRONHOLD = `
  <path d="${gear(12, 37, 46)}" fill="#ffc21a"/>
  <circle cx="50" cy="50" r="30" fill="#2b2129"/>
  <path d="M27 50 L31 47 M33 66 L37 63 M64 70 L68 67 M70 41 L74 38" stroke="#4a3a40" stroke-width="2.4"/>
  <path d="M26 59 Q27 31 50 29 Q73 31 74 59 Z" fill="#ffc21a"/>
  <path d="M44 30.5 Q46 45 45 59 M56 30.5 Q54 45 55 59" stroke="${INK}" stroke-width="2.6" fill="none"/>
  <path d="M30 52 Q31 40 37 35" stroke="#fff3c4" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M15 59 L85 59 L82 68 Q50 72 18 68 Z" fill="#e0a20c"/>
  <circle cx="50" cy="45" r="5.5" fill="#fff3c4"/>`;

const VEYL = `
  <circle cx="50" cy="50" r="44" fill="#1d2433"/>
  <path d="M22 34 Q12 50 22 66 M14 28 Q1 50 14 72 M78 34 Q88 50 78 66 M86 28 Q99 50 86 72" stroke="#35e0c8" stroke-width="3.6" fill="none" stroke-linecap="round"/>
  <path d="M50 9 L68 38 L58 90 L42 90 L32 38 Z" fill="#35e0c8"/>
  <path d="M50 9 L50 90 M32 38 L50 46 L68 38 M42 90 L50 46 L58 90" stroke="${INK}" stroke-width="2.4" fill="none"/>
  <path d="M50 9 L32 38 L42 90 L50 46 Z" fill="#9ff7e8" opacity=".55"/>
  <path d="M38 40 L44 70" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/>`;

const GLOAM = `
  <circle cx="50" cy="50" r="44" fill="#231a2b"/>
  <path d="M40 56 Q37 74 35 88 Q50 93 65 88 Q63 74 60 56 Z" fill="#e9dcc0"/>
  <path d="M44 62 Q43 74 42 84 M55 62 Q56 74 57 84" stroke="#a3927a" stroke-width="2.2" fill="none"/>
  <path d="M10 58 Q12 18 50 15 Q88 18 90 58 Q70 64 50 63 Q30 64 10 58 Z" fill="#8e5bd6"/>
  <path d="M18 54 Q22 28 46 21" stroke="#c7a6f2" stroke-width="3.4" fill="none" stroke-linecap="round"/>
  <circle cx="34" cy="36" r="6" fill="#b8f58c"/><circle cx="58" cy="28" r="4.5" fill="#b8f58c"/><circle cx="70" cy="44" r="7" fill="#b8f58c"/><circle cx="48" cy="48" r="3.5" fill="#b8f58c"/>
  <circle cx="22" cy="78" r="2.6" fill="#b8f58c"/><circle cx="80" cy="74" r="3.2" fill="#b8f58c"/><circle cx="74" cy="86" r="2" fill="#b8f58c"/><circle cx="16" cy="66" r="1.8" fill="#b8f58c"/>`;

const BODY = [IRONHOLD, VEYL, GLOAM];

/** The badge of faction f (0 Ironhold, 1 Veyl, 2 Gloam) as SVG markup, drawn in a 100 x 100 box with its shadow. */
export function emblem(f: number, cls = 'emblem'): string {
  const body = BODY[f % 3];
  // The shadow is the same drawing flattened to ink and pushed down and right; the drawing on top gets a thick ink outline.
  return `<svg class="${cls}" viewBox="-6 -6 116 116" aria-hidden="true">
    <g transform="translate(4.5 4.5)" fill="${INK}" stroke="${INK}" stroke-width="7" stroke-linejoin="round">${body.replace(/fill="[^"]*"/g, `fill="${INK}"`).replace(/stroke="[^"]*"/g, `stroke="${INK}"`)}</g>
    <g stroke="${INK}" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${body}</g>
  </svg>`;
}
