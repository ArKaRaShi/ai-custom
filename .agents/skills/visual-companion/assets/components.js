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
      const panels = Array.from(this.querySelectorAll(":scope > vc-tab"));
      panels.forEach((panel, i) => {
        if (i === index) panel.setAttribute("data-active", "");
        else panel.removeAttribute("data-active");
      });
      this.#buttons.forEach((button, i) => {
        button.setAttribute("aria-selected", i === index ? "true" : "false");
        button.tabIndex = i === index ? 0 : -1;
      });
      this.dispatchEvent(
        new CustomEvent("vc-tab-change", { detail: { index }, bubbles: true }),
      );
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
  if (!customElements.get("vc-chart")) customElements.define("vc-chart", VcChart);
  if (!customElements.get("vc-code")) customElements.define("vc-code", VcCode);
})();
