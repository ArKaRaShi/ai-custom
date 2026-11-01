# Paired Examples Standard

This guide defines the format and rules for writing paired code and documentation examples.

> **Index:**
>
> | Section | Lines | Anchor |
> | :--- | :--- | :--- |
> | The Core Rule | L19-L28 | [#the-core-rule](#the-core-rule) |
> | Canonical Syntax | L29-L59 | [#canonical-syntax](#canonical-syntax) |
> | Mandatory Rationale Contract | L60-L73 | [#mandatory-rationale-contract](#mandatory-rationale-contract) |
> | Scope Boundaries | L74-L99 | [#scope-boundaries](#scope-boundaries) |
> | Writing Rules for Bad Examples | L100-L108 | [#writing-rules-for-bad-examples](#writing-rules-for-bad-examples) |
> | Writing Rules for Preferred Examples | L109-L117 | [#writing-rules-for-preferred-examples](#writing-rules-for-preferred-examples) |
> | Common Anti-Patterns in Authoring | L118-L126 | [#common-anti-patterns-in-authoring](#common-anti-patterns-in-authoring) |

An agent reads examples to identify boundaries and invariants. Showing only a preferred pattern allows the reader to generate variations that violate the rule. Pairing an explicit anti-pattern with the correct pattern sets clear boundaries.

## The Core Rule

Every technical rule or convention that defines a code pattern MUST include paired examples:

1. One `# Avoid:` block showing the exact pattern to reject.
2. One `# Prefer:` block showing the approved code pattern.
3. A concise rationale explaining the specific failure mode.

Do not write standalone positive examples when defining an engineering pattern.

## Canonical Syntax

Format code examples with standard comment prefixes matching the target language:

```python
# Avoid: bare exception handler
try:
    record = fetch_row(user_id)
except Exception:
    pass

# Prefer: specific exception with explicit logging
try:
    record = fetch_row(user_id)
except UserNotFoundError as err:
    logger.warning("User %s not found: %s", user_id, err)
    raise
```

Rationale: bare exception handlers mask database connection drops and memory limits. Specific handlers allow callers to recover from expected errors.

For Markdown documentation rules, use Markdown comments or section headers:

```markdown
<!-- Avoid: passive recommendations -->
You may want to consider using the local sandbox.

<!-- Prefer: strict imperatives -->
Run all tests against the local database sandbox.
```

## Mandatory Rationale Contract

Every paired block must include a 1 to 2 sentence explanation directly beneath it. The explanation must identify at least one of these consequences:

| Consequence | Description |
| --- | --- |
| Resource leak | Memory, file descriptors, or connections left open |
| Silent failure | Errors caught and suppressed without log entries |
| Corrupted state | Inconsistent database rows or cache data drift |
| Tool breakage | Broken parser execution, CLI exit failures, or invalid JSON output |
| Token bloat | Context window exhaustion from redundant narrative text |

Do not write vague rationales such as "This is cleaner" or "This is best practice". State the concrete risk directly.

## Scope Boundaries

Use paired examples for patterns and decisions. Do not force them into reference catalogs.

### Mandatory Scenarios

Apply paired examples in these contexts:

- Architecture patterns, such as service boundaries versus direct database queries in views.
- Error handling strategies, such as catching specific exceptions versus broad handlers.
- Typing contracts, such as explicit data structures versus arbitrary dictionary objects.
- Database querying conventions, such as batched queries versus correlated loops.
- Test writing standards, such as deterministic builders versus shared mutable state.

### Prohibited Scenarios

Do not write `# Avoid:` blocks in these contexts:

- CLI command references and flag tables.
- Environment variable tables and configuration catalogs.
- Data schema definitions and SQL column listings.
- API endpoint dictionaries.
- Step-by-step installation instructions.

Inventing artificial bad examples for factual reference tables wastes tokens and increases parsing errors.

## Writing Rules for Bad Examples

The `# Avoid:` block must show realistic code that developers or agents write:

1. **Use authentic anti-patterns:** copy the exact mistake observed in reviews or baseline runs.
2. **Keep scope minimal:** show only the lines relevant to the rule.
3. **Never write unrealistic examples:** do not invent absurd syntax that no real code contains.
4. **Mirror the domain:** use project-relevant symbols and APIs instead of generic placeholder names.

## Writing Rules for Preferred Examples

The `# Prefer:` block must show complete, runnable, and idiomatic syntax:

1. **Provide complete declarations:** include required imports and explicit return types.
2. **Match established project patterns:** do not introduce novel external libraries.
3. **Verify the snippet:** verify that the snippet passes type checking and linting.
4. **Keep identical structure:** keep variable names identical between Avoid and Prefer blocks.

## Common Anti-Patterns in Authoring

| Mistake | Why it fails | Correct approach |
| --- | --- | --- |
| Single snippet | Variations appear valid | Always write `# Avoid:` first, then `# Prefer:` |
| Missing rationale | Reader misses the severity | State the exact failure mode beneath the pair |
| Artificial example | Reader learns nothing from unrealistic syntax | Use real errors observed in baseline tests |
| Unbalanced blocks | Differences become hard to isolate | Keep both snippets identical except for the target pattern |
