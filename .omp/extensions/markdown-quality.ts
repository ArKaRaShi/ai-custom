import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";
import { homedir } from "os";
import { resolve } from "path";

const REVIEW_SCRIPT = resolve(
  homedir(),
  ".agents/skills/markdown-quality/scripts/review.ts",
);

interface FindingItem {
  category: string;
  text: string;
  severity: "error" | "warning";
}

interface MarkdownQualityMessageDetails {
  filePath: string;
  totalErrors: number;
  totalWarnings: number;
  items: FindingItem[];
}

function isPlanFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.includes("plan") ||
    lower.includes("/plans/") ||
    lower.endsWith(".plan.md")
  );
}

function extractPath(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  if (typeof input.path === "string") return input.path;
  if (typeof input.input === "string") {
    const match = input.input.match(/^\s*\[([^#\]]+)/m);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function renderTreeOutput(
  details: MarkdownQualityMessageDetails,
  expanded: boolean,
  theme: Theme,
): string {
  const { filePath, totalErrors, totalWarnings, items } = details;
  const isErr = totalErrors > 0;

  const headerIcon = isErr
    ? theme.styledSymbol("status.error", "error")
    : theme.styledSymbol("status.warning", "warning");

  const counts: string[] = [];
  if (totalErrors > 0) counts.push(`${totalErrors} error(s)`);
  if (totalWarnings > 0) counts.push(`${totalWarnings} warning(s)`);
  const summaryStr = counts.join(", ");

  let output = `${headerIcon} ${theme.fg("toolTitle", "Markdown Quality")} ${theme.fg("dim", `(${summaryStr})`)}`;

  const fileIcon = "\u{E609}"; // nf-md-language_markdown (Nerd Font)
  output += `\n ${theme.fg("dim", "└──")} ${fileIcon} ${theme.fg("accent", filePath)}`;

  const maxItems = expanded ? items.length : 5;
  const visible = items.slice(0, maxItems);

  for (let i = 0; i < visible.length; i++) {
    const item = visible[i];
    const isLast = i === visible.length - 1 && items.length <= maxItems;
    const branch = isLast ? "    └──" : "    ├──";

    const glyph =
      item.severity === "error"
        ? theme.styledSymbol("status.error", "error")
        : theme.styledSymbol("status.warning", "warning");

    const color = item.severity === "error" ? "error" : "warning";
    output += `\n ${theme.fg("dim", branch)} ${glyph} ${theme.fg(color, item.text)}`;
  }

  if (items.length > maxItems) {
    const remaining = items.length - maxItems;
    output += `\n ${theme.fg("dim", "    └──")} ${theme.fg("dim", `... ${remaining} more issue(s)`)}`;
  }
  return output;
}

export default function markdownQualityExtension(pi: ExtensionAPI): void {
  // Register custom visual message renderer for TUI
  pi.registerMessageRenderer(
    "markdown-quality",
    (message, { expanded }, theme) => {
      const details = message.details as MarkdownQualityMessageDetails | undefined;
      if (!details || !Array.isArray(details.items)) return undefined;
      const lines = renderTreeOutput(details, expanded, theme).split("\n");
      return {
        render: () => lines,
      };
    },
  );

  // Hook into tool results for write and edit
  pi.on("tool_result", async (event) => {
    if (event.isError) return;
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const rawInput =
      event.input && typeof event.input === "object"
        ? (event.input as Record<string, unknown>)
        : undefined;
    const rawPath = extractPath(rawInput);
    if (!rawPath) return;

    const targetPath = rawPath.startsWith("/")
      ? rawPath
      : resolve(process.cwd(), rawPath);

    if (!targetPath.endsWith(".md") || isPlanFile(targetPath)) return;

    try {
      const res = await pi.exec(
        "bun",
        [REVIEW_SCRIPT, targetPath, "--format=json"],
        { timeout: 10_000 },
      );

      if (!res.stdout || res.killed) return;

      const data: unknown = JSON.parse(res.stdout);
      if (!data || typeof data !== "object") return;

      const report = data as {
        status?: string;
        summary?: {
          totalErrors?: number;
          lintErrors?: number;
          valeErrors?: number;
          valeWarnings?: number;
          brokenLinks?: number;
          securityIssues?: number;
          structureIssues?: number;
        };
        findings?: Record<string, unknown>;
      };

      if (report.status === "clean" || !report.findings) return;

      const allItems: FindingItem[] = [];
      const findings = report.findings;

      for (const [category, items] of Object.entries(findings)) {
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (typeof item === "string" && item.trim().length > 0) {
            const isWarning = category === "warnings";
            allItems.push({
              category,
              text: item.trim(),
              severity: isWarning ? "warning" : "error",
            });
          }
        }
      }

      if (allItems.length === 0) return;

      const totalErrors =
        report.summary?.totalErrors ??
        allItems.filter((it) => it.severity === "error").length;
      const totalWarnings =
        report.summary?.valeWarnings ??
        allItems.filter((it) => it.severity === "warning").length;

      // 1. Send display message for native TUI interactive tree rendering
      await pi.sendMessage({
        customType: "markdown-quality",
        display: true,
        attribution: "agent",
        content: `Markdown quality findings for ${rawPath}`,
        details: {
          filePath: rawPath,
          totalErrors,
          totalWarnings,
          items: allItems,
        },
      });

      // 2. Return concise additionalContext so LLM knows what to fix in next turn
      const CAP = 5;
      const visible = allItems.slice(0, CAP).map((it) => `- ${it.category}: ${it.text}`);
      const remainingCount = allItems.length - CAP;

      const header =
        remainingCount > 0
          ? `Found ${allItems.length} issues (showing first ${CAP}):`
          : `Found ${allItems.length} issue(s):`;

      const lines = [
        `[markdown-quality: ${rawPath}]`,
        header,
        ...visible,
      ];

      if (remainingCount > 0) {
        lines.push(
          `...and ${remainingCount} more issue(s). See skill://markdown-quality to inspect and fix all issues.`,
        );
      }

      lines.push("Address these findings in your next edit.");

      return {
        additionalContext: lines.join("\n"),
      };
    } catch {
      // Fail open: never disrupt developer workflow on audit error
    }
  });
}
