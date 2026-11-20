import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseLesson } from "../explain/dist/lesson.js";

/** Scenarios run by default. `expect` and `svg` still work when named in `runEvals({ scenarios })`. */
const defaults = ["findings", "shortlist", "route", "explainer", "sequence", "lesson", "prototype"] as const;
const extra = ["expect", "svg"] as const;
const scenarios = [...defaults, ...extra] as const;
type Scenario = (typeof scenarios)[number];

const SETUP_NOTE = "A local file needs no approval from anyone. Do not open a browser or start a server.";
const tasks: Record<Scenario, string> = {
  findings: "findings.json lists 12 review findings. Write report.html: one page that lets me decide in a few minutes what to fix first, and read the evidence for the ones that matter.",
  sequence: "events.json lists 5 events from one night, in order. Write report.html: one page that shows a reader how a sync ended up blocked, and why at each step.",
  shortlist: "findings.json lists 3 review findings. Write report.html: one page that lets me decide what to fix first and read the evidence.",
  route: "Nobody is available to answer questions in this run. Make a presentation from notes.md and save it as deck.html.",
  explainer: "Explain to someone who has never seen this code how fee() in fee.py prices a 7.5 kg parcel. Write one page, report.html.",
  lesson: "Show me how a request goes from client to API to database. I approve a visual companion screen. Save the lesson as lesson.json and publish it.",
  expect: "Explain the calculation in calc.js using input 3. I approve a visual companion screen. Run the code for the real result, save the lesson as lesson.json, and publish it with the result checked.",
  prototype: "Show two alternative layouts for a settings page, with a clickable choice. I approve a visual companion screen. Write prototype.html and publish it.",
  svg: "Make two lesson specs: chart.json for comparing 3 and 7 requests, and illustration.json for an illustration of a triangle inside a circle. I approve visual companion screens. Publish both in order, illustration last.",
};

// ---------------------------------------------------------------- findings fixtures

type Level = "critical" | "minor" | "test" | "nit";
type Finding = { id: string; level: Level; title: string; file: string; minutes: number; fix: string; evidence: string; before?: string; after?: string };

/** Each evidence line carries a request id the scorer looks for, so a paraphrase cannot pass as the evidence. */
const FINDINGS: Finding[] = [
  { id: "F1", level: "critical", title: "A storage outage leaves the export running forever", file: "jobs/lease.py:95", minutes: 20, fix: "Move the storage check inside the try block so a failure schedules a retry.", evidence: "Request rq-7f3a91 returned 202, the worker timed out after 103 s and the row stayed running with attempts 0.", before: "if blob_exists_f1(bucket, key):\n    publish_f1(key)", after: "try:\n    seen = blob_exists_f1(bucket, key)\nexcept Exception:\n    schedule_retry_f1(key)" },
  { id: "F2", level: "critical", title: "One failed poll turns every row into ERR", file: "ui/ExportsCard.vue:104", minutes: 25, fix: "Keep the last good rows when a poll fails.", evidence: "Request rq-2c81de failed once for 7 s and all 21 rows showed ERR until the next poll.", before: "catch { grid_fail_f2() }", after: "catch { grid_success_f2(lastGood) }" },
  { id: "F3", level: "minor", title: "A duplicate delivery skips the 30 s wait", file: "jobs/lease.py:44", minutes: 20, fix: "Add a retry_after column and refuse earlier claims.", evidence: "Request rq-91b0c4 arrived 2 s after a failure and was claimed at once.", before: "if row.token_f3 and expires > now:", after: "if row.retry_after_f3 > now:" },
  { id: "F4", level: "minor", title: "Two toasts both say retry", file: "ui/ActionCell.vue:9", minutes: 10, fix: "Keep one message.", evidence: "Request rq-5d17aa showed a toast and a red icon, each saying retry.", before: "toast_f4('retry'); icon_f4('retry')", after: "toast_f4('retry')" },
  { id: "F5", level: "minor", title: "Two Download buttons share one name", file: "ui/ActionCell.vue:11", minutes: 5, fix: "Add layout and time to the label.", evidence: "Request rq-a3e6f2 listed rows 2 and 3 with the same aria-label." },
  { id: "F6", level: "minor", title: "The red icon survives a tab switch", file: "store/ExportHome.ts:17", minutes: 5, fix: "Clear download state on unmount.", evidence: "Request rq-6b44d9 left the icon red after Refresh.", before: "state_f6 = errors", after: "clear_f6(); state_f6 = errors" },
  { id: "F7", level: "minor", title: "Failure reason clipped to 118 of 302 px", file: "ui/StatusCell.vue:9", minutes: 10, fix: "Allow two lines.", evidence: "Request rq-08fc73 measured shownWidth 118 and fullWidth 302." },
  { id: "F8", level: "test", title: "The retry countdown has no test", file: "tests/test_flow.py", minutes: 40, fix: "Add five tests.", evidence: "Request rq-d2a915: rg trigger test_flow.py found nothing." },
  { id: "F9", level: "test", title: "The grid stub hides the poll bug", file: "vitest/", minutes: 30, fix: "Add five grid tests.", evidence: "Request rq-47e8b0: all 41 tests pass with the bug present." },
  { id: "F10", level: "nit", title: "The storage prefix is hard-coded twice", file: "reports/export.py:9", minutes: 2, fix: "Use the shared constant.", evidence: "Request rq-b91c36 shows pump written in two files." },
  { id: "F11", level: "nit", title: "matplotlib is not pinned in the worker", file: "worker-requirements.txt:45", minutes: 10, fix: "Your call.", evidence: "Request rq-3fa7e8 resolved 3.7.5 in both images today." },
  { id: "F12", level: "nit", title: "Four small wording slips", file: "ui/*.vue", minutes: 10, fix: "Edit four lines.", evidence: "Request rq-c05d92 lists the four spots." },
];
const CRITICAL = FINDINGS.filter((f) => f.level === "critical");
const SHORT = ["F1", "F4", "F10"].map((id) => FINDINGS.find((f) => f.id === id)!);

