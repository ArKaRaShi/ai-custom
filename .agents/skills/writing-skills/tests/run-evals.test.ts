import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type AgentHandle,
  composePrompt,
  failureReport,
  formatTable,
  type RunRecord,
  runEvals,
  type SpawnAgent,
  summarize,
} from "@/scripts/run-evals";

const echoSkill = path.join(import.meta.dir, "fixtures", "echo-skill");
const tempFiles: string[] = [];

afterEach(() => {
  for (const file of tempFiles.splice(0)) fs.rmSync(file, { recursive: true, force: true });
});

const record = (arm: string, scenario: string, pass: boolean, reasons: string[] = []): RunRecord => ({
  arm,
  scenario,
  rep: 1,
  pass,
  reasons,
});

/** A spawner whose answer depends on the arm named in the prompt's skill path. */
function fakeAgent(answerFor: (prompt: string) => string | Error): SpawnAgent {
  return async (prompt): Promise<AgentHandle> => ({
    wait: async (): Promise<string> => {
      const answer = answerFor(prompt);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });
}

describe("given a scenario and an arm, when the prompt is composed, then the control gets no skill", () => {
  const scenario = { setup: "SETUP", discover: "DISCOVER", skillNote: "NOTE", task: "TASK" };

  it("sends the control the discovery hint and the skill arms the SKILL.md path", () => {
    const control = composePrompt(scenario, { name: "C" });
    expect(control).toContain("DISCOVER");
    expect(control).not.toContain("SKILL.md");
    const armed = composePrompt(scenario, { name: "B", docDir: "/arms/B" });
    expect(armed).toContain("/arms/B/SKILL.md");
    expect(armed).toContain("NOTE");
    expect(armed).not.toContain("DISCOVER");
  });

  it("always carries the no-human rule and ends with the task", () => {
    for (const arm of [{ name: "C" }, { name: "A", docDir: "/a" }]) {
      const prompt = composePrompt(scenario, arm);
      expect(prompt).toContain("No human can answer questions");
      expect(prompt.endsWith("Task: TASK")).toBe(true);
    }
  });
});

describe("given run records, when summarized, then pass counts and failure modes are exact", () => {
  const records = [
    record("A", "s1", true),
    record("A", "s1", false, ["x"]),
    record("A", "s1", false, ["x"]),
    record("A", "s1", false, ["y", "x"]),
    record("B", "s1", true),
    record("B", "s1", true),
  ];

  it("counts passes, totals and distinct failure sets per arm", () => {
    const cell = summarize(records).get("s1")?.get("A");
    expect(cell).toEqual({ passed: 1, total: 4, failureModes: 2 });
    expect(summarize(records).get("s1")?.get("B")).toEqual({ passed: 2, total: 2, failureModes: 0 });
  });

  it("renders a table with a total row and a dash for an arm with no runs", () => {
    const table = formatTable(records, ["A", "B", "C"]);
    expect(table).toContain("| s1 | 1/4 (2 failure modes) | 2/2 | - |");
    expect(table).toContain("| **all** | 1/4 | 2/2 | 0/0 |");
  });

  it("lists failure reasons most common first", () => {
    expect(failureReport(records).split("\n")).toEqual(["3x A / s1: x", "1x A / s1: y"]);
  });
});

describe("given a skill with evals, when run across arms, then each arm is scored on its own answers", () => {
  const arms = [{ name: "C" }, { name: "A", docDir: "/arms/A" }, { name: "B", docDir: "/arms/B" }];

  it("runs every scenario for every arm and repetition against fresh fixtures", async () => {
    const result = await runEvals({
      skillDir: echoSkill,
      arms,
      reps: 2,
      model: "test/model",
      agent: fakeAgent((prompt) => (prompt.includes("/arms/B/") ? "yes" : "no")),
    });
    expect(result.records).toHaveLength(2 * 3 * 2);
    expect(result.table).toContain("| answers-yes | 0/2 (1 failure modes) | 0/2 (1 failure modes) | 2/2 |");
    expect(result.table).toContain("| **all** | 0/4 | 0/4 | 4/4 |");
    expect(result.failures).toContain("answer was not yes");
    expect(result.guardChanged).toBe(false);
  });

  it("scores a rejected agent from its message and the fixture, instead of discarding the run", async () => {
    const result = await runEvals({
      skillDir: echoSkill,
      arms: [{ name: "B", docDir: "/arms/B" }],
      reps: 1,
      model: "test/model",
      scenarios: ["answers-yes"],
      agent: fakeAgent(() => new Error("model unavailable")),
    });
    expect(result.records).toEqual([
      { arm: "B", scenario: "answers-yes", rep: 1, pass: false, reasons: ["answer was not yes"] },
    ]);
  });

  it("flags a guard command whose output changed during the runs", async () => {
    const guarded = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "guard-")), "real.txt");
    tempFiles.push(path.dirname(guarded));
    fs.writeFileSync(guarded, "before");
    const options = {
      skillDir: echoSkill,
      arms: [{ name: "B", docDir: "/arms/B" }],
      reps: 1,
      model: "test/model",
      scenarios: ["answers-yes"],
      guard: [["cat", guarded]],
    };
    const quiet = await runEvals({ ...options, agent: fakeAgent(() => "yes") });
    expect(quiet.guardChanged).toBe(false);
    const touching = await runEvals({
      ...options,
      agent: fakeAgent(() => {
        fs.writeFileSync(guarded, "after");
        return "yes";
      }),
    });
    expect(touching.guardChanged).toBe(true);
  });
});
