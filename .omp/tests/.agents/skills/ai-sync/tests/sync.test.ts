import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  checkGitRemoteStatus,
  matchesPattern,
  filterItems,
  cmdDiff,
  loadManifest,
  saveManifest,
  withOriginFilter,
  SkillsManifest,
  autoDetectSkill,
  repoManifestPath,
  removeManifestEntry,
  untrackSkill,
  removeOrphanedManifestEntries,
  migrateLegacyManifest,
  TARGET_MAP,
  DEFAULT_REPO,
  SKILLS_DIR,
} from "../scripts/sync";
describe("given pattern filter inputs, when evaluating paths and exclusions, then matches and exclusions are correctly applied", () => {
  it("matches exact relative paths and glob-like wildcard exclusions", () => {
    expect(matchesPattern("prototype/SKILL.md", ["prototype"])).toBe(true);
    expect(matchesPattern(".agents/skills/prototype/UI.md", ["prototype"])).toBe(true);
    expect(matchesPattern(".agents/skills/db-sandbox/SKILL.md", ["prototype"])).toBe(false);
    expect(matchesPattern(".agents/skills/test/temp.log", ["*.log"])).toBe(true);
  });

  it("filters files according to target scope and exclude patterns", () => {
    const files = [
      "skills/db-sandbox/SKILL.md",
      "skills/prototype/SKILL.md",
      "rules/py-test.md",
      "extensions/turn-metrics.ts",
    ];
    // Target only skills, exclude prototype
    const filtered = filterItems(files, { target: "skills", exclude: ["prototype"] });
    expect(filtered).toEqual(["skills/db-sandbox/SKILL.md"]);
  });
});

describe("given a repository directory, when checking git remote tracking status, then returns proper git branch and tracking information", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-test-repo-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("returns isGit: false for non-git directories without crashing", () => {
    const res = checkGitRemoteStatus(tmpRepo);
    expect(res.isGit).toBe(false);
    expect(res.message).toBe("");
  });
});

describe("given two versions of a file, when generating diff view, then returns unified diff output", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-diff-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates unified diff with added and removed lines", () => {
    const fileA = path.join(tmpDir, "local.txt");
    const fileB = path.join(tmpDir, "repo.txt");
    fs.writeFileSync(fileA, "hello world\nline2\n");
    fs.writeFileSync(fileB, "hello world\nline2 modified\n");

    const diffResult = cmdDiff(fileA, fileB);
    expect(diffResult).toContain("line2");
  });
});

describe("given a skills manifest, when filtering sync options, then skills with sync: false are excluded from git sync", () => {
  let tmpDir: string;
  let manifestFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-manifest-test-"));
    manifestFile = path.join(tmpDir, "skills-manifest.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips manifest and returns version 1 with empty skills for missing file", () => {
    expect(loadManifest(manifestFile)).toEqual({ version: 1, skills: {} });
    const sample: SkillsManifest = {
      version: 1,
      skills: {
        archify: { origin: "external", sync: false, source: "tt-a1i/archify", version: "2.17.0" },
        mentor: { origin: "authored", sync: true },
      },
    };
    saveManifest(manifestFile, sample);
    expect(loadManifest(manifestFile)).toEqual(sample);
  });

  it("excludes skills with sync: false while keeping sync: true skills included", () => {
    const manifest: SkillsManifest = {
      version: 1,
      skills: {
        mentor: { origin: "authored", sync: true },
        archify: { origin: "external", sync: false, source: "tt-a1i/archify" },
        prototype: { origin: "authored", sync: false },
      },
    };
    const filtered = withOriginFilter({}, manifest);
    expect(filtered.exclude).toEqual(["archify", "prototype"]);
    expect(filtered.exclude).not.toContain("mentor");
  });

  it("merges with user exclusions and bypasses filtering when includeLocal is true", () => {
    const manifest: SkillsManifest = {
      version: 1,
      skills: { archify: { origin: "external", sync: false } },
    };
    expect(withOriginFilter({ exclude: ["*.log"] }, manifest).exclude).toEqual(["*.log", "archify"]);
    expect(withOriginFilter({ includeLocal: true }, manifest).exclude).toBeUndefined();
  });
});

