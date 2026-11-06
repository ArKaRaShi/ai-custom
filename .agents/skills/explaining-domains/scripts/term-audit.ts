#!/usr/bin/env bun
import * as fs from "node:fs";

/** A term that looks like jargon and is not in the glossary. */
export interface Undefined {
  term: string;
  line: number;
  count: number;
}

const UNITS = "kPa|MPa|bar|psi|kW|MW|Hz|rpm|m³/s|m3/s|°C|°F";
const PATTERNS: RegExp[] = [
  /\b[A-Z][A-Z0-9]{1,}\b/g, // acronyms
  /\b[a-z]+(?:_[a-z0-9]+)+\b/g, // snake_case
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, // UPPER_SNAKE
  /\b(?:[a-z]+(?:[A-Z][a-z0-9]+)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+)\b/g, // camelCase and PascalCase
];
const UNIT_PATTERN = new RegExp(`\\b\\d+(?:\\.\\d+)?\\s*(${UNITS})(?![A-Za-z])`, "g");

/** Blank out markup that is not reader-facing text, keeping newlines so line numbers hold. */
export function readableText(source: string, isHtml: boolean): string {
  let text = source;
  if (isHtml) {
    text = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, " "));
    text = text.replace(/<[^>]+>/g, (m) => m.replace(/[^\n]/g, " "));
    text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  } else {
    text = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, " "));
    text = text.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
  }
  return text;
}

/** One glossary term per line; text after a colon is the definition and is ignored. */
export function parseGlossary(text: string): Set<string> {
  const terms = new Set<string>();
  for (const raw of text.split("\n")) {
    const term = raw.split(":")[0].trim().toLowerCase();
    if (term) terms.add(term);
  }
  return terms;
}

export function findUndefined(text: string, glossary: Set<string>): Undefined[] {
  const seen = new Map<string, Undefined>();
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const found: string[] = [];
    for (const pattern of PATTERNS) for (const m of line.matchAll(pattern)) found.push(m[0]);
    for (const m of line.matchAll(UNIT_PATTERN)) found.push(m[1]);
    for (const term of new Set(found)) {
      if (glossary.has(term.toLowerCase())) continue;
      const hit = seen.get(term);
      if (hit) hit.count += 1;
      else seen.set(term, { term, line: index + 1, count: 1 });
    }
  });
  return [...seen.values()];
}

function main(argv: string[]): number {
  const glossaryAt = argv.indexOf("--glossary");
  const files = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--glossary");
  if (argv.includes("--help") || files.length === 0 || glossaryAt === -1 || !argv[glossaryAt + 1]) {
    console.log(
      "Usage: bun term-audit.ts <screen-file>... --glossary <terms-file>\n" +
        "Lists acronyms, snake_case, camelCase and unit words that the glossary does not define.\n" +
        "Exits 1 when any are listed, 2 on a usage error. Read-only.",
    );
    return argv.includes("--help") ? 0 : 2;
  }
  const glossaryFile = argv[glossaryAt + 1];
  if (!fs.existsSync(glossaryFile)) {
    console.error(`glossary not found: ${glossaryFile}. Create it with one term per line.`);
    return 2;
  }
  const glossary = parseGlossary(fs.readFileSync(glossaryFile, "utf8"));
  let failed = false;
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`file not found: ${file}`);
      return 2;
    }
    const text = readableText(fs.readFileSync(file, "utf8"), /\.html?$/i.test(file));
    const missing = findUndefined(text, glossary);
    console.log(`${file}: ${missing.length === 0 ? "ok" : `${missing.length} undefined`}`);
    for (const m of missing) console.log(`  ${m.term}  line ${m.line}  x${m.count}`);
    if (missing.length > 0) failed = true;
  }
  return failed ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
