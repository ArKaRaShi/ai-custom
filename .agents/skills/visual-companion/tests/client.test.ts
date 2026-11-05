import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const client = readFileSync(new URL("../assets/client.js", import.meta.url), "utf8");
const rail = readFileSync(new URL("../assets/state-rail.js", import.meta.url), "utf8");

test("rail previews without selecting, supports keyboard and mobile selection", () => {
  class Element {
    listeners: Record<string, (event: any) => void> = {};
    attrs: Record<string, string> = {};
    dataset: Record<string, string> = {};
    style: Record<string, string> = {};
    children: Element[] = [];
    hidden = false; textContent = ""; value = ""; offsetHeight = 160; tagName = "BUTTON";
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
    getAttribute(key: string) { return this.attrs[key]; }
    addEventListener(key: string, fn: (event: any) => void) { this.listeners[key] = fn; }
    append(...children: Element[]) { this.children.push(...children); }
    getBoundingClientRect() { return { top: 200, height: 24 }; }
    contains(element: Element) { return buttons.includes(element); }
    focus() { document.activeElement = this; this.listeners.focus?.({}); }
  }
  class Select extends Element {}
  const buttons = [0, 1].map((i) => { const b = new Element(); b.textContent = `State ${i}`; return b; });
  const frames = [0, 1].map((i) => { const f = new Element(); f.attrs.src = `/files/${i}.html`; f.hidden = i !== 0; return f; });
  const select = new Select();
  const container = new Element() as Element & { querySelectorAll: () => Element[] };
  container.querySelectorAll = () => buttons;
  const document = {
    activeElement: null as Element | null,
    querySelector: (query: string) => query === '.vc-rail' ? container : select,
    querySelectorAll: () => frames,
    createElement: () => new Element(),
    addEventListener: (_: string, fn: (event: any) => void) => { documentKeydown = fn; },
  };
  let documentKeydown: (event: any) => void = () => {};
  runInNewContext(rail, { document, HTMLSelectElement: Select, innerHeight: 800 });
  buttons[1]!.listeners.pointerenter!({ pointerType: 'mouse' });
  const card = container.children[0]!;
  expect(card.hidden).toBe(false);
  expect(card.children[0]!.textContent).toBe('State 1');
  expect(card.children[1]!.children[0]!.attrs.sandbox).toBe('allow-same-origin');
  expect(frames.map((f) => f.hidden)).toEqual([false, true]);
  buttons[0]!.focus();
  buttons[0]!.listeners.keydown!({ key: 'ArrowDown', preventDefault() {} });
  expect(document.activeElement).toBe(buttons[1]);
  expect(frames.map((f) => f.hidden)).toEqual([false, true]);
  buttons[1]!.listeners.click!({});
  expect(frames.map((f) => f.hidden)).toEqual([true, false]);
  expect(buttons[1]!.attrs['aria-pressed']).toBe('true');
  select.value = '0'; select.listeners.change!({});
  expect(frames.map((f) => f.hidden)).toEqual([false, true]);
  documentKeydown({ key: '2', target: buttons[0], preventDefault() {} });
  expect(select.value).toBe('1');
  container.listeners.focusout!({ relatedTarget: null });
  expect(card.hidden).toBe(true);
});

test("empty screen reports connection changes without covering the header", () => {
  const dot = { dataset: {} as Record<string, string> };
  const status = { textContent: "Connecting…" };
  const copy = { textContent: "" };
  const overlay = { className: "", hidden: false, textContent: "", style: { cssText: "", display: "" } };
  const sockets: FakeSocket[] = [];
  const timers: (() => void)[] = [];
  class FakeSocket {
    static OPEN = 1;
    listeners: Record<string, () => void> = {};
    constructor() { sockets.push(this); }
    addEventListener(name: string, callback: () => void) { this.listeners[name] = callback; }
  }
  const document = {
    querySelector: (selector: string) => ({ "[data-vc-dot]": dot, "[data-vc-status]": status, "[data-vc-empty-copy]": copy })[selector],
    createElement: () => overlay,
    addEventListener: () => {},
    body: { append: () => {} },
  };
  runInNewContext(client, { document, location: { protocol: "http:", host: "localhost" }, WebSocket: FakeSocket, setTimeout: (fn: () => void) => timers.push(fn), clearTimeout: () => {} });
  expect(status.textContent).toBe("Connecting…");
  sockets[0]!.listeners.open!();
  expect(status.textContent).toBe("Connected");
  sockets[0]!.listeners.close!();
  expect(status.textContent).toBe("Reconnecting…");
  expect(copy.textContent).toContain("connection was lost");
  expect(overlay.hidden).toBe(true);
  timers[0]!();
  sockets[1]!.listeners.open!();
  expect(status.textContent).toBe("Connected");
  expect(copy.textContent).toContain("appear here automatically");
});

test("plain pages show a full-screen connection warning and hide it on reconnect", () => {
  const overlay = { className: "", hidden: false, textContent: "", style: { cssText: "", display: "" } };
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    static OPEN = 1;
    listeners: Record<string, () => void> = {};
    constructor() { sockets.push(this); }
    addEventListener(name: string, callback: () => void) { this.listeners[name] = callback; }
  }
  const document = {
    querySelector: () => null,
    createElement: () => overlay,
    addEventListener: () => {},
    body: { append: () => {} },
  };
  runInNewContext(client, { document, location: { protocol: "http:", host: "localhost" }, WebSocket: FakeSocket, setTimeout: () => 0, clearTimeout: () => {} });
  expect(overlay.hidden).toBe(true);
  sockets[0]!.listeners.close!();
  expect(overlay.hidden).toBe(false);
  expect(overlay.style.cssText).toContain("position: fixed");
  expect(overlay.style.display).toBe("grid");
  sockets[0]!.listeners.open!();
  expect(overlay.hidden).toBe(true);
  expect(overlay.style.display).toBe("none");
});
