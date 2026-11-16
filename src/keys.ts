// Key bindings. There are two sets: one for first person and one for the command view, and the one in use switches with the view.
// The command view set follows the standard keys of the classic real-time strategy games (A attack, S stop, H hold, P patrol, Ctrl and a
// number for a group, F1 for an idle worker, Space for the last alert, Backspace for the next base), so a player who already has those in
// their fingers can play from above at speed. Every binding can be changed in Options, and is saved with the rest of the settings.

/** One binding: what it is for (`id`), the words on the Options button, the key it starts on, and which heading it goes under. */
export interface Bind { id: string; label: string; def: string; grp: string }

/** First person. The id of each is the key it starts on (older saves store them that way). */
export const FP_BINDS: Bind[] = ([
  ['KeyW', 'Forward'], ['KeyS', 'Back'], ['KeyA', 'Left'], ['KeyD', 'Right'], ['ShiftLeft', 'Sprint'], ['Space', 'Dash'], ['Tab', 'Jump wheel'], ['KeyF', 'Jump to target'],
  ['KeyQ', 'Last body'], ['KeyE', 'Use or train'], ['KeyR', 'Reload or rotate'], ['KeyC', 'Grenade or ability'], ['Digit1', 'Drill'], ['Digit2', 'Build'],
  ['KeyG', 'Quartermaster or raid'], ['KeyZ', 'Yes to the squad'], ['KeyX', 'Hold'], ['KeyV', 'Follow me'], ['KeyH', 'Send a scout'], ['KeyB', 'Ping'],
  ['KeyN', 'Command view'], ['KeyM', 'Map'], ['F1', 'Idle worker (from above)'], ['F2', 'Whole army (from above)'], ['Enter', 'Chat'],
] as [string, string][]).map(([id, label]) => ({ id, label, def: id, grp: 'First person' }));

const CMD_LIST: [string, string, string, string][] = [
  // the orders on the card
  ['attack', 'Attack (fight on the way)', 'KeyA', 'Orders'], ['move', 'Move (no fighting)', 'KeyM', 'Orders'], ['stop', 'Stop', 'KeyS', 'Orders'],
  ['hold', 'Hold position', 'KeyH', 'Orders'], ['patrol', 'Patrol', 'KeyP', 'Orders'], ['gather', 'Gather', 'KeyG', 'Orders'],
  ['release', 'Return cargo or back to squad', 'KeyC', 'Orders'], ['build', 'Build menu', 'KeyB', 'Orders'], ['board', 'Get in a carrier', 'KeyL', 'Orders'],
  ['unload', 'Unload all', 'KeyD', 'Orders'], ['jump', 'Jump into the first picked', 'KeyF', 'Orders'], ['rally', 'Rally point', 'KeyR', 'Orders'],
  ['cancel', 'Cancel last in the queue', 'Delete', 'Orders'],
  // picking and the camera
  ['idle', 'Idle worker (Ctrl: every idle worker)', 'F1', 'Picking and camera'], ['army', 'Whole army', 'F2', 'Picking and camera'],
  ['sub', 'Next kind in the group', 'Tab', 'Picking and camera'], ['alert', 'Last alert', 'Space', 'Picking and camera'], ['base', 'Next base', 'Backspace', 'Picking and camera'],
  ['cam1', 'Camera spot 1 (Ctrl: save)', 'F5', 'Picking and camera'], ['cam2', 'Camera spot 2 (Ctrl: save)', 'F6', 'Picking and camera'],
  ['cam3', 'Camera spot 3 (Ctrl: save)', 'F7', 'Picking and camera'], ['cam4', 'Camera spot 4 (Ctrl: save)', 'F8', 'Picking and camera'],
  ['panU', 'Pan up', 'ArrowUp', 'Picking and camera'], ['panD', 'Pan down', 'ArrowDown', 'Picking and camera'], ['panL', 'Pan left', 'ArrowLeft', 'Picking and camera'], ['panR', 'Pan right', 'ArrowRight', 'Picking and camera'],
  ['map', 'Whole map', 'Backquote', 'Picking and camera'], ['fp', 'Back to first person', 'KeyN', 'Picking and camera'], ['qm', 'Quartermaster on or off', 'KeyQ', 'Picking and camera'],
  ['scout', 'Send a scout', 'F3', 'Picking and camera'], ['yes', 'Yes to the squad\'s plan', 'F4', 'Picking and camera'],
  // control groups: Ctrl keeps, Shift adds, pressed twice the camera goes there
  ...Array.from({ length: 10 }, (_, i) => [`g${(i + 1) % 10}`, `Group ${(i + 1) % 10} (Ctrl: keep, Shift: add)`, `Digit${(i + 1) % 10}`, 'Control groups'] as [string, string, string, string]),
];
/** The command view. */
export const CMD_BINDS: Bind[] = CMD_LIST.map(([id, label, def, grp]) => ({ id, label, def, grp }));
const CMD_DEF: Record<string, string> = Object.fromEntries(CMD_BINDS.map(b => [b.id, b.def]));

