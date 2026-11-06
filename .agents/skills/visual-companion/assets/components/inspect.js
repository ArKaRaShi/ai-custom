/* ---------------- <vc-inspect for="tabsId" caption="Hidden state"> ---------------- */

/* Renders the current panel's declared fields. Silent when there is nothing declared. */
export class VcInspect extends HTMLElement {
  #order = [];
  #details = null;

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
    const previous = tabs && tabs.index > 0 ? tabs.panels[tabs.index - 1].state : null;
    const open = this.#details?.open || false;
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
        const was = document.createElement("span");
        was.className = "vc-inspect-was";
        was.textContent = ` was ${previous[key]}`;
        cell.append(was);
      }
      row.append(head, cell);
      body.append(row);
    }
    table.append(body);
    if (this.hasAttribute("fold")) {
      const details = document.createElement("details");
      this.#details = details;
      const summary = document.createElement("summary");
      summary.textContent = "Show the raw values";
      details.open = open;
      details.append(summary, table);
      this.append(details);
    } else this.append(table);
  }
}
