import { afterAll, describe, expect, it } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const enabled = process.env.STARTER_ACCEPTANCE === "1";
const assets = resolve(import.meta.dir, "../assets/starters");
const fixtures: string[] = [];
afterAll(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});
function run(cwd: string, args: string[], extraEnv?: Record<string, string>): { code: number; output: string } {
  const result = Bun.spawnSync(args, {
    cwd, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, GOTOOLCHAIN: "local", GOPROXY: "off", GOSUMDB: "off", GONOPROXY: "none", ...extraEnv },
  });
  return { code: result.exitCode, output: `${result.stdout}${result.stderr}` };
}
function temporary(): string {
  const dir = mkdtempSync(join(tmpdir(), "starter-scopes-"));
  fixtures.push(dir);
  return dir;
}
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  function visit(current: string, prefix: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const rel = prefix + entry.name;
      if (entry.isDirectory()) visit(join(current, entry.name), `${rel}/`);
      else files[rel] = readFileSync(join(current, entry.name)).toString("base64");
    }
  }
  visit(dir, "");
  return files;
}
function source(dir: string): void {
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "scripts/greet.ts"), 'export function greet(name: string): string {\n  return `hello ${name}`;\n}\n');
  writeFileSync(join(dir, "tests/greet.test.ts"), 'import { expect, test } from "bun:test";\nimport { greet } from "@/scripts/greet";\ntest("greeting includes the input name", () => expect(greet("sam")).toBe("hello sam"));\n');
}
function prepare(standalone: boolean): { root: string; skill: string; owner: string } {
  const root = temporary();
  const skill = standalone ? root : join(root, "example-skill");
  const owner = root;
  cpSync(join(assets, "shared-bun"), root, { recursive: true });
  const tools = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
  cpSync(join(assets, "typescript"), skill, { recursive: true });
  if (standalone) {
    const pkg = JSON.parse(readFileSync(join(skill, "package.json"), "utf8")) as { devDependencies?: Record<string, string> };
    pkg.devDependencies = tools.devDependencies;
    writeFileSync(join(skill, "package.json"), JSON.stringify(pkg));
    const config = JSON.parse(readFileSync(join(assets, "shared-bun/tsconfig.json"), "utf8")) as { compilerOptions: Record<string, unknown> };
    config.compilerOptions.paths = { "@/*": ["./*"] };
    writeFileSync(join(skill, "tsconfig.json"), JSON.stringify({ ...config, include: ["scripts", "tests", "examples"] }));
  }
  source(skill);
  expect(run(owner, ["bun", "install"]).code).toBe(0);
  expect(run(skill, ["bun", "run", "fix"]).code).toBe(0);
  expect(run(owner, ["bun", "install", "--frozen-lockfile"]).code).toBe(0);
  return { root, skill, owner };
}

