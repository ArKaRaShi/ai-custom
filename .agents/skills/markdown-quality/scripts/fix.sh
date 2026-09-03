#!/usr/bin/env bash
# scripts/fix.sh — Fast structural markdown auto-fixer
# Usage: fix.sh "<glob>"
set -euo pipefail

TARGET="${1:-**/*.md}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_CONFIG="$HOME/.markdownlint-cli2.yaml"
FALLBACK_CONFIG="$SCRIPT_DIR/assets/.markdownlint-cli2.jsonc"

# Config Resolution: Local project config > User $HOME config > Bundled asset
CONFIG_ARG=()
if [ ! -f ".markdownlint-cli2.jsonc" ] && [ ! -f ".markdownlint-cli2.yaml" ] && \
   [ ! -f ".markdownlint.jsonc" ] && [ ! -f ".markdownlint.yaml" ]; then
  if [ -f "$USER_CONFIG" ]; then
    CONFIG_ARG=(--config "$USER_CONFIG")
  elif [ -f "$FALLBACK_CONFIG" ]; then
    CONFIG_ARG=(--config "$FALLBACK_CONFIG")
  fi
fi

# Run global binary if installed, or npx fallback
if command -v markdownlint-cli2 >/dev/null 2>&1; then
  markdownlint-cli2 ${CONFIG_ARG[@]+"${CONFIG_ARG[@]}"} --fix "$TARGET"
else
  npx -y markdownlint-cli2 ${CONFIG_ARG[@]+"${CONFIG_ARG[@]}"} --fix "$TARGET"
fi
