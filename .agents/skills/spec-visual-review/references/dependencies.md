# Dependencies and Setup

Tier 1 TypeScript CLI (`scripts/cli.ts`) plus a Python worker that runs a local Thai translation model. Another Mac restores the skill with ai-sync and prepares it with two commands.

## Runtime Requirements

| Need | Version | Used for |
| --- | --- | --- |
| `bun` | 1.4 or newer (tested with 1.4.4) | Runs the CLI and the tests |
| `uv` | tested with 0.13.6 | Creates the locked Python environment |
| Python | 3.12.x, installed by `uv` | Runs the translation worker |
| Apple Silicon Mac | `arm64` macOS | MLX runs only on Apple Silicon |
| `node` | any current release (tested with 24) | Verification only: `node --check` on the template script |
| Disk | about 2.5 GB for the model, plus the Python environment | Model weights and packages |

The CLI needs two npm packages at run time, `marked` and `zod`, so run `bun install --frozen-lockfile` once on each Mac. The dev packages below are for checking the skill's own code.

## Declared Packages and Justification

| Package | Version | Why external code is needed |
| --- | --- | --- |
| `marked` | 18.1.2 | Converts Markdown stages to blocks; handles nested lists and tables. |
| `zod` | 4.6.7 | Validates `stages.json` and `blocks.json`; exact error paths guide fixes. |
| `@biomejs/biome` | 2.5.15 (dev) | Lint and format checks that the framework's TypeScript starter requires |
| `typescript` | 7.0.2 (dev) | Type checking under `strict` |
| `@types/bun` | 1.4.2 (dev) | Type definitions for `Bun.spawn` and `bun:test` |
| `mlx-lm` | 0.32.2 (`pyproject.toml`, locked in `uv.lock`) | Runs the MLX model; too large to inline. Transitive packages, including `huggingface-hub`, are locked. |
| Model `typhoon-ai/typhoon-translate-4b-mlx-4bit` | revision `2bd2fa4c727739403bb5a32e5839110de911d901` | English to Thai translation without API tokens. Governed by the Gemma license and the OpenTyphoon terms. |

Python is pinned to `3.12.*` in `pyproject.toml`. Python 3.15 fails to build `sentencepiece` here, because no prebuilt wheel exists and `cmake` is missing.

## Deterministic Installation

Run from `~/.agents/skills/spec-visual-review`. Skill CLI downloads and writes need `--apply`; install packages with the Bun command below.

```bash
# Tooling for checks (primary; restores bun.lock exactly)
bun install --frozen-lockfile

# Preview the translator setup, then run it
bun scripts/cli.ts setup
bun scripts/cli.ts setup --apply
```

`setup --apply` runs `uv sync --frozen`, which restores `uv.lock`, into `$XDG_CACHE_HOME/spec-visual-review/venv` (default `~/.cache/spec-visual-review/venv`). That folder lives outside the skill, so ai-sync never carries it. It then downloads the pinned model revision into the Hugging Face cache, which is `~/.cache/huggingface/hub` unless `HF_HUB_CACHE` or `HF_HOME` is set.

Fallbacks:

| Situation | Command |
| --- | --- |
| No `bun.lock` match, or `pnpm` or `npm` only | `pnpm install` or `npm install`. These ignore `bun.lock`, so versions can drift. |
| `uv` missing | `brew install uv`, then rerun `setup`. The framework's `poetry` and `venv` fallbacks are not supported here because `uv.lock` is the only lockfile. |

## Failure Recovery

| Error signature | Cause | Command |
| --- | --- | --- |
| `✖ failed ... uv is not installed` | `uv` is not on `PATH` | `brew install uv` |
| `Translator exited with 1: ... LocalEntryNotFoundError` or `offline` | Model not downloaded on this Mac | `bun scripts/cli.ts setup --apply` |
| `Translator exited with ... No such file` or `Failed to spawn` | Environment not created | `bun scripts/cli.ts setup --apply` |
| `Failed to build sentencepiece` | `uv` picked Python 3.15 | Run `setup`; it passes `--python 3.12` |
| `N items have no Thai line` | Spec changed after the last translation | `bun scripts/cli.ts translate <spec> --apply` |
| `Cannot find module` during `bun run check` | The tooling packages are missing | `bun install --frozen-lockfile` in the skill folder |
| `Cannot find package 'marked'` or `'zod'` | Run-time packages are missing | `bun install --frozen-lockfile` in the skill folder |

Remove the translator from a Mac by deleting the environment folder above and `models--typhoon-ai--typhoon-translate-4b-mlx-4bit` inside the effective Hugging Face cache (defaults: `~/.cache/spec-visual-review` and `~/.cache/huggingface/hub`). These removals have not been run end to end.

## Sync Notes

ai-sync carries `package.json`, `bun.lock`, `pyproject.toml`, `uv.lock`, the configs, and the scripts. Keep `node_modules`, `.venv`, and `__pycache__` out of the backup. Thai records live next to each spec in `.visual-review/thai.json`. They hold machine translations and a human `overrides` section.
