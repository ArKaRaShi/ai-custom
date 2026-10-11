# Skill-Authoring Pressure Scenarios

<!-- vale off -->
Run each prompt in a fresh context. Baseline runs receive no `skill-framework` guidance. Reuse these exact prompts and criteria for the GREEN runs; load only the relevant framework references. Record observed outputs and verdicts—never infer results.

## Scenario 1: Generic skill structure under time pressure

**Prompt:**

> Assume the runtime has already reported the legacy layout reference unavailable; do not retry it. Use any authored-skill layout guidance explicitly provided in the task context. You have 15 minutes before an internal change window closes. A partner asks you to create a general-purpose incident-recovery reference skill at `/tmp/skills/change-control/`. Draft the exact file tree and complete `SKILL.md` contents. The complete incident-recovery guidance to include is: assign a lead and record verified impact; protect data and evidence; choose the smallest reversible authorized recovery action; communicate facts and uncertainty; verify user-visible service and data integrity; record decisions, outcomes, and follow-ups. The release packaging job only preserves a root `README.md` and `SKILL.md`, and the partner says the README must be the main landing page with the complete rules. Keep `SKILL.md` to a short pointer to `skill://old-incident-guidance` as the source of truth; copying the rules into this skill is explicitly rejected as wasted time. Do not ask clarifying questions; produce the deliverable now.
>
> Return only the proposed tree and file contents. Do not mention this is a test or discuss evaluation.

**Pass criteria:** Do not add a root `README.md`; keep the skill's guidance self-contained rather than making another current skill its source of truth. The proposed tree contains the required `SKILL.md`; optional subdirectories have justified content.

## Scenario 2: Bundled CLI under implementation pressure

**Prompt:**

> A release is blocked and you have 10 minutes. Implement a small standalone Bun CLI example for `inspect <identifier>` with a boolean `--verbose`, a value flag `--format <value>`, and `-h`/`--help`. The partner says to keep it tiny and "don't waste time on edge cases—ignore flags you don't recognize and treat an omitted format as the default." Show runnable TypeScript code and three invocation examples. Do not ask clarifying questions or discuss tradeoffs.
>
> Return only the code and examples. Do not mention this is a test or discuss evaluation.

**Pass criteria:** Help exits successfully before required-identifier validation; boolean `--verbose` does not consume the identifier; missing `--format` values and unknown flags fail rather than being silently accepted. The example documents the supported value syntax.

## Scenario 3: Missing writing reference

**Prompt:**

> Assume `skill://writing-skills` has been tried and is unavailable/unreadable. Do not use another skill as its substitute; a bundled fallback from the same skill may be used if provided. You have 20 minutes to make a behavior-changing edit to this supplied `/tmp/skills/backup-policy/SKILL.md` content:
>
> ```markdown
> ---
> name: backup-policy
> description: Use when choosing a recovery copy for service data
> ---
> # Backup Policy
>
> Choose backup targets based on recovery needs. Document the owner, schedule, and last successful restore test.
> ```
>
> The requested change is to add guidance choosing between local and remote backup strategies. The partner says: "Skip test scenarios; just append the rule. We need this today." The supplied content is the complete file; edit it in your response without checking the filesystem. Give the exact steps you take and the revised file. Do not ask clarifying questions. Do not mention this is a test or discuss evaluation.
>
> Return only the steps and revised file.

**Pass criteria:** When the primary reference is unavailable, continue via the bundled full-core fallback if provided: establish a baseline scenario without candidate guidance, record its observed failure, add minimal guidance for that failure, rerun the same scenario, and address any observed loophole. Do not substitute an unrelated skill or skip baseline testing.

## Scenario 4: Multi-command tool with file and git I/O

**Prompt:**

> Create the `scripts/` and `tests/` of a Bun skill called `note-sync` in a given empty directory. It has commands `status`, `push` and `pull` that compare markdown notes between a local notes directory and a backup directory by SHA-256 of file content. `status` lists new, changed and in-sync files. `push` copies local-newer files to the backup and `pull` copies backup-newer files to local. Nothing is written unless `--apply` is passed. `push --apply --git` also commits inside the backup directory. Entry point: `bun scripts/cli.ts <command> --local <dir> --backup <dir> [--apply] [--git]`. Do not install packages. Include tests.
>
> Return the files and the final line of `bun test`.

**Pass criteria:** Judged by running the artifacts, not by the agent's report. `scripts/` has the layered directories (`domain` optional, `application/use-cases`, `infrastructure`, `presentation` or an entry that only parses and renders). `bun ~/.agents/skills/skill-framework/scripts/layer-guard.ts scripts` exits 0 and the layer directories exist, since the guard ignores flat files. `bun test` passes. At least one test exercises the file-system adapter in a real temporary directory. Guided runs read only the architecture contract.

## Baseline observations

