import { beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createDom, FakeElement, FakeEvent, type FakeDom } from "./dom";

const source = readFileSync(new URL("../assets/components.js", import.meta.url), "utf8");

type Components = { document: unknown; HTMLElement: unknown; customElements: { get(name: string): any; define(name: string, ctor: any): void }; CustomEvent: unknown };

let dom: FakeDom;

/* Load components.js against the fake DOM, the same way the chart test does. */
function load(): void {
  dom = createDom();
  const registry = new Map<string, any>();
  const global = {
    HTMLElement: FakeElement,
    document: dom.document,
    CustomEvent: FakeEvent,
    customElements: {
      get: (name: string) => registry.get(name),
      // Custom elements know their own tag name; the fake base class needs it explicitly.
      define: (name: string, ctor: any) =>
        registry.set(
          name,
          class extends ctor {
            constructor() {
              super(name);
            }
          },
        ),
    },
  } satisfies Components;
  runInNewContext(source, global);
  elements = registry;
}

let elements = new Map<string, any>();

function build(panelCount: number, states: (string | null)[] = []): { tabs: FakeElement; scrub: FakeElement; inspect: FakeElement } {
  const tabs = new (elements.get("vc-tabs"))();
  tabs.setAttribute("id", "rebase");
  for (let i = 0; i < panelCount; i++) {
    const panel = dom.document.createElement("vc-tab");
    panel.setAttribute("label", `${i + 1} · state ${i + 1}`);
    const state = states[i];
    if (state !== null && state !== undefined) panel.setAttribute("data-state", state);
    tabs.append(panel);
  }
  dom.root.append(tabs);

  const scrub = new (elements.get("vc-scrub"))();
  scrub.setAttribute("for", "rebase");
  scrub.setAttribute("label", "Rebase state");

  const inspect = new (elements.get("vc-inspect"))();
  inspect.setAttribute("for", "rebase");
  inspect.setAttribute("caption", "Hidden state");

  dom.root.append(scrub, inspect);
  dom.connect(tabs);
  dom.connect(scrub);
  dom.connect(inspect);

  return { tabs, scrub, inspect };
}

function range(scrub: FakeElement): FakeElement {
  return dom.find(scrub, (node) => node.type === "range")!;
}

function button(scrub: FakeElement, label: string): FakeElement {
  return dom.find(scrub, (node) => node.textContent === label)!;
}

function rows(inspect: FakeElement): FakeElement[][] {
  const table = dom.find(inspect, (node) => node.tagName === "table");
  if (!table) return [];
  const body = dom.find(table, (node) => node.tagName === "tbody")!;
  return body.children.map((row) => row.children);
}

beforeEach(load);

test("scrub moves the tabs and announces the state label, not the number", () => {
  const { tabs, scrub } = build(3);
  const slider = range(scrub);

  expect(slider.getAttribute("aria-label")).toBe("Rebase state");
  expect(slider.max).toBe("3");
  expect(slider.getAttribute("aria-valuetext")).toBe("1 · state 1");

  slider.value = "2";
  slider.dispatchEvent(new FakeEvent("input", { bubbles: true }));

  expect(tabs.index).toBe(1);
  expect(slider.getAttribute("aria-valuetext")).toBe("2 · state 2");
  expect(tabs.children.filter((p: FakeElement) => p.hasAttribute("data-active")).length).toBe(1);
});

test("vc-tab-change stays the only event, with a zero-based index", () => {
  const { tabs, scrub } = build(3);
  const seen: number[] = [];
  tabs.addEventListener("vc-tab-change", (event: FakeEvent) => seen.push((event.detail as { index: number }).index));

  button(scrub, "Next").click();

  expect(seen).toEqual([1]);
  expect(tabs.index).toBe(1);
});

test("previous disables at the first state and next at the last", () => {
  const { scrub } = build(3);
  const previous = button(scrub, "Previous");
  const next = button(scrub, "Next");

  expect(previous.disabled).toBe(true);
  expect(next.disabled).toBe(false);

  next.click();
  expect(previous.disabled).toBe(false);

  next.click();
  expect(next.disabled).toBe(true);

  next.click();
  expect(range(scrub).value).toBe("3");
});

test("the status line does not repeat the panel number", () => {
  const { scrub } = build(3);
  const status = dom.find(scrub, (node) => node.className === "vc-scrub-status")!;
  expect(status.textContent).toBe("1 of 3 · state 1");
  button(scrub, "Next").click();
  expect(status.textContent).toBe("2 of 3 · state 2");
});

test("with JavaScript off the first panel still renders", () => {
  const css = readFileSync(new URL("../assets/components.css", import.meta.url), "utf8");
  expect(css).toContain("vc-tabs:not(:has(> vc-tab[data-active])) > vc-tab:first-of-type");
});

test("a single-state screen disables the range instead of pretending to move", () => {
  const { scrub } = build(1);
  expect(range(scrub).disabled).toBe(true);
});

test("inspector renders the declared fields as a labelled table", () => {
  const { inspect } = build(2, ['{"HEAD":"main","index":"clean"}', '{"HEAD":"detached c3d4","index":"conflict"}']);
  const table = dom.find(inspect, (node) => node.tagName === "table")!;
  const caption = dom.find(table, (node) => node.tagName === "caption")!;

  expect(caption.textContent).toBe("Hidden state");
  expect(rows(inspect).map((cells) => cells.map((cell) => cell.textContent))).toEqual([
    ["HEAD", "main"],
    ["index", "clean"],
  ]);
});

test("a field that changed since the previous position carries a text badge", () => {
  const { scrub, inspect } = build(2, ['{"HEAD":"main","index":"clean"}', '{"HEAD":"detached c3d4","index":"conflict"}']);

  button(scrub, "Next").click();

  const changed = rows(inspect).filter((cells) => cells[1].textContent.includes("Changed"));
  expect(changed.map((cells) => cells[0].textContent)).toEqual(["HEAD", "index"]);
  expect(changed[0][1].textContent).toBe("detached c3d4 Changed");
});

test("no declared state renders nothing at all", () => {
  const { inspect } = build(2);
  expect(dom.find(inspect, (node) => node.tagName === "table")).toBeUndefined();
  expect(inspect.textContent).toBe("");
});

test("invalid or nested data-state is treated as no state, and the panels still work", () => {
  const { tabs, inspect } = build(2, ["{not json", '{"HEAD":{"ref":"main"}}']);
  expect(inspect.textContent).toBe("");
  expect(tabs.panels.map((panel: { state: unknown }) => panel.state)).toEqual([null, null]);

  tabs.select(1);
  expect(tabs.index).toBe(1);
});

test("state values are rendered as text, so markup in data-state cannot execute", () => {
  const { inspect } = build(1, ['{"note":"<img src=x onerror=alert(1)>"}']);
  const cells = rows(inspect)[0];
  expect(cells[1].textContent).toBe("<img src=x onerror=alert(1)>");
  expect(dom.find(inspect, (node) => node.tagName === "img")).toBeUndefined();
});
