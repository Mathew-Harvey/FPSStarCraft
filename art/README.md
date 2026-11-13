# Art files: what the game loads and how

The sculpted figures and buildings are made by the Python scripts in this folder (see the `ore-else-sculpted-models` project note for
the Blender setup) and saved to `assets/mesh/`. This page is the hand-off between the art scripts and the renderer (`src/meshes.ts`,
`src/artfiles.ts`, `build.mjs`).

## Files per kind, all in `assets/mesh/` (one flat folder)

| File | What it is | Size guide |
| --- | --- | --- |
| `<kind>.bin` | Near model, the full sculpt, drawn under about 40 m | about 18k triangles a man-sized figure |
| `<kind>.mid.bin` | Middle model, drawn from about 40 to 120 m | about 4k triangles; a building about a quarter of near |
| `<kind>.far.bin` | Command-view model, drawn past 120 m and in the command view | about 600 triangles; a building about 1k |
| `<kind>.webp` | A figure's painted picture (`art/kit/bake.py`) | 768 to 1536 px square |
| `<kind>.wear.webp` | A building's wear picture laid over its skins | |
| `<kind>.top.webp` | Optional: the kind seen straight down, for the full map | 128 px square |

Rules:

- `.mid.bin` and `.far.bin` use the same binary format as `.bin`, the same named groups with the same pivots (body, head, armL, armR,
  legL, legR, halo, pack, Gloam legs `lg0L`...), so poses, rest stances and hit flinches work on every level. They use the same UV
  layout, so all three wear the same `<kind>.webp` or `<kind>.wear.webp`.
- Do not bake side colour into the far model. The renderer tints top faces and roofs with the side colour at far zoom.
- `<kind>.top.webp`: seen straight down, the kind's forward (+z) pointing up the image, origin at the centre, the square spanning
  2.1 times the near model's widest horizontal reach from the origin, transparent background, no outline (the renderer adds ink and
  the side ring).
- Missing levels are made for you: `art/kit/lod.py <kind>` decimates `.bin` into `.mid.bin` and `.far.bin` keeping groups and UVs, and
  the game renders a top picture from the far model at start. A level you supply wins; a lower-detail rebuild from the cached field
  (`Figure(detail=...)`) looks better than decimation.
- A kind with a different shape in another state (a dug-in Gloam, a sieged walker) is its own kind: `<kind>dug.bin` and so on.

## How the page gets them

- `npm run build` writes three pages. `dist/index.html` carries every file inside it as base64 so it opens from disk; the tests and
  tools open this one. `dist/fragment.html` (the published page) and `dist/play.html` (the same as a whole document) carry none: the
  build copies the files to `dist/art/` and the page fetches them at start with a progress bar (`src/boot.ts`), keeps them in the
  browser's Cache Storage, and builds the code-made body for any kind whose file does not come.
- In `dist/art/` a model is named `<kind>.wasm`, not `.bin`: the artifact service only serves standard web media types and answers
  `.bin` with 415. The bytes are the deflated model, not WebAssembly.
- `INLINE=1 npm run build` puts the art inside every page (no `dist/art/`).
- Publishing: publish `dist/fragment.html` with every file of `dist/art/` in `files`, each at `art/<name>`.
- The match server and the Node tests carry no art and use the code-built bodies in `src/units.ts`, `src/models.ts` and
  `src/gloam-art.ts`. Keep one for every new kind.

## Budget

The published page is about 1.5 MB without art (cap 16 MB, target under 8 MB). Each art file can be up to 15 MB. One publish sends at most 255
files and a version holds up to 511, so the full roster (about 70 kinds, three models and one or two pictures each, about 300 files)
fits, but goes up in two publishes to the same artifact.
