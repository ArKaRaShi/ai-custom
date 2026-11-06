/* A document can have several contents lists, but only the first rail owns digit keys. */
const rails = new WeakMap();

/** Collect navigable headings in document order, assigning stable IDs where needed. */
export function collectHeadings(root, depth) {
  const headings = [];
  for (const element of root.querySelectorAll(depth === 3 ? "h2, h3" : "h2")) {
    if (element.closest("vc-contents, vc-tab, [hidden], details:not([open])")) continue;
    const text = element.textContent.trim();
    if (!element.id) {
      const slug = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section";
      const base = `vc-h-${headings.length + 1}-${slug}`;
      let id = base;
      let suffix = 2;
      while (element.ownerDocument.getElementById(id)) id = `${base}-${suffix++}`;
      element.id = id;
    }
    headings.push({ id: element.id, text, level: element.tagName === "H3" ? 3 : 2, element });
  }
  return headings;
}

/** Return the last heading above the reading line, or the last heading at the bottom. */
export function currentHeading(tops, line, atBottom) {
  if (!tops.length) return -1;
  if (atBottom) return tops.length - 1;
  let index = 0;
  tops.forEach((top, i) => { if (top <= line) index = i; });
  return index;
}

export class VcContents extends HTMLElement {
  #cleanup = null;

  connectedCallback() {
    if (this.#cleanup) return;
    const doc = this.ownerDocument;
    const win = doc.defaultView;
    const rail = this.getAttribute("variant") === "rail";
    let nav = this.querySelector(":scope > nav");
    if (!nav) {
      const scope = this.closest(".vc-main, .vc-page-body, main, body") || doc.body;
      const headings = collectHeadings(scope, this.getAttribute("depth") === "3" ? 3 : 2);
      nav = doc.createElement("nav");
      nav.setAttribute("aria-label", "Contents");
      const list = doc.createElement("ol");
      nav.append(list);
      let parentItem = null;
      let nested = null;
      headings.forEach((heading, index) => {
        const item = doc.createElement("li");
        const link = doc.createElement("a");
        link.setAttribute("href", `#${encodeURIComponent(heading.id)}`);
        const number = doc.createElement("span");
        number.className = "vc-contents-num";
        number.textContent = String(index + 1);
        const name = doc.createElement("span");
        name.className = "vc-contents-name";
        number.setAttribute("aria-hidden", "true");
        name.textContent = heading.text;
        link.append(number, name);
        item.append(link);
        if (heading.level === 3 && parentItem) {
          if (!nested) {
            nested = doc.createElement("ol");
            parentItem.append(nested);
          }
          nested.append(item);
        } else {
          list.append(item);
          parentItem = item;
          nested = null;
        }
      });
      this.append(nav);
    }

    const entries = Array.from(nav.querySelectorAll('a[href^="#"]')).flatMap((link) => {
      let id;
      try { id = decodeURIComponent(link.getAttribute("href").slice(1)); } catch { return []; }
      const target = id && doc.getElementById(id);
      return target ? [{ link, target }] : [];
    });
    const mark = () => {
      const index = currentHeading(entries.map(({ target }) => target.getBoundingClientRect().top), 120,
        win.innerHeight + win.scrollY >= doc.documentElement.scrollHeight - 2);
      entries.forEach(({ link }, i) => {
        if (i === index) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    };
    let frame = null;
    const scroll = () => {
      if (frame !== null) return;
      frame = win.requestAnimationFrame(() => { frame = null; mark(); });
    };
    win.addEventListener("scroll", scroll, { passive: true });
    const clearNear = () => entries.forEach(({ link }) => { delete link.dataset.distance; });
    const handlers = [];
    if (rail) {
      let owners = rails.get(doc);
      if (!owners) { owners = new Set(); rails.set(doc, owners); }
      owners.add(this);
      entries.forEach(({ link }, index) => {
        const near = () => entries.forEach(({ link: other }, i) => { other.dataset.distance = String(Math.min(Math.abs(i - index), 3)); });
        const pointer = (event) => { if (event.pointerType !== "touch") near(); };
        link.addEventListener("pointerenter", pointer);
        link.addEventListener("focus", near);
        link.addEventListener("blur", clearNear);
        handlers.push(() => {
          link.removeEventListener("pointerenter", pointer);
          link.removeEventListener("focus", near);
          link.removeEventListener("blur", clearNear);
        });
      });
      nav.addEventListener("pointerleave", clearNear);
      const keydown = (event) => {
        if (owners.values().next().value !== this || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const target = event.target;
        if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || "")) return;
        if (!/^[1-9]$/.test(event.key)) return;
        const entry = entries[Number(event.key) - 1];
        if (!entry) return;
        event.preventDefault();
        entry.target.scrollIntoView();
        entry.link.focus({ preventScroll: true });
      };
      doc.addEventListener("keydown", keydown);
      handlers.push(() => { owners.delete(this); doc.removeEventListener("keydown", keydown); nav.removeEventListener("pointerleave", clearNear); clearNear(); });
    }
    this.dataset.ready = "1";
    mark();
    this.#cleanup = () => {
      win.removeEventListener("scroll", scroll);
      if (frame !== null) win.cancelAnimationFrame(frame);
      handlers.forEach((cleanup) => cleanup());
    };
  }

  disconnectedCallback() {
    this.#cleanup?.();
    this.#cleanup = null;
  }
}
