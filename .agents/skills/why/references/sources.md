# Evidence sources

Inspect available OMP tools, mounted MCP descriptions, and their schemas before use. Do not assume a named vendor or a source is available. Search proportionately: a direct answer to a narrow question may not require every available source, but report what was not searched and why. Search linked leads when they could change the conclusion. Use read-only operations; do not write to external systems.

## Categories

1. **Source control:** inspect `git blame -L <start>,<end> -- <file>`, `git log --follow -p -- <file>`, `git log -S '<text>' -- <file>`, and relevant `git show` output. Check full commit messages, linked PR descriptions and reviews, nearby comments, tests, ADRs, changelogs, and co-changed files. A patch proves the change, not its motive. Git or PR access can be unavailable; report failures rather than assuming access.
2. **Issues:** start with linked IDs, then search feature names, symbols, and business terms. Read descriptions, comments, parent/duplicate issues, project context, and linked decisions; note dates and scope changes.
3. **Long-form docs:** search specs, ADRs, PRDs, meeting notes, postmortems, and related pages using names, errors, and dates. Check draft status and whether the shipped implementation diverged.
4. **Team chat:** search feature names, PR URLs, errors, authors, and dates around the decision; read full threads. Report inaccessible channels, retention limits, and authentication failures.
5. **Infrastructure observability:** identify owning services; search time-bounded incidents, monitors, metrics, dashboards, traces, and narrow log patterns around the change. A matching spike or threshold suggests a connection but does not prove motivation.
6. **Error tracking:** search exceptions, messages, symbols, and files; inspect full events, stack traces, first/last seen, affected releases, counts, and resolution notes. AI-generated incident analyses are hypotheses, not primary evidence.
7. **Product analytics warehouse:** discover actual schemas and tables before querying; use read-only, time-bounded, aggregated queries for usage, experiment exposure, distributions, or query history. Record exact queries, tables, time windows, and counts or percentiles. Account for sampling, instrumentation changes, schema drift, and retention; never infer causation from timing alone.

For defensive code, also search incidents, postmortems, reliability tickets, reverts, and incident channels near its introduction. If a source's history predates retention, report the gap rather than a zero result.

## Investigator handoff

When delegation is appropriate, give each read-only investigator the original question, target paths/lines and symbols, seed commits, PRs and tickets, and a distinct bounded source or slice. Ask for: searches and items opened; direct evidence with quote, exact location, author and date; indirect evidence with alternatives; contradictions; null results, access or retention gaps; and cross-source leads. Read full relevant records, not only titles. Synthesize and follow leads without treating an investigator's interpretation as an original source.
