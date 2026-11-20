import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator } from "playwright";
import { playwright } from "./playwright";

const CLI = join(import.meta.dir, "..", "scripts", "cli.ts");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const nodes = [
  { id: "api", label: "API" },
  { id: "service", label: "Service" },
  { id: "db", label: "Database" },
];

/** Left-to-right request path, with a step per hop. */
const path = {
  alt: "A request goes from the API to the service, which stores it in the database",
  nodes,
  edges: [
    { id: "call", source: "api", target: "service", label: "request" },
    { id: "store", source: "service", target: "db", label: "store" },
  ],
  steps: [
    { label: "Request", focus: ["api", "service"] },
    { label: "Storage", focus: ["service", "db"] },
  ],
};

/** A retry loop (worker back to client), a self loop, and two parallel edges, laid out top to bottom. */
const tangled = {
  alt: "The worker retries through the client, and two routes reach the worker",
  nodes: [
    { id: "client", label: "Client" },
    { id: "gateway", label: "Gateway" },
    { id: "worker", label: "Worker" },
  ],
  edges: [
    { id: "forward", source: "client", target: "gateway" },
    { id: "route-a", source: "gateway", target: "worker", label: "route A" },
    { id: "route-b", source: "gateway", target: "worker", label: "route B" },
    { id: "retry", source: "worker", target: "client", label: "retry" },
    { id: "tick", source: "worker", target: "worker" },
  ],
  direction: "TB",
};

/** One parent over four children: the shape automatic routing lays out worst. */
const tree = {
  alt: "A gateway feeds four services",
  nodes: [
    { id: "gateway", label: "Gateway" },
    { id: "billing", label: "Billing" },
    { id: "catalog", label: "Catalog" },
    { id: "search", label: "Search" },
    { id: "notify", label: "Notifications" },
  ],
  edges: [
    { id: "to-billing", source: "gateway", target: "billing" },
    { id: "to-catalog", source: "gateway", target: "catalog" },
    { id: "to-search", source: "gateway", target: "search" },
    { id: "to-notify", source: "gateway", target: "notify" },
  ],
  direction: "TB",
};

function lesson(blocks: Record<string, unknown>[]) {
  return {
    title: "Diagram lesson",
    answer: "Follow the connections.",
    sections: [{ id: "diagrams", title: "Diagrams", blocks }],
  };
}

let project = "";
beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "vc-explain-diagram-"));
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
  const result = await run(["start", "--project-dir", project, "--json"]);
  expect(result.code).toBe(0);
  const info: { url: string } = JSON.parse(result.out);
  return info.url;
}

async function publish(spec: unknown): Promise<{ code: number; out: string; err: string }> {
  const file = join(project, "lesson.json");
  await writeFile(file, JSON.stringify(spec));
  return run(["explain", file, "--project-dir", project, "--json"]);
}

/** Node id -> the attribute's value, for the nodes a reach or step action marked. */
async function marked(block: Locator, attribute: string) {
  const rows = await block.locator(`[data-node][${attribute}]`).evaluateAll((nodes: Element[], name: string) =>
    nodes.map((node): [string, string | null] => [node.getAttribute("data-node") ?? "", node.getAttribute(name)]), attribute);
  return Object.fromEntries(rows);
}

test("CLI publishes diagrams whose edges close loops, repeat between the same pair and name no node", async () => {
  await start();
  const solo = { type: "Diagram", alt: "A single unconnected box", nodes: [{ id: "solo", label: "Solo" }], edges: [] };
  const result = await publish(lesson([{ type: "Diagram", ...path }, { type: "Diagram", ...tangled }, solo]));
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out)).toMatchObject({ title: "Diagram lesson" });
}, 30_000);

