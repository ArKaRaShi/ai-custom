import type { Translator } from "@/scripts/application/interfaces/translator";
import { ReviewError } from "@/scripts/domain/errors";
import { MODEL, PYTHON_VERSION, REVISION, type RuntimePaths } from "./runtime-config";

/** Runs Typhoon Translate in the locked Python environment. Never downloads. */
export class PythonTranslator implements Translator {
  readonly model = `${MODEL}@${REVISION.slice(0, 8)}`;

  constructor(private readonly paths: RuntimePaths) {}

  async translate(texts: readonly string[], contexts?: readonly string[]): Promise<string[]> {
    const child = Bun.spawn(
      [
        "uv",
        "run",
        "--frozen",
        "--python",
        PYTHON_VERSION,
        "--project",
        this.paths.skillDir,
        "python",
        this.paths.workerScript,
        "--mode",
        "translate",
        "--model",
        MODEL,
        "--revision",
        REVISION,
      ],
      {
        stdin: new Blob([JSON.stringify({ texts, contexts })]),
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          UV_PROJECT_ENVIRONMENT: this.paths.environmentDir,
          HF_HUB_OFFLINE: "1",
        },
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) {
      const tail = stderr.trim().split("\n").slice(-4).join(" | ");
      throw new ReviewError(
        `Translator exited with ${code}: ${tail}`,
        "bun scripts/cli.ts setup --apply",
      );
    }
    const line = stdout.trim().split("\n").pop() ?? "";
    const parsed = JSON.parse(line) as { translations?: unknown };
    if (
      !Array.isArray(parsed.translations) ||
      parsed.translations.some((t) => typeof t !== "string")
    ) {
      throw new ReviewError("Translator returned an unexpected result");
    }
    return parsed.translations as string[];
  }
}
