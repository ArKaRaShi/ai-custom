/* Prediction state belongs to the element; recording remains with client.js. */

/**
 * @typedef {{phase: "idle"} | {phase: "picked" | "committed", pick: string}} PredictState
 * @typedef {{type: "pick", value: string} | {type: "commit"}} PredictAction
 */

/** @param {PredictState} state @param {PredictAction} action @returns {PredictState} */
export function predictReducer(state, action) {
  if (state.phase === "committed") return state;
  if (action.type === "pick") return { phase: "picked", pick: action.value };
  return state.phase === "picked" ? { phase: "committed", pick: state.pick } : state;
}

function optionLabel(option) {
  const heading = option.querySelector("h1, h2, h3, h4, h5, h6");
  const label = option.getAttribute("aria-label") || heading?.textContent || option.textContent || "";
  return label.replace(/\s+/g, " ").trim();
}

export class VcPredict extends HTMLElement {
  connectedCallback() {
    if (this.hasAttribute("data-ready")) return;
    const reveal = this.querySelector(":scope > vc-reveal");
    const options = Array.from(this.querySelectorAll("button[data-pick]"));
    if (!reveal || options.length === 0) return;

    let state = /** @type {PredictState} */ ({ phase: "idle" });
    let selected = null;
    const lock = document.createElement("button");
    lock.type = "button";
    lock.className = "vc-btn";
    lock.setAttribute("data-variant", "primary");
    lock.textContent = "Pick an answer first";
    lock.disabled = true;

    const status = document.createElement("p");
    status.className = "vc-predict-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    this.insertBefore(lock, reveal);
    this.insertBefore(status, reveal);
    this.setAttribute("data-multiselect", "");
    this.setAttribute("data-phase", "idle");
    if (this.hasAttribute("label")) {
      this.setAttribute("role", "group");
      this.setAttribute("aria-label", this.getAttribute("label"));
    }
    reveal.hidden = true;
    this.setAttribute("data-ready", "1");

    for (const option of options) {
      option.setAttribute("aria-pressed", "false");
      option.addEventListener("click", () => {
        if (state.phase === "committed") return;
        state = predictReducer(state, { type: "pick", value: option.getAttribute("data-pick") });
        selected = option;
        for (const candidate of options) candidate.setAttribute("aria-pressed", String(candidate === option));
        this.setAttribute("data-phase", state.phase);
        lock.disabled = false;
        lock.textContent = "Lock in";
        const label = optionLabel(option);
        status.textContent = `Selected: ${label}. Press Lock in to see the answer.`;
      });
    }

    lock.addEventListener("click", () => {
      if (state.phase !== "picked" || !selected) {
        lock.removeAttribute("data-choice");
        return;
      }
      state = predictReducer(state, { type: "commit" });
      const label = optionLabel(selected);
      selected.setAttribute("data-choice", state.pick);
      lock.setAttribute("data-choice", state.pick);
      lock.setAttribute("data-label", label);
      lock.disabled = true;
      lock.textContent = "Locked in";
      for (const option of options) option.disabled = true;
      this.setAttribute("data-phase", state.phase);
      status.textContent = `You predicted: ${label}.`;
      reveal.hidden = false;
      reveal.setAttribute("tabindex", "-1");
      reveal.focus();
    });
  }
}
