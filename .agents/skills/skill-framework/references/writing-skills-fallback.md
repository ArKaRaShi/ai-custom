# Writing-Skills Fallback

Use this procedure only when `skill://writing-skills` is unavailable or unreadable. Otherwise, use the required writer skill instead. Do not replace it with a different skill.

For every skill edit, complete the full RED-GREEN-REFACTOR cycle:

1. **Baseline (RED):** run the relevant scenario without candidate guidance. Do not write or expose candidate guidance before this run.
2. **Record the failure:** capture the actual observed failure, including the choice or omission that justifies the guidance. Do not substitute a hypothetical failure.
3. **Write minimal guidance (GREEN):** add only the guidance that addresses the observed failure.
4. **Rerun the same scenario:** with candidate guidance available, run the same scenario under the same conditions and confirm observed behavior meets the contract.
5. **Close observed loopholes (REFACTOR):** address rationalizations or gaps revealed by the rerun, then rerun the scenario to verify changes.
6. **Verify:** confirm final guidance produces the required behavior and record evidence. Do not skip the baseline, infer success from reading text, or replace the same-scenario rerun with a different check.

Verification evidence MUST identify the scenario/input and its observed output or outcome. An
instruction to record a result later is not verification. If the task supplies
no external runtime, label a response-level simulation and record the evaluated
input and result without claiming external execution.
