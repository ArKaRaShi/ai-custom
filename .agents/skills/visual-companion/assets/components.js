/*
 * Behaviour components. Only the parts that need state live here: tabs, a bar
 * chart, and copy-to-clipboard code. Everything else is CSS in components.css.
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
      const unit = 100 / points.length;
      const barWidth = unit * 0.6;
      const top = 8;

      const bars = points
        .map((point, index) => {
          const x = unit * index + (unit - barWidth) / 2;
          const barHeight = ((height - top * 2) * point.value) / max;
          const y = height - top - barHeight;
          return [
            `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="1.4" fill="currentColor" opacity="0.85"></rect>`,
            `<text class="vc-tick" x="${(unit * index + unit / 2).toFixed(2)}" y="${(height - top + 11).toFixed(2)}" text-anchor="middle">${escapeText(point.label)}</text>`,
            `<text class="vc-tick" x="${(unit * index + unit / 2).toFixed(2)}" y="${(y - 3).toFixed(2)}" text-anchor="middle">${escapeText(String(point.value))}</text>`,
          ].join("");
        })
        .join("\n");

      this.innerHTML = `<svg viewBox="0 0 100 ${height}" role="img" aria-label="${escapeText(
        this.getAttribute("label") || "bar chart",
      )}" color="var(--vc-accent)">${bars}</svg>`;
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

  if (!customElements.get("vc-tabs")) customElements.define("vc-tabs", VcTabs);
  if (!customElements.get("vc-chart")) customElements.define("vc-chart", VcChart);
  if (!customElements.get("vc-code")) customElements.define("vc-code", VcCode);
})();
