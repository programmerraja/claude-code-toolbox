---
name: pm-discovery
description: Product-manager discovery workflow before any code. Starts by mapping what the existing system already does for the feature area, asks the user to clarify gaps, then frames the problem and runs web research on competitors and the market. Ends in a sourced PRD at docs/specs/<feature>.md, with the human owning the problem framing and final scope. Use when the user wants to research a feature, write a spec or PRD, check competitors, or validate a product idea before building.
---

# PM Discovery

Mirror how a strong product manager works before engineering starts: understand what we already have, frame the problem, research what exists outside, decide the angle, then write a spec that can be argued with. AI does the reading, research legwork, and drafting. The human owns the problem statement, the angle, and the scope.

Output: one spec file at `docs/specs/<feature-slug>.md` in the current repo. This workflow ends at an approved spec. It does not write code.

## Shared Gates

- **Understand before researching.** Never search the market for a feature we may already have. The existing system comes first.
- **Ask, don't assume.** If the user's overview is missing the user, the pain, or the goal, ask before researching. Never invent a target user, a metric, or a business rule.
- **Human-first framing.** Do not write the problem statement yourself. Ask the user to state it, then sharpen it with them.
- **Sourced or flagged.** Every market or competitor claim has a link and a date. Anything you could not verify is marked `UNVERIFIED`.
- **Two-way doors move fast.** Research depth is a two-way door. Pricing, data model, and positioning are one-way doors and get explicit user sign-off.

## Phase 1: Understand the Existing System (AI-Led, Read-Only)

Start from the feature overview the user gave. If it is missing, ask for it first.

Before reading any code, ask two things:

1. Do you already know how the existing system works in this area?
2. Is there a single doc that describes it (README, architecture doc, prior spec, wiki or Google Doc link)? If yes, point me to it.

Then follow the path that matches the answer:

- **User knows it well:** Use their description as the starting point. Do not explore the code unless they ask. Skip the full brief.
- **A doc exists:** Read the doc first. Explore code only for what the doc does not cover or leaves unclear, and name the gaps that triggered each exploration.
- **Neither:** Explore using the scope below.

Stop exploring once the doc or the user's description is clear enough to answer the Phase 2 questions.

Scope any exploration to the feature area, not the whole repo. Look at:

- Repo docs: `README`, `docs/`, and prior specs in `docs/specs/`.
- Code that touches the feature area: routes, services, data models, jobs, config, feature flags, analytics events, and tests.
- Recent history on related terms (`git log` search on feature keywords), to catch work that was started, shipped, or removed.

For broad scans, use an explore subagent. Use real names, real flows, and real data shapes. Trace what happens, not what the names suggest.

Build the **Existing System Brief** as your own working notes. Show it to the user only when they don't know the system or ask for it. Otherwise, show a short confirmation (under 10 lines) covering what is already covered, what is partial, and what is unclear. Use this format for the full brief:

```
## What Exists
| Area | File / module | What it does today | Used by | Status (live / partial / dead / unknown) |

## How It Works
- Short end-to-end flow for the closest existing path (file:function -> file:function)

## Coverage vs. the Feature Idea
- Already covered:
- Partially covered (and what's missing):
- Not covered:

## Known Limits
- TODOs, known bugs, workarounds, and decisions that look deliberate

## Unknown From Code
- Things the code cannot tell us (business rules, customers, roadmap, removed features and why)
```

**Gate:** Ask the user to correct the picture and answer the unclear points, especially anything marked `unknown` or `partial`. Do not start research until the user confirms the picture is right.

## Phase 2: Frame the Problem (User-Owned)

Now that the existing system is clear, ask the user for these, in this order. Skip any they already gave clearly:

1. **Who** has the problem (role, segment, context).
2. **What** the pain is today, and how they cope now (including the existing feature, if any).
3. **Why now** (trigger, market shift, customer demand, deadline).
4. **Success** (the one metric that proves it worked).
5. **Out of scope** (what this feature will not do).

Then write back a one-paragraph **Problem Statement** and ask the user to confirm or correct it. The statement must say what is new versus what the existing system already does.

**Gate:** Do not start research until the user confirms the Problem Statement.

## Phase 3: Research (AI-Led, Web Only)

Run web research against the confirmed problem and the gaps from Phase 1, not the feature name. Search for:

