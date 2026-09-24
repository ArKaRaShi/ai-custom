import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const tempDirs: string[] = [];
const cliPath = path.join(import.meta.dir, "../scripts/sync.ts");

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runSync(home: string, repo: string, ...args: string[]): {
  exitCode: number | null;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync(["bun", cliPath, ...args], {
    env: { ...process.env, HOME: home, AI_CUSTOM_REPO: repo },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("given a repo and local target files, when path policy commands run, then they record explicit sync choices", () => {
  it("initializes empty policy and reports local candidates without copying them", () => {
    const home = tempDir("ai-sync-path-home-");
    const repo = tempDir("ai-sync-path-repo-");
    const localFile = path.join(home, ".omp", "agent", "extensions", "local-only.ts");
    fs.mkdirSync(path.dirname(localFile), { recursive: true });
    fs.writeFileSync(localFile, "local");

    const result = runSync(home, repo, "init", repo);
    const manifestPath = path.join(repo, ".ai-sync", "manifest.json");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("local-only.ts");
    expect(JSON.parse(fs.readFileSync(manifestPath, "utf8"))).toEqual({ version: 1, rules: [] });
    expect(fs.existsSync(path.join(repo, ".omp", "extensions", "local-only.ts"))).toBe(false);
  });

  it("does not overwrite an existing policy during init", () => {
    const home = tempDir("ai-sync-path-home-");
    const repo = tempDir("ai-sync-path-repo-");
    const manifestPath = path.join(repo, ".ai-sync", "manifest.json");
    const existing = '{"version":1,"rules":[{"pattern":".omp/config.yml","sync":true}]}\n';
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, existing);

    const result = runSync(home, repo, "init", repo);

    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(manifestPath, "utf8")).toBe(existing);
  });

  it("lets later file rules override a directory rule without duplicates", () => {
    const home = tempDir("ai-sync-path-home-");
    const repo = tempDir("ai-sync-path-repo-");
    const localDir = path.join(home, ".omp", "agent", "extensions");
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(path.join(localDir, "orca-agent-status.ts"), "orca");

    expect(runSync(home, repo, "init", repo).exitCode).toBe(0);
    expect(runSync(home, repo, "track", ".omp/extensions").exitCode).toBe(0);
    expect(runSync(home, repo, "untrack", ".omp/extensions/orca-agent-status.ts").exitCode).toBe(0);
    expect(runSync(home, repo, "track", ".omp/extensions").exitCode).toBe(0);
    expect(runSync(home, repo, "untrack", ".omp/extensions/orca-agent-status.ts").exitCode).toBe(0);

    const manifest = JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"));
    expect(manifest.rules).toEqual([
      { pattern: ".omp/extensions/**", sync: true },
      { pattern: ".omp/extensions/orca-agent-status.ts", sync: false },
    ]);
  });
});

describe("given tracked and untracked non-skill files, when push and pull run, then only tracked paths transfer", () => {
  it("backs up tracked files and excludes later local-only file rules", () => {
    const home = tempDir("ai-sync-path-home-");
    const repo = tempDir("ai-sync-path-repo-");
    const localDir = path.join(home, ".omp", "agent", "extensions");
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(path.join(localDir, "shared.ts"), "shared");
    fs.writeFileSync(path.join(localDir, "orca-agent-status.ts"), "local");

    expect(runSync(home, repo, "init", repo).exitCode).toBe(0);
    expect(runSync(home, repo, "track", ".omp/extensions").exitCode).toBe(0);
    expect(runSync(home, repo, "untrack", ".omp/extensions/orca-agent-status.ts").exitCode).toBe(0);
    expect(runSync(home, repo, "push", repo, "--target", "extensions").exitCode).toBe(0);

    expect(fs.readFileSync(path.join(repo, ".omp", "extensions", "shared.ts"), "utf8")).toBe("shared");
    expect(fs.existsSync(path.join(repo, ".omp", "extensions", "orca-agent-status.ts"))).toBe(false);
  });

  it("fails before transferring files when the policy is malformed", () => {
    const home = tempDir("ai-sync-path-home-");
    const repo = tempDir("ai-sync-path-repo-");
    const localFile = path.join(home, ".omp", "agent", "extensions", "file.ts");
    fs.mkdirSync(path.dirname(localFile), { recursive: true });
    fs.writeFileSync(localFile, "local");
    fs.mkdirSync(path.join(repo, ".ai-sync"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".ai-sync", "manifest.json"), '{"version":2,"rules":[]}');

    const result = runSync(home, repo, "push", repo);

    expect(result.exitCode).not.toBe(0);
    expect(fs.existsSync(path.join(repo, ".omp", "extensions", "file.ts"))).toBe(false);
  });

  it("bootstraps explicitly tracked non-skill files when no skills are configured", () => {
    const home = tempDir("ai-sync-path-home-");
    const repo = tempDir("ai-sync-path-repo-");
    const repoFile = path.join(repo, ".omp", "extensions", "shared.ts");
    fs.mkdirSync(path.dirname(repoFile), { recursive: true });
    fs.writeFileSync(repoFile, "shared");
    fs.mkdirSync(path.join(repo, ".ai-sync"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".ai-sync", "manifest.json"), JSON.stringify({
      version: 1,
      rules: [{ pattern: ".omp/extensions/**", sync: true }],
    }));

    const result = runSync(home, repo, "bootstrap", repo);

    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(home, ".omp", "agent", "extensions", "shared.ts"), "utf8")).toBe("shared");
  });

  it("tracks a single-file target without converting it to a directory pattern", () => {
    const home = tempDir("ai-sync-path-home-");
    const repo = tempDir("ai-sync-path-repo-");
    const localFile = path.join(home, ".omp", "agent", "config.yml");
    fs.mkdirSync(path.dirname(localFile), { recursive: true });
    fs.writeFileSync(localFile, "configured");

    expect(runSync(home, repo, "init", repo).exitCode).toBe(0);
    expect(runSync(home, repo, "track", ".omp/config.yml").exitCode).toBe(0);
    expect(runSync(home, repo, "push", repo, "--target", "config").exitCode).toBe(0);

    expect(fs.readFileSync(path.join(repo, ".omp", "config.yml"), "utf8")).toBe("configured");
    expect(JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8")).rules).toEqual([
      { pattern: ".omp/config.yml", sync: true },
    ]);
  });

  it("rejects traversal before changing the path policy", () => {
    const home = tempDir("ai-sync-path-home-");
    const repo = tempDir("ai-sync-path-repo-");

    expect(runSync(home, repo, "init", repo).exitCode).toBe(0);
    expect(runSync(home, repo, "track", ".omp/extensions/../../outside").exitCode).not.toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8")).rules).toEqual([]);
  });

  it("preserves both copies after untrack even when their contents differ", () => {
    const home = tempDir("ai-sync-path-home-");
    const repo = tempDir("ai-sync-path-repo-");
    const localFile = path.join(home, ".omp", "agent", "extensions", "keep.ts");
    const repoFile = path.join(repo, ".omp", "extensions", "keep.ts");
    fs.mkdirSync(path.dirname(localFile), { recursive: true });
    fs.writeFileSync(localFile, "before");

    expect(runSync(home, repo, "init", repo).exitCode).toBe(0);
    expect(runSync(home, repo, "track", ".omp/extensions/keep.ts").exitCode).toBe(0);
    expect(runSync(home, repo, "push", repo).exitCode).toBe(0);
    fs.writeFileSync(localFile, "local-change");
    fs.writeFileSync(repoFile, "repo-change");

    expect(runSync(home, repo, "untrack", ".omp/extensions/keep.ts").exitCode).toBe(0);
    expect(runSync(home, repo, "push", repo).exitCode).toBe(0);
    expect(runSync(home, repo, "pull", repo).exitCode).toBe(0);

    expect(fs.readFileSync(localFile, "utf8")).toBe("local-change");
    expect(fs.readFileSync(repoFile, "utf8")).toBe("repo-change");
  });
});

