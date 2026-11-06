import "./globals";
import { expect, test, spyOn } from "bun:test";
import { FakeElement, FakeEvent } from "./dom";
import { VcTerm, normalizeKey } from "../assets/components/term.js";

class Element extends FakeElement {
  style: Record<string, string> = {};
  hidden = false;
  opened = false;
  get localName(): string { return this.tagName; }
  get nextElementSibling(): FakeElement | null {
    if (!this.parent) return null;
    const index = this.parent.children.indexOf(this);
    return this.parent.children[index + 1] ?? null;
  }
  remove(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    this.parent.children.splice(index, 1);
    this.parent = null;
  }
  contains(target: FakeElement): boolean {
    return this === target || this.children.some((child) => child === target);
  }
  getBoundingClientRect(): { left: number; bottom: number; width: number; height: number } {
    return { left: 10, bottom: 20, width: 100, height: 30 };
  }
  showPopover(): void { this.opened = true; }
  hidePopover(): void { this.opened = false; }
}

type Listener = (event: FakeEvent) => void;
function fixture() {
  const body = new Element("body");
  const listeners = new Map<string, Set<Listener>>();
  const descendants = (root: FakeElement): FakeElement[] => {
    const result: FakeElement[] = [];
    for (const child of root.children) {
      result.push(child);
      result.push(...descendants(child));
    }
    return result;
  };
  const doc = {
    body,
    defaultView: { innerWidth: 800, innerHeight: 600 },
    createElement(tag: string): Element { return new Element(tag); },
    querySelectorAll(): FakeElement[] {
      const all = descendants(body);
      return all.filter((node) => node.tagName === "vc-term" && node.hasAttribute("def") || node.tagName === "dt" && node.parent?.tagName === "dl");
    },
    addEventListener(type: string, listener: Listener): void {
      const group = listeners.get(type) ?? new Set<Listener>();
      group.add(listener);
      listeners.set(type, group);
    },
    removeEventListener(type: string, listener: Listener): void { listeners.get(type)?.delete(listener); },
    dispatch(event: FakeEvent): void {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
    },
  };
  function term(text: string, attrs: Record<string, string> = {}): InstanceType<typeof VcTerm> & FakeElement {
    const node = new VcTerm("vc-term");
    Reflect.set(node, "ownerDocument", doc);
    Reflect.set(node, "localName", "vc-term");
    Reflect.set(node, "contains", (target: FakeElement) => target === node || node.children.includes(target));
    node.textContent = text;
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  }
  function find(className: string): Element {
    const all = descendants(body);
    const found = all.find((node) => node.className === className);
    if (!(found instanceof Element)) throw new Error(`Missing ${className}`);
    return found;
  }
  return { body, doc, term, find };
}

function event(type: string, props: Record<string, string> = {}): FakeEvent {
  const value = new FakeEvent(type);
  Object.assign(value, props);
  return value;
}

test("normalizes whitespace, case and trailing punctuation", () => {
  expect(normalizeKey("  Retry  STORM.; ")).toBe("retry storm");
});

test("first definition across a native glossary and inline terms wins across sections", () => {
  const f = fixture();
  const list = new Element("dl");
  const title = new Element("dt");
  title.textContent = "Retry storm";
  const description = new Element("dd");
  description.textContent = "Many clients retry at once";
  list.append(title, description);
  const later = f.term("RETRY STORM", { def: "Ignored" });
  const use = f.term("retry storms", { term: "retry storm" });
  const section = new Element("section");
  section.append(use);
  f.body.append(list, later, section);
  const warning = spyOn(console, "warn").mockImplementation(() => {});
  try {
    use.connectedCallback();
    later.connectedCallback();
    expect(f.find("vc-term-bubble").textContent).toBe("Many clients retry at once");
    expect(warning).toHaveBeenCalledTimes(1);
  } finally { warning.mockRestore(); }
});

test("unrecognized words remain text and warn once per key", () => {
  const f = fixture();
  const first = f.term("Unknown");
  const second = f.term("unknown.");
  f.body.append(first, second);
  const warning = spyOn(console, "warn").mockImplementation(() => {});
  try {
    first.connectedCallback();
    second.connectedCallback();
    expect(first.textContent).toBe("Unknown");
    expect(first.children).toHaveLength(0);
    expect(first.hasAttribute("data-unresolved")).toBe(true);
    expect(warning).toHaveBeenCalledTimes(1);
  } finally { warning.mockRestore(); }
});

test("pin and unpin synchronize repeated terms and announce changes", () => {
  const f = fixture();
  const first = f.term("Retry", { def: "Send again" });
  const second = f.term("retry");
  f.body.append(first, second);
  first.connectedCallback();
  second.connectedCallback();
  const firstButton = first.children[0];
  const secondButton = second.children[0];
  firstButton.click();
  expect(firstButton.getAttribute("aria-pressed")).toBe("true");
  expect(secondButton.getAttribute("aria-pressed")).toBe("true");
  const tray = f.find("vc-pins");
  expect(tray.hidden).toBe(false);
  expect(f.find("vc-pins-status").textContent).toBe("Retry pinned");
  f.find("vc-pin-x").click();
  expect(tray.hidden).toBe(true);
  expect(firstButton.getAttribute("aria-pressed")).toBe("false");
  expect(secondButton.getAttribute("aria-pressed")).toBe("false");
  expect(f.find("vc-pins-status").textContent).toBe("Retry unpinned");
});

test("focus previews; Escape and outside dismiss without unpinning; touch pins without preview", () => {
  const f = fixture();
  const node = f.term("Retry", { def: "Send again" });
  f.body.append(node);
  node.connectedCallback();
  const button = node.children[0];
  const bubble = f.find("vc-term-bubble");
  button.dispatchEvent(event("focusin"));
  expect(bubble.opened).toBe(true);
  button.click();
  f.doc.dispatch(event("keydown", { key: "Escape" }));
  expect(bubble.opened).toBe(false);
  expect(button.getAttribute("aria-pressed")).toBe("true");
  button.dispatchEvent(event("focusout"));
  button.dispatchEvent(event("pointerdown", { pointerType: "touch" }));
  button.dispatchEvent(event("pointerenter", { pointerType: "touch" }));
  button.dispatchEvent(event("focusin"));
  expect(bubble.opened).toBe(false);
  button.click();
  expect(button.getAttribute("aria-pressed")).toBe("false");
  button.dispatchEvent(event("pointerenter", { pointerType: "mouse" }));
  expect(bubble.opened).toBe(true);
  const outside = event("pointerdown");
  outside.target = f.body;
  f.doc.dispatch(outside);
  expect(bubble.opened).toBe(false);
});
