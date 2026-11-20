import { expect, test } from "bun:test";
import { parseReplaySpec, range, replay, waffle } from "../scripts/figures.ts";
import { checkPage, loadManifest } from "../scripts/ui.ts";

const base = { min: 30, max: 100, unit: " %", digits: 1, name: "Expected range" };
const withCss = '<link rel="stylesheet" href="/assets/ui/components.css">';

test("a range is placed by its position on the axis and labelled with the true values", () => {
  const html = range({ ...base, lo: 64.7, hi: 78.4, at: 74 });
  expect(html).toContain("--lo:49.57;--hi:69.14;--at:62.86");
  expect(html).toContain('data-label="74.0 %"');
  expect(html).toContain('aria-label="Expected range 64.7 to 78.4 %, marker at 74.0 %"');
});

test("a value outside the axis is drawn at the edge but keeps its true label", () => {
  const html = range({ ...base, lo: 20, hi: 120, at: 150 });
  expect(html).toContain("--lo:0;--hi:100;--at:100");
  expect(html).toContain('<span class="ui-range-lo">20.0</span>');
  expect(html).toContain('data-label="150.0 %"');
});

test("a range without a marker has no pin", () => {
  const html = range({ ...base, lo: 40, hi: 60 });
  expect(html).not.toContain("ui-range-pin");
});

test("a waffle fills exactly the rounded share of its cells", () => {
  const html = waffle(74.4, 100, 20);
  const filled = html.match(/<i class="on">/g);
  const cells = html.match(/<i\b/g);
  expect(filled?.length).toBe(74);
  expect(cells?.length).toBe(100);
  expect(html).toContain('aria-label="74 of 100 cells filled (74.4%)"');
  const empty = waffle(0, 10, 5);
  const full = waffle(100, 10, 5);
  expect(empty.match(/class="on"/g)).toBeNull();
  expect(full.match(/class="on"/g)?.length).toBe(10);
});

test("input that cannot be drawn is refused with a message that names the flag", () => {
  expect(() => range({ ...base, min: 100, max: 30, lo: 40, hi: 60 })).toThrow("--min");
  expect(() => range({ ...base, lo: 60, hi: 40 })).toThrow("--lo");
  expect(() => waffle(120, 100, 20)).toThrow("percent");
  expect(() => waffle(50, 100, 0)).toThrow("--cols");
  expect(() => waffle(50, 10.5, 5)).toThrow("--cells");
});

test("what the builders print passes the shared UI check", async () => {
  const bar = range({ ...base, lo: 64.7, hi: 78.4, at: 74 });
  const grid = waffle(74, 100, 20);
  const manifest = await loadManifest();
  const report = await checkPage(`<body class="ui-root">${withCss}${bar}${grid}</body>`, manifest);
  expect(report.errors).toEqual([]);
});

const events = [
  { time: "09:00", title: "Claim", because: "A claim stops a second worker.", state: "running" },
  { time: "09:10", title: "Lease <expires>", because: "Nothing reads it." },
  { time: "09:20", title: "Stuck", because: "No retry exists." },
];

test("a replay has one evenly spaced tick and one numbered event for each event, and escapes its text", () => {
  const spec = parseReplaySpec({ events });
  const html = replay(spec);
  expect(html).toContain('style="--p:0">1</i>');
  expect(html).toContain('style="--p:50">2</i>');
  expect(html).toContain('style="--p:100">3</i>');
  expect(html).toContain('<h3 data-n="2">Lease &lt;expires&gt;</h3>');
  expect(html).toContain('<small data-label="State after">running</small>');
  expect(html.match(/<small\b/g)?.length).toBe(1);
  expect(html).toContain('aria-label="3 events in order, not to scale"');
});

test("an events file that cannot be drawn is refused with a message that names the field", () => {
  expect(() => parseReplaySpec({ events: [events[0]] })).toThrow("at least 2");
  expect(() => parseReplaySpec({ events: [events[0], { time: "09:10", title: "x" }] })).toThrow("events[1].because");
  expect(() => parseReplaySpec([])).toThrow("JSON object");
});

test("what the replay builder prints passes the shared UI check, and a hand-built one is warned about", async () => {
  const manifest = await loadManifest();
  const spec = parseReplaySpec({ events });
  const html = replay(spec);
  const good = await checkPage(`<body class="ui-root">${withCss}${html}</body>`, manifest);
  const goodWarnings = good.warnings.filter((w) => !w.includes("linked from") && !w.includes("not linked"));
  expect(good.errors).toEqual([]);
  expect(goodWarnings).toEqual([]);

  const noLabel = html.replace(' role="img" aria-label="3 events in order, not to scale"', "");
  const noLabelReport = await checkPage(`<body class="ui-root">${withCss}${noLabel}</body>`, manifest);
  expect(noLabelReport.warnings.some((w) => w.includes("ui-replay-axis has no role"))).toBe(true);

  const extraTick = html.replace('<b class="ui-replay-marker">', '<i class="done" style="--p:100">4</i><b class="ui-replay-marker">');
  const extraReport = await checkPage(`<body class="ui-root">${withCss}${extraTick}</body>`, manifest);
  expect(extraReport.warnings.some((w) => w.includes("4 ticks but 3 events"))).toBe(true);
});
