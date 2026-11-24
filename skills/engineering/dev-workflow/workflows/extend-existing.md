# Workflow: Adding or Changing a Feature in an Existing Flow

Integrate new behavior into an existing pipeline without leaving tangled special cases, broken invariants, or surprise regressions.

## Phase 1 — Clarify Change & Invariants

Confirm before tracing:
- **New requirement:** exact new behavior, inputs, outputs, and edge cases.
- **Preserved invariants:** what existing callers, data formats, API contracts, or behaviors must stay intact.

Ask clarifying questions for any ambiguity; do not guess.

## Phase 2 — Existing Flow & Coupling Map

Apply **Familiarity Check** (if the user already knows how the existing flow works, confirm only the specific coupling points/callers they want checked, or skip straight to the gate).

Read the real code and trace the existing flow end-to-end (following `explainer` discipline: real function, table, column, and queue names; concrete shapes for complex payloads):
- **Current execution flow:** entry points, call chain (`file:fn -> file:fn`), and DB/side-effect boundaries.
- **Coupling points:** shared tables, implicit ordering, and every caller depending on current return shapes or side effects.
- **Chesterton's Fences:** non-obvious guards, retry/idempotency keys, or legacy constraints that must not be casually broken.
- **Design friction:** exact spots where the new requirement fights the existing code's shape.

**Gate (`Human-First Gate`):** Stop here with zero proposed code. Ask the user how they want to integrate the change:
- Extend an existing seam,
- Refactor first to make the change easy (*make the change easy, then make the easy change*), or
- Redesign the affected area from first principles.

If the user asks for suggestions, present 2–3 contrasting integration strategies with blast-radius and complexity tradeoffs.

## Phase 3 — Blueprint

Follow **Blueprint (In-File Stubs + Full Flow)**: the user writes the updated full flow and puts per-file pseudocode stubs directly in the touched (and any new) files.

## Phase 4 — Sparring (With Blast-Radius Check)

Run **Sparring**, plus explicitly verify:
- **Blast radius:** every existing caller, consumer, and test affected by changed signatures, side effects, or data shapes.
- **Backward compatibility:** existing DB rows, in-flight jobs/events, or older API callers during rollout.
- **Clean seam vs. bolt-on:** call out if special-case conditionals are leaking across multiple layers where a small seam refactor would be cleaner.

**Gate:** Wait for explicit user approval of the Blueprint.

## Phase 5 — Compile & Sync

1. Execute **Map Contract (Compile)** — implement stubs and add/update tests proving both the **new behavior** and **untouched existing paths**.
2. Deliver **Map Sync**.
