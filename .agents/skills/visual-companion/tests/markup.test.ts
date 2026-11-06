import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadCatalogue } from "../scripts/catalogue";
import { lintMarkup, parseMarkup } from "../scripts/markup";

const catalogue = loadCatalogue();
const SKILL = join(import.meta.dir, "..");
const rules = (source: string): string[] => lintMarkup(source, catalogue).map((finding) => finding.rule);

test("the tokenizer reads tags, attributes, classes and line numbers, and skips comments and scripts", () => {
  const root = parseMarkup('<!-- <div class="vc-ghost"> -->\n<div class="vc-card a" data-x=\'1\'>\n<script>"<p class=vc-ghost>"</script>\n<br><span id=s></span></div>');
  const [card] = root.children;
  expect(card?.tag).toBe("div");
  expect(card?.classes).toEqual(["vc-card", "a"]);
  expect(card?.attrs["data-x"]).toBe("1");
  expect(card?.line).toBe(2);
  expect(card?.children.map((child) => child.tag)).toEqual(["br", "span"]);
  expect(card?.children[1]?.attrs["id"]).toBe("s");
});

test("a class that is no name, part or internal name is reported with its line", () => {
  const findings = lintMarkup('<div class="vc-card">\n<p class="vc-gone">x</p></div>', catalogue);
  expect(findings).toEqual([{ line: 2, rule: "unknown-class", message: 'class "vc-gone" is not in the catalogue' }]);
});

test("parts, internal names and a product's own non-vc classes are legal", () => {
  expect(rules('<div class="vc-card"><div class="vc-card-head product-title">x</div></div><span class="vc-scrub-range"></span>')).toEqual([]);
});

test("an unknown <vc-...> element is reported, a part is not", () => {
  expect(rules("<vc-gone></vc-gone>")).toEqual(["unknown-element"]);
  expect(rules("<vc-tabs><vc-tab label='a'>x</vc-tab></vc-tabs>")).toEqual([]);
});

test("an attribute an element entry does not list is reported; data-, aria- and global ones are not", () => {
  expect(rules('<vc-chart data="A:1" bogus="1"></vc-chart>')).toEqual(["unknown-attr"]);
  expect(rules('<vc-chart data="A:1" label="x" id="c" data-note="1" aria-hidden="true"></vc-chart>')).toEqual([]);
});

test("for= must name a vc-tabs id in the same source", () => {
  expect(rules('<vc-scrub for="nowhere" label="s"></vc-scrub>')).toEqual(["unresolved-for"]);
  expect(rules('<vc-tabs id="t"><vc-tab label="a">x</vc-tab></vc-tabs><vc-inspect for="t"></vc-inspect>')).toEqual([]);
  expect(rules('<div id="t"></div><vc-scrub for="t" label="s"></vc-scrub>')).toEqual(["unresolved-for"]);
});

test("scrub and visible tabs warn but hidden tab bars do not", () => {
  const visible = '<vc-tabs id="t"><vc-tab label="A">a</vc-tab></vc-tabs><vc-scrub for="t"></vc-scrub>';
  const hidden = '<vc-tabs id="t" hide-tabs><vc-tab label="A">a</vc-tab></vc-tabs><vc-scrub for="t"></vc-scrub>';
  const visibleRules = rules(visible);
  const hiddenRules = rules(hidden);
  expect(visibleRules).toEqual(["duplicate-position-control"]);
  expect(hiddenRules).toEqual([]);
});

test("tab locations resolve only against diagrams bound to their own tabs", () => {
  const source = `
    <vc-tabs id="one">
      <vc-tab at="start"></vc-tab><vc-tab at="finish"></vc-tab><vc-tab at="missing"></vc-tab>
    </vc-tabs>
    <vc-tabs id="two"><vc-tab at="start"></vc-tab><vc-tab at="anchor"></vc-tab></vc-tabs>
    <vc-diagram for="one">graph LR
      start[Start]:::ok -->|moves| finish(End)
    </vc-diagram>
    <vc-diagram for="two"><svg><g data-node="anchor"></g></svg></vc-diagram>`;
  const findings = lintMarkup(source, catalogue);
  const unresolved = findings.filter((finding) => finding.rule === "unresolved-at");
  expect(unresolved.map((finding) => finding.line)).toEqual([3, 5]);
});

test("tab locations without a linked diagram or matching SVG anchor are reported", () => {
  const source = `<vc-tabs id="t"><vc-tab at="x"></vc-tab><vc-tab at="y"></vc-tab></vc-tabs>
    <vc-diagram for="t"><svg><g data-node="y"></g></svg></vc-diagram>
    <vc-tabs id="u"><vc-tab at="y"></vc-tab></vc-tabs>`;
  const findings = lintMarkup(source, catalogue);
  const unresolved = findings.filter((finding) => finding.rule === "unresolved-at");
  expect(unresolved.map((finding) => finding.line)).toEqual([1, 3]);
});

test("diagram edge endpoints resolve only within their own diagram", () => {
  const source = `<vc-diagram>
    <div data-from="start" data-to="finish"></div>
    <div data-from="outside" data-to="missing"></div>
    <div data-node="start"></div><div data-node="finish"></div>
  </vc-diagram>
  <vc-diagram><div data-node="outside"></div></vc-diagram>
  <div data-from="missing" data-to="outside"></div>`;
  const findings = lintMarkup(source, catalogue);
  const unresolved = findings.filter((finding) => finding.rule === "unresolved-edge");
  const details = unresolved.map((finding) => [finding.line, finding.message]);
  expect(details).toEqual([
    [3, 'data-from="outside" names no node in the same diagram'],
    [3, 'data-to="missing" names no node in the same diagram'],
  ]);
});

