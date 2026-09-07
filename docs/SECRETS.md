# Secret Credentials Setup

This repo never stores literal API keys or tokens. `.omp/mcp.json` and `.omp/config.yml`
reference secrets only via `${VAR_NAME}` placeholders, resolved from your shell environment
at runtime. Each machine keeps its own credentials locally, outside git.

## 1. Store secrets in `~/.secrets`

Keep raw key/value pairs in a private, non-tracked file:

```bash
touch ~/.secrets
chmod 600 ~/.secrets
```

```text
# ~/.secrets
OPENROUTER_API_KEY=sk-or-...
TAVILY_API_KEY=tvly-...
```

Never commit this file or place it under `~/Disk/ai-custom`.

## 2. Export via `~/.zshrc`

Source `~/.secrets` and export every line as an environment variable:

```bash
# ~/.zshrc
if [ -f "$HOME/.secrets" ]; then
  set -a
  source "$HOME/.secrets"
  set +a
fi
```

`set -a` auto-exports every variable sourced afterward; `set +a` turns that back off so it
does not leak to unrelated assignments later in the file.

## 3. Verify

```bash
printenv OPENROUTER_API_KEY | sed 's/./*/g'   # prints masked value, confirms it's set
```

## 4. Reference in OMP configs

`.omp/mcp.json` (and any OMP config) can then interpolate the variable directly:

```json
{
  "mcpServers": {
    "openrouter": {
      "type": "http",
      "url": "https://mcp.openrouter.ai/mcp",
      "headers": { "Authorization": "Bearer ${OPENROUTER_API_KEY}" }
    }
  }
}
```

OMP resolves `${VAR}` from the process environment when it spawns/connects the server.
Restart the omp session after changing `~/.secrets` or `~/.zshrc` for it to pick up a new
or updated key.

## Per-machine caveat

`~/.secrets` is machine-local and never travels through git. A fresh machine needs its
own file populated with that machine's keys, not a copy of another machine's. `ai-sync
bootstrap` (see README) restores everything else; secrets are the one piece it deliberately
skips.
