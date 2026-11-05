import type { Result } from "@/scripts/lib/plan";

/** Machine-readable envelope, as printed for `--format=json`. */
export function printJson(result: Result): void {
  console.log(JSON.stringify(result, null, 2));
}

/** Errors and recovery text go to stderr after the human-readable tree. */
export function printErrors(result: Result): void {
  for (const error of result.errors) {
    console.error(`error ${error.code}${error.item ? ` [${error.item}]` : ""}: ${error.message}`);
  }
  if (result.recovery) console.error(`recovery: ${result.recovery}`);
}