function evidenceMarker(f: Finding): string {
  return /rq-[0-9a-f]{6}/.exec(f.evidence)![0];
}

// ---------------------------------------------------------------- HTML checks

/** Splits a page into text shown by default and text that sits inside a closed <details>. */
function splitDetails(html: string): { shown: string; folded: string } {
  const token = /<(\/?)details\b([^>]*)>/gi;
  const stack: boolean[] = [];
  let shown = "";
  let folded = "";
  let last = 0;
  for (const match of html.matchAll(token)) {
    const chunk = html.slice(last, match.index);
    if (stack.some((closed) => closed)) folded += chunk; else shown += chunk;
    last = match.index! + match[0].length;
    if (match[1]) stack.pop(); else stack.push(!/\bopen\b/i.test(match[2] ?? ""));
  }
  const tail = html.slice(last);
  if (stack.some((closed) => closed)) folded += tail; else shown += tail;
  return { shown, folded };
}

function layerReasons(html: string, file: string): string[] {
  const reasons: string[] = [];
  if (!/class="[^"]*\bui-root\b/.test(html) && !/name="own-style"/.test(html)) reasons.push(`${file} neither uses the shared layer nor says why it does not`);
  if (/(?:href|src)="\/assets\/ui/.test(html)) reasons.push(`${file} links /assets/ui but was not inlined, so it breaks when opened as a file`);
  if (html.includes("@@")) reasons.push(`${file} still has an unfilled @@placeholder@@`);
  return reasons;
}

function checkReasons(dir: string, file: string): string[] {
  const script = join(import.meta.dir, "..", "scripts", "ui.ts");
  const run = Bun.spawnSync(["bun", script, "check", join(dir, file)]);
  if (run.exitCode === 0) return [];
  const first = run.stdout.toString().split("\n").find((line) => line.startsWith("error:")) ?? "ui.ts check failed";
  return [`ui.ts check: ${first}`];
}

function readPage(dir: string, file: string, reasons: string[]): string {
  const path = join(dir, file);
  if (!existsSync(path)) { reasons.push(`${file} missing`); return ""; }
  return readFileSync(path, "utf8");
}

