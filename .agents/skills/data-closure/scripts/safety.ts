import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface SafetyPlan {
  schema_version: 1;
  source: {
    access: "read_only";
    host_class: string;
  };
  target?: {
    host?: string;
    database?: string;
    class?: string;
  };
}

export interface TargetIdentity {
  host: string;
  database: string;
}

export function targetFingerprint(target: TargetIdentity): string {
  return `${target.host}/${target.database}`;
}

export function assertTargetSafety(target: TargetIdentity, confirmation?: string): void {
  const normalizedHost = target.host.trim().toLowerCase();
  if (["localhost", "127.0.0.1", "::1"].includes(normalizedHost)) {
    return;
  }
  const fingerprint = targetFingerprint(target);
  if (confirmation !== fingerprint) {
    throw new Error(`dangerous target requires --confirm-target ${fingerprint}`);
  }
}

export async function validateSafetyPlan(path: string): Promise<SafetyPlan> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`safety plan is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("safety plan must be a JSON object");
  }
  const candidate = value as Record<string, unknown>;
  const source = candidate.source;
  if (candidate.schema_version !== 1 || typeof source !== "object" || source === null) {
    throw new Error("safety plan schema_version must be 1 and include source");
  }
  const sourceRecord = source as Record<string, unknown>;
  if (sourceRecord.access !== "read_only") {
    throw new Error("source access must be read_only");
  }
  if (typeof sourceRecord.host_class !== "string" || sourceRecord.host_class.length === 0) {
    throw new Error("safety plan source.host_class must be a non-empty string");
  }
  const target = candidate.target;
  if (target !== undefined && (typeof target !== "object" || target === null)) {
    throw new Error("safety plan target must be an object when present");
  }
  const targetRecord = target as Record<string, unknown> | undefined;
  return {
    schema_version: 1,
    source: { access: "read_only", host_class: sourceRecord.host_class },
    ...(targetRecord === undefined ? {} : {
      target: {
        ...(typeof targetRecord.host === "string" ? { host: targetRecord.host } : {}),
        ...(typeof targetRecord.database === "string" ? { database: targetRecord.database } : {}),
        ...(typeof targetRecord.class === "string" ? { class: targetRecord.class } : {}),
      },
    }),
  };
}

export async function validateManualManifest(output: string): Promise<void> {
  const outputPath = resolve(output);
  const outputRoot = await realpath(outputPath);
  const manifestPath = resolve(outputPath, "manual-manifest.json");
  let value: unknown;
  try {
    value = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`manual manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("manual manifest must be a JSON object");
  }
  const candidate = value as Record<string, unknown>;
  const execution = candidate.execution;
  if (candidate.schema_version !== 1 || candidate.mode !== "manual" || typeof execution !== "object" || execution === null) {
    throw new Error("manual manifest must declare schema_version 1 and mode manual");
  }
  const executionRecord = execution as Record<string, unknown>;
  if (executionRecord.agent_must_not_execute !== true || executionRecord.user_executes !== true) {
    throw new Error("manual manifest must require user execution");
  }
  if (!Array.isArray(candidate.artifacts) || candidate.artifacts.length === 0) {
    throw new Error("manual manifest artifacts must be a non-empty array");
  }
  for (const entry of candidate.artifacts) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("manual manifest artifacts must contain objects");
    }
    const artifact = entry as Record<string, unknown>;
    if (typeof artifact.kind !== "string" || artifact.kind.length === 0 || typeof artifact.runtime !== "string" || artifact.runtime.length === 0 || typeof artifact.path !== "string" || artifact.path.length === 0 || isAbsolute(artifact.path)) {
      throw new Error("manual artifacts require kind, runtime, and a relative path");
    }
    const artifactPath = resolve(outputPath, artifact.path);
    const relativePath = relative(outputPath, artifactPath);
    if (relativePath.length === 0 || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      throw new Error(`manual artifact path escapes output: ${artifact.path}`);
    }
    let realArtifactPath: string;
    try {
      realArtifactPath = await realpath(artifactPath);
    } catch (error) {
      throw new Error(`manual artifact is missing: ${artifact.path}`);
    }
    const realRelativePath = relative(outputRoot, realArtifactPath);
    if (realRelativePath.length === 0 || realRelativePath === ".." || realRelativePath.startsWith(`..${sep}`)) {
      throw new Error(`manual artifact path escapes output: ${artifact.path}`);
    }
    if (!(await stat(realArtifactPath)).isFile()) {
      throw new Error(`manual artifact is missing: ${artifact.path}`);
    }
  }
}
