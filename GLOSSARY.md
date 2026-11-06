# ai-custom

Shared agent configuration for every Mac you use: skills and OMP settings kept in one git repository.

## Language

**Repo**:
The git clone of ai-custom on a Mac, and the only copy of every authored item.
_Avoid_: Backup, remote copy, source root

**Authored**:
A skill or OMP file you wrote and share through the repo. The Mac's folder links into the repo.
_Avoid_: Tracked, synced, own skill

**External**:
A skill installed by someone else's tool and kept as a real folder on each Mac. The repo records only its install command.
_Avoid_: Third-party, vendored, untracked

**Local-only**:
A file that exists on one Mac and is never in the repo, such as machine config or runtime state.
_Avoid_: Excluded, ignored

**Link**:
A symlink from a Mac's skills or OMP folder into the repo. Authored items appear on a Mac through links.
_Avoid_: Mirror, copy, binding

**Skip list**:
A per-Mac file naming authored items that Mac must not link.
_Avoid_: Exclude list, opt-out file, allow list

**Preview**:
The default mode of the installer. It lists every action and changes nothing.
_Avoid_: Dry run, plan

**Apply**:
Running the installer with `--apply` to carry out the previewed actions. It refuses to start while any conflict exists.
_Avoid_: Sync, push, execute

**Conflict**:
A real local item that differs from the repo copy, so the installer will not replace it.
_Avoid_: Drift, modified

**Promote**:
Move a local item into the repo and leave a link behind, making it authored.
_Avoid_: Track, adopt

**Demote**:
Move an authored item out of the repo into a real local folder, making it local to one Mac.
_Avoid_: Untrack, retire
