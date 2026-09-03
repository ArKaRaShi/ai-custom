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
} from "./sync";
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
