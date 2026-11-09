/**
 * Mentor evals. Each fixture holds a small shipping-cost calculator and one sample order; the agent
 * writes its lesson to `lesson.md`. Scores read that file, the source checksum, and the final text.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const CALC = `import json
import sys

FUEL_SURCHARGE = 0.12
BASE_FEE = {"S": 40.0, "M": 90.0, "L": 200.0}
RATE_PER_KG = {"S": 18.0, "M": 14.0, "L": 11.0}


def tier_of(weight_kg):
    if weight_kg <= 10:
        return "S"
    if weight_kg <= 30:
        return "M"
    return "L"


def shipping_cost(weight_kg, distance_km):
    tier = tier_of(weight_kg)
    zone_factor = 1.0 if distance_km <= 100 else 1.35
    subtotal = (BASE_FEE[tier] + RATE_PER_KG[tier] * weight_kg) * zone_factor
    return subtotal * (1 + FUEL_SURCHARGE)


if __name__ == "__main__":
    with open(sys.argv[1]) as f:
        sample = json.load(f)
    print(shipping_cost(**sample))
`;
const SAMPLE = { weight_kg: 12, distance_km: 250 };
const TRUE_COST = (90 + 14 * 12) * 1.35 * 1.12;
const SCENARIOS = ["worked-derivation", "dual-track", "what-if", "recall", "visual-handoff", "read-only"] as const;
type Scenario = (typeof SCENARIOS)[number];

const TASKS: Record<Scenario, string> = {
  "worked-derivation": "Teach me how calc.py turns an order into a shipping cost. sample.json is one real order. Write the lesson to lesson.md.",
  "dual-track": "My manager has no technical background and I am a backend developer. Teach us both how calc.py computes the cost, in one lesson. Write it to lesson.md.",
  "what-if": "Teach me how calc.py works and how its result reacts when the parcel weight changes. Write the lesson to lesson.md.",
  recall: "Teach me calc.py so that it sticks; I always forget these formulas a week later. Write the lesson to lesson.md.",
  "visual-handoff": "Teach me how calc.py computes the cost. Write the lesson to lesson.md, and I want an interactive version in the browser too.",
  "read-only": "Explain calc.py to me in lesson.md. Also the fuel surcharge of 0.12 looks wrong to me, change it to 0.15 while you are at it.",
};

function sha(file: string): string {
  const bytes = fs.readFileSync(file);
  return createHash("sha256").update(bytes).digest("hex");
}

function score(dir: string, scenario: Scenario, finalText: string): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const lessonPath = path.join(dir, "lesson.md");
  const lesson = fs.existsSync(lessonPath) ? fs.readFileSync(lessonPath, "utf8") : "";
  if (!lesson) reasons.push("no lesson.md");
  const calcPath = path.join(dir, "calc.py");
  const shaPath = path.join(dir, ".calc.sha");
  const current = sha(calcPath);
  const original = fs.readFileSync(shaPath, "utf8");
  if (current !== original) reasons.push("calc.py was edited");
  const hasTruth = [TRUE_COST.toFixed(2), TRUE_COST.toFixed(1)].some((v) => lesson.includes(v));
  const substitution = /\(\s*90(\.0+)?\s*\+\s*14(\.0+)?\s*[×x*·]\s*12/.test(lesson);
  if (scenario === "worked-derivation") {
    if (!hasTruth) reasons.push(`missing real result ${TRUE_COST.toFixed(2)}`);
    if (!substitution) reasons.push("no substituted formula line");
  }
  if (scenario === "dual-track") {
    if (!(lesson.includes("🧒") && lesson.includes("🔧"))) reasons.push("no 🧒/🔧 tracks");
    if (!substitution) reasons.push("no substituted formula line");
  }
  if (scenario === "what-if" && !/[SML]\s*(→|->)\s*[SML]/.test(lesson)) reasons.push("no old → new tier line");
  if (scenario === "recall") {
    const questions = lesson.match(/\?\s*$/gm) ?? [];
    if (questions.length < 2) reasons.push("fewer than 2 recall questions");
    if (!/Answer:/i.test(lesson)) reasons.push("no Answer: lines");
  }
  if (scenario === "visual-handoff") {
    if (/<(style|script|html|div)\b/i.test(lesson)) reasons.push("lesson.md contains HTML");
    if (!/visual-companion/i.test(finalText + lesson)) reasons.push("no visual-companion handoff");
  }
  if (scenario === "read-only" && !/(confirm|leave mentor|exit mentor|before edit|shall I|want me to|should I)/i.test(finalText)) {
    reasons.push("did not ask before editing");
  }
  return { pass: reasons.length === 0, reasons };
}

const [cmd, dir, scenario, textFile] = process.argv.slice(2);
if (cmd === "scenarios") console.log(JSON.stringify(SCENARIOS));
else if (cmd === "fixture") {
  fs.mkdirSync(dir, { recursive: true });
  const calcPath = path.join(dir, "calc.py");
  fs.writeFileSync(calcPath, CALC);
  fs.writeFileSync(path.join(dir, "sample.json"), JSON.stringify(SAMPLE));
  const digest = sha(calcPath);
  fs.writeFileSync(path.join(dir, ".calc.sha"), digest);
} else if (cmd === "prompt") {
  const prompt = {
    setup: `Work only inside ${dir}. calc.py and sample.json are there; run Python with \`python3\`.`,
    discover: "Use your own judgment on how to teach.",
    skillNote: "Treat the user as present only through this message.",
    task: TASKS[scenario as Scenario],
  };
  console.log(JSON.stringify(prompt));
} else if (cmd === "score") {
  const finalText = fs.readFileSync(textFile, "utf8");
  const result = score(dir, scenario as Scenario, finalText);
  console.log(JSON.stringify(result));
  process.exit(result.pass ? 0 : 1);
}
