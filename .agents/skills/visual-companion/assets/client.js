/*
 * Event client: reports choices to the server over a WebSocket, falls back to a
 * plain POST when the socket cannot be established, and shows connection state
 * so a stale screen never looks live. Loaded in both bundle and plain mode.
 */
(function () {
  "use strict";

  // Only the companion frame has this control; plain product pages remain untouched.
  const themeSelect = document.querySelector("[data-vc-theme-select]");
  if (themeSelect) {
    const key = "visual-companion-theme";
    let theme = "system";
    try { theme = localStorage.getItem(key) || "system"; } catch {}
    if (!["system", "light", "dark"].includes(theme)) theme = "system";
    function applyTheme(value) {
      themeSelect.value = value;
      if (value === "system") document.documentElement.removeAttribute("data-vc-theme");
      else document.documentElement.setAttribute("data-vc-theme", value);
    }
    applyTheme(theme);
    themeSelect.addEventListener("change", () => {
      const value = themeSelect.value;
      if (!["system", "light", "dark"].includes(value)) return;
      applyTheme(value);
      try { localStorage.setItem(key, value); } catch {}
    });
  }

  const dot = document.querySelector("[data-vc-dot]");
  const status = document.querySelector("[data-vc-status]");
  const emptyCopy = document.querySelector("[data-vc-empty-copy]");
  const overlay = document.createElement("div");
  overlay.className = "vc-paused";
  // Plain and isolated shells do not load the component stylesheet.
  overlay.style.cssText = "position: fixed; inset: 0; place-items: center; background: var(--vc-bg, #fff); color: var(--vc-muted, #333); font: 14px system-ui, sans-serif; z-index: 2147483647;";
  overlay.style.display = "none";
  overlay.hidden = true;
  overlay.textContent = "Paused — the companion server is not running.";
  document.addEventListener("DOMContentLoaded", () => document.body.append(overlay));
  if (document.body) document.body.append(overlay);

  let socket = null;
  let attempts = 0;
  let timer = null;

  function setState(state, text) {
    if (dot) dot.dataset.state = state;
    if (status) status.textContent = text;
    overlay.hidden = state !== "closed" || !!emptyCopy;
    overlay.style.display = overlay.hidden ? "none" : "grid";
    if (emptyCopy) {
      emptyCopy.textContent = state === "closed"
        ? "The connection was lost. This page will reconnect automatically, and the next screen will appear here."
        : "When your companion shares something, it will appear here automatically.";
    }
  }

  function connect() {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    try {
      socket = new WebSocket(`${scheme}://${location.host}/ws`);
    } catch {
      setState("closed", "Offline");
      return;
    }

    socket.addEventListener("open", () => {
      attempts = 0;
      setState("open", "Connected");
    });

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "reload") location.reload();
    });

    socket.addEventListener("close", () => {
      socket = null;
      setState("closed", "Reconnecting…");
      attempts += 1;
      const delay = Math.min(8000, 500 * 2 ** Math.min(attempts, 4));
      clearTimeout(timer);
      timer = setTimeout(connect, delay);
    });
  }

  function send(event) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
      return;
    }
    void fetch("/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    }).catch(() => {});
  }

  /** Any element carrying data-choice becomes a recorded choice. */
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-choice]") : null;
    if (!target) return;
    const multiselect = target.closest("[data-multiselect]") !== null;
    if (!multiselect) {
      for (const other of document.querySelectorAll('[data-choice][aria-pressed="true"]')) {
        other.setAttribute("aria-pressed", "false");
      }
    }
    const pressed = target.getAttribute("aria-pressed") === "true";
    target.setAttribute("aria-pressed", multiselect ? String(!pressed) : "true");
    send({
      type: "choice",
      choice: target.getAttribute("data-choice") || "",
      text: labelOf(target),
    });
  });

  /** Prefer an explicit data-label, else readable rendered text (not concatenated nodes). */
  function labelOf(element) {
    const explicit = element.getAttribute("data-label");
    if (explicit) return explicit.trim().slice(0, 500);
    const rendered = element.innerText || "";
    return rendered.replace(/\s+/g, " ").trim().slice(0, 500);
  }

  connect();
})();
