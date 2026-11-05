#!/usr/bin/env bun
// A minimal eval harness used only to test the runner: a scenario passes when the agent's final
// text contains the word "yes".
import * as fs from "node:fs";
import * as path from "node:path";

const [command, dir, scenario, textFile] = process.argv.slice(2);

if (command === "scenarios") {
  console.log(JSON.stringify(["answers-yes", "needs-a-fixture-file"]));
} else if (command === "fixture" && dir) {
  fs.writeFileSync(path.join(dir, "marker.txt"), scenario ?? "");
} else if (command === "prompt" && dir) {
  console.log(
    JSON.stringify({
      setup: `sandbox ${dir}`,
      discover: "learn it with --help",
      skillNote: "no extra notes",
      task: `scenario ${scenario}`,
    }),
  );
} else if (command === "score" && dir && textFile) {
  const text = fs.readFileSync(textFile, "utf8");
  const marker = fs.readFileSync(path.join(dir, "marker.txt"), "utf8");
  const reasons: string[] = [];
  if (!/yes/.test(text)) reasons.push("answer was not yes");
  if (marker !== scenario) reasons.push("fixture file missing");
  console.log(JSON.stringify({ pass: reasons.length === 0, reasons }));
} else {
  console.error("bad harness call");
  process.exit(2);
}
