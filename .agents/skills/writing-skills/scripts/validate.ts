#!/usr/bin/env bun
import * as fs from "node:fs";
import * as path from "node:path";

export interface Finding {
  level: "error" | "warning";
  file: string;
  message: string;
}

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_WORDS = ["anthropic", "claude"];
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
/** Anthropic and the Agent Skills spec both cap the body at 500 lines. */
const MAX_BODY_LINES = 500;
/** Long references need a contents list so partial reads still show the full scope. */
const LONG_REFERENCE_LINES = 100;
const LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)\)/g;

export interface Frontmatter {
  fields: Record<string, string>;
  body: string;
}

/** Splits `---` delimited frontmatter; folded (`>`) and literal (`|`) scalars are joined. Null when absent. */
export function parseFrontmatter(text: string): Frontmatter | null {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const fields: Record<string, string> = {};
  let key: string | null = null;
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined && !line.startsWith(" ")) {
      key = match[1];
      const value = (match[2] ?? "").trim();
      fields[key] = value === ">" || value === "|" ? "" : value.replace(/^(["'])(.*)\1$/, "$2");
    } else if (key !== null && line.trim() !== "") {
      fields[key] = `${fields[key] ?? ""} ${line.trim()}`.trim();
    }
  }
  return { fields, body: lines.slice(end + 1).join("\n") };
}

/** Relative link targets in `markdown`, without fragments. External and anchor-only links are skipped. */
export function localLinks(markdown: string): string[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "");
  const targets: string[] = [];
  for (const match of withoutCode.matchAll(LINK_PATTERN)) {
    const target = (match[1] ?? "").split("#")[0] ?? "";
    if (target !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(target)) targets.push(target);
  }
  return targets;
}

export interface ValidateOptions {
  /** Frame findings become errors instead of warnings. */
  strict?: boolean;
}

