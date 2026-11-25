#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { indexFinding } from "../../hooks/post/agents-index";

function sandbox(readme: string | undefined, standardsReadme: string | undefined): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agents-index-"));
  const standards = path.join(home, ".agents/standards");
  fs.mkdirSync(standards, { recursive: true });
  if (readme !== undefined) fs.writeFileSync(path.join(home, ".agents/README.md"), readme);
  if (standardsReadme !== undefined) fs.writeFileSync(path.join(standards, "README.md"), standardsReadme);
  return home;
}

function entry(home: string, relative: string): string {
  return path.join(home, relative);
}

describe("given the agents index hook, when a root-level .agents entry is written, then the catalog must name it", () => {
  it("reports a standard missing from the standards catalog", () => {
    const home = sandbox("# .agents\n\n| [standards](standards/README.md) |\n", "# Standards\n");
    const file = entry(home, ".agents/standards/new.md");
    const finding = indexFinding(home, file);
    expect(finding).toContain(".agents/standards/README.md");
    expect(finding).toContain("new.md");
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("accepts a standard the catalog lists", () => {
    const home = sandbox("# .agents\n\n| [standards](standards/README.md) |\n", "# Standards\n\n| [new](new.md) |\n");
    const file = entry(home, ".agents/standards/new.md");
    expect(indexFinding(home, file)).toBeUndefined();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("asks the standards catalog to exist at all", () => {
    const home = sandbox("# .agents\n", undefined);
    const file = entry(home, ".agents/standards/new.md");
    const finding = indexFinding(home, file);
    expect(finding).toContain("does not exist");
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("checks the root map for a root-level file", () => {
    const home = sandbox("# .agents\n", "# Standards\n");
    const file = entry(home, ".agents/notes.md");
    const finding = indexFinding(home, file);
    expect(finding).toContain(".agents/README.md");
    expect(finding).toContain("notes.md");
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("checks that the root map names the standards folder when its README changes", () => {
    const home = sandbox("# .agents\n\nskills only\n", "# Standards\n");
    const file = entry(home, ".agents/standards/README.md");
    const finding = indexFinding(home, file);
    expect(finding).toContain("standards/");
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("ignores skills, deeper paths, and files outside .agents", () => {
    const home = sandbox("# .agents\n", "# Standards\n");
    const skill = entry(home, ".agents/skills/demo/SKILL.md");
    const deep = entry(home, ".agents/standards/deep/x.md");
    expect(indexFinding(home, skill)).toBeUndefined();
    expect(indexFinding(home, deep)).toBeUndefined();
    expect(indexFinding(home, "/tmp/elsewhere/file.md")).toBeUndefined();
    fs.rmSync(home, { recursive: true, force: true });
  });
});
