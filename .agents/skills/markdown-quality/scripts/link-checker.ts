import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";

export interface BrokenLink {
  file: string;
  line: number;
  rawTarget: string;
  type: "file" | "anchor" | "url-syntax";
  reason: string;
}

export interface LinkCheckResult {
  totalLinks: number;
  brokenLinks: BrokenLink[];
}

/**
 * Extracts headings from a markdown document to validate internal anchor links #slug
 */
function extractHeadingAnchors(content: string): Set<string> {
  const anchors = new Set<string>();
  const lines = content.split("\n");
  let inCode = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      const headingText = headingMatch[1].trim();
      // GitHub-compatible anchor slugification
      const slug = headingText
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      anchors.add(slug);
    }
  }
  return anchors;
}

/**
 * Validates links inside a markdown file.
 * Handles relative file paths (e.g. `./other.md`, `../doc.md`), anchor references (`#section`),
 * and syntax checks.
 */
export function checkMarkdownLinks(filePath: string, fileContent?: string): LinkCheckResult {
  const content = fileContent ?? (existsSync(filePath) ? readFileSync(filePath, "utf-8") : "");
  const baseDir = dirname(resolve(filePath));
  const brokenLinks: BrokenLink[] = [];

  const localAnchors = extractHeadingAnchors(content);

  const lines = content.split("\n");
  let inCode = false;
  let totalLinks = 0;

  // Regex matching [text](target) while ignoring images ![alt](url) or code
  const linkRegex = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    const line = lines[lineNum - 1];

    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(line)) !== null) {
      const rawTarget = match[2].trim();
      totalLinks++;

      // Skip mailto or javascript links
      if (rawTarget.startsWith("mailto:") || rawTarget.startsWith("javascript:")) {
        continue;
      }

      // External HTTP/HTTPS links
      if (/^https?:\/\//i.test(rawTarget)) {
        try {
          new URL(rawTarget);
        } catch {
          brokenLinks.push({
            file: filePath,
            line: lineNum,
            rawTarget,
            type: "url-syntax",
            reason: "Malformed external URL",
          });
        }
        continue;
      }

      // Same-file anchor link: #section-name
      if (rawTarget.startsWith("#")) {
        const anchor = rawTarget.slice(1).toLowerCase();
        if (anchor && !localAnchors.has(anchor)) {
          brokenLinks.push({
            file: filePath,
            line: lineNum,
            rawTarget,
            type: "anchor",
            reason: `Anchor '#${anchor}' not found in document headings`,
          });
        }
        continue;
      }

      // Relative or absolute file path (may include #anchor)
      const [pathPart, anchorPart] = rawTarget.split("#");
      const targetPath = resolve(baseDir, pathPart);

      if (!existsSync(targetPath)) {
        brokenLinks.push({
          file: filePath,
          line: lineNum,
          rawTarget,
          type: "file",
          reason: `Target file does not exist: ${pathPart}`,
        });
      } else if (anchorPart) {
        try {
          const targetContent = readFileSync(targetPath, "utf-8");
          const targetAnchors = extractHeadingAnchors(targetContent);
          const slug = anchorPart.toLowerCase();
          if (!targetAnchors.has(slug)) {
            brokenLinks.push({
              file: filePath,
              line: lineNum,
              rawTarget,
              type: "anchor",
              reason: `Anchor '#${anchorPart}' not found in target file ${pathPart}`,
            });
          }
        } catch {}
      }
    }
  }

  return { totalLinks, brokenLinks };
}
