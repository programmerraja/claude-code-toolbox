---
name: explainer
description: Explains how a feature, flow, or function works end to end as a narrative walkthrough that builds a durable mental map — covering execution order, the reasoning behind each step, table and column design, concrete shapes of complex objects, and the failure modes that reading the code alone won't reveal. Use when asked how a feature/flow/pipeline works, to trace a request end to end, to explain what a function does across services, or to onboard onto an unfamiliar area of the codebase.
---

# Flow Explainer

Produce an explanation that leaves the reader able to reason about the system on
their own — not a summary they have to re-read next time.

## Before writing

Read the actual code. Verify every claim against real files; never describe what
the code presumably does. Where something was inferred rather than confirmed, say
so explicitly and name the file that would settle it.

## Output format

Format matters as much as content.

- Plain narrative prose. Write like a senior developer walking a new teammate
  through the system at a whiteboard.
- No mermaid diagrams, no ASCII art, no tables of line numbers, no step-numbered
  bullet lists as the main structure.
- Short prose sections with headers. Real function, table, column, queue, and
  S3-prefix names inline in the text.
- Never invent placeholder IDs in the prose. Realistic sample values belong only
  inside the shape examples described below, where the point is the shape.

## Structure

1. Open by naming the single central function or handler the whole feature
   revolves around, and list every way it can be triggered. Say which trigger is
   the real one in production and which are edge cases, so the reader knows where
   to focus.
2. Walk the main path in execution order. For each meaningful step explain both
   what it does and why it exists — what breaks, or what business case forced it.
   The "why" is the part that can't be recovered from reading the code.
3. Then cover the other trigger paths, describing only how they differ from the
   main one. Don't repeat the shared parts.

## Database operations

For every database operation, cover:

- The table's purpose in one line — what one row means in business terms.
- The columns that matter here, what each holds, and why it's shaped that way
  (why JSON instead of a column, why a loose string instead of an enum, why a
  synthetic key).
- Which relationships are real foreign keys versus bare UUIDs with nothing
  enforcing them, and what goes wrong when a bare one dangles.
- Unique constraints and idempotency keys: the exact key format, and what
  concurrency or retry problem it was added to solve.
- Whether the table is shared with other features, and any column whose name
  doesn't match how this flow uses it.

## Complex objects — show the shape

Never describe a complex object in prose alone. On reaching a queue message, JSON
metadata column, config blob, LLM input or output, nested API payload, or
anything the reader would otherwise have to picture in their head, stop and show a
small concrete example of what it actually looks like, then continue the
narrative.

Rules for these examples:

- Take the shape from the real type definition or a real write in the code, not
  from imagination. Cite where the shape came from.
- Fill in realistic values, not `"string"` or `"foo"` — a policy list should look
  like real policy entries, a status like a real status value.
- Trim to the fields that matter for this flow and mark the rest as elided,
  rather than pasting a giant object.
- When the same logical field holds a different kind of value at different hops,
  show it at each hop so the difference is visible.
- When a shape has variants, show the common one and note how the others differ.

The difference this is aiming at: instead of only saying "policies come from the
asset metadata," show what one entry in that metadata actually looks like;
instead of only saying "outputs land in the summary and child tables," show a
trimmed example of one produced result row.

## Always call out

These are what the reader cannot get from reading the code themselves:

- Failures that are swallowed or logged-and-continued, and the corrupt or partial
  state they leave behind.
- Anything ordered by timers, sleeps, or delays rather than a real signal, and
  what happens when the race is lost.
- Work scheduled in-process that dies with the pod.
- Guards that make retries silent no-ops, including cases where a half-failed
  first attempt can never be retried.
- Distinct ID spaces that get confused with each other, especially the same field
  name carrying a different ID at different hops.
- Duplicated or near-duplicate implementations of the same logic that have
  quietly drifted apart.
- Fields written and never read, or read from a stale or misleading name.
- Design decisions inherited from an older use case that don't fit this one.

## Closing

At each major boundary, state what has not been created yet, and what would be
lost with no trace if the process died right there.

End with what this flow will never handle — the gaps where something falls
through and nothing sweeps it up later.

## Optional emphasis

Adjust when the reader states their intent:

- **Debugging** — focus on where the flow produces a wrong or empty result rather
  than an outright error.
- **Changing it** — also identify which parts are load-bearing for other
  features, so the reader knows what they'd break.
