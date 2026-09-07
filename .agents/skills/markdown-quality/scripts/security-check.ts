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
