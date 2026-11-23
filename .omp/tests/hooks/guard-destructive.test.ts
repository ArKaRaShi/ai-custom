import { describe, it, expect } from "bun:test";
import { findDestructiveCommand, sanitizeCommandForInspection } from "../../hooks/pre/guard-destructive";

describe("given guard-destructive pre-hook, when evaluating bash commands, then block dangerous operations and allow harmless quoted contexts", () => {
  it("allows git commits with destructive commands in the message", () => {
    const cmd = 'git commit -m "feat: handle git clean -fd and git reset --hard"';
    expect(findDestructiveCommand(cmd)).toBeUndefined();
  });

  it("allows multiline git commit messages discussing dangerous actions", () => {
    const cmd = 'git commit -m "docs: explain risks\n\n- avoid rm -rf\n- never git push --force"';
    expect(findDestructiveCommand(cmd)).toBeUndefined();
  });

  it("allows echo commands printing destructive snippets", () => {
    expect(findDestructiveCommand('echo "rm -rf node_modules"')).toBeUndefined();
    expect(findDestructiveCommand('echo "git push origin main"')).toBeUndefined();
  });

  it("allows grep and ripgrep searching for destructive commands in codebase", () => {
    expect(findDestructiveCommand('grep -r "rm -rf" src/')).toBeUndefined();
    expect(findDestructiveCommand('rg "git push" deploy.sh')).toBeUndefined();
  });

  it("allows benign git inspection commands", () => {
    expect(findDestructiveCommand("git status")).toBeUndefined();
    expect(findDestructiveCommand("git diff")).toBeUndefined();
    expect(findDestructiveCommand("git log -n 5")).toBeUndefined();
  });

  it("blocks real git clean commands", () => {
    const hit = findDestructiveCommand("git clean -fd");
    expect(hit?.category).toBe("git");
    expect(hit?.label).toContain("git clean");
  });

  it("blocks real git clean in command chaining", () => {
    const hit = findDestructiveCommand("git status && git clean -dfx && npm test");
    expect(hit?.category).toBe("git");
  });

  it("blocks real git reset --hard", () => {
    const hit = findDestructiveCommand("git reset --hard HEAD~1");
    expect(hit?.category).toBe("git");
  });

  it("blocks real git restore . and git checkout .", () => {
    expect(findDestructiveCommand("git restore .")?.category).toBe("git");
    expect(findDestructiveCommand("git checkout .")?.category).toBe("git");
  });

  it("blocks real git push and git push --force", () => {
    expect(findDestructiveCommand("git push origin main")?.category).toBe("git");
    expect(findDestructiveCommand("git push -f origin main")?.category).toBe("git");
  });

  it("blocks real recursive rm", () => {
    const hit = findDestructiveCommand("rm -rf dist build");
    expect(hit?.category).toBe("filesystem");
  });

  it("blocks real sudo rm", () => {
    const hit = findDestructiveCommand("sudo rm -f /var/run/app.pid");
    expect(hit?.category).toBe("filesystem");
  });

  it("blocks SQL DROP and TRUNCATE statements", () => {
    expect(findDestructiveCommand('psql -c "DROP TABLE users CASCADE;"')?.category).toBe("database");
    expect(findDestructiveCommand('mysql -e "TRUNCATE TABLE logs;"')?.category).toBe("database");
  });

  it("blocks raw disk writes with dd", () => {
    expect(findDestructiveCommand("dd if=/dev/zero of=/dev/rdisk2 bs=4M")?.category).toBe("disk");
  });
});

describe("given guard-destructive pre-hook, when evaluating gh commands, then confirm destructive writes and allow routine work", () => {
  it("flags gh pr writes and issue delete/transfer", () => {
    const commands: string[] = [
      "gh issue delete 12 --yes",
      "gh issue transfer 12 owner/repo",
      "gh pr create --fill",
      "gh pr merge 7 --squash",
    ];
    for (const command of commands) {
      const hit = findDestructiveCommand(command);
      expect(hit?.category).toBe("github");
    }
  });

  it("allows routine gh issue writes", () => {
    const commands: string[] = [
      'gh issue create --title "x" --body "y"',
      "gh issue edit 12 --add-label ready-for-agent",
      "gh issue close 12",
      "gh issue comment 12 --body done",
      "gh issue reopen 12",
    ];
    for (const command of commands) {
      const hit = findDestructiveCommand(command);
      expect(hit).toBeUndefined();
    }
  });

  it("flags gh label writes and gh api write methods", () => {
    const commands: string[] = [
      "gh label create needs-triage",
      "gh api -X POST repos/o/r/issues -f title=x",
      "gh api --method=PATCH repos/o/r/issues/1",
    ];
    for (const command of commands) {
      const hit = findDestructiveCommand(command);
      expect(hit?.category).toBe("github");
    }
  });

  it("allows read-only gh commands used by git-pr-mr and status checks", () => {
    const commands: string[] = [
      "gh pr view --json baseRefName -q .baseRefName",
      "gh pr diff 7",
      "gh pr checks 7",
      "gh issue list -L 3",
      "gh issue view 12",
      "gh auth status",
      "gh api repos/o/r/issues",
    ];
    for (const command of commands) {
      const hit = findDestructiveCommand(command);
      expect(hit).toBeUndefined();
    }
  });

  it("does not flag gh write text inside echo, grep, or a commit message", () => {
    const commands: string[] = [
      'echo "gh issue create"',
      'rg "gh pr create" docs/',
      'git commit -m "docs: never run gh issue create"',
    ];
    for (const command of commands) {
      const hit = findDestructiveCommand(command);
      expect(hit).toBeUndefined();
    }
  });
});
