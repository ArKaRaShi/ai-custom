/* Optional behaviour for the interactive components in components.css. Without this file the page is still complete:
   .ui-reveal shows every step, .ui-toggle stacks its panels, .ui-trace, .ui-work and .ui-replay stack their steps, .ui-nav still jumps (it just does
   not mark the current section), and a .ui-ref still jumps (it just does not flash its target). Include it only when a page uses those components. */
(() => {
  const inDeck = () => document.documentElement.classList.contains("deck");
  const button = (label, className) => Object.assign(document.createElement("button"), { type: "button", textContent: label, className });

  /** Shows the next hidden [data-step] inside scope. Returns false when none is left, so a deck can advance instead. */
  const step = (scope) => {
    const next = scope.querySelector(".ui-reveal.armed [data-step]:not(.shown)");
    if (!next) return false;
    next.classList.add("shown");
    return true;
  };
  window.uiReveal = { step };

  // A ui-ref to a number's source flashes the target for 1.6 s so the reader sees where the jump landed. Slides are not flashed.
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a.ui-ref[href^='#']");
    const target = link && document.getElementById(link.getAttribute("href").slice(1));
    if (!target || target.classList.contains("slide")) return;
    target.classList.add("ui-flash");
    setTimeout(() => target.classList.remove("ui-flash"), 1600);
  });

  const init = () => {
  for (const box of document.querySelectorAll(".ui-reveal")) {
    box.classList.add("armed");
    box.tabIndex = 0;
    box.addEventListener("click", () => { if (!inDeck()) step(box); });
    box.addEventListener("keydown", (e) => {
      if (inDeck() || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      step(box);
    });
  }

  for (const toggle of document.querySelectorAll(".ui-toggle")) {
    const panels = [...toggle.children].filter((p) => p.hasAttribute("data-label"));
    if (!panels.length) continue;
    const bar = document.createElement("div");
    bar.className = "ui-toggle-bar";
    const select = (i) => panels.forEach((p, k) => {
      p.classList.toggle("on", k === i);
      bar.children[k].setAttribute("aria-pressed", String(k === i));
    });
    panels.forEach((p, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = p.dataset.label;
      button.addEventListener("click", () => select(i));
      bar.append(button);
    });
    toggle.classList.add("armed");
    toggle.prepend(bar);
    select(0);
  }

  for (const trace of document.querySelectorAll(".ui-trace")) {
    const steps = [...trace.children].filter((c) => c.tagName === "SECTION");
    if (!steps.length) continue;
    const summary = trace.querySelector(":scope > footer");
    const bar = document.createElement("div");
    bar.className = "ui-trace-bar";
    const button = (label, className) => Object.assign(document.createElement("button"), { type: "button", textContent: label, className });
    const back = button("Back", "ui-button outline");
    const next = button("Next", "ui-button");
    let at = 0;
    const show = (i) => {
      at = i;
      steps.forEach((s, k) => s.classList.toggle("on", k === i));
      summary?.classList.toggle("on", i === steps.length - 1);
      back.disabled = i === 0;
      next.disabled = i === steps.length - 1;
    };
    back.addEventListener("click", () => show(at - 1));
    next.addEventListener("click", () => show(at + 1));
    bar.append(back, next);
    steps[0].before(bar);
    trace.classList.add("armed");
    show(0);
  }

  for (const work of document.querySelectorAll(".ui-work")) {
    const steps = [...work.children].filter((c) => c.tagName === "SECTION");
    if (steps.length < 2) continue;
    const last = steps.length - 1;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const back = button("Back", "ui-button outline");
    const next = button("Next", "ui-button outline");
    const replay = button("Replay", "ui-button");
    const all = button("Show all", "ui-button outline");
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    const bar = document.createElement("div");
    bar.className = "ui-work-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Step controls");
    bar.append(back, next, replay, all, status);
    const rail = document.createElement("span");
    rail.className = "ui-work-rail";
    const dot = document.createElement("i");
    dot.className = "ui-work-dot";
    let at = last;
    let timer = 0;
    const mid = (el) => el.offsetTop + el.offsetHeight / 2;
    const place = () => {
      rail.style.top = `${mid(steps[0])}px`;
      rail.style.height = `${mid(steps[last]) - mid(steps[0])}px`;
      dot.style.top = `${mid(steps[at])}px`;
    };
    const stop = () => { clearInterval(timer); timer = 0; };
    const show = (i) => {
      at = i;
      steps.forEach((s, k) => { s.classList.toggle("pending", k > i); s.classList.toggle("now", k === i && i < last); });
      back.disabled = i === 0;
      status.textContent = i === last
        ? "All steps shown."
        : `Step ${i + 1} of ${steps.length}: ${steps[i].querySelector("h3")?.textContent ?? ""}, ${steps[i].querySelector("header b")?.textContent ?? ""}.`;
      place();
    };
    back.addEventListener("click", () => { stop(); show(Math.max(0, at - 1)); });
    next.addEventListener("click", () => { stop(); show(at >= last ? 0 : at + 1); });
    all.addEventListener("click", () => { stop(); show(last); });
    replay.addEventListener("click", () => {
      stop();
      if (reduced) { show(last); return; }
      show(0);
      timer = setInterval(() => (at >= last ? stop() : show(at + 1)), 1000);
    });
    bar.addEventListener("keydown", (e) => {
      if (e.target.tagName !== "BUTTON") return;
      if (e.key === "ArrowRight") { e.preventDefault(); next.click(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back.click(); }
    });
    window.addEventListener("resize", place);
    window.addEventListener("load", place);
    work.classList.add("armed");
    work.append(rail, dot, bar);
    show(last);
  }

  // A replay shows one event at a time on an axis of numbered ticks. It opens on the last event (the complete picture); Play restarts from the first.
  for (const replay of document.querySelectorAll(".ui-replay")) {
    const steps = [...replay.children].filter((c) => c.tagName === "SECTION");
    const axis = replay.querySelector(".ui-replay-axis");
    if (steps.length < 2 || !axis) continue;
    const ticks = [...axis.querySelectorAll("i")];
    const last = steps.length - 1;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const title = (k) => steps[k].querySelector("h3")?.textContent ?? "";
    const back = button("Back", "ui-button outline");
    const next = button("Next", "ui-button outline");
    const play = button("Play", "ui-button");
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    const bar = document.createElement("div");
    bar.className = "ui-replay-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Replay controls");
    bar.append(back, next, play, status);
    let at = last;
    let timer = 0;
    const stop = () => { clearInterval(timer); timer = 0; };
    const show = (i) => {
      at = i;
      steps.forEach((s, k) => s.classList.toggle("on", k === i));
      ticks.forEach((t, k) => {
        t.classList.toggle("done", k <= i);
        if (k === i) t.setAttribute("aria-current", "step"); else t.removeAttribute("aria-current");
      });
      const percent = ticks[i]?.style.getPropertyValue("--p") || "0";
      axis.style.setProperty("--at", percent);
      back.disabled = i === 0;
      next.disabled = i === last;
      status.textContent = `Event ${i + 1} of ${steps.length}: ${title(i)}`;
    };
    ticks.forEach((t, k) => {
      t.tabIndex = 0;
      t.setAttribute("role", "button");
      t.setAttribute("aria-label", `Event ${k + 1}: ${title(k)}`);
      t.addEventListener("click", () => { stop(); show(k); });
      t.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stop(); show(k); } });
    });
    back.addEventListener("click", () => { stop(); const prev = Math.max(0, at - 1); show(prev); });
    next.addEventListener("click", () => { stop(); const following = Math.min(last, at + 1); show(following); });
    play.addEventListener("click", () => {
      stop();
      if (reduced) { show(last); return; }
      show(0);
      timer = setInterval(() => (at >= last ? stop() : show(at + 1)), 1200);
    });
    bar.addEventListener("keydown", (e) => {
      if (e.target.tagName !== "BUTTON") return;
      if (e.key === "ArrowRight") { e.preventDefault(); next.click(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back.click(); }
    });
    axis.setAttribute("role", "group");
    replay.classList.add("armed");
    replay.append(bar);
    show(last);
  }

  // A section menu marks the section the reader is in: the last one whose top has reached the upper third of the window, or the line a jump lands on if that is lower.
  for (const nav of document.querySelectorAll(".ui-nav")) {
    const links = [...nav.querySelectorAll('a[href^="#"]')];
    const targets = links.map((a) => {
      const id = a.getAttribute("href").slice(1);
      return document.getElementById(id);
    });
    const mark = () => {
      const style = getComputedStyle(document.documentElement);
      const pad = parseFloat(style.scrollPaddingTop);
      const base = Number.isFinite(pad) ? pad : nav.getBoundingClientRect().bottom;
      const line = Math.max(base + 4, window.innerHeight * 0.3);
      let current = 0;
      targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top <= line) current = i; });
      links.forEach((a, i) => (i === current ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    };
    window.addEventListener("scroll", mark, { passive: true });
    window.addEventListener("resize", mark);
    mark();
  }
  };
  // Inlined into <head>, this runs before the body exists, so wait for the document.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
