import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

// Redact obvious secrets from tool output before they hit context/transcript.
// `keepPrefix: true` means the regex's one capture group is a prefix (`KEY=`,
// `Bearer `) to keep, with everything after it redacted; otherwise the whole
// match is replaced.
//
// The generic KEY=VALUE catch-all (first pattern) cannot reliably tell a
// secret literal from source code by shape alone - `password: someValue` is
// syntactically identical whether `someValue` is a real secret in a YAML
// config or a function call in TypeScript. Two defenses, not one:
//   1. A negative lookahead rejects `identifier(` right after the key - a
//      secret is never itself a function call (e.g. `resolveField(...)`).
//   2. `redact()` skips the generic pattern entirely for known source-code
//      file extensions when a path is available (see SOURCE_EXTENSIONS) -
//      committed source essentially never hardcodes a real secret literal,
//      but config/env/output text does. Vendor-format signatures (AWS,
//      GitHub, PEM, Bearer) stay active everywhere regardless of file type,
//      since those match by unambiguous structure, not by a nearby keyword.
const GENERIC_KEY_VALUE = {
  // Exclude count/metric keys like output_tokens, input_tokens, max_tokens, total_tokens, etc.
  re: /\b(?!(?:INPUT|OUTPUT|PROMPT|COMPLETION|TOTAL|MAX|WARMUP|ESTIMATED|REASONING|THINKING)[_-])([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|AUTH)[A-Za-z0-9_]*["']?\s*[:=]\s*["']?)(?![A-Za-z_][A-Za-z0-9_]*\()[^\s"'\n(),]{4,}/gi,
  keepPrefix: true,
};

const PATTERNS: { re: RegExp; keepPrefix: boolean }[] = [
  { re: /\bAKIA[0-9A-Z]{16}\b/g, keepPrefix: false }, // AWS access key ids
  { re: /(Bearer\s+)[A-Za-z0-9\-._~+/]{10,}=*/gi, keepPrefix: true }, // Authorization headers
  {
    // GitHub/GitLab tokens
    re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bglpat-[A-Za-z0-9\-_]{20,}\b/g,
    keepPrefix: false,
  },
  {
    // PEM private key blocks
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    keepPrefix: false,
  },
];

// Real hardcoded secrets don't live in reviewed source code; they live in
// config/env files, JSON/YAML, and command output. Gating the generic
// pattern out of these extensions removes the false-positive class this
// hook kept hitting (object keys/properties named password/token/secret).
const SOURCE_EXTENSIONS: Record<string, true> = {
  ts: true, tsx: true, js: true, jsx: true, mjs: true, cjs: true,
  py: true, go: true, rs: true, java: true, kt: true, swift: true,
  c: true, cc: true, cpp: true, h: true, hpp: true, rb: true, php: true, cs: true,
};

function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

// Replacement label makes it obvious the hook redacted the value, not that the
// tool literally emitted the string "[REDACTED]". Keeps short to avoid bloating output.
const REDACTED_LABEL = "[REDACTED:hook]";

/**
 * Exported for the regression fixture (test-redact.ts) - not just called
 * from the hook wiring below. `filePath`, when known (read/grep/glob always
 * carry one; bash does not), gates the generic pattern by extension.
 */
export function redact(text: string, filePath?: string): string {
  let out = text;
  const isSourceCode = filePath ? SOURCE_EXTENSIONS[extensionOf(filePath)] === true : false;
  const patterns = isSourceCode ? PATTERNS : [GENERIC_KEY_VALUE, ...PATTERNS];
  for (const { re, keepPrefix } of patterns) {
    out = out.replace(re, (match, prefix: string) =>
      keepPrefix ? `${prefix}${REDACTED_LABEL}` : REDACTED_LABEL,
    );
  }
  return out;
}

// Only scan tools that surface external/discovered content (files, search
// results, shell output). Skip write/edit tool results - that's the agent's
// own generated content, not something to auto-redact.
const READ_TOOLS: Record<string, true> = { read: true, grep: true, glob: true, bash: true };

export default function (pi: HookAPI): void {
  pi.on("tool_result", async (event) => {
    if (event.isError) return;
    if (!READ_TOOLS[event.toolName]) return;
    const filePath = typeof event.input?.path === "string" ? event.input.path : undefined;
    let changed = false;
    const content = event.content.map((chunk) => {
      if (chunk.type !== "text") return chunk;
      const text = redact(chunk.text, filePath);
      if (text !== chunk.text) changed = true;
      return { ...chunk, text };
    });
    if (changed) return { content };
  });
}
