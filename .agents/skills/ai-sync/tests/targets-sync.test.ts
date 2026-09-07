import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  TARGET_MAP,
  DEFAULT_REPO,
  HOME,
  filterItems,
  matchesPattern,
} from "../scripts/targets";
import {
  compare,
  copyFileSafe,
  plainMergeFiles,
  getAllFiles,
} from "../scripts/sync-files";
import {
  loadManifest,
  saveManifest,
  withOriginFilter,
  SkillsManifest,
  removeManifestEntry,
  untrackSkill,
  removeOrphanedManifestEntries,
  migrateLegacyManifest,
  repoManifestPath,
} from "../scripts/manifest";
import { checkGitRemoteStatus } from "../scripts/git";
import { printSyncSummary } from "../scripts/reporting";

describe("given the OMP harness surface, when target mapping is inspected, then AGENTS, MCP, config, agents, extensions, rules, hooks, tests, and skills are all mapped", () => {
  it("includes the instructions, mcp, config, agents, extensions, rules, hooks, tests, and skills categories", () => {
    const categories = new Set(TARGET_MAP.map((t) => t.category));
    for (const expected of [
      "instructions",
      "mcp",
      "config",
      "agents",
      "extensions",
      "rules",
      "hooks",
      "tests",
      "skills",
    ]) {
      expect(categories.has(expected)).toBe(true);
    }
  });

  it("maps ~/.omp/agent/AGENTS.md to .omp/AGENTS.md and ~/.omp/agent/mcp.json to .omp/mcp.json", () => {
    const instructions = TARGET_MAP.find((t) => t.category === "instructions");
    const mcp = TARGET_MAP.find((t) => t.category === "mcp");

    expect(instructions).toBeDefined();
    expect(mcp).toBeDefined();
    expect(instructions!.local).toBe(path.join(HOME, ".omp", "agent", "AGENTS.md"));
    expect(instructions!.repo).toBe(path.join(DEFAULT_REPO, ".omp", "AGENTS.md"));
    expect(mcp!.local).toBe(path.join(HOME, ".omp", "agent", "mcp.json"));
    expect(mcp!.repo).toBe(path.join(DEFAULT_REPO, ".omp", "mcp.json"));
  });

  it("gives the user skills target a stable name 'User Skills' and category 'skills'", () => {
    const skills = TARGET_MAP.find((t) => t.category === "skills");
    expect(skills).toBeDefined();
    expect(skills!.name).toBe("User Skills");
    expect(skills!.category).toBe("skills");
  });

  it("filters TARGET_MAP by category or by name fragment", () => {
    const onlyMcp = TARGET_MAP.filter((t) => t.category.includes("mcp"));
    expect(onlyMcp).toHaveLength(1);
    expect(onlyMcp[0].name).toBe("OMP MCP");

    const instructionsByName = TARGET_MAP.filter((t) =>
      t.name.toLowerCase().includes("instructions"),
    );
    expect(instructionsByName).toHaveLength(1);
    expect(instructionsByName[0].category).toBe("instructions");
  });

  it("matchesPattern and filterItems select and exclude paths consistently", () => {
    expect(matchesPattern("extensions/foo/SKILL.md", ["foo"])).toBe(true);
    expect(matchesPattern("extensions/bar/SKILL.md", ["foo"])).toBe(false);
    expect(matchesPattern("rules/tmp.log", ["*.log"])).toBe(true);

    const paths = [
      "extensions/foo/SKILL.md",
      "extensions/bar/SKILL.md",
      "rules/py.md",
    ];
    const filtered = filterItems(paths, { target: "extensions", exclude: ["foo"] });
    expect(filtered).toEqual(["extensions/bar/SKILL.md"]);
  });
});

