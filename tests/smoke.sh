#!/bin/sh
# Smoke tests for install.sh, promote.sh and demote.sh on throwaway directories.
# Run: sh tests/smoke.sh
set -u

SRC=$(cd "$(dirname "$0")/.." && pwd -P)
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
FAILS=0

pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }
check() { # description, then a command that must succeed
  desc=$1
  shift
  if "$@" >/dev/null 2>&1; then pass "$desc"; else fail "$desc"; fi
}
absent() { [ ! -e "$1" ] && [ ! -L "$1" ]; }

# A fresh fake repo plus fake home folders. Sets REPO and the AI_CUSTOM_* variables.
fresh() {
  T=$ROOT/$1
  mkdir -p "$T/repo/.agents/skills/alpha" "$T/repo/.agents/skills/beta" "$T/repo/.omp/rules" \
    "$T/home/skills" "$T/home/omp" "$T/home/config"
  cp "$SRC/install.sh" "$SRC/lib.sh" "$SRC/promote.sh" "$SRC/demote.sh" "$T/repo/"
  echo alpha >"$T/repo/.agents/skills/alpha/SKILL.md"
  echo beta >"$T/repo/.agents/skills/beta/SKILL.md"
  echo rule >"$T/repo/.omp/rules/one.md"
  echo rule2 >"$T/repo/.omp/rules/two.md"
  : >"$T/repo/externals.txt"
  REPO=$(cd "$T/repo" && pwd -P)
  export AI_CUSTOM_SKILLS_DIR=$T/home/skills AI_CUSTOM_OMP_DIR=$T/home/omp AI_CUSTOM_CONFIG_DIR=$T/home/config
  S=$T/home/skills
  O=$T/home/omp
  C=$T/home/config
}

echo "1. preview changes nothing; apply links; second run is a no-op"
fresh t1
sh "$REPO/install.sh" >"$T/out" 2>&1
check "preview exits 0" [ $? -eq 0 ]
check "preview created no skill link" absent "$S/alpha"
check "preview created no omp link" absent "$O/rules/one.md"
check "preview created no skip file" absent "$C/skip.txt"
sh "$REPO/install.sh" --apply >"$T/out" 2>&1
check "apply links a skill folder" [ "$(readlink "$S/alpha")" = "$REPO/.agents/skills/alpha" ]
check "apply links an omp file" [ "$(readlink "$O/rules/one.md")" = "$REPO/.omp/rules/one.md" ]
sh "$REPO/install.sh" >"$T/out" 2>&1
check "second run reports nothing to do" grep -q '^summary: 0 link, 0 relink, 0 replace, 0 remove, 0 install, 0 conflict' "$T/out"

echo "2. identical copy is replaced after backup; differing copy stops everything"
fresh t2
mkdir -p "$S/alpha/node_modules/x"
echo alpha >"$S/alpha/SKILL.md"
echo junk >"$S/alpha/node_modules/x/f"
sh "$REPO/install.sh" --apply >"$T/out" 2>&1
check "identical folder (ignoring node_modules) becomes a link" [ -L "$S/alpha" ]
check "old folder is kept in a backup" sh -c "find '$C/backups' -name SKILL.md | grep -q alpha"
fresh t2b
echo different >"$S/beta.tmp"
mkdir -p "$S/beta"
echo different >"$S/beta/SKILL.md"
sh "$REPO/install.sh" --apply >"$T/out" 2>&1
check "differing folder makes apply exit 1" [ $? -eq 1 ]
check "conflict is reported with its path" grep -q "CONFLICT.*beta" "$T/out"
check "nothing else was linked" absent "$S/alpha"
check "local folder is untouched" grep -q different "$S/beta/SKILL.md"

echo "3. dangling links are removed; real folders and foreign links are not"
fresh t3
ln -s "$REPO/.agents/skills/gone" "$S/gone"
mkdir "$S/external"
echo x >"$S/external/SKILL.md"
mkdir "$T/elsewhere"
ln -s "$T/elsewhere" "$S/foreign"
ln -s "$REPO/.omp/rules/removed.md" "$O/removed.md"
sh "$REPO/install.sh" --apply >"$T/out" 2>&1
check "dangling skill link removed" absent "$S/gone"
check "dangling omp link removed" absent "$O/removed.md"
check "real external folder kept" [ -f "$S/external/SKILL.md" ]
check "link to elsewhere kept" [ -L "$S/foreign" ]

echo "4. skip list"
fresh t4
sh "$REPO/install.sh" --apply >/dev/null 2>&1
check "apply created skip.txt with a header" grep -q '^# Items from the ai-custom repo' "$C/skip.txt"
printf '%s\n' '# comment' 'agents:be*   # trailing comment' 'omp:rules/two.md' 'agents:typo' >>"$C/skip.txt"
sh "$REPO/install.sh" >"$T/out" 2>&1
check "preview warns about a typo entry" grep -q '^  agents:typo$' "$T/out"
sh "$REPO/install.sh" --apply >/dev/null 2>&1
check "wildcard-skipped skill link removed" absent "$S/beta"
check "exact-skipped omp link removed" absent "$O/rules/two.md"
check "unskipped links stay" [ -L "$S/alpha" ] && [ -L "$O/rules/one.md" ]

echo "5. externals, promote and demote"
fresh t5
printf '%s\n' "ext | touch '$S/ext'" >"$REPO/externals.txt"
sh "$REPO/install.sh" >"$T/out" 2>&1
check "preview lists the install and does not run it" grep -q 'install   ext' "$T/out" && absent "$S/ext"
sh "$REPO/install.sh" --apply --yes >/dev/null 2>&1
check "install ran with --yes" [ -e "$S/ext" ]
printf '%s\n' "bad | false" "later | touch '$S/later'" >"$REPO/externals.txt"
sh "$REPO/install.sh" --apply --yes >"$T/out" 2>&1
check "failed install exits 1" [ $? -eq 1 ]
check "later installs are not attempted" absent "$S/later"
mkdir "$S/mine"
echo mine >"$S/mine/SKILL.md"
sh "$REPO/promote.sh" mine >/dev/null 2>&1
check "promote moves it into the repo" [ -f "$REPO/.agents/skills/mine/SKILL.md" ]
check "promote leaves a link" [ "$(readlink "$S/mine")" = "$REPO/.agents/skills/mine" ]
sh "$REPO/promote.sh" mine >/dev/null 2>&1
check "promote refuses a skill that is already a link" [ $? -eq 1 ]
sh "$REPO/demote.sh" mine >/dev/null 2>&1
check "demote restores a real folder with the same content" [ ! -L "$S/mine" ] && grep -q mine "$S/mine/SKILL.md"
check "demote removes it from the repo" absent "$REPO/.agents/skills/mine"
sh "$REPO/install.sh" --status >"$T/out" 2>&1
check "status lists the demoted folder as unclassified" grep -q '^  mine ' "$T/out"

echo
if [ "$FAILS" -eq 0 ]; then echo "all passed"; else echo "$FAILS failed"; exit 1; fi
