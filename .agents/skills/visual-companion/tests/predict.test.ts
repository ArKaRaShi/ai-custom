import "./globals";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { VcPredict, predictReducer } from "../assets/components/predict.js";
import { createDom, FakeElement, type FakeDom, type FakeEvent } from "./dom";
import { installDocument, instantiate, removeDocument } from "./globals";

let dom: FakeDom;
let focused: FakeElement | null;

class Element extends FakeElement {
  style: Record<string, string> = {};
  hidden = false;
  get innerText(): string { return this.textContent; }
  querySelector(selector: string): FakeElement | null {
    if (selector !== "h1, h2, h3, h4, h5, h6") return null;
    return this.children.find((child) => /^h[1-6]$/.test(child.tagName)) ?? null;
  }
  focus(): void { focused = this; }
  closest(selector: string): FakeElement | null {
    let node: FakeElement | null = this;
    const attribute = selector.slice(1, -1);
    while (node) {
      if (node.hasAttribute(attribute)) return node;
      node = node.parent;
    }
    return null;
  }
}

type Prediction = FakeElement & { connectedCallback(): void; querySelector(selector: string): FakeElement | null };

function build(): { host: Prediction; first: Element; second: Element; reveal: Element; lock: FakeElement; status: FakeElement } {
  const host = instantiate<Prediction>({ "vc-predict": VcPredict }, "vc-predict");
  host.setAttribute("label", "Which path?");
  const options = new Element("div");
  const first = new Element("button");
  first.setAttribute("data-pick", "a");
  first.textContent = "First path";
  const second = new Element("button");
  second.setAttribute("data-pick", "b");
  second.setAttribute("data-correct", "");
  second.textContent = "Second path";
  options.append(first, second);
  const reveal = new Element("vc-reveal");
  reveal.textContent = "The explanation";
  host.append(options, reveal);
  host.querySelector = (selector: string) => selector === ":scope > vc-reveal" ? reveal : null;
  host.querySelectorAll = (selector: string) => selector === "button[data-pick]" ? [first, second] : [];
  dom.root.append(host);
  dom.connect(host);
  const lock = host.children.find((child) => child.className === "vc-btn")!;
  const status = host.children.find((child) => child.className === "vc-predict-status")!;
  return { host, first, second, reveal, lock, status };
}

beforeEach(() => {
  dom = createDom();
  dom.document.createElement = (tag: string) => new Element(tag);
  focused = null;
  installDocument(dom.document);
});
afterEach(removeDocument);

test("reducer permits changing a pick but commitment is terminal", () => {
  const idle = { phase: "idle" as const };
  expect(predictReducer(idle, { type: "commit" })).toEqual(idle);
  const picked = predictReducer(idle, { type: "pick", value: "a" });
  const changed = predictReducer(picked, { type: "pick", value: "b" });
  const committed = predictReducer(changed, { type: "commit" });
  expect(committed).toEqual({ phase: "committed", pick: "b" });
  expect(predictReducer(committed, { type: "pick", value: "a" })).toEqual(committed);
  expect(predictReducer(committed, { type: "commit" })).toEqual(committed);
  expect(idle).toEqual({ phase: "idle" });
});

test("answer remains native and readable without enhancement", () => {
  const reveal = new Element("vc-reveal");
  const details = new Element("details");
  const summary = new Element("summary");
  summary.textContent = "Answer";
  details.append(summary);
  reveal.append(details);
  expect(reveal.hidden).toBe(false);
  expect(reveal.textContent).toBe("Answer");
});

test("selection can change before lock-in; commitment reveals without grading", () => {
  const { host, first, second, reveal, lock, status } = build();
  expect(reveal.hidden).toBe(true);
  expect(lock.disabled).toBe(true);
  expect(lock.textContent).toBe("Pick an answer first");
  expect(host.getAttribute("aria-label")).toBe("Which path?");
  first.click();
  second.click();
  expect(first.getAttribute("aria-pressed")).toBe("false");
  expect(second.getAttribute("aria-pressed")).toBe("true");
  expect(lock.disabled).toBe(false);
  expect(lock.textContent).toBe("Lock in");
  expect(status.textContent).toBe("Selected: Second path. Press Lock in to see the answer.");
  lock.click();
  expect(host.getAttribute("data-phase")).toBe("committed");
  expect(lock.textContent).toBe("Locked in");
  expect(second.getAttribute("data-choice")).toBe("b");
  expect(first.hasAttribute("data-choice")).toBe(false);
  expect(reveal.hidden).toBe(false);
  expect(focused).toBe(reveal);
  expect(first.disabled).toBe(true);
  expect(second.disabled).toBe(true);
  expect(status.getAttribute("role")).toBe("status");
  expect(status.textContent).toBe("You predicted: Second path.");
  expect(second.children.length).toBe(0);
  host.connectedCallback();
  expect(host.children.filter((child) => child.className === "vc-btn")).toHaveLength(1);
});

test("prediction announcements use the option heading, not its description", () => {
  const { first, lock, status } = build();
  first.textContent = "";
  const heading = new Element("h3");
  heading.textContent = "API";
  const description = new Element("p");
  description.textContent = "It does the parsing and the work";
  first.append(heading, description);
  first.click();
  expect(status.textContent).toBe("Selected: API. Press Lock in to see the answer.");
  lock.click();
  expect(status.textContent).toBe("You predicted: API.");
  const recorded = lock.getAttribute("data-label");
  expect(recorded).toBe("API");
});

test("the existing delegated client records one choice on lock-in only", () => {
  const { host, first, second, lock } = build();
  const other = new Element("button");
  other.setAttribute("data-choice", "other");
  other.setAttribute("aria-pressed", "true");
  dom.root.append(other);
  const sent: unknown[] = [];
  const doc = Object.assign(dom.document, {
    querySelector: () => null,
    querySelectorAll: () => [other],
    addEventListener: (type: string, listener: (event: FakeEvent) => void) => {
      FakeElement.prototype.addEventListener.call(dom.root, type, listener);
    },
  });
  class Socket {
    static OPEN = 1;
    readyState = 1;
    addEventListener(): void {}
    send(message: string): void { sent.push(JSON.parse(message)); }
  }
  const client = readFileSync(new URL("../assets/client.js", import.meta.url), "utf8");
  runInNewContext(client, { document: doc, Element, WebSocket: Socket, location: { protocol: "http:", host: "localhost" }, setTimeout, clearTimeout });
  first.click();
  second.click();
  expect(sent).toEqual([]);
  expect(host.hasAttribute("data-multiselect")).toBe(true);
  lock.click();
  expect(sent).toEqual([{ type: "choice", choice: "b", text: "Second path" }]);
  expect(other.getAttribute("aria-pressed")).toBe("true");
  lock.click();
  expect(sent).toHaveLength(1);
});
