function formatValue(value, unit) {
  if (unit === "ms" && value >= 1000) return `${Number((value / 1000).toFixed(2))} s`;
  return `${Number(value.toFixed(2))}${unit ? ` ${unit}` : ""}`;
}

export class VcTimebar extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";
    const tabs = document.getElementById(this.getAttribute("for"));
    if (!tabs || typeof tabs.select !== "function") return;
    const panels = tabs.panels;
    const unit = this.getAttribute("unit") || "";
    const values = panels.map((panel) => panel.value ?? 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    const bar = document.createElement("div");
    bar.className = "vc-timebar-bar";
    const caption = document.createElement("p");
    caption.className = "vc-timebar-caption";
    const hint = document.createElement("p");
    hint.className = "vc-timebar-hint";
    hint.textContent = this.getAttribute("hint") ?? "Click a part of the bar to jump to that step.";
    const minimum = Math.min(0.06, 1 / panels.length);
    const weights = values.map(() => 0);
    let remaining = 1;
    let pending = values.map((_, index) => index);
    while (pending.length) {
      const subtotal = pending.reduce((sum, index) => sum + values[index], 0);
      const small = pending.filter((index) => (subtotal ? remaining * values[index] / subtotal : remaining / pending.length) < minimum);
      if (!small.length) {
        for (const index of pending) weights[index] = subtotal ? remaining * values[index] / subtotal : remaining / pending.length;
        break;
      }
      for (const index of small) weights[index] = minimum;
      remaining -= small.length * minimum;
      pending = pending.filter((index) => !small.includes(index));
    }
    const buttons = panels.map((panel, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vc-timebar-segment";
      button.style.flexGrow = String(weights[index]);
      button.setAttribute("aria-label", `Go to step ${index + 1}, ${panel.node}`);
      button.title = panel.node;
      button.addEventListener("click", () => tabs.select(index));
      bar.append(button);
      return button;
    });
    this.append(bar, caption, hint);
    const render = () => {
      const index = tabs.index;
      buttons.forEach((button, i) => {
        if (i === index) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
        button.toggleAttribute("data-future", i > index);
        button.textContent = `${i === index ? "● " : ""}${panels[i].node}`;
      });
      const soFar = values.slice(0, index + 1).reduce((sum, value) => sum + value, 0);
      const current = values[index] ?? 0;
      const percent = total ? Math.round(current / total * 100) : 0;
      caption.textContent = `Waited so far: ${formatValue(soFar, unit)} · This step: ${formatValue(current, unit)} (${percent}% of all waiting)`;
    };
    tabs.addEventListener("vc-tab-change", render);
    render();
  }
}
