import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import * as path from "path";

describe("given skills referencing external capabilities, when inspected, then they require subskills with non-blocking fallbacks", () => {
  it("skill-framework SKILL.md specifies REQUIRE SUBSKILL and non-blocking fallback", () => {
    const skillPath = path.resolve(import.meta.dir, "../SKILL.md");
    const content = readFileSync(skillPath, "utf-8");

    expect(content).toContain("**REQUIRE SUBSKILL:**");
    expect(content).toContain("writing-skills");
    expect(content).toContain("without stalling");
  });

  it("skill-layout.md mandates REQUIRE SUBSKILL and non-blocking fallback rule", () => {
    const layoutPath = path.resolve(import.meta.dir, "../references/skill-layout.md");
    const content = readFileSync(layoutPath, "utf-8");

    expect(content).toContain("**REQUIRE SUBSKILL:**");
    expect(content).toContain("Every subskill reference must specify a non-blocking fallback action");
    expect(content).toContain("without stalling");
  });

  it("consuming skills (git-pr and git-commit) adhere to REQUIRE SUBSKILL with fallback", () => {
    const gitPrPath = path.resolve(import.meta.dir, "../../git-pr/SKILL.md");
    const gitCommitPath = path.resolve(import.meta.dir, "../../git-commit/SKILL.md");

    const gitPrContent = readFileSync(gitPrPath, "utf-8");
    const gitCommitContent = readFileSync(gitCommitPath, "utf-8");

    expect(gitPrContent).toContain("**REQUIRE SUBSKILL:** `markdown-quality`");
    expect(gitPrContent).toContain("without stalling");

    expect(gitCommitContent).toContain("**REQUIRE SUBSKILL:** `markdown-quality`");
    expect(gitCommitContent).toContain("without stalling");
  });

  it("skill-layout.md permits package manifests with mandatory dependency documentation and untracked node_modules", () => {
    const layoutPath = path.resolve(import.meta.dir, "../references/skill-layout.md");
    const content = readFileSync(layoutPath, "utf-8");

    expect(content).toContain("Package Manifests and Dependencies");
    expect(content).toContain("references/dependencies.md");
    expect(content).toContain("node_modules` must remain untracked");
  });

  it("cli.md and skill-layout.md mandate safe-by-default preview with explicit mutation flags", () => {
    const cliPath = path.resolve(import.meta.dir, "../references/primitives/cli.md");
    const layoutPath = path.resolve(import.meta.dir, "../references/skill-layout.md");

    const cliContent = readFileSync(cliPath, "utf-8");
    const layoutContent = readFileSync(layoutPath, "utf-8");

    expect(cliContent).toContain("Safe-by-default mutations");
    expect(cliContent).toContain("--apply");
    expect(layoutContent).toContain("preview actions by default and require explicit flags");
  });

  it("cli.md and skill-layout.md mandate dual-mode tree and JSON logging", () => {
    const cliPath = path.resolve(import.meta.dir, "../references/primitives/cli.md");
    const layoutPath = path.resolve(import.meta.dir, "../references/skill-layout.md");

    const cliContent = readFileSync(cliPath, "utf-8");
    const layoutContent = readFileSync(layoutPath, "utf-8");

    expect(cliContent).toContain("Standard Logging Contract");
    expect(cliContent).toContain("--format=json");
    expect(layoutContent).toContain("tree logs for human terminals and structured JSON");
  });
});
