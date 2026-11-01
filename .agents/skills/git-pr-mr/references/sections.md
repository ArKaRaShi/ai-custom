# Conditional sections

Use repository templates first. Omit empty or placeholder sections. Summarize behavior rather than listing files. For small changes use two to five bullets. Group multi-subsystem changes by theme.

- **Migrations and deployment:** when schemas, migrations, destructive operations or operational commands change, distinguish additive from destructive changes and provide verified deployment or backfill commands.
- **Configuration:** group new keys in one fenced `dotenv` block. Use `#required` and `#optional` comment lines to label each group. Omit an empty group. Check the application configuration and its fallback behavior to classify each key. For optional keys, state the verified default or automatic behavior when unset. If the classification or default is unknown, say so rather than guessing. Fill in verified, non-sensitive values such as public URLs or ports. Leave sensitive values blank (`API_KEY=`), including credentials, tokens, private URLs, and unknown or uncertain values. Never copy secrets into a description.
- **Performance:** for performance changes, report measured before-and-after results and conditions only when evidence exists. Never invent benchmarks.
- **Breaking changes:** when public contracts change, provide caller migration instructions.
- **Testing:** when checks ran or test files changed, list actual commands and results only when reviewers can access the referenced scripts, tests, and required resources. Omit commands involving untracked local files or reviewer-inaccessible resources. When useful, summarize the observed outcome without local details, such as “Manual browser check passed.” Do not imply a check was reproducible or passed without evidence. Summarize added or updated behavior coverage from the net diff. For more than five test cases, group or collapse details. Summarize suite migrations rather than listing mechanical renames. Claim unchanged coverage only with evidence.
- **Related requests:** when known dependencies exist, place their real URLs at the end.

For all sections, distinguish observed results from unrun checks and avoid speculative claims.
