import { existsSync, readFileSync, statSync } from "fs";

export interface StructureFinding {
  line: number;
  type: "deep-heading" | "orphan-heading" | "unrendered-latex" | "index-line-drift" | "index-missing-heading";
  match: string;
  reason: string;
}

export interface StructureCheckResult {
  totalFindings: number;
  findings: StructureFinding[];
}

/**
 * Checks document structure for deep headings (H5/H6), orphan headings, and raw unrendered LaTeX.
 */
export function checkMarkdownStructure(content: string): StructureCheckResult {
  const lines = content.split("\n");
  const findings: StructureFinding[] = [];

  // Pre-scan actual H2 headings (outside code blocks) to verify index line numbers
  const actualH2Headings = new Map<string, number>();
  let inCodeScan = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      inCodeScan = !inCodeScan;
      continue;
    }
    if (inCodeScan) continue;
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      actualH2Headings.set(h2Match[1].trim(), i + 1);
    }
  }
  let inCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    // 1. Heading Depth Cap: Flag H5 and H6 (##### and ######)
    const deepHeadingMatch = line.match(/^(#{5,6})\s+(.+)$/);
    if (deepHeadingMatch) {
      findings.push({
        line: i + 1,
        type: "deep-heading",
        match: line.trim(),
        reason: `Deep heading level ${deepHeadingMatch[1].length} (max recommended is H4)`,
      });
    }

    // 2. Orphan Heading: A heading followed immediately by another heading without body text
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      let nextContentLine: string | null = null;
      let nextLineIndex = i + 1;

      while (nextLineIndex < lines.length) {
        const next = lines[nextLineIndex].trim();
        if (next.length > 0) {
          nextContentLine = next;
          break;
        }
        nextLineIndex++;
      }

      if (nextContentLine && /^#{1,6}\s+/.test(nextContentLine)) {
        findings.push({
          line: i + 1,
          type: "orphan-heading",
          match: line.trim(),
          reason: `Orphan heading with 0 body lines before next heading '${nextContentLine}'`,
        });
      }
    }

    // 3. Unrendered LaTeX in standard markdown text (e.g. $\alpha$ or \begin{aligned})
    const latexMatch = line.match(/\$[a-zA-Z0-9_\\]+\$|\\begin\{[a-z]+\}/i);
    if (latexMatch) {
      findings.push({
        line: i + 1,
        type: "unrendered-latex",
        match: latexMatch[0],
        reason: "Unrendered inline LaTeX syntax detected in standard prose",
      });
    }

    // 4. Index Line Drift Check: Verify index tables in lines 1-35
    if (i < 35) {
      const stripped = line.replace(/^>\s*/, "").trim();
      const rowMatch = stripped.match(/^\|\s*([^|]+?)\s*\|\s*L(\d+)(?:[–-]L?(\d+))?\s*\|\s*([^|]+?)\s*\|/);
      if (rowMatch) {
        const title = rowMatch[1].trim();
        if (title !== "Section" && !title.startsWith(":")) {
          const claimedStart = parseInt(rowMatch[2], 10);
          const actualStart = actualH2Headings.get(title);
          if (actualStart === undefined) {
            findings.push({
              line: i + 1,
              type: "index-missing-heading",
              match: line.trim(),
              reason: `Index lists section '${title}', but no matching '## ${title}' exists in the document`,
            });
          } else if (actualStart !== claimedStart) {
            findings.push({
              line: i + 1,
              type: "index-line-drift",
              match: line.trim(),
              reason: `Section '${title}' claims L${claimedStart}, but actual heading is at line ${actualStart}`,
            });
          }
        }
      }
    }
  }

  return {
    totalFindings: findings.length,
    findings,
  };
}

/**
 * Recalculates exact heading line ranges in lines 1-35 index tables and updates them in place.
 */
export function fixIndexLineRanges(content: string): { updated: boolean; content: string } {
  const lines = content.split("\n");
  const headings: Array<{ line: number; title: string }> = [];
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      headings.push({ line: i + 1, title: h2Match[1].trim() });
    }
  }

  if (headings.length === 0) return { updated: false, content };

  const rangeMap: Record<string, string> = {};
  for (let idx = 0; idx < headings.length; idx++) {
    const h = headings[idx];
    const nextLine = idx < headings.length - 1 ? headings[idx + 1].line - 1 : lines.length;
    rangeMap[h.title] = `L${h.line}-L${nextLine}`;
  }

  let updated = false;
  for (let i = 0; i < Math.min(35, lines.length); i++) {
    const raw = lines[i];
    const stripped = raw.replace(/^>\s*/, "").trim();
    const match = stripped.match(/^\|\s*([^|]+?)\s*\|\s*(L\d+[–-]L?\d+)\s*\|\s*([^|]+?)\s*\|/);
    if (match) {
      const title = match[1].trim();
      if (rangeMap[title]) {
        const correctRange = rangeMap[title];
        if (match[2] !== correctRange) {
          lines[i] = raw.replace(match[2], correctRange);
          updated = true;
        }
      }
    }
  }

  return { updated, content: lines.join("\n") };
}
function resolveFiles(pattern: string): string[] {
  if (existsSync(pattern) && statSync(pattern).isFile()) {
    return [pattern];
  }
  try {
    const glob = new Bun.Glob(pattern);
    const files: string[] = [];
    for (const file of glob.scanSync({
      cwd: process.cwd(),
      onlyFiles: true,
      throwErrorOnBrokenSymlink: false,
    })) {
      if (
        !file.startsWith("node_modules/") &&
        !file.startsWith(".git/") &&
        !file.startsWith("dist/") &&
        !file.startsWith("build/")
      ) {
        files.push(file);
      }
    }
    return files.length > 0 ? files : [pattern];
  } catch {
    return [pattern];
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  let target = "**/*.md";

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      console.log(`Usage: structure-check.ts [options] [glob-or-file]

Validates Markdown heading hierarchy (caps at H4, detects orphan headings, flags unrendered LaTeX).

Arguments:
  [glob-or-file]     Target file or glob pattern (default: "**/*.md")

Options:
  -h, --help         Show this help message and exit

Examples:
  bun structure-check.ts README.md
  bun structure-check.ts "docs/**/*.md"`);
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      target = arg;
    }
  }

  const files = resolveFiles(target);
  let totalIssues = 0;
  for (const f of files) {
    if (existsSync(f) && statSync(f).isFile()) {
      try {
        const content = readFileSync(f, "utf-8");
        const res = checkMarkdownStructure(content);
        for (const finding of res.findings) {
          console.log(`[STRUCT] ${f}:${finding.line} -> ${finding.reason}`);
        }
        totalIssues += res.findings.length;
      } catch {}
    }
  }

  if (totalIssues > 0) {
    console.log(`\nFound ${totalIssues} structure finding(s).`);
    process.exit(1);
  } else {
    console.log("Clean: 0 structure issues detected.");
    process.exit(0);
  }
}
