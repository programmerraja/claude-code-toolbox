# Workflow: Fixing a Bug in an Existing Feature

Prove the real root cause with evidence before changing code, keep the failure chain in the user's mental map, and lock in a regression test. Composes with `sherlock-holmes`.

## Phase 1 — Pin Down Symptom & Reproduction

Confirm concrete facts before tracing (ask if missing; never guess):
- **Actual vs. expected:** exact error, stack trace, or wrong output vs. expected behavior.
- **Context:** environment, input/data shape, frequency (always vs. intermittent/under load), and recent changes.
- **Repro steps:** how to trigger it reliably.

## Phase 2 — Suspected Flow Walkthrough

Apply **Familiarity Check** (skip if the user already knows the flow around the symptom).

Read the real code and map the execution path around the failure (`entry -> transformations -> branches -> DB/third-party boundaries`). Present the flow neutrally without jumping to a root-cause conclusion unless the user asks.

## Phase 3 — User Hypothesis & Evidence Gathering

Apply **Human-First Gate**:
1. Ask the user where in the flow they suspect the bug originates and why.
2. Accelerate **evidence gathering** (`sherlock-holmes` Phase 3) to test the user's hypothesis:
   - Write a minimal failing reproduction test,
   - Add targeted debug logs (`[DEBUG-...]`) at key decision/boundary points,
   - Inspect `git log` / `git blame`, DB state, or third-party boundary responses.
3. Report what the evidence **proves or rules out**. If the hypothesis is disproved, ask the user for their next hypothesis (or offer 2–3 candidate dimensions — data, logic, state, concurrency, boundaries, environment — if they ask for suggestions).

**Completion criterion:** Root cause is confirmed only when the **full causal chain** (`input + state -> exact code path -> wrong outcome`) matches hard evidence.

## Phase 4 — Blast Radius & Fix Blueprint

Once root cause is proven:
1. Report **blast radius** (all callers of the affected code) and **sibling check** (whether the exact same bug pattern exists elsewhere in the repo).
2. **Gate (`Human-First Gate`):** Ask the user to choose the fix strategy (clean root-cause fix vs. scoped containment + follow-up) and write the fix **Blueprint (In-File Stubs + Full Flow)** directly in the target file(s). On request, compare 2–3 fix options by blast radius, data impact, and reversibility.

## Phase 5 — Sparring

Run **Sparring**, checking specifically:
- Does the fix eliminate the root cause rather than masking the symptom?
- Is existing bad data in the DB or in-flight state handled?
- Are sibling occurrences addressed or explicitly logged as follow-ups?

**Gate:** Wait for explicit user approval of the Blueprint.

## Phase 6 — Compile & Sync

1. Write the **regression test first** and confirm it **fails** on the unfixed code.
2. Execute **Map Contract (Compile)** to implement the approved fix stub(s), confirm the regression test and full relevant suite pass, and remove all temporary debug logs.
3. Deliver **Map Sync**, adding the confirmed **Root-Cause Chain** (2–3 sentences) at the top.
