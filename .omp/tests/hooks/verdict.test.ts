#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import { advisory, block, checkHookMeta, error, sanitized, sessionOnce, warn } from "../../hooks/shared/verdict";

const META = { id: "probe", category: "ERROR", events: ["tool_call"], standards: [] } as const;
const ADVISORY_META = { id: "probe", category: "ADVISORY", events: ["tool_call"], standards: [] } as const;
const SANITIZE_META = { id: "probe", category: "SANITIZE", events: ["tool_result"], standards: [] } as const;

describe("given the verdict builders, when a hook reports, then each category maps to one return shape", () => {
  it("advisory and warn add context without blocking", () => {
    const note = advisory(ADVISORY_META, "read the standard first");
    expect(note.block).toBeUndefined();
    expect(note.additionalContext).toContain("[omp-hook:probe:ADVISORY]");
    expect(note.additionalContext).toContain("read the standard first");

    const caution = warn(ADVISORY_META, "this will not render");
    expect(caution.block).toBeUndefined();
    expect(caution.additionalContext).toContain("[omp-hook:probe:WARN]");
    expect(caution.additionalContext).toContain("⚠");
  });

  it("error blocks and names the replacement call", () => {
    const verdict = error(META, "raster images take no selector", 'read "shot.png"');
    expect(verdict.block).toBe(true);
    expect(verdict.reason).toContain("[omp-hook:probe:ERROR]");
    expect(verdict.reason).toContain("raster images take no selector");
    expect(verdict.reason).toContain('Fix: read "shot.png"');
  });

  it("block refuses without offering a fix", () => {
    const verdict = block({ ...META, category: "BLOCK" }, "rm -rf /");
    expect(verdict.block).toBe(true);
    expect(verdict.reason).toContain("[omp-hook:probe:BLOCK]");
    expect(verdict.reason).not.toContain("Fix:");
  });

  it("sanitize replaces content and keeps details when given", () => {
    const content = [{ type: "text", text: "masked" }];
    expect(sanitized(SANITIZE_META, content)).toEqual({ content });
    expect(sanitized(SANITIZE_META, content, { at: 1 })).toEqual({ content, details: { at: 1 } });
  });

  it("refuses a blocking or content return from a category that cannot emit one", () => {
    expect(() => block(ADVISORY_META as never, "rm -rf /")).toThrow(/cannot emit a block return/);
    expect(() => sanitized(META as never, [])).toThrow(/cannot emit a content return/);
  });

  it("reports each broken declaration so any runtime can reject it", () => {
    expect(checkHookMeta(ADVISORY_META)).toEqual([]);
    expect(checkHookMeta({ id: "BadId", category: "ADVISORY", events: [], standards: [] })).toEqual([
      'id "BadId" is not kebab-case',
      "events is empty",
    ]);
    expect(checkHookMeta({ id: "probe", category: "LOUD" as never, events: ["tool_call"], standards: [] })).toEqual([
      'category "LOUD" is not in HOOK_CATEGORIES',
    ]);
  });

  it("sessionOnce delivers one note per key until the session resets", () => {
    const once = sessionOnce();
    expect(once.take("image:/a.png")).toBe(true);
    expect(once.take("image:/a.png")).toBe(false);
    expect(once.take("image:/b.png")).toBe(true);
    once.reset();
    expect(once.take("image:/a.png")).toBe(true);
  });
});
