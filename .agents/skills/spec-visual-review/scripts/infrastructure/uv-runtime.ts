import * as fs from "node:fs";
import * as path from "node:path";
import type {
  RuntimeStatus,
  TranslatorRuntime,
} from "@/scripts/application/interfaces/translator-runtime";
import { ReviewError } from "@/scripts/domain/errors";
import { MODEL, PYTHON_VERSION, REVISION, type RuntimePaths } from "./runtime-config";

async function run(command: string[], env: Record<string, string>, failure: string): Promise<void> {
  const child = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...env },
  });
  const code = await child.exited;
  if (code !== 0) throw new ReviewError(`${failure} (exit ${code})`);
}

/** Installs the locked environment and model with `uv`. Only `install` touches the network. */
export class UvRuntime implements TranslatorRuntime {
  constructor(private readonly paths: RuntimePaths) {}

  async status(): Promise<RuntimeStatus> {
    const site = path.join(
      this.paths.environmentDir,
      "lib",
      `python${PYTHON_VERSION}`,
      "site-packages",
      "mlx_lm",
    );
    return {
      model: MODEL,
      revision: REVISION,
      modelPath: this.paths.modelDir,
      environmentPath: this.paths.environmentDir,
      uvInstalled: Bun.which("uv") !== null,
      environmentReady: fs.existsSync(site),
      modelCached: fs.existsSync(path.join(this.paths.modelDir, "model.safetensors")),
    };
  }

  async install(): Promise<void> {
    const env = { UV_PROJECT_ENVIRONMENT: this.paths.environmentDir };
    const project = ["--project", this.paths.skillDir, "--python", PYTHON_VERSION];
    await run(
      ["uv", "sync", "--frozen", ...project],
      env,
      "Could not create the Python environment",
    );
    await run(
      [
        "uv",
        "run",
        "--frozen",
        ...project,
        "python",
        this.paths.workerScript,
        "--mode",
        "download",
        "--model",
        MODEL,
        "--revision",
        REVISION,
      ],
      env,
      "Could not download the model",
    );
  }
}
