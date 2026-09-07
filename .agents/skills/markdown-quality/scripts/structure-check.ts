export interface StructureFinding {
  line: number;
  type: "deep-heading" | "orphan-heading" | "unrendered-latex";
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
  }

  return {
    totalFindings: findings.length,
    findings,
  };
}
