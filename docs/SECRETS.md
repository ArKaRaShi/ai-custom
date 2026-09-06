# Secret Credentials Setup

This repo never stores literal API keys or tokens — `.omp/mcp.json` and `.omp/config.yml`
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

`chmod 600` restricts reads to your user. Never commit this file or place it under
`~/Disk/ai-custom`.

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
doesn't leak to unrelated assignments later in the file. Reload with `source ~/.zshrc` or
open a new shell.

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

OMP resolves `${VAR}` from the process environment when it spawns/connects the server —
restart the omp session after changing `~/.secrets` or `~/.zshrc` for it to pick up a new
or updated key.

## New machine checklist

1. Clone this repo and run `ai-sync bootstrap` (README Quick Setup) — safe, contains no
   secrets.
2. Create `~/.secrets` on the new machine with that machine's own keys (never copy the file
   itself across machines via git).
3. Add the `~/.zshrc` sourcing block above if not already present.
4. `source ~/.zshrc`, verify with step 3 above, then start/restart omp.
