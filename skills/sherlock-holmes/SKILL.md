# Root-Cause Debugging

Goal: fix the real cause, not the symptom, without breaking anything else. Never jump to a fix. Understand, prove, evaluate, then fix.

## Phase 1: Understand the issue fully

Before reading code, be clear on:

- **What happens** (actual behavior, exact error, stack trace, wrong output).
- **What should happen** (expected behavior).
- **Where and when:** which environment, which user/data, which version, since when.
- **How often:** always, sometimes, only under load, only for some data.
- **What changed recently:** deploys, config, data, dependency versions, third-party behavior.
- **Steps to reproduce.**

If any of this is unclear, ask the user. Do not guess at missing facts. Ask specific questions, for example:
- "Does this happen for all orders or only ones with discounts?"
- "Can you share the exact error and the request payload?"
- "Did it start after a specific deploy?"

## Phase 2: Trace the code flow

1. Find the entry point (API handler, job, event consumer, UI action).
2. Walk the flow step by step (A → B → ... → H) in your head: what data comes in, how it is transformed, which branches run, which boundaries (DB, third party, queue, cache) are touched.
3. Write the flow down briefly. Mark every place where the observed symptom could originate.
4. If the flow is too complex to trace mentally (async, many layers, dynamic dispatch, state mutations), stop guessing and gather evidence (Phase 3).

## Phase 3: Gather evidence

Use the cheapest reliable tool:

- **Debugger:** set breakpoints at key steps, inspect actual values, step through branches.
- **Logs:** add temporary, focused logs at decision points and boundaries.
- **Reproduce in a test:** a failing unit/flow test is often the fastest repeatable reproduction.
- **Inspect data:** query the DB records, check third-party dashboards, check request/response logs.

Good debug logs:

- Have a unique prefix so they are easy to find and remove: `[DEBUG-BUG1234]`.
- Log inputs, branch decisions, boundary requests/responses, and state before/after mutation.
- Include identifiers (request id, order id, user id) and timestamps for async/ordering issues.
- Never log secrets, tokens, passwords or full personal data; mask them.

### When working as an agent without direct runtime access

1. Add the targeted logs (with the prefix) to the code.
2. Tell the user exactly how to reproduce: which command, endpoint, input, or steps.
3. Ask them to run it and paste the relevant log output (and error/stack trace).
4. Analyze the logs, state what they prove or rule out, and add more logs if needed.
5. Repeat until the root cause is proven. Clarify with the user whenever something is ambiguous instead of assuming.
6. Remove all debug logs once done (search for the prefix), unless some are worth keeping as permanent, properly leveled logs.

## Phase 4: Find the root cause (think in all dimensions)

List hypotheses, then confirm or rule each out with evidence. Consider:

- **Data:** null/empty/unexpected values, encoding, precision, very large values, legacy records.
- **Logic:** wrong condition, missing branch, off-by-one, wrong default, wrong order of operations.
- **State:** stale cache, mutated shared object, leftover state between calls.
- **Concurrency / timing:** race conditions, duplicate events, out-of-order messages, retries, timeouts.
- **Boundaries:** third-party changed response, partial failure, rate limits, DB constraints, transactions not rolled back.
- **Environment:** config/env vars, feature flags, time zone, locale, version mismatch between services.
- **Recent changes:** git log / blame on the affected code; compare to last known good version.

The root cause is found only when you can explain **the full chain**: this input + this state → this code path → this wrong result, and the evidence matches. If you can only explain part of it, keep digging.

Also ask: **where else does this same pattern exist?** The same bug may live in sibling code.

## Phase 5: Evaluate fix options before fixing

Do not apply the first fix that comes to mind. For each candidate fix, assess:

- **Correctness:** does it fix the root cause or just hide the symptom?
- **Blast radius:** who else calls this code? What flows, data or consumers could change behavior? Check usages.
- **Proper vs hacky:** is it a clean fix in the right layer, or a special-case patch (`if (id === 123)`, swallowing errors, extra null checks that hide bad data)?
- **Scope:** small targeted fix, or does the flow have a design flaw that needs a bigger refactor/rewrite?
- **Data impact:** is existing bad data in the DB that needs a migration or backfill?
- **Backward compatibility:** API contracts, events, stored formats.
- **Risk and rollout:** can it go behind a feature flag? Is it easy to roll back?

If the right fix is large (rewrite, migration, contract change) or there are trade-offs between options, present the options with pros and cons to the user and let them decide. A short-term safe fix plus a follow-up for the proper fix is a valid choice, if stated explicitly.

## Phase 6: Fix and protect

1. Write a test that reproduces the bug (fails without the fix). Follow the flow-based unit test approach: test the real flow, mock only DB/third-party boundaries, and simulate the exact real-world condition (third-party failure mode, duplicate event, edge data).
2. Ask why existing tests did not catch it (missing scenario, over-mocking, unrealistic mock data) and fix that gap.
3. Apply the chosen fix.
4. Confirm the new test passes and the full test suite still passes.
5. Fix the same pattern elsewhere if found, or flag it.
6. Remove temporary debug logs.

## Phase 7: Report

Summarize for the user:

- **Root cause:** the full chain, in a few sentences.
- **Evidence:** what proved it.
- **Fix:** what changed and why this approach (vs alternatives).
- **Impact:** what else could be affected and how it was checked.
- **Tests:** what regression test was added.
- **Follow-ups:** data cleanup, proper refactor, monitoring/alerting, similar code to review.

## Rules

- Never fix before the root cause is proven.
- Never assume; ask the user when facts are missing.
- Prefer evidence (logs, debugger, failing test) over reasoning alone when the flow is complex.
- Never silence errors or add special cases to make the symptom disappear.
- Always consider what else the fix can break.
- Every bug fix ships with a test that would have caught it.