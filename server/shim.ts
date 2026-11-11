// The match simulation is the same code the browser runs. On the server there is no page, so
// drawing surfaces, sound and the HUD are replaced with stand-ins that accept every call and do nothing.
const sink: any = new Proxy(function () { /* nothing */ }, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : sink), apply: () => sink, set: () => true });
const canvas = () => ({ width: 1, height: 1, style: {}, getContext: () => sink, addEventListener() { /* nothing */ }, toDataURL: () => '' });
(globalThis as any).document = { createElement: canvas, createElementNS: canvas, pointerLockElement: null, exitPointerLock() { /* nothing */ } };
(globalThis as any).window = globalThis;
export const noHud: any = new Proxy({}, { get: () => () => undefined });
export const noPipe = (): any => ({ time: 0, flash: 0, w: 1280, h: 720, setDusk() { /* nothing */ }, render() { /* nothing */ } });
