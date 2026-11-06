/* Define a term at its first use and keep pins local to the document. */

const registries = new WeakMap();
const trays = new WeakMap();
let bubbleId = 0;

export function normalizeKey(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "").trim();
}

function termKey(element) {
  return normalizeKey(element.getAttribute("term") ?? element.textContent ?? "");
}

export function registryFor(doc) {
  if (registries.has(doc)) return registries.get(doc);
  const definitions = new Map();
  const warned = new Set();
  const missing = new Set();
  const registry = {
    define(key, text, from) {
      const existing = definitions.get(key);
      if (!existing) definitions.set(key, { key, text, first: from });
      else if (existing.text !== text && !warned.has(key)) {
        warned.add(key);
        console.warn(`vc-term: conflicting definition for "${key}"; the first definition wins`);
      }
    },
    lookup(key) { return definitions.get(key) ?? null; },
    warnMissing(key) {
      if (missing.has(key)) return;
      missing.add(key);
      console.warn(`vc-term: no definition for "${key}"`);
    },
  };
  registries.set(doc, registry);
  for (const element of doc.querySelectorAll("vc-term[def], dl > dt")) {
    if (element.localName === "vc-term") {
      registry.define(termKey(element), element.getAttribute("def"), element);
    } else {
      const definition = element.nextElementSibling;
      if (definition?.localName === "dd") {
        registry.define(normalizeKey(element.textContent ?? ""), definition.textContent ?? "", element);
      }
    }
  }
  return registry;
}

export function trayFor(doc) {
  if (trays.has(doc)) return trays.get(doc);
  const entries = new Map();
  const listeners = new Set();
  let tray;
  let list;
  let status;
  function ensureTray() {
    if (tray) return;
    tray = doc.createElement("aside");
    tray.className = "vc-pins";
    tray.setAttribute("aria-label", "Pinned terms");
    list = doc.createElement("dl");
    tray.append(list);
    status = doc.createElement("div");
    status.className = "vc-pins-status";
    status.setAttribute("role", "status");
    doc.body.append(tray, status);
  }
  function notify(key) { for (const listener of listeners) listener(key); }
  const api = {
    has(key) { return entries.has(key); },
    pin(def) {
      if (entries.has(def.key)) return;
      ensureTray();
      const row = doc.createElement("div");
      const title = doc.createElement("dt");
      title.textContent = def.first.textContent;
      const description = doc.createElement("dd");
      description.textContent = def.text;
      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "vc-pin-x";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Unpin ${title.textContent}`);
      remove.addEventListener("click", () => api.unpin(def.key));
      row.append(title, description, remove);
      list.append(row);
      entries.set(def.key, { row, title: title.textContent });
      tray.hidden = false;
      status.textContent = `${title.textContent} pinned`;
      notify(def.key);
    },
    unpin(key) {
      const entry = entries.get(key);
      if (!entry) return;
      entry.row.remove();
      entries.delete(key);
      tray.hidden = entries.size === 0;
      status.textContent = `${entry.title} unpinned`;
      notify(key);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  trays.set(doc, api);
  return api;
}

export class VcTerm extends HTMLElement {
  connectedCallback() {
    if (this._connect) {
      this._connect();
      return;
    }
    const doc = this.ownerDocument;
    const key = termKey(this);
    const registry = registryFor(doc);
    if (this.hasAttribute("def")) registry.define(key, this.getAttribute("def"), this);
    const definition = registry.lookup(key);
    if (!definition || !definition.text.trim()) {
      this.setAttribute("data-unresolved", "");
      registry.warnMissing(key);
      this._connect = () => {};
      return;
    }
    const label = this.textContent;
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "vc-term-btn";
    button.textContent = label;
    const bubble = doc.createElement("div");
    bubble.className = "vc-term-bubble";
    bubble.setAttribute("id", `vc-term-bubble-${++bubbleId}`);
    bubble.setAttribute("popover", "manual");
    bubble.setAttribute("role", "tooltip");
    bubble.textContent = definition.text;
    button.setAttribute("aria-describedby", bubble.id);
    this.textContent = "";
    this.append(button);
    this.setAttribute("data-ready", "");
    const tray = trayFor(doc);
    let open = false;
    let pointer = false;
    let overBubble = false;
    let focused = false;
    let dismissed = false;
    let timer;
    let touch = false;
    const show = () => {
      if (dismissed || open || typeof bubble.showPopover !== "function") return;
      bubble.showPopover();
      open = true;
      const rect = button.getBoundingClientRect();
      const bounds = bubble.getBoundingClientRect();
      const view = doc.defaultView;
      const left = Math.max(8, Math.min(rect.left, view.innerWidth - bounds.width - 8));
      const top = Math.max(8, Math.min(rect.bottom + 8, view.innerHeight - bounds.height - 8));
      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
    };
    const hide = () => {
      clearTimeout(timer);
      if (open) bubble.hidePopover();
      open = false;
    };
    const scheduleHide = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!pointer && !overBubble && !focused) hide(); }, 120);
    };
    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      pointer = true;
      dismissed = false;
      clearTimeout(timer);
      show();
    });
    button.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "touch") return;
      pointer = false;
      scheduleHide();
    });
    button.addEventListener("pointerdown", (event) => { touch = event.pointerType === "touch"; });
    bubble.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      overBubble = true;
      clearTimeout(timer);
    });
    bubble.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "touch") return;
      overBubble = false;
      scheduleHide();
    });
    button.addEventListener("focusin", () => {
      focused = true;
      if (!touch) { dismissed = false; show(); }
    });
    button.addEventListener("focusout", () => { focused = false; scheduleHide(); });
    button.addEventListener("click", () => {
      if (tray.has(key)) tray.unpin(key);
      else tray.pin(definition);
    });
    const onKey = (event) => {
      if (event.key === "Tab") touch = false;
      if (event.key === "Escape") { dismissed = true; hide(); }
    };
    const onOutside = (event) => {
      if (!this.contains(event.target) && !bubble.contains(event.target)) { dismissed = true; hide(); }
    };
    const update = (changed) => {
      if (changed === key) button.setAttribute("aria-pressed", String(tray.has(key)));
    };
    let unsubscribe;
    this._connect = () => {
      doc.body.append(bubble);
      update(key);
      unsubscribe = tray.onChange(update);
      doc.addEventListener("keydown", onKey);
      doc.addEventListener("pointerdown", onOutside);
    };
    this._disconnect = () => {
      hide();
      bubble.remove();
      unsubscribe();
      doc.removeEventListener("keydown", onKey);
      doc.removeEventListener("pointerdown", onOutside);
    };
    this._connect();
  }

  disconnectedCallback() {
    this._disconnect?.();
  }
}
