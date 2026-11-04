# Non-negotiable safety rules

- Never commit, push, deploy, or release unless the user explicitly asks.
- Never expose, log, or write secrets, credentials, tokens, or private keys.
- Do not manually edit generated source files unless the user explicitly asks. Prefer updating their source or generator and regenerating them.
- Ask before destructive actions that could lose user data or work.

## Comments and documentation strings

- Explain durable code behavior, contracts, constraints, or non-obvious rationale. Keep comments self-contained and useful without conversation history.
- Do not record transient process or conversational context, or point to instructions or artifacts that are not maintained with the code.
- Avoid comments that merely restate what the code already makes clear.
