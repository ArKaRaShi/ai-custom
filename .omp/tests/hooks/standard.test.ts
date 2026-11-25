#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

const HOOKS_DIR = path.resolve(import.meta.dir, "../../hooks");
const CATEGORIES = ["advisory", "warn", "error", "block", "sanitize", "observe"];

interface HookMeta {
  id: string;
  category: string;
  events: string[];
  standards: string[];
}

interface HookModule {
  HOOK_META?: HookMeta;
  default?: (pi: unknown) => void;
}

function hookFiles(): string[] {
  return ["pre", "post"].flatMap((kind) =>
    fs
      .readdirSync(path.join(HOOKS_DIR, kind))
      .filter((name) => name.endsWith(".ts") && !name.startsWith("."))
      .map((name) => path.join(HOOKS_DIR, kind, name)),
  );
}

async function load(file: string): Promise<HookModule> {
  const url = pathToFileURL(file);
  return import(url.href);
}

describe("given the shared hook standard, when scanning hooks, then every hook declares the same contract", () => {
  it("declares HOOK_META with a known category, a kebab-case id, and at least one event", async () => {
    for (const file of hookFiles()) {
      const meta = (await load(file)).HOOK_META;
      expect({ file, meta: Boolean(meta) }).toEqual({ file, meta: true });
      if (!meta) continue;
      expect(CATEGORIES).toContain(meta.category);
      expect(meta.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect({ file, events: meta.events.length > 0 }).toEqual({ file, events: true });
    }
  });

  it("wires exactly the events that HOOK_META declares", async () => {
    for (const file of hookFiles()) {
      const mod = await load(file);
      const meta = mod.HOOK_META;
      const factory = mod.default;
      if (!meta || !factory) continue;
      const registered = new Set<string>();
      const stub = {
        on: (event: string) => {
          registered.add(event);
        },
        exec: async () => ({ code: 0, killed: false, stdout: "", stderr: "" }),
      };
      factory(stub);
      expect({ file, wired: [...registered].sort() }).toEqual({ file, wired: [...meta.events].sort() });
    }
  });

  it("points only at standard docs that exist in the repo", async () => {
    for (const file of hookFiles()) {
      const meta = (await load(file)).HOOK_META;
      if (!meta) continue;
      const real = fs.realpathSync(file);
      const root = path.resolve(path.dirname(real), "../../..");
      for (const doc of meta.standards) {
        expect({ file, doc, exists: fs.existsSync(path.join(root, doc)) }).toEqual({ file, doc, exists: true });
      }
    }
  });

  it("uses the shared builders instead of hand-built blocking returns", () => {
    for (const file of hookFiles()) {
      const source = fs.readFileSync(file, "utf8");
      expect({ file, rawBlock: /block\s*:\s*true/.test(source) }).toEqual({ file, rawBlock: false });
    }
  });

  it("uses a unique id per hook", async () => {
    const ids: string[] = [];
    for (const file of hookFiles()) {
      const meta = (await load(file)).HOOK_META;
      if (meta) ids.push(meta.id);
    }
    expect(ids.length).toBe(new Set(ids).size);
  });
});
