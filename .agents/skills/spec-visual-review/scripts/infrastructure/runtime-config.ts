import * as os from "node:os";
import * as path from "node:path";

/** Model that translates English review text into Thai, pinned to one downloaded revision. */
export const MODEL = "typhoon-ai/typhoon-translate-4b-mlx-4bit";
export const REVISION = "2bd2fa4c727739403bb5a32e5839110de911d901";
export const PYTHON_VERSION = "3.12";

export interface RuntimePaths {
  skillDir: string;
  /** Locked Python environment. Kept outside the skill so ai-sync never carries it. */
  environmentDir: string;
  /** Folder holding the model weights for the pinned revision. */
  modelDir: string;
  workerScript: string;
}

/** Same cache lookup order as `huggingface_hub`: HF_HUB_CACHE, then HF_HOME, then the default. */
export function resolveHubCache(env: NodeJS.ProcessEnv, home: string): string {
  if (env.HF_HUB_CACHE) return env.HF_HUB_CACHE;
  if (env.HF_HOME) return path.join(env.HF_HOME, "hub");
  return path.join(home, ".cache", "huggingface", "hub");
}

export function resolvePaths(skillDir: string, env: NodeJS.ProcessEnv = process.env): RuntimePaths {
  const home = os.homedir();
  const cacheRoot = env.XDG_CACHE_HOME ?? path.join(home, ".cache");
  const repoFolder = `models--${MODEL.replace("/", "--")}`;
  return {
    skillDir,
    environmentDir: path.join(cacheRoot, "spec-visual-review", "venv"),
    modelDir: path.join(resolveHubCache(env, home), repoFolder, "snapshots", REVISION),
    workerScript: path.join(skillDir, "scripts", "infrastructure", "typhoon_worker.py"),
  };
}