function h1Text(html: string): string {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return match ? match[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

// ---------------------------------------------------------------- sequence fixtures

type StepEvent = { time: string; title: string; because: string; marker: string };
/** Each event's marker is a phrase from its reason, so a page that drops or rewords the why cannot pass. */
const EVENTS: StepEvent[] = [
  { time: "02:00:00", title: "The scheduler starts the sync", because: "the cron entry fires at 02:00", marker: "cron entry" },
  { time: "02:00:04", title: "The sync takes the ledger lock", because: "only one sync may write the ledger at a time", marker: "ledger at a time" },
  { time: "02:03:10", title: "The vendor API answers 503", because: "the vendor API is in maintenance", marker: "maintenance" },
  { time: "02:03:11", title: "The sync crashes holding the lock", because: "the 503 is raised outside the try block", marker: "try block" },
  { time: "03:00:00", title: "Every later sync is skipped", because: "the lock never expires", marker: "never expires" },
];

/** Motion is for claims about order in time; a page about anything else must not reach for a replay. */
function motionReasons(html: string, file: string): string[] {
  const markup = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  return /class="[^"]*\bui-replay\b/.test(markup) ? [`${file} uses ui-replay for a claim that is not about order in time`] : [];
}

function scoreSequence(dir: string, reasons: string[]): void {
  const html = readPage(dir, "report.html", reasons);
  if (!html) return;
  const layer = layerReasons(html, "report.html");
  const checked = checkReasons(dir, "report.html");
  reasons.push(...layer, ...checked);
  const dropped = EVENTS.filter((e) => !html.includes(e.time) || !html.includes(e.marker)).map((e) => e.time);
  if (dropped.length > 0) reasons.push(`events dropped or reworded: ${dropped.join(", ")}`);
  const markup = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  if (!/class="[^"]*\bui-replay\b/.test(markup)) { reasons.push("the events are in time order but the page has no ui-replay"); return; }
  const ticks = markup.match(/<i\b[^>]*--p:/g)?.length ?? 0;
  const shown = markup.match(/<h3\b[^>]*\bdata-n=/g)?.length ?? 0;
  if (ticks !== EVENTS.length || shown !== EVENTS.length) reasons.push(`the replay has ${ticks} ticks and ${shown} events, expected ${EVENTS.length}`);
}

function scoreFindings(dir: string, items: Finding[], reasons: string[]): void {
  const html = readPage(dir, "report.html", reasons);
  if (!html) return;
  const layer = layerReasons(html, "report.html");
  const motion = motionReasons(html, "report.html");
  reasons.push(...motion);
  const checked = checkReasons(dir, "report.html");
  reasons.push(...layer, ...checked);
  const missing = items.filter((f) => !html.includes(evidenceMarker(f)));
  if (missing.length > 0) reasons.push(`evidence dropped for ${missing.map((f) => f.id).join(", ")}`);
  if (/class="[^"]*\bui-toggle\b/.test(html) || /role="tab"/.test(html)) reasons.push("before/after sits behind a toggle or tabs, so only one side shows");
  const heading = h1Text(html);
  if (heading.split(" ").length < 5 || !/\d|F\d/.test(heading)) reasons.push("h1 does not state a decision with a number or an id");
  const { shown, folded } = splitDetails(html);
  const top = items.filter((f) => f.level === "critical");
  const hiddenTop = top.filter((f) => !shown.includes(evidenceMarker(f)));
  if (hiddenTop.length > 0) reasons.push(`critical finding ${hiddenTop.map((f) => f.id).join(", ")} is collapsed instead of shown in full`);
  const first = top[0];
  if (first?.before && first.after) {
    const token = (code: string): string => /\w+_f\d+/.exec(code)?.[0] ?? code;
    if (!shown.includes(token(first.before)) || !shown.includes(token(first.after))) reasons.push(`${first.id} before and after are not both on screen`);
  }
  const rest = items.filter((f) => f.level !== "critical");
  if (items.length >= 5) {
    const collapsed = rest.filter((f) => !shown.includes(evidenceMarker(f)) && folded.includes(evidenceMarker(f)));
    if (collapsed.length < Math.ceil(rest.length * 0.8)) reasons.push(`only ${collapsed.length} of ${rest.length} lower findings are collapsed into rows`);
  } else {
    const hidden = rest.filter((f) => !shown.includes(evidenceMarker(f)));
    if (hidden.length > 1) reasons.push(`a list of ${items.length} was collapsed (${hidden.length} hidden), but a short list should stay open`);
  }
}

function fixtureFindings(dir: string, items: Finding[]): void {
  writeFileSync(join(dir, "findings.json"), JSON.stringify(items, null, 2));
}

// ---------------------------------------------------------------- other new scenarios

function scoreRoute(dir: string, finalText: string, reasons: string[]): void {
  const html = readPage(dir, "deck.html", reasons);
  if (!/Route\W{1,6}Presentation/i.test(finalText)) reasons.push("final message does not state 'Route: Presentation'");
  if (!html) return;
  const slides = (html.match(/<section\b[^>]*class="[^"]*\bslide\b/g) ?? []).length;
  if (slides < 3) reasons.push(`deck.html has ${slides} slides, expected at least 3`);
  const layer = layerReasons(html, "deck.html");
  const checked = checkReasons(dir, "deck.html");
  reasons.push(...layer, ...checked);
}