describe("given local skill directories and metadata, when auto-detecting provenance, then correctly categorizes skills", () => {
  let tmpDir: string;
  let repoSkillsDir: string;
  let localSkillsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-detect-test-"));
    repoSkillsDir = path.join(tmpDir, "repo-skills");
    localSkillsDir = path.join(tmpDir, "local-skills");
    fs.mkdirSync(repoSkillsDir, { recursive: true });
    fs.mkdirSync(localSkillsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects authored skill when directory matches inside repo skills directory", () => {
    const skillName = "my-tool";
    fs.mkdirSync(path.join(repoSkillsDir, skillName), { recursive: true });
    const localSkill = path.join(localSkillsDir, skillName);
    fs.mkdirSync(localSkill, { recursive: true });

    const res = autoDetectSkill(skillName, localSkill, repoSkillsDir, {}, { version: 1, skills: {} });
    expect(res.origin).toBe("authored");
    expect(res.sync).toBe(true);
    expect(res.detectionReason).toContain("matched in repo");
  });

  it("detects external skill when registered in skills-lock.json", () => {
    const skillName = "caveman";
    const localSkill = path.join(localSkillsDir, skillName);
    fs.mkdirSync(localSkill, { recursive: true });
    const skillsLock = {
      skills: {
        caveman: { source: "JuliusBrussee/caveman", sourceType: "github" },
      },
    };

    const res = autoDetectSkill(skillName, localSkill, repoSkillsDir, skillsLock, { version: 1, skills: {} });
    expect(res.origin).toBe("external");
    expect(res.sync).toBe(false);
    expect(res.source).toBe("JuliusBrussee/caveman");
    expect(res.detectionReason).toContain("skills-lock.json");
  });

  it("detects external skill when SKILL.md contains GitHub repository URL", () => {
    const skillName = "archify";
    const localSkill = path.join(localSkillsDir, skillName);
    fs.mkdirSync(localSkill, { recursive: true });
    fs.writeFileSync(
      path.join(localSkill, "SKILL.md"),
      "---\nname: archify\n---\nInstall from github.com/tt-a1i/archify\n",
    );

    const res = autoDetectSkill(skillName, localSkill, repoSkillsDir, {}, { version: 1, skills: {} });
    expect(res.origin).toBe("external");
    expect(res.sync).toBe(false);
    expect(res.source).toBe("tt-a1i/archify");
    expect(res.detectionReason).toContain("SKILL.md");
  });

  it("defaults to machine-local experiment (authored, sync: false) when no upstream or repo match exists", () => {
    const skillName = "prototype";
    const localSkill = path.join(localSkillsDir, skillName);
    fs.mkdirSync(localSkill, { recursive: true });

    const res = autoDetectSkill(skillName, localSkill, repoSkillsDir, {}, { version: 1, skills: {} });
    expect(res.origin).toBe("authored");
    expect(res.sync).toBe(false);
    expect(res.detectionReason).toContain("private to this machine");
  });
});

describe("given path resolution configuration, when inspecting default paths, then respects home and defaults", () => {
  it("resolves DEFAULT_REPO and SKILLS_DIR to sensible paths under HOME by default", () => {
    const home = os.homedir();
    expect(DEFAULT_REPO).toContain(home);
    expect(SKILLS_DIR).toContain(home);
    expect(SKILLS_DIR).toContain(".agents");
  });
});

describe("given skill manifest lifecycle operations, when tracking shared state, then uses one canonical repo manifest", () => {
  it("locates the shared manifest beneath the repo skills directory", () => {
    expect(repoManifestPath("/tmp/ai-custom")).toBe("/tmp/ai-custom/.agents/skills/skills-manifest.json");
  });

  it("removes a retired skill entry without changing remaining entries", () => {
    const manifest: SkillsManifest = {
      version: 1,
      skills: {
        retained: { origin: "authored", sync: true },
        retired: { origin: "authored", sync: false },
      },
    };

    expect(removeManifestEntry(manifest, "retired")).toBe(true);
    expect(manifest.skills).toEqual({ retained: { origin: "authored", sync: true } });
    expect(removeManifestEntry(manifest, "retired")).toBe(false);
  });
});

