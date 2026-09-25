# Extending the Framework

Add a shared framework primitive only when two or more authored skills prove the need. A plausible future use or one skill's local convention is not recurrence. Show the repeated need in existing authored skills before proposing a shared rule or primitive.

Before adding it, define a clear behavior contract covering observable inputs, required behavior, failure modes, and recovery steps. Include one complete, copyable example demonstrating the contract in a generic consuming skill. Add behavior-focused tests that fail if a consumer violates the contract. Test observable outcomes rather than wording or copied text.

Consumers bundle framework primitives as guidance, not runtime dependencies. Copy the relevant primitive manually into each consuming skill and adapt only local details. Consuming skills must not import code from `skill-framework` at runtime. Do not add a shared runtime package or a code-distribution generator.

For the canonical directory and placement rules, see [Skill layout](skill-layout.md). For observable CLI behavior, see [CLI contract](primitives/cli.md).
