# CI / Pre-commit Integration

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
  - repo: https://github.com/seochecks-ai/slopless
    rev: v0.2.22
    hooks:
      - id: slopless
        # optional — comment out if docs are hand-written
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

      - name: slopless (optional)
        run: npx -y slopless "**/*.md" || true
```

## Local `package.json` scripts

```json
{
  "scripts": {
    "lint:md": "markdownlint-cli2 \"**/*.md\" \"#node_modules\"",
    "lint:md:fix": "markdownlint-cli2 --fix \"**/*.md\" \"#node_modules\"",
    "lint:md:prose": "vale \"**/*.md\"",
    "lint:md:slop": "slopless \"**/*.md\"",
    "lint:md:all": "npm run lint:md && npm run lint:md:prose && npm run lint:md:slop"
  },
  "devDependencies": {
    "markdownlint-cli2": "^0.22.1",
    "slopless": "^0.2.22"
  }
}
```

Note: `vale` is a Go binary, install via `brew install vale` or `npm i -D vale` (the npm package wraps the binary).

## Editor integration

- **VS Code**: `DavidAnson.vscode-markdownlint` + `errata-ai.vale-vscode`
- **Neovim**: `nvim-lintconfig` with `markdownlint` + `vale`
- **JetBrains**: built-in Markdown plugin + Vale plugin