- **Competitors:** who solves this problem, and how (product, positioning, pricing, onboarding, key flows).
- **Feature precedent:** how each competitor implements the specific feature, with screenshots or doc links where possible.
- **User voice:** complaints, praise, and workarounds in public reviews, forums, and launch threads.
- **Market signals:** recent launches, funding, regulation, or platform changes that affect the problem.

For broad scans, parallelize with subagents. Keep the final output in the Research Brief format below and nothing more.

### Research Brief Format

```
## Competitor Matrix
| Competitor | Approach to the problem | Feature depth | Pricing (if public) | Gaps / complaints | Source (date) |

## Our Position
- What we already have (from the Existing System Brief) vs. what competitors do

## User Voice
- Pain quote or summary (source, date)

## Market Signals
- Signal and why it matters (source, date)

## Unverified
- Claims I could not confirm
```

**Gate:** Present the brief and stop. Do not recommend an angle yet.

## Phase 4: Synthesis & Angle (User Decides)

Ask the user to read the brief, then state:

- Which gap they want to own.
- What they will copy, and what they will deliberately not copy.
- Whether they will extend the existing feature or build beside it.

If the user asks for suggestions, present 2–3 contrasting angles. For each, state the user it serves, the competitor it beats, the existing code it touches, the main risk, and the cost to build. Let the user choose.

**Gate:** Wait for the user's chosen angle.

## Phase 5: Assumptions & Risks

List every assumption the chosen angle depends on. Tag each one:

- **Validated:** backed by a source in the brief or by the existing code.
- **Unvalidated:** plausible, needs a test. Include the cheapest test (survey, five user calls, prototype, fake-door test).
- **Risky:** if wrong, the feature fails. Flag it as a blocker for scope.

Include regulatory, compliance, and data-privacy risks when the domain requires them. Include risks to existing behavior (customers, data, or flows that depend on what we change). Ask the user if they know of any the research missed.

**Gate:** The user confirms which unvalidated assumptions are acceptable to build on.

## Phase 6: Build a Prototype (Optional)

Only if the user asks for a prototype, use the `prototype` skill and build it.

## Phase 7: Draft the Spec

Write the spec to `docs/specs/<feature-slug>.md` using the template below. Create the folder if it does not exist. Fill every section. Write `TBD (ask user)` rather than guessing.

```markdown
# <Feature name>

Status: Draft | Owner: <user> | Date: <YYYY-MM-DD>

## 1. Problem
<Confirmed Problem Statement from Phase 2>

## 2. Existing System
<Condensed Existing System Brief from Phase 1: what exists, how it works, coverage gaps, known limits>

## 3. Users & Context
- Primary user:
- Current workaround:

## 4. Goals
- <Goal, linked to the success metric>

## 5. Non-Goals
- <Explicitly out of scope>

## 6. Market & Competitive Context
<Condensed from the Research Brief, with sources and dates>

## 7. Chosen Angle
<The angle from Phase 4, what we copy vs. deliberately skip, and whether we extend or build beside the existing feature>

## 8. User Stories
- As a <user>, I want <action>, so that <outcome>.

## 9. Requirements
### Must have
- ...
### Should have
- ...
### Later
- ...

## 10. Acceptance Criteria
- Given <context>, when <action>, then <observable result>.

## 11. Success Metrics
- Primary: <metric, target, timeframe>
- Guardrail: <metric that must not regress>

## 12. Assumptions & Risks
| Item | Status (Validated / Unvalidated / Risky) | Test or mitigation |

## 13. Open Questions
- <Question, owner>

## 14. Sources
- <Link (date)>
```

**Gate:** Present the spec. Ask the user to review section by section, or approve as a whole.

## Phase 8: Close

1. Apply the user's edits to the spec file.
2. Confirm the final status is `Approved` only after the user says so.
3. Summarize in chat: the Problem Statement, what already exists, the chosen angle, the top 3 risks, and the open questions still needing an owner. Keep it under 15 lines.

## Rules

- Do not research the market before the Phase 1 gate is passed.
- Do not explore code the user already knows, or that a provided doc already answers.
- Do not write code, create tickets, or change files outside `docs/specs/`. The only exception is Phase 6, if the user asked for a prototype.
- Do not hide weak evidence. An `UNVERIFIED` tag beats a confident guess.
- Do not let the research pick the angle. The user picks it, with the brief in front of them.
