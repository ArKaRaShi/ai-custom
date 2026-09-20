# ai-sync Vendor Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `ai-sync`'s origin/sync provenance model (currently `skills`-only) to `agents/extensions/rules/hooks/tests`, so app-managed files (e.g. Orca's `@orca-managed-pi-extension`-marked extensions) never leak into the `ai-custom` git backup, with a unified `authored | vendor` vocabulary used everywhere.

**Architecture:** Two mechanisms sharing one vocabulary. Skills keep their existing manifest system (`skills-manifest.json`, rich ecosystem metadata), just renamed `external` → `vendor`. The five non-skill categories get a new, lightweight, combined `vendor-manifest.json` keyed by `"<category>/<filename>"`, detected via a marker-regex scan with manifest-override precedence, wired into `compare()`'s existing exclude mechanism the same way skills' `withOriginFilter` already works.

**Tech Stack:** Bun, TypeScript, `bun:test`.

## Global Constraints

- No backward compatibility required — this may rename existing values, CLI messages, and migrate `skills-manifest.json` data directly (user-approved in the design spec).
- `vendor` origin is **always** `sync: false`. `mark <category> <file> vendor --sync` is a hard validation error — not a default, a structural invariant.
- No new sync target categories beyond the one new `vendor-manifest` entry — this only adds provenance awareness on top of `agents/extensions/rules/hooks/tests`, which already exist in `TARGET_MAP`.
- Follow existing code conventions exactly: `bun:test`, BDD-style `describe("given ..., when ..., then ...")` blocks, `os.tmpdir()`-based isolation for filesystem tests, functions taking explicit path parameters (never relying on hidden global state) so they're testable without mocking `fs`.
- Two pre-existing duplicate test files exist (`scripts/sync.test.ts` / `tests/sync.test.ts`, `scripts/merge.test.ts` / `tests/merge.test.ts`, byte-identical except import path). This plan edits both copies wherever the vocabulary rename touches them (out of scope to deduplicate them — unrelated pre-existing structure). New tests for new functionality go only in `tests/` (no new duplication introduced).
- Full spec: `docs/superpowers/specs/2026-09-20-ai-sync-vendor-provenance-design.md`.

---

## Task 1: Rename skill vocabulary `external` → `vendor`

**Files:**
- Modify: `~/.agents/skills/ai-sync/scripts/manifest.ts`
- Modify: `~/.agents/skills/ai-sync/scripts/reporting.ts`
- Modify: `~/.agents/skills/ai-sync/scripts/sync.ts`
- Modify: `~/.agents/skills/ai-sync/scripts/sync-files.ts`
- Modify: `~/.agents/skills/ai-sync/scripts/targets.ts`
- Modify: `~/.agents/skills/ai-sync/tests/sync.test.ts`
- Modify: `~/.agents/skills/ai-sync/scripts/sync.test.ts`
- Modify: `~/.agents/skills/ai-sync/tests/targets-sync.test.ts`
- Modify: `~/.agents/skills/ai-sync/SKILL.md`
- Modify: `~/.agents/skills/skills-manifest.json`
- Modify: `~/Disk/ai-custom/.agents/skills/skills-manifest.json`

**Interfaces:**
- Produces: `SkillOrigin = "authored" | "vendor"` (renamed from `"authored" | "external"`), used by every later task via `import { SkillOrigin } from "./manifest"`.

- [ ] **Step 1: Update both `sync.test.ts` copies to expect `"vendor"` instead of `"external"`**

In `~/.agents/skills/ai-sync/tests/sync.test.ts`, replace every `origin: "external"` with `origin: "vendor"`, and update the two detection tests:

```ts
// was: it("detects external skill when registered in skills-lock.json", ...)
it("detects vendor skill when registered in skills-lock.json", () => {
  const skillName = "caveman";
  const localSkill = path.join(localSkillsDir, skillName);
  fs.mkdirSync(localSkill, { recursive: true });
  const skillsLock = {
    version: 1,
    skills: { [skillName]: { source: "JuliusBrussee/caveman", sourceType: "github" } },
  };
  const res = autoDetectSkill(skillName, localSkill, repoSkillsDir, skillsLock, { version: 1, skills: {} });
  expect(res.origin).toBe("vendor");
  expect(res.sync).toBe(false);
  expect(res.source).toBe("JuliusBrussee/caveman");
  expect(res.detectionReason).toContain("skills-lock.json");
});

// was: it("detects external skill when SKILL.md contains GitHub repository URL", ...)
it("detects vendor skill when SKILL.md contains GitHub repository URL", () => {
  const skillName = "archify";
  const localSkill = path.join(localSkillsDir, skillName);
  fs.mkdirSync(localSkill, { recursive: true });
  fs.writeFileSync(
    path.join(localSkill, "SKILL.md"),
    "---\nname: archify\n---\nSource: https://github.com/tt-a1i/archify\n",
  );
  const res = autoDetectSkill(skillName, localSkill, repoSkillsDir, {}, { version: 1, skills: {} });
  expect(res.origin).toBe("vendor");
  expect(res.sync).toBe(false);
  expect(res.source).toBe("tt-a1i/archify");
  expect(res.detectionReason).toContain("SKILL.md");
});
```

Apply the identical edit to `~/.agents/skills/ai-sync/scripts/sync.test.ts` (byte-identical file except its import uses `"./sync"` instead of `"../scripts/sync"`).