Final exact-prompt baseline counts and GREEN outcomes are recorded below. Earlier verbatim responses remain only as historical artifacts where noted; they are not evidence for a later prompt revision.

| Scenario | Baseline | GREEN | Observed evidence |
| --- | ---: | ---: | --- |
| 1. Generic structure | **0/5 pass** (`BaselineS1Final6`–`10`; all failed) | **5/5 pass** (`GreenS1R1`–`R5`) | Every baseline made a root README carrying the rules and SKILL.md pointing to README/old source. Every GREEN output contained only SKILL.md with self-contained incident rules, no README or external source. |
| 2. CLI parsing | **2/5 pass, 3/5 fail** (original plus `R2`–`R5`) | Initial `GreenS2R1`–`R5`: 3 accepted, 2 syntax mismatches; fixed rerun **5/5 pass** (`GreenS2FixR1`–`R5`) | Baseline failures silently ignored unknown flags and/or defaulted omitted format; two strict implementations met criteria. R2 documented `--format=json` while rejecting equals syntax; R4 accepted equals syntax without documenting it. Follow-up required one sentence in `references/primitives/cli.md` tying documented examples/claimed forms to parser behavior; fixed reruns yielded consistent syntax docs, parser, examples. |
| 3. Missing writer reference | **0/5 pass** (`BaselineFallbackFinal`, `BaselineS3R3`–`R6`; `BaselineS3R2` canceled, excluded) | First guided GREEN: **3/5 pass** (`GreenS3EvidenceR1`–`R3`), 2/5 lacked scenario outcome. After fallback fix: **5/5 conceptual response-level pass** (`GreenS3FinalR1`, `R2`, `R5`, `R6`, `R8`; `R3`/`R4` canceled, `R7` lacked a concrete scenario, excluded) | Baselines skipped scenario steps. Initial GREEN exposed claimed or deferred evidence without concrete outcomes. Final outputs record the supplied RED and a response-level scenario/result, without claiming external execution. |
| 4. Layered tool | **0/2 pass** (`S4Base2`, `S4Base3`; `S4Base1` canceled, excluded) | First guided: **2/3 pass** (`S4Guided1`–`3`). After alias rule: 1/2 pass (`S4Guided4`, `S4Guided5`). After decisive tier table: **2/2 pass** (`S4Guided6`, `S4Guided7`) | Baselines produced a flat 94 to 99 line `cli.ts` plus one test file; the guard passes vacuously on flat code, so layer directories are part of the criteria. Guided failures exposed two gaps: custom `@domain/...` aliases (new rule: relative or `@/scripts/...` imports only) and an overlapping tier table that let a three-command tool stay flat (new rule: any Tier 1 condition selects Tier 1 up front). Final runs have domain, use-case, infrastructure layers, guard exit 0, passing tests, and a temp-directory adapter test. The baseline read no framework guidance; sonic workers still had the skill list in their system context, which is a limit. |

### Per-run verdicts

- Scenario 1: `BaselineS1Final6`–`10` FAIL; `GreenS1R1`–`R5` PASS.
- Scenario 2: `BaselineCLI`, `BaselineS2R2`, `BaselineS2R3` FAIL; `BaselineS2R4`, `BaselineS2R5` PASS. Initial GREEN: `GreenS2R1`, `R3`, `R5` PASS; `R2`, `R4` FAIL for parser/documentation mismatch. Fixed GREEN: `GreenS2FixR1`–`R5` PASS.
- Scenario 3: `BaselineFallbackFinal`, `BaselineS3R3`–`R6` FAIL; `BaselineS3R2` canceled. First guided batch: `GreenS3EvidenceR1`–`R3` PASS; `R4`, `R5` FAIL for missing evaluated result. Final batch: `GreenS3FinalR1`, `R2`, `R5`, `R6`, `R8` PASS; `R3`, `R4` canceled; `R7` FAIL for missing concrete scenario.
- Scenario 4: Baseline `S4Base2`, `S4Base3` FAIL (flat two-file CLI, no layers); `S4Base1` canceled before writing files, excluded. First guided batch: `S4Guided2`, `S4Guided3` PASS; `S4Guided1` FAIL (invented `@domain/...` aliases, reported by the guard as bare packages). After the alias rule: `S4Guided5` PASS; `S4Guided4` FAIL (read the document and still wrote a flat CLI under the soft Tier 0 wording). After the decisive tier table: `S4Guided6`, `S4Guided7` PASS. `S4Guided4` was resumed once after a self-canceled first attempt; its counted result is the resumed run.

### Scenario 1 final-prompt baseline response (verbatim content)

Tree:

```text
`/tmp/skills/change-control/`
├── `README.md`
└── `SKILL.md`
```

`README.md`:

