import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const components = readFileSync(new URL("../assets/components.js", import.meta.url), "utf8");

test("chart without a height renders at the documented default height", () => {
  class Element {
    dataset: Record<string, string> = {};
    attributes: Record<string, string> = {};
    innerHTML = "";
    getAttribute(name: string): string | null { return this.attributes[name] ?? null; }
  }
  const registry = new Map<string, new () => Element & { connectedCallback(): void }>();
  const customElements = {
    get: (name: string) => registry.get(name),
    define: (name: string, constructor: new () => Element & { connectedCallback(): void }) => registry.set(name, constructor),
  };
  runInNewContext(components, { HTMLElement: Element, customElements });
  const Chart = registry.get("vc-chart")!;
  const chart = new Chart();
  chart.attributes.data = "A:10";
  chart.connectedCallback();
  expect(chart.innerHTML).toContain('viewBox="0 0 100 200"');
});
