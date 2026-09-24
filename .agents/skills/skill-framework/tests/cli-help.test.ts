import { describe, expect, it } from "bun:test";
import * as path from "path";

const cliPath = path.resolve(import.meta.dir, "../examples/cli-help.ts");

function run(...args: string[]): { exitCode: number | null; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["bun", cliPath, ...args]);
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

describe("given CLI entry point, when help and options are used, then behavior follows the public contract", () => {
  it("shows top-level help with --help", () => {
    const result = run("--help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("inspect <identifier>");
    expect(result.stdout).toContain("--format=<value>");
  });

  it("shows top-level help with -h", () => {
    const result = run("-h");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("inspect <identifier>");
  });

  it("shows inspect help before requiring its identifier", () => {
    const result = run("inspect", "--help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: ... inspect <identifier>");
    expect(result.stdout).toContain("--format=<value>");
  });

  it("treats --verbose as boolean before the identifier", () => {
    const result = run("inspect", "--verbose", "item-7");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("identifier: item-7");
    expect(result.stdout).toContain("verbose: true");
  });

  it("accepts a separate --format value", () => {
    const result = run("inspect", "item-7", "--format", "json");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("format: json");
  });

  it("accepts an equals-form --format value", () => {
    const result = run("inspect", "item-7", "--format=json");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("format: json");
  });

  it("rejects an unknown flag", () => {
    const result = run("inspect", "item-7", "--unknown");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Unknown flag");
  });

  it("rejects --format without a value", () => {
    const result = run("inspect", "item-7", "--format");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("requires a value");
  });

  it("rejects an option-looking token as a missing --format value", () => {
    const result = run("inspect", "item-7", "--format", "-z");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("requires a value");
  });
});
