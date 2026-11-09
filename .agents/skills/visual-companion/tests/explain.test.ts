import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "scripts", "cli.ts");

type Block = Record<string, unknown>;
const lesson: { title: string; subtitle: string; answer: string; sections: { id: string; title: string; blocks: Block[] }[] } = {
  title: "How retries back off",
  subtitle: "One failed request, followed through",
  answer: "Each retry waits twice as long as the last, up to a ceiling.",
  sections: [
    {
      id: "idea",
      title: "The idea",
      blocks: [{ type: "Concept", simple: "Wait longer each time you knock.", expert: "Delay doubles per attempt, capped.", tex: "d = \\min(c, b \\cdot 2^{n})" }],
    },
    { id: "ceiling", title: "The ceiling", blocks: [{ type: "Concept", simple: "Never wait forever.", expert: "The cap bounds the delay." }] },
    // "idea-0" reads like the first block of "idea"; both sections must still render.
    { id: "idea-0", title: "Jitter", blocks: [{ type: "Concept", simple: "Do not all knock at once.", expert: "Randomness spreads retries." }] },
  ],
};


/** A lesson with units and a spec function. Expected values come from hand arithmetic, not the evaluator. */
const pumpLesson = {
  title: "Where pump head comes from",
  answer: "Head is the pressure rise expressed as a height of water.",
  inputs: [
    { key: "P", label: "Pressure rise", value: 3.27, min: 0, max: 10, step: 0.01, unit: "bar" },
    { key: "Q", label: "Flow", value: 0.05, min: 0, max: 0.2, step: 0.001, unit: "m^3/s" },
  ],
  functions: ["head(p) = p / (1000 kg/m^3 * 9.80665 m/s^2)"],
  sections: [
    {
      id: "work",
      title: "The work",
      blocks: [
        { type: "Playground", presets: [{ label: "Higher pressure", icon: "gauge", set: { P: 4 } }] },
        {
          type: "Derivation",
          steps: [
            { id: "Pa", title: "Pressure in pascal", plain: "Same pressure, SI units.", ref: "pump.py:10", expr: "P", unit: "Pa" },
            { id: "H", title: "Head", plain: "Pressure as stairs.", ref: "pump.py:12", expr: "head(P)", unit: "m" },
            { id: "Ph", title: "Hydraulic power", plain: "Buckets times stairs.", ref: "pump.py:14", expr: "1000 kg/m^3 * 9.80665 m/s^2 * Q * H", unit: "kW" },
            { id: "fill", title: "Time per cubic metre", plain: "How long one cubic metre takes.", ref: "pump.py:16", expr: "1 m^3 / Q", unit: "s" },
          ],
        },
      ],
    },
  ],
};

let project = "";
beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "vc-explain-"));
});
afterEach(async () => {
  await run(["stop", "--project-dir", project]);
  await rm(project, { recursive: true, force: true });
});

async function run(args: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["bun", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, out, err };
}

async function start(): Promise<string> {
  const started = await run(["start", "--project-dir", project, "--json"]);
  expect(started.code).toBe(0);
  const info: { url: string } = JSON.parse(started.out);
  return info.url;
}

async function explain(spec: unknown): Promise<{ code: number; out: string; err: string }> {
  const file = join(project, "lesson.json");
  await writeFile(file, JSON.stringify(spec));
  return run(["explain", file, "--project-dir", project, "--json"]);
}

describe("given a running session, when a lesson spec is published with explain, then it is validated and served", () => {
  test("publishes a valid lesson with the same result shape as push", async () => {
    const url = await start();
    const result = await explain(lesson);
    expect(result.code).toBe(0);
    const screen: Record<string, unknown> = JSON.parse(result.out);
    expect(screen).toMatchObject({ screenId: 1, title: "How retries back off" });
    const pushed = join(project, "plain.html");
    await writeFile(pushed, "<!doctype html><html><body>x</body></html>");
    const pushedResult = await run(["push", pushed, "--project-dir", project, "--json"]);
    const push: Record<string, unknown> = JSON.parse(pushedResult.out);
    expect(Object.keys(screen).sort()).toEqual(Object.keys(push).sort());

    // The served page is the lesson published before the push.
    await run(["explain", join(project, "lesson.json"), "--project-dir", project]);
    const page = await (await fetch(url)).text();
    expect(page).toContain("/assets/explain/renderer.js");
    expect(page).toContain("Each retry waits twice as long");
    const key = new URL(url).searchParams.get("key");
    const asset = await fetch(new URL(`/assets/explain/renderer.js?key=${key}`, url));
    expect(asset.status).toBe(200);
  }, 30_000);

  test("names the section, block and field of an invalid spec and publishes nothing", async () => {
    const url = await start();
    const missingField = structuredClone(lesson);
    delete missingField.sections[1]!.blocks[0]!.expert;
    const result = await explain(missingField);
    expect(result.code).toBe(1);
    expect(result.err).toContain('sections[1] "ceiling" > blocks[0] (Concept) > expert');
    expect(await (await fetch(url)).text()).not.toContain("How retries back off");

    const unknownType = structuredClone(lesson);
    unknownType.sections[0]!.blocks[0]!.type = "Chart";
    const second = await explain(unknownType);
    expect(second.code).toBe(1);
    expect(second.err).toContain('sections[0] "idea" > blocks[0] (Chart)');
  }, 30_000);

  test("rejects duplicate section ids and files that are not JSON", async () => {
    await start();
    const duplicate = structuredClone(lesson);
    duplicate.sections[1]!.id = "idea";
    const result = await explain(duplicate);
    expect(result.code).toBe(1);
    expect(result.err).toContain('duplicate section id "idea"');

    const file = join(project, "broken.json");
    await writeFile(file, "{ not json");
    const broken = await run(["explain", file, "--project-dir", project]);
    expect(broken.code).toBe(1);
    expect(broken.err).toContain("cannot read");
    expect((await run(["explain", "--project-dir", project])).code).toBe(2);
  }, 30_000);
});


