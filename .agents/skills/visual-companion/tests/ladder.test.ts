import "./globals";
import { afterEach, beforeEach, expect, test, vi } from "bun:test";
import { nextPeek } from "../assets/components/core.js";
import { ELEMENTS } from "../assets/components/index.js";
import { createDom, FakeElement, FakeEvent, type FakeDom } from "./dom";
import { installDocument, instantiate, removeDocument } from "./globals";

type Tabs = FakeElement & {
  index: number;
  panels: { label: string; state: Record<string, string> | null; at: string | null }[];
  currentState(): Record<string, string> | null;
  select(index: number): void;
};

let dom: FakeDom;

beforeEach(() => {
  dom = createDom();
  installDocument(dom.document);
});
afterEach(() => {
  vi.useRealTimers();
  removeDocument();
});

function build(variant = "ladder"): { tabs: Tabs; panels: FakeElement[]; buttons: FakeElement[] } {
  const tabs = instantiate<Tabs>(ELEMENTS, "vc-tabs");
  tabs.setAttribute("variant", variant);
  tabs.setAttribute("id", "levels");
  const panels = ["First", "Second", "Third"].map((label, index) => {
    const panel = dom.document.createElement("vc-tab");
    panel.setAttribute("label", label);
    const state = JSON.stringify({ level: index + 1 });
    panel.setAttribute("data-state", state);
    if (index === 1) panel.setAttribute("at", "second-node");
    tabs.append(panel);
    return panel;
  });
  dom.root.append(tabs);
  dom.connect(tabs);
  return { tabs, panels, buttons: tabs.children[0].children };
}

function send(target: FakeElement, type: string, properties: Record<string, string> = {}): void {
  const fakeEvent = new FakeEvent(type, { bubbles: true });
  const event = Object.assign(fakeEvent, properties);
  target.dispatchEvent(event);
}

function recordChange(changes: number[]): (event: FakeEvent) => void {
  return (event) => {
    const detail = event.detail;
    if (detail && typeof detail === "object" && "index" in detail && typeof detail.index === "number") {
      changes.push(detail.index);
    }
  };
}

test("nextPeek describes enter, exit, focus and dismissal transitions", () => {
  expect(nextPeek(false, "enter", false)).toBe(true);
  expect(nextPeek(true, "leave", true)).toBe(false);
  expect(nextPeek(false, "focus", true)).toBe(true);
  expect(nextPeek(false, "focus", false)).toBe(false);
  expect(nextPeek(true, "blur", true)).toBe(false);
  expect(nextPeek(true, "blur", false)).toBe(true);
  expect(nextPeek(true, "escape", true)).toBe(false);
});

test("hover and focus preview without changing position or notifying followers", () => {
  vi.useFakeTimers();
  const { tabs, panels, buttons } = build();
  const changes: number[] = [];
  tabs.addEventListener("vc-tab-change", recordChange(changes));
  expect(tabs.children[0].getAttribute("aria-orientation")).toBe("vertical");

  send(buttons[1], "pointerenter", { pointerType: "mouse" });
  expect(panels[1].hasAttribute("data-peek")).toBe(true);
  expect(tabs.hasAttribute("data-peeking")).toBe(true);
  expect(tabs.index).toBe(0);
  expect(tabs.currentState()).toEqual({ level: "1" });
  expect(changes).toEqual([]);

  send(buttons[1], "pointerleave", { pointerType: "mouse" });
  vi.advanceTimersByTime(120);
  expect(tabs.hasAttribute("data-peeking")).toBe(false);
  expect(panels[1].hasAttribute("data-peek")).toBe(false);

  send(buttons[2], "focusin");
  expect(panels[2].hasAttribute("data-peek")).toBe(true);
  expect(tabs.index).toBe(0);
  expect(changes).toEqual([]);
  send(buttons[2], "focusout");
  expect(tabs.hasAttribute("data-peeking")).toBe(false);
});

test("selection still notifies existing followers, and arrow keys select vertically", () => {
  const { tabs, panels, buttons } = build();
  const scrub = instantiate(ELEMENTS, "vc-scrub");
  scrub.setAttribute("for", "levels");
  dom.root.append(scrub);
  dom.connect(scrub);
  const changes: number[] = [];
  tabs.addEventListener("vc-tab-change", recordChange(changes));

  send(buttons[1], "pointerenter", { pointerType: "mouse" });
  const slider = dom.find(scrub, (node) => node.type === "range")!;
  expect(slider.value).toBe("1");
  buttons[1].click();
  expect(tabs.index).toBe(1);
  expect(slider.value).toBe("2");
  expect(panels[1].hasAttribute("data-active")).toBe(true);
  expect(buttons[1].getAttribute("aria-selected")).toBe("true");
  send(buttons[1], "keydown", { key: "ArrowDown" });
  expect(tabs.index).toBe(2);
  expect(slider.value).toBe("3");
  send(buttons[2], "keydown", { key: "ArrowUp" });
  expect(tabs.index).toBe(1);
  expect(changes).toEqual([1, 2, 1]);
  expect(tabs.panels.map((panel) => panel.at)).toEqual([null, "second-node", null]);
});

test("escape dismisses previews without selecting, and touch does not preview", () => {
  const { tabs, panels, buttons } = build();
  const changes: number[] = [];
  tabs.addEventListener("vc-tab-change", recordChange(changes));
  send(buttons[1], "pointerenter", { pointerType: "touch" });
  expect(tabs.hasAttribute("data-peeking")).toBe(false);
  send(buttons[1], "focusin");
  send(buttons[1], "keydown", { key: "Escape" });
  expect(panels[1].hasAttribute("data-peek")).toBe(false);
  expect(tabs.hasAttribute("data-peeking")).toBe(false);
  expect(tabs.index).toBe(0);
  expect(changes).toEqual([]);
  buttons[1].click();
  expect(changes).toEqual([1]);
});

test("ordinary tabs retain horizontal keyboard navigation and do not preview", () => {
  const { tabs, panels, buttons } = build("tabs");
  send(buttons[1], "pointerenter", { pointerType: "mouse" });
  send(buttons[1], "focusin");
  expect(panels[1].hasAttribute("data-peek")).toBe(false);
  send(buttons[0], "keydown", { key: "ArrowRight" });
  expect(tabs.index).toBe(1);
});