describe.skipIf(!enabled)("given Bun scopes, when checking skills, then ownership and local rules hold", () => {
  for (const standalone of [false, true]) {
    it(standalone ? "checks a standalone skill without a parent setup" : "checks an inherited skill using only parent tools", () => {
      const { root, skill, owner } = prepare(standalone);
      const beforeCheck = snapshot(root);
      expect(run(skill, ["bun", "run", "check"]).code).toBe(0);
      expect(run(skill, ["bun", "test"]).code).toBe(0);
      expect(snapshot(root)).toEqual(beforeCheck);
      if (!standalone) expect(existsSync(join(skill, "node_modules"))).toBe(false);
      expect(existsSync(join(owner, "bun.lock"))).toBe(true);
      const defects = [
        { text: "export const x = ;\n", command: "typecheck" },
        { text: 'export const x: number = "text";\n', command: "typecheck" },
        { text: "export function f(value: any): unknown {\n  return value;\n}\n", command: "lint" },
        { text: 'import { nope } from "@/scripts/missing";\nexport const x = nope;\n', command: "typecheck" },
        { text: "export const x   =   1\n", command: "format:check" },
      ];
      for (const defect of defects) {
        const file = join(skill, "scripts/bad.ts");
        writeFileSync(file, defect.text);
        const before = snapshot(root);
        expect(run(skill, ["bun", "run", defect.command]).code).not.toBe(0);
        expect(run(skill, ["bun", "run", "check"]).code).not.toBe(0);
        expect(snapshot(root)).toEqual(before);
        rmSync(file);
      }
      writeFileSync(join(skill, "scripts/drift.ts"), "export const x   =   1\n");
      expect(run(skill, ["bun", "run", "fix"]).code).toBe(0);
      const beforeFinalCheck = snapshot(root);
      expect(run(skill, ["bun", "run", "check"]).code).toBe(0);
      expect(snapshot(root)).toEqual(beforeFinalCheck);
    }, 300_000);
  }
  it("changes one child's indentation without changing its sibling or shared policy", () => {
    const { root, skill } = prepare(false);
    const sibling = join(root, "sibling");
    cpSync(join(assets, "typescript"), sibling, { recursive: true });
    source(sibling);
    expect(run(sibling, ["bun", "run", "fix"]).code).toBe(0);
    const globalBefore = readFileSync(join(root, "biome.json"), "utf8");
    const siblingBefore = snapshot(sibling);
    cpSync(join(assets, "typescript-override"), skill, { recursive: true });
    const beforeOverrideFormat = snapshot(skill);
    expect(run(skill, ["bun", "run", "format:check"]).code).not.toBe(0);
    expect(snapshot(skill)).toEqual(beforeOverrideFormat);
    expect(run(skill, ["bun", "run", "fix"]).code).toBe(0);
    expect(readFileSync(join(skill, "scripts/greet.ts"), "utf8")).toContain("    return");
    const beforeOverrideCheck = snapshot(root);
    expect(run(skill, ["bun", "run", "check"]).code).toBe(0);
    expect(run(sibling, ["bun", "run", "check"]).code).toBe(0);
    expect(snapshot(root)).toEqual(beforeOverrideCheck);
    expect(snapshot(sibling)).toEqual(siblingBefore);
    expect(readFileSync(join(root, "biome.json"), "utf8")).toBe(globalBefore);
  }, 300_000);
  it("fails without installing when the chosen shared tool owner is missing", () => {
    const root = temporary();
    const skill = join(root, "skill");
    cpSync(join(assets, "shared-bun"), root, { recursive: true });
    cpSync(join(assets, "typescript"), skill, { recursive: true });
    source(skill);
    const before = snapshot(root);
    // PATH holds only the directory of the running Bun, so a global tsc cannot satisfy the check.
    const result = run(skill, ["bun", "run", "check"], { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` });
    expect(result.code).not.toBe(0);
    expect(snapshot(root)).toEqual(before);
    expect(existsSync(join(root, "node_modules"))).toBe(false);
    expect(existsSync(join(skill, "bun.lock"))).toBe(false);
    expect(result.output).toMatch(/tsc.*not found|not found.*tsc/is);
  });
});

describe.skipIf(!enabled)("given a Go skill, when checking offline, then behavior and format defects are detected", () => {
  it("checks without any Bun setup and leaves authored files unchanged", () => {
    const dir = temporary();
    cpSync(join(assets, "go"), dir, { recursive: true });
    writeFileSync(join(dir, "greet.go"), 'package starter\n\nfunc Greet(name string) string { return "hello " + name }\n');
    writeFileSync(join(dir, "greet_test.go"), 'package starter\n\nimport "testing"\n\nfunc TestGreet(t *testing.T) {\n\tif got := Greet("sam"); got != "hello sam" {\n\t\tt.Fatalf("unexpected greeting: %q", got)\n\t}\n}\n');
    const before0 = snapshot(dir);
    expect(run(dir, ["go", "test", "./..."]).code).toBe(0);
    expect(snapshot(dir)).toEqual(before0);
    const before1 = snapshot(dir);
    expect(run(dir, ["go", "vet", "./..."]).code).toBe(0);
    expect(snapshot(dir)).toEqual(before1);
    const before2 = snapshot(dir);
    expect(run(dir, ["gofmt", "-l", "."]).output.trim()).toBe("");
    expect(snapshot(dir)).toEqual(before2);
    writeFileSync(join(dir, "bad.go"), 'package starter\n\nvar x int = "text"\n');
    const before3 = snapshot(dir);
    expect(run(dir, ["go", "test", "./..."]).code).not.toBe(0);
    expect(snapshot(dir)).toEqual(before3);
    rmSync(join(dir, "bad.go"));
    writeFileSync(join(dir, "bad.go"), 'package starter\n\nimport "fmt"\n\nfunc Wrong() { fmt.Printf("%d", "text") }\n');
    const before4 = snapshot(dir);
    expect(run(dir, ["go", "test", "-vet=off", "./..."]).code).toBe(0);
    expect(snapshot(dir)).toEqual(before4);
    const before5 = snapshot(dir);
    expect(run(dir, ["go", "vet", "./..."]).code).not.toBe(0);
    expect(snapshot(dir)).toEqual(before5);
    rmSync(join(dir, "bad.go"));
    writeFileSync(join(dir, "greet.go"), 'package starter\n\nfunc Greet(name string) string { return "wrong " + name }\n');
    const before6 = snapshot(dir);
    expect(run(dir, ["go", "test", "./..."]).code).not.toBe(0);
    expect(snapshot(dir)).toEqual(before6);
    writeFileSync(join(dir, "greet.go"), 'package starter\nfunc Greet(name string) string{return "hello "+name}\n');
    const drift = snapshot(dir);
    expect(run(dir, ["gofmt", "-l", "."]).output).toContain("greet.go");
    expect(snapshot(dir)).toEqual(drift);
    expect(run(dir, ["gofmt", "-w", "."]).code).toBe(0);
    const beforeFinalFormat = snapshot(dir);
    expect(run(dir, ["gofmt", "-l", "."]).output.trim()).toBe("");
    expect(snapshot(dir)).toEqual(beforeFinalFormat);
    const before7 = snapshot(dir);
    expect(run(dir, ["go", "test", "./..."]).code).toBe(0);
    expect(snapshot(dir)).toEqual(before7);
    expect(existsSync(join(dir, "package.json"))).toBe(false);
  }, 300_000);

  it("flags an unparsable platform-specific file that go vet skips", () => {
    const dir = temporary();
    cpSync(join(assets, "go"), dir, { recursive: true });
    writeFileSync(join(dir, "greet.go"), 'package starter\n\nfunc Greet(name string) string { return "hello " + name }\n');
    writeFileSync(join(dir, "helper_windows.go"), 'package starter\nfunc B( {\n');
    const beforeFormat = snapshot(dir);
    expect(run(dir, ["sh", "-c", "formatting=$(gofmt -l .) && test -z \"$formatting\""]).code).not.toBe(0);
    expect(snapshot(dir)).toEqual(beforeFormat);
    const beforeOld = snapshot(dir);
    expect(run(dir, ["sh", "-c", "test -z \"$(gofmt -l .)\""]).code).toBe(0);
    expect(snapshot(dir)).toEqual(beforeOld);
    const beforeVet = snapshot(dir);
    expect(run(dir, ["go", "vet", "./..."]).code).toBe(0);
    expect(snapshot(dir)).toEqual(beforeVet);
  }, 300_000);
});
