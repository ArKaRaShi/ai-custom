#!/usr/bin/env bun
/**
 * Flag <the mistake, in one line>.
 *
 * Gap: <why no ESLint core or plugin rule, nor a `no-restricted-syntax` selector, covers it, in one line>.
 *
 * Rule `no-console-log`: a `console.log(...)` call in application code. Replace this sample rule with yours.
 * Exempt: files under SKIPPED_PARTS, and a line ending in `// no-console-log-ok: <reason>`.
 * Exit 0 when clean, 1 when any finding prints, 2 on a usage error.
 *
 *   bun check-no-console-log.ts <file-or-dir>...
 *
 * Needs `typescript@5` as a dev dependency: TypeScript 7 ships no JavaScript compiler API.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join } from "node:path"
import ts from "typescript"

const CHECK = "no-console-log"
const RULE = "no-console-log"
const ACTION = "log through the app logger"
const DOC = "docs/conventions/logging.md#the-pattern"
// Folders whose code may break the rule by design: dependencies, build output, and tests that assert on output.
const SKIPPED_PARTS = new Set(["node_modules", "dist", "build", "__tests__"])
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"])
const SUPPRESSION = new RegExp(`//\\s*${CHECK}-ok:(.*)$`)

export interface Finding {
  path: string
  line: number
  column: number
  symptom: string
}

export function render(finding: Finding): string {
  return `${finding.path}:${finding.line}:${finding.column}: error [${CHECK}/${RULE}] ${finding.symptom}; ${ACTION} (${DOC})`
}

/** Sample rule: `console.log(...)`. Replace the predicate with the node shape your mistake has. */
function isHit(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false
  const callee = node.expression
  return ts.isPropertyAccessExpression(callee) && callee.getText() === "console.log"
}

function isSuppressed(lineText: string): boolean {
  const reason = SUPPRESSION.exec(lineText)?.[1]
  return reason !== undefined && reason.trim() !== ""
}

export function checkSource(path: string, source: string): Finding[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const lines = source.split("\n")
  const findings: Finding[] = []
  const visit = (node: ts.Node): void => {
    if (isHit(node)) {
      const start = file.getLineAndCharacterOfPosition(node.getStart(file))
      const lineText = lines[start.line]
      if (lineText === undefined || !isSuppressed(lineText)) {
        findings.push({ path, line: start.line + 1, column: start.character + 1, symptom: "calls `console.log`" })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return findings
}

function listFiles(target: string): string[] {
  if (statSync(target).isFile()) return SCANNED_EXTENSIONS.has(extname(target)) ? [target] : []
  const files: string[] = []
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (SKIPPED_PARTS.has(entry.name)) continue
    const path = join(target, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(path))
    else if (SCANNED_EXTENSIONS.has(extname(path))) files.push(path)
  }
  return files
}

function main(targets: string[]): number {
  if (targets.length === 0) {
    console.error(`usage: bun ${CHECK}.ts <file-or-dir>...`)
    return 2
  }
  const missing = targets.filter((target) => !existsSync(target))
  if (missing.length > 0) {
    console.error(`not found: ${missing.join(", ")}`)
    return 2
  }
  const findings = targets.flatMap(listFiles).flatMap((path) => checkSource(path, readFileSync(path, "utf8")))
  for (const finding of findings) console.log(render(finding))
  return findings.length === 0 ? 0 : 1
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