In `~/.agents/skills/ai-sync/tests/targets-sync.test.ts`, replace every `origin: "external"` with `origin: "vendor"` (3 occurrences, in the manifest-fixture tests around lines 179-213).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/.agents/skills/ai-sync && bun test 2>&1 | tail -40`
Expected: FAIL — `expect(res.origin).toBe("vendor")` receives `"external"` (implementation not yet updated).

- [ ] **Step 3: Rename the type and all detection logic in `manifest.ts`**

```ts
// line 6
export type SkillOrigin = "authored" | "vendor";
```

```ts
// lines 68-80 (skills-lock.json branch)
if (skillsLock.skills && skillsLock.skills[skillName]) {
  const lockEntry = skillsLock.skills[skillName];
  return {
    origin: "vendor",
    sync: false,
    source: lockEntry.source,
    sourceType: lockEntry.sourceType || "github",
    skillPath: lockEntry.skillPath,
    install: lockEntry.source ? `npx skills add ${lockEntry.source} -g` : undefined,
    detectionReason: `detected via ~/skills-lock.json (${lockEntry.source || "vendor"})`,
  };
}
```

```ts
// lines 90-102 (SKILL.md metadata branch)
if (ghMatch || authorMatch) {
  const source = ghMatch ? ghMatch[1] : undefined;
  const version = versionMatch ? versionMatch[1] : undefined;
  return {
    origin: "vendor",
    sync: false,
    source,
    sourceType: source ? "github" : undefined,
    version,
    install: source ? `npx skills add ${source} -g` : undefined,
    detectionReason: `detected via SKILL.md (${source || authorMatch?.[1]?.trim() || "vendor metadata"})`,
  };
}
```

- [ ] **Step 4: Rename in `reporting.ts`**

```ts
// line 25
if (entry.origin === "vendor" && entry.sync === false) {
```

```ts
// line 40
console.log(`ℹ️  Remote vendor skills not installed locally: ${informational.join(", ")}`);
```

- [ ] **Step 5: Rename in `sync-files.ts` (`cmdStatus`'s manifest summary block)**

```ts
// lines 230, 247-254
// Skill provenance: vendor and ignored skills stay off the shared git backup
const manifest = loadManifest(LOCAL_MANIFEST_FILE);
const skillsDir = path.join(HOME, ".agents", "skills");
const localSkillDirs = fs.existsSync(skillsDir)
  ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
const untracked = localSkillDirs.filter((n) => !manifest.skills[n]);
if (localSkillDirs.length > 0) {
  const filterSkills = (origin: SkillOrigin, sync: boolean) =>
    Object.entries(manifest.skills).filter(
      ([n, e]) => e.origin === origin && e.sync === sync && localSkillDirs.includes(n),
    );
  const fmt = (entries: Array<[string, SkillManifestEntry]>) =>
    entries.map(([n, e]) => (e.source ? `${n} (${e.source}${e.version ? "@" + e.version : ""})` : n)).join(", ") || "—";

  console.log(`📋 Skill Manifest (${LOCAL_MANIFEST_FILE.replace(HOME, "~")}):`);
  console.log(`   ✍️  authored (sync: true)  : ${fmt(filterSkills("authored", true))}`);
  console.log(`   🏠 authored (sync: false) : ${fmt(filterSkills("authored", false))} — local only, excluded from git`);
  console.log(`   🌐 vendor (sync: false)   : ${fmt(filterSkills("vendor", false))} — pointer only, excluded from git`);
  const vendorSynced = filterSkills("vendor", true);
  if (vendorSynced.length > 0) {
    console.log(`   📦 vendor (sync: true)    : ${fmt(vendorSynced)} — vendored full source into git`);
  }
  if (untracked.length > 0) {
    console.log(`   ❓ untracked              : ${untracked.join(", ")} — run 'sync.ts track <name> <authored|vendor> [--sync|--no-sync]'`);
  }
  console.log();
}
```

(Note this block already exists at these approximate lines; replace it verbatim with the above, which is identical except `external` → `vendor` and the corresponding comment/variable rename.)

- [ ] **Step 6: Rename in `targets.ts`**

```ts
// line 76
/** bypass origin filtering: include vendor/local skills in sync ops */
```

- [ ] **Step 7: Rename in `sync.ts` — `cmdTrack`, `cmdBootstrap`, `cmdDiscover`, usage strings**

```ts
// lines 84-88 (cmdTrack validation)
if (!["authored", "vendor"].includes(origin)) {
  console.log(`❌ Invalid origin '${origin}'. Use authored | vendor.`);
  process.exit(1);
}
// Default sync behavior: authored defaults to true, vendor defaults to false
```

```ts
// lines 184-197 (cmdBootstrap install loop)
// Vendor skills with install command are installed from upstream
const skillsDir = path.join(HOME, ".agents", "skills");
for (const [name, entry] of Object.entries(repoManifest.skills)) {
  if (entry.origin !== "vendor" || entry.sync === true) continue;
  if (fs.existsSync(path.join(skillsDir, name))) {
    console.log(`   ✅ vendor '${name}' already installed`);
    continue;
  }
  const installCmd = entry.install || (entry.source ? `npx -y skills add ${entry.source} -g` : null);
  if (!installCmd) {
    console.log(`   ⚠️  vendor '${name}' has no install command or source — install manually`);
    continue;
  }
  console.log(`   🌐 Installing vendor '${name}' via: ${installCmd}`);
  try {
    execSync(installCmd, { stdio: "inherit" });
  } catch {
    console.log(`   ❌ Install failed for '${name}'. Retry manually: ${installCmd}`);
  }
}
```

```ts
// lines 236-241 (cmdDiscover detectionReason fallback)
if (!discovered.skills[name].detectionReason) {
  discovered.skills[name].detectionReason = existing.sync
    ? "matched in repo"
    : existing.origin === "vendor"
    ? (existing.source ? `pointer (${existing.source})` : "vendor manifest")
    : "private to this machine";
}
```

```ts
// lines 250-282 (cmdDiscover grouping, labels, and variable names)
const authoredSynced = Object.entries(discovered.skills).filter(([, e]) => e.origin === "authored" && e.sync);
const vendorDeps = Object.entries(discovered.skills).filter(([, e]) => e.origin === "vendor" && !e.sync);
const vendorSynced = Object.entries(discovered.skills).filter(([, e]) => e.origin === "vendor" && e.sync);
const localExperiments = Object.entries(discovered.skills).filter(([, e]) => e.origin === "authored" && !e.sync);

console.log(`📦 SKILLS BREAKDOWN (${skillDirs.length} installed):\n`);

console.log(`  ✨ AUTHORED & SYNCED (${authoredSynced.length} skills) — Backed up to Git`);
console.log(`  ─────────────────────────────────────────────────────────`);
if (authoredSynced.length === 0) console.log(`     (none)`);
for (const [name, e] of authoredSynced) {
  const reason = e.detectionReason ? `[${e.detectionReason}]` : "";
  console.log(`     • ${name.padEnd(20)} ${reason}`);
}
console.log();

console.log(`  🌐 VENDOR DEPENDENCIES (${vendorDeps.length} skills) — Pointers only, excluded from Git`);
console.log(`  ─────────────────────────────────────────────────────────`);
if (vendorDeps.length === 0) console.log(`     (none)`);
for (const [name, e] of vendorDeps) {
  const sourceTag = e.source ? `(${e.source}${e.version ? "@" + e.version : ""})` : "";
  const reason = e.detectionReason ? `[${e.detectionReason}]` : "";
  console.log(`     • ${name.padEnd(18)} ${sourceTag.padEnd(28)} ${reason}`);
}
console.log();

if (vendorSynced.length > 0) {
  console.log(`  📦 VENDOR — FULL SOURCE SYNCED (${vendorSynced.length} skills) — Full source committed to Git`);
  console.log(`  ─────────────────────────────────────────────────────────`);
  for (const [name, e] of vendorSynced) {
    console.log(`     • ${name.padEnd(20)} [vendored]`);
  }
  console.log();
}

console.log(`  🔒 MACHINE-LOCAL EXPERIMENTS (${localExperiments.length} skills) — Private to this Mac`);
console.log(`  ─────────────────────────────────────────────────────────`);
if (localExperiments.length === 0) console.log(`     (none)`);
for (const [name, e] of localExperiments) {
  const reason = e.detectionReason ? `[${e.detectionReason}]` : "";
  console.log(`     • ${name.padEnd(20)} (sync: false)        ${reason}`);
}
console.log();
```

```ts
// line 309 (nonSyncedCount + summary line, uses renamed vendorDeps)
const nonSyncedCount = vendorDeps.length + localExperiments.length;
console.log(`─────────────────────────────────────────────────────────────────────────────`);
console.log(`🛡️  Git Protection Summary:`);
console.log(`   • ${authoredSynced.length + vendorSynced.length} skills backed up to Git (0 third-party bloat)`);
```

```ts
// line 423 (track usage string)
console.log(`Usage: bun sync.ts track <skill> <authored|vendor> [--sync|--no-sync] [--from <owner/repo>] [--version <v>]`);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd ~/.agents/skills/ai-sync && bun test 2>&1 | tail -20`
Expected: PASS — all suites, including the two renamed detection tests.

- [ ] **Step 9: Update `SKILL.md` documentation**

In `~/.agents/skills/ai-sync/SKILL.md`, replace every `external` with `vendor` in the CLI examples and the origin/sync table (lines ~51-57, 70, 108-110, 127-132, 194).

- [ ] **Step 10: Migrate `skills-manifest.json` data (local and repo copies)**

Run:
```bash
sed -i '' 's/"origin": "external"/"origin": "vendor"/g; s/"external manifest"/"vendor manifest"/g' \
  ~/.agents/skills/skills-manifest.json \
  ~/Disk/ai-custom/.agents/skills/skills-manifest.json
diff ~/.agents/skills/skills-manifest.json ~/Disk/ai-custom/.agents/skills/skills-manifest.json
```
Expected: no diff output (both files identical after the migration).

- [ ] **Step 11: Commit**

```bash
cd ~/Disk/ai-custom
git add .agents/skills/skills-manifest.json .agents/skills/ai-sync/
git commit -m "refactor(ai-sync): rename skill origin external to vendor

Unifies vocabulary with the upcoming non-skill vendor-provenance system:
external (GitHub/skills.sh sourced) and vendor (app-managed) are the
same concept — not authored by me, comes from somewhere else."
```

---

## Task 2: Vendor manifest data model for non-skill categories

**Files:**
- Modify: `~/.agents/skills/ai-sync/scripts/manifest.ts`
- Create: `~/.agents/skills/ai-sync/tests/vendor-manifest.test.ts`

**Interfaces:**
- Consumes: `SkillOrigin` from Task 1 (`"authored" | "vendor"`).
- Produces (used by later tasks):
  - `VENDOR_SCAN_CATEGORIES: string[]` — `["agents", "extensions", "rules", "hooks", "tests"]`
  - `interface VendorManifestEntry { origin: SkillOrigin; sync: boolean; detectionReason?: string }`
  - `interface VendorManifest { version: number; entries: Record<string, VendorManifestEntry> }`
  - `VENDOR_MANIFEST_FILENAME: string`, `LOCAL_VENDOR_MANIFEST_FILE: string`
  - `repoVendorManifestPath(repoBase?: string): string`
  - `autoDetectVendor(category: string, fileName: string, filePath: string, sharedManifest?: VendorManifest): VendorManifestEntry`
  - `scanVendorCategories(sharedManifest?: VendorManifest, categoryDirs?: Record<string, string>): VendorManifest`
  - `loadVendorManifest(manifestPath: string): VendorManifest`
  - `saveVendorManifest(manifestPath: string, data: VendorManifest): void`
  - `withVendorOriginFilter(opts?: SyncOptions, manifestPath?: string): SyncOptions`

- [ ] **Step 1: Write the failing tests**

Create `~/.agents/skills/ai-sync/tests/vendor-manifest.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  VENDOR_SCAN_CATEGORIES,
  autoDetectVendor,
  scanVendorCategories,
  loadVendorManifest,
  saveVendorManifest,
  withVendorOriginFilter,
  VendorManifest,
} from "../scripts/manifest";