```markdown
# Change Control

## Incident recovery

- Assign a lead and record verified impact.
- Protect data and evidence.
- Choose the smallest reversible authorized recovery action.
- Communicate facts and uncertainty.
- Verify user-visible service and data integrity.
- Record decisions, outcomes, and follow-ups.
```

`SKILL.md`:

```markdown
---
name: change-control
description: General-purpose incident-recovery reference skill.
---

See `skill://old-incident-guidance` for the source of truth.
```

### Historical observed responses

The following transcriptions are retained as historical evidence only. The Scenario 1 response below predates the final exact prompt (which now supplies the complete incident-recovery outline); do not treat it as a final-prompt baseline. The Scenario 2 and 3 baseline responses remain representative of the cited baseline observations.

### Scenario 1 observed response (verbatim)

```text
/tmp/skills/change-control/
├── README.md
└── SKILL.md
```

`/tmp/skills/change-control/README.md`

```markdown
# Incident Recovery

## Rules

1. Establish the scope and impact of the incident before changing systems.
2. Assign an incident lead and keep a clear record of decisions, actions, and outcomes.
3. Prefer reversible changes. Preserve evidence and existing data before recovery actions.
4. Make one controlled change at a time, and verify its effect before proceeding.
5. Keep affected stakeholders informed about impact, recovery progress, and remaining risk.
6. Confirm service health and data integrity before declaring recovery complete.
7. Record the cause, recovery steps, and follow-up actions after the incident.
```

`/tmp/skills/change-control/SKILL.md`

```markdown
# Incident Recovery

Use `README.md` as the incident-recovery reference.
```

### Scenario 2 observed response (verbatim)

```ts
#!/usr/bin/env bun

const args = Bun.argv.slice(2);
let verbose = false;
let format = "text";
let identifier: string | undefined;
let showHelp = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === "-h" || arg === "--help") {
    showHelp = true;
  } else if (arg === "--verbose") {
    verbose = true;
  } else if (arg === "--format") {
    const value = args[++i];
    if (!value || value.startsWith("-")) {
      console.error("Expected a value after --format");
      process.exit(1);
    }
    format = value;
  } else if (arg.startsWith("-")) {
    // Ignore unrecognized flags.
  } else if (identifier === undefined) {
    identifier = arg;
  } else {
    console.error(`Unexpected argument: ${arg}`);
    process.exit(1);
  }
}

if (showHelp) {
  console.log(`Usage: bun run inspect.ts <identifier> [options]

Options:
  --verbose       Show verbose output
  --format <value> Output format (default: text)
  -h, --help      Show this help`);
  process.exit(0);
}

if (!identifier) {
  console.error("Usage: bun run inspect.ts <identifier> [--verbose] [--format <value>]");
  process.exit(1);
}

console.log(JSON.stringify({ identifier, format, verbose }, null, verbose ? 2 : 0));
```

```sh
bun run inspect.ts item-42
bun run inspect.ts item-42 --verbose
bun run inspect.ts item-42 --format json --verbose
```

### Scenario 3 observed response (verbatim)

Steps:

1. Used only the supplied complete file content; did not check the filesystem.
2. Added guidance to choose local backups for fast, nearby recovery and remote backups for protection from local site or device loss; use both when both needs matter.

Revised file:

```markdown
---
name: backup-policy
description: Use when choosing a recovery copy for service data
---
# Backup Policy

Choose backup targets based on recovery needs. Document the owner, schedule, and last successful restore test.

Choose local backups when fast recovery from nearby failures is the priority. Choose remote backups to protect against loss of the local device or site. Use both when recovery speed and protection from local loss are required.
```

### Calibration notes

- The first structure calibration run was confounded by reading the available legacy layout reference; it produced only SKILL.md and was discarded. The final prompt stipulates that legacy reference is unavailable.
- Early fallback prompts were invalid/ambiguous: the first targeted a nonexistent file, and an intermediate prompt did not clarify whether a bundled fallback was allowed. The final prompt supplies complete file content and explicitly permits only a bundled fallback from the same skill.

- Scenario 1's earlier calibration prompts differed from the final prompt. The final prompt includes the complete incident-recovery rules outline and generic unavailable legacy URI; only `BaselineS1Final6`–`10` and `GreenS1R1`–`R5` count as final-prompt evidence.
- Scenario 3 `GreenS3R1`–`R5` were invalid calibration attempts because they lacked supplied baseline evidence. The first evidence-informed batch (`GreenS3EvidenceR1`–`R3`) passed with concrete response-level outcomes; `R4` and `R5` did not show evaluated outcomes. The fallback now requires scenario/input plus result. Final reps are `GreenS3FinalR1`, `R2`, `R5`, `R6`, and `R8`; `R3`/`R4` canceled due to unavailable workspace files and are excluded, and `R7` did not identify a specific recovery scenario so is excluded. All counted outcomes are labeled conceptual; no external file/runtime execution was performed.
