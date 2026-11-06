#!/bin/sh
# Make a shared skill or omp file local to this Mac: move it out of the repo.
# Other Macs lose it on their next install.sh --apply, because their link dangles.
#
#   ./demote.sh [-n] <skill>
#   ./demote.sh [-n] omp:<path>
#   -n    show what would happen and change nothing
set -eu

. "$(dirname "$0")/lib.sh"

DRY=0
if [ "${1-}" = "-n" ]; then DRY=1; shift; fi
if [ $# -ne 1 ]; then
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
fi

resolve_key "$1"
if [ ! -L "$LOCAL_PATH" ] || [ "$(readlink "$LOCAL_PATH")" != "$REPO_PATH" ]; then
  echo "$LOCAL_PATH is not a link to $REPO_PATH; nothing to demote" >&2
  exit 1
fi
if [ ! -e "$REPO_PATH" ]; then
  echo "$REPO_PATH is missing from the repo" >&2
  exit 1
fi

echo "unlink $LOCAL_PATH"
echo "move   $REPO_PATH -> $LOCAL_PATH"
[ "$DRY" -eq 1 ] && exit 0

rm "$LOCAL_PATH"
mv "$REPO_PATH" "$LOCAL_PATH"
case $KEY in
  omp:*) rmdir -p "$(dirname "$REPO_PATH")" 2>/dev/null || true ;;
esac
echo "demoted $KEY. The repo now has a pending deletion; commit and push it."
