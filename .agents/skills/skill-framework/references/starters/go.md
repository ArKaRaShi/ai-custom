# Go skills

Copy `assets/starters/go/go.mod` into a Go skill only if it does not already own a module. Set the module path to the skill's actual identity; the example path is not a distribution endpoint. Add the real command and behavior tests. Existing modules keep their configuration.

The `go 1.27` directive is a language/toolchain minimum, not an exact compiler pin. Use an installed compatible Go toolchain. No shared Bun installation, `go.work`, formatter config, or additional linter is required.

## Explicit setup

For external module dependencies, explicitly run `GOTOOLCHAIN=local go mod download` inside the skill after approval. Keep `go.mod` and `go.sum`. Missing dependencies during checks are errors, not permission to install. Install an adequate compiler explicitly if the local one is too old.

## Check and fix

Run these checks inside the skill, in this order:

1. `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GONOPROXY=none go vet ./...`
2. `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GONOPROXY=none go test ./...`
3. `formatting=$(gofmt -l .) && test -z "$formatting"`

None of them download modules or toolchains or modify authored files. Go may write its machine-local build cache. GONOPROXY=none stops private-module settings from bypassing GOPROXY=off, and capturing the listing before testing it makes parse errors in files the current platform skips fail the check.

Repair formatting explicitly with `gofmt -w .`, then check again. `gofmt` has no configurable indentation policy. Build binaries outside the synced skill directory, such as `GOTOOLCHAIN=local go build -o /tmp/my-skill ./scripts/my-skill` for a command under `scripts/`, the only subdirectory the layout reference allows for code.

ai-sync transfers the skill's source, `go.mod` and `go.sum`; caches and compiled binaries stay machine-local. A Go-only machine does not need the shared Bun files.
