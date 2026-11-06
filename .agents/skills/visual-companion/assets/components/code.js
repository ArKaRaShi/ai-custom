/* ---------------- <vc-code> ---------------- */

export class VcCode extends HTMLElement {
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
