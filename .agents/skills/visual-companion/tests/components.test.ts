import "./globals";
import { expect, test } from "bun:test";
import { ELEMENTS } from "../assets/components/index.js";
import type { FakeElement } from "./dom";
import { instantiate } from "./globals";

type Chart = FakeElement & { connectedCallback(): void; innerHTML: string };

function renderChart(attributes: Record<string, string>): string {
  const chart = instantiate<Chart>(ELEMENTS, "vc-chart");
  for (const [name, value] of Object.entries(attributes)) chart.setAttribute(name, value);
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