describe("given a lesson with a derivation, when it is published with explain, then every step is evaluated before publishing", () => {
  test("a valid derivation with units and a spec function publishes", async () => {
    await start();
    expect((await explain(pumpLesson)).code).toBe(0);
  }, 30_000);

  test("a step that uses an unknown name is reported by section, block and step, and nothing publishes", async () => {
    const url = await start();
    const broken = structuredClone(pumpLesson);
    broken.sections[0]!.blocks[1]!.steps![1]!.expr = "head(Pressure)";
    const result = await explain(broken);
    expect(result.code).toBe(1);
    expect(result.err).toContain('sections[0] "work" > blocks[1] (Derivation) > steps[1] "H": Undefined symbol Pressure');
    const page = await (await fetch(url)).text();
    expect(page).not.toContain("Where pump head comes from");
  }, 30_000);

  test("a result with a unit but no step unit, or a unit that does not convert, is rejected", async () => {
    await start();
    const noUnit = structuredClone(pumpLesson);
    delete noUnit.sections[0]!.blocks[1]!.steps![0]!.unit;
    const first = await explain(noUnit);
    expect(first.code).toBe(1);
    expect(first.err).toContain('steps[0] "Pa": result has a unit');

    const wrongUnit = structuredClone(pumpLesson);
    wrongUnit.sections[0]!.blocks[1]!.steps![1]!.unit = "kW";
    const second = await explain(wrongUnit);
    expect(second.code).toBe(1);
    expect(second.err).toContain('steps[1] "H"');
  }, 30_000);

  test("a Derivation outside the Playground's section is rejected", async () => {
    await start();
    const split = structuredClone(pumpLesson);
    const derivation = split.sections[0]!.blocks.pop()!;
    split.sections.push({ id: "later", title: "Later", blocks: [derivation] });
    const result = await explain(split);
    expect(result.code).toBe(1);
    expect(result.err).toContain('sections[1] "later" > blocks[0] (Derivation): put this Derivation after the Playground');
  }, 30_000);

  test("a preset that sets an unknown input is rejected", async () => {
    await start();
    const badPreset = structuredClone(pumpLesson);
    badPreset.sections[0]!.blocks[0]!.presets![0]!.set = { Pressure: 4 };
    const result = await explain(badPreset);
    expect(result.code).toBe(1);
    expect(result.err).toContain('no input named "Pressure"');
  }, 30_000);
});


describe("given derivation steps with expected values from the real code, when the lesson is published, then results must match them", () => {
  // Expected values computed outside the evaluator: 327000 / 9806.65 and 1000 * 9.80665 * 0.05 * H / 1000.
  const withExpect = (h: number) => {
    const lesson = structuredClone(pumpLesson);
    const steps = lesson.sections[0]!.blocks[1]!.steps!;
    Object.assign(steps[0]!, { expect: 327_000 });
    Object.assign(steps[1]!, { expect: h });
    Object.assign(steps[2]!, { expect: 16.35 });
    return lesson;
  };

  test("matching expected values publish normally", async () => {
    await start();
    expect((await explain(withExpect(33.34472016437825))).code).toBe(0);
  }, 30_000);

  test("a mismatched expected value names the step, both values, and publishes nothing", async () => {
    const url = await start();
    const result = await explain(withExpect(33.9));
    expect(result.code).toBe(1);
    expect(result.err).toContain('steps[1] "H"');
    expect(result.err).toContain("expected 33.9");
    expect(result.err).toContain("computed 33.3447");
    const page = await (await fetch(url)).text();
    expect(page).not.toContain("Where pump head comes from");
  }, 30_000);
});

