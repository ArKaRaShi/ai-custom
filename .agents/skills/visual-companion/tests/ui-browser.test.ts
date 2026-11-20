import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { playwright } from "./playwright";
import { buildTrace, parseSpec } from "../scripts/trace.ts";
import { parseReplaySpec, range, replay, waffle } from "../scripts/figures.ts";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const skip = !playwright || !existsSync(chrome);
if (skip) console.warn("Browser smoke skipped: install playwright and Google Chrome to run it.");

/** The presentation template with its placeholders filled, one toggle added, and the shared files inlined. */
async function standaloneDeck(dir: string): Promise<string> {
  const template = (await readFile(new URL("../templates/presentation.html", import.meta.url), "utf8"))
    .replace(/@@[^@]*@@/g, "x")
    .replace("</section>\n\n<section id=\"s3\" class=\"slide\">\n  <p class=\"eyebrow\">Data", `<div class="ui-toggle" id="t"><div data-label="Before">old panel</div><div data-label="After">new panel</div></div></section>\n\n<section id="s3" class="slide">\n  <p class="eyebrow">Data`);
  const linked = join(dir, "linked.html");
  const out = join(dir, "deck.html");
  await writeFile(linked, template);
  const run = Bun.spawn(["bun", join(import.meta.dir, "..", "scripts", "inline-ui.ts"), linked, out]);
  expect(await run.exited).toBe(0);
  return out;
}

