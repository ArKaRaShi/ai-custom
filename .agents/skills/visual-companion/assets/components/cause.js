export class VcCause extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";
    const tabs = document.getElementById(this.getAttribute("for"));
    if (!tabs || typeof tabs.select !== "function") return;
    const render = () => {
      this.textContent = "";
      const panel = tabs.panels[tabs.index];
      if (!panel?.cause) return;
      const name = document.createElement("b");
      name.textContent = `${panel.node}:`;
      const text = document.createElement("span");
      text.textContent = ` ${panel.cause}`;
      this.append(name, text);
    };
    tabs.addEventListener("vc-tab-change", render);
    render();
  }
}