describe("given a local machine tree and a repo tree, when compare() runs against a scoped target, then only that target's files are reflected in the report", () => {
  let tmpHome: string;
  let tmpRepo: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-sync-home-"));
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-sync-repo-"));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("compare() with the instructions target reports an existing in-sync AGENTS.md", () => {
    // compare() reads the real HOME; this test mirrors AGENTS.md at the real
    // location, then points the repo at tmpRepo, and asserts the report shape.
    const realInstructions = path.join(HOME, ".omp", "agent", "AGENTS.md");
    const realHad = fs.existsSync(realInstructions);
    const originalContent = realHad ? fs.readFileSync(realInstructions, "utf8") : null;
    const realAgentDir = path.dirname(realInstructions);
    fs.mkdirSync(realAgentDir, { recursive: true });
    try {
      fs.writeFileSync(realInstructions, "compare-test-marker\n");
      const report = compare(tmpRepo, { target: "instructions" });

      expect(Array.isArray(report.modified)).toBe(true);
      expect(Array.isArray(report.missingInRepo)).toBe(true);
      expect(Array.isArray(report.missingInLocal)).toBe(true);
      expect(typeof report.inSync).toBe("number");
    } finally {
      if (realHad && originalContent !== null) fs.writeFileSync(realInstructions, originalContent);
      else if (fs.existsSync(realInstructions)) fs.unlinkSync(realInstructions);
    }
  });
  it("copyFileSafe writes bytes and creates intermediate directories", () => {
    const src = path.join(tmpHome, "src.txt");
    const dest = path.join(tmpRepo, "deep", "nested", "dest.txt");
    fs.writeFileSync(src, "hello");
    copyFileSafe(src, dest);
    expect(fs.readFileSync(dest, "utf8")).toBe("hello");
  });

  it("getAllFiles skips .DS_Store, node_modules, and .git entries", () => {
    const dir = path.join(tmpHome, "tree");
    fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(dir, "keep.txt"), "k");
    fs.writeFileSync(path.join(dir, ".DS_Store"), "ds");
    fs.writeFileSync(path.join(dir, "sub", "inside.txt"), "i");
    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "x.js"), "x");
    fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main");

    const files = getAllFiles(dir);
    const rels = files.map((f) => path.relative(dir, f));
    expect(rels).toContain("keep.txt");
    expect(rels).toContain(path.join("sub", "inside.txt"));
    expect(rels).not.toContain(".DS_Store");
    expect(rels.some((r) => r.startsWith("node_modules"))).toBe(false);
    expect(rels.some((r) => r.startsWith(".git"))).toBe(false);
  });
});

