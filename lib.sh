# Shared setup for install.sh, promote.sh and demote.sh. Source it; do not run it.
# The scripts live in the repo root, so the repo is the directory of the caller.

REPO=$(cd "$(dirname "$0")" && pwd -P)
SKILLS_DIR=${AI_CUSTOM_SKILLS_DIR:-$HOME/.agents/skills}
OMP_DIR=${AI_CUSTOM_OMP_DIR:-$HOME/.omp/agent}
CONFIG_DIR=${AI_CUSTOM_CONFIG_DIR:-$HOME/.config/ai-custom}
SKIP_FILE=$CONFIG_DIR/skip.txt
EXTERNALS=$REPO/externals.txt

# True when the symlink $1 points inside the repo.
link_into_repo() {
  case $(readlink "$1") in
    "$REPO"/*) return 0 ;;
  esac
  return 1
}

# Resolve an item key into KEY, REPO_PATH and LOCAL_PATH.
# Keys are "agents:<skill>", "omp:<path under the omp folder>", or a bare skill name.
resolve_key() {
  case $1 in
    omp:*)
      KEY=$1
      REPO_PATH=$REPO/.omp/${1#omp:}
      LOCAL_PATH=$OMP_DIR/${1#omp:}
      ;;
    agents:*)
      KEY=$1
      REPO_PATH=$REPO/.agents/skills/${1#agents:}
      LOCAL_PATH=$SKILLS_DIR/${1#agents:}
      ;;
    *)
      KEY=agents:$1
      REPO_PATH=$REPO/.agents/skills/$1
      LOCAL_PATH=$SKILLS_DIR/$1
      ;;
  esac
}
