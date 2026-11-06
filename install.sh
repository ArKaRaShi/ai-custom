#!/bin/sh
# Link this repo into the Mac: authored skills and omp files become symlinks.
# Previews by default and changes nothing. Pass --apply to execute.
#
#   ./install.sh            preview every action
#   ./install.sh --apply    execute; refuses to start when any conflict exists
#   ./install.sh --status   list skill folders that are neither linked nor in externals.txt
#   --yes                   with --apply, run externals.txt commands without asking
set -eu

. "$(dirname "$0")/lib.sh"

APPLY=0
STATUS=0
YES=0
for arg in "$@"; do
  case $arg in
    --apply) APPLY=1 ;;
    --status) STATUS=1 ;;
    --yes) YES=1 ;;
    -h | --help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

TAB=$(printf '\t')
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
PLAN=$WORK/plan
KEYS=$WORK/keys
: >"$PLAN"
: >"$KEYS"

op() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "${4-}" >>"$PLAN"; }
count() { grep -c "^$1$TAB" "$PLAN" || true; }

trim() { printf '%s' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'; }

# Print each skip.txt entry on its own line, comments and blanks removed.
skip_entries() {
  [ -f "$SKIP_FILE" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line=$(trim "${line%%#*}")
    [ -n "$line" ] && printf '%s\n' "$line"
  done <"$SKIP_FILE"
  return 0
}

is_skipped() {
  [ -f "$SKIP_FILE" ] || return 1
  skip_entries >"$WORK/skip"
  while IFS= read -r pattern; do
    # shellcheck disable=SC2254
    case $1 in $pattern) return 0 ;; esac
  done <"$WORK/skip"
  return 1
}

same_content() {
  if [ -d "$1" ] && [ -d "$2" ]; then
    diff -r -x node_modules -x .DS_Store "$1" "$2" >/dev/null 2>&1
  elif [ -f "$1" ] && [ -f "$2" ]; then
    cmp -s "$1" "$2"
  else
    return 1
  fi
}

conflict_detail() {
  if [ -d "$1" ] && [ -d "$2" ]; then
    diff -rq -x node_modules -x .DS_Store "$1" "$2" 2>&1 | sed -n '1,6p'
  elif [ -f "$1" ] && [ -f "$2" ]; then
    diff "$1" "$2" 2>&1 | sed -n '1,8p'
  else
    echo "repo and local entries are different kinds (file versus folder)"
  fi
}

# plan_item <repo path> <local path> <key>
plan_item() {
  src=$1
  dst=$2
  key=$3
  printf '%s\n' "$key" >>"$KEYS"
  if is_skipped "$key"; then
    if [ -L "$dst" ] && link_into_repo "$dst"; then op UNLINK "$dst" "skipped on this Mac"; fi
    return 0
  fi
  if [ -L "$dst" ]; then
    cur=$(readlink "$dst")
    [ "$cur" = "$src" ] && return 0
    case $cur in
      "$REPO"/*) op RELINK "$src" "$dst" ;;
      *) op CONFLICT "$dst" "is a link to $cur, outside this repo" ;;
    esac
    return 0
  fi
  if [ ! -e "$dst" ]; then
    op LINK "$src" "$dst"
    return 0
  fi
  if same_content "$src" "$dst"; then
    op REPLACE "$src" "$dst"
  else
    detail_file=$WORK/detail.$(count CONFLICT)
    conflict_detail "$src" "$dst" >"$detail_file"
    op CONFLICT "$dst" "differs from the repo copy" "$detail_file"
  fi
}

# --- build the plan --------------------------------------------------------

if [ ! -d "$REPO/.agents/skills" ] && [ ! -d "$REPO/.omp" ]; then
  echo "nothing to link: $REPO has no .agents/skills or .omp" >&2
  exit 1
fi

if [ "$STATUS" -eq 0 ]; then
  for src in "$REPO"/.agents/skills/*; do
    [ -e "$src" ] || continue
    name=${src##*/}
    plan_item "$src" "$SKILLS_DIR/$name" "agents:$name"
  done

  if [ -d "$REPO/.omp" ]; then
    find "$REPO/.omp" -type f ! -name .DS_Store | sort >"$WORK/omp-files"
    while IFS= read -r src; do
      rel=${src#"$REPO"/.omp/}
      plan_item "$src" "$OMP_DIR/$rel" "omp:$rel"
    done <"$WORK/omp-files"
  fi

  # Links into the repo whose target was renamed or deleted.
  for dst in "$SKILLS_DIR"/* "$SKILLS_DIR"/.[!.]*; do
    [ -L "$dst" ] || continue
    link_into_repo "$dst" || continue
    [ -e "$dst" ] || op UNLINK "$dst" "dangling, target left the repo"
  done
  if [ -d "$OMP_DIR" ]; then
    find "$OMP_DIR" \( -name sessions -o -name blobs -o -name cache -o -name memories -o -name node_modules \) -prune \
      -o -type l -lname "$REPO/*" -print >"$WORK/omp-links"
    while IFS= read -r dst; do
      [ -e "$dst" ] || op UNLINK "$dst" "dangling, target left the repo"
    done <"$WORK/omp-links"
  fi

  # External skills that are missing on this Mac.
  if [ -f "$EXTERNALS" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      case $line in '' | '#'*) continue ;; esac
      name=$(trim "${line%%|*}")
      rest=${line#*|}
      cmd=$(trim "${rest%%|*}")
      [ -n "$name" ] && [ -n "$cmd" ] || continue
      is_skipped "agents:$name" && continue
      [ -e "$SKILLS_DIR/$name" ] || [ -L "$SKILLS_DIR/$name" ] || op INSTALL "$name" "$cmd"
    done <"$EXTERNALS"
  fi
fi

# Skip entries that match nothing in the repo are usually typos.
stale_skip_entries() {
  [ -f "$SKIP_FILE" ] || return 0
  for src in "$REPO"/.agents/skills/*; do
    [ -e "$src" ] && printf 'agents:%s\n' "${src##*/}"
  done >"$WORK/all-keys"
  if [ -d "$REPO/.omp" ]; then
    find "$REPO/.omp" -type f ! -name .DS_Store | sed "s|^$REPO/.omp/|omp:|" >>"$WORK/all-keys"
  fi
  skip_entries >"$WORK/entries"
  while IFS= read -r pattern; do
    found=0
    while IFS= read -r key; do
      # shellcheck disable=SC2254
      case $key in $pattern) found=1; break ;; esac
    done <"$WORK/all-keys"
    [ "$found" -eq 1 ] || printf '%s\n' "$pattern"
  done <"$WORK/entries"
}

