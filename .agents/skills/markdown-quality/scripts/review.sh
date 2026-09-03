#!/usr/bin/env bash
# markdown-quality review runner
# Aggregates markdownlint-cli2 + Vale + (optional) slopless output into a single report.
# Usage: review.sh "<glob>" [--fix] [--no-slop] [--min-level=error|warning|suggestion]

set -uo pipefail

GLOB="${1:-**/*.md}"
shift || true

FIX=0
SLOP=1
MIN_LEVEL="warning"
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

for arg in "$@"; do
  case "$arg" in
    --fix) FIX=1 ;;
    --no-slop) SLOP=0 ;;
    --min-level=*) MIN_LEVEL="${arg#*=}" ;;
  esac
done

RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; DIM=$'\033[2m'; RST=$'\033[0m'

# Helper to run markdownlint-cli2 via local binary or npx
run_markdownlint() {
  if command -v markdownlint-cli2 >/dev/null 2>&1; then
    markdownlint-cli2 "${CONFIG_ARG[@]}" "$@"
  else
    npx -y markdownlint-cli2 "${CONFIG_ARG[@]}" "$@"
  fi
}

# --- 1. Standards ---
echo "${DIM}── 1/3 Standards (markdownlint-cli2) ──${RST}"
if [ "$FIX" = "1" ]; then
  run_markdownlint --fix "$GLOB" || true
  echo "${DIM}(auto-fix applied; re-running to show remaining)${RST}"
fi
LINT_OUT=$(run_markdownlint "$GLOB" 2>&1 || true)
if [ -z "$LINT_OUT" ] || echo "$LINT_OUT" | grep -q "Summary: 0 issues"; then
  echo "${GRN}✓ no structural issues${RST}"
  LINT_ERR=0
else
  echo "$LINT_OUT" | sed "s/^/[LINT] /"
  LINT_ERR=$(echo "$LINT_OUT" | grep -c "MD[0-9]\{3\}" || true)
fi
echo ""

# --- 2. Prose + Bloat (Vale) ---
echo "${DIM}── 2/3 Prose + Bloat (Vale) ──${RST}"
if command -v vale >/dev/null 2>&1; then
  VALE_CONFIG=()
  if [ ! -f .vale.ini ] && [ -f "$SCRIPT_DIR/assets/.vale.ini" ]; then
    VALE_CONFIG=(--config="$SCRIPT_DIR/assets/.vale.ini")
  fi
  VALE_OUT=$(vale "${VALE_CONFIG[@]}" --minAlertLevel="$MIN_LEVEL" "$GLOB" 2>&1 || true)
  if [ -z "$VALE_OUT" ]; then
    echo "${GRN}✓ no prose/bloat issues${RST}"
    VALE_ERR=0
  else
    echo "$VALE_OUT" | sed "s/^/[VALE] /"
    VALE_ERR=$(echo "$VALE_OUT" | grep -cE "^(error|warning)" || true)
  fi
else
  echo "${YEL}⊘ vale CLI not installed — skipping (brew install vale)${RST}"
  VALE_ERR=0
fi
echo ""

# --- 3. AI-Slop (optional) ---
if [ "$SLOP" = "1" ]; then
  echo "${DIM}── 3/3 AI-Slop (slopless) ──${RST}"
  if command -v slopless >/dev/null 2>&1 || npx -y slopless --version >/dev/null 2>&1; then
    SLOP_OUT=$(npx -y slopless "$GLOB" 2>&1 || true)
    if [ -z "$SLOP_OUT" ]; then
      echo "${GRN}✓ no AI-slop detected${RST}"
      SLOP_ERR=0
    else
      echo "$SLOP_OUT" | sed "s/^/[SLOP] /"
      SLOP_ERR=$(echo "$SLOP_OUT" | grep -c "✖" || true)
    fi
  else
    echo "${YEL}⊘ slopless not installed — skipping (npm i -D slopless)${RST}"
    SLOP_ERR=0
  fi
  echo ""
else
  SLOP_ERR=0
fi

# --- Verdict ---
echo "${DIM}── SUMMARY ──${RST}"
echo "  Standards:   $LINT_ERR issue(s)"
echo "  Prose/Bloat: $VALE_ERR issue(s)"
echo "  AI-Slop:     $SLOP_ERR issue(s)"
TOTAL=$((LINT_ERR + VALE_ERR + SLOP_ERR))
if [ "$TOTAL" = "0" ]; then
  echo "  ─────────────────────────"
  echo "  ${GRN}VERDICT: ✅ clean${RST}"
  exit 0
else
  echo "  ─────────────────────────"
  echo "  ${YEL}VERDICT: ⚠️  $TOTAL issue(s) to review${RST}"
  exit 1
fi
