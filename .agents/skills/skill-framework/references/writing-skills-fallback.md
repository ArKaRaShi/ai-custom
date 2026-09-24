# Writing-Skills Fallback

Use this procedure only when `skill://writing-skills` is unavailable or unreadable. Otherwise, use the required writer skill instead. Do not replace it with a different skill.

For every skill edit, complete the full RED-GREEN-REFACTOR cycle:

1. **Baseline (RED):** Run the relevant scenario without the candidate guidance. Do not write or expose the candidate guidance before this run.
2. **Record the failure:** Capture the actual observed failure, including the choice or omission that demonstrates the guidance is needed. Do not substitute a hypothetical failure.
3. **Write minimal guidance (GREEN):** Add only the guidance that addresses the observed failure.
4. **Rerun the same scenario:** With the candidate guidance available, run the same scenario under the same relevant conditions and confirm the observed behavior now meets the intended contract.
5. **Close observed loopholes (REFACTOR):** Address rationalizations or gaps revealed by the rerun, then rerun the scenario to verify the changes.
6. **Verify:** Confirm the final guidance produces the required behavior and record the evidence. Do not skip the baseline, infer success from reading the text, or replace the same-scenario rerun with a different check.

Verification evidence MUST identify the scenario/input and its observed output or outcome; an
instruction to record a result later is not verification. If the task supplies
no external runtime, label a response-level simulation and record the evaluated
input and result without claiming external execution.
