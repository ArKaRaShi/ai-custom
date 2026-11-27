# Lint map

Where each part of a lint rule lives in this repo. Read it before adding or changing a rule. Write `none` for a slot the repo does not have.

| Slot | Value |
| --- | --- |
| Built-in tool config | <for example `pyproject.toml [tool.ruff]`, `eslint.config.js`> |
| Custom check folder | <for example `scripts/lint/check_<topic>.py`> |
| Registry | <the list a runner reads to find checks, or `none` when each check runs alone> |
| Message helper | <the function that formats a finding, or `none`> |
| Report standard | <the doc fixing message shape, severities and exit codes, or `none`> |
| Test folder | <for example `scripts/lint/tests/`> |
| Doc folder | <for example `docs/conventions/`> |
| Rules table | <this file's table below, or the doc that holds it> |
| Run one check | <for example `python scripts/lint/check_<topic>.py <files>`> |
| Tracked or local | <tracked: runs in CI / local: git-ignored, CI unchanged> |

## Rules and what enforces them

| Rule | Doc | Enforced by | State |
| --- | --- | --- | --- |
| <one line: the behaviour the rule keeps> | <doc path#anchor> | <command and rule id> | <Tool / Review / Manual / None yet> |
