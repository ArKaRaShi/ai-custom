#!/usr/bin/env bun
/**
 * Report every `<path>.md#<anchor>` link, in lint checks or docs, whose file or heading does not exist.
 *
 *   bun check-doc-links.ts [--root <repo>] <file-or-dir>...
 *
 * Read-only. Exit 0 when every link resolves, 1 when any is dead or ambiguous, 2 on a usage error.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"

const SCANNED_EXTENSIONS = new Set([".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".vue", ".json", ".md"])
// Dependency, build and cache folders hold no links the repo owns.
const SKIPPED_DIRS = new Set([".git", "node_modules", "__pycache__", "dist", "build", ".venv", ".mypy_cache", ".pytest_cache"])
// Long enough to show the headings a reader most likely meant, short enough to keep one finding on screen.
const MAX_LISTED_HEADINGS = 12

const LINK = /([\w.\/-]+\.md)#([\p{L}\p{N}_-]+)/gu
const URL = /[a-z][a-z0-9+.-]*:\/\/\S+/gi
const HEADING = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HTML_ID = /\b(?:id|name)=["']([^"']+)["']/g

export interface DeadLink {
  path: string
  line: number
  column: number
  target: string
  reason: string
}

/** GitHub's heading slug: lowercase, punctuation dropped, spaces to hyphens. */
export function slugify(heading: string): string {
  const lowered = heading.trim().toLowerCase()
  const kept = lowered.replace(/[^\p{L}\p{N}\s_-]/gu, "")
  return kept.replace(/\s/g, "-")
}

/** Every anchor a Markdown file exposes: heading slugs (with GitHub's `-1` suffix on repeats) and HTML ids. */
export function anchorsOf(markdown: string): Set<string> {
  const anchors = new Set<string>()
  const seen = new Map<string, number>()
  let fence: string | null = null
  for (const line of markdown.split("\n")) {
    const fenceMatch = FENCE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? ""
      if (fence === null) fence = marker[0] ?? null
      else if (marker[0] === fence) fence = null
      continue
    }
    if (fence !== null) continue
    for (const id of line.matchAll(HTML_ID)) anchors.add(id[1] ?? "")
    const heading = HEADING.exec(line)
    if (!heading) continue
    const base = slugify(heading[2] ?? "")
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
  return anchors
}

function listFiles(target: string, keep: (file: string) => boolean): string[] {
  const stat = statSync(target)
  if (stat.isFile()) return keep(target) ? [target] : []
  const files: string[] = []
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith(".venv") || SKIPPED_DIRS.has(entry.name)) continue
    const path = join(target, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(path, keep))
    else if (entry.isFile() && keep(path)) files.push(path)
  }
  return files
}

class Resolver {
  private markdownFiles: string[] | null = null
  private anchorCache = new Map<string, Set<string>>()

  constructor(private readonly root: string) {}

  /**
   * The Markdown files a link may name: the file relative to the linking file or to the repo root when one exists,
   * else every file ending in the link's path, so a path built in an f-string (`{DOCS}/topic.md`) still resolves.
   */
  candidates(linkPath: string, fromFile: string): string[] {
    const exact = [resolve(dirname(fromFile), linkPath), resolve(this.root, linkPath)]
    const found = exact.find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
    if (found !== undefined) return [found]
    const suffix = linkPath.replace(/^(\.{1,2}\/)+|^\//, "")
    return this.allMarkdown().filter((file) => relative(this.root, file).endsWith(suffix))
  }

  anchors(file: string): Set<string> {
    const cached = this.anchorCache.get(file)
    if (cached) return cached
    const markdown = readFileSync(file, "utf8")
    const anchors = anchorsOf(markdown)
    this.anchorCache.set(file, anchors)
    return anchors
  }

  private allMarkdown(): string[] {
    this.markdownFiles ??= listFiles(this.root, (file) => extname(file) === ".md")
    return this.markdownFiles
  }
}

function listed(items: string[]): string {
  const shown = items.slice(0, MAX_LISTED_HEADINGS).join(", ")
  const hidden = items.length - MAX_LISTED_HEADINGS
  return hidden > 0 ? `${shown} (+${hidden} more)` : shown
}

/**
 * Dead links in one file's text. URLs are blanked first so a GitHub `.md#L10` link is not read as local. A path
 * matching several files is live when any of them has the anchor.
 */
export function findDeadLinks(file: string, text: string, resolver: Resolver, root: string): DeadLink[] {
  const blanked = text.replace(URL, (url) => " ".repeat(url.length))
  const dead: DeadLink[] = []
  const lines = blanked.split("\n")
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(LINK)) {
      const [, linkPath = "", anchor = ""] = match
      const target = `${linkPath}#${anchor}`
      const where = { path: relative(root, file), line: index + 1, column: match.index + 1, target }
      const candidates = resolver.candidates(linkPath, file)
      if (candidates.length === 0) {
        dead.push({ ...where, reason: "no such file" })
        continue
      }
      if (candidates.some((candidate) => resolver.anchors(candidate).has(anchor))) continue
      const [only] = candidates
      if (candidates.length === 1 && only !== undefined) {
        const headings = [...resolver.anchors(only)]
        dead.push({ ...where, reason: `no heading "${anchor}" in ${relative(root, only)}; headings: ${listed(headings)}` })
        continue
      }
      const files = candidates.map((candidate) => relative(root, candidate))
      dead.push({ ...where, reason: `no heading "${anchor}" in any of ${listed(files)}; write the repo-relative path` })
    }
  }
  return dead
}

export function checkDocLinks(root: string, targets: string[]): DeadLink[] {
  const resolver = new Resolver(root)
  const dead: DeadLink[] = []
  for (const target of targets) {
    const files = listFiles(resolve(root, target), (file) => SCANNED_EXTENSIONS.has(extname(file)))
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      dead.push(...findDeadLinks(file, text, resolver, root))
    }
  }
  return dead
}

function main(argv: string[]): number {
  const usage = "usage: bun check-doc-links.ts [--root <repo>] <file-or-dir>..."
  const args = [...argv]
  let root = process.cwd()
  const rootFlag = args.indexOf("--root")
  if (rootFlag !== -1) {
    const rootValue = args[rootFlag + 1]
    if (rootValue === undefined) {
      console.error(`--root needs a directory; ${usage}`)
      return 2
    }
    root = resolve(rootValue)
    args.splice(rootFlag, 2)
  }
  if (args.length === 0 || args.includes("--help")) {
    console.error(usage)
    return 2
  }
  const missing = args.filter((target) => !existsSync(resolve(root, target)))
  if (missing.length > 0) {
    console.error(`not found under ${root}: ${missing.join(", ")}`)
    return 2
  }
  const dead = checkDocLinks(root, args)
  for (const link of dead) {
    console.log(`${link.path}:${link.line}:${link.column}: error [doc-links/dead-link] links ${link.target}: ${link.reason}`)
  }
  if (dead.length === 0) console.log("No dead doc links.")
  return dead.length === 0 ? 0 : 1
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
