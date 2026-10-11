import { describe, expect, it } from "bun:test";
import { formatMissingDependencyDiagnostic } from "../examples/dependency-guard";

// This skill has no path aliases; its tests use relative imports.
describe("given a missing dependency, when formatting diagnostics, then recovery identifies the package and skill directory", () => {
  it("identifies the missing package and a directory-scoped installation command", () => {
    const message = formatMissingDependencyDiagnostic("ignore", "/path/to/skill");
    expect(message).toContain("Missing required dependency 'ignore'");
    expect(message).toContain("cd /path/to/skill && bun install");
  });
});
