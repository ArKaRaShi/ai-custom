#!/bin/sh
# Make a local skill or omp file shared: move it into the repo and leave a link behind.
#
#   ./promote.sh [-n] <skill>          a skill folder in the skills folder
#   ./promote.sh [-n] omp:<path>       a file under the omp agent folder
#   -n                                 show what would happen and change nothing
set -eu

. "$(dirname "$0")/lib.sh"

DRY=0
if [ "${1-}" = "-n" ]; then DRY=1; shift; fi
if [ $# -ne 1 ]; then
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
fi

resolve_key "$1"
if [ -L "$LOCAL_PATH" ]; then
  echo "$LOCAL_PATH is already a link; nothing to promote" >&2
  exit 1
fi
if [ ! -e "$LOCAL_PATH" ]; then
  echo "$LOCAL_PATH does not exist" >&2
  exit 1
fi
if [ -e "$REPO_PATH" ]; then
  echo "$REPO_PATH already exists in the repo; resolve it first" >&2
  exit 1
fi

echo "move  $LOCAL_PATH -> $REPO_PATH"
echo "link  $LOCAL_PATH -> $REPO_PATH"
[ "$DRY" -eq 1 ] && exit 0

mkdir -p "$(dirname "$REPO_PATH")"
mv "$LOCAL_PATH" "$REPO_PATH"
ln -s "$REPO_PATH" "$LOCAL_PATH"
echo "promoted $KEY. Review it, then commit and push the repo."