# --- status mode -----------------------------------------------------------

if [ "$STATUS" -eq 1 ]; then
  echo "unclassified skill folders in $SKILLS_DIR"
  echo "(real folders, not in the repo, not in externals.txt)"
  found=0
  for dir in "$SKILLS_DIR"/*; do
    [ -e "$dir" ] || continue
    [ -L "$dir" ] && continue
    name=${dir##*/}
    [ -e "$REPO/.agents/skills/$name" ] && continue
    if [ -f "$EXTERNALS" ] && grep -q "^[[:space:]]*$name[[:space:]]*|" "$EXTERNALS"; then continue; fi
    found=1
    echo "  $name  -> ./promote.sh $name   or add it to externals.txt"
  done
  [ "$found" -eq 1 ] || echo "  none"
  stale=$(stale_skip_entries)
  if [ -n "$stale" ]; then
    echo "skip.txt entries that match nothing in the repo:"
    printf '%s\n' "$stale" | sed 's/^/  /'
  fi
  exit 0
fi

# --- report ----------------------------------------------------------------

if [ "$APPLY" -eq 1 ]; then echo "install.sh --apply"; else echo "install.sh preview (nothing is changed)"; fi
echo "repo: $REPO"
while IFS="$TAB" read -r kind a b c; do
  case $kind in
    LINK) printf '  link      %s -> %s\n' "$b" "$a" ;;
    RELINK) printf '  relink    %s -> %s\n' "$b" "$a" ;;
    REPLACE) printf '  replace   %s  (identical to repo; the old copy goes to a backup)\n' "$b" ;;
    UNLINK) printf '  remove    %s  (%s)\n' "$a" "$b" ;;
    INSTALL) printf '  install   %s  via: %s\n' "$a" "$b" ;;
    CONFLICT)
      printf '  CONFLICT  %s %s\n' "$a" "$b"
      sed 's/^/      /' "$c"
      ;;
  esac
done <"$PLAN"

n_conflict=$(count CONFLICT)
echo "summary: $(count LINK) link, $(count RELINK) relink, $(count REPLACE) replace, $(count UNLINK) remove, $(count INSTALL) install, $n_conflict conflict"
if [ ! -f "$SKIP_FILE" ]; then echo "skip list: $SKIP_FILE does not exist yet; --apply creates it"; fi
stale=$(stale_skip_entries)
if [ -n "$stale" ]; then
  echo "skip.txt entries that match nothing in the repo:"
  printf '%s\n' "$stale" | sed 's/^/  /'
fi

if [ "$n_conflict" -gt 0 ]; then
  echo "Resolve each conflict (move or delete the local copy, or promote it), then rerun." >&2
  [ "$APPLY" -eq 1 ] && echo "Nothing was changed." >&2
  exit 1
fi
if [ "$APPLY" -eq 0 ]; then
  echo "Run again with --apply to execute."
  exit 0
fi

# --- apply -----------------------------------------------------------------

if [ ! -f "$SKIP_FILE" ]; then
  mkdir -p "$CONFIG_DIR"
  cat >"$SKIP_FILE" <<'EOF'
# Items from the ai-custom repo that this Mac must not link.
# One entry per line: <root>:<path>. Text after # is ignored. * matches any characters.
#   agents:db-sandbox        a skill folder
#   agents:principle-*       every skill whose name starts with principle-
#   omp:rules/*              files under the omp agent folder
# An existing link for a skipped item is removed on the next --apply.
EOF
  echo "created $SKIP_FILE"
fi

BACKUP=$CONFIG_DIR/backups/$(date +%Y%m%d-%H%M%S)
while IFS="$TAB" read -r kind a b c; do
  case $kind in
    LINK)
      mkdir -p "$(dirname "$b")"
      ln -s "$a" "$b"
      ;;
    RELINK)
      rm "$b"
      ln -s "$a" "$b"
      ;;
    REPLACE)
      mkdir -p "$BACKUP$(dirname "$b")"
      mv "$b" "$BACKUP$b"
      ln -s "$a" "$b"
      ;;
    UNLINK)
      rm "$a"
      ;;
    INSTALL)
      if [ "$YES" -ne 1 ]; then
        if [ ! -r /dev/tty ]; then
          echo "install $a needs approval and there is no terminal; rerun with --yes" >&2
          exit 1
        fi
        printf 'Run for %s:\n  %s\nProceed? [y/N] ' "$a" "$b" >/dev/tty
        read -r answer </dev/tty
        case $answer in y | Y | yes) ;; *) echo "skipped $a"; continue ;; esac
      fi
      if ! sh -c "$b" </dev/null; then
        echo "install failed for $a; later installs were not attempted" >&2
        exit 1
      fi
      ;;
  esac
done <"$PLAN"

echo "done."
[ -d "$BACKUP" ] && echo "replaced folders were moved to $BACKUP"
exit 0
