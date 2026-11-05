import { failureResult, SyncError } from "@/scripts/lib/plan";

/** Renders an error thrown by a command: a JSON envelope on stdout, or text on stderr. */
export function renderFailure(
  error: unknown,
  format: "tree" | "json" | undefined,
  operation: string,
): void {
  if (format === "json") {
    console.log(JSON.stringify(failureResult(operation, error), null, 2));
  } else if (error instanceof SyncError) {
    for (const item of error.errors) {
      console.error(`error ${item.code}${item.item ? ` [${item.item}]` : ""}: ${item.message}`);
    }
    if (error.recovery) console.error(`recovery: ${error.recovery}`);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
}
