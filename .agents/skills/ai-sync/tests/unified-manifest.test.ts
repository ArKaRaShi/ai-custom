import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Environment } from "@/scripts/io/environment";
import { createIo, type Io } from "@/scripts/io/io";
import type { Locations, ResolvedRoot, UnifiedManifest } from "@/scripts/lib/manifest";
import {
  loadLocations as loadLocationsIn,
  resolveRoots,
  validateManifest,
} from "@/scripts/lib/manifest-repository";
import { at } from "./helpers/at";

function ioFor(home: string): Io {
  const environment: Environment = {
    home,
    defaultRepo: path.join(home, "Disk", "ai-custom"),
    skillsDir: path.join(home, ".agents", "skills"),
    locationsFile: path.join(home, ".config", "ai-sync", "locations.json"),
    cwd: home,
    isInteractive: false,
  };
  return { ...createIo(), environment };
}

const unusedHome = path.join(os.tmpdir(), "ai-sync-v2-unused-home");
const validateUnifiedManifest = (value: unknown, repoBase: string): UnifiedManifest =>
  validateManifest(ioFor(unusedHome), value, repoBase);
const loadLocations = (file: string, home: string): Locations => loadLocationsIn(ioFor(home), file);
const resolveRootPaths = (
  value: UnifiedManifest,
  locations: Locations,
  repoBase: string,
): ResolvedRoot[] => resolveRoots(ioFor(unusedHome), value, locations, repoBase);

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-v2-"));
  tempDirs.push(dir);
  return dir;
}

interface EntryInput {
  kind: "path" | "skill";
  root: string;
  path: string;
  sync: boolean;
}

interface ManifestInput {
  version: 2;
  roots: Record<string, { kind: "path" | "skill"; repoRoot: string }>;
  entries: EntryInput[];
}

function manifest(repoRoot: string): ManifestInput {
  return {
    version: 2,
    roots: { omp: { kind: "path", repoRoot } },
    entries: [{ kind: "path", root: "omp", path: "extensions/**", sync: true }],
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
    expect(() => validateUnifiedManifest({ version: 1, rules: [] }, tempDir())).toThrow(
      /version|format/i,
    );
  });

  it("rejects repo roots that traverse outside the backup", () => {
    expect(() => validateUnifiedManifest(manifest("../outside"), tempDir())).toThrow(
      /root|travers/i,
    );
  });

  it("rejects a repo root symlink that resolves outside the backup", () => {
    const repo = tempDir();
    const outside = tempDir();
    fs.symlinkSync(outside, path.join(repo, "escape"), "dir");
    expect(() => validateUnifiedManifest(manifest("escape"), repo)).toThrow(/escapes/i);
  });

  it("rejects entries that reference missing or wrong-kind roots", () => {
    const unknown = manifest(".omp");
    at(unknown.entries, 0).root = "missing";
    expect(() => validateUnifiedManifest(unknown, tempDir())).toThrow(/unknown root/i);
    const wrongKind = manifest(".omp");
    at(wrongKind.entries, 0).kind = "skill";
    expect(() => validateUnifiedManifest(wrongKind, tempDir())).toThrow(/kind mismatch/i);
  });

  it("rejects duplicate root-scoped entry identities", () => {
    const input = manifest(".omp");
    input.entries.push({ ...at(input.entries, 0) });
    expect(() => validateUnifiedManifest(input, tempDir())).toThrow(/duplicate/i);
  });

  it("keeps an optional version label on files and skills without inventing one", () => {
    const input = manifest(".omp");
    const first = at(input.entries, 0);
    const withLabel = {
      ...input,
      entries: [
        { ...first, version: "1.2" },
        { ...first, path: "other/**" },
      ],
    };
    const valid = validateUnifiedManifest(withLabel, tempDir());
    expect(valid.entries[0]).toMatchObject({ version: "1.2" });
    expect("version" in at(valid.entries, 1)).toBe(false);
    expect(() =>
      validateUnifiedManifest({ ...input, entries: [{ ...first, version: 3 }] }, tempDir()),
    ).toThrow(/version/i);
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
    expect(() =>
      resolveRootPaths(
        value,
        { version: 1, roots: { a: home, b: path.join(home, "skills") } },
        repo,
      ),
    ).toThrow(/overlap/i);
  });
});
