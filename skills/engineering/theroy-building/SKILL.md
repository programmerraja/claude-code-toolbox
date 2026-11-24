---
name: programming-theory-builder
description: Build and test a working theory of a codebase, a feature area, or a set of changes (uncommitted work, branch, commit range, PR) from source, tests, runtime behaviour, and docs. Use when exploring unfamiliar code, understanding what changed and why it works, verifying code you did not write by hand, or preparing to modify an existing system.
disable-model-invocation: true
---

# Programming Theory Builder

Build a working theory of the software, not a description of its files. Inspired by Peter Naur's *Programming as Theory Building* (1985).

The theory covers: what problem the software solves, why it is structured this way, how components interact, what assumptions it depends on, how data and control flow, what happens when conditions change, and what is safe to modify.

File lists, function summaries, and architecture diagrams are not evidence of understanding. The goal is to let a developer reason about the system and change it without blindly trusting the code or an explanation of it.

## Principles

- **Code is evidence, not the whole theory.** Label every claim:
  - **Observed:** directly supported by code, tests, or runtime behaviour.
  - **Inferred:** a reasonable explanation from evidence.
  - **Unknown:** cannot be established yet.

  Never present an inferred intention as fact. Never invent requirements.
- **Relationships over files.** For any function or component: who calls it, what it calls, what data it reads and changes, who depends on its output, and what assumptions hold between them.
- **Progressive depth.** Go from purpose, to architecture, to execution paths, to data, to decisions, to failures. Never try to absorb the whole repo at once.
- **Every explanation is a hypothesis.** This includes the author's, a comment's, the README's, and an AI's explanation of its own code. Authorship does not matter: code is treated the same whether a human or an AI wrote it. Verify against source, tests, logs, schemas, contracts, or git history. When evidence contradicts the theory, change the theory.

## Step 0: Pick the Scope

Ask the user if the scope is unclear. Understanding is always relative to scope, so state the scope in the first line of the output.

- **Whole repo or feature area:** run the Workflow below, starting at Phase 1.
- **Changes** (uncommitted work, a branch, a commit range, a PR, or "what I changed"): run the Change Mode below.

## Workflow

For each phase, use real file paths and symbols. Skip a phase only when the scope makes it irrelevant.

### 1. System boundary
What does it do, who or what interacts with it, what are its inputs and outputs, and what does it depend on (external services, databases, queues, UIs)? Identify entry points, processes, and main modules. Do not invent business requirements. Ask the user when code alone cannot answer.

### 2. Architecture
Identify modules, dependencies, service boundaries, config, shared utilities, data access, workers, and integrations. For each important component: what it owns, what it depends on, who depends on it, what crosses its boundary, and what happens if it fails.

### 3. Execution paths
Pick the important operations and trace each end to end (for example: request, route, middleware, service, database, external API, response). Read the real implementation, not just function names: branches, state changes, reads and writes, async work, error handling, retries, and return values. For async systems, include events, queues, callbacks, and concurrency boundaries.

### 4. Data and invariants
For each important entity: where it originates, its schema, lifecycle, transformations, persistence, consumers, and invalidation. Trace at least one real example through the system. List the **invariants** (conditions that must stay true, such as "a message is never processed twice"). Record only invariants supported by code, tests, specs, or observed behaviour.

### 5. Design decisions
For important decisions: what problem it solves, what alternatives exist, what constraints shaped it, and what trade-offs it carries. Look in comments, git history, PRs, tests, and config. Do not assume the author weighed every alternative. If the reason is not available, mark it **Unknown**.

### 6. Failure behaviour
A theory that explains only the success path is incomplete. Cover invalid or missing input, network failures, timeouts, partial failures, duplicate requests, concurrency, database and dependency failures, and unexpected state transitions. For each important failure: where it happens, how it is detected and propagated, how the system recovers, and what state remains.

### 7. Test the theory
Use the theory to predict behaviour, then compare with reality. For example: empty input, a dependency timeout, two simultaneous requests, a missing record, a replaced function. Ask which tests should fail if an assumption is wrong. Run tests or small experiments where possible. A theory is useful when it explains existing behaviour and predicts the effect of changes.

### 8. Change impact
Before modifying code, identify: the component being changed, its direct dependencies, downstream consumers, relevant invariants, affected execution paths, existing tests, missing tests, and likely regressions. After the change, compare actual behaviour with the prediction and update the theory.

## Change Mode

Use this for a set of changes. Start from the diff, then expand outward only as far as needed.

1. **Get the diff.** Use `git status` and `git diff` for uncommitted work, `git diff <base>...HEAD` for a branch, or the PR/commit range the user names. Read all of it.
2. **Get the requirement.** What was this change meant to do? Take it from the user, ticket, or PR description. Do not infer it from the code alone. If unavailable, ask.
3. **Map the change.** List the changed components. Then expand to their callers, callees, data touched, and tests, until you reach a boundary that the change cannot affect.
4. **Trace behaviour before and after.** Walk the changed execution paths (Phase 3), including data (Phase 4) and failure paths (Phase 6).
5. **Check against the requirement.** Does the change satisfy it? Which assumptions does it rely on? What did it decide implicitly (defaults, ordering, error handling, naming a concept)?
6. **Verify.** Run the relevant tests or an experiment (Phase 7). Note missing tests.
7. **Report.** Give the change theory: what changed and why it should work, assumptions, implicit decisions, regression risks, missing tests, and unresolved questions, each labeled Observed, Inferred, or Unknown.

## Output

Answer in chat by default. If the user wants to keep it, save a single file `theory/<scope-slug>.md` containing only the sections that matter for the scope (overview, architecture, execution flows, data and invariants, design decisions, failure modes, evidence, change impact, open questions). It is a representation of the theory, not the theory itself. Link it to real files and tests, and do not copy the codebase into Markdown.


## Completion

The theory is sufficient for the task when the developer can:

- Explain the relevant purpose and why this approach was used.
- Trace the relevant execution path and data transformations.
- Name the relevant invariants and what happens when assumptions fail.
- Explain trade-offs and alternatives, or name them as unknown.
- Predict the impact of the intended change, and confirm it against code and tests.

If the developer cannot answer these without relying on an AI's explanation, the theory is incomplete.

Depth, roughly: structural (components and entry points), execution (traces and data flow), behavioural (predicts normal and failure behaviour), modification (changes code and predicts consequences), design (evaluates alternatives and redesigns while preserving behaviour). This is a practical guide, not a scale defined by Naur.

## The Principle

The purpose is not to read code better. It is to reason about the software independently of the code. Code is the implementation, documentation is a representation, tests are evidence, and the theory is the understanding that connects problem, design, implementation, and behaviour.
Knowledge is more than information: Knowing how to do something is different from knowing facts about it