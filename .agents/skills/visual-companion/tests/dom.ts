/*
 * A deliberately small DOM for testing the behaviour components.
 * It supports only what assets/components/ uses: attributes, children,
 * listeners, and a bubbling CustomEvent. No parsing, no rendering.
 */

export class FakeEvent {
  type: string;
  detail: unknown;
  bubbles: boolean;
  target: FakeElement | null = null;
  defaultPrevented = false;

  constructor(type: string, init: { detail?: unknown; bubbles?: boolean } = {}) {
    this.type = type;
    this.detail = init.detail;
    this.bubbles = init.bubbles ?? false;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

type Listener = (event: FakeEvent) => void;

export class FakeElement {
  readonly tagName: string;
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Listener[]>();
  parent: FakeElement | null = null;
  dataset: Record<string, string> = {};
  className = "";
  text = "";
  type = "";
  value = "";
  min = "";
  max = "";
  step = "";
  tabIndex = 0;
  disabled = false;
  style: Record<string, string> = {};
  open = false;

  constructor(tagName: string) {
    this.tagName = tagName.toLowerCase();
  }

  get id(): string {
    return this.getAttribute("id") ?? "";
  }

  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    for (const child of this.children) child.parent = null;
    this.children.length = 0;
    this.text = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes.has(name) ? this.attributes.get(name)! : null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  toggleAttribute(name: string, force: boolean): void {
    if (force) this.setAttribute(name, "");
    else this.removeAttribute(name);
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  appendChild(node: FakeElement): FakeElement {
    this.append(node);
    return node;
  }

  insertBefore(node: FakeElement, reference: FakeElement | null): FakeElement {
    const at = reference ? this.children.indexOf(reference) : this.children.length;
    const index = at < 0 ? this.children.length : at;
    node.parent = this;
    this.children.splice(index, 0, node);
    return node;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const name = selector.startsWith(":scope > ") ? selector.slice(9) : selector;
    return this.children.filter((child) => child.tagName === name.toLowerCase());
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  dispatchEvent(event: FakeEvent): boolean {
    let node: FakeElement | null = this;
    while (node) {
      event.target = event.target ?? this;
      for (const listener of node.listeners.get(event.type) ?? []) listener(event);
      node = event.bubbles ? node.parent : null;
    }
    return true;
  }

  focus(): void {}

  click(): void {
    this.dispatchEvent(new FakeEvent("click", { bubbles: true }));
  }
}

export interface FakeDom {
  document: {
    body: FakeElement;
    createElement(tag: string): FakeElement;
    getElementById(id: string): FakeElement | null;
    querySelectorAll(selector: string): FakeElement[];
    addEventListener(type: string, listener: Listener): void;
    dispatchEvent(event: FakeEvent): boolean;
  };
  root: FakeElement;
  connect(element: FakeElement): void;
  find(parent: FakeElement, predicate: (node: FakeElement) => boolean): FakeElement | undefined;
}

export function createDom(): FakeDom {
  const root = new FakeElement("body");
  const byId = new Map<string, FakeElement>();
  const documentListeners = new Map<string, Listener[]>();

  root.addEventListener = (type: string, listener: Listener) => {
    const list = documentListeners.get(type) ?? [];
    list.push(listener);
    documentListeners.set(type, list);
  };

  const document = {
    body: root,
    createElement: (tag: string) => new FakeElement(tag),
    getElementById: (id: string) => byId.get(id) ?? null,
    // The section index is out of scope here; an empty page keeps it inert.
    querySelectorAll: (_selector: string) => [] as FakeElement[],
    addEventListener: (type: string, listener: Listener) => {
      const list = documentListeners.get(type) ?? [];
      list.push(listener);
      documentListeners.set(type, list);
    },
    dispatchEvent: (event: FakeEvent) => {
      for (const listener of documentListeners.get(event.type) ?? []) listener(event);
      return true;
    },
  };

  return {
    document,
    root,
    connect(element: FakeElement) {
      const register = (node: FakeElement) => {
        const id = node.getAttribute("id");
        if (id) byId.set(id, node);
        for (const child of node.children) register(child);
      };
      register(element);
      const construct = element as FakeElement & { connectedCallback?: () => void };
      construct.connectedCallback?.();
    },
    find(parent: FakeElement, predicate: (node: FakeElement) => boolean) {
      return parent.children.find(predicate);
    },
  };
}