test("CLI rejects broken diagram props at the field that broke", async () => {
  await start();
  const node = { id: "a", label: "A" };
  const cases: { name: string; props: Record<string, unknown>; at: string; says?: string }[] = [
    { name: "no alt", props: { nodes: [node], edges: [] }, at: "alt" },
    { name: "no nodes", props: { alt: "A diagram", edges: [] }, at: "nodes" },
    { name: "empty nodes", props: { alt: "A diagram", nodes: [], edges: [] }, at: "nodes" },
    { name: "blank node id", props: { alt: "A diagram", nodes: [{ id: " ", label: "Blank" }], edges: [] }, at: 'nodes[0] " " > id' },
    { name: "node without a label", props: { alt: "A diagram", nodes: [{ id: "a" }], edges: [] }, at: 'nodes[0] "a" > label' },
    {
      name: "duplicate node ids",
      props: { alt: "A diagram", nodes: [node, { id: "a", label: "Again" }], edges: [] },
      at: 'nodes[1] "a" > id',
      says: 'duplicate node id "a"',
    },
    {
      name: "edge to a node that does not exist",
      props: { alt: "A diagram", nodes: [node], edges: [{ id: "hop", source: "a", target: "b" }] },
      at: 'edges[0] "hop" > target',
      says: '"b" is not one of the node ids',
    },
    {
      name: "edge from a node that does not exist",
      props: { alt: "A diagram", nodes: [node], edges: [{ id: "hop", source: "b", target: "a" }] },
      at: 'edges[0] "hop" > source',
      says: '"b" is not one of the node ids',
    },
    {
      name: "duplicate edge ids",
      props: { alt: "A diagram", nodes: [node], edges: [{ id: "hop", source: "a", target: "a" }, { id: "hop", source: "a", target: "a" }] },
      at: 'edges[1] "hop" > id',
      says: 'duplicate edge id "hop"',
    },
    {
      name: "step focus on a node that does not exist",
      props: { alt: "A diagram", nodes: [node], edges: [], steps: [{ label: "Start", focus: ["a", "zzz"] }] },
      at: "steps[0] > focus[1]",
      says: '"zzz" is not one of the node ids',
    },
    {
      name: "step without a label",
      props: { alt: "A diagram", nodes: [node], edges: [], steps: [{ focus: ["a"] }] },
      at: "steps[0] > label",
    },
    {
      name: "step that focuses nothing",
      props: { alt: "A diagram", nodes: [node], edges: [], steps: [{ label: "Start", focus: [] }] },
      at: "steps[0] > focus",
    },
    { name: "unknown direction", props: { alt: "A diagram", nodes: [node], edges: [], direction: "diagonal" }, at: "direction" },
  ];
  for (const { name, props, at, says } of cases) {
    const result = await publish(lesson([{ type: "Diagram", ...props }]));
    expect({ name, code: result.code }).toEqual({ name, code: 1 });
    expect(result.err).toContain(`sections[0] "diagrams" > blocks[0] (Diagram) > ${at}`);
    if (says) expect(result.err).toContain(says);
  }
}, 60_000);

