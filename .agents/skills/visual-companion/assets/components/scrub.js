import { numberOr } from "./core.js";

/* ---------------- <vc-scrub for="tabsId" label="State"> ---------------- */

/* Moves the current position of an existing vc-tabs. A controller, never a container. */
export class VcScrub extends HTMLElement {
  #range = null;
  #status = null;
  #previous = null;
  #next = null;

  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";

    const name = this.getAttribute("label") || "State";

    const previous = document.createElement("button");
    previous.type = "button";
    previous.className = "vc-btn";
    previous.setAttribute("data-variant", "ghost");
    previous.textContent = "Previous";
    previous.addEventListener("click", () => this.#step(-1));

    const range = document.createElement("input");
    range.type = "range";
    range.className = "vc-scrub-range";
    range.min = "1";
    range.max = "1";
    range.step = "1";
    range.value = "1";
    range.setAttribute("aria-label", name);
    range.addEventListener("input", () => this.#select(Number(range.value) - 1));

    const next = document.createElement("button");
    next.type = "button";
    next.className = "vc-btn";
    next.setAttribute("data-variant", "ghost");
    next.textContent = "Next";
    next.addEventListener("click", () => this.#step(1));

    this.#previous = previous;
    this.#range = range;
    this.#status = document.createElement("p");
    this.#status.className = "vc-scrub-status";
    this.#next = next;
    this.append(previous, range, this.#status, next);

    const tabs = this.#tabs();
    if (tabs) tabs.addEventListener("vc-tab-change", () => this.#sync());
    this.#sync();
  }

  #tabs() {
    const id = this.getAttribute("for");
    if (!id) return null;
    const element = document.getElementById(id);
    return element && typeof element.select === "function" ? element : null;
  }

  #step(delta) {
    const tabs = this.#tabs();
    if (!tabs) return;
    this.#select(numberOr(tabs.index, 0) + delta);
  }

  #select(index) {
    const tabs = this.#tabs();
    if (!tabs) return;
    const count = tabs.panels.length;
    if (count === 0) return;
    tabs.select(Math.min(Math.max(index, 0), count - 1));
  }

  #sync() {
    if (!this.#range) return;
    const tabs = this.#tabs();
    const panels = tabs ? tabs.panels : [];
    const count = panels.length;
    const index = count === 0 ? 0 : Math.min(Math.max(numberOr(tabs.index, 0), 0), count - 1);
    const label = count === 0 ? "no states" : panels[index].label;

    this.#range.max = String(Math.max(count, 1));
    this.#range.value = String(index + 1);
    this.#range.disabled = count < 2;
    this.#range.setAttribute("aria-valuetext", label);
    const position = count === 0 ? "No states to show" : `${index + 1} of ${count}`;
    this.#status.textContent = count === 0 ? position : `${position} · ${withoutLeadingPosition(label, index)}`;
    this.#previous.disabled = index <= 0;
    this.#next.disabled = index >= count - 1;
  }
}

/* Panel labels often start with their own number; the status line already carries it. */
function withoutLeadingPosition(label, index) {
  const prefix = new RegExp(`^\\s*${index + 1}\\s*[·.:)\\-]\\s*`);
  return label.replace(prefix, "");
}
