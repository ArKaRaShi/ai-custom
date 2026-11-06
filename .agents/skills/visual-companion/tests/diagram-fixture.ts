/*
 * The vc-diagram test seam: the element running in the fake DOM. Nodes answer
 * getBoundingClientRect with a rect a test assigns, standing in for the browser's layout.
 */
import "./globals";
import { VcDiagram } from "../assets/components/diagram.js";
import { FakeElement, FakeEvent } from "./dom";
import { instantiate } from "./globals";

export class Style {
  cssText = "";
  values = new Map<string, string>();
  left = "";
  top = "";
  setProperty(name: string, value: string): void { this.values.set(name, String(value)); }
}

export class Node extends FakeElement {
  style = new Style();
  hidden = false;
  rect = { left: 0, top: 0, width: 40, height: 20 };
  getBoundingClientRect() { return this.rect; }
  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (selector === "svg" && child.tagName === "svg") return child;
      if (selector === "svg.vc-diagram-edges" && child.tagName === "svg" && child.getAttribute("class") === "vc-diagram-edges") return child;
    }
    return null;
  }
  closest(selector: string): FakeElement | null {
    let current: FakeElement | null = this;
    while (current) {
      const isTerm = selector === "vc-term[data-node]" && current.tagName === "vc-term";
      const isNode = selector === "[data-node]";
      if ((isTerm || isNode) && current.hasAttribute("data-node")) return current;
      current = current.parent;
    }
    return null;
  }
  remove(): void {
    if (!this.parent) return;
    const siblings = this.parent.children;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parent = null;
  }
  removeEventListener(type: string, listener: (event: FakeEvent) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }
  override append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      if (node.parent) {
        const siblings = node.parent.children;
        siblings.splice(siblings.indexOf(node), 1);
      }
      super.append(node);
    }
  }
  replaceWith(node: FakeElement): void {
    if (!this.parent) return;
    const parent = this.parent;
    parent.children[parent.children.indexOf(this)] = node;
    node.parent = parent;
    this.parent = null;
  }
  override querySelectorAll(selector: string): FakeElement[] {
    if (!selector.startsWith("[")) return super.querySelectorAll(selector);
    const matches = selector.matchAll(/\[([\w-]+)\]/g);
    const attributes = Array.from(matches, (match) => match[1]);
    const found: FakeElement[] = [];
    const visit = (element: FakeElement): void => {
      for (const child of element.children) {
        if (attributes.every((name) => child.hasAttribute(name))) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

export function graphNode(id: string, label = id): Node {
  const element = new Node("g");
  element.setAttribute("data-node", id);
  element.textContent = label;
  return element;
}

export function graphEdge(from: string, to: string, kind?: string): Node {
  const element = new Node("path");
  element.setAttribute("data-from", from);
  element.setAttribute("data-to", to);
  if (kind) element.setAttribute("data-kind", kind);
  return element;
}

export class Tabs extends Node {
  index = 0;
  panels: { at: string | null; focus?: string[] }[] = [];
  constructor() { super("vc-tabs"); }
  select(index: number): void { this.index = index; this.dispatchEvent(new FakeEvent("vc-tab-change")); }
}

export class Observer {
  static instances: Observer[] = [];
  active = false;
  callback: () => void;
  constructor(callback: () => void) { this.callback = callback; Observer.instances.push(this); }
  observe(): void { this.active = true; }
  disconnect(): void { this.active = false; }
  static notify(): void { for (const observer of Observer.instances) if (observer.active) observer.callback(); }
}

export interface Harness {
  diagram: FakeElement & { connectedCallback(): void; disconnectedCallback(): void };
  ids: Map<string, FakeElement>;
  find(className: string): Node;
  anchor(id: string): Node;
  terms: Node[];
  doc: { dispatchEvent(event: FakeEvent): void };
  all(root: FakeElement): FakeElement[];
}

export function harness(): Harness {
  const ids = new Map<string, FakeElement>();
  const terms: Node[] = [];
  const listeners = new Map<string, ((event: FakeEvent) => void)[]>();
  const doc = {
    documentElement: new Node("html"), readyState: "complete",
    createElement: (tag: string) => new Node(tag),
    createElementNS: (_ns: string, tag: string) => new Node(tag),
    getElementById: (id: string) => ids.get(id) ?? null,
    querySelectorAll: (selector: string) => selector === "vc-term[data-node]" ? terms : [],
    addEventListener: (type: string, listener: (event: FakeEvent) => void) => {
      const entries = listeners.get(type) ?? [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    removeEventListener: (type: string, listener: (event: FakeEvent) => void) => {
      const entries = listeners.get(type) ?? [];
      const remaining = entries.filter((entry) => entry !== listener);
      listeners.set(type, remaining);
    },
    dispatchEvent: (event: FakeEvent) => {
      const entries = listeners.get(event.type) ?? [];
      for (const listener of entries) listener(event);
    },
  };
  Object.assign(globalThis, { document: doc, MutationObserver: Observer });
  const diagram = instantiate<FakeElement & { connectedCallback(): void; disconnectedCallback(): void }>({ "vc-diagram": VcDiagram }, "vc-diagram");
  const all = (root: FakeElement): FakeElement[] => [root, ...root.children.flatMap(all)];
  const find = (className: string): Node => all(diagram).find((node) => node.className === className) as Node;
  const anchor = (id: string): Node => all(diagram).find((node) => node.getAttribute("data-node") === id) as Node;
  return { diagram, ids, find, anchor, terms, doc, all };
}

/** Undo the globals a harness installs; call from afterEach. */
export function cleanup(): void {
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "MutationObserver");
  Reflect.deleteProperty(globalThis, "ResizeObserver");
  Observer.instances = [];
}

export function pathPoints(path: FakeElement): { x: number; y: number }[] {
  const d = path.getAttribute("d") ?? "";
  const matches = [...d.matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/g)];
  return matches.map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}
