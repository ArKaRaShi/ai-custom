#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";

const REPO = `${import.meta.dir}/../..`;

describe("given the hook shared modules, when the compiler checks them, then they have no type errors", () => {
  it("given ./typecheck.sh, when run, then tsc exits clean", () => {
    const result = Bun.spawnSync(["sh", "./typecheck.sh"], { cwd: REPO, stderr: "pipe", stdout: "pipe" });
    const output = result.stdout.toString() + result.stderr.toString();
    expect({ exitCode: result.exitCode, output: result.exitCode === 0 ? "" : output.trim() }).toEqual({ exitCode: 0, output: "" });
  });
});
