/**
 * Layer guard for Tier 1 skills. Usage: `bun scripts/layer-guard.ts <skill>/scripts`.
 * Exit 1 and one `✖ file:line rule: message` per violation, or `✔ layers ok`.
 *
 * Enforced convention, not proof of purity. Detected syntax: `import` and `export ... from` in all
 * static forms (default, namespace, braces, `type` and inline `type` modifiers, multiline, comments
 * between tokens), `import("literal")` and `require("literal")`. NOT detected: computed specifiers,
 * `globalThis["process"]`, aliases of banned globals (`const p = process` is caught at `process`,
 * `const g = globalThis` is not), regex literals containing quotes, and tsconfig path aliases other
 * than `@/` (mapped to the skill root).
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type Layer = "domain" | "interfaces" | "services" | "use-cases" | "infrastructure" | "presentation";
export type ImportKind = "runtime" | "type-only";
export interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

const BOTH: readonly ImportKind[] = ["runtime", "type-only"];
/** source layer -> target layer -> allowed import kinds. Same-layer imports are allowed unless listed. */
export const ALLOWED_EDGES: Readonly<Record<Layer, Readonly<Partial<Record<Layer, readonly ImportKind[]>>>>> = {
  domain: {},
  interfaces: { domain: BOTH },
  services: { domain: BOTH, interfaces: BOTH },
  "use-cases": { domain: BOTH, interfaces: BOTH, services: BOTH, "use-cases": ["type-only"] },
  infrastructure: { domain: BOTH, interfaces: BOTH },
  presentation: { domain: BOTH, "use-cases": ["type-only"] },
};

type Tok = { t: "id" | "str" | "p"; v: string; line: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const marks: number[] = [];
  let depth = 0;
  let line = 1;
  let i = 0;
  const template = (): void => {
    while (i < src.length) {
      const c = src[i] ?? "";
      if (c === "\\") i += 2;
      else if (c === "`") {
        i++;
        return;
      } else if (c === "$" && src[i + 1] === "{") {
        i += 2;
        marks.push(depth);
        depth++;
        return;
      } else {
        if (c === "\n") line++;
        i++;
      }
    }
  };
  while (i < src.length) {
    const c = src[i] ?? "";
    if (c === "\n") {
      line++;
      i++;
    } else if (/\s/.test(c)) i++;
    else if (c === "/" && src[i + 1] === "/") while (i < src.length && src[i] !== "\n") i++;
    else if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i += 2;
    } else if (c === '"' || c === "'") {
      const start = line;
      let v = "";
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") {
          v += src[i + 1] ?? "";
          i += 2;
        } else {
          if (src[i] === "\n") line++;
          v += src[i];
          i++;
        }
      }
      i++;
      out.push({ t: "str", v, line: start });
    } else if (c === "`") {
      i++;
      template();
    } else if (/[A-Za-z_$]/.test(c)) {
      let v = "";
      while (i < src.length && /[\w$]/.test(src[i] ?? "")) v += src[i++];
      out.push({ t: "id", v, line });
    } else {
      if (c === "{") depth++;
      if (c === "}") {
        depth--;
        if (marks.length && marks[marks.length - 1] === depth) {
          marks.pop();
          i++;
          template();
          continue;
        }
      }
      out.push({ t: "p", v: c, line });
      i++;
    }
  }
  return out;
}

interface Imp {
  spec: string;
  kind: ImportKind;
  line: number;
}

function matching(toks: Tok[], open: number): number {
  const pair: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const o = toks[open]?.v ?? "";
  const close = pair[o] ?? "";
  let d = 0;
  for (let j = open; j < toks.length; j++) {
    if (toks[j]?.t !== "p") continue;
    if (toks[j]?.v === o) d++;
    else if (toks[j]?.v === close && --d === 0) return j;
  }
  return toks.length - 1;
}

/** True when every specifier inside `{ ... }` carries a `type` modifier (and the list is non-empty). */
function allInlineType(toks: Tok[], open: number, close: number): boolean {
  let count = 0;
  let typed = 0;
  let j = open + 1;
  while (j < close) {
    count++;
    const a = toks[j];
    const b = toks[j + 1];
    if (a?.t === "id" && a.v === "type" && b?.t === "id" && b.v !== "as") typed++;
    while (j < close && toks[j]?.v !== ",") j++;
    j++;
  }
  return count > 0 && count === typed;
}

