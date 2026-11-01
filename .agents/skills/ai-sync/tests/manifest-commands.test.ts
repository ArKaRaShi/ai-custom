import { describe, expect, it } from "bun:test";
import {
  approvalRejection,
  bootstrapOutcome,
  bootstrapRecovery,
  findPendingInstalls,
  installHash,
  reviewApprovals,
} from "@/scripts/domain/bootstrap";
import {
  buildMigratedManifest,
  mergeLegacySkills,
  parseLegacyPathRules,
  parseLegacySkillEntries,
} from "@/scripts/domain/legacy-manifest";
import type { Locations, ResolvedRoot, UnifiedManifest } from "@/scripts/domain/manifest";

const manifest: UnifiedManifest = {
  version: 2,
  roots: { agents: { kind: "skill", repoRoot: ".agents/skills" } },
  entries: [
    {
      kind: "skill",
      root: "agents",
      path: "with-install",
      sync: false,
      skill: { origin: "external", install: "npx -y custom install" },
    },
    {
      kind: "skill",
      root: "agents",
      path: "with-source",
      sync: false,
      skill: { origin: "external", source: "owner/repo" },
    },
    { kind: "skill", root: "agents", path: "bare", sync: false, skill: { origin: "external" } },
    {
      kind: "skill",
      root: "agents",
      path: "present",
      sync: false,
      skill: { origin: "external", source: "x/y" },
    },
    {
      kind: "skill",
      root: "agents",
      path: "synced",
      sync: true,
      skill: { origin: "external", source: "a/b" },
    },
    { kind: "skill", root: "agents", path: "mine", sync: false, skill: { origin: "authored" } },
  ],
};
const roots: ResolvedRoot[] = [
  { id: "agents", kind: "skill", local: "/skills", repo: "/repo/.agents/skills" },
];
const locations: Locations = { version: 1, roots: { agents: "/skills" } };

describe("given an installer command, when installHash is called, then it returns 12 hex of its SHA-256", () => {
  it("is stable and changes with the command", () => {
    expect(installHash("echo hi")).toBe("56a79f3b1154");
    expect(installHash("echo ho")).not.toBe(installHash("echo hi"));
  });
});

describe("given a manifest with absent external skills, when pending installs are found, then only sync-off externals are listed", () => {
  const exists = (file: string): boolean => file === "/skills/present";

  it("selects absent external sync-off skills and derives the skills-add command", () => {
    const { pending, manual } = findPendingInstalls(manifest, roots, locations, exists);
    expect(pending.map((install) => install.id)).toEqual([
      "agents:with-install",
      "agents:with-source",
    ]);
    expect(pending[0]?.command).toBe("npx -y custom install");
    expect(pending[1]?.command).toBe("npx -y skills add owner/repo -g");
    expect(pending[1]?.hash).toBe(installHash("npx -y skills add owner/repo -g"));
    expect(pending[1]?.item.installHash).toBe(pending[1]?.hash);
    expect(manual).toEqual(["agents:bare"]);
  });

  it("fails when the skill root was not resolved", () => {
    expect(() => findPendingInstalls(manifest, [], locations, exists)).toThrow(
      "Missing resolved skill root: agents",
    );
  });
});

describe("given pending installers, when approval tokens are reviewed, then each is accepted or rejected by hash", () => {
  const { pending } = findPendingInstalls(manifest, roots, locations, () => false);
  const first = pending[0];
  if (!first) throw new Error("fixture needs a pending install");

  it("approves a token naming the current hash", () => {
    const review = reviewApprovals(pending, [`${first.id}@${first.hash}`]);
    expect([...review.approved]).toEqual([first.id]);
    expect(review.rejected).toEqual([]);
  });

  it("rejects unknown, missing-hash, and stale tokens with retry hints", () => {
    const review = reviewApprovals(pending, [
      "agents:nope@abc",
      first.id,
      `${first.id}@deadbeef0000`,
    ]);
    expect(review.rejected.map((error) => error.code)).toEqual([
      "UNKNOWN_TARGET",
      "PLAN_INVALID",
      "PLAN_STALE_POLICY",
    ]);
    expect(review.retry).toEqual([`${first.id}@${first.hash}`, `${first.id}@${first.hash}`]);
    expect(approvalRejection(review).recovery).toBe(
      `Nothing was run. Review the current command, then rerun with --approve-install ${first.id}@${first.hash} --approve-install ${first.id}@${first.hash}.`,
    );
  });

  it("points at the listing when nothing can be retried", () => {
    const review = reviewApprovals(pending, ["agents:nope@abc"]);
    expect(approvalRejection(review).recovery).toBe(
      "Nothing was run. Run bootstrap without --approve-install to list the pending installers and their approval tokens.",
    );
  });
});

