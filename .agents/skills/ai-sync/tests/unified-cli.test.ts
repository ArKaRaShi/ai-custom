import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const tempDirs: string[] = [];
const cliPath = path.join(import.meta.dir, "../scripts/sync.ts");

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-cli-v2-"));
  tempDirs.push(dir);
  return dir;
}

function run(home: string, repo: string, ...args: string[]): { exitCode: number | null; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["bun", cliPath, ...args], { env: { ...process.env, HOME: home, AI_CUSTOM_REPO: repo } });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("given unified sync CLI, when root and tracking commands are invoked, then applies shared policy", () => {
  it("stores shared root policy separately from machine-local binding", () => {
    const home = tempDir();
    const repo = tempDir();
    const local = path.join(home, "custom-omp");
    expect(run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp").exitCode).toBe(0);
    expect(run(home, repo, "root", "bind", "omp", "--local-root", local).exitCode).toBe(0);
    const shared = JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"));
    const locations = JSON.parse(fs.readFileSync(path.join(home, ".config", "ai-sync", "locations.json"), "utf8"));
    expect(shared.roots.omp).toEqual({ kind: "path", repoRoot: ".omp" });
    expect(locations.roots.omp).toBe(local);
    expect(shared.roots.omp).not.toHaveProperty("localRoot");
  });

  it("tracks scoped path rules and skills without conflating their identity", () => {
    const home = tempDir();
    const repo = tempDir();
    run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
    run(home, repo, "track", "skill", "tool", "--root", "agents", "--origin", "external", "--from", "org/tool", "--no-sync");
    const shared = JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"));
    expect(shared.entries).toContainEqual({ kind: "skill", root: "agents", path: "tool", sync: false, skill: { origin: "external", source: "org/tool" } });
  });

  it("fails closed when transfer commands lack a required root binding", () => {
    const home = tempDir();
    const repo = tempDir();
    run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
    const result = run(home, repo, "push");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/missing local root binding: omp/i);
  });

  it("pushes only files allowed by ordered root-scoped rules", () => {
    const home = tempDir();
    const repo = tempDir();
    const local = path.join(home, "omp");
    fs.mkdirSync(path.join(local, "extensions", "private"), { recursive: true });
    fs.writeFileSync(path.join(local, "extensions", "kept.ts"), "kept");
    fs.writeFileSync(path.join(local, "extensions", "private", "local.ts"), "private");
    fs.writeFileSync(path.join(local, "unlisted.ts"), "unlisted");
    run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
    run(home, repo, "root", "bind", "omp", "--local-root", local);
    run(home, repo, "track", "path", "extensions/**", "--root", "omp");
    run(home, repo, "untrack", "path", "extensions/private/**", "--root", "omp");
    const policy = JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"));
    expect(policy.entries).toHaveLength(2);
    const locations = JSON.parse(fs.readFileSync(path.join(home, ".config", "ai-sync", "locations.json"), "utf8"));
    expect(locations.roots.omp).toBe(local);
    const status = run(home, repo, "status");
    expect(status.stdout).toContain("new_local    1 files");
    const push = run(home, repo, "push", "--apply");
    expect(push.stdout).toContain("backup complete");
    expect(fs.readFileSync(path.join(repo, ".omp", "extensions", "kept.ts"), "utf8")).toBe("kept");
    expect(fs.existsSync(path.join(repo, ".omp", "extensions", "private", "local.ts"))).toBe(false);
    expect(fs.existsSync(path.join(repo, ".omp", "unlisted.ts"))).toBe(false);
  });

  it("pulls equal skill names from separate roots into their machine-specific locations", () => {
    const home = tempDir();
    const repo = tempDir();
    const agents = path.join(home, "agents");
    const claude = path.join(home, "claude");
    fs.mkdirSync(path.join(repo, ".agents", "skills", "tool"), { recursive: true });
    fs.mkdirSync(path.join(repo, ".claude", "skills", "tool"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".agents", "skills", "tool", "source.txt"), "agent");
    fs.writeFileSync(path.join(repo, ".claude", "skills", "tool", "source.txt"), "claude");
    run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
    run(home, repo, "root", "add", "claude", "--kind", "skill", "--repo-root", ".claude/skills");
    run(home, repo, "root", "bind", "agents", "--local-root", agents);
    run(home, repo, "root", "bind", "claude", "--local-root", claude);
    run(home, repo, "track", "skill", "tool", "--root", "agents", "--origin", "authored", "--sync");
    run(home, repo, "track", "skill", "tool", "--root", "claude", "--origin", "external", "--sync");
    expect(run(home, repo, "pull", "--apply").exitCode).toBe(0);
    expect(fs.readFileSync(path.join(agents, "tool", "source.txt"), "utf8")).toBe("agent");
    expect(fs.readFileSync(path.join(claude, "tool", "source.txt"), "utf8")).toBe("claude");
  });

  it("bootstraps external sync-off skills from metadata until they are untracked", () => {
    const home = tempDir();
    const repo = tempDir();
    const local = path.join(home, "skills");
    const marker = path.join(home, "installed");
    run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
    run(home, repo, "root", "bind", "agents", "--local-root", local);
    run(home, repo, "track", "skill", "external-tool", "--root", "agents", "--origin", "external", "--install", `touch ${marker}`, "--no-sync");
    expect(run(home, repo, "bootstrap").exitCode).toBe(0);
    expect(fs.existsSync(marker)).toBe(true);
    fs.rmSync(marker);
    run(home, repo, "untrack", "skill", "external-tool", "--root", "agents");
    expect(run(home, repo, "bootstrap").exitCode).toBe(0);
    expect(fs.existsSync(marker)).toBe(false);
  });
});

  it("reports and preserves a repo skill copy when sync is disabled", () => {
    const home = tempDir();
    const repo = tempDir();
    const local = path.join(home, "skills");
    const backup = path.join(repo, ".agents", "skills", "authored");
    fs.mkdirSync(backup, { recursive: true });
    fs.writeFileSync(path.join(backup, "SKILL.md"), "existing");
    run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
    run(home, repo, "root", "bind", "agents", "--local-root", local);
    run(home, repo, "track", "skill", "authored", "--root", "agents", "--origin", "authored", "--sync");
    const result = run(home, repo, "track", "skill", "authored", "--root", "agents", "--origin", "authored", "--no-sync");
    expect(result.stdout).toContain(".agents/skills/authored");
    expect(fs.readFileSync(path.join(backup, "SKILL.md"), "utf8")).toBe("existing");
    run(home, repo, "untrack", "skill", "authored", "--root", "agents");
    expect(fs.readFileSync(path.join(backup, "SKILL.md"), "utf8")).toBe("existing");
  });

  it("discovery reports unlisted paths and writes them as local-only", () => {
    const home = tempDir();
    const repo = tempDir();
    const local = path.join(home, "omp");
    fs.mkdirSync(local, { recursive: true });
    fs.writeFileSync(path.join(local, "private.yml"), "secret");
    run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
    run(home, repo, "root", "bind", "omp", "--local-root", local);
    expect(run(home, repo, "discover").stdout).toContain("omp:private.yml");
    expect(run(home, repo, "discover", "--write").exitCode).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"));
    expect(manifest.entries).toContainEqual({ kind: "path", root: "omp", path: "private.yml", sync: false });
    const again = run(home, repo, "discover", "--write");
    expect(again.stderr).toBe("");
    expect(again.exitCode).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8")).entries).toHaveLength(1);
  });
