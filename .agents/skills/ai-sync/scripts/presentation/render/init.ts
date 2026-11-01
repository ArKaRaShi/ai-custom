import type { InitRepositoryOutput } from "@/scripts/application/use-cases/init-repository";

export function renderInit(output: InitRepositoryOutput): void {
  if (!output.created) {
    console.log(`Unified manifest already exists with ${output.rootCount} root(s).`);
    return;
  }
  console.log(`Initialized unified manifest at ${output.manifestFile}`);
}
