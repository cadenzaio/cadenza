# Repo-Specific Agent Rules

This document defines repository-level execution rules.

Global workflow governance (WIP limits, clarification protocol,
assumptions policy, complexity gate, contract governance)
is defined in the workspace root AGENTS.md.

If conflict exists:
- Root AGENTS.md governs workflow and process.
- This file governs tooling, commands, and repo-specific constraints.

---

# 1. Repository Overview

Name: cadenza
Purpose: Core Cadenza runtime and primitives for graph execution.
Owner Domain: Shared core contracts and runtime semantics.

Boundaries:
- Do NOT modify other repos from here.
- Cross-repo changes must follow workspace multi-repo discipline.
- Keep this repo focused on core primitives and execution behavior (not service transport or DB schema).

---

# 2. Local Development Commands

Use these canonical commands. Do not invent alternatives.

## Install

```bash
yarn install
```

## Build

```bash
yarn build
```

## Test

```bash
yarn test
```

## Typecheck

```bash
yarn tsc --noEmit
```

## Format

```bash
yarn prettier --check .
```

If CI uses a specific command, prefer that command.

# 3. Pre-PR Checklist (Repo-Specific)

## Before opening PR:

- [ ] Install succeeds
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] No console logs left
- [ ] No commented-out code
- [ ] No debug artifacts
- [ ] Migration files included (if applicable)

If this repo exposes contracts:

- [ ] Contract changes propagated per workspace rules

# 4. Environment & Configuration

Required environment variables:

- None required for standard local core development.

Local dev setup notes:

- Core repo does not require DB/network bootstrap for unit-level development.
- Use repo-local tests as the primary validation path.

Never hardcode secrets.

Never commit .env files.

# 5. Testing Rules

Test expectations:

- All new logic must include tests.
- Edge cases must be tested.
- Regression tests required for bug fixes.
- Snapshot tests updated intentionally, never blindly.

If integration tests exist:

- Ensure external services are mocked or containerized.

# 6. Contract Responsibilities (If This Repo Owns Contracts)

This repo is a contract authority for core primitives.

- Update core contract source first.
- Update exported types and runtime behavior together.
- Notify or update consumers in same task OR create follow-up issue.
- Add or update contract snapshot tests when applicable.

Breaking contract changes require:

- Explicit approval

  OR

- Design-required phase.

# 7. Logging & Observability

- Keep logs structured when logs are necessary.
- Avoid logging sensitive data.
- Log errors with context.
- No silent catches.

# 8. Performance & Safety Constraints

- Keep execution paths predictable and bounded.
- Avoid unbounded loops over external input.
- Validate external input before use.
- Fail fast on invalid states.

# 9. Repo-Specific Anti-Patterns

Do NOT:

- Add service/distribution behavior in core primitives.
- Add DB schema concerns in this repo.
- Modify generated files manually.
- Bypass type system with `any` without justification.
- Disable tests to make builds pass.
- Introduce new dependencies without justification.

# 10. Documentation Discipline

If you modify:

- Public API
- Build system
- Major module structure

Update:

- README.md
- This AGENTS.md (if command/process changes)
- Relevant repo docs

All documentation changes must be:

- Evidence-based
- Implemented via approved proposals from Queue Health process

# 11. Execution Principle

Within this repo:

- Prefer small, incremental changes.
- Prefer additive changes over breaking.
- If uncertain, trigger clarification per root policy.
- If complexity increases, trigger design-required per root policy.
- Evolve runtime behavior mainly by composing Cadenza primitives.
- Prefer flat task and signal graphs over deep nested helper-function call graphs.
- Use signals as fire-and-forget detach points when no response contract is required.
- Reuse tasks across multiple flows by cloning tasks when the behavior is the same.
- Keep helper functions narrowly scoped to repeated low-level work, normalization, or hot paths where primitive-only modeling would be inefficient.

When in doubt: stop and ask.

# Agents Notes: cadenza (core)

## What I have learned

- Core primitives are centered on graph-executable `Task` and `GraphRoutine`.
- Signals trigger tasks/routines through `Task.doOn(...)` and SignalBroker observation.
- Intents/inquiries are task invocations via `Task.respondsTo(...)` and `Cadenza.inquire(...)`.
- Actors are state primitives whose **bound tasks** are ordinary graph tasks.
- Actor state is split into:
  - durable state (`state`/`durableState`) for serializable business data
  - runtime state (`runtimeState`) for live process objects

## Important architecture alignment

- Actors are not graph nodes; actor tasks are.
- Actor initialization is primitive-native:
  - durable bootstrap via `initState`
  - runtime bootstrap via signal-triggered write tasks
- There is no hidden actor lifecycle requirement outside task/signal flows.
- Runtime task generation (including ephemeral tasks) is a valid first-class pattern in this ecosystem.

## Long-term direction (recorded)

- Business logic is expected to move toward DB-native primitive definitions.
- Core remains the execution model authority used by engines to materialize and run those definitions.

## What I will keep learning in this discussion

- Stable core contracts that minimize migration friction to DB-native execution.
- Clear separation rules between durable state, runtime state, and transient execution context.
- Actor/session semantics needed by service-layer persistence integration.