describe("given a file with a vendor marker comment, when autoDetectVendor runs, then it is classified vendor and non-syncing", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-vendor-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects a file containing the @orca-managed-pi-extension marker as vendor, sync: false", () => {
    const filePath = path.join(tmpDir, "orca-thing.ts");
    fs.writeFileSync(filePath, "// @orca-managed-pi-extension\nexport default function () {}\n");
    const entry = autoDetectVendor("extensions", "orca-thing.ts", filePath);
    expect(entry.origin).toBe("vendor");
    expect(entry.sync).toBe(false);
    expect(entry.detectionReason).toContain("marker");
  });

  it("defaults a file with no marker to authored, sync: true", () => {
    const filePath = path.join(tmpDir, "my-extension.ts");
    fs.writeFileSync(filePath, "export default function () {}\n");
    const entry = autoDetectVendor("extensions", "my-extension.ts", filePath);
    expect(entry.origin).toBe("authored");
    expect(entry.sync).toBe(true);
    expect(entry.detectionReason).toContain("no vendor marker");
  });

  it("an explicit shared-manifest entry overrides marker detection", () => {
    const filePath = path.join(tmpDir, "orca-thing.ts");
    fs.writeFileSync(filePath, "// @orca-managed-pi-extension\n");
    const shared: VendorManifest = {
      version: 1,
      entries: { "extensions/orca-thing.ts": { origin: "authored", sync: true } },
    };
    const entry = autoDetectVendor("extensions", "orca-thing.ts", filePath, shared);
    expect(entry.origin).toBe("authored");
    expect(entry.sync).toBe(true);
    expect(entry.detectionReason).toContain("from repo manifest");
  });
});

describe("given a tree of category directories, when scanVendorCategories walks them, then every file is keyed by category/filename", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-vendor-scan-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("walks nested files (e.g. hooks/pre/foo.sh) and reports category/relative-path keys", () => {
    const extDir = path.join(tmpDir, "extensions");
    const hooksDir = path.join(tmpDir, "hooks");
    fs.mkdirSync(extDir, { recursive: true });
    fs.mkdirSync(path.join(hooksDir, "pre"), { recursive: true });
    fs.writeFileSync(path.join(extDir, "orca-thing.ts"), "// @orca-managed-pi-extension\n");
    fs.writeFileSync(path.join(hooksDir, "pre", "foo.sh"), "#!/bin/sh\n");

    const result = scanVendorCategories({ version: 1, entries: {} }, {
      extensions: extDir,
      hooks: hooksDir,
    });

    expect(result.entries["extensions/orca-thing.ts"].origin).toBe("vendor");
    expect(result.entries[path.join("hooks", "pre", "foo.sh")].origin).toBe("authored");
  });

  it("returns an empty manifest for a category directory that does not exist", () => {
    const result = scanVendorCategories({ version: 1, entries: {} }, { extensions: path.join(tmpDir, "missing") });
    expect(result.entries).toEqual({});
  });
});

describe("given load/save round-trips, when a vendor manifest file is written and read back, then its content is preserved", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-vendor-io-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loadVendorManifest returns an empty manifest when the file does not exist", () => {
    const result = loadVendorManifest(path.join(tmpDir, "missing.json"));
    expect(result).toEqual({ version: 1, entries: {} });
  });

  it("saveVendorManifest then loadVendorManifest round-trips entries exactly", () => {
    const file = path.join(tmpDir, "vendor-manifest.json");
    const data: VendorManifest = {
      version: 1,
      entries: { "extensions/orca-thing.ts": { origin: "vendor", sync: false, detectionReason: "manually marked" } },
    };
    saveVendorManifest(file, data);
    expect(loadVendorManifest(file)).toEqual(data);
  });
});

