#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import ompHookAuthoring, { HOOK_META } from "../../hooks/pre/omp-hook-authoring";

function mount(): { handlers: Map<string, (event: unknown, ctx: unknown) => unknown>; meta: typeof HOOK_META } {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  const stub = {
    on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => {
      handlers.set(event, handler);
    },
  };
  ompHookAuthoring(stub as never);
  return { handlers, meta: HOOK_META };
}

const GOOD_HOOK = `import { advisory, type HookMeta } from "../shared/verdict";

export const HOOK_META = { id: "x", category: "ADVISORY", events: ["tool_call"], standards: [] } satisfies HookMeta;

export default function x(pi): void {
  pi.on("tool_call", async () => advisory(HOOK_META, "note"));
}
`;

describe("given the hook-authoring gate, when an agent writes a hook file, then it enforces the shared standard", () => {
  it("blocks a hook file with no HOOK_META and names the fix", async () => {
    const { handlers } = mount();
    const call = handlers.get("tool_call");
    const verdict = await call?.({ toolName: "write", input: { path: "~/.omp/agent/hooks/pre/new.ts", content: "export default function () {}" } }, {});
    expect(verdict).toMatchObject({ block: true });
    expect(JSON.stringify(verdict)).toContain("HOOK_META");
    expect(JSON.stringify(verdict)).toContain("Fix:");
  });

  it("blocks a hook file that builds a raw blocking return", async () => {
    const { handlers } = mount();
    const call = handlers.get("tool_call");
    const content = GOOD_HOOK.replace('advisory(HOOK_META, "note")', '{ block: true, reason: "no" }');
    const verdict = await call?.({ toolName: "edit", input: { path: ".omp/hooks/post/bad.ts", new_string: content } }, {});
    expect(verdict).toMatchObject({ block: true });
    expect(JSON.stringify(verdict)).toContain("../shared/verdict");
  });

  it("allows a conforming hook and points at the standard once per session", async () => {
    const { handlers } = mount();
    const call = handlers.get("tool_call");
    const payload = { toolName: "write", input: { path: ".omp/hooks/pre/good.ts", content: GOOD_HOOK } };
    const first = await call?.(payload, {});
    const second = await call?.(payload, {});
    expect(first).toMatchObject({ additionalContext: expect.stringContaining("authoring-hooks.md") });
    expect(second).toBeUndefined();
  });

  it("re-arms the pointer after a session reset", async () => {
    const { handlers } = mount();
    const call = handlers.get("tool_call");
    const payload = { toolName: "write", input: { path: ".omp/hooks/pre/good.ts", content: GOOD_HOOK } };
    await call?.(payload, {});
    handlers.get("session_start")?.({}, {});
    const again = await call?.(payload, {});
    expect(again).toMatchObject({ additionalContext: expect.stringContaining("authoring-hooks.md") });
  });

  it("ignores files outside a hooks/pre or hooks/post folder", async () => {
    const { handlers } = mount();
    const call = handlers.get("tool_call");
    const verdict = await call?.({ toolName: "write", input: { path: "src/agent.ts", content: "" } }, {});
    expect(verdict).toBeUndefined();
  });
});