function parseImports(toks: Tok[]): Imp[] {
  const imps: Imp[] = [];
  const isDot = (k: number): boolean => toks[k - 1]?.v === "." && toks[k - 1]?.t === "p";
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (!tk || tk.t !== "id" || isDot(k)) continue;
    const n1 = toks[k + 1];
    if (tk.v === "require" || (tk.v === "import" && n1?.v === "(")) {
      const lit = toks[k + 2];
      if (n1?.v === "(" && lit?.t === "str" && toks[k + 3]?.v === ")") imps.push({ spec: lit.v, kind: "runtime", line: tk.line });
      continue;
    }
    if (tk.v !== "import" && tk.v !== "export") continue;
    if (tk.v === "import" && n1?.t === "str") {
      imps.push({ spec: n1.v, kind: "runtime", line: tk.line });
      continue;
    }
    let j = k + 1;
    let typeOnly = false;
    if (n1?.t === "id" && n1.v === "type" && !(toks[k + 2]?.t === "id" && toks[k + 2]?.v === "from" && toks[k + 3]?.t === "str")) {
      typeOnly = true;
      j++;
    }
    let braces: [number, number] | undefined;
    let plain = false;
    while (j < toks.length) {
      const x = toks[j];
      if (!x) break;
      if (x.t === "id" && x.v === "from" && toks[j + 1]?.t === "str") break;
      if (x.t === "p" && x.v === "{") {
        const c = matching(toks, j);
        braces = [j, c];
        j = c + 1;
        continue;
      }
      if (x.t === "p" && (x.v === ";" || x.v === "=" || x.v === "(")) {
        j = toks.length;
        break;
      }
      if (x.t === "id" && !["as", "type"].includes(x.v) && !braces) plain = true;
      if (x.t === "id" && tk.v === "import" && x.v !== "as" && x.v !== "type" && !braces) plain = true;
      j++;
    }
    const from = toks[j];
    const spec = toks[j + 1];
    if (!(from?.v === "from" && spec?.t === "str")) continue;
    let kind: ImportKind = typeOnly ? "type-only" : "runtime";
    if (!typeOnly && braces && !plain && allInlineType(toks, braces[0], braces[1])) kind = "type-only";
    imps.push({ spec: spec.v, kind, line: tk.line });
  }
  return imps;
}

const PRESENTATION_IO: Record<string, true> = { fs: true, "fs/promises": true, child_process: true, http: true, https: true, net: true, dns: true, tls: true, worker_threads: true, cluster: true, zlib: true, bun: true, "bun:sqlite": true, "bun:ffi": true };
const PURE_BARE: Record<string, true> = { path: true, crypto: true };
const PURE_LAYERS: readonly Layer[] = ["domain", "interfaces", "services", "use-cases"];

function layerOf(rel: string): Layer | "root" | undefined {
  const s = rel.split(path.sep).join("/");
  if (s === "cli.ts") return "root";
  if (s.startsWith("domain/")) return "domain";
  if (s.startsWith("application/interfaces/")) return "interfaces";
  if (s.startsWith("application/services/")) return "services";
  if (s.startsWith("application/use-cases/")) return "use-cases";
  if (s.startsWith("infrastructure/")) return "infrastructure";
  if (s.startsWith("presentation/")) return "presentation";
  return undefined;
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...walk(full));
    else if (e.name.endsWith(".ts")) found.push(full);
  }
  return found.sort();
}