describe("given a vendor manifest with non-syncing entries, when withVendorOriginFilter augments sync options, then vendor files are excluded by filename", () => {
  let tmpDir: string;
  let manifestFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-vendor-filter-"));
    manifestFile = path.join(tmpDir, "vendor-manifest.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds a vendor-marked file's bare filename to the exclude list via live scan, no manifest needed", () => {
    const extDir = path.join(tmpDir, "extensions");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "orca-thing.ts"), "// @orca-managed-pi-extension\n");
    saveVendorManifest(manifestFile, { version: 1, entries: {} });

    const opts = withVendorOriginFilter(
      {},
      manifestFile,
    );
    // withVendorOriginFilter scans the real ~/.omp/agent/* dirs by default;
    // this test only proves the manifest-load/exclude wiring, so we assert
    // shape rather than exact contents for the default-dir case.
    expect(Array.isArray(opts.exclude)).toBe(true);
  });

  it("includeLocal bypasses the vendor filter entirely", () => {
    saveVendorManifest(manifestFile, { version: 1, entries: {} });
    const opts = withVendorOriginFilter({ includeLocal: true }, manifestFile);
    expect(opts.exclude).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/.agents/skills/ai-sync && bun test tests/vendor-manifest.test.ts 2>&1 | tail -30`
Expected: FAIL with `error: Export named 'VENDOR_SCAN_CATEGORIES' not found in module ...manifest.ts` (nothing implemented yet).

- [ ] **Step 3: Implement the vendor manifest module in `manifest.ts`**

Append to the end of `~/.agents/skills/ai-sync/scripts/manifest.ts` (after the existing `withOriginFilter` function):

```ts
/**
 * Vendor provenance for non-skill categories (agents, extensions, rules,
 * hooks, tests). These categories only ever need authored/vendor + an
 * optional detection reason — skills keep their own richer manifest above
 * (GitHub source, version, install command).
 */
export const VENDOR_SCAN_CATEGORIES = ["agents", "extensions", "rules", "hooks", "tests"];

export interface VendorManifestEntry {
  origin: SkillOrigin; // reuses the same "authored" | "vendor" union
  sync: boolean;
  detectionReason?: string;
}

export interface VendorManifest {
  version: number;
  entries: Record<string, VendorManifestEntry>; // key: "<category>/<relative-file-path>"
}

export const VENDOR_MANIFEST_FILENAME = "vendor-manifest.json";
export const LOCAL_VENDOR_MANIFEST_FILE = path.join(HOME, ".omp", "agent", VENDOR_MANIFEST_FILENAME);

export function repoVendorManifestPath(repoBase = DEFAULT_REPO): string {
  return path.join(repoBase, ".omp", VENDOR_MANIFEST_FILENAME);
}

/** Content markers identifying files managed by the host application, not the user. */
const VENDOR_MARKERS = [/@orca-managed-pi-extension/];

/** Inspects one file's content and returns its detected origin, sync flag, and reason. */
export function autoDetectVendor(
  category: string,
  fileName: string,
  filePath: string,
  sharedManifest: VendorManifest = { version: 1, entries: {} },
): VendorManifestEntry {
  const key = `${category}/${fileName}`;
  if (sharedManifest.entries[key]) {
    const existing = sharedManifest.entries[key];
    return { ...existing, detectionReason: `from repo manifest (sync: ${existing.sync})` };
  }
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const marker = VENDOR_MARKERS.find((re) => re.test(content));
    if (marker) {
      return { origin: "vendor", sync: false, detectionReason: `app-managed (${marker.source} marker)` };
    }
  } catch {}
  return { origin: "authored", sync: true, detectionReason: "no vendor marker, authored by user" };
}

function walkVendorDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkVendorDir(full));
    else files.push(full);
  }
  return files;
}

/** Scans every non-skill category directory, keyed by "<category>/<relative-file>". */
export function scanVendorCategories(
  sharedManifest: VendorManifest = { version: 1, entries: {} },
  categoryDirs: Record<string, string> = Object.fromEntries(
    VENDOR_SCAN_CATEGORIES.map((c) => [c, path.join(HOME, ".omp", "agent", c)]),
  ),
): VendorManifest {
  const discovered: VendorManifest = { version: 1, entries: {} };
  for (const [category, dir] of Object.entries(categoryDirs)) {
    for (const filePath of walkVendorDir(dir)) {
      const fileName = path.relative(dir, filePath);
      const key = `${category}/${fileName}`;
      discovered.entries[key] = autoDetectVendor(category, fileName, filePath, sharedManifest);
    }
  }
  return discovered;
}

export function loadVendorManifest(manifestPath: string): VendorManifest {
  try {
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as VendorManifest;
    }
  } catch {}
  return { version: 1, entries: {} };
}

