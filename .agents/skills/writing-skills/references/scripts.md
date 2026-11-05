# Scripts

Rules for code bundled in a skill's `scripts/`.

- Handle errors inside the script. A missing file gets created with a default or reported with the fix, never passed to the agent as a stack trace.
- Explain every constant: why this timeout, why this retry count. A value the author can't justify is a value the agent can't tune.
- Say in `SKILL.md` whether the agent runs a script ("Run `analyze.ts`") or reads it as reference ("See `analyze.ts` for the algorithm"). Running costs only the output, so prefer it.
- For batch or destructive work, write a plan file, check it with a script, then execute. Validation errors list the valid values: `field 'signature_date' not found. Available: customer_name, order_total`.
- Anything that writes or deletes previews first and acts only with `--apply`.
- List required tools and versions in `SKILL.md`, with the install command. Never assume a tool is present.
- Name MCP tools in full, `Server:tool_name`. The agent then finds the right tool among many servers.
- Use forward slashes in paths.
- Keep rules in plain functions and I/O at the edges, so tests don't need mocks. Test through the real entry point.