function resolveSpec(spec: string, from: string, scriptsDir: string): string | undefined {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(path.dirname(scriptsDir), spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return undefined;
  for (const c of [base, `${base}.ts`, path.join(base, "index.ts")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return undefined;
}

const GLOBALS = ["process", "Bun", "fetch", "console", "randomUUID", "randomBytes"];

function checkGlobals(toks: Tok[], layer: Layer, rel: string, out: Violation[]): void {
  const banned = layer === "presentation" ? ["fetch", "Bun"] : GLOBALS;
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (!tk || tk.t !== "id") continue;
    const qualified = toks[k - 1]?.v === "." && toks[k - 1]?.t === "p";
    if (qualified) {
      const owner = toks[k - 2];
      const entropy = tk.v === "randomUUID" || tk.v === "randomBytes";
      if (layer !== "presentation" && entropy && owner?.t === "id" && owner.v === "crypto") {
        out.push({ file: rel, line: tk.line, rule: "no-banned-global", message: `'crypto.${tk.v}' is not allowed in ${layer}; pass it in as a parameter or move it to infrastructure` });
      }
      continue;
    }
    let hit: string | undefined;
    if (banned.includes(tk.v)) hit = tk.v;
    else if (layer !== "presentation" && tk.v === "Date" && toks[k - 1]?.v === "new") hit = "new Date";
    else if (layer !== "presentation" && tk.v === "Date" && toks[k + 1]?.v === "." && toks[k + 2]?.v === "now") hit = "Date.now";
    else if (layer !== "presentation" && tk.v === "Math" && toks[k + 1]?.v === "." && toks[k + 2]?.v === "random") hit = "Math.random";
    if (hit) out.push({ file: rel, line: tk.line, rule: "no-banned-global", message: `'${hit}' is not allowed in ${layer}; pass it in as a parameter or move it to infrastructure` });
  }
}

const MODIFIERS: Record<string, true> = { public: true, private: true, protected: true, static: true, readonly: true, async: true, abstract: true, override: true, get: true, set: true, declare: true };

function useCaseShape(toks: Tok[], rel: string, out: Violation[]): void {
  const classes: number[] = [];
  for (let k = 0; k < toks.length; k++) {
    if (toks[k]?.v !== "export" || toks[k]?.t !== "id") continue;
    let j = k + 1;
    if (toks[j]?.v === "default") j++;
    if (toks[j]?.v === "abstract") j++;
    if (toks[j]?.v === "class") classes.push(j);
  }
  if (classes.length !== 1) {
    out.push({ file: rel, line: toks[classes[1] ?? 0]?.line ?? 1, rule: "use-case-shape", message: `expected exactly one exported class, found ${classes.length}` });
    return;
  }
  let open = (classes[0] ?? 0) + 1;
  while (open < toks.length && toks[open]?.v !== "{") open++;
  const close = matching(toks, open);
  const names = new Set<string>();
  let j = open + 1;
  while (j < close) {
    let isPrivate = false;
    while (toks[j]?.t === "id" && MODIFIERS[toks[j]?.v ?? ""] === true && toks[j + 1]?.v !== "(") {
      if (toks[j]?.v === "private") isPrivate = true;
      j++;
    }
    if (toks[j]?.v === "*") j++;
    if (toks[j]?.v === "#") {
      isPrivate = true;
      j++;
    }
    let name = toks[j]?.v ?? "";
    if (toks[j]?.v === "[") {
      j = matching(toks, j);
      name = "[computed]";
    }
    const startLine = toks[j]?.line ?? 1;
    j++;
    while (toks[j]?.v === "?" || toks[j]?.v === "!") j++;
    if (toks[j]?.v === "<") {
      let d = 0;
      while (j < close) {
        if (toks[j]?.v === "<") d++;
        if (toks[j]?.v === ">" && --d === 0) break;
        j++;
      }
      j++;
    }
    if (toks[j]?.v === "(") {
      if (name !== "constructor" && !isPrivate) names.add(name);
      j = matching(toks, j) + 1;
      while (j < close && toks[j]?.v !== "{" && toks[j]?.v !== ";") j++;
      j = toks[j]?.v === "{" ? matching(toks, j) + 1 : j + 1;
      if (names.size > 1) out.push({ file: rel, line: startLine, rule: "use-case-shape", message: `public method '${name}' found; only 'execute' may be public` });
    } else {
      let d = 0;
      let prev = toks[j - 1];
      while (j < close) {
        const x = toks[j];
        if (!x) break;
        if (x.t === "p" && "([{".includes(x.v)) d++;
        if (x.t === "p" && ")]}".includes(x.v)) d--;
        if (d === 0 && x.v === ";") {
          j++;
          break;
        }
        if (d === 0 && prev && x.line > prev.line && !["=", ",", ":", "|", "&", "?", "=>", "+", "-", "*", "/", "<", ">", "."].includes(prev.v)) break;
        prev = x;
        j++;
      }
    }
  }
  const publicNames = [...names];
  if (publicNames.length === 0 || (publicNames.length === 1 && publicNames[0] !== "execute")) {
    out.push({ file: rel, line: toks[classes[0] ?? 0]?.line ?? 1, rule: "use-case-shape", message: `use case must expose exactly one public method named 'execute', found ${publicNames.length ? publicNames.join(", ") : "none"}` });
  }
}

export function checkLayers(scriptsDir: string): Violation[] {
  const root = path.resolve(scriptsDir);
  const out: Violation[] = [];
  const graph = new Map<string, { to: string; line: number }[]>();
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const layer = layerOf(rel);
    if (!layer) continue;
    const toks = tokenize(fs.readFileSync(file, "utf8"));
    if (layer !== "root") {
      if (layer !== "infrastructure") checkGlobals(toks, layer, rel, out);
      if (layer === "use-cases" && !/(^|\/)(types|[^/]+\.types)\.ts$/.test(rel)) useCaseShape(toks, rel, out);
    }
    for (const imp of parseImports(toks)) {
      const bare = imp.spec.startsWith("node:") ? imp.spec.slice(5) : imp.spec;
      if (!imp.spec.startsWith(".") && !imp.spec.startsWith("@/")) {
        const restricted = PURE_LAYERS.includes(layer as Layer);
        const bad = restricted ? PURE_BARE[bare] !== true : layer === "presentation" ? PRESENTATION_IO[bare] === true : false;
        if (bad) out.push({ file: rel, line: imp.line, rule: "no-io-import", message: `'${imp.spec}' is not allowed in ${layer}; ${restricted ? "only path and crypto are allowed" : "do I/O through infrastructure"}` });
        continue;
      }
      const target = resolveSpec(imp.spec, file, root);
      if (!target || layer === "root") continue;
      const trel = path.relative(root, target).split(path.sep).join("/");
      const tlayer = layerOf(trel);
      if (!tlayer || target === file) continue;
      if (layer === "use-cases" && tlayer === "use-cases") {
        const edges = graph.get(rel) ?? [];
        edges.push({ to: trel, line: imp.line });
        graph.set(rel, edges);
      }
      const l = layer as Layer;
      if (tlayer === "root") {
        out.push({ file: rel, line: imp.line, rule: "layer-edge", message: `${l} may not import cli.ts` });
        continue;
      }
      const allowed = ALLOWED_EDGES[l][tlayer];
      if (l === tlayer && !allowed) continue;
      if (!allowed) out.push({ file: rel, line: imp.line, rule: "layer-edge", message: `${l} may not import ${tlayer} (${imp.spec})` });
      else if (!allowed.includes(imp.kind)) out.push({ file: rel, line: imp.line, rule: "import-kind", message: `${l} may import ${tlayer} only as ${allowed.join(" or ")}; found ${imp.kind} (${imp.spec})` });
    }
  }
  const state = new Map<string, number>();
  const visit = (node: string, stack: string[]): void => {
    state.set(node, 1);
    for (const e of graph.get(node) ?? []) {
      if (state.get(e.to) === 1) out.push({ file: node, line: e.line, rule: "use-case-cycle", message: `cycle: ${[...stack, node, e.to].join(" -> ")}` });
      else if (!state.has(e.to)) visit(e.to, [...stack, node]);
    }
    state.set(node, 2);
  };
  for (const node of graph.keys()) if (!state.has(node)) visit(node, []);
  return out;
}

if (import.meta.main) {
  const dir = Bun.argv[2];
  if (!dir) {
    console.error("✖ layer-guard: missing <scripts-dir>. Usage: bun scripts/layer-guard.ts <scripts-dir>");
    process.exit(1);
  }
  const violations = checkLayers(dir);
  for (const v of violations) console.log(`✖ ${v.file}:${v.line} ${v.rule}: ${v.message}`);
  if (violations.length === 0) console.log("✔ layers ok");
  process.exit(violations.length === 0 ? 0 : 1);
}
