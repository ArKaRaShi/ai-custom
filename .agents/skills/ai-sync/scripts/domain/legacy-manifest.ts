import { isJsonObject, type SkillMetadata, type UnifiedManifest } from "@/scripts/domain/manifest";

export type LegacySkill = SkillMetadata & { sync: boolean };

const SKILL_TEXT_FIELDS = ["source", "sourceType", "version", "install", "description"] as const;

/** Parses a version 1 skills manifest; `file` only names the source in error messages. */
export function parseLegacySkillEntries(text: string, file: string): Map<string, LegacySkill> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`Cannot read legacy skill manifest: ${file}`);
  }
  if (!isJsonObject(value) || value.version !== 1 || !isJsonObject(value.skills)) {
    throw new Error(`Invalid legacy skill manifest: ${file}`);
  }
  const entries = new Map<string, LegacySkill>();
  for (const [name, raw] of Object.entries(value.skills)) {
    if (
      !isJsonObject(raw) ||
      (raw.origin !== "authored" && raw.origin !== "external") ||
      typeof raw.sync !== "boolean"
    ) {
      throw new Error(`Invalid legacy skill entry: ${name}`);
    }
    const skill: LegacySkill = { origin: raw.origin, sync: raw.sync };
    for (const field of SKILL_TEXT_FIELDS) {
      const field_value = raw[field];
      if (field_value !== undefined) {
        if (typeof field_value !== "string") {
          throw new Error(`Invalid legacy skill ${field}: ${name}`);
        }
        skill[field] = field_value;
      }
    }
    entries.set(name, skill);
  }
  return entries;
}

/** Parses a version 1 path manifest and returns its raw rules. */
export function parseLegacyPathRules(text: string, file: string): unknown[] {
  let legacyPaths: unknown;
  try {
    legacyPaths = JSON.parse(text);
  } catch {
    throw new Error(`Cannot read legacy path manifest: ${file}`);
  }
  if (
    !isJsonObject(legacyPaths) ||
    legacyPaths.version !== 1 ||
    !Array.isArray(legacyPaths.rules)
  ) {
    throw new Error("Expected version 1 path manifest for migration");
  }
  return legacyPaths.rules;
}

/** Local skills overlaid with shared ones; the same skill with different metadata is a conflict. */
export function mergeLegacySkills(
  local: Map<string, LegacySkill>,
  shared: Map<string, LegacySkill>,
): Map<string, LegacySkill> {
  const skills = new Map(local);
  for (const [name, entry] of shared) {
    const localEntry = skills.get(name);
    if (localEntry && JSON.stringify(localEntry) !== JSON.stringify(entry)) {
      throw new Error(`Conflicting legacy metadata for skill '${name}'`);
    }
    skills.set(name, entry);
  }
  return skills;
}

/** The version 2 manifest equivalent to the legacy path rules and skills. */
export function buildMigratedManifest(
  rules: unknown[],
  skills: Map<string, LegacySkill>,
): UnifiedManifest {
  const manifest: UnifiedManifest = {
    version: 2,
    roots: {
      omp: { kind: "path", repoRoot: ".omp" },
      agents: { kind: "skill", repoRoot: ".agents/skills" },
    },
    entries: [],
  };
  for (const raw of rules) {
    if (
      !isJsonObject(raw) ||
      typeof raw.pattern !== "string" ||
      typeof raw.sync !== "boolean" ||
      !raw.pattern.startsWith(".omp/")
    ) {
      throw new Error(
        `Unsupported legacy path rule: ${isJsonObject(raw) ? String(raw.pattern) : "invalid rule"}`,
      );
    }
    manifest.entries.push({
      kind: "path",
      root: "omp",
      path: raw.pattern.slice(".omp/".length),
      sync: raw.sync,
    });
  }
  for (const [name, skill] of skills) {
    const { sync, ...metadata } = skill;
    manifest.entries.push({ kind: "skill", root: "agents", path: name, sync, skill: metadata });
  }
  return manifest;
}
