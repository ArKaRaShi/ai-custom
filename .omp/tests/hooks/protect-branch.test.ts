import { describe, it, expect } from "bun:test";
import protectBranch, { isProtectedBranch, isGitCommitCommand } from "../../hooks/pre/protect-branch";

describe("given protect-branch pre-hook, when detecting protected branches and operations, then confirm or reject correctly", () => {
  it("identifies protected branches", () => {
    expect(isProtectedBranch("main")).toBe(true);
    expect(isProtectedBranch("master")).toBe(true);
    expect(isProtectedBranch("develop")).toBe(true);
    expect(isProtectedBranch("dev")).toBe(true);
    expect(isProtectedBranch("feature/login")).toBe(false);
    expect(isProtectedBranch("bugfix/auth")).toBe(false);
    expect(isProtectedBranch(null)).toBe(false);
  });

  it("identifies git commit commands", () => {
    expect(isGitCommitCommand('git commit -m "feat: login"')).toBe(true);
    expect(isGitCommitCommand("git commit -a")).toBe(true);
    expect(isGitCommitCommand("git status")).toBe(false);
    expect(isGitCommitCommand("git checkout -b feature")).toBe(false);
  });

  it("allows tool call when user confirms with Yes", async () => {
    let handler: any;
    const mockPi: any = {
      on: (event: string, fn: any) => {
        if (event === "tool_call") handler = fn;
      },
      exec: async () => ({ stdout: "main\n", stderr: "", exitCode: 0 }),
    };

    protectBranch(mockPi);

    const mockCtx: any = {
      cwd: "/repo",
      hasUI: true,
      ui: {
        confirm: async () => true, // User says Yes
      },
    };

    const res = await handler({ toolName: "write", input: { path: "src/index.ts" } }, mockCtx);
    expect(res).toBeUndefined(); // Allowed to pass through
  });

  it("blocks tool call and returns reason when user declines with No", async () => {
    let handler: any;
    const mockPi: any = {
      on: (event: string, fn: any) => {
        if (event === "tool_call") handler = fn;
      },
      exec: async () => ({ stdout: "main\n", stderr: "", exitCode: 0 }),
    };

    protectBranch(mockPi);

    const mockCtx: any = {
      cwd: "/repo",
      hasUI: true,
      ui: {
        confirm: async () => false, // User says No
      },
    };

    const res = await handler({ toolName: "edit", input: { path: "src/index.ts" } }, mockCtx);
    expect(res?.block).toBe(true);
    expect(res?.reason).toContain("User declined direct changes on protected branch 'main'");
  });

  it("ignores read-only tools even on main branch", async () => {
    let handler: any;
    const mockPi: any = {
      on: (event: string, fn: any) => {
        if (event === "tool_call") handler = fn;
      },
      exec: async () => ({ stdout: "main\n", stderr: "", exitCode: 0 }),
    };

    protectBranch(mockPi);

    const mockCtx: any = {
      cwd: "/repo",
      hasUI: true,
      ui: {
        confirm: async () => false,
      },
    };

    // Read tool must pass without any prompt
    const res = await handler({ toolName: "read", input: { path: "src/index.ts" } }, mockCtx);
    expect(res).toBeUndefined();
  });

  it("allows file edits freely on feature branches without prompting", async () => {
    let handler: any;
    const mockPi: any = {
      on: (event: string, fn: any) => {
        if (event === "tool_call") handler = fn;
      },
      exec: async () => ({ stdout: "feature/user-auth\n", stderr: "", exitCode: 0 }),
    };

    protectBranch(mockPi);

    const mockCtx: any = {
      cwd: "/repo",
      hasUI: true,
      ui: {
        confirm: async () => {
          throw new Error("Should not prompt on feature branch!");
        },
      },
    };

    const res = await handler({ toolName: "write", input: { path: "src/index.ts" } }, mockCtx);
    expect(res).toBeUndefined();
  });
});