// Playwright sometimes fails to spawn Chrome ("Failed to connect") when several browser tests run in one process; retry only that.
test.skipIf(skip)("a deck is readable without JavaScript and navigable with it", { retry: 2, timeout: 30_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "vc-ui-"));
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const url = `file://${await standaloneDeck(dir)}`;

    // Static form: no script runs, so every slide, step and panel is visible.
    const plain = await browser.newPage({ javaScriptEnabled: false });
    await plain.goto(url);
    expect(await plain.locator(".slide").evaluateAll((els) => els.map((e) => getComputedStyle(e).display))).toEqual(["flex", "flex", "flex"]);
    expect(await plain.locator("[data-step]").evaluateAll((els) => els.map((e) => getComputedStyle(e).visibility))).toEqual(["visible", "visible"]);
    expect(await plain.locator("#t > [data-label]").evaluateAll((els) => els.map((e) => getComputedStyle(e).display !== "none"))).toEqual([true, true]);
    await plain.close();

    // Interactive form: one slide at a time; → reveals steps before advancing; the toggle swaps panels.
    const page = await browser.newPage();
    await page.goto(url);
    const visibleSlides = () => page.locator(".slide").evaluateAll((els) => els.map((e) => getComputedStyle(e).display !== "none"));
    expect(await visibleSlides()).toEqual([true, false, false]);
    await page.keyboard.press("ArrowRight");
    expect(await visibleSlides()).toEqual([false, true, false]);
    const shown = () => page.locator("[data-step].shown").count();
    expect(await shown()).toBe(0);
    await page.keyboard.press("ArrowRight");
    expect(await shown()).toBe(1);
    await page.keyboard.press("ArrowRight");
    expect(await shown()).toBe(2);
    expect(await visibleSlides()).toEqual([false, true, false]);
    await page.keyboard.press("ArrowRight");
    expect(await visibleSlides()).toEqual([false, false, true]);

    await page.keyboard.press("ArrowLeft");
    const panelShown = (n: number) => page.locator("#t > [data-label]").nth(n).isVisible();
    expect([await panelShown(0), await panelShown(1)]).toEqual([true, false]);
    await page.locator(".ui-toggle-bar button", { hasText: "After" }).click();
    expect([await panelShown(0), await panelShown(1)]).toEqual([false, true]);
    expect(await visibleSlides()).toEqual([false, true, false]);

    // A focused toggle button keeps Space for itself, but arrows still move the deck.
    await page.keyboard.press(" ");
    expect(await visibleSlides()).toEqual([false, true, false]);
    await page.keyboard.press("ArrowLeft");
    expect(await visibleSlides()).toEqual([true, false, false]);
    await page.evaluate(() => { location.hash = "#s3"; });
    await page.waitForSelector("#s3.on");
    expect(await visibleSlides()).toEqual([false, false, true]);

    // A ui-ref link jumps to its slide.
    await page.evaluate(() => { document.querySelector("#s3")!.insertAdjacentHTML("beforeend", '<a class="ui-ref" id="ref" href="#s1">back</a>'); });
    await page.click("#ref");
    await page.waitForSelector("#s1.on");
    expect(await visibleSlides()).toEqual([true, false, false]);

    // A click never moves the deck, wherever it lands; a label click only toggles its checkbox.
    await page.evaluate(() => { document.querySelector("#s1")!.insertAdjacentHTML("beforeend", '<label id="lbl"><input type="checkbox" id="cb"> pick</label>'); });
    await page.locator("#lbl").click();
    const checked = await page.locator("#cb").isChecked();
    expect(checked).toBe(true);
    await page.mouse.click(40, 360);
    await page.mouse.click(1200, 360);
    const afterClicks = await visibleSlides();
    expect(afterClicks).toEqual([true, false, false]);
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test.skipIf(skip)("a trace shows every step without JavaScript and one step at a time with it", { retry: 2, timeout: 30_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "vc-trace-"));
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const spec = parseSpec({
      code: "df.dropna().mean()",
      input: { title: "Data in", cmd: "printf 'a  b\\n1  2\\n'" },
      steps: [
        { title: ".dropna()", code: ".dropna()", plain: "Remove rows with a blank.", cmd: "printf 'a  b\\n1  2\\n'" },
        { title: ".mean()", code: ".mean()", plain: "Average each column.", cmd: "printf 'a  1.0\\n'" },
      ],
      summary: "One average per column.",
    });
    const block = await buildTrace(spec);
    const themeUrl = new URL("../assets/ui/themes/indigo.css", import.meta.url);
    const cssUrl = new URL("../assets/ui/components.css", import.meta.url);
    const scriptUrl = new URL("../assets/ui/ui.js", import.meta.url);
    const theme = await readFile(themeUrl, "utf8");
    const css = await readFile(cssUrl, "utf8");
    const script = await readFile(scriptUrl, "utf8");
    const file = join(dir, "trace.html");
    await writeFile(file, `<!doctype html><html><head><style>${theme}${css}</style><script>${script}</script></head><body class="ui-root">${block}</body></html>`);
    const url = `file://${file}`;

    // Static form: every step and the summary are visible, and no buttons exist.
    const plain = await browser.newPage({ javaScriptEnabled: false });
    await plain.goto(url);
    const plainSteps = await plain.locator(".ui-trace > section").evaluateAll((els) => els.map((e) => getComputedStyle(e).display !== "none"));
    const plainSummary = await plain.locator(".ui-trace > footer").isVisible();
    const plainBars = await plain.locator(".ui-trace-bar").count();
    expect(plainSteps).toEqual([true, true]);
    expect(plainSummary).toBe(true);
    expect(plainBars).toBe(0);
    await plain.close();

    // Interactive form: one step at a time; the summary appears at the last step; the ends disable their button.
    const page = await browser.newPage();
    await page.goto(url);
    const visible = () => page.locator(".ui-trace > section").evaluateAll((els) => els.map((e) => getComputedStyle(e).display !== "none"));
    const next = page.locator(".ui-trace-bar button", { hasText: "Next" });
    const back = page.locator(".ui-trace-bar button", { hasText: "Back" });
    const summary = page.locator(".ui-trace > footer");
    const first = await visible();
    expect(first).toEqual([true, false]);
    expect(await summary.isVisible()).toBe(false);
    expect(await back.isDisabled()).toBe(true);
    await next.click();
    const second = await visible();
    expect(second).toEqual([false, true]);
    expect(await summary.isVisible()).toBe(true);
    expect(await next.isDisabled()).toBe(true);
    await back.click();
    const again = await visible();
    expect(again).toEqual([true, false]);
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test.skipIf(skip)("a trace on a slide fits 720px at every step, and stacked slides never overlap without JavaScript", { retry: 2, timeout: 30_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "vc-trace-deck-"));
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const table = "printf 'dt     A     B\\n09:00  10.0  20.0\\n09:01  12.0  NaN\\n09:02  18.0  26.0\\n09:03  14.0  22.0\\n'";
    const spec = parseSpec({
      code: "df.dropna().mean()",
      input: { title: "Data in", cmd: table },
      steps: [
        { title: ".dropna(): remove any row that has a blank", code: ".dropna()", plain: "Row 09:01 has a blank, so the whole row goes, including A's valid 12.0.", cmd: table },
        { title: ".mean(): average each column", code: ".mean()", plain: "A is (10 + 18 + 14) / 3. B is (20 + 26 + 22) / 3.", cmd: "printf 'A    14.0\\nB    22.7\\ndtype: float64\\n'" },
      ],
      summary: "4 rows go in, 3 survive, 2 averages come out. Without .dropna(), A would be 13.5, because the 12.0 would be kept.",
    });
    const block = await buildTrace(spec);
    const templateUrl = new URL("../templates/presentation.html", import.meta.url);
    const template = await readFile(templateUrl, "utf8");
    const slide = `<section id="s2" class="slide"><p class="eyebrow">Trace</p><h2>Two steps turn four rows into two averages</h2>${block}<div class="foot"><span>trace</span><span>2 / 3</span></div></section>`;
    const html = template.replace(/@@[^@]*@@/g, "x").replace(/<section id="s2" class="slide">[\s\S]*?<\/section>/, slide);
    const linked = join(dir, "linked.html");
    const out = join(dir, "deck.html");
    await writeFile(linked, html);
    const inliner = join(import.meta.dir, "..", "scripts", "inline-ui.ts");
    const run = Bun.spawn(["bun", inliner, linked, out]);
    expect(await run.exited).toBe(0);
    const url = `file://${out}#s2`;

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(url);
    await page.waitForSelector("#s2.on");
    const overflow = () => page.evaluate(() => {
      const s = document.querySelector("#s2")!;
      return s.scrollHeight - s.clientHeight;
    });
    const atFirst = await overflow();
    await page.locator(".ui-trace-bar button", { hasText: "Next" }).click();
    const atLast = await overflow();
    expect([atFirst, atLast]).toEqual([0, 0]);

    // Without JavaScript the slides stack, and a tall slide grows instead of painting over the next one.
    const plain = await browser.newPage({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
    await plain.goto(url);
    const boxes = await plain.evaluate(() => [...document.querySelectorAll(".slide")].map((s) => {
      const r = s.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, overflow: s.scrollHeight - s.clientHeight };
    }));
    expect(boxes.map((b) => b.overflow)).toEqual([0, 0, 0]);
    expect(boxes[0]!.bottom).toBeLessThanOrEqual(boxes[1]!.top);
    expect(boxes[1]!.bottom).toBeLessThanOrEqual(boxes[2]!.top);
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
});

