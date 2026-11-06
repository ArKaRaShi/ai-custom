---
name: principle-explain-the-number
description: Use before measuring, or before trusting, reporting, or acting on a measured number such as a speedup, regression, throughput, latency, or evaluation result.
disable-model-invocation: true
---

# Explain the Number

**Principle:** Explain what limits a measured number, and rule out that it measured something other than the intended work, before acting on it.

**Why:** A number without an explanation is a guess. Errors, cached work, an untuned baseline, a saturated load generator, or noise can each produce a convincing result that does not reflect the change.

## The Pattern

- Write the decision before running: state the result that would change it, and the noise floor.
- Stop when run-to-run spread is larger than the effect.
- Ask "why not double?": state the bounding resource or code path (core, lock, disk, network, load generator).
- Get the limiter from a profile or system counters captured during a run, then map it to source. Reading code is not evidence.
- List what else the number could measure, and rule out each with evidence: errors, skipped or cached work, code that never ran, an untuned side, noise, a piece too small to matter end to end.
- For evaluation results, ask the same of the trials: did every run do the task, and is the gap consistent across trials and models.
- Keep run count, spread, and limiter with the number, in the notes or a linked artifact.

## Paired Example

```text
// Avoid: single run, taken at face value
before 1,200 req/s -> after 2,400 req/s -> "2x faster, ship"

// Prefer: decision, spread, limiter, ruled-out suspects
decision: ship if gain >= 20% on real traffic
5 runs: median +9%, spread +/-15% -> not distinguishable from noise
limiter: load generator at 100% CPU, server idle
suspects: 8% HTTP 500s, one repeated user ID (always cache hit), default pool on baseline
-> re-run with 10,000 distinct users, errors excluded, second load machine
```

Rationale: the first report measured the load generator and a hot cache. The second states what is known and what is not.

## The Tests

- Did I state the deciding result and the noise floor before running?
- Is the spread smaller than the effect?
- Can I say why the number is not twice as good, backed by a profile or counters?
- Did I check errors, cached or skipped work, code that never ran, and an untuned side?
- Do the run count, spread, and limiter travel with the number?
- Is the time saved larger than the time the changed piece took?

**Constraint:** Scale effort to the decision at stake. A throwaway timing needs a sanity check, not a full profile. Never report an unexplained number as a result.

Distinct from `principle-prove-it-works`, which checks that an output is real. This checks that a number means what it appears to mean.

For performance numbers, run the seven questions in `skill://benchmark-checklist`.
