import { createHash } from "node:crypto";
import { createReadStream, type Stats } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface ManifestFile {
  path: string;
  kind: "base" | "supplement";
  rows: number;
  sha256: string;
  model?: string;
}

export interface ClosureManifest {
  schema_version: 1;
  run_id: string;
  source: string;
  files: ManifestFile[];
  natural_keys?: string[][];
}

export interface ValidatedManifest {
  manifest: ClosureManifest;
  digest: string;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export async function validateManifest(bundle: string): Promise<ValidatedManifest> {
  const manifestPath = resolve(bundle, "manifest.json");
  const raw = await Bun.file(manifestPath).text();
  const digest = createHash("sha256").update(raw).digest("hex");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof value !== "object" || value === null) {
    throw new Error("manifest must be a JSON object");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schema_version !== 1) {
    throw new Error("manifest schema_version must be 1");
  }
  if (typeof candidate.run_id !== "string" || candidate.run_id.length === 0) {
    throw new Error("manifest run_id must be a non-empty string");
  }
  if (typeof candidate.source !== "string" || candidate.source.length === 0) {
    throw new Error("manifest source must be a non-empty string");
  }
  if (!Array.isArray(candidate.files) || candidate.files.length === 0) {
    throw new Error("manifest files must be a non-empty array");
  }
  let naturalKeys: string[][] | undefined;
  if (candidate.natural_keys !== undefined) {
    const value = candidate.natural_keys;
    if (!Array.isArray(value) || value.some((key) => !Array.isArray(key) || key.length === 0 || key.some((field) => typeof field !== "string" || field.length === 0))) {
      throw new Error("manifest natural_keys must contain non-empty string arrays");
    }
    naturalKeys = value as string[][];
  }
  const bundleRoot = await realpath(resolve(bundle));


  const files: ManifestFile[] = [];
  const paths = new Set<string>();
  for (const entry of candidate.files) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("manifest files entries must be objects");
    }
    const file = entry as Record<string, unknown>;
    if (typeof file.path !== "string" || file.path.length === 0 || isAbsolute(file.path)) {
      throw new Error("manifest file paths must be non-empty relative paths");
    }
    const filePath = resolve(bundle, file.path);
    const relativePath = relative(resolve(bundle), filePath);
    if (relativePath.length === 0 || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      throw new Error(`manifest file path escapes bundle: ${file.path}`);
    }
    if (paths.has(relativePath)) {
      throw new Error(`manifest contains duplicate file path: ${file.path}`);
    }
    paths.add(relativePath);
    if (file.kind !== "base" && file.kind !== "supplement") {
      throw new Error(`manifest file kind must be base or supplement: ${file.path}`);
    }
    if (typeof file.rows !== "number" || !Number.isSafeInteger(file.rows) || file.rows < 0) {
      throw new Error(`manifest rows must be a non-negative integer: ${file.path}`);
    }
    if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error(`manifest sha256 must be a lowercase SHA-256 value: ${file.path}`);
    }
    let realFilePath: string;
    try {
      realFilePath = await realpath(filePath);
    } catch (error) {
      throw new Error(`manifest file is missing: ${file.path} (${error instanceof Error ? error.message : String(error)})`);
    }
    const realRelativePath = relative(bundleRoot, realFilePath);
    if (realRelativePath.length === 0 || realRelativePath === ".." || realRelativePath.startsWith(`..${sep}`)) {
      throw new Error(`manifest file path escapes bundle: ${file.path}`);
    }
    let info: Stats;
    try {
      info = await stat(realFilePath);
    } catch (error) {
      throw new Error(`manifest file is missing: ${file.path} (${error instanceof Error ? error.message : String(error)})`);
    }
    if (!info.isFile()) {
      throw new Error(`manifest path is not a regular file: ${file.path}`);
    }
    const actualHash = await sha256File(realFilePath);
    if (actualHash !== file.sha256) {
      throw new Error(`manifest SHA-256 mismatch: ${file.path}`);
    }
    files.push({
      path: file.path,
      kind: file.kind,
      rows: file.rows,
      sha256: file.sha256,
      ...(typeof file.model === "string" ? { model: file.model } : {}),
    });
  }

  const manifest: ClosureManifest = {
    schema_version: 1,
    run_id: candidate.run_id,
    source: candidate.source,
    files,
    ...(naturalKeys === undefined ? {} : { natural_keys: naturalKeys }),
  };
  return { manifest, digest };
}
