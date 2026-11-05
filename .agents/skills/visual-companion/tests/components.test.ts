import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const components = readFileSync(new URL("../assets/components.js", import.meta.url), "utf8");

function renderChart(attributes: Record<string, string>): string {
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
  Object.assign(chart.attributes, attributes);
  chart.connectedCallback();
  return chart.innerHTML;
}

test("chart without a height renders its plot at the documented 200 pixels", () => {
  const html = renderChart({ data: "A:10" });
  expect(html).toContain("height:200px");
});

test("chart honors the height attribute in pixels", () => {
  const html = renderChart({ data: "A:10", height: "120" });
  expect(html).toContain("height:120px");
});

test("chart is plain HTML, so its text cannot scale with container width", () => {
  const html = renderChart({ data: "A:10,B:5" });
  expect(html).not.toContain("<svg");
  expect(html).not.toContain("viewBox");
});

test("the tallest bar reaches the plot height minus room for its value label", () => {
  const html = renderChart({ data: "A:50,B:25", height: "222" });
  expect(html).toContain("height:200.0px"); // max value fills 222 - 22
  expect(html).toContain("height:100.0px"); // half value is half of that
});

test("an explicit max sets the scale", () => {
  const html = renderChart({ data: "A:50", height: "222", max: "100" });
  expect(html).toContain("height:100.0px");
});

test("every class the catalogue advertises has a rule in components.css", () => {
  const cssUrl = new URL("../assets/components.css", import.meta.url);
  const css = readFileSync(cssUrl, "utf8");
  const catalogueUrl = new URL("../assets/catalogue.json", import.meta.url);
  const catalogueText = readFileSync(catalogueUrl, "utf8");
  const catalogue = JSON.parse(catalogueText) as { classes: { name: string }[] };
  const names = catalogue.classes.flatMap((entry) => entry.name.split(" / "));
  const hasRule = (name: string): boolean => {
    const selector = new RegExp(`\\.${name}(?![\\w-])`);
    return selector.test(css);
  };
  const missing = names.filter((name) => !hasRule(name));
  expect(missing).toEqual([]);
});

test("the gallery shows every class and element the catalogue advertises", () => {
  const gallery = readFileSync(new URL("../examples/component-gallery.html", import.meta.url), "utf8");
  const catalogue = JSON.parse(
    readFileSync(new URL("../assets/catalogue.json", import.meta.url), "utf8"),
  ) as { classes: { name: string }[]; elements: { name: string }[] };
  const names = [
    ...catalogue.classes.flatMap((entry) => entry.name.split(" / ")),
    ...catalogue.elements.map((entry) => entry.name),
  ];
  const missing = names.filter((name) => !gallery.includes(name));
  expect(missing).toEqual([]);
});
