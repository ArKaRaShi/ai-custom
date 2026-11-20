import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { playwright } from "./playwright";
import { checkPage, loadManifest } from "../scripts/ui.ts";

type BandResult = { lo: number | null; hi: number | null; score: number | null; tone: string };
declare global {
  // Set by the page's inlined model.js.
  var bandModel: (size: number, reading: number | null) => BandResult;
}

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const skip = !playwright || !existsSync(chrome);
if (skip) console.warn("Band page browser tests skipped: install playwright and Google Chrome to run them.");

const exampleDir = join(import.meta.dir, "..", "examples", "band-score");
const buildScript = join(exampleDir, "build.ts");
const referenceScript = join(exampleDir, "reference.py");
const committedPage = join(exampleDir, "page.html");
const systemTmp = tmpdir();
const workDir = await mkdtemp(join(systemTmp, "vc-band-"));
const pagePath = join(workDir, "page.html");
afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function run(command: string[]): Promise<string> {
  const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${command.join(" ")} failed: ${err}`);
  return out;
}

/** Builds the page once per test run, into a temporary file, the way a reader would: `bun build.ts out.html`. */
let building: Promise<string> | undefined;
function built(): Promise<string> {
  building ??= run(["bun", buildScript, pagePath]);
  return building;
}

async function withPage(options: { width: number; height: number; javaScriptEnabled?: boolean; reducedMotion?: "reduce" | "no-preference" }, body: (page: Page, browser: Browser) => Promise<void>): Promise<void> {
  await built();
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: options.width, height: options.height }, javaScriptEnabled: options.javaScriptEnabled, reducedMotion: options.reducedMotion });
    await page.goto(`file://${pagePath}`);
    await body(page, browser);
  } finally {
    await browser.close();
  }
}

type Snapshot = {
  headline: string;
  score: string;
  status: string;
  steps: { result: string; numbers: string }[];
  rangeLabel: string;
  rangeVars: string[];
  pinLabel: string;
  waffleLabel: string;
  filledCells: number;
  controls: string[];
  cards: string[];
};

/** Everything the reader can read about the current case. */
function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const text = (selector: string): string => document.querySelector(selector)?.textContent ?? "";
    const range = document.querySelector<HTMLElement>(".ui-range")!;
    const rangeVars = ["--lo", "--hi", "--at"].map((name) => range.style.getPropertyValue(name).trim());
    const steps = [...document.querySelectorAll(".ui-work > section")].map((section) => ({
      result: section.querySelector("header b")?.textContent ?? "",
      numbers: section.querySelector("output")?.textContent ?? "",
    }));
    const controls = ["size-n", "size-r", "reading-n", "reading-r"].map((id) => {
      const input = document.getElementById(id) as HTMLInputElement;
      return `${input.value}|${input.getAttribute("aria-valuetext") ?? ""}`;
    });
    const cards = [...document.querySelectorAll("button.ui-case")].map((card) => `${card.textContent}|${card.getAttribute("aria-pressed")}`);
    return {
      headline: text("#headline"),
      score: text("#score"),
      status: text("#status"),
      steps,
      rangeLabel: range.getAttribute("aria-label") ?? "",
      rangeVars,
      pinLabel: range.querySelector<HTMLElement>(".ui-range-pin")?.dataset.label ?? "",
      waffleLabel: document.querySelector(".ui-waffle")?.getAttribute("aria-label") ?? "",
      filledCells: document.querySelectorAll(".ui-waffle i.on").length,
      controls,
      cards,
    };
  });
}

const f1 = (v: number): string => v.toFixed(1);

function requireBand(m: BandResult): { lo: number; hi: number; score: number } {
  if (m.lo === null || m.hi === null || m.score === null) throw new Error("the model returned no band or no score");
  return { lo: m.lo, hi: m.hi, score: m.score };
}

