#!/bin/sh
# Type-check the hook shared modules and the typecheck wrapper.
# The running omp is a native binary and ships no declarations, so the hook adapters
# under hooks/pre and hooks/post stay out of this check; their category and event
# contracts are enforced at runtime by tests/hooks/standard.test.ts.
set -eu
cd "$(dirname "$0")"

# Bun's type packages live in bun's own cache. Link them so `bun:test` resolves for the
# editor and for tsc, without adding a package manager or a lockfile to this repo.
link_cached() {
  package=$1
  destination=$2
  source=$(ls -d "$HOME"/.bun/install/cache/"$package"@* 2>/dev/null | tail -1)
  if [ -z "$source" ]; then return 0; fi
  if [ -L "$destination" ] && [ "$(readlink "$destination")" = "$source" ]; then return 0; fi
  mkdir -p "$(dirname "$destination")"
  ln -sfn "$source" "$destination"
}

link_cached bun-types .omp/node_modules/bun-types
link_cached @types/bun .omp/node_modules/@types/bun

# Prefer a cached TypeScript 5: the 7.x preview resolves fewer type roots.
typescript=$(ls -d "$HOME"/.bun/install/cache/typescript@5.* 2>/dev/null | tail -1)
if [ -n "$typescript" ]; then
  exec bun "$typescript/bin/tsc" --noEmit -p .omp/tsconfig.hooks.json
fi
exec tsc --noEmit -p .omp/tsconfig.hooks.json
