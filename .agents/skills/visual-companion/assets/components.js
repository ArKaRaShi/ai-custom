/*
 * Behaviour components. Only the parts that need state live here: tabs, a bar
 * chart, copy-to-clipboard code, and the long-page section index. Everything
 * else is CSS in components.css.
 * No build step, no framework, no network.
 */
(function () {
  "use strict";

  /* ---------------- <vc-tabs> ---------------- */

  class VcTabs extends HTMLElement {
    #buttons = [];
    #index = 0;

    connectedCallback() {
      if (this.dataset.ready) return;
      this.dataset.ready = "1";

      const panels = Array.from(this.querySelectorAll(":scope > vc-tab"));
      if (panels.length === 0) return;

      const list = document.createElement("div");
      list.className = "vc-tablist";
      list.setAttribute("role", "tablist");

      this.#buttons = panels.map((panel, index) => {
        const label = panel.getAttribute("label") || `Tab ${index + 1}`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "vc-tab";
        button.textContent = label;
        button.setAttribute("role", "tab");
        button.addEventListener("click", () => this.select(index));
        button.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          const next = (index + (event.key === "ArrowRight" ? 1 : -1) + panels.length) % panels.length;
          this.select(next);
          this.#buttons[next].focus();
        });
        list.append(button);
        return button;
      });

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
      this.dispatchEvent(
        new CustomEvent("vc-tab-change", { detail: { index: next }, bubbles: true }),
      );
    }

    /** Public contract for vc-scrub and vc-inspect: labels and declared state, in order. */
    get panels() {
      return this.#panels().map((panel, index) => ({
        label: panel.getAttribute("label") || `Tab ${index + 1}`,
        state: readState(panel),
      }));
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

  /* ---------------- <vc-chart type="bar" data="Label:12,Other:30"> ---------------- */

  class VcChart extends HTMLElement {
    connectedCallback() {
      if (this.dataset.ready) return;
      this.dataset.ready = "1";
      this.#render();
    }

    #series() {
      const raw = this.getAttribute("data") || "";
      return raw
        .split(",")
        .map((pair) => pair.split(":"))
        .filter((parts) => parts.length === 2)
        .map(([label, value]) => ({
          label: String(label).trim(),
          value: Number(value),
        }))
        .filter((point) => Number.isFinite(point.value));
    }

    #render() {
      const points = this.#series();
      if (points.length === 0) {
        this.textContent = "vc-chart: no data";
        return;
      }
      const height = numberOr(this.getAttribute("height"), 200);
      const max = Math.max(numberOr(this.getAttribute("max"), 0), ...points.map((p) => p.value), 1);
      const valueRoom = 22; // pixels reserved above the tallest bar for its value label

      const columns = points
        .map((point) => {
          const barHeight = Math.max(0, ((height - valueRoom) * point.value) / max);
          return [
            `<div class="vc-chart-col">`,
            `<span class="vc-chart-value">${escapeText(String(point.value))}</span>`,
            `<div class="vc-chart-bar" style="height:${barHeight.toFixed(1)}px"></div>`,
            `</div>`,
          ].join("");
        })
        .join("");
      const labels = points
        .map((point) => `<div class="vc-chart-label">${escapeText(point.label)}</div>`)
        .join("");

      // Plain HTML at real pixel size: text never scales with container width.
      const cols = `--vc-chart-cols:${points.length}`;
      const accessibleName = this.getAttribute("label") || "bar chart";
      const safeName = escapeText(accessibleName);
      this.innerHTML =
        `<div role="img" aria-label="${safeName}">` +
        `<div class="vc-chart-plot" style="height:${height}px;${cols}">${columns}</div>` +
        `<div class="vc-chart-labels" style="${cols}">${labels}</div></div>`;
    }
  }

  /* ---------------- <vc-scrub for="tabsId" label="State"> ---------------- */

  /* Moves the current position of an existing vc-tabs. A controller, never a container. */
  class VcScrub extends HTMLElement {
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

  /* ---------------- <vc-inspect for="tabsId" caption="Hidden state"> ---------------- */

  /* Renders the current panel's declared fields. Silent when there is nothing declared. */
  class VcInspect extends HTMLElement {
    #order = [];
    #rendered = null;

    connectedCallback() {
      if (this.dataset.ready) return;
      this.dataset.ready = "1";
      const tabs = this.#tabs();
      if (tabs) tabs.addEventListener("vc-tab-change", () => this.#render());
      this.#render();
    }

    #tabs() {
      const id = this.getAttribute("for");
      if (!id) return null;
      const element = document.getElementById(id);
      return element && typeof element.currentState === "function" ? element : null;
    }

    #render() {
      const tabs = this.#tabs();
      const state = tabs ? tabs.currentState() : null;
      const previous = this.#rendered;
      this.#rendered = state;
      this.textContent = "";
      if (!state) return;

      for (const key of Object.keys(state)) if (!this.#order.includes(key)) this.#order.push(key);

      const table = document.createElement("table");
      table.className = "vc-table vc-inspect";
      const captionText = this.getAttribute("caption");
      if (captionText) {
        const caption = document.createElement("caption");
        caption.textContent = captionText;
        table.append(caption);
      }
      const body = document.createElement("tbody");
      for (const key of this.#order) {
        if (!(key in state)) continue;
        const row = document.createElement("tr");
        const head = document.createElement("th");
        head.setAttribute("scope", "row");
        head.textContent = key;
        const cell = document.createElement("td");
        cell.textContent = state[key];
        if (previous && key in previous && previous[key] !== state[key]) {
          const badge = document.createElement("span");
          badge.className = "vc-badge";
          badge.setAttribute("data-tone", "warn");
          badge.textContent = "Changed";
          cell.textContent = `${state[key]} `;
          cell.append(badge);
        }
        row.append(head, cell);
        body.append(row);
      }
      table.append(body);
      this.append(table);
    }
  }

  /* ---------------- <vc-code> ---------------- */

  class VcCode extends HTMLElement {
    connectedCallback() {
      if (this.dataset.ready) return;
      this.dataset.ready = "1";
      const source = this.querySelector("code") || this.querySelector("pre");
      if (!source) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vc-btn vc-copy";
      button.dataset.variant = "ghost";
      button.textContent = "copy";
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(source.textContent || "");
          button.textContent = "copied";
        } catch {
          button.textContent = "copy failed";
        }
        setTimeout(() => {
          button.textContent = "copy";
        }, 1200);
      });
      this.append(button);
    }
  }

  /* Authored state crosses into the components here, once. Invalid or nested data reads as no state. */
  function readState(element) {
    const raw = element.getAttribute("data-state");
    if (raw === null) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const state = {};
    for (const key of Object.keys(parsed)) {
      const value = parsed[key];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        state[key] = String(value);
      }
    }
    return Object.keys(state).length > 0 ? state : null;
  }

  /* Panel labels often start with their own number; the status line already carries it. */
  function withoutLeadingPosition(label, index) {
    const prefix = new RegExp(`^\\s*${index + 1}\\s*[·.:)\\-]\\s*`);
    return label.replace(prefix, "");
  }

  function numberOr(value, fallback) {
    if (value === null) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function escapeText(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------------- .vc-toc: marks the section in view; keys 1-9 jump ---------------- */

  function sectionIndex() {
    const links = [...document.querySelectorAll(".vc-toc a[href^='#']")];
    if (!links.length) return;
    const sections = links.map((link) => document.getElementById(link.getAttribute("href").slice(1)));
    function mark(index) {
      links.forEach((link, i) => {
        if (i === index) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    }
    function current() {
      const line = 120;
      let index = 0;
      sections.forEach((section, i) => {
        if (section && section.getBoundingClientRect().top <= line) index = i;
      });
      const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      return atBottom ? sections.length - 1 : index;
    }
    let pending = false;
    addEventListener("scroll", () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        mark(current());
      });
    }, { passive: true });
    // Ticks near the pointer or focus grow, matching the states rail.
    function near(index) {
      links.forEach((link, i) => { link.dataset.distance = String(Math.min(Math.abs(i - index), 3)); });
    }
    function clearNear() {
      links.forEach((link) => { delete link.dataset.distance; });
    }
    links.forEach((link, index) => {
      link.addEventListener("pointerenter", (event) => { if (event.pointerType !== "touch") near(index); });
      link.addEventListener("focus", () => near(index));
      link.addEventListener("blur", clearNear);
    });
    const rail = document.querySelector(".vc-toc");
    rail.addEventListener("pointerleave", clearNear);
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!/^[1-9]$/.test(event.key) || Number(event.key) > sections.length) return;
      event.preventDefault();
      const section = sections[Number(event.key) - 1];
      section.scrollIntoView();
      links[Number(event.key) - 1].focus({ preventScroll: true });
    });
    mark(current());
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sectionIndex);
    else sectionIndex();
  }

  if (!customElements.get("vc-tabs")) customElements.define("vc-tabs", VcTabs);
  if (!customElements.get("vc-scrub")) customElements.define("vc-scrub", VcScrub);
  if (!customElements.get("vc-inspect")) customElements.define("vc-inspect", VcInspect);
  if (!customElements.get("vc-chart")) customElements.define("vc-chart", VcChart);
  if (!customElements.get("vc-code")) customElements.define("vc-code", VcCode);
})();
