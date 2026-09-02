import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

// Redact obvious secrets from tool output before they hit context/transcript.
// Applies Gitleaks/TruffleHog best practices:
// 1. Unambiguous provider patterns (AWS, GitHub, Bearer, PEM, OpenAI/Anthropic keys)
// 2. Tightly scoped generic key=value patterns that avoid:
//    - Language type definitions (string, boolean, number, any, unknown)
//    - Common boolean / null primitives (true, false, null, undefined, none)
//    - Protocol identifiers (oauth2, basic, bearer, session)
//    - Metric & token count variables (prompt_tokens, total_tokens)
//    - Metadata keys (token_type, auth_method, auth_required, public_key)

const REDACTED_LABEL = "[REDACTED:hook]";

// Harmless value allowlist: true secrets are never language primitives or protocol keywords
const VALUE_ALLOWLIST: Record<string, true> = {
  true: true, false: true, null: true, undefined: true, none: true, nil: true,
  bearer: true, basic: true, oauth2: true, jwt: true, session: true,
  string: true, str: true, boolean: true, bool: true, int: true, number: true, float: true, object: true, any: true, unknown: true,
  required: true, optional: true, disabled: true, enabled: true, public: true, private: true, protected: true,
  authenticated: true, unauthenticated: true, authorized: true, unauthorized: true,
};

// Keys that are explicitly NOT secrets (metrics, types, public identifiers)
function isIgnoredKey(k: string): boolean {
  if (k === "tokens") return true;
  // Token count metrics
  if (/(?:total|prompt|input|output|cache|read|write|reasoning|thinking|max|count|warmup|estimated|nonmessage|ctx|context|cumulative|session)[_-]?tokens?/.test(k)) {
    return true;
  }
  if (/tokens?[_-]?(?:count|usage|total|consumed|spent|limit)/.test(k)) {
    return true;
  }
  // Common non-secret metadata keys
  if (/^(?:public[_-]?key|token[_-]?(?:type|format|count|len)|auth[_-]?(?:type|method|mode|status|required)|api[_-]?(?:version|url|endpoint|host))$/.test(k)) {
    return true;
  }
  return false;
}

// True secret assignment key pattern (aligned with Gitleaks generic-api-key)
function isSecretKey(k: string): boolean {
  return /(?:secret(?:_key)?|password|passwd|api[_-]?(?:key|token)|access[_-]?(?:key|token)|private[_-]?key|client[_-]?secret|auth[_-]?(?:token|secret|key|header)|refresh[_-]?token|bearer[_-]?token)/.test(k);
}

function redactGenericKeyValue(text: string): string {
  return text.replace(
    /\b([A-Za-z0-9_]*["']?\s*[:=]\s*["']?)(?![A-Za-z_][A-Za-z0-9_]*\()([^\s"'\n(),;}{]{4,})/g,
    (match, prefix: string, rawVal: string) => {
      const k = prefix.replace(/["'\s:=]/g, "").toLowerCase();
      if (isIgnoredKey(k)) return match;
      if (!isSecretKey(k)) return match;

      const cleanVal = rawVal.replace(/["',;]/g, "").toLowerCase();
      if (VALUE_ALLOWLIST[cleanVal]) return match;

      return `${prefix}${REDACTED_LABEL}`;
    },
  );
}

const PATTERNS: { re: RegExp; keepPrefix: boolean }[] = [
  { re: /\bAKIA[0-9A-Z]{16}\b/g, keepPrefix: false }, // AWS access key ids
  { re: /(Bearer\s+)[A-Za-z0-9\-._~+/]{16,}=*/gi, keepPrefix: true }, // Authorization headers
  {
    // GitHub / GitLab tokens
    re: /\bgh[pousr]_[A-Za-z0-9]{36}\b|\bglpat-[A-Za-z0-9\-_]{20,}\b/g,
    keepPrefix: false,
  },
  {
    // OpenAI / modern AI provider API keys (e.g. sk-proj-..., sk-live-...)
    re: /\bsk-(?:proj|live|ant)-[A-Za-z0-9_-]{20,}\b/g,
    keepPrefix: false,
  },
  {
    // PEM private key blocks
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    keepPrefix: false,
  },
  {
    // DB connection strings with embedded passwords (e.g. postgres://user:pass@host)
    re: /(:\/\/[^\s:@/]+:)[^\s:@/]+(@)/g,
    keepPrefix: false,
  },
];

// Gating generic key=value scanning out of known source-code extensions removes
// false positives on object properties or function params named password/token/secret.
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

export function redact(text: string, filePath?: string): string {
  let out = text;
  const isSourceCode = filePath ? SOURCE_EXTENSIONS[extensionOf(filePath)] === true : false;
  if (!isSourceCode) {
    out = redactGenericKeyValue(out);
  }
  for (const { re, keepPrefix } of PATTERNS) {
    out = out.replace(re, (match, p1: string, p2?: string) => {
      if (keepPrefix) return `${p1}${REDACTED_LABEL}`;
      if (p1 && p2) return `${p1}${REDACTED_LABEL}${p2}`; // connection string: keep user and @
      return REDACTED_LABEL;
    });
  }
  return out;
}

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