test.skipIf(!playwright || !existsSync(chrome))("every node and connection is drawn once, laid out without overlaps", async () => {
  const url = await start();
  expect((await publish(lesson([{ type: "Diagram", ...path }]))).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(url);
    const block = page.locator("[data-block=Diagram]");
    await block.locator("[data-node]").first().waitFor();
    expect(await block.locator("[role=alert]").count()).toBe(0);
    expect(await block.getAttribute("data-dir")).toBe("LR");
    for (const { id, label } of nodes) {
      const node = block.locator(`[data-node="${id}"]`);
      expect(await node.count()).toBe(1);
      expect(await node.textContent()).toContain(label);
    }
    for (const edge of path.edges) {
      expect(await block.locator(`[data-edge="${edge.id}"]`).count()).toBe(1);
      expect(await block.getByText(edge.label, { exact: true }).count()).toBeGreaterThan(0);
    }
    const boxes = await Promise.all(nodes.map(({ id }) => block.locator(`[data-node="${id}"]`).boundingBox()));
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
      }
    await page.setViewportSize({ width: 320, height: 800 });
    const scrolls = await block.locator(".diagram-scroll").evaluate((element: Element) => element.scrollWidth > element.clientWidth);
    expect(scrolls).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);

test.skipIf(!playwright || !existsSync(chrome))("a node can be selected and cleared without reach controls", async () => {
  const url = await start();
  expect((await publish(lesson([{ type: "Diagram", ...path }]))).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    const block = page.locator("[data-block=Diagram]");
    const node = block.locator('[data-node="service"]');
    await node.waitFor();
    await node.click();
    expect(await node.getAttribute("aria-pressed")).toBe("true");
    for (const name of ["What feeds this", "What this feeds", "Clear"]) expect(await block.getByRole("button", { name, exact: true }).count()).toBe(0);
    await page.keyboard.press("Escape");
    expect(await node.getAttribute("aria-pressed")).toBe("false");
  } finally {
    await browser.close();
  }
}, 60_000);

test.skipIf(!playwright || !existsSync(chrome))("a graph with a cycle, a self loop and parallel edges draws every part", async () => {
  const url = await start();
  expect((await publish(lesson([{ type: "Diagram", ...tangled }]))).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(url);
    const block = page.locator("[data-block=Diagram]");
    await block.locator('[data-node="client"]').waitFor();
    expect(await block.getAttribute("data-dir")).toBe("TB");
    expect(await block.locator("[data-node]").count()).toBe(tangled.nodes.length);
    expect(await block.locator("[data-edge]").count()).toBe(tangled.edges.length);
    expect(await block.locator("[role=alert]").count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);

test.skipIf(!playwright || !existsSync(chrome))("a parent with several children is centred over them and shares one bus", async () => {
  const url = await start();
  expect((await publish(lesson([{ type: "Diagram", ...tree }]))).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url);
    const block = page.locator("[data-block=Diagram]");
    await block.locator('[data-node="gateway"]').waitFor();
    const geometry = await block.evaluate((element: Element) => {
      const center = (node: Element) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, middle: box.left + box.width / 2 };
      };
      const root = element.querySelector('[data-node="gateway"]');
      const children = [...element.querySelectorAll("[data-node]")].filter((node) => node !== root);
      const bus = [...element.querySelectorAll("[data-edge]")].map((path) => {
        const points = (path.getAttribute("d") ?? "").split("L");
        const segment = points[1] ?? "";
        return Number(segment.trim().split(/\s+/)[1]);
      });
      return { root: root ? center(root) : null, children: children.map(center), bus };
    });
    expect(geometry.root).not.toBeNull();
    const centre = (Math.min(...geometry.children.map((child) => child.left)) + Math.max(...geometry.children.map((child) => child.right))) / 2;
    expect(Math.abs(geometry.root!.middle - centre)).toBeLessThanOrEqual(4);
    // One horizontal bus: every edge's second segment starts at the same y.
    expect(new Set(geometry.bus).size).toBe(1);
  } finally {
    await browser.close();
  }
}, 60_000);

test.skipIf(!playwright || !existsSync(chrome))("a step highlights only the nodes it focuses", async () => {
  const url = await start();
  expect((await publish(lesson([{ type: "Diagram", ...path }]))).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    const block = page.locator("[data-block=Diagram]");
    await block.locator('[data-node="api"]').waitFor();
    const steps = block.getByRole("group", { name: "Diagram steps" });
    await steps.getByRole("button", { name: "Request", exact: true }).click();
    expect(await marked(block, "data-step-focus")).toEqual({ api: "", service: "" });
    await steps.getByRole("button", { name: "Storage", exact: true }).click();
    expect(await marked(block, "data-step-focus")).toEqual({ db: "", service: "" });
    expect(await block.locator('[data-node="db"]').getAttribute("aria-label")).toContain("highlighted in step");
  } finally {
    await browser.close();
  }
}, 60_000);

/** Eight nodes in a row are wider than a phone column, so the last steps start out of view. */
const wide = {
  alt: "A long pipeline",
  nodes: Array.from({ length: 8 }, (_, index) => ({ id: `s${index}`, label: `Stage ${index + 1}` })),
  edges: Array.from({ length: 7 }, (_, index) => ({ id: `h${index}`, source: `s${index}`, target: `s${index + 1}` })),
  steps: [
    { label: "Start", focus: ["s0", "s1"] },
    { label: "End", focus: ["s6", "s7"] },
  ],
};

test.skipIf(!playwright || !existsSync(chrome))("choosing a step or a node scrolls it into view, and the position bar is the only scrollbar", async () => {
  const url = await start();
  expect((await publish(lesson([{ type: "Diagram", ...wide }]))).code).toBe(0);
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 800 }, reducedMotion: "reduce" });
    await page.goto(url);
    const block = page.locator("[data-block=Diagram]");
    await block.locator('[data-node="s0"]').waitFor();
    const scroll = block.locator(".diagram-scroll");
    expect(await scroll.evaluate((element: Element) => getComputedStyle(element).scrollbarWidth)).toBe("none");
    expect(await block.locator(".diagram-scrollbar").count()).toBe(1);
    const visible = (id: string) =>
      block.evaluate((element: Element, nodeId: string) => {
        const frame = element.querySelector(".diagram-scroll")!.getBoundingClientRect();
        const box = element.querySelector(`[data-node="${nodeId}"]`)!.getBoundingClientRect();
        return box.left >= frame.left - 1 && box.right <= frame.right + 1;
      }, id);
    expect(await visible("s7")).toBe(false);
    await block.getByRole("button", { name: "End", exact: true }).click();
    expect(await visible("s7")).toBe(true);
    expect(await visible("s6")).toBe(true);
    await block.getByRole("button", { name: "Start", exact: true }).click();
    expect(await visible("s0")).toBe(true);
    await block.locator('[data-node="s7"]').click();
    expect(await visible("s7")).toBe(true);
  } finally {
    await browser.close();
  }
}, 60_000);
