#!/usr/bin/env bash
# scripts/review.sh — Two-layer Markdown QA review runner
# Usage: review.sh "<glob>" [--fix] [--min-level=error|warning|suggestion]
set -uo pipefail

GLOB="${1:-**/*.md}"
shift || true

FIX=0
MIN_LEVEL="warning"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_CONFIG="$HOME/.markdownlint-cli2.yaml"
FALLBACK_CONFIG="$SCRIPT_DIR/assets/.markdownlint-cli2.jsonc"

# Config Resolution for markdownlint-cli2
LINT_CONFIG_SOURCE="defaults"
CONFIG_ARG=()
if [ -f ".markdownlint-cli2.jsonc" ] || [ -f ".markdownlint-cli2.yaml" ] || \
   [ -f ".markdownlint.jsonc" ] || [ -f ".markdownlint.yaml" ]; then
  LINT_CONFIG_SOURCE="project-local"
elif [ -f "$USER_CONFIG" ]; then
  LINT_CONFIG_SOURCE="user-global ($USER_CONFIG)"
  CONFIG_ARG=(--config "$USER_CONFIG")
elif [ -f "$FALLBACK_CONFIG" ]; then
  LINT_CONFIG_SOURCE="bundled-asset ($FALLBACK_CONFIG)"
  CONFIG_ARG=(--config "$FALLBACK_CONFIG")
fi

# Config Resolution for Vale
USER_VALE="$HOME/Library/Application Support/vale/.vale.ini"
VALE_CONFIG_SOURCE="disabled"
VALE_CONFIG=()
VALE_STYLES="unknown"
if [ -f .vale.ini ]; then
  VALE_CONFIG_SOURCE="project-local (.vale.ini)"
  VALE_STYLES=$(grep -E "^BasedOnStyles" .vale.ini 2>/dev/null | cut -d= -f2 | xargs || echo "custom")
elif [ -f "$USER_VALE" ]; then
  VALE_CONFIG_SOURCE="user-global ($USER_VALE)"
  VALE_STYLES=$(grep -E "^BasedOnStyles" "$USER_VALE" 2>/dev/null | cut -d= -f2 | xargs || echo "ai-tells, write-good, proselint")
elif [ -f "$SCRIPT_DIR/assets/.vale.ini" ]; then
  VALE_CONFIG_SOURCE="bundled-asset ($SCRIPT_DIR/assets/.vale.ini)"
  VALE_CONFIG=(--config="$SCRIPT_DIR/assets/.vale.ini")
  VALE_STYLES="bundled"
fi

for arg in "$@"; do
  case "$arg" in
    --fix) FIX=1 ;;
    --min-level=*) MIN_LEVEL="${arg#*=}" ;;
  esac
done

echo "==> Tool: markdown-quality (review)"
echo "Target: $GLOB"
echo "FixMode: $([ "$FIX" = "1" ] && echo "enabled" || echo "disabled")"
echo ""

# Helper to run markdownlint-cli2 via local binary or npx
run_markdownlint() {
  if command -v markdownlint-cli2 >/dev/null 2>&1; then
    markdownlint-cli2 ${CONFIG_ARG[@]+"${CONFIG_ARG[@]}"} "$@"
  else
    npx -y markdownlint-cli2 ${CONFIG_ARG[@]+"${CONFIG_ARG[@]}"} "$@"
  fi
}

# --- Phase 1: Standards ---
echo "==> Phase 1: Standards (markdownlint-cli2)"
echo "Config: $LINT_CONFIG_SOURCE"
if [ "$FIX" = "1" ]; then
  run_markdownlint --fix "$GLOB" >/dev/null 2>&1 || true
  echo "Action: auto-fix applied"
fi
LINT_OUT=$(run_markdownlint "$GLOB" 2>&1 || true)
LINT_LINES=$(echo "$LINT_OUT" | grep "MD[0-9]\{3\}" || true)
if [ -z "$LINT_LINES" ]; then
  echo "Status: clean (0 issues)"
  LINT_ERR=0
else
  echo "$LINT_LINES" | sed "s/^/[LINT] /"
  LINT_ERR=$(echo "$LINT_LINES" | grep -c "MD[0-9]\{3\}" || true)
fi
echo ""

# --- Phase 2: Prose & AI-Tells ---
echo "==> Phase 2: Prose & AI-Tells (Vale)"
if command -v vale >/dev/null 2>&1; then
  echo "Config: $VALE_CONFIG_SOURCE"
  echo "Styles: $VALE_STYLES"
  echo "MinAlert: $MIN_LEVEL"

  # Expand glob for Vale since Vale expects file paths or directories
  TARGET_FILES=()
  if [[ "$GLOB" == *"**"* ]]; then
    while IFS= read -r f; do
      [ -f "$f" ] && TARGET_FILES+=("$f")
    done < <(python3 -c "import glob, sys; [print(p) for p in glob.glob(sys.argv[1], recursive=True)]" "$GLOB")
  else
    for f in $GLOB; do
      [ -e "$f" ] && TARGET_FILES+=("$f")
    done
  fi
  if [ ${#TARGET_FILES[@]} -eq 0 ]; then
    TARGET_FILES=("$GLOB")
  fi

  VALE_OUT=$(vale ${VALE_CONFIG[@]+"${VALE_CONFIG[@]}"} --minAlertLevel="$MIN_LEVEL" "${TARGET_FILES[@]}" 2>&1 || true)
  VALE_LINES=$(echo "$VALE_OUT" | grep -E "[[:space:]]+(error|warning)[[:space:]]" || true)
  if [ -z "$VALE_LINES" ]; then
    echo "Status: clean (0 issues)"
    VALE_ERR=0
  else
    echo "$VALE_LINES" | sed "s/^/[VALE] /"
    VALE_ERR=$(echo "$VALE_LINES" | grep -cE "[[:space:]]+(error|warning)[[:space:]]" || true)
  fi
else
  echo "Status: skipped (vale CLI not installed; run 'brew install vale')"
  VALE_ERR=0
fi
echo ""

# --- Summary & Verdict ---
echo "==> Summary"
echo "Standards: $LINT_ERR issue(s)"
echo "Prose/AI:  $VALE_ERR issue(s)"
TOTAL=$((LINT_ERR + VALE_ERR))
if [ "$TOTAL" = "0" ]; then
  echo "Verdict:   CLEAN"
  exit 0
else
  echo "Verdict:   NEEDS_REVIEW ($TOTAL total issues)"
  exit 1
fi
