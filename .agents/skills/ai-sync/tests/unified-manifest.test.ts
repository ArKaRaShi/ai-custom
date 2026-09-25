import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadLocations, resolveRootPaths, validateUnifiedManifest } from "../scripts/unified-manifest";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-v2-"));
  tempDirs.push(dir);
  return dir;
}

function manifest(repoRoot: string) {
  return {
    version: 2 as const,
    roots: { omp: { kind: "path" as const, repoRoot } },
    entries: [{ kind: "path" as const, root: "omp", path: "extensions/**", sync: true }],
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("given unified manifest objects, when validated, then enforces root rules and path isolation", () => {
  it("accepts v2 roots and root-relative rules", () => {
    const repo = tempDir();
    expect(validateUnifiedManifest(manifest(".omp"), repo).version).toBe(2);
  });

  it("rejects the old v1 path manifest", () => {
    expect(() => validateUnifiedManifest({ version: 1, rules: [] }, tempDir())).toThrow(/version|format/i);
  });

  it("rejects repo roots that traverse outside the backup", () => {
    expect(() => validateUnifiedManifest(manifest("../outside"), tempDir())).toThrow(/root|travers/i);
  });

  it("rejects a repo root symlink that resolves outside the backup", () => {
    const repo = tempDir();
    const outside = tempDir();
    fs.symlinkSync(outside, path.join(repo, "escape"), "dir");
    expect(() => validateUnifiedManifest(manifest("escape"), repo)).toThrow(/escapes/i);
  });

  it("rejects entries that reference missing or wrong-kind roots", () => {
    const unknown = manifest(".omp");
    unknown.entries[0].root = "missing";
    expect(() => validateUnifiedManifest(unknown, tempDir())).toThrow(/unknown root/i);
    const wrongKind = manifest(".omp");
    wrongKind.entries[0].kind = "skill";
    expect(() => validateUnifiedManifest(wrongKind, tempDir())).toThrow(/kind mismatch/i);
  });

  it("rejects duplicate root-scoped entry identities", () => {
    const input = manifest(".omp");
    input.entries.push({ ...input.entries[0] });
    expect(() => validateUnifiedManifest(input, tempDir())).toThrow(/duplicate/i);
  });

  it("expands only a leading tilde in local bindings", () => {
    const home = tempDir();
    const locationsFile = path.join(home, "locations.json");
    fs.writeFileSync(locationsFile, JSON.stringify({ version: 1, roots: { omp: "~/agent" } }));
    expect(loadLocations(locationsFile, home).roots.omp).toBe(path.join(home, "agent"));
    fs.writeFileSync(locationsFile, JSON.stringify({ version: 1, roots: { omp: "$HOME/agent" } }));
    expect(() => loadLocations(locationsFile, home)).toThrow();
  });

  it("rejects overlapping local roots before resolving transfer targets", () => {
    const repo = tempDir();
    const home = tempDir();
    const value = {
      version: 2 as const,
      roots: {
        a: { kind: "path" as const, repoRoot: ".omp" },
        b: { kind: "skill" as const, repoRoot: ".agents/skills" },
      },
      entries: [],
    };
    expect(() => resolveRootPaths(value, { version: 1, roots: { a: home, b: path.join(home, "skills") } }, repo)).toThrow(/overlap/i);
  });
});
