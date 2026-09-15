import { existsSync, readFileSync, statSync } from "fs";

export interface SecurityFinding {
  line: number;
  type: "leaked-secret" | "placeholder-token" | "dummy-ip";
  match: string;
  reason: string;
}

export interface SecurityCheckResult {
  totalFindings: number;
  findings: SecurityFinding[];
}

const SECRET_PATTERNS: Array<{
  regex: RegExp;
  type: "leaked-secret" | "placeholder-token" | "dummy-ip";
  reason: string;
}> = [
  {
    regex: /\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|glpat-[a-zA-Z0-9_-]{20,}|xox[baprs]-[a-zA-Z0-9_-]{10,})\b/,
    type: "leaked-secret",
    reason: "Live API key or token pattern detected",
  },
  {
    regex: /<[A-Z0-9_-]*(?:API_KEY|AUTH_TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[A-Z0-9_-]*>/i,
    type: "placeholder-token",
    reason: "Raw unescaped placeholder token (use config flags or env vars instead)",
  },
  {
    regex: /\b(?:password|passwd|secret)\s*[:=]\s*["'](?:123456|password|admin|secret|root)["']/i,
    type: "placeholder-token",
    reason: "Insecure hardcoded placeholder credential",
  },
  {
    regex: /\b1\.2\.3\.4\b/,
    type: "dummy-ip",
    reason: "Dummy IP '1.2.3.4' detected (prefer localhost/127.0.0.1 or example.com)",
  },
];

/**
 * Scans markdown content for leaked credentials, placeholder tokens, or dummy IPs.
 */
export function checkMarkdownSecurity(content: string): SecurityCheckResult {
  const lines = content.split("\n");
  const findings: SecurityFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of SECRET_PATTERNS) {
      const match = line.match(pattern.regex);
      if (match) {
        findings.push({
          line: i + 1,
          type: pattern.type,
          match: match[0],
          reason: pattern.reason,
        });
      }
    }
  }

  return {
    totalFindings: findings.length,
    findings,
  };
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
      throwErrorOnBrokenSymbolicLink: false,
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
      console.log(`Usage: security-check.ts [options] [glob-or-file]

Scans Markdown files for leaked credentials, placeholder tokens, and dummy IPs.

Arguments:
  [glob-or-file]     Target file or glob pattern (default: "**/*.md")

Options:
  -h, --help         Show this help message and exit

Examples:
  bun security-check.ts README.md
  bun security-check.ts "docs/**/*.md"`);
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
        const res = checkMarkdownSecurity(content);
        for (const finding of res.findings) {
          console.log(`[SECURITY] ${f}:${finding.line} -> ${finding.reason} ('${finding.match}')`);
        }
        totalIssues += res.findings.length;
      } catch {}
    }
  }

  if (totalIssues > 0) {
    console.log(`\nFound ${totalIssues} security finding(s).`);
    process.exit(1);
  } else {
    console.log("Clean: 0 security issues detected.");
    process.exit(0);
  }
}
