#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const REPO = path.resolve(import.meta.dir, "../../..");
const STANDARDS_DIR = path.join(REPO, ".agents/standards");
const CATALOG = path.join(STANDARDS_DIR, "README.md");
const AGENTS_MAP = path.join(REPO, ".agents/README.md");

const catalog = fs.readFileSync(CATALOG, "utf-8");
const agentsMap = fs.readFileSync(AGENTS_MAP, "utf-8");
const standardFiles = fs.readdirSync(STANDARDS_DIR).filter((name) => name.endsWith(".md") && name !== "README.md");

describe("given the standards catalog, when compared with the folder, then every standard is discoverable", () => {
  it("lists every standard file", () => {
    const missing = standardFiles.filter((name) => !catalog.includes(name));
    expect({ missing }).toEqual({ missing: [] });
  });

  it("links only files that exist", () => {
    const linked = [...catalog.matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => match[1]);
    const missing = linked.filter((name) => !fs.existsSync(path.join(STANDARDS_DIR, name)));
    expect({ linked: linked.length > 0, missing }).toEqual({ linked: true, missing: [] });
  });

  it("is reachable from the agents map", () => {
    expect(agentsMap).toContain("standards/");
    expect(fs.existsSync(path.join(REPO, ".agents/standards"))).toBe(true);
  });
});
