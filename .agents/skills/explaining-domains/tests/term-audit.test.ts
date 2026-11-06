import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const tempDirs: string[] = [];
const cli = path.join(import.meta.dir, "..", "scripts", "term-audit.ts");

function workspace(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "term-audit-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

function run(dir: string, ...args: string[]): { code: number | null; out: string } {
  const r = Bun.spawnSync(["bun", cli, ...args], { cwd: dir });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("given a screen and a glossary, when it is audited", () => {
  it("lists jargon the glossary lacks and exits 1", () => {
    const dir = workspace({ "screen.md": "Line one.\nThe RUL falls.\n", "terms.txt": "efficiency: output over input\n" });
    const r = run(dir, "screen.md", "--glossary", "terms.txt");
    expect(r.code).toBe(1);
    expect(r.out).toContain("RUL  line 2  x1");
  });

  it("passes when every jargon term is defined, ignoring case and the definition text", () => {
    const dir = workspace({ "screen.md": "The RUL falls.\n", "terms.txt": "rul: days until the floor\n" });
    expect(run(dir, "screen.md", "--glossary", "terms.txt").code).toBe(0);
  });

  it("flags a unit word once at its first line and counts repeats", () => {
    const dir = workspace({ "screen.md": "Pressure is 19.9 kPa.\nThen 42.7 kPa.\n", "terms.txt": "pressure: push\n" });
    const r = run(dir, "screen.md", "--glossary", "terms.txt");
    expect(r.out).toContain("kPa  line 1  x2");
  });

  it("ignores code fences in Markdown and scripts in HTML", () => {
    const dir = workspace({
      "a.md": "Plain words.\n```\nPRESSURE_SUCTION_CONST = 1\n```\n",
      "b.html": "<p>Plain words.</p><script>const ACTIVE_CALC_METHOD = 1;</script>\n",
      "terms.txt": "\n",
    });
    expect(run(dir, "a.md", "b.html", "--glossary", "terms.txt").code).toBe(0);
  });

  it("reports the real line of a term inside HTML", () => {
    const dir = workspace({ "s.html": "<div>\n  <p>The <strong>Case</strong> label.</p>\n  <p>See ACTIVE_CALC_METHOD.</p>\n</div>\n", "t.txt": "\n" });
    expect(run(dir, "s.html", "--glossary", "t.txt").out).toContain("ACTIVE_CALC_METHOD  line 3  x1");
  });
});

describe("given a bad command line, when it runs", () => {
  it("exits 2 without a glossary", () => {
    const dir = workspace({ "screen.md": "x\n" });
    expect(run(dir, "screen.md").code).toBe(2);
  });
});
