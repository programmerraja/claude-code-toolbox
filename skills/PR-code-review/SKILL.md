# PR Review Skill

## Purpose
Systematically review a Pull Request by (1) framing the problem, (2) building a solid understanding of the spec, and (3) mentally executing the code to find bugs, complexity, edge cases, and robustness gaps — before writing any review comments.

## Inputs
- PR link / diff
- PR description, linked issue/ticket, spec (if any)
- Branch / base branch
- Any domain context (third-party services used, DB schema, etc.)

## Output
A structured review with:
- **Summary** of what the PR does (in your own words)
- **Understanding checkpoint** (confirmation of spec/behavior)
- **Flow notes** (mental-model walkthrough)
- **Findings** categorized: `Bug`, `Edge case`, `Over-engineering`, `Missing error handling`, `DB/transaction concern`, `Third-party integration concern`, `Naming/clarity`, `Testing gap`, `Nit`
- **Questions for author** (if any)
- **Verdict**: Approve / Request changes / Needs discussion

---

## Phase 1 — Frame the Problem
Goal: decide *how deep* to review based on what this PR is.

**Steps**
1. Read the PR title, description, and linked issue/ticket.
2. Classify the PR:
   - **Type**: new feature / bug fix / refactor / chore / hotfix / docs / dependency bump
   - **Scope**: single-file tweak / localized change / cross-cutting / architectural
   - **Branch**: simple branch vs. feature branch vs. release/hotfix branch
   - **Size**: small / medium / large (and whether large is justified)
3. Decide **complexity tier** → determines review depth:
   - **Low** (docs, config, small fix): quick pass + sanity check.
   - **Medium** (localized feature/fix): full flow walkthrough.
   - **High** (multi-service, schema change, concurrency, migrations, auth, payments): deep walkthrough + stress dimensions.
4. Note the **risk surface**: data, money, auth, user-facing, infra, migrations.

**Output of this phase:** a one-line framing — *"This is a [type] of [scope] touching [risk areas]; complexity = [tier]; will review at [depth]."*

---

## Phase 2 — Build Solid Understanding (Before Reading Code)
Goal: know *what correct behavior looks like* before judging the implementation.

**Steps**
1. Restate the problem in your own words:
   - Is this a new feature or a bug?
   - If bug: what is the bug, **when** does it happen, **why** does it happen, how was it reproduced?
   - If feature: what is the full spec / acceptance criteria? What's explicitly out of scope?
2. Identify the **expected behavior** and the **contracts** (inputs, outputs, side effects).
3. Identify the **stakeholders of correctness**: who calls this, who depends on it, what breaks if it's wrong.
4. **Ask clarifying questions to the author** whenever there's doubt — do not proceed with guesses. Keep asking until you have a solid understanding.

**Question bank**
- What was the original bug/spec? Where's the ticket?
- What's the expected behavior in edge cases X, Y, Z?
- Is backward compatibility required?
- Are there migrations? Rollback plan?
- Any feature flags?
- Is there a test that proves the fix/feature?

**Gate:** Do not enter Phase 3 until you can describe the spec and expected behavior in your own words.

## Phase 3 — Mental Execution of the Code
Goal: simulate the code against real flows and surface issues.

### 3a. Walk the flow
1. Pick **2–3 representative flows** through the change:
   - Happy path
   - A realistic edge path (empty data, first-run, retry)
   - A failure path (error, timeout, partial success)
2. For each flow, **step through the diff line by line** in your head — track state, values, and side effects.
3. Where a mental model breaks down, either **ask the author** or, if it's an improvement, **add a review comment**.
4. Once you have full understanding by walking the flow, move to Phase 3b.

### 3b. Stress the design dimensions
For each dimension, ask: *does this PR handle it?*

| Dimension | Questions to ask |
|---|---|
| **Complexity** | Can this be simpler? Are there unnecessary layers/abstractions? |
| **Over-engineering** | Are we building for hypothetical futures? YAGNI? |
| **Missing edge cases** | Nulls, empties, boundaries, unicode, large inputs, concurrency |
| **Error handling** | What happens on error? Is it handled, swallowed, propagated? Should it be? |
| **Third-party services** | Are calls wrapped? Timeouts? Retries? Idempotency? Failure fallbacks? |
| **Database** | Transactions correct? Isolation? Race conditions? N+1? Migrations safe & reversible? |
| **Backward compatibility** | API contracts, response shapes, DB columns |
| **Security** | Input validation, authz, secrets, injection |
| **Observability** | Logs, metrics, traces — enough to debug in prod? |
| **Tests** | Is the fix/feature proven by tests? Edge cases covered? |
| **Naming / readability** | Clear names, comments where the "why" is non-obvious |
| **Performance** | Hot paths, allocations, query counts |

For each dimension, decide: **OK / Needs comment / Needs change**.

## Phase 4 — Write the Review
Structure your comments so the author can act fast:

1. **Summary** — one paragraph on what the PR does (proves your understanding).
2. **Understanding checkpoint** — any assumption you had to make; ask to confirm.
3. **Findings**, grouped by severity:
   - Blockers (bugs, data loss, security, transaction issues)
   - Should-fix (edge cases, error handling, over-engineering)
   - Questions / clarifications
   - Nits
4. **Questions for author** — only the ones that matter.
5. **Verdict** — Approve / Request changes / Needs discussion, with rationale.

**Comment style:** be specific (file:line), propose an alternative when flagging complexity, and separate "must fix" from "preference".

## Guiding Principles
- **No review without understanding.** If you can't simulate the flow, ask.
- **Correctness before style.** Bugs and edge cases outrank nits.
- **Hold both lenses:** *does it work?* and *should it exist like this?*
- **Prefer questions over assertions** when you're not sure — the author has context you don't.
- **Match depth to complexity.** Don't deep-dive a typo fix; don't skim a migration.
- **Leave the codebase better.** If you spot a simpler design, say so — but tie it to a concrete trade-off.
