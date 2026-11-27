import { afterAll, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { anchorsOf } from "../scripts/check-doc-links.ts"

const SCRIPT = join(import.meta.dir, "..", "scripts", "check-doc-links.ts")
const roots: string[] = []
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "doc-links-"))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(join(full, ".."), { recursive: true })
    writeFileSync(full, text)
  }
  return root
}

function run(root: string, ...targets: string[]): { exitCode: number; stdout: string } {
  const result = Bun.spawnSync(["bun", SCRIPT, "--root", root, ...targets])
  return { exitCode: result.exitCode, stdout: result.stdout.toString() }
}

const DOC = "# Topic\n\n## Defining a Constant\n\n## Magic Strings\n"

test("a link to an existing heading passes, including one built in an f-string", () => {
  const root = makeRepo({
    "docs/topic.md": DOC,
    "lint/check.py": 'DOC = "docs/topic.md#defining-a-constant"\nSTRING = f"{DOCS}/topic.md#magic-strings"\n',
  })

  const result = run(root, "lint")

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toBe("No dead doc links.\n")
})

test("a renamed heading is reported with the headings that do exist", () => {
  const root = makeRepo({
    "docs/topic.md": DOC,
    "lint/check.py": 'DOC = "docs/topic.md#constants-and-suppression"\n',
  })

  const result = run(root, "lint")

  expect(result.exitCode).toBe(1)
  expect(result.stdout).toContain("lint/check.py:1:8: error [doc-links/dead-link] links docs/topic.md#constants-and-suppression")
  expect(result.stdout).toContain("headings: topic, defining-a-constant, magic-strings")
})

test("a missing file is dead", () => {
  const root = makeRepo({ "lint/check.ts": 'const MISSING = "docs/gone.md#x"\n' })

  const result = run(root, "lint")

  expect(result.exitCode).toBe(1)
  expect(result.stdout).toContain("links docs/gone.md#x: no such file")
})

test("a path matching several files is live when one has the anchor, and dead when none does", () => {
  const root = makeRepo({
    "a/topic.md": "# Other\n",
    "b/topic.md": DOC,
    "lint/live.ts": "const LIVE = `${DOCS}/topic.md#magic-strings`\n",
    "lint/dead.ts": "const DEAD = `${DOCS}/topic.md#renamed`\n",
  })

  expect(run(root, "lint/live.ts").exitCode).toBe(0)
  const dead = run(root, "lint/dead.ts")
  expect(dead.exitCode).toBe(1)
  expect(dead.stdout).toContain('no heading "renamed" in any of a/topic.md, b/topic.md')
})

test("a web URL to a Markdown file is not read as a local link", () => {
  const root = makeRepo({ "docs/readme.md": "See https://example.com/guide.md#L10 for history.\n" })

  expect(run(root, "docs").exitCode).toBe(0)
})

test("headings inside a code fence are not anchors, and a repeated heading gets a numbered slug", () => {
  const anchors = anchorsOf("## Usage\n\n```md\n## Not a heading\n```\n\n## Usage\n<a id=\"pinned\"></a>\n")

  expect([...anchors].sort()).toEqual(["pinned", "usage", "usage-1"])
})

test("a --root without a directory is a usage error", () => {
  const result = Bun.spawnSync(["bun", SCRIPT, "--root"])

  expect(result.exitCode).toBe(2)
})
