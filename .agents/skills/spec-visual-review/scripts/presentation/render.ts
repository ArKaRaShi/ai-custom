import type { CheckReviewOutput } from "@/scripts/application/use-cases/check-review";
import type { RenderReviewOutput } from "@/scripts/application/use-cases/render-review";
import type { RenderStagesOutput } from "@/scripts/application/use-cases/render-stages";
import type { SetupRuntimeOutput } from "@/scripts/application/use-cases/setup-runtime";
import type { TranslateSpecOutput } from "@/scripts/application/use-cases/translate-spec";
import type { Finding } from "@/scripts/domain/glossary";
import type { Command } from "./parse-args";

export const TOOL = "spec-visual-review";
const GROUP_CAP = 15;

export interface Fingerprint {
  command: Command;
  spec: string | null;
  store: string | null;
  mode: "preview" | "apply" | "read-only";
}

export type Outcome =
  | { command: "check"; result: CheckReviewOutput }
  | { command: "translate"; result: TranslateSpecOutput }
  | { command: "render"; result: RenderReviewOutput }
  | { command: "stages"; result: RenderStagesOutput }
  | { command: "setup"; result: SetupRuntimeOutput };

function capped(lines: readonly string[], verbose: boolean): string[] {
  if (verbose || lines.length <= GROUP_CAP) return [...lines];
  const hidden = lines.length - GROUP_CAP;
  return [
    ...lines.slice(0, GROUP_CAP),
    `... and ${hidden} more (run with --verbose or --format=json to list every item)`,
  ];
}

function findingLines(findings: readonly Finding[]): string[] {
  return findings.map((finding) => `${finding.id}: ${finding.reasons.join("; ")}`);
}

function bullets(title: string, lines: readonly string[], verbose: boolean): string[] {
  if (lines.length === 0) return [];
  return [`├─ ${title}`, ...capped(lines, verbose).map((line) => `│  └─ ${line}`)];
}

function checkRows(result: CheckReviewOutput, verbose: boolean): string[] {
  const chip = result.status === "complete" ? "✔ complete" : "✖ incomplete";
  return [
    `├─ status  ${chip}`,
    `├─ items   ${result.total} (${result.overrides} human overrides)`,
    ...bullets(`missing Thai (${result.missing.length})`, result.missing, verbose),
    ...bullets(`needs review (${result.findings.length})`, findingLines(result.findings), verbose),
  ];
}

function translateRows(result: TranslateSpecOutput, verbose: boolean): string[] {
  const state = result.applied
    ? `✔ translated ${result.translated}`
    : `preview only: ${result.missing.length} to translate (run with --apply)`;
  return [
    `├─ action  ${state}`,
    `├─ cached  ${result.cached} of ${result.total}`,
    ...bullets(`missing Thai (${result.missing.length})`, result.missing, verbose),
    ...bullets(`needs review (${result.findings.length})`, findingLines(result.findings), verbose),
  ];
}

function renderRows(result: RenderReviewOutput, verbose: boolean): string[] {
  const state = result.applied
    ? `✔ wrote ${result.outPath} (${result.bytes} bytes)`
    : `preview only: would write ${result.outPath} (${result.bytes} bytes; run with --apply)`;
  return [
    `├─ action  ${state}`,
    `├─ items   ${result.items}`,
    `├─ matrix  ${result.traceability ? "traceability included (inferred)" : "no links.json, matrix omitted"}`,
    ...bullets(`needs review (${result.flagged.length})`, result.flagged, verbose),
  ];
}

function stagesRows(result: RenderStagesOutput, verbose: boolean): string[] {
  const state = result.applied
    ? `✔ wrote ${result.outPath} (${result.bytes} bytes)`
    : `preview only: would write ${result.outPath} (${result.bytes} bytes; run with --apply)`;
  const stages = result.stages.map((stage) => `${stage.id}: ${stage.state}`);
  const pinned = result.applied ? "pinned in stages.json" : "would be pinned in stages.json";
  return [
    `├─ action  ${state}`,
    ...bullets(`stages (${stages.length})`, stages, verbose),
    ...(result.pinned.length > 0 ? [`├─ pinned  ${result.pinned.join(", ")} (${pinned})`] : []),
  ];
}

function setupRows(result: SetupRuntimeOutput): string[] {
  const status = result.status;
  const done =
    result.steps.length === 0 ? "✔ ready" : result.applied ? "✔ installed" : "preview only";
  return [
    `├─ status  ${done}`,
    `├─ model   ${status.model}@${status.revision.slice(0, 8)}`,
    `├─ path    ${status.modelPath}`,
    ...result.steps.map(
      (step) => `├─ step    ${step}${result.applied ? "" : " (run with --apply)"}`,
    ),
  ];
}

function rowsFor(outcome: Outcome, verbose: boolean): string[] {
  switch (outcome.command) {
    case "check":
      return checkRows(outcome.result, verbose);
    case "translate":
      return translateRows(outcome.result, verbose);
    case "render":
      return renderRows(outcome.result, verbose);
    case "stages":
      return stagesRows(outcome.result, verbose);
    case "setup":
      return setupRows(outcome.result);
  }
}

export function renderTree(outcome: Outcome, fingerprint: Fingerprint, verbose: boolean): string {
  const head = [
    `${TOOL}:${fingerprint.command} [${fingerprint.mode}]`,
    `├─ spec    ${fingerprint.spec ?? "-"}`,
    `├─ store   ${fingerprint.store ?? "-"}`,
  ];
  const rows = rowsFor(outcome, verbose);
  const last = rows.pop() ?? "";
  return [...head, ...rows, last.replace(/^├─/, "└─")].join("\n");
}

export function renderJson(outcome: Outcome, fingerprint: Fingerprint): string {
  return JSON.stringify({ status: "success", tool: TOOL, fingerprint, ...outcome }, null, 2);
}

export function renderErrorJson(message: string, recovery: string | undefined): string {
  return JSON.stringify({
    status: "error",
    tool: TOOL,
    error: message,
    recovery: recovery ?? null,
  });
}

export function renderErrorTree(message: string, recovery: string | undefined): string {
  const lines = [`${TOOL}`, `├─ status  ✖ failed`, `${recovery ? "├─" : "└─"} error   ${message}`];
  if (recovery) lines.push(`└─ fix     ${recovery}`);
  return lines.join("\n");
}
