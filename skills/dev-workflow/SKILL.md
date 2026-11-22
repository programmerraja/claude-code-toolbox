---
name: dev-workflow
description: Manual-grade engineering workflow accelerated by AI so the human keeps full codebase mental models, judgment, and learning. Classifies the task and routes to a dedicated playbook for building a new feature, adding/changing a feature inside an existing flow, fixing a bug, or improving performance.
---

# Mental-Map Engineering Workflow

Mirror how a strong engineer works manually — let AI compress **reading, searching, measuring, and typing**, while the human owns **topology, design judgment, diagnosis, and the mental map**.

## Step 1 — Classify & Route

Classify the user's task into one workflow below. If the boundary is genuinely ambiguous (for example, new feature vs. extending an existing flow), ask one clarifying question before proceeding.

Read **only** the matching workflow file and execute its phases in order:

| Task | Trigger cues | Workflow |
|---|---|---|
| **New feature** | Greenfield capability, new endpoint/module/job with minimal existing flow | [`workflows/new-feature.md`](workflows/new-feature.md) |
| **Extend existing flow** | Adding, changing, or integrating behavior inside an existing pipeline/feature | [`workflows/extend-existing.md`](workflows/extend-existing.md) |
| **Bug fix** | Broken behavior, wrong output, error, regression, or unexpected state | [`workflows/bug-fix.md`](workflows/bug-fix.md) |
| **Performance** | Slow latency, high CPU/memory, heavy DB queries, throughput bottleneck | [`workflows/performance.md`](workflows/performance.md) |

---

## Shared Mechanics

Every workflow references these six mechanics by name. Apply them identically across all workflows.

### Familiarity Check

Before walking through existing code, ask whether the user already knows the target area or flow.
- **If yes:** skip the recon walkthrough and move directly to the user's thinking step.
- **If no (or partial):** read the real files and deliver only the factual map specified by the active workflow.

### Human-First Gate

Every discovery/evidence phase ends on a hard stop: present **only factual codebase reality and evidence**, then ask the user to propose their approach, hypothesis, or strategy.
- Hold back your own solution by default so the user wrestles with the problem first.
- **When the user asks for suggestions:** present **2–3 contrasting options with concrete tradeoffs** (complexity, coupling, blast radius, reversibility) and let the user choose rather than prescribing one answer.

### Blueprint (In-File Stubs + Full Flow)

Before any production code is written, the user writes:

1. **Full Flow** (in chat or as a short header comment at the entry point): call chain plus key happy, edge, and failure branches (`entry.ts:handler -> service.ts:fn -> repo.ts:fn`).
2. **Per-File Pseudocode Stubs** directly inside the actual codebase files (creating new files or opening existing ones) as function shells + 3–8 line plain-English comment steps covering inputs, outputs, core steps, and error branches. Skip imports, full types, and syntax ceremony.

```ts
// File: services/order.ts
// Flow: routes/orders.ts:handleCreate -> services/order.ts:createOrder
//       -> services/pricing.ts:calculateTotal -> repos/orderRepo.ts:insertOrder

export async function createOrder(input, deps) {
  // 1. validate input shape; throw ValidationError on bad items
  // 2. total = calculateTotal(input.items)
  // 3. inside tx: insertOrder({ ...input, total, idempotencyKey })
  //    - on unique violation -> fetch & return existing order
  // 4. after commit: emit OrderCreated
}
```

When the user says stubs are ready, inspect `git status` and `git diff` (plus any files they name) to read every stub in full before responding.

### Sparring

Critique the user's Blueprint against the real codebase — still writing zero implementation code:

- **Codebase fit:** existing helpers/patterns to reuse, naming conventions, affected callers or contracts.
- **Blind spots:** missing edge cases, nulls/empties, retries, idempotency, race conditions, transaction or error boundaries.
- **Seams and depth:** apply `codebase-design` vocabulary — flag shallow pass-throughs, misplaced responsibilities, or leaky interfaces.
- **Alternative (only if materially cleaner):** pitch as a tradeoff ("X vs. your Y, because Z") and let the user decide.

**Gate:** Wait for the user to adjust or explicitly approve the Blueprint before editing any code.

### Map Contract (Compile)

Implement every approved in-file pseudocode stub into clean, idiomatic production code and tests:

- Preserve the user's exact **file paths**, **stubbed function names**, and **call order**. until it was if you have better suggestion propose to them
- Replace temporary pseudocode/TODO markers with real implementation (keep comments only where a non-obvious *why* remains useful).
- **Structural deviations** — creating/splitting/renaming a file, renaming a stubbed/exported function, shifting ownership across files, or changing the call order — require **pausing and asking the user first**, stating the concrete constraint discovered and the proposed adjustment.
- Run the repo's relevant checks (types, lint, tests) before reporting completion.

### Map Sync

Close every implementation with a compact summary:

1. **Final Call Map:** the actual landed flow (`file:fn -> file:fn`) confirming alignment with the Blueprint.
2. **Drift Log:** every difference from the user's stubs (private helpers, extra error branches, compiler-forced signature tweaks) and *why*. Write `None` if exact.
3. **Gotchas to Remember:** 1–2 non-obvious facts discovered during implementation (framework quirks, subtle invariants, edge behaviors) worth keeping in the user's mental map.
