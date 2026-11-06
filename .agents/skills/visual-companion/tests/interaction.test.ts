import "./globals";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ELEMENTS } from "../assets/components/index.js";
import { createDom, FakeElement, FakeEvent, type FakeDom } from "./dom";
import { installDocument, instantiate, removeDocument } from "./globals";

type Tabs = FakeElement & {
  index: number;
  panels: { label: string; state: unknown }[];
  select(index: number): void;
};

let dom: FakeDom;

/* Install a fresh fake document; the element classes come from ELEMENTS. */
function load(): void {
  dom = createDom();
  installDocument(dom.document);
}

function build(panelCount: number, states: (string | null)[] = []): { tabs: Tabs; scrub: FakeElement; inspect: FakeElement } {
  const tabs = instantiate<Tabs>(ELEMENTS, "vc-tabs");
  tabs.setAttribute("id", "rebase");
  for (let i = 0; i < panelCount; i++) {
    const panel = dom.document.createElement("vc-tab");
    panel.setAttribute("label", `${i + 1} · state ${i + 1}`);
    const state = states[i];
    if (state !== null && state !== undefined) panel.setAttribute("data-state", state);
    tabs.append(panel);
  }
  dom.root.append(tabs);

  const scrub = instantiate(ELEMENTS, "vc-scrub");
  scrub.setAttribute("for", "rebase");
  scrub.setAttribute("label", "Rebase state");

  const inspect = instantiate(ELEMENTS, "vc-inspect");
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
afterEach(removeDocument);

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

test("changed fields show their previous value", () => {
  const { scrub, inspect } = build(2, ['{"HEAD":"main","index":"clean"}', '{"HEAD":"detached c3d4","index":"conflict"}']);
  button(scrub, "Next").click();
  const cells = rows(inspect);
  const changed = cells.filter((row) => row[1].textContent.includes(" was "));
  const labels = changed.map((row) => row[0].textContent);
  expect(labels).toEqual(["HEAD", "index"]);
  expect(changed[0][1].textContent).toBe("detached c3d4 was main");
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

test("walkthrough readers follow arrows and clickable segments", () => {
  const tabs = instantiate<Tabs>(ELEMENTS, "vc-tabs");
  tabs.setAttribute("id", "walk");
  tabs.setAttribute("arrows", "");
  const first = dom.document.createElement("vc-tab");
  first.setAttribute("label", "Start");
  first.setAttribute("data-node", "API");
  first.setAttribute("data-cause", "The request arrives.");
  first.setAttribute("data-value", "0");
  first.setAttribute("data-state", '{"wait":"0 ms"}');
  const second = dom.document.createElement("vc-tab");
  second.setAttribute("label", "Wait");
  second.setAttribute("data-cause", "A connection is busy.");
  second.setAttribute("data-value", "1200");
  second.setAttribute("data-state", '{"wait":"1.2 s"}');
  tabs.append(first, second);
  dom.root.append(tabs);
  dom.connect(tabs);
  const cause = instantiate(ELEMENTS, "vc-cause");
  cause.setAttribute("for", "walk");
  const timebar = instantiate(ELEMENTS, "vc-timebar");
  timebar.setAttribute("for", "walk");
  timebar.setAttribute("unit", "ms");
  const inspect = instantiate(ELEMENTS, "vc-inspect");
  inspect.setAttribute("for", "walk");
  inspect.setAttribute("fold", "");
  dom.root.append(cause, timebar, inspect);
  dom.connect(cause);
  dom.connect(timebar);
  dom.connect(inspect);
  const list = tabs.children[0];
  const arrows = list.children[2];
  const previous = arrows.children[0];
  const next = arrows.children[1];
  expect(previous.disabled).toBe(true);
  expect(cause.textContent).toBe("API: The request arrives.");
  const bar = timebar.children[0];
  const caption = timebar.children[1];
  expect(bar.children[0].textContent).toBe("● API");
  expect(bar.children[1].textContent).toBe("Wait");
  expect(bar.children[0].style.flexGrow).toBe("0.06");
  expect(caption.textContent).toBe("Waited so far: 0 ms · This step: 0 ms (0% of all waiting)");
  expect(inspect.children[0].children[0].textContent).toBe("Show the raw values");
  next.click();
  expect(next.disabled).toBe(true);
  expect(bar.children[0].textContent).toBe("API");
  expect(bar.children[1].textContent).toBe("● Wait");
  expect(cause.textContent).toBe("Wait: A connection is busy.");
  expect(caption.textContent).toBe("Waited so far: 1.2 s · This step: 1.2 s (100% of all waiting)");
  expect(inspect.textContent).toContain("1.2 s was 0 ms");
  const current = bar.children[1].getAttribute("aria-current");
  expect(current).toBe("step");
  bar.children[0].click();
  expect(tabs.index).toBe(0);
});

test("invalid shares are reported and missing causes and empty hints stay silent", () => {
  const tabs = instantiate<Tabs>(ELEMENTS, "vc-tabs");
  tabs.setAttribute("id", "invalid");
  const panel = dom.document.createElement("vc-tab");
  panel.setAttribute("label", "Bad value");
  panel.setAttribute("data-value", "-5");
  tabs.append(panel);
  dom.root.append(tabs);
  dom.connect(tabs);
  const alert = tabs.children.find((child) => child.getAttribute("role") === "alert");
  expect(alert?.textContent).toContain("Invalid data-value");
  const cause = instantiate(ELEMENTS, "vc-cause");
  cause.setAttribute("for", "invalid");
  const timebar = instantiate(ELEMENTS, "vc-timebar");
  timebar.setAttribute("for", "invalid");
  timebar.setAttribute("unit", "ms");
  timebar.setAttribute("hint", "");
  dom.root.append(cause, timebar);
  dom.connect(cause);
  dom.connect(timebar);
  expect(cause.textContent).toBe("");
  expect(timebar.children[1].textContent).toBe("Waited so far: 0 ms · This step: 0 ms (0% of all waiting)");
  expect(timebar.children[2].textContent).toBe("");
});