// Optional browser seam, like theme-browser.test.ts: needs Google Chrome and the explain/ dev dependencies.
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let playwright: typeof import("playwright") | undefined;
try {
  const explainRequire = createRequire(join(import.meta.dir, "..", "explain", "package.json"));
  playwright = explainRequire("playwright");
} catch {}

describe("given a published lesson, when it opens in a headless browser, then the Explain page renders", () => {
test.skipIf(!playwright || !existsSync(chrome))("the rendered lesson shows the answer first, every section in the rail, and the formula", async () => {
  const url = await start();
  expect((await explain(lesson)).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForSelector("[data-block=Concept]");
    expect(errors).toEqual([]);

    const order = await page.evaluate(() => [...document.querySelectorAll("main [data-block], main section")].map((n) => n.getAttribute("data-block") ?? n.id));
    expect(order[0]).toBe("Answer");
    expect(await page.locator("nav[aria-label=Sections] a").evaluateAll((links: HTMLAnchorElement[]) => links.map((a) => a.getAttribute("aria-label")))).toEqual(["1. The idea", "2. The ceiling", "3. Jitter"]);
    expect(await page.locator(".katex").count()).toBeGreaterThan(0);

    expect(await page.locator("[data-block=Concept]").count()).toBe(3);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => document.querySelector("nav[aria-label=Sections] a[aria-current=location]")?.getAttribute("href") === "#idea-0");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.waitForSelector("[data-slot=tooltip-content]");
  } finally {
    await browser.close();
  }
}, 60_000);
test.skipIf(!playwright || !existsSync(chrome))("changing an input recomputes the derivation; presets and Reset set the inputs; the Playground stays in view", async () => {
  const url = await start();
  expect((await explain(pumpLesson)).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
    const errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForSelector("[data-block=Derivation]");
    const value = async (id: string): Promise<number> => {
      const text = await page.locator(`[data-step=${id}]`).getAttribute("data-value");
      return Number(text);
    };

    // 3.27 bar = 327,000 Pa; 327,000 / (1000 * 9.80665) = 33.3447 m; 1000 * 9.80665 * 0.05 * 33.3447 / 1000 = 16.35 kW.
    expect(await value("Pa")).toBeCloseTo(327_000, 6);
    expect(await value("H")).toBeCloseTo(33.3447, 3);
    expect(await value("Ph")).toBeCloseTo(16.35, 6);
    expect(await page.locator("[data-step=H] [data-old]").count()).toBe(0);

    await page.locator("[data-input=P]").fill("4");
    await page.waitForSelector("[data-step=H] [data-old]");
    // 400,000 / 9,806.65 = 40.7886 m.
    expect(await value("H")).toBeCloseTo(40.7886, 3);
    const oldText = await page.locator("[data-step=H] [data-old]").textContent();
    const newText = await page.locator("[data-step=H] [data-new]").textContent();
    expect(oldText).toBe("33.345");
    expect(newText).toBe("40.789");

    await page.getByRole("button", { name: "Reset" }).click();
    await page.waitForSelector("[data-step=H] [data-old]", { state: "detached" });
    expect(await value("H")).toBeCloseTo(33.3447, 3);

    await page.getByRole("button", { name: "Higher pressure" }).click();
    await page.waitForSelector("[data-step=H] [data-old]");
    expect(await page.locator("[data-input=P]").inputValue()).toBe("4");
    expect(await page.locator("[data-input=Q]").inputValue()).toBe("0.05");

    // Q = 0 makes "fill" infinite: earlier steps keep their results, only "fill" reports the problem.
    await page.locator("[data-input=Q]").fill("0");
    await page.waitForSelector("[data-step=fill] [data-step-error=fill]");
    expect(await value("H")).toBeCloseTo(40.7886, 3);
    expect(await value("Ph")).toBe(0);
    expect(await page.locator("[data-step=fill]").getAttribute("data-value")).toBeNull();
    await page.locator("[data-input=Q]").fill("0.05");

    await page.locator("[data-step=Ph]").scrollIntoViewIfNeeded();
    const top = await page.locator("[data-block=Playground]").evaluate((el: HTMLElement) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(40);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);
test.skipIf(!playwright || !existsSync(chrome))("a lesson whose expected values match shows no mismatch warning, before or after inputs change", async () => {
  const url = await start();
  const lesson = structuredClone(pumpLesson);
  const steps = lesson.sections[0]!.blocks[1]!.steps!;
  Object.assign(steps[0]!, { expect: 327_000 });
  Object.assign(steps[1]!, { expect: 33.34472016437825 });
  expect((await explain(lesson)).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForSelector("[data-block=Derivation]");
    expect(await page.locator("[data-expect-mismatch]").count()).toBe(0);
    await page.locator("[data-input=P]").fill("4");
    await page.waitForSelector("[data-step=H] [data-old]");
    expect(await page.locator("[data-expect-mismatch]").count()).toBe(0);
  } finally {
    await browser.close();
  }
}, 60_000);
});
