#!/usr/bin/env bash
# scripts/fix.sh — Fast structural markdown auto-fixer
# Usage: fix.sh "<glob>"
set -euo pipefail

TARGET="${1:-**/*.md}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_CONFIG="$HOME/.markdownlint-cli2.yaml"
FALLBACK_CONFIG="$SCRIPT_DIR/assets/.markdownlint-cli2.jsonc"

CONFIG_SOURCE="defaults"
CONFIG_ARG=()
if [ -f ".markdownlint-cli2.jsonc" ] || [ -f ".markdownlint-cli2.yaml" ] || \
   [ -f ".markdownlint.jsonc" ] || [ -f ".markdownlint.yaml" ]; then
  CONFIG_SOURCE="project-local"
elif [ -f "$USER_CONFIG" ]; then
  CONFIG_SOURCE="user-global ($USER_CONFIG)"
  CONFIG_ARG=(--config "$USER_CONFIG")
elif [ -f "$FALLBACK_CONFIG" ]; then
  CONFIG_SOURCE="bundled-asset ($FALLBACK_CONFIG)"
  CONFIG_ARG=(--config "$FALLBACK_CONFIG")
fi

ENGINE="markdownlint-cli2"
if ! command -v markdownlint-cli2 >/dev/null 2>&1; then
  ENGINE="npx markdownlint-cli2"
fi

echo "==> Tool: markdown-quality (fix)"
echo "Target: $TARGET"
echo "Engine: $(command -v markdownlint-cli2 2>/dev/null || echo "$ENGINE")"
echo "Config: $CONFIG_SOURCE"
echo ""

if [ "$ENGINE" = "markdownlint-cli2" ]; then
  OUT=$(markdownlint-cli2 ${CONFIG_ARG[@]+"${CONFIG_ARG[@]}"} --fix "$TARGET" 2>&1 || true)
else
  OUT=$(npx -y markdownlint-cli2 ${CONFIG_ARG[@]+"${CONFIG_ARG[@]}"} --fix "$TARGET" 2>&1 || true)
fi

FIX_COUNT=$(echo "$OUT" | grep -oE "Attempted: [0-9]+ fixes" | grep -oE "[0-9]+" || echo "0")
REMAINING=$(echo "$OUT" | grep -c "MD[0-9]\{3\}" || true)

if [ "$REMAINING" = "0" ]; then
  if [ "$FIX_COUNT" != "0" ]; then
    echo "Status: auto-fix applied ($FIX_COUNT issues resolved)"
  else
    echo "Status: clean (0 issues to fix)"
  fi
  echo "Verdict: CLEAN"
  exit 0
else
  echo "Status: auto-fix applied ($FIX_COUNT issues resolved, $REMAINING manual fixes required)"
  echo "$OUT" | grep "MD[0-9]\{3\}" | sed "s/^/[LINT] /"
  echo "Verdict: NEEDS_REVIEW ($REMAINING remaining issues)"
  exit 1
fi
