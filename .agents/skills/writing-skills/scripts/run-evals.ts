/**
 * Runs a skill's evals across arms and repetitions, then summarizes pass rates. The skill supplies
 * `<skill>/evals/harness.ts` (scenarios, fixture, prompt, score); this file owns everything else.
 * The agent spawner is a parameter, so it runs inside an eval cell where `agent()` exists:
 *
 *   const { runEvals } = await import("<writing-skills>/scripts/run-evals.ts");
 *   await runEvals({ skillDir, arms, reps: 5, model, agent: (p, o) => agent(p, { model: o.model, label: o.label }) });
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface Arm {
  name: string;
  /** Folder holding the `SKILL.md` this arm reads. Omit for the control arm, which gets no skill. */
  docDir?: string;
}

export interface AgentHandle {
  wait(): Promise<string>;
}

export type SpawnAgent = (prompt: string, options: { model: string; label: string }) => Promise<AgentHandle>;

export interface RunOptions {
  /** Folder of the skill under test; its `evals/harness.ts` supplies the scenarios. */
  skillDir: string;
  arms: Arm[];
  reps: number;
  /** One exact `provider/model-id[:level]`. Use the smallest model the skill is meant for. */
  model: string;
  agent: SpawnAgent;
  scenarios?: string[];
  /** Commands whose output must be identical before and after, to prove nothing real changed. */
  guard?: string[][];
  concurrency?: number;
}

export interface RunRecord {
  arm: string;
  scenario: string;
  rep: number;
  pass: boolean;
  reasons: string[];
}

export interface ScenarioPrompt {
  setup: string;
  discover: string;
  skillNote: string;
  task: string;
}

const NO_HUMAN =
  "No human can answer questions during this run. If the work needs an approval you were not given, stop and say exactly what you would run. Finish with a short summary of what you did and what state things are in.";

/** The full prompt for one run: sandbox setup, how the arm learns the tool, the no-human rule, the task. */
export function composePrompt(scenario: ScenarioPrompt, arm: Arm): string {
  const learn =
    arm.docDir === undefined
      ? scenario.discover
      : `First read ${path.join(arm.docDir, "SKILL.md")} and follow it. ${scenario.skillNote}`;
  return [scenario.setup, learn, NO_HUMAN, "", `Task: ${scenario.task}`].join("\n");
}

export interface Cell {
  passed: number;
  total: number;
  /** Distinct sets of failure reasons across the failing runs; fewer means more consistent failures. */
  failureModes: number;
}

/** Pass counts per scenario and arm. */
export function summarize(records: RunRecord[]): Map<string, Map<string, Cell>> {
  const out = new Map<string, Map<string, Cell>>();
  for (const record of records) {
    const row = out.get(record.scenario) ?? new Map<string, Cell>();
    out.set(record.scenario, row);
    const cell = row.get(record.arm) ?? { passed: 0, total: 0, failureModes: 0 };
    row.set(record.arm, cell);
    cell.total += 1;
    if (record.pass) cell.passed += 1;
  }
  for (const [scenario, row] of out) {
    for (const [arm, cell] of row) {
      const modes = new Set(
        records
          .filter((r) => r.scenario === scenario && r.arm === arm && !r.pass)
          .map((r) => [...r.reasons].sort().join(" | ")),
      );
      cell.failureModes = modes.size;
    }
  }
  return out;
}

/** A Markdown table: one row per scenario, one column per arm, cells `passed/total (n failure modes)`. */
export function formatTable(records: RunRecord[], arms: string[]): string {
  const summary = summarize(records);
  const lines = [`| scenario | ${arms.join(" | ")} |`, `| --- | ${arms.map(() => "---").join(" | ")} |`];
  for (const [scenario, row] of summary) {
    const cells = arms.map((arm) => {
      const cell = row.get(arm);
      if (!cell) return "-";
      return `${cell.passed}/${cell.total}${cell.failureModes > 0 ? ` (${cell.failureModes} failure modes)` : ""}`;
    });
    lines.push(`| ${scenario} | ${cells.join(" | ")} |`);
  }
  const total = (arm: string): string => {
    const mine = records.filter((r) => r.arm === arm);
    return `${mine.filter((r) => r.pass).length}/${mine.length}`;
  };
  lines.push(`| **all** | ${arms.map(total).join(" | ")} |`);
  return lines.join("\n");
}

