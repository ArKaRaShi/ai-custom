# CI / Pre-commit Integration

Wire the two-phase QA pipeline into pre-commit hooks and CI so the checks run before a doc merges.

## Pre-commit hook (`.pre-commit-config.yaml`)

```yaml
repos:
  - repo: https://github.com/DavidAnson/markdownlint-cli2
    rev: v0.22.1
    hooks:
      - id: markdownlint-cli2
        args: ["--fix"]
  - repo: https://github.com/errata-ai/vale-action
    rev: v2.1.2
    hooks:
      - id: vale
  # (ai-tells rules are run directly by Vale via .vale.ini)
```

Install: `pip install pre-commit && pre-commit install`.

## GitHub Actions (`.github/workflows/markdown-quality.yml`)

```yaml
name: markdown-quality
on:
  pull_request:
    paths: ['**/*.md', '**/*.mdx', '.markdownlint-cli2.jsonc', '.vale.ini', '.vale/**']
  push:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: markdownlint-cli2
        uses: DavidAnson/markdownlint-cli2-action@v19
        with:
          globs: |
            **/*.md
            **/*.mdx

      - name: Vale
        uses: vale-cli/vale-action@v2.1.2
        with:
          files: |
            **/*.md
            **/*.mdx
          fail_on_error: true
          reporter: github-pr-review


```

## Local `package.json` scripts

```json
{
  "scripts": {
    "lint:md": "markdownlint-cli2 \"**/*.md\" \"#node_modules\"",
    "lint:md:fix": "markdownlint-cli2 --fix \"**/*.md\" \"#node_modules\"",
    "lint:md:prose": "vale \"**/*.md\"",
    "lint:md:all": "npm run lint:md && npm run lint:md:prose"
  },
  "devDependencies": {
    "markdownlint-cli2": "^0.23.2"
  }
}
```

Note: `vale` is a Go binary, install via `brew install vale` or `npm i -D vale` (the npm package wraps the binary).

## Commit message hook (`.git/hooks/commit-msg`)

Git passes the message file as `$1`. That file ends with `#` comment lines that Markdown reads as headings, so the hook strips them and reviews the rest as commit text. `--commit` adds the `ai-tells-commits` rules. AI-tell findings are warnings, so the hook blocks only on errors such as misspellings.

```bash
#!/bin/bash
bun "$HOME/.agents/skills/markdown-quality/scripts/review.ts" --mode=human --commit --no-links --no-structure --no-density --text="$(grep -v '^#' "$1")"$'\n'
```

## Editor integration

- **VS Code**: `DavidAnson.vscode-markdownlint` + `errata-ai.vale-vscode`
- **Neovim**: `nvim-lintconfig` with `markdownlint` + `vale`
- **JetBrains**: built-in Markdown plugin + Vale plugin
