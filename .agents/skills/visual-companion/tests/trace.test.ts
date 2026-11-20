import { expect, test } from "bun:test";
import { buildTrace, parseSpec } from "../scripts/trace.ts";
import { checkPage, loadManifest } from "../scripts/ui.ts";

const withCss = '<link rel="stylesheet" href="/assets/ui/components.css">';

/** A two-step spec whose commands print known text; override fields to break one rule at a time. */
function spec(override: Record<string, unknown> = {}) {
  return parseSpec({
    code: "df.dropna().mean()",
    input: { title: "Data in", cmd: "printf 'a  b\\n1  <2>\\n'" },
    steps: [
      { title: ".dropna()", code: ".dropna()", plain: "Remove rows with a blank.", cmd: "printf 'a  b\\n1  <2>\\n'", mark: ["1  <2>"] },
      { title: ".mean()", code: ".mean()", plain: "Average each column.", cmd: "printf 'a  1.0\\n'" },
    ],
    summary: "One average per column.",
    ...override,
  });
}

test("each output pane holds what its command printed, escaped, with changed lines marked", async () => {
  const built = spec();
  const html = await buildTrace(built);
  expect(html).toContain("<h3>Step 1 of 2 \u00b7 .dropna()</h3>");
  expect(html).toContain("<h3>Step 2 of 2 \u00b7 .mean()</h3>");
  expect(html).toContain("<mark>1  &lt;2&gt;</mark>");
  expect(html).toContain("a  1.0</output>");
  expect(html).toContain('data-ran="printf \'a  1.0\\n\'"');
  expect(html).toContain("<footer>One average per column.</footer>");
});

test("a built block passes the shared UI check with nothing to fix", async () => {
  const built = spec();
  const html = await buildTrace(built);
  const manifest = await loadManifest();
  const page = `<body class="ui-root">${withCss}<style>/* each <output> is captured from a run */</style><script src="/assets/ui/ui.js" defer></script>${html}</body>`;
  const report = await checkPage(page, manifest);
  const warnings = report.warnings.filter((w) => !w.includes("linked from"));
  expect(report.errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test("an output with no data-ran in a trace is a warning", async () => {
  const typed = '<div class="ui-trace"><pre>x</pre><section><h3>Step 1 of 1</h3><output>12.0</output></section></div>';
  const manifest = await loadManifest();
  const page = `<body class="ui-root">${withCss}${typed}</body>`;
  const report = await checkPage(page, manifest);
  const flagged = report.warnings.some((w) => w.includes("data-ran"));
  expect(flagged).toBe(true);
});

test("nothing is built when a command fails, prints nothing, or a mark matches no line", async () => {
  const failing = spec({ input: { title: "Data in", cmd: "echo boom >&2; exit 3" } });
  const failed = buildTrace(failing);
  await expect(failed).rejects.toThrow("exited 3: boom");

  const silent = spec({ input: { title: "Data in", cmd: "true" } });
  const nothing = buildTrace(silent);
  await expect(nothing).rejects.toThrow("printed nothing");

  const stale = spec({ input: { title: "Data in", cmd: "printf 'a\\n'", mark: ["gone"] } });
  const unmatched = buildTrace(stale);
  await expect(unmatched).rejects.toThrow('mark "gone" matches no output line');
});

test("a bad spec names the field to fix", () => {
  expect(() => spec({ steps: [] })).toThrow("steps must be a non-empty list");
  expect(() => spec({ steps: [{ title: "t", code: "c", plain: "p" }] })).toThrow("steps[0].cmd");
});
