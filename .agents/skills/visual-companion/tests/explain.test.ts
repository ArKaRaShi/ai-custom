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
});
