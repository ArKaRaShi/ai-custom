import type { AddRootOutput } from "@/scripts/application/use-cases/add-root";
import type { BindRootOutput } from "@/scripts/application/use-cases/bind-root";

export function renderAddRoot(output: AddRootOutput): void {
  console.log(`Added ${output.kind} root '${output.id}' at ${output.repoRoot}`);
}

export function renderBindRoot(output: BindRootOutput): void {
  console.log(`Bound root '${output.id}' to ${output.local}`);
}