/** `## ` headings in `body`, ignoring fenced code. */
function headings(body: string): string[] {
  const text = body.replace(/```[\s\S]*?```/g, "");
  return [...text.matchAll(/^## (.+?)\s*$/gm)].map((match) => match[1] ?? "");
}

/** Numbered items under `## Steps`, each with its continuation lines. */
function stepItems(body: string): string[] {
  const text = body.replace(/```[\s\S]*?```/g, "");
  const section = /^## Steps\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? "";
  return section.split(/^(?=\d+\.\s)/m).filter((item) => /^\d+\.\s/.test(item));
}

/**
 * Section names accepted in place of a frame's main section. Only the principle-skill shape is
 * aliased: its `## The Pattern` plays the role of `## Rules`.
 */
export const MAIN_SECTION_ALIASES: Readonly<Record<string, "Steps" | "Rules">> = {
  "The Pattern": "Rules",
};

/** Reported when a body has neither main section; `report.ts` classifies on this exact text. */
export const MISSING_MAIN_SECTION = "missing `## Steps` or `## Rules` main section";

/**
 * Problems with the skill frame: a steps skill has `## Steps` with an `Exit:` on every step, and a
 * rules skill has `## Rules` (or an alias) and `## The tests`.
 */
export function frameProblems(body: string): string[] {
  const names = headings(body);
  const mains = names.map((name) => MAIN_SECTION_ALIASES[name] ?? name);
  const hasSteps = mains.includes("Steps");
  const hasRules = mains.includes("Rules");
  if (hasSteps && hasRules) return ["use either `## Steps` or `## Rules`, not both"];
  if (!hasSteps && !hasRules) return [MISSING_MAIN_SECTION];
  if (hasRules) {
    return names.some((name) => name.toLowerCase() === "the tests")
      ? []
      : ["a rules skill needs a `## The tests` section"];
  }
  const items = stepItems(body);
  if (items.length === 0) return ["`## Steps` has no numbered steps"];
  return items.flatMap((item, index) =>
    /\bExit:/.test(item) ? [] : [`step ${index + 1} has no \`Exit:\` condition`],
  );
}

/** Validates one skill directory. Reads only; never writes. */
export function validateSkill(dir: string, options: ValidateOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const add = (level: Finding["level"], file: string, message: string): void => {
    findings.push({ level, file, message });
  };
  const skillFile = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    add("error", "SKILL.md", "missing");
    return findings;
  }
  const parsed = parseFrontmatter(fs.readFileSync(skillFile, "utf8"));
  if (!parsed) {
    add("error", "SKILL.md", "missing or unterminated YAML frontmatter");
    return findings;
  }
  const { name, description } = parsed.fields;

  if (!name) add("error", "SKILL.md", "frontmatter is missing `name`");
  else {
    if (name.length > MAX_NAME) add("error", "SKILL.md", `name is over ${MAX_NAME} characters`);
    if (!NAME_PATTERN.test(name)) {
      add("error", "SKILL.md", "name must use lowercase letters, digits, and single hyphens");
    }
    if (name !== path.basename(path.resolve(dir))) {
      add("error", "SKILL.md", `name '${name}' must equal the directory name`);
    }
    for (const word of RESERVED_WORDS) {
      if (name.includes(word)) add("error", "SKILL.md", `name contains reserved word '${word}'`);
    }
  }

  if (!description) add("error", "SKILL.md", "frontmatter is missing `description`");
  else {
    if (description.length > MAX_DESCRIPTION) {
      add("error", "SKILL.md", `description is over ${MAX_DESCRIPTION} characters`);
    }
    if (/<[a-z/][^>]*>/i.test(description)) add("error", "SKILL.md", "description contains XML tags");
    if (/^(i|you|we)\b/i.test(description)) {
      add("warning", "SKILL.md", "description should be third person");
    }
    if (!/\bwhen\b/i.test(description)) {
      add("warning", "SKILL.md", "description should say when to use the skill");
    }
  }

  const bodyLines = parsed.body.replace(/^\n+|\n+$/g, "").split("\n").length;
  if (bodyLines > MAX_BODY_LINES) {
    add("error", "SKILL.md", `body is ${bodyLines} lines; the limit is ${MAX_BODY_LINES}`);
  }
  if (fs.existsSync(path.join(dir, "README.md"))) {
    add("error", "README.md", "remove it; SKILL.md is the entry point");
  }
  for (const problem of frameProblems(parsed.body)) {
    add(options.strict ? "error" : "warning", "SKILL.md", problem);
  }

  for (const target of localLinks(parsed.body)) {
    if (!fs.existsSync(path.join(dir, target))) {
      add("error", "SKILL.md", `broken link: ${target}`);
    }
  }

  const referencesDir = path.join(dir, "references");
  if (fs.existsSync(referencesDir)) {
    for (const file of fs.readdirSync(referencesDir).filter((f) => f.endsWith(".md"))) {
      const text = fs.readFileSync(path.join(referencesDir, file), "utf8");
      const label = `references/${file}`;
      if (text.split("\n").length > LONG_REFERENCE_LINES && !/^#+\s+contents\b/im.test(text)) {
        add("warning", label, `over ${LONG_REFERENCE_LINES} lines with no \`## Contents\` list`);
      }
      for (const target of localLinks(text)) {
        const resolved = path.resolve(referencesDir, target);
        if (!fs.existsSync(resolved)) add("error", label, `broken link: ${target}`);
        else if (resolved.endsWith(".md")) {
          add("warning", label, `links to ${target}; keep references one level deep from SKILL.md`);
        }
      }
    }
  }
  return findings;
}

function main(argv: string[]): number {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "Usage: bun validate.ts [--strict] <skill-dir>...\nRead-only. Exits 1 when any skill has an error.\n--strict turns frame findings (Steps/Exit or Rules/The tests) into errors.",
    );
    return argv.length === 0 ? 2 : 0;
  }
  const strict = argv.includes("--strict");
  let failed = false;
  for (const arg of argv.filter((a) => a !== "--strict")) {
    const dir = path.resolve(arg);
    const findings = validateSkill(dir, { strict });
    const errors = findings.filter((f) => f.level === "error").length;
    console.log(`${path.basename(dir)}: ${errors === 0 ? "ok" : `${errors} error(s)`}`);
    for (const f of findings) console.log(`  ${f.level} ${f.file}: ${f.message}`);
    if (errors > 0) failed = true;
  }
  return failed ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