function scoreExplainer(dir: string, reasons: string[]): void {
  const html = readPage(dir, "report.html", reasons);
  if (!html) return;
  const layer = layerReasons(html, "report.html");
  const checked = checkReasons(dir, "report.html");
  const motion = motionReasons(html, "report.html");
  reasons.push(...motion);
  reasons.push(...layer, ...checked);
  if (!html.includes("23.75")) reasons.push("page lacks the real result 23.75 for 7.5 kg");
  if (!/<h1\b/i.test(html)) reasons.push("page has no headline");
  const sections = (html.match(/<h2\b/gi) ?? []).length;
  if (sections >= 3 && !/class="[^"]*\bui-nav\b/.test(html)) reasons.push("three or more sections but no section menu");
}

// ---------------------------------------------------------------- explain route scoring (unchanged)

type Lesson = { title: string; inputs: { key: string; value: number }[]; sections: { blocks: { type: string; markup?: string; bars?: { value: number }[]; steps?: { id: string; expect?: number; expr: string }[] }[] }[] };

function checksRealResult(lesson: Lesson): boolean {
  const dependent = new Set(lesson.inputs.filter((input) => input.value === 3).map((input) => input.key));
  for (const section of lesson.sections) {
    for (const block of section.blocks) {
      if (block.type !== "Derivation") continue;
      for (const step of block.steps ?? []) {
        if (!(step.expr.match(/[A-Za-z_]\w*/g) ?? []).some((name) => dependent.has(name))) continue;
        if (step.expect === 14) return true;
        dependent.add(step.id);
      }
    }
  }
  return false;
}
function lesson(dir: string, file: string, reasons: string[]): Lesson | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const parsed = parseLesson(raw);
    if (!parsed.ok) { reasons.push(`${file} does not validate: ${parsed.errors.join("; ")}`); return null; }
    return parsed.lesson as Lesson;
  } catch { reasons.push(`${file} is missing or invalid JSON`); return null; }
}
function published(dir: string): { content: string; session: string } | null {
  const screens: { content: string; session: string; pushedAt: number }[] = [];
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name !== "current.json" || basename(entry.parentPath) !== "state") continue;
    const session = dirname(entry.parentPath);
    try {
      const current: { file: string; pushedAt: number } = JSON.parse(readFileSync(join(entry.parentPath, entry.name), "utf8"));
      const content = readFileSync(join(session, "content", basename(current.file)), "utf8");
      screens.push({ content, session, pushedAt: current.pushedAt });
    } catch { /* Incomplete sessions are not published screens. */ }
  }
  return screens.sort((a, b) => b.pushedAt - a.pushedAt)[0] ?? null;
}
function scorePublished(dir: string, scenario: Scenario, reasons: string[]): void {
  const publication = published(dir);
  const screen = publication?.content ?? "";
  if (!screen) reasons.push("nothing was published");
  if (scenario === "prototype") {
    const file = join(dir, "prototype.html");
    if (!existsSync(file)) reasons.push("prototype.html missing");
    else if (screen !== readFileSync(file, "utf8")) reasons.push("published screen is not prototype.html");
    const choices = new Set([...screen.matchAll(/data-choice\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]));
    if (choices.size < 2 || /assets\/explain\/renderer\.js/.test(screen)) reasons.push("published prototype needs two distinct choices");
    return;
  }
  const current = lesson(dir, scenario === "svg" ? "illustration.json" : "lesson.json", reasons);
  if (!screen.includes("/assets/explain/renderer.js")) reasons.push("published screen is not an Explain lesson");
  try {
    const encoded = /<script type="application\/json" id="spec">([\s\S]*?)<\/script>/.exec(screen)?.[1] ?? "";
    const spec: { elements: { lesson: { props: { title: string } } } } = JSON.parse(encoded);
    if (spec.elements.lesson.props.title !== current?.title) reasons.push("published lesson differs from the saved spec");
  } catch { reasons.push("published lesson has no valid render spec"); }
  if (scenario === "lesson" && current && !["client", "api", "database"].every((word) => JSON.stringify(current).toLowerCase().includes(word))) reasons.push("lesson does not show the requested request path");
  if (scenario === "expect" && (!current || !checksRealResult(current))) reasons.push("derivation lacks the real result 14 and input 3");
  if (scenario === "svg") {
    const chart = lesson(dir, "chart.json", reasons);
    const blocks = chart?.sections.flatMap((s) => s.blocks) ?? [];
    if (!blocks.some((block) => block.type === "Chart" && [3, 7].every((value) => block.bars?.some((bar) => bar.value === value))) || blocks.some((block) => block.type === "Svg")) reasons.push("comparison should use Chart with 3 and 7, not Svg");
    if (!current?.sections.some((s) => s.blocks.some((b) => b.type === "Svg" && /<circle\b/i.test(b.markup ?? "") && /<(?:path|polygon)\b/i.test(b.markup ?? "")))) reasons.push("illustration needs an Svg circle and triangle");
    if (!publication || !existsSync(join(publication.session, "content", "002-screen.html"))) reasons.push("both lessons were not published");
  }
}

