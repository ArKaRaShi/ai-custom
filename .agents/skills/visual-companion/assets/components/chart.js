import { escapeText, numberOr } from "./core.js";

/* ---------------- <vc-chart type="bar" data="Label:12,Other:30"> ---------------- */

export class VcChart extends HTMLElement {
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