test("build.ts writes a standalone page that matches the reference code and passes the shared-UI check", { retry: 2, timeout: 60_000 }, async () => {
  await built();
  const html = await readFile(pagePath, "utf8");
  const manifest = await loadManifest();
  const report = await checkPage(html, manifest);
  expect(report.errors).toEqual([]);
  expect(html).not.toContain("@@");
  expect(html).not.toMatch(/(href|src)="\/assets\//);

  // The static headline carries the number the reference code prints for the default case, not one typed into the template.
  const printed = await run(["python3", referenceScript, "75", "74"]);
  const expected = JSON.parse(printed) as BandResult;
  const { score } = requireBand(expected);
  expect(html).toContain(`scores <em>${f1(score)}</em>: ${expected.tone}`);

  // The committed example is what the build makes today.
  const committed = await readFile(committedPage, "utf8");
  expect(committed).toBe(html);
});

test.skipIf(skip)("the default case reads the same with JavaScript off, after JavaScript renders it, and after other values are tried", { retry: 2, timeout: 40_000 }, async () => {
  let plain: Snapshot | undefined;
  let plainButtons = 0;
  let stackedSteps: string[] = [];
  await withPage({ width: 1280, height: 900, javaScriptEnabled: false }, async (page) => {
    plain = await snapshot(page);
    plainButtons = await page.locator(".ui-work button").count();
    stackedSteps = await page.evaluate(() => [...document.querySelectorAll(".ui-work > section")].map((s) => getComputedStyle(s).opacity));
  });
  expect(stackedSteps).toEqual(["1", "1", "1", "1"]);
  expect(plainButtons).toBe(0);
  expect(plain!.headline).toBe("A 75 kW machine reading 74 % scores 74.9: warning");
  expect(plain!.steps.length).toBe(4);

  await withPage({ width: 1280, height: 900 }, async (page) => {
    const rendered = await snapshot(page);
    expect(rendered).toEqual(plain!);

    await page.fill("#size-n", "12.5");
    await page.fill("#reading-n", "58.3");
    const changed = await snapshot(page);
    expect(changed.headline).not.toBe(plain!.headline);

    await page.locator("button.ui-case", { hasText: "75 kW, 74 %" }).click();
    const back = await snapshot(page);
    expect(back).toEqual(plain!);
  });
});

test.skipIf(skip)("typing 12.5 kW and 58.3 % shows those numbers everywhere and the score the model returns", { retry: 2, timeout: 40_000 }, async () => {
  await withPage({ width: 1280, height: 900 }, async (page) => {
    await page.fill("#size-n", "12.5");
    await page.fill("#reading-n", "58.3");
    const m = await page.evaluate(() => globalThis.bandModel(12.5, 58.3));
    const { lo, hi, score } = requireBand(m);

    const shown = await snapshot(page);
    expect(shown.headline).toBe(`A 12.5 kW machine reading 58.3 % scores ${f1(score)}: ${m.tone}`);
    expect(shown.score).toBe(f1(score));
    expect(shown.steps[0]).toEqual({ result: "12.5 kW", numbers: "size_kw = 12.5" });
    expect(shown.steps[1].result).toBe(`${f1(lo)} to ${f1(hi)} %`);
    expect(shown.steps[1].numbers).toContain("ln(12.5) = ");
    expect(shown.steps[2].result).toBe(f1(score));
    expect(shown.rangeLabel).toBe(`Expected band ${f1(lo)} to ${f1(hi)} %, marker at 58.3 %`);
    const sliderValue = await page.inputValue("#size-r");
    expect(Number(sliderValue)).toBeGreaterThan(0);

    // Step 3's numbers are links to the numbers they came from, and a hand recomputation from them gives the shown score.
    const linked = await page.locator(".ui-work a.ui-ref").allInnerTexts();
    expect(linked.length).toBe(4);
    const [reading, low, high] = linked.map(Number);
    expect(reading).toBe(58.3);
    expect(low).toBe(Number(lo.toFixed(4)));
    expect(high).toBe(Number(hi.toFixed(4)));
    const recomputed = ((reading - low) / (high - low)) * 100;
    expect(f1(recomputed)).toBe(f1(score));
    expect(f1(recomputed)).toBe(shown.score);
    const lowTarget = await page.locator("#ln-low").innerText();
    const highTarget = await page.locator("#ln-high").innerText();
    expect(lowTarget).toContain(String(low));
    expect(highTarget).toContain(String(high));
  });
});

/** A small seeded generator (mulberry32), so the random inputs are the same on every run. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test.skipIf(skip)("step 3's printed numbers reproduce the shown score on 300 random inputs, clamped ones included", { retry: 2, timeout: 60_000 }, async () => {
  const next = seeded(20261119);
  const pairs: { size: number; reading: number }[] = [];
  for (let i = 0; i < 300; i++) {
    // Sizes spread evenly on a log scale from 0.5 to 5000, some with two decimals; readings 20 to 110, some with two decimals.
    const size = Math.exp(Math.log(0.5) + next() * (Math.log(5000) - Math.log(0.5)));
    const sizeDigits = next() < 0.5 ? 1 : 2;
    const reading = 20 + next() * 90;
    const readingDigits = next() < 0.5 ? 1 : 2;
    pairs.push({ size: Number(size.toFixed(sizeDigits)), reading: Number(reading.toFixed(readingDigits)) });
  }
  await withPage({ width: 1280, height: 900 }, async (page) => {
    const rows = await page.evaluate((inputs) => {
      const size = document.getElementById("size-n") as HTMLInputElement;
      const reading = document.getElementById("reading-n") as HTMLInputElement;
      return inputs.map((pair) => {
        size.value = String(pair.size);
        size.dispatchEvent(new Event("input", { bubbles: true }));
        reading.value = String(pair.reading);
        reading.dispatchEvent(new Event("input", { bubbles: true }));
        const numbers = [...document.querySelectorAll(".ui-work a.ui-ref")].slice(0, 3).map((a) => a.textContent ?? "");
        const kept = (document.querySelectorAll(".ui-work > section")[2].querySelector("output")?.textContent ?? "").includes("kept in 0 to 100");
        return { pair, numbers, kept, score: document.getElementById("score")?.textContent ?? "" };
      });
    }, pairs);
    const mismatches: string[] = [];
    let clamped = 0;
    for (const row of rows) {
      const [reading, low, high] = row.numbers.map(Number);
      const raw = ((reading - low) / (high - low)) * 100;
      const cut = Math.max(0, Math.min(100, raw));
      if (row.kept) clamped++;
      if (reading !== row.pair.reading || f1(cut) !== row.score) mismatches.push(`${row.pair.size} kW, ${row.pair.reading} %: printed numbers give ${f1(cut)}, page shows ${row.score}`);
    }
    expect(mismatches).toEqual([]);
    expect(rows.length).toBe(300);
    expect(clamped).toBeGreaterThan(20);
  });
});

test.skipIf(skip)("values outside the sliders still count; only the thumb and the axis stop at the ends", { retry: 2, timeout: 40_000 }, async () => {
  await withPage({ width: 1280, height: 900 }, async (page) => {
    await page.fill("#size-n", "5000");
    await page.fill("#reading-n", "110");
    const big = await page.evaluate(() => globalThis.bandModel(5000, 110));
    const bigBand = requireBand(big);
    const shown = await snapshot(page);
    expect(shown.headline).toBe(`A 5000 kW machine reading 110 % scores ${f1(bigBand.score)}: ${big.tone}`);
    // Each box shows what was typed; each slider's thumb stops at its end while its spoken value stays the typed one.
    expect(shown.controls).toEqual(["5000|", "100|5000 kilowatts", "110|", "100|110 percent"]);
    expect(shown.pinLabel).toBe("110.0 %");
    expect(shown.steps[2].numbers).toContain(`kept in 0 to 100 → ${f1(bigBand.score)}`);
    expect(shown.filledCells).toBe(100);
    const pinInside = await page.evaluate(() => {
      const bar = document.querySelector(".ui-range-bar")!.getBoundingClientRect();
      const pin = document.querySelector(".ui-range-pin")!.getBoundingClientRect();
      return pin.left >= bar.left - 1 && pin.right <= bar.right + 1;
    });
    expect(pinInside).toBe(true);

    await page.fill("#size-n", "0.5");
    await page.fill("#reading-n", "40");
    const small = await page.evaluate(() => globalThis.bandModel(0.5, 40));
    const smallBand = requireBand(small);
    const low = await snapshot(page);
    expect(low.headline).toBe(`A 0.5 kW machine reading 40 % scores ${f1(smallBand.score)}: ${small.tone}`);
    expect(low.controls).toEqual(["0.5|", "0|0.5 kilowatts", "40|", "40|40 percent"]);

    // A size of 0 has no band, so there is nothing to score and nothing to draw.
    await page.fill("#size-n", "0");
    const none = await snapshot(page);
    expect(none.headline).toBe("A machine of 0 kW has no expected band, so it has no score");
    expect(none.status).toBe("◌No data");
    const bandHidden = await page.locator(".ui-range").isHidden();
    expect(bandHidden).toBe(true);
  });
});

test.skipIf(skip)("a reading cut off at 0 shows the raw number and the cut; no reading shows no score", { retry: 2, timeout: 40_000 }, async () => {
  await withPage({ width: 1280, height: 900 }, async (page) => {
    await page.locator("button.ui-case", { hasText: "30 kW, 55.5 %" }).click();
    const cut = await snapshot(page);
    const raw = cut.steps[2].numbers.match(/≈ (-\d+\.\d{3})\nkept in 0 to 100 → 0\.0$/);
    expect(raw).not.toBeNull();
    expect(cut.score).toBe("0.0");
    expect(cut.status).toBe("▲Critical");
    expect(cut.steps[3].numbers).toBe("0.000 ≤ 50 → critical");
    expect(cut.filledCells).toBe(56);

    await page.locator("button.ui-case", { hasText: "55 kW, no reading" }).click();
    const empty = await snapshot(page);
    expect(empty.headline).toBe("A 55 kW machine with no reading has no score");
    expect(empty.score).toBe("—");
    expect(empty.status).toBe("◌No data");
    expect(empty.filledCells).toBe(0);
    expect(empty.steps[2].numbers).toBe("There is no reading, so there is nothing to place.");
    const readingDisabled = await page.locator("#reading-n").isDisabled();
    const checked = await page.locator("#none").isChecked();
    const pinHidden = await page.locator(".ui-range-pin").isHidden();
    expect(readingDisabled).toBe(true);
    expect(checked).toBe(true);
    expect(pinHidden).toBe(true);

    await page.locator("#none").uncheck();
    const back = await snapshot(page);
    expect(back.headline).toContain("scores");
    const enabled = await page.locator("#reading-n").isEnabled();
    expect(enabled).toBe(true);
  });
});

test.skipIf(skip)("a burst of changes makes one polite announcement, after the last change", { retry: 2, timeout: 40_000 }, async () => {
  await withPage({ width: 1280, height: 900 }, async (page) => {
    const before = await page.locator("#live").textContent();
    expect(before).toBe("");
    const result = await page.evaluate(async () => {
      const live = document.getElementById("live")!;
      let records = 0;
      const observer = new MutationObserver((list) => {
        records += list.length;
      });
      observer.observe(live, { childList: true, characterData: true, subtree: true });
      const box = document.getElementById("size-n") as HTMLInputElement;
      for (const value of ["10", "20", "30", "40", "50"]) {
        box.value = value;
        box.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const immediate = live.textContent ?? "";
      // Real time on purpose: the page announces 600 ms after the last change, and that debounce is what is under test.
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 1200);
      await promise;
      observer.disconnect();
      return { records, immediate, text: live.textContent ?? "", headline: document.getElementById("headline")?.textContent ?? "" };
    });
    const attrs = await page.evaluate(() => {
      const live = document.getElementById("live")!;
      return { role: live.getAttribute("role"), polite: live.getAttribute("aria-live") };
    });
    expect(result.immediate).toBe("");
    expect(result.records).toBe(1);
    expect(result.text).toBe(result.headline);
    expect(result.text).toContain("50 kW");
    expect(attrs).toEqual({ role: "status", polite: "polite" });
  });
});

test.skipIf(skip)("Back and Next step through the calculation with the reader's numbers, and a number jumps to its source", { retry: 2, timeout: 40_000 }, async () => {
  await withPage({ width: 1280, height: 900 }, async (page) => {
    const status = page.locator(".ui-work-bar [role=status]");
    const back = page.locator(".ui-work-bar button", { hasText: "Back" });
    const next = page.locator(".ui-work-bar button", { hasText: "Next" });
    const dimmed = page.locator(".ui-work > section.pending");

    const first = await status.innerText();
    expect(first).toBe("All steps shown.");
    await back.click();
    const third = await status.innerText();
    const dimmedAtThree = await dimmed.count();
    expect(third).toBe("Step 3 of 4: Place the reading, 74.9.");
    expect(dimmedAtThree).toBe(1);
    await back.click();
    const second = await status.innerText();
    expect(second).toBe("Step 2 of 4: Expected band, 63.7 to 77.4 %.");
    await next.click();
    const again = await status.innerText();
    expect(again).toBe("Step 3 of 4: Place the reading, 74.9.");

    // New numbers flow into the same steps.
    await page.fill("#size-n", "12.5");
    await page.fill("#reading-n", "58.3");
    const m = await page.evaluate(() => globalThis.bandModel(12.5, 58.3));
    const { score } = requireBand(m);
    await back.click();
    const bandResult = await page.locator(".ui-work > section").nth(1).locator("header b").innerText();
    const live = await status.innerText();
    expect(live).toBe(`Step 2 of 4: Expected band, ${bandResult}.`);
    await next.click();
    const placed = await status.innerText();
    expect(placed).toBe(`Step 3 of 4: Place the reading, ${f1(score)}.`);

    // A number in step 3 jumps to where it came from and flashes it for a moment.
    const refs = page.locator(".ui-work a.ui-ref");
    await refs.nth(0).click();
    const readingFlash = await page.locator("#reading-n").evaluate((el) => el.classList.contains("ui-flash"));
    expect(readingFlash).toBe(true);
    await refs.nth(1).click();
    const lowFlash = await page.locator("#ln-low").evaluate((el) => el.classList.contains("ui-flash"));
    expect(lowFlash).toBe(true);
    await page.waitForFunction(() => !document.getElementById("ln-low")!.classList.contains("ui-flash"), undefined, { timeout: 4000 });
  });
});

test.skipIf(skip)("the page fits 320px and 1280px, keeps type at 11px or more, and works from the keyboard", { retry: 2, timeout: 60_000 }, async () => {
  for (const width of [320, 1280]) {
    await withPage({ width, height: 800 }, async (page) => {
      const wide = async (): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const overflowAtStart = await wide();
      expect(overflowAtStart).toBeLessThanOrEqual(0);
      await page.fill("#size-n", "123456789.123");
      await page.fill("#reading-n", "98765.4321");
      const overflowAfter = await wide();
      expect(overflowAfter).toBeLessThanOrEqual(0);

      const smallest = await page.evaluate(() => {
        let min = Infinity;
        for (const el of document.querySelectorAll<HTMLElement>("body *")) {
          if (el.closest("script, style, noscript, .sr") || el.hidden) continue;
          const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
          if (!own) continue;
          const style = getComputedStyle(el);
          const size = parseFloat(style.fontSize);
          if (size < min) min = size;
        }
        return min;
      });
      expect(smallest).toBeGreaterThanOrEqual(11);
    });
  }

  await withPage({ width: 1280, height: 900 }, async (page) => {
    const facts = await page.evaluate(() => {
      const levels = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => Number(h.tagName.slice(1)));
      const inputs = [...document.querySelectorAll<HTMLInputElement>("input")];
      const unnamed = inputs.filter((i) => !i.getAttribute("aria-label") && (i.labels?.length ?? 0) === 0).length;
      const glyphs = [...document.querySelectorAll(".ui-status i")];
      return {
        lang: document.documentElement.lang,
        levels,
        unnamed,
        glyphsHidden: glyphs.every((g) => g.getAttribute("aria-hidden") === "true"),
        valuetext: ["size-r", "reading-r"].map((id) => document.getElementById(id)!.getAttribute("aria-valuetext") ?? ""),
      };
    });
    expect(facts.lang).toBe("en");
    expect(facts.levels[0]).toBe(1);
    expect(facts.levels.filter((l) => l === 1).length).toBe(1);
    facts.levels.slice(1).forEach((level, i) => expect(level).toBeLessThanOrEqual(facts.levels[i] + 1));
    expect(facts.unnamed).toBe(0);
    expect(facts.glyphsHidden).toBe(true);
    expect(facts.valuetext).toEqual(["75 kilowatts", "74 percent"]);

    // The size slider moves the size from the keyboard, and the number box follows.
    const before = await page.inputValue("#size-n");
    await page.focus("#size-r");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const after = await page.inputValue("#size-n");
    const headline = await page.locator("#headline").innerText();
    expect(Number(after)).toBeGreaterThan(Number(before));
    expect(headline).toContain(`${after} kW`);

    // A case card is a button: Enter on it loads the case.
    await page.locator("button.ui-case", { hasText: "160 kW, 80.5 %" }).focus();
    await page.keyboard.press("Enter");
    const loaded = await page.locator("#headline").innerText();
    expect(loaded).toContain("A 160 kW machine reading 80.5 %");
  });

  // Motion: the band glides only when the reader has not asked for less motion.
  const durations: string[] = [];
  for (const motion of ["no-preference", "reduce"] as const) {
    await withPage({ width: 1280, height: 900, reducedMotion: motion }, async (page) => {
      const duration = await page.evaluate(() => getComputedStyle(document.querySelector(".ui-range")!).transitionDuration);
      durations.push(duration);
    });
  }
  expect(durations[0]).not.toBe("0s");
  expect(durations[1]).toBe("0s");
});