// ---------------------------------------------------------------- commands

function score(dir: string, scenario: Scenario, finalText: string): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (scenario === "findings") scoreFindings(dir, FINDINGS, reasons);
  else if (scenario === "shortlist") scoreFindings(dir, SHORT, reasons);
  else if (scenario === "route") scoreRoute(dir, finalText, reasons);
  else if (scenario === "explainer") scoreExplainer(dir, reasons);
  else if (scenario === "sequence") scoreSequence(dir, reasons);
  else scorePublished(dir, scenario, reasons);
  return { pass: reasons.length === 0, reasons };
}

function fixture(dir: string, scenario: Scenario): void {
  mkdirSync(dir, { recursive: true });
  if (scenario === "findings") fixtureFindings(dir, FINDINGS);
  if (scenario === "shortlist") fixtureFindings(dir, SHORT);
  if (scenario === "route") writeFileSync(join(dir, "notes.md"), "# Invoice approval\n\nA clerk enters the invoice. A manager approves it when it is under 5,000. Finance approves it when it is 5,000 or more. Payment runs every Friday for everything approved that week.\n");
  if (scenario === "explainer") writeFileSync(join(dir, "fee.py"), 'def fee(weight_kg: float) -> float:\n    """Shipping fee in dollars: a flat base plus a per-kg rate, capped."""\n    return min(40.0, round(5.0 + 2.5 * weight_kg, 2))\n');
  if (scenario === "sequence") {
    const events = EVENTS.map((e) => ({ time: e.time, title: e.title, because: e.because }));
    const json = JSON.stringify({ events }, null, 2);
    const file = join(dir, "events.json");
    writeFileSync(file, json);
  }
  if (scenario === "expect") writeFileSync(join(dir, "calc.js"), 'export function calculate(n) { return n * 4 + 2; }\nif (import.meta.main) console.log(calculate(Number(process.argv[2])));\n');
}

const FILE_SCENARIOS: Scenario[] = ["findings", "shortlist", "route", "explainer", "sequence"];
const [command, dir, scenarioArg, textFile] = process.argv.slice(2);
const scenario = scenarioArg as Scenario;
if (command === "scenarios") console.log(JSON.stringify(defaults));
else if (!dir || !scenarios.includes(scenario)) { console.error("expected fixture|prompt|score <dir> <scenario>"); process.exit(2); }
else if (command === "fixture") fixture(dir, scenario);
else if (command === "prompt") {
  const file = FILE_SCENARIOS.includes(scenario);
  const setup = file ? `Work only in ${dir}. ${SETUP_NOTE}` : `Work only in ${dir}. Run bun commands there. The user approved the visual companion: start its session with --run-dir set to that folder, publish, then stop it. Do not open a browser.`;
  const discover = file ? "Build one self-contained HTML file. Do not use the network." : `Use the CLI help at ${join(import.meta.dir, "../scripts/cli.ts")}.`;
  const skillNote = file ? "Use the skill's references, templates and scripts. Copy a template into the folder instead of editing it in place. Keep all output inside the folder." : "Use the skill's local references and CLI; keep all output inside the fixture directory.";
  console.log(JSON.stringify({ setup, discover, skillNote, task: tasks[scenario] }));
} else if (command === "score") {
  const finalText = textFile && existsSync(textFile) ? readFileSync(textFile, "utf8") : "";
  const result = score(dir, scenario, finalText);
  console.log(JSON.stringify(result));
  process.exit(result.pass ? 0 : 1);
} else { console.error("unknown command"); process.exit(2); }
