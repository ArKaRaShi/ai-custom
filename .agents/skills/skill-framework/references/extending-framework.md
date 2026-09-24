# Extending the Framework

Add a shared framework primitive only when its need is demonstrated across multiple authored skills. A plausible future use or a single skill's local convention is not recurrence; show the repeated need in existing authored skills before proposing a shared rule or primitive.

Before adding it, define a clear behavior contract: observable inputs or conditions, required behavior, and relevant failure or boundary behavior. Include one complete, copyable example that demonstrates the contract in a generic consuming skill. Add behavior-focused tests that would fail if a consumer violated the contract; test observable outcomes rather than wording or copied text.

Framework primitives are guidance to be bundled by consumers, not runtime dependencies. Copy the relevant primitive manually into each consuming skill and adapt only its local details. Consuming skills must not import code from `skill-framework` at runtime. Do not add a shared runtime package or a code-distribution generator.

For the canonical directory and placement rules, see [Skill layout](skill-layout.md). For observable CLI behavior, see [CLI contract](primitives/cli.md).