describe("given local and shared manifests, when untracking a retired skill, then removes only its metadata", () => {
  it("updates both manifests without deleting any skill directories", () => {
    const manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-untrack-test-"));
    const localManifest = path.join(manifestDir, "local.json");
    const sharedManifest = path.join(manifestDir, "shared.json");
    const manifest: SkillsManifest = {
      version: 1,
      skills: {
        retained: { origin: "authored", sync: true },
        retired: { origin: "authored", sync: false },
      },
    };
    try {
      saveManifest(localManifest, manifest);
      saveManifest(sharedManifest, manifest);

      expect(untrackSkill("retired", localManifest, sharedManifest)).toEqual({
        local: true,
        shared: true,
      });
      expect(loadManifest(localManifest).skills).toEqual({ retained: { origin: "authored", sync: true } });
      expect(loadManifest(sharedManifest).skills).toEqual({ retained: { origin: "authored", sync: true } });
    } finally {
      fs.rmSync(manifestDir, { recursive: true, force: true });
    }
  });
});

describe("given untracked local skills, when discovery runs without --write, then leaves the manifest unchanged", () => {
  it("reports provenance without creating a local manifest", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-discover-home-"));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-discover-repo-"));
    const skillDir = path.join(home, ".agents", "skills", "scratch");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: scratch\n---\n");
    try {
      const result = Bun.spawnSync(["bun", path.join(import.meta.dir, "..", "scripts", "sync.ts"), "discover"], {
        env: { ...process.env, HOME: home, AI_CUSTOM_REPO: repo },
      });

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(home, ".agents", "skills", "skills-manifest.json"))).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("given a local manifest and installed skills, when pruning orphaned records, then retains installed skill metadata", () => {
  it("removes only entries whose directories are absent", () => {
    const manifest: SkillsManifest = {
      version: 1,
      skills: {
        installed: { origin: "authored", sync: true },
        retired: { origin: "authored", sync: true },
      },
    };

    expect(removeOrphanedManifestEntries(manifest, ["installed"])).toEqual(["retired"]);
    expect(manifest.skills).toEqual({ installed: { origin: "authored", sync: true } });
  });
});

describe("given a legacy root manifest, when migrating it to the skills target, then preserves records at the canonical path", () => {
  it("moves the legacy file only when no canonical manifest exists", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-manifest-migration-"));
    const legacy = path.join(repo, "skills-manifest.json");
    const canonical = path.join(repo, ".agents", "skills", "skills-manifest.json");
    const manifest: SkillsManifest = {
      version: 1,
      skills: { retained: { origin: "authored", sync: true } },
    };
    try {
      saveManifest(legacy, manifest);

      expect(migrateLegacyManifest(legacy, canonical)).toBe(true);
      expect(loadManifest(canonical)).toEqual(manifest);
      expect(fs.existsSync(legacy)).toBe(false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("given synchronization targets, when backing up OMP task agents, then includes their user agent directory", () => {
  it("maps user task agents into the repository OMP agents directory", () => {
    const agentsTarget = TARGET_MAP.find((target) => target.category === "agents");

    expect(agentsTarget).toEqual({
      name: "OMP Agents",
      category: "agents",
      local: path.join(os.homedir(), ".omp", "agent", "agents"),
      repo: path.join(DEFAULT_REPO, ".omp", "agents"),
    });
  });
});

describe("given untracked and orphaned skill records, when status runs, then flags them for a user decision", () => {
  it("prints removal and prune candidates without deleting anything", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-summary-home-"));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-summary-repo-"));
    const skillsDir = path.join(home, ".agents", "skills");
    fs.mkdirSync(path.join(skillsDir, "scratch"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "scratch", "SKILL.md"), "---\nname: scratch\n---\n");
    fs.writeFileSync(
      path.join(skillsDir, "skills-manifest.json"),
      JSON.stringify({ version: 1, skills: { retired: { origin: "authored", sync: true } } }),
    );
    try {
      const result = Bun.spawnSync(["bun", path.join(import.meta.dir, "..", "scripts", "sync.ts"), "status"], {
        env: { ...process.env, HOME: home, AI_CUSTOM_REPO: repo },
      });

      const out = result.stdout.toString();
      expect(result.exitCode).toBe(0);
      expect(out).toContain("Needs your decision");
      expect(out).toContain("skills/scratch/");
      expect(out).toContain("manifest: retired");
      expect(fs.existsSync(path.join(skillsDir, "scratch"))).toBe(true);
      expect(loadManifest(path.join(skillsDir, "skills-manifest.json")).skills.retired).toBeDefined();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
