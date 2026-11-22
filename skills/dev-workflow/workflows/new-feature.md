# Workflow: Building a New Feature

Build a greenfield capability aligned with repo conventions, deliberate module seams, and clear one-way-door decisions.

## Phase 1 — Clarify Scope & Boundaries

Confirm before exploring deeply:
- **Goal:** what user/system problem this solves and what "done" looks like.
- **Boundaries:** key edge cases, failure modes, and what is explicitly out of scope.
- **One-way doors:** schema/migrations, public API contracts, event formats, or external dependencies that are expensive to change later.

Ask sharp clarifying questions wherever requirements are ambiguous; do not assume.

## Phase 2 — Codebase Landscape

Apply **Familiarity Check** (skip to the gate if the user already knows the repo's conventions and touchpoints).

Read the relevant real files and present a **Landscape Map** only:
- Closest existing features or patterns worth mirroring (real file paths).
- Reusable modules, shared helpers, and DB/API/test conventions.
- **Coupling touchpoints:** every existing area this new feature must connect to (routes, auth, config, tables, queues, shared types).

**Gate (`Human-First Gate`):** Stop here. Ask the user to propose the data shape, module seams, and end-to-end flow. If the user asks for suggestions, present 2–3 contrasting designs with concrete tradeoffs (drawing on `codebase-design` / `DESIGN-IT-TWICE`) and let them choose.

## Phase 3 — Blueprint

Follow **Blueprint (In-File Stubs + Full Flow)**: the user creates/opens the real files, writes the full flow, and adds per-file function shells + plain-English pseudocode comments.

## Phase 4 — Sparring

Run **Sparring**, paying extra attention to:
- One-way doors (table/column shapes, unique keys, API contracts).
- Whether new modules are **deep** (small interface, hidden complexity) rather than shallow pass-throughs.
- Whether any existing repo helper already solves part of a stub.

**Gate:** Wait for explicit user approval of the Blueprint.

## Phase 5 — Compile & Sync

1. Execute **Map Contract (Compile)** — implement stubs + flow-level tests covering happy, edge, and failure paths.
2. Deliver **Map Sync**.
