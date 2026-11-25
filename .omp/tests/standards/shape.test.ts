#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { checkStandard } from "../../hooks/shared/standards";

const REPO = path.resolve(import.meta.dir, "../../..");
const STANDARDS_DIR = path.join(REPO, ".agents/standards");
const home = os.homedir();

function exists(target: string): boolean {
  return fs.existsSync(target);
}

const files = fs.readdirSync(STANDARDS_DIR).filter((name) => name.endsWith(".md") && name !== "README.md");

describe("given the standards folder, when each file is checked against the template, then none departs from the shape", () => {
  it("accepts every standard file", () => {
    for (const name of files) {
      const text = fs.readFileSync(path.join(STANDARDS_DIR, name), "utf8");
      expect({ name, findings: checkStandard(text, { home, exists }) }).toEqual({ name, findings: [] });
    }
  });

  it("rejects a file with no enforcement table", () => {
    const text = fs.readFileSync(path.join(STANDARDS_DIR, "working-with-image.md"), "utf8");
    const withoutTable = text.split("## Enforced by")[0];
    const findings = checkStandard(withoutTable, { home, exists });
    expect(findings.map((finding) => finding.rule)).toContain("enforced");
  });

  it("rejects an adapter that does not exist", () => {
    const text = fs.readFileSync(path.join(STANDARDS_DIR, "working-with-image.md"), "utf8");
    const broken = text.replace("| omp | — | — |", "| omp | ~/.omp/agent/hooks/pre/removed.ts | ADVISORY |");
    const findings = checkStandard(broken, { home, exists });
    expect(findings.map((finding) => finding.rule)).toContain("adapter");
  });

  it("rejects a category that is not a hook category", () => {
    const text = fs.readFileSync(path.join(STANDARDS_DIR, "working-with-image.md"), "utf8");
    const broken = text.replace("| omp | — | — |", "| omp | — | LOUD |");
    const findings = checkStandard(broken, { home, exists });
    expect(findings.map((finding) => finding.rule)).toContain("category");
  });
});
