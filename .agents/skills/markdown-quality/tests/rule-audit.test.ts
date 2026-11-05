import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const script = path.join(import.meta.dir, "..", "scripts", "rule-audit.ts");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

interface Fixture {
  assets: string;
  snapshot: string;
}

/** An assets folder with a package of `rules`, an agent allowlist, and a reviewed snapshot. */
function fixture(options: { rules: string[]; allow: string[]; reviewed: string[] | null }): Fixture {
  const assets = fs.mkdtempSync(path.join(os.tmpdir(), "rule-audit-"));
  tempDirs.push(assets);
  const styles = path.join(assets, ".vale", "styles", "ai-tells");
  fs.mkdirSync(styles, { recursive: true });
  for (const rule of options.rules) fs.writeFileSync(path.join(styles, `${rule}.yml`), "extends: existence\n");
  fs.mkdirSync(path.join(assets, "modes", "agent"), { recursive: true });
  const ini = ["StylesPath = ../../.vale/styles", "[*.md]", ...options.allow.map((r) => `ai-tells.${r} = YES`)];
  fs.writeFileSync(path.join(assets, "modes", "agent", ".vale.ini"), `${ini.join("\n")}\n`);
  const snapshot = path.join(assets, "modes", "ai-tells-reviewed.txt");
  if (options.reviewed) fs.writeFileSync(snapshot, `${options.reviewed.join("\n")}\n`);
  return { assets, snapshot };
}

function audit(assets: string, ...extra: string[]): { exitCode: number | null; stdout: string; stderr: string } {
  const out = Bun.spawnSync(["bun", script, "--assets", assets, ...extra]);
  return { exitCode: out.exitCode, stdout: out.stdout.toString(), stderr: out.stderr.toString() };
}

describe("given an agent allowlist and a vendored ai-tells package, when the rules are audited", () => {
  it("passes when every allowlisted rule exists and every package rule is reviewed", () => {
    const f = fixture({ rules: ["A", "B", "C"], allow: ["A"], reviewed: ["A", "B", "C"] });
    const out = audit(f.assets);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain("every allowlisted rule exists");
  });

  it("fails and names an allowlisted rule the package no longer ships", () => {
    const f = fixture({ rules: ["A"], allow: ["A", "Gone"], reviewed: ["A"] });
    const out = audit(f.assets);
    expect(out.exitCode).toBe(1);
    expect(out.stdout).toContain("missing");
    expect(out.stdout).toContain("- Gone");
    expect(out.stdout).not.toContain("- A\n");
  });

  it("fails and lists package rules nobody has reviewed, and --accept records them", () => {
    const f = fixture({ rules: ["A", "B", "New"], allow: ["A"], reviewed: ["A", "B"] });
    const failed = audit(f.assets);
    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toContain("unreviewed");
    expect(failed.stdout).toContain("- New");
    expect(failed.stderr).toContain("--accept");

    expect(audit(f.assets, "--accept").exitCode).toBe(0);
    expect(fs.readFileSync(f.snapshot, "utf8")).toContain("New");
    expect(audit(f.assets).exitCode).toBe(0);
  });

  it("reports rules the package dropped without failing", () => {
    const f = fixture({ rules: ["A"], allow: ["A"], reviewed: ["A", "Old"] });
    const out = audit(f.assets);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain("removed");
    expect(out.stdout).toContain("- Old");
  });

  it("refuses --accept while the allowlist names a missing rule", () => {
    const f = fixture({ rules: ["A"], allow: ["Gone"], reviewed: null });
    const out = audit(f.assets, "--accept");
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toContain("Gone");
    expect(fs.existsSync(f.snapshot)).toBe(false);
  });

  it("explains how to install the package when it is absent", () => {
    const assets = fs.mkdtempSync(path.join(os.tmpdir(), "rule-audit-"));
    tempDirs.push(assets);
    const out = audit(assets);
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toContain("vale sync");
  });
});
