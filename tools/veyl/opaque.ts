// The bench's canvas is drawn opaque. Headless Chromium on SwiftShader keeps whatever alpha the last pass left in the frame and lets the page
// show through it, which washes every shot out to the page's pale background; a GPU browser shows the same frame solid.
const get = HTMLCanvasElement.prototype.getContext as any;
(HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, kind: string, opts?: any) { return get.call(this, kind, kind.startsWith('webgl') ? { ...(opts || {}), alpha: false } : opts); };