/** Failure reasons grouped by arm, most common first, so each can be read by hand. */
export function failureReport(records: RunRecord[]): string {
  const counts = new Map<string, number>();
  for (const r of records.filter((x) => !x.pass)) {
    for (const reason of r.reasons) {
      const key = `${r.arm} / ${r.scenario}: ${reason}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${n}x ${key}`)
    .join("\n");
}

function harnessJson<T>(skillDir: string, args: string[]): T {
  const out = Bun.spawnSync(["bun", path.join(skillDir, "evals", "harness.ts"), ...args]);
  if (out.exitCode !== 0) throw new Error(`harness ${args.join(" ")} failed: ${out.stderr.toString()}`);
  return JSON.parse(out.stdout.toString()) as T;
}

function guardState(commands: string[][]): string[] {
  return commands.map((cmd) => {
    const out = Bun.spawnSync(cmd);
    return `${out.exitCode}:${out.stdout.toString()}`;
  });
}

/** One run: fresh fixture, one agent, then the skill's scorer. */
async function runOne(opts: RunOptions, arm: Arm, scenario: string, rep: number): Promise<RunRecord> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `eval-${scenario}-${arm.name}-`));
  const harness = path.join(opts.skillDir, "evals", "harness.ts");
  try {
    const built = Bun.spawnSync(["bun", harness, "fixture", dir, scenario]);
    if (built.exitCode !== 0) throw new Error(`fixture failed: ${built.stderr.toString()}`);
    const described = harnessJson<ScenarioPrompt>(opts.skillDir, ["prompt", dir, scenario]);
    const handle = await opts.agent(composePrompt(described, arm), {
      model: opts.model,
      label: `${scenario}-${arm.name}-${rep}`,
    });
    // An agent that stops and reports a blocker rejects its wait(). The report is still its answer,
    // and the fixture state still counts, so score both.
    const finalText = await handle.wait().catch((error: Error) => error.message);
    const textFile = path.join(dir, "final.txt");
    fs.writeFileSync(textFile, finalText);
    const scored = Bun.spawnSync(["bun", harness, "score", dir, scenario, textFile]);
    const parsed = JSON.parse(scored.stdout.toString()) as { pass: boolean; reasons: string[] };
    return { arm: arm.name, scenario, rep, pass: parsed.pass, reasons: parsed.reasons };
  } catch (error) {
    return { arm: arm.name, scenario, rep, pass: false, reasons: [`run error: ${(error as Error).message}`] };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export interface RunResult {
  records: RunRecord[];
  table: string;
  failures: string;
  /** True when a guard command's output changed, meaning a run touched something real. */
  guardChanged: boolean;
}

export async function runEvals(opts: RunOptions): Promise<RunResult> {
  const scenarios = opts.scenarios ?? harnessJson<string[]>(opts.skillDir, ["scenarios"]);
  const guardBefore = guardState(opts.guard ?? []);
  const jobs: Array<() => Promise<RunRecord>> = [];
  for (const scenario of scenarios) {
    for (const arm of opts.arms) {
      for (let rep = 1; rep <= opts.reps; rep++) jobs.push(() => runOne(opts, arm, scenario, rep));
    }
  }
  const records: RunRecord[] = [];
  const limit = opts.concurrency ?? 12;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (job) records.push(await job());
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  const guardChanged = JSON.stringify(guardBefore) !== JSON.stringify(guardState(opts.guard ?? []));
  const armNames = opts.arms.map((a) => a.name);
  return { records, table: formatTable(records, armNames), failures: failureReport(records), guardChanged };
}
