import type {
  RuntimeStatus,
  TranslatorRuntime,
} from "@/scripts/application/interfaces/translator-runtime";
import { ReviewError } from "@/scripts/domain/errors";

export interface SetupRuntimeInput {
  apply: boolean;
}

export interface SetupRuntimeOutput {
  applied: boolean;
  /** Steps that remain, or that `apply` just ran. Empty when the machine is ready. */
  steps: string[];
  status: RuntimeStatus;
}

/** Prepares the local translator. Previews by default, because it downloads gigabytes. */
export class SetupRuntime {
  constructor(private readonly deps: { runtime: TranslatorRuntime }) {}

  async execute(input: SetupRuntimeInput): Promise<SetupRuntimeOutput> {
    const before = await this.deps.runtime.status();
    if (!before.uvInstalled) {
      throw new ReviewError("uv is not installed", "brew install uv");
    }
    const steps: string[] = [];
    if (!before.environmentReady) {
      steps.push(`create the locked Python environment at ${before.environmentPath}`);
    }
    if (!before.modelCached) {
      steps.push(`download ${before.model}@${before.revision.slice(0, 8)} (about 2.5 GB)`);
    }
    if (!input.apply || steps.length === 0) {
      return { applied: false, steps, status: before };
    }
    await this.deps.runtime.install();
    return { applied: true, steps, status: await this.deps.runtime.status() };
  }
}
