import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const tempDirs: string[] = [];
const cliPath = path.join(import.meta.dir, "sync.ts");

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-migrate-v2-"));
  tempDirs.push(dir);
  return dir;
}

function run(home: string, repo: string): { exitCode: number | null; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["bun", cliPath, "migrate-v2"], { env: { ...process.env, HOME: home, AI_CUSTOM_REPO: repo } });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("one-time manifest v2 migration", () => {
  it("converts the path rule and merges skill metadata before removing old files", () => {
    const home = tempDir();
    const repo = tempDir();
    const localManifest = path.join(home, ".agents", "skills", "skills-manifest.json");
    const sharedManifest = path.join(repo, ".agents", "skills", "skills-manifest.json");
    fs.mkdirSync(path.dirname(localManifest), { recursive: true });
    fs.mkdirSync(path.dirname(sharedManifest), { recursive: true });
    fs.mkdirSync(path.join(repo, ".ai-sync"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".ai-sync", "manifest.json"), JSON.stringify({ version: 1, rules: [{ pattern: ".omp/extensions/orca-*", sync: false }] }));
    const skills = { version: 1, skills: { tool: { origin: "external", sync: false, source: "org/tool", sourceType: "github", install: "npx skills add org/tool -g", version: "1.2", description: "external tool" } } };
    fs.writeFileSync(localManifest, JSON.stringify(skills));
    fs.writeFileSync(sharedManifest, JSON.stringify(skills));

    const result = run(home, repo);
    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"));
    expect(manifest.version).toBe(2);
    expect(manifest.entries).toContainEqual({ kind: "path", root: "omp", path: "extensions/orca-*", sync: false });
    expect(manifest.entries).toContainEqual({ kind: "skill", root: "agents", path: "tool", sync: false, skill: { origin: "external", source: "org/tool", sourceType: "github", install: "npx skills add org/tool -g", version: "1.2", description: "external tool" } });
    expect(fs.existsSync(localManifest)).toBe(false);
    expect(fs.existsSync(sharedManifest)).toBe(false);
  });

  it("rejects conflicting local and shared metadata without removing source manifests", () => {
    const home = tempDir();
    const repo = tempDir();
    const localManifest = path.join(home, ".agents", "skills", "skills-manifest.json");
    const sharedManifest = path.join(repo, ".agents", "skills", "skills-manifest.json");
    fs.mkdirSync(path.dirname(localManifest), { recursive: true });
    fs.mkdirSync(path.dirname(sharedManifest), { recursive: true });
    fs.mkdirSync(path.join(repo, ".ai-sync"), { recursive: true });
    const pathFile = path.join(repo, ".ai-sync", "manifest.json");
    fs.writeFileSync(pathFile, JSON.stringify({ version: 1, rules: [] }));
    fs.writeFileSync(localManifest, JSON.stringify({ version: 1, skills: { tool: { origin: "authored", sync: true } } }));
    fs.writeFileSync(sharedManifest, JSON.stringify({ version: 1, skills: { tool: { origin: "external", sync: false } } }));

    const result = run(home, repo);
    expect(result.exitCode).not.toBe(0);
    expect(fs.existsSync(localManifest)).toBe(true);
    expect(fs.existsSync(sharedManifest)).toBe(true);
    expect(JSON.parse(fs.readFileSync(pathFile, "utf8")).version).toBe(1);
  });
});
