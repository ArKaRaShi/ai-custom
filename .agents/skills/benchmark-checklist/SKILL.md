---
name: benchmark-checklist
description: Use when running a benchmark, or before reporting or acting on a measured speedup or regression, to vet limiter, tuning, limits, errors, repeatability, relevance, and whether the work ran.
disable-model-invocation: true
---

# Benchmark checklist

Seven questions for a performance number: a PR's before and after, a regression claim, a harness, or a library or config choice. Answer each with evidence from a run, not a guess from reading code. Pairs with `principle-explain-the-number`.

For a quick ballpark the user asked for, one run is enough. Still check questions 4 and 7, and say it is one run. Skip the rest unless that run looks wrong. A choice between options is never a ballpark.

## Before you run

1. Write the claim you expect to make, in the words you would ship. Example: "export is 30% faster at p50 on the 60k-row dataset". The questions test that sentence. Exit: the claim is written.
2. Read the measurement script. Note what it times, counts, and ignores. Exit: you can say what the timed region contains.
3. Check load with `uptime` and cores with `nproc`. If the machine is busy, find what is running. If you cannot stop it, interleave the sides so both see the same noise, and say so in the report. Exit: load is recorded.

## The questions

1. **Why not double?** State the limiter.
   - Profile in a run you do not report, because profilers slow the work.
   - Use CPU per process (`top`, `pidstat`), a runtime profiler (`py-spy`, `perf`, `node --cpu-prof`), I/O wait, and syscall counts (`strace -c` on Linux). Map the hot spot to source.
   - Watch the load generator: if it saturates first, you measured the load generator.
   - If a change did not move the number, the limiter explains why. Find it before calling the change useless.
2. **Was it tuned?** Run every side as production runs it: release builds, production flags and env, batching and transaction settings, connection pools, production-like cache state, same versions and data.
   - If one side runs on defaults, you compared configurations, not implementations.
   - A limiter that is a setting (a commit per row, a debug build, a missing index) means that side is untuned. Tune it and measure again.
   - If you cannot tune it, do not pick a winner from that run.
3. **Did it break limits?** Do the arithmetic.
   - Compare bytes per second with disk and network bandwidth, and operations per second times cost per operation with your cores.
   - Removing a piece that takes 10% of the run makes the run at most about 11% faster.
   - A result past a limit measured something other than the work: a cache, a no-op, or a bug.
4. **Did it error?** Count failures and non-success responses, and check that outputs are correct, not only present. Rejections are often fast, and timeouts and retries are slow. If the script does not count errors, add the count.
5. **Does it reproduce?** Run each side at least 5 times, alternating A, B, A, B so warmup, caches, and drift favor neither. Report the median and range. A gap smaller than run-to-run variation is no measurable difference. For a close call, use a rank-sum test or the harness's own statistics.
6. **Does it matter?** Next to any micro result, measure the end-to-end path a user waits on, with realistic data sizes and concurrency. Report the micro result as a share of the whole. A helper that takes 1% of a request makes the request at most 1% faster.
7. **Did it happen?** Confirm the work ran inside the timed region: the request reached the server, the rows were written, the bytes were read, and the code used the result. Lazy generators nobody iterates, promises nobody awaits, and results a JIT can discard produce numbers for work that never ran.

## Report

- Lead with the verdict: faster, slower, no measurable difference, or inconclusive.
- Give the number with unit, run count, range, and limiter. Example: "p50 41 ms to 33 ms, median of 7 runs per side, range 32 to 35 ms after, bound by JSON parsing on one core."
- Call the verdict inconclusive when you claim a difference but cannot state the limiter, when a side ran untuned, or when you could not check questions 4 and 7. State the gap.
- Keep a PR body to one primary number. Put the runs, range, and limiter evidence in a linked artifact or notes file.
