import { numberOr, readFlatState } from "./core.js";

/* ---------------- <vc-tabs> ---------------- */

export class VcTabs extends HTMLElement {
  #buttons = [];
  #index = 0;
  #data = [];
  #previous = null;
  #next = null;

  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";

    const panels = Array.from(this.querySelectorAll(":scope > vc-tab"));
    if (panels.length === 0) return;
    this.#data = panels.map((panel, index) => {
      const label = panel.getAttribute("label") || `Tab ${index + 1}`;
      const raw = panel.getAttribute("data-value");
      const value = raw === null || raw.trim() === "" ? null : Number(raw);
      if (raw !== null && (value === null || !Number.isFinite(value) || value < 0)) {
        const error = document.createElement("p");
        error.setAttribute("role", "alert");
        error.textContent = `Invalid data-value for ${label}; ignored.`;
        this.append(error);
      }
      return {
        label,
        state: readFlatState(panel.getAttribute("data-state")),
        at: panel.getAttribute("at"),
        cause: panel.getAttribute("data-cause") || "",
        node: panel.getAttribute("data-node") || label,
        focus: (panel.getAttribute("data-focus") || "").trim().split(/\s+/).filter(Boolean),
        value: value !== null && Number.isFinite(value) && value >= 0 ? value : null,
      };
    });

    const list = document.createElement("div");
    list.className = "vc-tablist";
    list.setAttribute("role", "tablist");
    const ladder = this.getAttribute("variant") === "ladder";
    if (ladder) list.setAttribute("aria-orientation", "vertical");

    let peekIndex = -1;
    let sequence = 0;
    let dismissed = false;
    const hoverOrder = panels.map(() => 0);
    const focusOrder = panels.map(() => 0);
    const leaveTimers = panels.map(() => null);
    const updatePeek = () => {
      let index = -1;
      let latest = 0;
      if (!dismissed) {
        panels.forEach((_, i) => {
          const order = Math.max(hoverOrder[i], focusOrder[i]);
          if (order > latest) {
            latest = order;
            index = i;
          }
        });
      }
      if (index === peekIndex) return;
      if (peekIndex !== -1) panels[peekIndex].removeAttribute("data-peek");
      peekIndex = index;
      if (index === -1) this.removeAttribute("data-peeking");
      else {
        panels[index].setAttribute("data-peek", "");
        this.setAttribute("data-peeking", "");
      }
    };
    if (ladder) {
      this.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        dismissed = true;
        updatePeek();
      });
    }

    this.#buttons = panels.map((panel, index) => {
      const label = panel.getAttribute("label") || `Tab ${index + 1}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vc-tab";
      button.textContent = label;
      button.setAttribute("role", "tab");
      button.addEventListener("click", () => this.select(index));
      button.addEventListener("keydown", (event) => {
        const forward = ladder ? "ArrowDown" : "ArrowRight";
        const backward = ladder ? "ArrowUp" : "ArrowLeft";
        if (event.key !== forward && event.key !== backward) return;
        event.preventDefault();
        const next = (index + (event.key === forward ? 1 : -1) + panels.length) % panels.length;
        this.select(next);
        this.#buttons[next].focus();
      });
      if (ladder) {
        button.addEventListener("pointerenter", (event) => {
          if (event.pointerType === "touch") return;
          clearTimeout(leaveTimers[index]);
          hoverOrder[index] = ++sequence;
          dismissed = false;
          updatePeek();
        });
        button.addEventListener("pointerleave", (event) => {
          if (event.pointerType === "touch") return;
          clearTimeout(leaveTimers[index]);
          leaveTimers[index] = setTimeout(() => {
            hoverOrder[index] = 0;
            updatePeek();
          }, 120);
        });
        button.addEventListener("focusin", () => {
          focusOrder[index] = ++sequence;
          dismissed = false;
          updatePeek();
        });
        button.addEventListener("focusout", () => {
          focusOrder[index] = 0;
          updatePeek();
        });
      }
      list.append(button);
      return button;
    });

    if (this.hasAttribute("arrows")) {
      const arrows = document.createElement("div");
      arrows.className = "vc-tab-arrows";
      for (const [label, symbol, delta] of [["Previous step", "‹", -1], ["Next step", "›", 1]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "vc-tab-arrow";
        button.setAttribute("aria-label", label);
        button.textContent = symbol;
        button.addEventListener("click", () => this.select(this.#index + delta));
        arrows.append(button);
        if (delta === -1) this.#previous = button;
        else this.#next = button;
      }
      list.append(arrows);
    }
    this.insertBefore(list, panels[0]);
    const first = this.getAttribute("active") || "0";
    const start = numberOr(first, 1) - 1;
    this.select(start >= 0 && start < panels.length ? start : 0);
  }

  select(index) {
    const panels = this.#panels();
    if (panels.length === 0) return;
    const next = Math.min(Math.max(Math.trunc(numberOr(index, 0)), 0), panels.length - 1);
    this.#index = next;
    panels.forEach((panel, i) => {
      if (i === next) panel.setAttribute("data-active", "");
      else panel.removeAttribute("data-active");
    });
    this.#buttons.forEach((button, i) => {
      button.setAttribute("aria-selected", i === next ? "true" : "false");
      button.tabIndex = i === next ? 0 : -1;
    });
    if (this.#previous) this.#previous.disabled = next === 0;
    if (this.#next) this.#next.disabled = next === panels.length - 1;
    this.dispatchEvent(
      new CustomEvent("vc-tab-change", { detail: { index: next }, bubbles: true }),
    );
  }

  /** Declared panel data, parsed when the tabs connect. */
  get panels() {
    return this.#data;
  }

  get index() {
    return this.#index;
  }

  currentState() {
    return this.panels[this.#index]?.state ?? null;
  }

  #panels() {
    return Array.from(this.querySelectorAll(":scope > vc-tab"));
  }
}