describe("given a skills manifest file, when manifest lifecycle helpers run, then state is preserved, isolated, and migrated predictably", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-manifest-life-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the default manifest when the file is missing and round-trips user data", () => {
    const missing = path.join(tmpDir, "absent.json");
    expect(loadManifest(missing)).toEqual({ version: 1, skills: {} });

    const target = path.join(tmpDir, "round.json");
    const sample: SkillsManifest = {
      version: 1,
      skills: {
        mentor: { origin: "authored", sync: true },
        archify: { origin: "external", sync: false, source: "tt-a1i/archify" },
      },
    };
    saveManifest(target, sample);
    expect(loadManifest(target)).toEqual(sample);
  });

  it("withOriginFilter injects sync:false skills into the exclude list", () => {
    const manifest: SkillsManifest = {
      version: 1,
      skills: {
        mentor: { origin: "authored", sync: true },
        prototype: { origin: "authored", sync: false },
        archify: { origin: "external", sync: false },
      },
    };
    expect(withOriginFilter({}, manifest).exclude).toEqual(["prototype", "archify"]);
    expect(withOriginFilter({ exclude: ["*.log"] }, manifest).exclude).toEqual([
      "*.log",
      "prototype",
      "archify",
    ]);
    expect(withOriginFilter({ includeLocal: true }, manifest).exclude).toBeUndefined();
  });

  it("removeOrphanedManifestEntries keeps only installed skill names", () => {
    const manifest: SkillsManifest = {
      version: 1,
      skills: {
        mentor: { origin: "authored", sync: true },
        archify: { origin: "external", sync: false },
      },
    };
    expect(removeOrphanedManifestEntries(manifest, ["mentor"])).toEqual(["archify"]);
    expect(Object.keys(manifest.skills)).toEqual(["mentor"]);
  });

  it("removeManifestEntry deletes one entry and returns false on a missing key", () => {
    const manifest: SkillsManifest = {
      version: 1,
      skills: { mentor: { origin: "authored", sync: true } },
    };
    expect(removeManifestEntry(manifest, "mentor")).toBe(true);
    expect(removeManifestEntry(manifest, "mentor")).toBe(false);
  });

  it("untrackSkill updates local and shared manifests without touching the filesystem", () => {
    const localFile = path.join(tmpDir, "local.json");
    const sharedFile = path.join(tmpDir, "shared.json");
    const skillDir = path.join(tmpDir, "skill-fs");
    fs.mkdirSync(skillDir, { recursive: true });
    saveManifest(localFile, { version: 1, skills: { retired: { origin: "authored", sync: true } } });
    saveManifest(sharedFile, { version: 1, skills: { retired: { origin: "authored", sync: true } } });

    const result = untrackSkill("retired", localFile, sharedFile);
    expect(result).toEqual({ local: true, shared: true });
    expect(loadManifest(localFile).skills).toEqual({});
    expect(loadManifest(sharedFile).skills).toEqual({});
    expect(fs.existsSync(skillDir)).toBe(true);
  });

  it("migrateLegacyManifest moves the file only when the canonical target is absent", () => {
    const legacy = path.join(tmpDir, "skills-manifest.json");
    const canonical = path.join(tmpDir, ".agents", "skills", "skills-manifest.json");
    fs.writeFileSync(legacy, JSON.stringify({ version: 1, skills: {} }));

    expect(migrateLegacyManifest(legacy, canonical)).toBe(true);
    expect(fs.existsSync(legacy)).toBe(false);
    expect(fs.existsSync(canonical)).toBe(true);

    fs.writeFileSync(legacy, "{}");
    expect(migrateLegacyManifest(legacy, canonical)).toBe(false);
  });

  it("repoManifestPath always nests the manifest under .agents/skills", () => {
    expect(repoManifestPath("/tmp/ai-custom")).toBe(
      path.join("/tmp/ai-custom", ".agents", "skills", "skills-manifest.json"),
    );
  });
});

describe("given divergent local and repo files, when plainMergeFiles runs, then non-overlapping edits are combined and overlapping edits yield conflict markers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-merge-behavior-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cleanly merges non-overlapping local and repo edits with a common base", () => {
    const base = path.join(tmpDir, "base.txt");
    const local = path.join(tmpDir, "local.txt");
    const repo = path.join(tmpDir, "repo.txt");
    fs.writeFileSync(base, "intro\n\nmiddle\n\noutro\n");
    fs.writeFileSync(local, "intro\n\nmiddle (local)\n\noutro\n");
    fs.writeFileSync(repo, "intro\n\nmiddle\n\noutro (repo)\n");

    const res = plainMergeFiles(local, repo, base);
    expect(res.success).toBe(true);
    expect(res.hasConflicts).toBe(false);
    expect(res.content).toContain("middle (local)");
    expect(res.content).toContain("outro (repo)");
  });

  it("inserts conflict markers when local and repo change the same line", () => {
    const local = path.join(tmpDir, "local.txt");
    const repo = path.join(tmpDir, "repo.txt");
    fs.writeFileSync(local, "name: local\n");
    fs.writeFileSync(repo, "name: repo\n");

    const res = plainMergeFiles(local, repo);
    expect(res.hasConflicts).toBe(true);
    expect(res.content).toContain("<<<<<<<");
    expect(res.content).toContain(">>>>>>>");
  });
});

describe("given a non-git tmpdir and an empty manifest, when git-status and reporting helpers run, then they return safe defaults without throwing", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-git-report-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("checkGitRemoteStatus reports isGit: false for a plain tmpdir", () => {
    const res = checkGitRemoteStatus(tmpRepo);
    expect(res.isGit).toBe(false);
    expect(res.message).toBe("");
    expect(res.ahead).toBe(0);
    expect(res.behind).toBe(0);
  });

  it("printSyncSummary runs without throwing for an empty manifest", () => {
    const manifest: SkillsManifest = { version: 1, skills: {} };
    expect(() => printSyncSummary(manifest)).not.toThrow();
  });
});
