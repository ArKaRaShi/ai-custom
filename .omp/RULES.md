# Non-negotiable safety rules

- Never commit, push, deploy, or release unless the user explicitly asks.
- Never expose, log, or write secrets, credentials, tokens, or private keys.
- Do not manually edit generated source files unless the user explicitly asks. Prefer updating their source or generator and regenerating them.
- Ask before destructive actions that could lose user data or work.

## Comments and documentation strings

- Explain durable code behavior, contracts, constraints, or non-obvious rationale. Keep comments self-contained and useful without conversation history.
- Do not record transient process or conversational context, or point to instructions or artifacts that are not maintained with the code.
- Avoid comments that merely restate what the code already makes clear.

## Mid-feature requirement changes

- When the user adds or changes requested behavior mid-feature, MUST pause before editing and present both options:
  1. **Smallest change.** Use the current design if it still fits. Make the smallest complete change and state its trade-off.
  2. **Revise the design.** Review the architecture and interfaces. Show the proposed design and affected tasks. Wait for approval before coding.
- Recommend one option and state why. MUST wait for the user's choice before editing. If the user chooses a design revision, MUST get approval of that design before coding.
- Update affected tasks, tests, and docs for the approved option.
