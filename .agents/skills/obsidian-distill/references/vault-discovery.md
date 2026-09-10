# Vault Discovery Protocol

Standardized 4-step resolution order for locating an Obsidian knowledge vault without hardcoding paths.

---

## Resolution Order

```text
1. User-Specified Path
        │ (if absent)
        ▼
2. Environment Variable ($OBSIDIAN_VAULT)
        │ (if absent)
        ▼
3. Dynamic Detection (Locate `.obsidian/` directory)
        │ (if ambiguous or not found)
        ▼
4. Zero Guesswork User Prompt
```

---

### Step 1: Explicit User Path
If the user specifies a path in the conversation or CLI arguments, use it directly. Verify that the directory exists.

### Step 2: Environment Variable
Check for `$OBSIDIAN_VAULT` in the environment:
```bash
if [ -n "$OBSIDIAN_VAULT" ] && [ -d "$OBSIDIAN_VAULT" ]; then
    echo "Found vault: $OBSIDIAN_VAULT"
fi
```

### Step 3: Dynamic Detection
Search for a directory containing `.obsidian/` using fast discovery:
1. Current workspace and parent git repositories.
2. Common local storage directories:
   - `~/Disk/*/`
   - `~/Documents/*/`
   - `~/Vaults/*/`
   - `~/`

```bash
# Fast discovery check
find ~/Disk ~/Documents ~/Vaults -maxdepth 2 -name ".obsidian" -type d 2>/dev/null
```

### Step 4: Zero Guesswork Prompt
If zero or more than one vault matches and you have no explicit path, do not guess. Prompt the user for the vault location before proceeding.

---

## Post-Discovery Introspection

After resolving the vault root:
1. **Read `README.md`** at the vault root to inspect naming conventions and frontmatter styles.
2. **Inspect Existing Folder Ontology**:
   List top-level directories to identify active archetypes (e.g. `01_Projects`, `02_ADRs`, `03_Runbooks`, `Projects`, `Runbooks`). Do not assume fixed folder names.
3. **Discover Templates**:
   Inspect `99_Templates/`, `Templates/`, or `_templates/` to reuse existing templates.