/** How the train, research, ability and build buttons get their keys: from the first free letter of their names (the classic standard),
 *  or by where they sit on the card, five across and three down (Q W E R T, A S D F G, Z X C V B). */
export type Layout = 'name' | 'grid';
/** The keys in use: only the ones changed from where they start are kept. */
export const KB = { fp: {} as Record<string, string>, cmd: {} as Record<string, string>, layout: 'name' as Layout };

/** The key an action of the command view is on now. */
export const ck = (id: string) => KB.cmd[id] || CMD_DEF[id] || '';
/** The key a first-person action is on now. */
export const fk = (id: string) => KB.fp[id] || id;
/** Every key the command view gives to something other than the card, so a button's letter never lands on one of them. */
export function cmdTaken(): Set<string> { const s = new Set<string>(); for (const b of CMD_BINDS) if (b.grp !== 'Orders') s.add(ck(b.id)); return s; }
/** Whether a key is bound to anything in the command view set. */
export function cmdBound(code: string) { for (const b of CMD_BINDS) if (ck(b.id) === code) return true; return false; }

/** The card in grid order, then three more for a long card. */
export const GRID = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'Comma', 'Period', 'Slash', 'KeyY', 'KeyU'];
/** Where a name runs out of free letters: the rest of the letters, then a few marks. */
const SPARE = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyJ', 'KeyK', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyL', 'KeyB', 'KeyN', 'KeyM', 'KeyP', 'Comma', 'Period', 'Slash', 'Semicolon', 'Quote', 'BracketLeft', 'BracketRight'];

/** Gives a key to every button on a card that has none. Buttons that already have one (the fixed orders) keep it. `name` is the words the
 *  letter is taken from. In the grid layout every button, fixed or not, takes the key of its place. */
export function fillKeys<T extends { key: string }>(btns: T[], name: (b: T) => string) {
  if (KB.layout === 'grid') { btns.forEach((b, i) => { b.key = GRID[i] || ''; }); return; }
  const used = cmdTaken(); for (const b of btns) if (b.key) used.add(b.key);
  for (const b of btns) {
    if (b.key) continue;
    let got = '';
    for (const ch of name(b).toUpperCase()) { if (ch < 'A' || ch > 'Z') continue; const c = 'Key' + ch; if (!used.has(c)) { got = c; break; } }
    if (!got) got = SPARE.find(c => !used.has(c)) || '';
    b.key = got; if (got) used.add(got);
  }
}

/** Gives `code` to `id` in one set. A key can only do one thing in a set: whatever had it takes the key `id` had before. */
export function rebind(set: 'fp' | 'cmd', id: string, code: string) {
  const list = set === 'fp' ? FP_BINDS : CMD_BINDS, map = KB[set], key = (x: string) => set === 'fp' ? fk(x) : ck(x), def = (x: string) => list.find(b => b.id === x)!.def;
  const was = key(id), other = list.find(b => b.id !== id && key(b.id) === code);
  if (other) { if (was === other.def) delete map[other.id]; else map[other.id] = was; }
  if (code === def(id)) delete map[id]; else map[id] = code;
}
/** Reads saved bindings, keeping only ones for actions that still exist. */
export function loadKeys(fp: any, cmd: any, layout: any) {
  if (fp && typeof fp === 'object') for (const b of FP_BINDS) if (typeof fp[b.id] === 'string' && fp[b.id] !== b.def) KB.fp[b.id] = fp[b.id];
  if (cmd && typeof cmd === 'object') for (const b of CMD_BINDS) if (typeof cmd[b.id] === 'string' && cmd[b.id] !== b.def) KB.cmd[b.id] = cmd[b.id];
  if (layout === 'grid' || layout === 'name') KB.layout = layout;
}
/** A first-person key as the game reads it: the action it is bound to, 'Unbound' for a key moved elsewhere, or the key itself. */
export function logical(code: string) { for (const a in KB.fp) if (KB.fp[a] === code) return a; return KB.fp[code] ? 'Unbound' : code; }
/** A key as a player reads it. */
export const keyText = (code: string) => code.replace(/^Key|^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'R Shift').replace('ControlLeft', 'Ctrl').replace('ControlRight', 'R Ctrl')
  .replace('AltLeft', 'Alt').replace(/^Arrow/, '').replace(/^Numpad/, 'Num ').replace('Backquote', '`').replace('Backspace', '⌫ Back').replace('Delete', 'Del').replace('Comma', ',').replace('Period', '.').replace('Slash', '/');
/** A first-person key sent by a touch button or a controller while the command view is up, as the command view's key for the same thing
 *  ('' when that key means something else up there, such as H, which holds position from above). */
export function upKey(code: string): string {
  const m: Record<string, string> = { KeyM: 'map', KeyN: 'fp', F1: 'idle', F2: 'army', KeyG: 'qm', KeyW: 'panU', KeyS: 'panD', KeyA: 'panL', KeyD: 'panR', Backquote: 'idle' };
  return m[code] ? ck(m[code]) : /^(Mouse\d|pause|up|cbox|corder|say|tool|jump|wheel[-+])$/.test(code) ? code : '';
}
