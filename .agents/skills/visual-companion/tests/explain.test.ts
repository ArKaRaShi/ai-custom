import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { playwright } from "./playwright";

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


/** One section per content block, with values the tests read back from the page. */
const contentLesson = {
  title: "What changed in the retry policy",
  answer: "Retries now back off exponentially instead of waiting a fixed second.",
  sections: [
    {
      id: "check",
      title: "Check yourself",
      blocks: [{ type: "Quiz", question: "What does the fourth retry wait?", options: ["1 s", "4 s", "8 s"], answer: 1, why: "0.5 s doubled three times is 4 s." }],
    },
    {
      id: "sources",
      title: "Where the numbers come from",
      blocks: [
        {
          type: "Evidence",
          rows: [
            { claim: "Base delay", value: "0.5 s", source: "retry.py:12" },
            { claim: "Ceiling is never reached in practice", value: "30 s", source: "logs 2026-11-01", inferred: true },
          ],
        },
      ],
    },
    {
      id: "diff",
      title: "Old next to new",
      blocks: [
        { type: "Compare", before: "v1", after: "v2", rows: [{ label: "Delay", before: "1 s fixed", after: "0.5 s doubling" }, { label: "Attempts", before: "5", after: "5" }] },
        { type: "Chart", unit: "s", bars: [{ label: "v1 total wait", value: 5, tone: "bad" }, { label: "v2 total wait", value: 1234.5678, tone: "good" }] },
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

test("a safe SVG illustration publishes", async () => {
  await start();
  const example = structuredClone(lesson);
  example.sections[0]!.blocks = [{ type: "Svg", markup: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="var(--primary)"/></svg>' }];
  const result = await explain(example);
  expect(result.code).toBe(0);
}, 30_000);
test("unsafe SVG is rejected at its section, block, and markup field", async () => {
  await start();
  const attacks = [
    '<svg><script>alert(1)</script></svg>',
    '<svg><circle onload="alert(1)"/></svg>',
    '<svg><image href="https://example.com/a.svg"/></svg>',
    '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><circle fill="url(https://example.com/a.svg)"/></svg>',
    '<svg><foreignObject><div>unsafe</div></foreignObject></svg>',
    '<svg aria-label="A --&gt; B"><circle r="4"/></svg>',
  ];
  for (const markup of attacks) {
    const example = structuredClone(lesson);
    example.sections[0]!.blocks = [{ type: "Svg", markup }];
    const result = await explain(example);
    expect(result.code).toBe(1);
    expect(result.err).toContain('sections[0] "idea" > blocks[0] (Svg) > markup');
  }
}, 30_000);


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


describe("given content blocks, when they are published, then each validates against the catalog", () => {
  test("a lesson with Quiz, Evidence, Compare and Chart publishes", async () => {
    await start();
    expect((await explain(contentLesson)).code).toBe(0);
  }, 30_000);

  test("invalid props in each content block fail with a located message", async () => {
    await start();
    const cases: [(lesson: typeof contentLesson) => void, string][] = [
      [(l) => Object.assign(l.sections[0]!.blocks[0]!, { answer: 3 }), 'sections[0] "check" > blocks[0] (Quiz) > answer: answer 3 is not one of the 3 options'],
      [(l) => Object.assign(l.sections[1]!.blocks[0]!.rows![0]!, { source: "" }), 'sections[1] "sources" > blocks[0] (Evidence) > rows[0] > source'],
      [(l) => Object.assign(l.sections[2]!.blocks[0]!, { after: undefined }), 'sections[2] "diff" > blocks[0] (Compare) > after'],
      [(l) => Object.assign(l.sections[2]!.blocks[1]!.bars![0]!, { tone: "red" }), 'sections[2] "diff" > blocks[1] (Chart) > bars[0] > tone'],
    ];
    for (const [breakIt, location] of cases) {
      const lesson = structuredClone(contentLesson);
      breakIt(lesson);
      const result = await explain(lesson);
      expect(result.code).toBe(1);
      expect(result.err).toContain(location);
    }
  }, 30_000);
});


describe("given spec text that could misuse the evaluator or the terminal, when it is published, then explain refuses it", () => {
  test("formulas may only do arithmetic: no mathjs configuration, no parser re-entry, no matrices, no recursion", async () => {
    await start();
    const cases: [(lesson: typeof pumpLesson) => void, string][] = [
      [(l) => Object.assign(l.sections[0]!.blocks[1]!.steps![0]!, { expr: 'config({number: "BigNumber"})' }), "function config is not allowed"],
      [(l) => Object.assign(l.sections[0]!.blocks[1]!.steps![0]!, { expr: 'evaluate("1+1")' }), "function evaluate is not allowed"],
      [(l) => Object.assign(l.sections[0]!.blocks[1]!.steps![0]!, { expr: "zeros(P, P)" }), "function zeros is not allowed"],
      [(l) => Object.assign(l.sections[0]!.blocks[1]!.steps![0]!, { expr: "1:1000000" }), "RangeNode is not allowed"],
      [(l) => l.functions.push("f(n) = f(n - 1) + f(n - 1)"), "functions[1]: function f is not allowed"],
    ];
    for (const [breakIt, message] of cases) {
      const lesson = structuredClone(pumpLesson);
      breakIt(lesson);
      const result = await explain(lesson);
      expect(result.code).toBe(1);
      expect(result.err).toContain(message);
    }
  }, 30_000);

  test("control characters in spec text and reserved input names are rejected", async () => {
    await start();
    const escape = structuredClone(pumpLesson);
    escape.title = "Head \u001b]52;c;aGk=\u0007";
    const first = await explain(escape);
    expect(first.code).toBe(1);
    expect(first.err).toContain("title: remove control characters");
    expect(first.err).not.toContain("\u001b");

    const reserved = structuredClone(pumpLesson);
    reserved.inputs[0]!.key = "__proto__";
    const second = await explain(reserved);
    expect(second.code).toBe(1);
    expect(second.err).toContain("this name is reserved");
  }, 30_000);
});

// Optional browser seam, like theme-browser.test.ts: needs Google Chrome and the explain/ dev dependencies.
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe("given a published lesson, when it opens in a headless browser, then the Explain page renders", () => {
test.skipIf(!playwright || !existsSync(chrome))("an SVG illustration renders inside its section using theme colors", async () => {
  const url = await start();
  const example = structuredClone(lesson);
  example.sections[0]!.blocks = [{ type: "Svg", markup: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="var(--primary)"/></svg>' }];
  expect((await explain(example)).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    const circle = page.locator("#idea [data-block=Svg] svg circle");
    await circle.waitFor();
    const colors = await circle.evaluate((element) => {
      const reference = document.createElement("span");
      reference.style.color = "var(--primary)";
      element.parentElement!.appendChild(reference);
      return { fill: getComputedStyle(element).fill, primary: getComputedStyle(reference).color };
    });
    expect(colors.fill).toBe(colors.primary);
  } finally {
    await browser.close();
  }
}, 60_000);
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
test.skipIf(!playwright || !existsSync(chrome))("a typed number outside the input's range is pulled back to the range when the field loses focus", async () => {
  const url = await start();
  expect((await explain(pumpLesson)).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForSelector("[data-block=Derivation]");
    const field = page.locator("[data-input=P]");
    const pascal = async (): Promise<number> => Number(await page.locator("[data-step=Pa]").getAttribute("data-value"));

    // P runs 0..10 bar. "12" passes through "1" (in range, applied live) on the way.
    await field.fill("");
    await field.pressSequentially("12");
    expect(await field.inputValue()).toBe("12");
    await field.blur();
    expect(await field.inputValue()).toBe("10");
    expect(await pascal()).toBeCloseTo(1_000_000, 6);

    await field.fill("-3");
    await field.blur();
    expect(await field.inputValue()).toBe("0");
    expect(await pascal()).toBe(0);
  } finally {
    await browser.close();
  }
}, 60_000);
test.skipIf(!playwright || !existsSync(chrome))("the quiz reveals its answer only after a pick; evidence, compare and chart show the spec's values", async () => {
  const url = await start();
  expect((await explain(contentLesson)).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForSelector("[data-block=Chart]");

    const quiz = page.locator("[data-block=Quiz]");
    expect(await quiz.locator("[data-quiz-why]").count()).toBe(0);
    expect(await quiz.locator("[data-result]").count()).toBe(0);
    await quiz.getByRole("button", { name: /8 s/ }).click();
    await quiz.locator("[data-quiz-why]").waitFor();
    expect(await quiz.locator("[data-result=wrong]").textContent()).toContain("8 s");
    expect(await quiz.locator("[data-result=right]").textContent()).toContain("4 s");
    expect(await quiz.getByLabel("Correct").count()).toBe(1);
    expect(await quiz.getByLabel("Your pick").count()).toBe(1);
    expect(await quiz.locator("button:enabled").count()).toBe(0);

    const evidence = page.locator("[data-block=Evidence] tbody tr");
    expect(await evidence.nth(0).textContent()).toContain("retry.py:12");
    expect(await evidence.nth(0).getAttribute("data-inferred")).toBeNull();
    expect(await evidence.nth(1).getAttribute("data-inferred")).toBe("true");
    expect(await evidence.nth(1).textContent()).toContain("Inference");

    const compare = page.locator("[data-block=Compare] tbody tr");
    expect(await compare.nth(0).textContent()).toBe("Delay1 s fixed0.5 s doubling");
    expect(await compare.nth(0).getAttribute("data-changed")).toBe("true");
    expect(await compare.nth(1).getAttribute("data-changed")).toBeNull();

    const chart = page.locator("[data-block=Chart]");
    // Recharts draws bars after measuring its container, a frame after the block mounts.
    await chart.locator(".recharts-bar-rectangle").nth(1).waitFor();
    expect(await chart.locator("[data-chart-values] li").allTextContents()).toEqual(["v1 total wait: 5 s", "v2 total wait: 1,234.5678 s"]);
    expect(await chart.locator(".recharts-bar-rectangle").count()).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);
});
