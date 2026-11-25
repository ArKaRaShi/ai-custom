# Shared setup for install.sh, promote.sh and demote.sh. Source it; do not run it.
# The scripts live in the repo root, so the repo is the directory of the caller.

REPO=$(cd "$(dirname "$0")" && pwd -P)
SKILLS_DIR=${AI_CUSTOM_SKILLS_DIR:-$HOME/.agents/skills}
AGENTS_DIR=${AI_CUSTOM_AGENTS_DIR:-$HOME/.agents}
CLAUDE_SKILLS_DIR=${AI_CUSTOM_CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}
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

# Machine-local omp files: never linked into the agent folder, never promoted.
# They live in the agent folder as real files, so a repo copy is stale, not a source.
is_local_only() {
  case $1 in
    omp:config.yml | omp:config.yml.lock | omp:mcp.json) return 0 ;;
  esac
  return 1
}

# Resolve an item key into KEY, REPO_PATH and LOCAL_PATH.
# Keys are "agents:<skill>", "shared:<path under the agents folder outside skills>",
# "omp:<path under the omp folder>", or a bare skill name.
resolve_key() {
  case $1 in
    omp:*)
      KEY=$1
      REPO_PATH=$REPO/.omp/${1#omp:}
      LOCAL_PATH=$OMP_DIR/${1#omp:}
      ;;
    shared:*)
      KEY=$1
      REPO_PATH=$REPO/.agents/${1#shared:}
      LOCAL_PATH=$AGENTS_DIR/${1#shared:}
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