describe("given a synced skill, when tracking it with sync disabled, then report any backup copy without deleting it", () => {
  it("warns that the existing backup copy remains", () => {
    const home = tempDir("ai-sync-skill-home-");
    const repo = tempDir("ai-sync-skill-repo-");
    const manifest = { version: 1, skills: { archify: { origin: "authored", sync: true } } };
    const localManifest = path.join(home, ".agents", "skills", "skills-manifest.json");
    const repoManifest = path.join(repo, ".agents", "skills", "skills-manifest.json");
    const repoSkill = path.join(repo, ".agents", "skills", "archify", "SKILL.md");
    fs.mkdirSync(path.dirname(localManifest), { recursive: true });
    fs.mkdirSync(path.dirname(repoManifest), { recursive: true });
    fs.mkdirSync(path.dirname(repoSkill), { recursive: true });
    fs.writeFileSync(localManifest, JSON.stringify(manifest));
    fs.writeFileSync(repoManifest, JSON.stringify(manifest));
    fs.writeFileSync(repoSkill, "external skill");

    const result = runSync(home, repo, "track", "archify", "external", "--no-sync");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Ask the user before removing it");
    expect(result.stdout).toContain(".agents/skills/archify");
    expect(fs.existsSync(repoSkill)).toBe(true);
  });
  it("does not suggest cleanup when no backup copy exists", () => {
    const home = tempDir("ai-sync-skill-home-");
    const repo = tempDir("ai-sync-skill-repo-");
    const manifest = { version: 1, skills: { archify: { origin: "authored", sync: true } } };
    const localManifest = path.join(home, ".agents", "skills", "skills-manifest.json");
    const repoManifest = path.join(repo, ".agents", "skills", "skills-manifest.json");
    fs.mkdirSync(path.dirname(localManifest), { recursive: true });
    fs.mkdirSync(path.dirname(repoManifest), { recursive: true });
    fs.writeFileSync(localManifest, JSON.stringify(manifest));
    fs.writeFileSync(repoManifest, JSON.stringify(manifest));

    const result = runSync(home, repo, "track", "archify", "external", "--no-sync");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Ask the user before removing it");
  });
});