test("nested diagrams do not share edge endpoints", () => {
  const source = `<vc-diagram>
    <svg><g data-node="outer"></g><path data-from="outer" data-to="inner"></path></svg>
    <vc-diagram><svg><g data-node="inner"></g><path data-from="inner" data-to="outer"></path></svg></vc-diagram>
  </vc-diagram>`;
  const findings = lintMarkup(source, catalogue);
  const unresolved = findings.filter((finding) => finding.rule === "unresolved-edge");
  const details = unresolved.map((finding) => [finding.line, finding.message]);
  expect(details).toEqual([
    [2, 'data-to="inner" names no node in the same diagram'],
    [3, 'data-to="outer" names no node in the same diagram'],
  ]);
});

test("term node links resolve to diagram nodes anywhere on the page", () => {
  const source = `<vc-term data-node="later" def="A later node">later</vc-term>
  <vc-term data-node="absent" def="A missing node">absent</vc-term>
  <vc-term data-node="label" def="A tab label">label</vc-term>
  <vc-tabs><vc-tab data-node="label"></vc-tab></vc-tabs>
  <vc-diagram><svg><g data-node="later"></g></svg></vc-diagram>`;
  const findings = lintMarkup(source, catalogue);
  const unresolved = findings.filter((finding) => finding.rule === "unresolved-node");
  const details = unresolved.map((finding) => [finding.line, finding.message]);
  expect(details).toEqual([
    [2, 'data-node="absent" names no diagram node on the page'],
    [3, 'data-node="label" names no diagram node on the page'],
  ]);
});

test("term links resolve to nodes in authored flowcharts", () => {
  const source = `<vc-term data-node="cache" def="Cached data">cache</vc-term>
  <vc-diagram>graph LR
    api[API] --> cache[Cache]
  </vc-diagram>`;
  const findings = lintMarkup(source, catalogue);
  const unresolved = findings.filter((finding) => finding.rule === "unresolved-node");
  expect(unresolved).toEqual([]);
});

test("term definitions resolve by normalized key anywhere in the document", () => {
  const source = `<vc-term>Retry <b>Storm</b>.</vc-term>
    <vc-term term="retry storm">retry storms</vc-term>
    <vc-term def="A surge of retries"> RETRY   STORM </vc-term>
    <vc-term>undefined</vc-term><vc-term def="">empty</vc-term>`;
  const findings = lintMarkup(source, catalogue);
  const unresolved = findings.filter((finding) => finding.rule === "unresolved-term");
  expect(unresolved.map((finding) => finding.line)).toEqual([4, 4]);
});

test("terms resolve against glossary entries and the first definition wins", () => {
  const source = `<vc-term>Pressure &amp; flow</vc-term>
    <dl><dt>Pressure &amp; flow</dt><dd>A measurement</dd>
      <dt>empty first</dt><dd> </dd><dt>orphan</dt><dt>other</dt><dd>valid</dd></dl>
    <vc-term def="later">empty first</vc-term>
    <vc-term>orphan</vc-term><vc-term>other</vc-term>
    <vc-term def="">first inline</vc-term><dl><dt>first inline</dt><dd>later</dd></dl>`;
  const findings = lintMarkup(source, catalogue);
  const unresolved = findings.filter((finding) => finding.rule === "unresolved-term");
  expect(unresolved.map((finding) => finding.line)).toEqual([4, 5, 6]);
});

test("diagram SVG text warns below 12 including inherited and inline font sizes", () => {
  const source = `<svg><text font-size="8">outside</text></svg>
    <vc-diagram><svg>
      <g font-size="10"><text>small</text><text style="font-size: 12px">large</text></g>
      <text font-size="11.5">small</text><text font-size="12">large</text>
      <text style="font-size: 9px">small</text><text>unspecified</text>
    </svg></vc-diagram>`;
  const findings = lintMarkup(source, catalogue);
  const small = findings.filter((finding) => finding.rule === "small-svg-text");
  expect(small.map((finding) => finding.line)).toEqual([3, 4, 5]);
});

test("malformed markup never throws", () => {
  expect(() => lintMarkup('<div class="vc-card><p></span><vc-', catalogue)).not.toThrow();
});

function* files(dir: string, ext: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path, ext);
    else if (name.endsWith(ext)) yield path;
  }
}

test("every example lints clean", () => {
  const report: string[] = [];
  for (const file of files(join(SKILL, "examples"), ".html")) {
    for (const finding of lintMarkup(readFileSync(file, "utf8"), catalogue)) {
      report.push(`${file.slice(SKILL.length + 1)}:${finding.line} ${finding.rule}: ${finding.message}`);
    }
  }
  expect(report).toEqual([]);
});

test("every html fence in references/ lints clean", () => {
  const report: string[] = [];
  for (const file of files(join(SKILL, "references"), ".md")) {
    const text = readFileSync(file, "utf8");
    for (const [, fence] of text.matchAll(/```html\n([\s\S]*?)```/g)) {
      for (const finding of lintMarkup(fence ?? "", catalogue)) {
        report.push(`${file.slice(SKILL.length + 1)}: ${finding.rule}: ${finding.message}`);
      }
    }
  }
  expect(report).toEqual([]);
});
