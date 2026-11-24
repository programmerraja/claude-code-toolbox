# Workflow: Performance Improvement

Measure first, prove the real bottleneck, optimize deliberately without breaking correctness, and verify the gain against the baseline.

## Phase 1 — Target Metric, Workload & Baseline

Define concrete numbers before touching production code:
- **Metric & target:** exact measure (p50/p95 latency, throughput, DB query count, memory, CPU, render time) and what "fast enough" is.
- **Workload:** realistic input size, concurrency, and data volume that reproduces the slowness.
- **Baseline:** help the user set up and run a repeatable measurement (benchmark script, profiler trace, `EXPLAIN ANALYZE`, or query/timing counter) and record the exact baseline numbers.

**Gate:** Do not diagnose or optimize without a concrete baseline (unless the bottleneck is a provable algorithmic/N+1 defect the user explicitly chooses to fix without benchmarking).

## Phase 2 — Hot-Path & Bottleneck Map

Apply **Familiarity Check** (skip the code walkthrough if the user already knows the hot path, and share only the profiling/measurement evidence).

Trace the hot path end-to-end and present **factual bottleneck evidence** only:
- Call chain and execution counts (`file:fn` called N times per request).
- Where time, I/O, or memory actually goes (N+1 queries, missing indexes, sequential network calls, redundant serialization/allocations, lock contention, unnecessary re-renders/recomputation).
- Existing constraints (consistency guarantees, memory limits, rate limits, transaction scope).

**Gate (`Human-First Gate`):** Stop here with zero code changes. Ask the user which bottleneck dominates and how they want to optimize it. If the user asks for suggestions, present 2–3 optimization levers ranked by **expected gain vs. complexity and failure risk** (for example: query/index fix vs. batching vs. caching with invalidation risk).

## Phase 3 — Blueprint

Follow **Blueprint (In-File Stubs + Full Flow)**: the user writes the updated flow and in-file pseudocode stubs targeting **one primary bottleneck per pass** so the measured gain stays attributable.

## Phase 4 — Sparring (Correctness Under Optimization)

Run **Sparring**, specifically stress-testing optimization traps:
- **Correctness & consistency:** stale reads, cache invalidation races, partial batch failures, ordering changes.
- **Resource bounds:** unbounded caches/queues, memory spikes on large inputs, connection pool exhaustion.
- **Worst-case behavior:** cold cache, thundering herd, retry amplification, or skewed data distributions.

**Gate:** Wait for explicit user approval of the Blueprint.

## Phase 5 — Compile, Re-Measure & Sync

1. Execute **Map Contract (Compile)** — implement stubs and ensure correctness tests pass (including any new edge cases introduced by batching/caching/concurrency).
2. **Re-run the exact Phase 1 baseline measurement** under the same workload and record the new numbers.
3. Deliver **Map Sync**, adding a **Before vs. After** table showing the measured delta against the baseline and target.