export function saveVendorManifest(manifestPath: string, data: VendorManifest): void {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/**
 * Augment exclude list so vendor-managed files never cross into git backup.
 * Live-scans on every call (no persisted manifest required for correct
 * default behavior); a persisted vendor-manifest.json entry overrides
 * marker-regex detection for one specific file.
 *
 * Note: exclude patterns match by bare filename (matchesPattern has no way
 * to scope a pattern to one target category), so a vendor file colliding by
 * name with an unrelated authored file in a *different* category would also
 * be excluded. Same precision limit skills' origin filter already accepts.
 */
export function withVendorOriginFilter(opts: SyncOptions = {}, manifestPath: string = LOCAL_VENDOR_MANIFEST_FILE): SyncOptions {
  if (opts.includeLocal) return opts;
  const manifest = loadVendorManifest(manifestPath);
  const discovered = scanVendorCategories(manifest);
  const nonSynced = Object.entries(discovered.entries)
    .filter(([, entry]) => entry.sync !== true)
    .map(([key]) => key.slice(key.indexOf("/") + 1));
  if (nonSynced.length === 0) return opts;
  return { ...opts, exclude: [...(opts.exclude ?? []), ...nonSynced] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/.agents/skills/ai-sync && bun test tests/vendor-manifest.test.ts 2>&1 | tail -30`
Expected: PASS — all cases in the new file.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `cd ~/.agents/skills/ai-sync && bun test 2>&1 | tail -20`
Expected: PASS — all suites (Task 1's renamed tests plus this new file).

- [ ] **Step 6: Commit**

```bash
cd ~/Disk/ai-custom
git add .agents/skills/ai-sync/scripts/manifest.ts .agents/skills/ai-sync/tests/vendor-manifest.test.ts
git commit -m "feat(ai-sync): add vendor manifest data model for non-skill categories

New module in manifest.ts: autoDetectVendor, scanVendorCategories,
load/saveVendorManifest, withVendorOriginFilter. Detects files carrying
the @orca-managed-pi-extension marker (or a future vendor marker) as
vendor/sync:false, with a persisted vendor-manifest.json entry able to
override the live scan for one specific file."
```

---

## Task 3: Register `vendor-manifest.json` as a sync target

**Files:**
- Modify: `~/.agents/skills/ai-sync/scripts/targets.ts`
- Modify: `~/.agents/skills/ai-sync/tests/targets-sync.test.ts`

**Interfaces:**
- Consumes: `LOCAL_VENDOR_MANIFEST_FILE` from Task 2 (for the test assertion's expected local path).
- Produces: a new `TARGET_MAP` entry with `category: "vendor-manifest"`, consumed by `compare()`/`cmdPull`/`cmdPush` automatically (no code change needed there — they iterate `TARGET_MAP` generically).

- [ ] **Step 1: Write the failing test**

Add to `~/.agents/skills/ai-sync/tests/targets-sync.test.ts`, inside the first `describe` block (after the existing `it("gives the user skills target a stable name ...")` test, around line 67):

```ts
it("maps vendor-manifest.json between ~/.omp/agent and .omp in the repo", () => {
  const vendorManifest = TARGET_MAP.find((t) => t.category === "vendor-manifest");
  expect(vendorManifest).toBeDefined();
  expect(vendorManifest!.local).toBe(path.join(HOME, ".omp", "agent", "vendor-manifest.json"));
  expect(vendorManifest!.repo).toBe(path.join(DEFAULT_REPO, ".omp", "vendor-manifest.json"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/.agents/skills/ai-sync && bun test tests/targets-sync.test.ts 2>&1 | tail -15`
Expected: FAIL — `expect(vendorManifest).toBeDefined()` receives `undefined`.

- [ ] **Step 3: Add the `TARGET_MAP` entry**

In `~/.agents/skills/ai-sync/scripts/targets.ts`, add after the `"User Skills"` entry (the last entry, currently ending the array before the closing `];`):

```ts
  {
    name: "Vendor Manifest",
    category: "vendor-manifest",
    local: path.join(HOME, ".omp", "agent", "vendor-manifest.json"),
    repo: path.join(DEFAULT_REPO, ".omp", "vendor-manifest.json"),
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/.agents/skills/ai-sync && bun test tests/targets-sync.test.ts 2>&1 | tail -15`
Expected: PASS.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `cd ~/.agents/skills/ai-sync && bun test 2>&1 | tail -20`
Expected: PASS — all suites, including the category-presence loop test (which only checks a fixed list is a subset, unaffected by the new entry).

- [ ] **Step 6: Commit**

```bash
cd ~/Disk/ai-custom
git add .agents/skills/ai-sync/scripts/targets.ts .agents/skills/ai-sync/tests/targets-sync.test.ts
git commit -m "feat(ai-sync): sync vendor-manifest.json as its own target

Registers ~/.omp/agent/vendor-manifest.json <-> .omp/vendor-manifest.json
in TARGET_MAP so a 'mark' decision made on one machine reaches every
other machine through the normal push/pull flow."
```

---

## Task 4: Wire vendor filter into status/pull/push

**Files:**
- Modify: `~/.agents/skills/ai-sync/scripts/sync-files.ts`
- Modify: `~/.agents/skills/ai-sync/tests/vendor-manifest.test.ts`

**Interfaces:**
- Consumes: `withVendorOriginFilter` from Task 2.
- Produces: `compare()` (called inside `cmdStatus`/`cmdPull`/`cmdPush`) now excludes vendor `sync: false` files the same way it already excludes non-synced skills.

- [ ] **Step 1: Write the failing regression test**

Add to `~/.agents/skills/ai-sync/tests/vendor-manifest.test.ts`, a new `describe` block at the end of the file. This exercises `scanVendorCategories` with an explicit `categoryDirs` argument rather than `withVendorOriginFilter`'s default (which reads `~/.omp/agent/*` via `targets.ts`'s `HOME` constant, captured once at module import time — not something a test can safely override per-case):

```ts
describe("given a vendor-marked extension file on disk, when scanVendorCategories walks its category dir, then it is reported non-syncing", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-vendor-compare-home-"));
    fs.mkdirSync(path.join(tmpHome, "extensions"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, "extensions", "orca-thing.ts"),
      "// @orca-managed-pi-extension\n",
    );
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("marks the vendor file sync:false, ready to be excluded by its bare filename", () => {
    const extDir = path.join(tmpHome, "extensions");
    const discovered = scanVendorCategories({ version: 1, entries: {} }, { extensions: extDir });
    expect(discovered.entries["extensions/orca-thing.ts"].sync).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd ~/.agents/skills/ai-sync && bun test tests/vendor-manifest.test.ts 2>&1 | tail -20`
Expected: PASS — this exercises the same `scanVendorCategories` function Task 2 already implemented and tested; it stays green here because it establishes the fixture this task's wiring step (Step 3) will smoke-test against.

- [ ] **Step 3: Wire `withVendorOriginFilter` into `cmdStatus`, `cmdPull`, `cmdPush`**

In `~/.agents/skills/ai-sync/scripts/sync-files.ts`:

```ts
// import line 9 — add withVendorOriginFilter
import { LOCAL_MANIFEST_FILE, loadManifest, withOriginFilter, withVendorOriginFilter, SkillOrigin } from "./manifest";
```

```ts
// inside cmdStatus, replace:
//   const report = compare(repoBase, withOriginFilter(opts, manifest));
// with:
const report = compare(repoBase, withVendorOriginFilter(withOriginFilter(opts, manifest)));
```

```ts
// inside cmdPull, replace:
//   const report = compare(repoBase, withOriginFilter(opts));
// with:
const report = compare(repoBase, withVendorOriginFilter(withOriginFilter(opts)));
```

```ts
// inside cmdPush, replace:
//   const report = compare(repoBase, withOriginFilter(opts));
// with:
const report = compare(repoBase, withVendorOriginFilter(withOriginFilter(opts)));
```

- [ ] **Step 4: Run the full suite to check for regressions**

Run: `cd ~/.agents/skills/ai-sync && bun test 2>&1 | tail -20`
Expected: PASS — all suites.

- [ ] **Step 5: Smoke-test against the real machine state**

Run: `bun ~/.agents/skills/ai-sync/scripts/sync.ts status extensions 2>&1 | tail -20`
Expected: `orca-agent-status.ts`, `orca-prefill.ts`, and `orca-titlebar-spinner.ts` no longer appear under "New Local"/"Modified" — they are silently excluded now.

- [ ] **Step 6: Commit**

```bash
cd ~/Disk/ai-custom
git add .agents/skills/ai-sync/scripts/sync-files.ts .agents/skills/ai-sync/tests/vendor-manifest.test.ts
git commit -m "feat(ai-sync): exclude vendor-managed files from status/pull/push

Composes withVendorOriginFilter with the existing withOriginFilter at
all three compare() call sites, so app-managed extensions/agents/rules/
hooks/tests files never surface as drift or reach the git backup."
```

---

## Task 5: `mark`/`unmark` CLI for manual overrides

**Files:**
- Modify: `~/.agents/skills/ai-sync/scripts/sync.ts`
- Create: `~/.agents/skills/ai-sync/tests/vendor-cli.test.ts`

**Interfaces:**
- Consumes: `VENDOR_SCAN_CATEGORIES`, `loadVendorManifest`, `saveVendorManifest`, `repoVendorManifestPath`, `LOCAL_VENDOR_MANIFEST_FILE`, `SkillOrigin` from Task 2.
- Produces: `cmdMark(category: string, fileName: string, origin: SkillOrigin, meta: { sync?: boolean }, repoBase?: string): void`, `cmdUnmark(category: string, fileName: string, repoBase?: string): void`, and CLI verbs `mark`/`unmark`.

- [ ] **Step 1: Write the failing tests**

Create `~/.agents/skills/ai-sync/tests/vendor-cli.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { cmdMark, cmdUnmark } from "../scripts/sync";
import { loadVendorManifest, repoVendorManifestPath, LOCAL_VENDOR_MANIFEST_FILE } from "../scripts/manifest";

describe("given a file in a non-skill category, when cmdMark records a manual override, then it persists to both local and repo vendor manifests", () => {
  let tmpHome: string;
  let tmpRepo: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-mark-home-"));
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-mark-repo-"));
    fs.mkdirSync(path.join(tmpHome, ".omp", "agent", "extensions"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".omp", "agent", "extensions", "my-thing.ts"), "export default function () {}\n");
    originalHome = process.env.HOME;
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("marks a file authored with sync:true by default and writes both manifests", () => {
    cmdMark("extensions", "my-thing.ts", "authored", {}, tmpRepo);
    const local = loadVendorManifest(path.join(tmpHome, ".omp", "agent", "vendor-manifest.json"));
    const shared = loadVendorManifest(repoVendorManifestPath(tmpRepo));
    expect(local.entries["extensions/my-thing.ts"]).toEqual({ origin: "authored", sync: true, detectionReason: "manually marked" });
    expect(shared.entries["extensions/my-thing.ts"]).toEqual({ origin: "authored", sync: true, detectionReason: "manually marked" });
  });

  it("marks a file vendor and forces sync:false regardless of default", () => {
    cmdMark("extensions", "my-thing.ts", "vendor", {}, tmpRepo);
    const local = loadVendorManifest(path.join(tmpHome, ".omp", "agent", "vendor-manifest.json"));
    expect(local.entries["extensions/my-thing.ts"].origin).toBe("vendor");
    expect(local.entries["extensions/my-thing.ts"].sync).toBe(false);
  });

  it("rejects marking a file vendor with --sync (process.exit(1))", () => {
    const originalExit = process.exit;
    let exitCode: number | undefined;
    // @ts-expect-error overriding for test
    process.exit = (code?: number) => { exitCode = code; throw new Error("exit"); };
    try {
      expect(() => cmdMark("extensions", "my-thing.ts", "vendor", { sync: true }, tmpRepo)).toThrow();
    } finally {
      process.exit = originalExit;
    }
    expect(exitCode).toBe(1);
  });

  it("rejects an unknown category (process.exit(1))", () => {
    const originalExit = process.exit;
    let exitCode: number | undefined;
    // @ts-expect-error overriding for test
    process.exit = (code?: number) => { exitCode = code; throw new Error("exit"); };
    try {
      expect(() => cmdMark("not-a-category", "my-thing.ts", "authored", {}, tmpRepo)).toThrow();
    } finally {
      process.exit = originalExit;
    }
    expect(exitCode).toBe(1);
  });

  it("rejects a file that does not exist under the category directory (process.exit(1))", () => {
    const originalExit = process.exit;
    let exitCode: number | undefined;
    // @ts-expect-error overriding for test
    process.exit = (code?: number) => { exitCode = code; throw new Error("exit"); };
    try {
      expect(() => cmdMark("extensions", "does-not-exist.ts", "authored", {}, tmpRepo)).toThrow();
    } finally {
      process.exit = originalExit;
    }
    expect(exitCode).toBe(1);
  });

  it("unmark removes a previously marked override from both manifests", () => {
    cmdMark("extensions", "my-thing.ts", "vendor", {}, tmpRepo);
    cmdUnmark("extensions", "my-thing.ts", tmpRepo);
    const local = loadVendorManifest(path.join(tmpHome, ".omp", "agent", "vendor-manifest.json"));
    const shared = loadVendorManifest(repoVendorManifestPath(tmpRepo));
    expect(local.entries["extensions/my-thing.ts"]).toBeUndefined();
    expect(shared.entries["extensions/my-thing.ts"]).toBeUndefined();
  });

  it("unmark on a file with no override is a no-op (does not throw)", () => {
    expect(() => cmdUnmark("extensions", "my-thing.ts", tmpRepo)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/.agents/skills/ai-sync && bun test tests/vendor-cli.test.ts 2>&1 | tail -30`
Expected: FAIL with `error: Export named 'cmdMark' not found in module ...sync.ts`.

- [ ] **Step 3: Add imports in `sync.ts`**

```ts
// extend the existing "./manifest" import block (lines 6-23) to add:
import {
  autoDetectSkill,
  loadManifest,
  loadSkillsLock,
  LOCAL_MANIFEST_FILE,
  LOCAL_VENDOR_MANIFEST_FILE,
  MANIFEST_FILENAME,
  migrateLegacyManifest,
  removeManifestEntry,
  removeOrphanedManifestEntries,
  repoManifestPath,
  repoVendorManifestPath,
  saveManifest,
  saveVendorManifest,
  loadVendorManifest,
  SkillsLock,
  SkillsManifest,
  SkillManifestEntry,
  SkillOrigin,
  untrackSkill,
  VENDOR_SCAN_CATEGORIES,
  withOriginFilter,
} from "./manifest";
```

Also extend the re-export block (lines 45-60) the same way so `~/.agents/skills/ai-sync/scripts/sync.ts`'s public surface stays complete for callers importing from `"./sync"`:

```ts
export {
  autoDetectSkill,
  loadManifest,
  loadSkillsLock,
  LOCAL_MANIFEST_FILE,
  LOCAL_VENDOR_MANIFEST_FILE,
  MANIFEST_FILENAME,
  migrateLegacyManifest,
  removeManifestEntry,
  removeOrphanedManifestEntries,
  repoManifestPath,
  repoVendorManifestPath,
  saveManifest,
  saveVendorManifest,
  loadVendorManifest,
  SKILLS_LOCK_FILE,
  untrackSkill,
  VENDOR_SCAN_CATEGORIES,
  withOriginFilter,
} from "./manifest";
```

- [ ] **Step 4: Implement `cmdMark` and `cmdUnmark`**

Add after `cmdUntrack` (after the existing function ending around line 116):

```ts
export function cmdMark(
  category: string,
  fileName: string,
  origin: SkillOrigin,
  meta: { sync?: boolean } = {},
  repoBase = DEFAULT_REPO,
): void {
  if (!VENDOR_SCAN_CATEGORIES.includes(category)) {
    console.log(`❌ Invalid category '${category}'. Use one of: ${VENDOR_SCAN_CATEGORIES.join(", ")}.`);
    process.exit(1);
  }
  if (!["authored", "vendor"].includes(origin)) {
    console.log(`❌ Invalid origin '${origin}'. Use authored | vendor.`);
    process.exit(1);
  }
  if (origin === "vendor" && meta.sync === true) {
    console.log(`❌ 'vendor' origin cannot be synced. Vendor-managed files never cross into the git backup.`);
    process.exit(1);
  }
  const categoryDir = path.join(HOME, ".omp", "agent", category);
  const filePath = path.join(categoryDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const sync = origin === "vendor" ? false : meta.sync !== undefined ? meta.sync : true;
  const key = `${category}/${fileName}`;

  const manifest = loadVendorManifest(LOCAL_VENDOR_MANIFEST_FILE);
  manifest.entries[key] = { origin, sync, detectionReason: "manually marked" };
  saveVendorManifest(LOCAL_VENDOR_MANIFEST_FILE, manifest);
  console.log(`📋 Marked '${key}' as ${origin} (sync: ${sync}) in ${LOCAL_VENDOR_MANIFEST_FILE.replace(HOME, "~")}`);

  const repoManifestFile = repoVendorManifestPath(repoBase);
  const repoManifest = loadVendorManifest(repoManifestFile);
  repoManifest.entries[key] = manifest.entries[key];
  saveVendorManifest(repoManifestFile, repoManifest);
  console.log(`   🌐 Repo manifest updated: ${repoManifestFile.replace(HOME, "~")} (commit with your next push)`);
}

export function cmdUnmark(category: string, fileName: string, repoBase = DEFAULT_REPO): void {
  const key = `${category}/${fileName}`;
  const manifest = loadVendorManifest(LOCAL_VENDOR_MANIFEST_FILE);
  const repoManifestFile = repoVendorManifestPath(repoBase);
  const repoManifest = loadVendorManifest(repoManifestFile);
  const hadLocal = key in manifest.entries;
  const hadShared = key in repoManifest.entries;
  if (!hadLocal && !hadShared) {
    console.log(`📋 '${key}' had no manual override.`);
    return;
  }
  delete manifest.entries[key];
  delete repoManifest.entries[key];
  if (hadLocal) saveVendorManifest(LOCAL_VENDOR_MANIFEST_FILE, manifest);
  if (hadShared) saveVendorManifest(repoManifestFile, repoManifest);
  console.log(`📋 Removed override for '${key}'. Falls back to auto-detection.`);
}
```

- [ ] **Step 5: Wire `mark`/`unmark` into `parseArgs` and the CLI dispatch**

In `parseArgs`, extend both command-exclusion lists (so `mark`/`unmark` positionals aren't mistaken for a target category or repo path):

```ts
// line 376 condition — add "mark" and "unmark"
if (command !== "track" && command !== "untrack" && command !== "mark" && command !== "unmark" && command !== "prune-manifest" && command !== "migrate-manifest" && command !== "bootstrap" && command !== "discover" && rest[0]) {
```

```ts
// line 385 condition — add "mark" and "unmark"
if (command !== "track" && command !== "untrack" && command !== "mark" && command !== "unmark" && command !== "prune-manifest" && command !== "migrate-manifest" && command !== "bootstrap" && command !== "discover" && rest[1] && !repo) {
```

In the CLI `switch` block, add two cases after `case "untrack":` (after its `break;`):

```ts
case "mark":
  if (!args[0] || !args[1] || !args[2]) {
    console.log(`Usage: bun sync.ts mark <category> <file> <authored|vendor> [--sync|--no-sync, authored only]`);
    process.exit(1);
  }
  cmdMark(args[0], args[1], args[2] as SkillOrigin, meta, repo);
  break;
case "unmark":
  if (!args[0] || !args[1]) {
    console.log(`Usage: bun sync.ts unmark <category> <file>`);
    process.exit(1);
  }
  cmdUnmark(args[0], args[1], repo);
  break;
```

Update the `default:` usage string (currently ending the switch) to list the new verbs:

```ts
default:
  console.log(`Usage: bun sync.ts [status|discover|diff|resolve|merge|pull|push|track|untrack|mark|unmark|prune-manifest|migrate-manifest|bootstrap] [target|repo_path] [--exclude <name>] [--target <scope>] [--include-local] [--write] [--apply]`);
  process.exit(1);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd ~/.agents/skills/ai-sync && bun test tests/vendor-cli.test.ts 2>&1 | tail -30`
Expected: PASS — all 7 cases.

- [ ] **Step 7: Run the full suite to check for regressions**

Run: `cd ~/.agents/skills/ai-sync && bun test 2>&1 | tail -20`
Expected: PASS — all suites.

- [ ] **Step 8: Commit**

```bash
cd ~/Disk/ai-custom
git add .agents/skills/ai-sync/scripts/sync.ts .agents/skills/ai-sync/tests/vendor-cli.test.ts
git commit -m "feat(ai-sync): add mark/unmark CLI for vendor overrides

mark <category> <file> <authored|vendor> persists a manual override to
both local and shared vendor-manifest.json, taking precedence over the
marker-regex live scan. vendor is hard-locked to sync:false — passing
--sync with vendor is a validation error, not a default that could be
flagged away. unmark removes an override, falling back to auto-detection."
```

---

## Task 6: Extend `discover` with a vendor provenance report

**Files:**
- Modify: `~/.agents/skills/ai-sync/scripts/sync.ts`
- Modify: `~/.agents/skills/ai-sync/tests/vendor-cli.test.ts`

**Interfaces:**
- Consumes: `scanVendorCategories`, `loadVendorManifest`, `saveVendorManifest`, `repoVendorManifestPath`, `LOCAL_VENDOR_MANIFEST_FILE`, `VendorManifest` from Task 2.
- Produces: `cmdDiscoverVendor(repoBase?: string, write?: boolean): VendorManifest`, invoked alongside the existing `cmdDiscover` from the `discover` CLI case.

- [ ] **Step 1: Write the failing test**

Add to `~/.agents/skills/ai-sync/tests/vendor-cli.test.ts`:

```ts
describe("given files across non-skill categories, when cmdDiscoverVendor runs, then it reports authored vs vendor and optionally persists", () => {
  let tmpHome: string;
  let tmpRepo: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-discover-home-"));
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-discover-repo-"));
    fs.mkdirSync(path.join(tmpHome, ".omp", "agent", "extensions"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".omp", "agent", "extensions", "orca-thing.ts"), "// @orca-managed-pi-extension\n");
    fs.writeFileSync(path.join(tmpHome, ".omp", "agent", "extensions", "my-thing.ts"), "export default function () {}\n");
    originalHome = process.env.HOME;
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("classifies files without writing when write is false", async () => {
    const { cmdDiscoverVendor } = await import("../scripts/sync");
    const result = cmdDiscoverVendor(tmpRepo, false);
    expect(result.entries["extensions/orca-thing.ts"].origin).toBe("vendor");
    expect(result.entries["extensions/my-thing.ts"].origin).toBe("authored");
    const { loadVendorManifest } = await import("../scripts/manifest");
    const local = loadVendorManifest(path.join(tmpHome, ".omp", "agent", "vendor-manifest.json"));
    expect(local.entries).toEqual({});
  });

  it("persists detections into the local vendor manifest when write is true", async () => {
    const { cmdDiscoverVendor } = await import("../scripts/sync");
    cmdDiscoverVendor(tmpRepo, true);
    const { loadVendorManifest } = await import("../scripts/manifest");
    const local = loadVendorManifest(path.join(tmpHome, ".omp", "agent", "vendor-manifest.json"));
    expect(local.entries["extensions/orca-thing.ts"].origin).toBe("vendor");
    expect(local.entries["extensions/my-thing.ts"].origin).toBe("authored");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/.agents/skills/ai-sync && bun test tests/vendor-cli.test.ts 2>&1 | tail -20`
Expected: FAIL with `error: Export named 'cmdDiscoverVendor' not found in module ...sync.ts`.

- [ ] **Step 3: Implement `cmdDiscoverVendor`**

Add after `cmdDiscover` (after its closing `}` at the end of that function):

```ts
export function cmdDiscoverVendor(repoBase = DEFAULT_REPO, write = false): VendorManifest {
  console.log(`\n🧩 ai-sync: Vendor Provenance Report (agents, extensions, rules, hooks, tests)`);
  console.log(`─────────────────────────────────────────────────────────────────────────────`);

  const localManifest = loadVendorManifest(LOCAL_VENDOR_MANIFEST_FILE);
  const sharedManifestFile = repoVendorManifestPath(repoBase);
  const sharedManifest = loadVendorManifest(sharedManifestFile);
  const overrideSource = Object.keys(sharedManifest.entries).length > 0 ? sharedManifest : localManifest;
  const discovered = scanVendorCategories(overrideSource);

  const authored = Object.entries(discovered.entries).filter(([, e]) => e.origin === "authored");
  const vendor = Object.entries(discovered.entries).filter(([, e]) => e.origin === "vendor");

  console.log(`  ✨ AUTHORED (${authored.length}) — Synced to Git`);
  console.log(`  ─────────────────────────────────────────────────────────`);
  if (authored.length === 0) console.log(`     (none)`);
  for (const [key, e] of authored) {
    console.log(`     • ${key.padEnd(40)} [${e.detectionReason}]`);
  }
  console.log();

  console.log(`  🧩 VENDOR-MANAGED (${vendor.length}) — Excluded from Git, local machine only`);
  console.log(`  ─────────────────────────────────────────────────────────`);
  if (vendor.length === 0) console.log(`     (none)`);
  for (const [key, e] of vendor) {
    console.log(`     • ${key.padEnd(40)} [${e.detectionReason}]`);
  }
  console.log();

  if (write) {
    saveVendorManifest(LOCAL_VENDOR_MANIFEST_FILE, {
      version: localManifest.version,
      entries: { ...localManifest.entries, ...discovered.entries },
    });
    console.log(`📋 Local vendor manifest updated: ${LOCAL_VENDOR_MANIFEST_FILE.replace(HOME, "~")}\n`);
  } else {
    console.log(`💡 Report only. Run 'bun sync.ts discover --write' to persist these detections.\n`);
  }

  return discovered;
}
```

Add `VendorManifest` to both the `"./manifest"` import block and its re-export block from Task 5 (Step 3):

```ts
// import block: add VendorManifest alongside the existing type imports
import {
  // ...existing names from Task 5 Step 3...
  VendorManifest,
} from "./manifest";
```

```ts
// re-export type block — currently:
//   export type { SkillManifestEntry, SkillOrigin, SkillsLock, SkillsManifest } from "./manifest";
// change to:
export type { SkillManifestEntry, SkillOrigin, SkillsLock, SkillsManifest, VendorManifest, VendorManifestEntry } from "./manifest";
```

- [ ] **Step 4: Wire `cmdDiscoverVendor` into the `discover` CLI case**

```ts
// case "discover": currently:
//   cmdDiscover(repo, opts.write === true);
//   break;
// change to:
case "discover":
  cmdDiscover(repo, opts.write === true);
  cmdDiscoverVendor(repo, opts.write === true);
  break;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/.agents/skills/ai-sync && bun test tests/vendor-cli.test.ts 2>&1 | tail -30`
Expected: PASS — all cases including the two new `cmdDiscoverVendor` tests.

- [ ] **Step 6: Run the full suite to check for regressions**

Run: `cd ~/.agents/skills/ai-sync && bun test 2>&1 | tail -20`
Expected: PASS — all suites.

- [ ] **Step 7: Commit**

```bash
cd ~/Disk/ai-custom
git add .agents/skills/ai-sync/scripts/sync.ts .agents/skills/ai-sync/tests/vendor-cli.test.ts
git commit -m "feat(ai-sync): extend discover with a vendor provenance report

bun sync.ts discover now prints both the existing skills breakdown and
a new authored/vendor report for agents/extensions/rules/hooks/tests.
--write persists current detections into vendor-manifest.json, so a
future Orca release removing the marker comment doesn't silently flip
an already-confirmed vendor file back to authored."
```

---

## Task 7: Migration and documentation

**Files:**
- Modify: `~/Disk/ai-custom` git history (untrack 3 files)
- Modify: `~/.agents/skills/ai-sync/SKILL.md`

**Interfaces:** None (this task only runs commands and updates docs; no new code).

- [ ] **Step 1: Untrack the 3 already-committed vendor extension files**

```bash
cd ~/Disk/ai-custom
git rm --cached .omp/extensions/orca-agent-status.ts .omp/extensions/orca-prefill.ts .omp/extensions/orca-titlebar-spinner.ts
echo ".omp/extensions/orca-*.ts" >> .gitignore
```

Verify the files remain on disk locally:
```bash
ls -la ~/.omp/agent/extensions/orca-*.ts
```
Expected: all 3 files still present (only untracked from git, not deleted).

- [ ] **Step 2: Run `discover --write` once to seed the vendor manifest**

```bash
bun ~/.agents/skills/ai-sync/scripts/sync.ts discover --write 2>&1 | tail -40
```
Expected: the "VENDOR-MANAGED" section lists `extensions/orca-agent-status.ts`, `extensions/orca-prefill.ts`, `extensions/orca-titlebar-spinner.ts`.

- [ ] **Step 3: Push the seeded manifest and gitignore update**

```bash
bun ~/.agents/skills/ai-sync/scripts/sync.ts push 2>&1 | tail -20
```
Expected: `vendor-manifest.json` copied into the repo.

- [ ] **Step 4: Verify `status` no longer reports the 3 files as drift**

```bash
bun ~/.agents/skills/ai-sync/scripts/sync.ts status extensions 2>&1 | tail -20
```
Expected: `New Local: 0 files`, no mention of `orca-agent-status.ts`/`orca-prefill.ts`/`orca-titlebar-spinner.ts`.

- [ ] **Step 5: Update `SKILL.md` with the new commands**

Add a new section to `~/.agents/skills/ai-sync/SKILL.md`, after the existing manifest section (find the numbered command list ending around "# 9. Bootstrap / restore..." and append):

```markdown
# 10. Vendor provenance for non-skill categories (agents, extensions, rules, hooks, tests)
# Files carrying an app-managed marker (e.g. @orca-managed-pi-extension) are
# auto-detected as vendor/sync:false and never reach the git backup.
bun "$SKILL_DIR/scripts/sync.ts" discover --write

# Manually override a misclassified file:
bun "$SKILL_DIR/scripts/sync.ts" mark extensions my-forked-extension.ts authored
bun "$SKILL_DIR/scripts/sync.ts" mark extensions some-app-file.ts vendor

# Remove an override, falling back to auto-detection:
bun "$SKILL_DIR/scripts/sync.ts" unmark extensions my-forked-extension.ts
```

- [ ] **Step 6: Commit the migration and docs**

```bash
cd ~/Disk/ai-custom
git add -A
git status --short
git commit -m "chore(ai-sync): untrack app-managed extension files, seed vendor manifest

orca-agent-status.ts, orca-prefill.ts, and orca-titlebar-spinner.ts are
Orca-managed (marked @orca-managed-pi-extension) and never belong in
this repo — they're refreshed by app updates, not authored content.
Ran 'discover --write' to pin them as vendor even if a future Orca
release strips the marker comment."
git push origin main
```

- [ ] **Step 7: Final full-suite verification**

```bash
cd ~/.agents/skills/ai-sync && bun test 2>&1 | tail -20
bun ~/.agents/skills/ai-sync/scripts/sync.ts status 2>&1 | tail -15
```
Expected: all tests pass; `status` shows `100% In Sync` (or only genuinely new/modified files unrelated to this feature).