describe("given approval and failure counts, when the bootstrap outcome is derived, then it follows the rules", () => {
  it("derives the outcome from approvals, errors, and completions", () => {
    expect(bootstrapOutcome(0, 0, 0)).toBe("preview");
    expect(bootstrapOutcome(2, 0, 2)).toBe("success");
    expect(bootstrapOutcome(2, 1, 1)).toBe("partial");
    expect(bootstrapOutcome(1, 1, 0)).toBe("failed");
  });

  it("joins the review hint and the manual note", () => {
    expect(bootstrapRecovery(undefined, 0, 1, ["agents:bare"])).toBe(
      "Review the commands, then repeat with --approve-install <root:skill>@<hash> for each installer you approve. No installer is recorded for agents:bare; install manually.",
    );
    expect(bootstrapRecovery(undefined, 0, 0, [])).toBeNull();
  });
});

describe("given legacy manifest text, when it is parsed and migrated, then v2 entries are produced or errors named", () => {
  const skillsText = JSON.stringify({
    version: 1,
    skills: { a: { origin: "authored", sync: true, description: "d" } },
  });

  it("parses skill entries with their optional text fields", () => {
    const entries = parseLegacySkillEntries(skillsText, "f.json");
    expect(entries.get("a")).toEqual({ origin: "authored", sync: true, description: "d" });
  });

  it("names the file in parse errors", () => {
    expect(() => parseLegacySkillEntries("{", "f.json")).toThrow(
      "Cannot read legacy skill manifest: f.json",
    );
    expect(() => parseLegacySkillEntries("{}", "f.json")).toThrow(
      "Invalid legacy skill manifest: f.json",
    );
    expect(() =>
      parseLegacySkillEntries(
        JSON.stringify({ version: 1, skills: { a: { origin: "x", sync: true } } }),
        "f",
      ),
    ).toThrow("Invalid legacy skill entry: a");
    expect(() =>
      parseLegacySkillEntries(
        JSON.stringify({
          version: 1,
          skills: { a: { origin: "authored", sync: true, source: 1 } },
        }),
        "f",
      ),
    ).toThrow("Invalid legacy skill source: a");
  });

  it("rejects a path manifest that is not version 1", () => {
    expect(() => parseLegacyPathRules("{", "p.json")).toThrow(
      "Cannot read legacy path manifest: p.json",
    );
    expect(() => parseLegacyPathRules('{"version":2,"rules":[]}', "p.json")).toThrow(
      "Expected version 1 path manifest for migration",
    );
    expect(parseLegacyPathRules('{"version":1,"rules":[1]}', "p.json")).toEqual([1]);
  });

  it("merges local and shared skills and flags conflicting metadata", () => {
    const local = parseLegacySkillEntries(skillsText, "l");
    const same = parseLegacySkillEntries(skillsText, "s");
    expect([...mergeLegacySkills(local, same).keys()]).toEqual(["a"]);
    const other = parseLegacySkillEntries(
      JSON.stringify({ version: 1, skills: { a: { origin: "authored", sync: false } } }),
      "s",
    );
    expect(() => mergeLegacySkills(local, other)).toThrow(
      "Conflicting legacy metadata for skill 'a'",
    );
  });

  it("builds the version 2 manifest from rules then skills", () => {
    const skills = parseLegacySkillEntries(skillsText, "l");
    const built = buildMigratedManifest([{ pattern: ".omp/rules/*.md", sync: false }], skills);
    expect(built.roots.omp).toEqual({ kind: "path", repoRoot: ".omp" });
    expect(built.entries).toEqual([
      { kind: "path", root: "omp", path: "rules/*.md", sync: false },
      {
        kind: "skill",
        root: "agents",
        path: "a",
        sync: true,
        skill: { origin: "authored", description: "d" },
      },
    ]);
    expect(() => buildMigratedManifest([{ pattern: "x", sync: true }], skills)).toThrow(
      "Unsupported legacy path rule: x",
    );
    expect(() => buildMigratedManifest([1], skills)).toThrow(
      "Unsupported legacy path rule: invalid rule",
    );
  });
});
