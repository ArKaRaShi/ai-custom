// ~/.omp/agent/hooks/post/redact-keys.ts
// Redacts secrets from tool output before the model sees them.
// Applies to every tool (read, bash, grep, eval, ...) — not just `read` —
// since `env`/`printenv`/`cat .env` surface secrets through `bash` output too.
import type { HookAPI } from '@oh-my-pi/pi-coding-agent/extensibility/hooks';

// Common secret shapes. Not exhaustive — add provider-specific entries below
// as new formats show up.
const SECRET_PATTERNS: RegExp[] = [
  // KEY=value / KEY: value style env assignments (the common case for `env`,
  // `printenv`, `.env` files, and config dumps).
  /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PWD|CREDENTIAL|API_KEY)[A-Z0-9_]*)\s*[:=]\s*["']?\S+["']?/g,
  // Generic API-key-shaped bearer tokens.
  /\b(sk|pk)-[a-zA-Z0-9_-]{16,}\b/g,
  // AWS access key IDs.
  /\bAKIA[A-Z0-9]{16}\b/g,
  // GitHub personal access tokens.
  /\bgh[pousr]_[a-zA-Z0-9]{36}\b/g,
  // Zhipu / GLM / SCGP LiteLLM style `<id>.<secret>` or `sk-ss-...` keys.
  /\bsk-ss-[a-zA-Z0-9]{16,}\b/g,
  /\b[a-zA-Z0-9]{16,}\.[a-zA-Z0-9]{16,}\b/g,
  // Bearer/Authorization headers.
  /\b(Bearer|Authorization:\s*Bearer)\s+[a-zA-Z0-9._-]{16,}\b/g,
  // DB connection strings with embedded credentials, e.g. postgres://user:pass@host
  /(:\/\/)[^\s:@/]+:[^\s:@/]+@/g,
];

function redact(text: string): { text: string; changed: boolean } {
  let changed = false;
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    const next = out.replace(pattern, (match, ...groups) => {
      // KEY=value pattern: keep the key name, redact only the value.
      if (typeof groups[0] === 'string' && match.includes('=')) {
        const eq = match.indexOf('=');
        return `${match.slice(0, eq + 1)}[REDACTED]`;
      }
      if (typeof groups[0] === 'string' && match.includes(':') && !match.includes('://')) {
        const sep = match.indexOf(':');
        return `${match.slice(0, sep + 1)} [REDACTED]`;
      }
      // Connection-string credentials: keep scheme, redact user:pass@.
      if (match.startsWith('://')) return '://[REDACTED]@';
      return '[REDACTED]';
    });
    if (next !== out) {
      changed = true;
      out = next;
    }
  }
  return { text: out, changed };
}

export default function redactSecrets(pi: HookAPI): void {
  pi.on('tool_result', (event) => {
    if (event.isError) return;

    let anyChanged = false;
    const content = event.content.map((chunk) => {
      if (chunk.type !== 'text') return chunk;
      const { text, changed } = redact(chunk.text);
      if (changed) anyChanged = true;
      return changed ? { ...chunk, text } : chunk;
    });

    if (anyChanged) return { content };
  });
}
