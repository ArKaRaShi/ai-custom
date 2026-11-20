/**
 * Runs the commands in a trace spec and prints a `ui-trace` block (see assets/ui/components.json) whose <output> panes hold what
 * each command printed, so the data a reader sees comes from a real run and is never typed by hand.
 *   bun scripts/trace.ts <spec.json> [out.html]    print the block, or write it to out.html
 *
 * Spec: { code, input: { title, cmd, mark? }, steps: [{ title, code, plain, cmd, mark? }], summary?, timeoutSeconds? }
 *   cmd      a shell command whose stdout is the data to show (for example a script that prints one stage of a pipeline)
 *   mark     texts; every output line containing one is highlighted as changed
 *   summary  the sentence shown at the last step
 * Commands run through `sh -c` with the same trust as any command the author runs. Nothing is written when a command fails,
 * prints nothing, or a mark matches no output line.
 */
import { readFile, writeFile } from "node:fs/promises";

export type Pane = { cmd: string; mark: string[] };
export type Step = Pane & { title: string; code: string; plain: string };
export type Spec = { code: string; input: Pane & { title: string }; steps: Step[]; summary?: string; timeoutSeconds: number };

/** The one guard this file needs: the spec is hand-written JSON, so every field is checked as it is read. */
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function text(obj: Record<string, unknown>, key: string, where: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") throw new Error(`${where}.${key} must be a non-empty string`);
  return v;
}

function readPane(obj: Record<string, unknown>, where: string): Pane {
  const mark: unknown = obj.mark ?? [];
  if (!Array.isArray(mark) || !mark.every((m: unknown): m is string => typeof m === "string" && m !== "")) throw new Error(`${where}.mark must be a list of non-empty strings`);
  const cmd = text(obj, "cmd", where);
  return { cmd, mark };
}

export function parseSpec(raw: unknown): Spec {
  if (!isRecord(raw)) throw new Error("the spec must be a JSON object");
  const input = raw.input;
  if (!isRecord(input)) throw new Error("input must be an object with title and cmd");
  const list: unknown = raw.steps;
  if (!Array.isArray(list) || list.length === 0) throw new Error("steps must be a non-empty list");
  const items: unknown[] = list;
  const steps = items.map((s, i): Step => {
    const where = `steps[${i}]`;
    if (!isRecord(s)) throw new Error(`${where} must be an object`);
    const pane = readPane(s, where);
    const title = text(s, "title", where);
    const code = text(s, "code", where);
    const plain = text(s, "plain", where);
    return { ...pane, title, code, plain };
  });
  const timeout: unknown = raw.timeoutSeconds ?? 120;
  if (typeof timeout !== "number" || !(timeout > 0)) throw new Error("timeoutSeconds must be a positive number");
  const summary: unknown = raw.summary;
  if (summary !== undefined && typeof summary !== "string") throw new Error("summary must be a string");
  const code = text(raw, "code", "spec");
  const inputPane = readPane(input, "input");
  const inputTitle = text(input, "title", "input");
  return { code, input: { ...inputPane, title: inputTitle }, steps, summary, timeoutSeconds: timeout };
}

async function run(cmd: string, where: string, timeoutSeconds: number): Promise<string> {
  const proc = Bun.spawn(["sh", "-c", cmd], { stdout: "pipe", stderr: "pipe", timeout: timeoutSeconds * 1000 });
  const stdout = new Response(proc.stdout).text();
  const stderr = new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  const out = await stdout;
  const err = (await stderr).trim();
  if (exitCode !== 0) throw new Error(`${where}: \`${cmd}\` exited ${exitCode}${err ? `: ${err}` : ""}`);
  const printed = out.replace(/\s+$/, "");
  if (printed === "") throw new Error(`${where}: \`${cmd}\` printed nothing`);
  return printed;
}

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function outputPane(pane: Pane, printed: string, where: string): string {
  const lines = printed.split("\n");
  for (const m of pane.mark) if (!lines.some((l) => l.includes(m))) throw new Error(`${where}: mark "${m}" matches no output line`);
  const body = lines.map((l) => (pane.mark.some((m) => l.includes(m)) ? `<mark>${esc(l)}</mark>` : esc(l))).join("\n");
  return `<output data-ran="${esc(pane.cmd)}">${body}</output>`;
}

export function renderTrace(spec: Spec, inputPrinted: string, stepsPrinted: string[]): string {
  const n = spec.steps.length;
  const steps = spec.steps
    .map((s, i) => `<section>\n<h3>Step ${i + 1} of ${n} \u00b7 ${esc(s.title)}</h3>\n<pre>${esc(s.code)}</pre>\n<p>${esc(s.plain)}</p>\n${outputPane(s, stepsPrinted[i]!, `step ${i + 1}`)}\n</section>`)
    .join("\n");
  const footer = spec.summary ? `\n<footer>${esc(spec.summary)}</footer>` : "";
  return `<div class="ui-trace">\n<pre>${esc(spec.code)}</pre>\n<h3>${esc(spec.input.title)}</h3>\n${outputPane(spec.input, inputPrinted, "input")}\n${steps}${footer}\n</div>\n`;
}

/** Runs every command (concurrently; they are independent) and renders the block. Throws before returning anything if any step fails. */
export async function buildTrace(spec: Spec): Promise<string> {
  const t = spec.timeoutSeconds;
  const inputRun = run(spec.input.cmd, "input", t);
  const stepRuns = spec.steps.map((s, i) => run(s.cmd, `step ${i + 1}`, t));
  const printed = await Promise.all([inputRun, ...stepRuns]);
  const [inputPrinted, ...stepsPrinted] = printed;
  return renderTrace(spec, inputPrinted!, stepsPrinted);
}

async function main(argv: string[]): Promise<number> {
  const [file, out] = argv;
  if (!file) {
    console.error("usage: trace.ts <spec.json> [out.html]");
    return 2;
  }
  try {
    const source = await readFile(file, "utf8");
    const raw: unknown = JSON.parse(source);
    const spec = parseSpec(raw);
    const html = await buildTrace(spec);
    if (out) await writeFile(out, html);
    else process.stdout.write(html);
    return 0;
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const code = await main(argv);
  process.exit(code);
}