/** A page built from the shared layer with the theme, CSS and script inlined: a three-step worked calculation, a range, a waffle and cases. */
async function workPage(dir: string): Promise<string> {
  const read = (name: string): Promise<string> => readFile(new URL(`../assets/ui/${name}`, import.meta.url), "utf8");
  const theme = await read("themes/indigo.css");
  const css = await read("components.css");
  const script = await read("ui.js");
  const step = (title: string, result: string, formula: string, numbers: string): string =>
    `<section><header><h3>${title}</h3><b>${result}</b></header><div><pre data-label="Formula">${formula}</pre><output data-label="With your numbers">${numbers}</output></div></section>`;
  const work = `<div class="ui-work">${step("Power", "75 kW", "input", "power_kw = 75")}${step("Range", "64.7 to 78.4 %", "low = 38.0 + 6.19 × ln(P)", '<span id="ln-low">low ≈ 64.725</span>')}${step("Place", "67.8", "(eff − low) ÷ (high − low) × 100", '(74.0 − <a class="ui-ref" href="#ln-low">64.725</a>) ÷ 13.674 × 100 ≈ 67.8')}</div>`;
  const figures = `${range({ min: 30, max: 100, lo: 64.7, hi: 78.4, at: 74, unit: " %", digits: 1, name: "Range" })}${waffle(74, 100, 20)}`;
  const cases = '<div class="ui-cases"><div class="ui-case"><small>30 kW</small><b>0.0</b><span class="ui-status critical"><i aria-hidden="true">▲</i>Critical</span></div></div>';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${theme}${css}</style><script>${script}</script></head><body class="ui-root"><div style="max-width:1000px;margin:0 auto;padding:20px">${work}${figures}${cases}</div></body></html>`;
  const file = join(dir, "work.html");
  await writeFile(file, html);
  return file;
}

test.skipIf(skip)("a worked calculation is complete without JavaScript and steps with Back and Next with it", { retry: 2, timeout: 40_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "vc-work-"));
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const file = await workPage(dir);
    const url = `file://${file}`;

    const plain = await browser.newPage({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
    await plain.goto(url);
    const stacked = await plain.evaluate(() => [...document.querySelectorAll(".ui-work > section")].map((s) => getComputedStyle(s).opacity));
    const plainButtons = await plain.locator(".ui-work button").count();
    expect(stacked).toEqual(["1", "1", "1"]);
    expect(plainButtons).toBe(0);

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url);
    const status = page.locator(".ui-work-bar [role=status]");
    const back = page.locator(".ui-work-bar button", { hasText: "Back" });
    const next = page.locator(".ui-work-bar button", { hasText: "Next" });
    const showAll = page.locator(".ui-work-bar button", { hasText: "Show all" });
    const dimmed = page.locator(".ui-work > section.pending");
    const first = await status.innerText();
    const dimmedAtStart = await dimmed.count();
    expect(first).toBe("All steps shown.");
    expect(dimmedAtStart).toBe(0);

    await back.click();
    const second = await status.innerText();
    const dimmedAtTwo = await dimmed.count();
    expect(second).toBe("Step 2 of 3: Range, 64.7 to 78.4 %.");
    expect(dimmedAtTwo).toBe(1);
    await back.click();
    const backAtFirst = await back.isDisabled();
    const dimmedAtOne = await dimmed.count();
    expect(backAtFirst).toBe(true);
    expect(dimmedAtOne).toBe(2);

    await next.focus();
    await page.keyboard.press("ArrowRight");
    const afterRight = await status.innerText();
    await page.keyboard.press("ArrowLeft");
    const afterLeft = await status.innerText();
    expect(afterRight).toBe("Step 2 of 3: Range, 64.7 to 78.4 %.");
    expect(afterLeft).toBe("Step 1 of 3: Power, 75 kW.");
    await showAll.click();
    const dimmedAfterAll = await dimmed.count();
    expect(dimmedAfterAll).toBe(0);

    // A ui-ref on a number jumps to its source and flashes it for a moment.
    await page.locator("a.ui-ref").click();
    const flashed = await page.locator("#ln-low").evaluate((el) => el.classList.contains("ui-flash"));
    expect(flashed).toBe(true);
    await page.waitForFunction(() => !document.getElementById("ln-low")!.classList.contains("ui-flash"), undefined, { timeout: 4000 });

    // Reduced motion: Replay goes straight to the end instead of animating.
    const calm = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    await calm.goto(url);
    await calm.locator(".ui-work-bar button", { hasText: "Replay" }).click();
    const calmStatus = await calm.locator(".ui-work-bar [role=status]").innerText();
    expect(calmStatus).toBe("All steps shown.");

    // The marker sits inside its bar, and a status keeps its word beside its shape.
    const inside = await page.evaluate(() => {
      const bar = document.querySelector(".ui-range-bar")!.getBoundingClientRect();
      const pin = document.querySelector(".ui-range-pin")!.getBoundingClientRect();
      return pin.left >= bar.left && pin.right <= bar.right;
    });
    const statusText = await page.locator(".ui-status").innerText();
    expect(inside).toBe(true);
    expect(statusText).toContain("Critical");
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test.skipIf(skip)("a section menu stays at the top and marks the section in view", { retry: 2, timeout: 40_000 }, async () => {
  const prefix = join(tmpdir(), "vc-nav-");
  const dir = await mkdtemp(prefix);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const read = (name: string): Promise<string> => {
      const asset = new URL(`../assets/ui/${name}`, import.meta.url);
      return readFile(asset, "utf8");
    };
    const theme = await read("themes/modern.css");
    const css = await read("components.css");
    const script = await read("ui.js");
    const section = (id: string): string => `<section id="${id}" style="height:900px"><h2>${id}</h2></section>`;
    const html = `<!doctype html><html lang="en" data-ui-theme="modern"><head><meta charset="utf-8"><style>${theme}${css}</style><script>${script}</script></head><body class="ui-root"><nav class="ui-nav" aria-label="On this page"><a href="#a">A</a><a href="#b">B</a><a href="#c">C</a></nav>${section("a")}${section("b")}${section("c")}</body></html>`;
    const file = join(dir, "nav.html");
    await writeFile(file, html);

    // Static form: no script, so the links jump but nothing is marked.
    const plain = await browser.newPage({ javaScriptEnabled: false });
    await plain.goto(`file://${file}`);
    const plainMarks = await plain.locator(".ui-nav a[aria-current]").count();
    expect(plainMarks).toBe(0);
    await plain.close();

    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await page.goto(`file://${file}`);
    const marked = (): Promise<string[]> => page.locator(".ui-nav a[aria-current=true]").allInnerTexts();
    const atTop = await marked();
    expect(atTop).toEqual(["A"]);

    await page.locator('.ui-nav a[href="#c"]').click();
    await page.waitForFunction(() => document.querySelector(".ui-nav a[aria-current=true]")?.textContent === "C");
    const afterJump = await marked();
    expect(afterJump).toEqual(["C"]);
    // The menu is still at the top of the window, and the section it jumped to is not hidden under it.
    const place = await page.evaluate(() => {
      const nav = document.querySelector(".ui-nav")!.getBoundingClientRect();
      const target = document.getElementById("c")!.getBoundingClientRect();
      return { navTop: nav.top, gap: target.top - nav.bottom };
    });
    expect(place.navTop).toBe(0);
    expect(place.gap).toBeGreaterThanOrEqual(0);

    await page.evaluate(() => window.scrollTo(0, 950));
    await page.waitForFunction(() => document.querySelector(".ui-nav a[aria-current=true]")?.textContent === "B");
    const middle = await marked();
    expect(middle).toEqual(["B"]);
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test.skipIf(skip)("a replay shows every event without JavaScript and one at a time with it; Back, ticks, arrow keys and Play move it", { retry: 2, timeout: 40_000 }, async () => {
  const prefix = join(tmpdir(), "vc-replay-");
  const dir = await mkdtemp(prefix);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const read = (name: string): Promise<string> => {
      const asset = new URL(`../assets/ui/${name}`, import.meta.url);
      return readFile(asset, "utf8");
    };
    const theme = await read("themes/modern.css");
    const css = await read("components.css");
    const script = await read("ui.js");
    const spec = parseReplaySpec({
      events: [
        { time: "09:00", title: "One", because: "First." },
        { time: "09:10", title: "Two", because: "Second." },
        { time: "09:20", title: "Three", because: "Third." },
      ],
    });
    const block = replay(spec);
    const html = `<!doctype html><html lang="en" data-ui-theme="modern"><head><meta charset="utf-8"><style>${theme}${css}</style><script>${script}</script></head><body class="ui-root">${block}</body></html>`;
    const file = join(dir, "replay.html");
    await writeFile(file, html);
    const url = `file://${file}`;

    // Static form: every event is visible and there are no controls.
    const plain = await browser.newPage({ javaScriptEnabled: false });
    await plain.goto(url);
    const plainShown = await plain.evaluate(() => [...document.querySelectorAll(".ui-replay > section")].map((s) => getComputedStyle(s).display !== "none"));
    const plainBars = await plain.locator(".ui-replay-bar").count();
    const plainMarker = await plain.evaluate(() => getComputedStyle(document.querySelector(".ui-replay-marker")!).display);
    expect(plainShown).toEqual([true, true, true]);
    expect(plainBars).toBe(0);
    expect(plainMarker).toBe("none");
    await plain.close();

    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await page.goto(url);
    const shown = (): Promise<boolean[]> => page.evaluate(() => [...document.querySelectorAll(".ui-replay > section")].map((s) => getComputedStyle(s).display !== "none"));
    const back = page.locator(".ui-replay-bar button", { hasText: "Back" });
    const next = page.locator(".ui-replay-bar button", { hasText: "Next" });
    const play = page.locator(".ui-replay-bar button", { hasText: "Play" });

    // It opens on the last event, the complete picture, and a hidden event keeps its number.
    const opened = await shown();
    const numberShown = await page.evaluate(() => getComputedStyle(document.querySelector(".ui-replay > section:last-of-type h3")!, "::before").content);
    expect(opened).toEqual([false, false, true]);
    expect(numberShown).toContain("3");
    const lastDisabled = await next.isDisabled();
    expect(lastDisabled).toBe(true);

    await back.click();
    const afterBack = await shown();
    expect(afterBack).toEqual([false, true, false]);

    await page.locator(".ui-replay-axis > i").nth(0).click();
    const afterTick = await shown();
    const backAtStart = await back.isDisabled();
    expect(afterTick).toEqual([true, false, false]);
    expect(backAtStart).toBe(true);

    await next.focus();
    await page.keyboard.press("ArrowRight");
    const afterArrow = await shown();
    const status = await page.locator(".ui-replay-bar [role=status]").innerText();
    expect(afterArrow).toEqual([false, true, false]);
    expect(status).toBe("Event 2 of 3: Two");

    // Play restarts from the first event and ends on the last.
    await play.click();
    const atPlay = await shown();
    expect(atPlay).toEqual([true, false, false]);
    await page.waitForFunction(() => document.querySelector(".ui-replay > section:last-of-type")!.classList.contains("on"), undefined, { timeout: 6000 });
    await page.close();

    // Reduced motion: no slide, and Play shows the end at once.
    const calm = await browser.newPage({ viewport: { width: 1000, height: 700 }, reducedMotion: "reduce" });
    await calm.goto(url);
    await calm.locator(".ui-replay-bar button", { hasText: "Back" }).click();
    await calm.locator(".ui-replay-bar button", { hasText: "Play" }).click();
    const calmShown = await calm.evaluate(() => [...document.querySelectorAll(".ui-replay > section")].map((s) => getComputedStyle(s).display !== "none"));
    const calmTransition = await calm.evaluate(() => getComputedStyle(document.querySelector(".ui-replay-marker")!).transitionDuration);
    expect(calmShown).toEqual([false, false, true]);
    expect(calmTransition).toBe("0s");
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
});
