import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface LifecycleState {
  schema_version: 1;
  manifest_digest: string;
  target?: string;
}

export async function writeLifecycleState(
  bundle: string,
  filename: string,
  manifestDigest: string,
  target?: string,
): Promise<void> {
  const state: LifecycleState = {
    schema_version: 1,
    manifest_digest: manifestDigest,
    ...(target === undefined ? {} : { target }),
  };
  await writeFile(join(bundle, filename), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function assertLifecycleState(
  bundle: string,
  filename: string,
  manifestDigest: string,
  target?: string,
): Promise<void> {
  let state: LifecycleState;
  try {
    state = JSON.parse(await readFile(join(bundle, filename), "utf8")) as LifecycleState;
  } catch (error) {
    throw new Error(`required lifecycle state is missing: ${filename}`);
  }
  if (state.schema_version !== 1 || state.manifest_digest !== manifestDigest) {
    throw new Error(`lifecycle state is stale: ${filename}`);
  }
  if (target !== undefined && state.target !== target) {
    throw new Error(`lifecycle state target mismatch: ${filename}`);
  }
}
