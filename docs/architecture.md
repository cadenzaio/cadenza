# Cadenza Core Architecture

## Scope

`@cadenza.io/core` is the local execution runtime for Cadenza primitives:

- `Task` (work unit)
- `GraphRoutine` (entry grouping of task roots)
- `Signal` flow (`SignalBroker`)
- `Intent/Inquire` flow (`InquiryBroker`)
- `Actor` (in-memory state primitive)

This package is intentionally single-process and in-memory. It does not own network transport or DB persistence.

## Runtime Topology

1. `Cadenza.bootstrap()` wires brokers, runners, and registry.
2. Creation APIs (`createTask`, `createRoutine`, `createActor`, etc.) produce primitives and emit meta signals.
3. `GraphRunner` executes task graphs through sync/async run strategies.
4. `SignalBroker` and `InquiryBroker` route event- and request-style interactions.
5. `GraphRegistry` tracks discoverable tasks/routines for introspection and sync.

## Core Layers

- Definition layer: [`Task`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/graph/definition/Task.ts), [`GraphRoutine`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/graph/definition/GraphRoutine.ts), [`Actor`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/actors/Actor.ts)
- Execution layer: graph nodes/layers + [`GraphRunner`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/engine/GraphRunner.ts)
- Coordination layer: [`SignalBroker`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/engine/SignalBroker.ts), [`InquiryBroker`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/engine/InquiryBroker.ts)
- Registry layer: [`GraphRegistry`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/registry/GraphRegistry.ts)
- Factory/API surface: [`Cadenza`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/Cadenza.ts)

## Actor Primitive Design

Actors are state containers, not graph nodes.

- Actor tasks are ordinary tasks in the graph.
- `actor.task(handler, options)` wraps a handler into a normal `TaskFunction`.
- Task execution order/concurrency is governed by the runner, so actor access stays inside existing Cadenza semantics.

### State Model

- Durable state: serializable actor-owned state (`durableState`).
- Runtime state: non-persisted runtime objects (`runtimeState`) such as socket handles.
- Runtime state is task-driven: no actor-level init hook exists.
- Durable init uses `initState` (static value or function for advanced computed initialization).

### Key Resolution

Resolved actor key priority:

1. `context.__actorOptions.actorKey`
2. `spec.keyResolver(input)`
3. declarative `spec.key` (`field`, `path`, `template`)
4. `spec.defaultKey`

### Write/Read Contracts

- Modes: `read`, `write`, `meta`
- Default write contract: `overwrite`
- Optional contracts: `patch` (shallow merge), `reducer`
- Read mode forbids durable/runtime writes
- Optional runtime read guard: `freeze-shallow`

### Session and Idempotency

- Session policy tracks touch/TTL per actor key when enabled.
- Idempotency is optional and keyed by `actorKey + taskBinding + idempotencyKey`.
- Default duplicate failure behavior: rerun when previous status is `failed`.

### Durable Session Persistence Hook (Opt-In)

- Core exposes intent `meta-actor-session-state-persist` for strict write-through persistence.
- Persistence is per-actor opt-in via `session.persistDurableState`.
- Durable writes commit in memory only after intent response contract succeeds:
  - `__success === true`
  - `persisted === true`
- Runtime-only writes never trigger this hook.
- Core still does not own DB storage; service/db layers implement the responder and persistence backend.

## Metadata Emission Contracts

Core emits actor metadata from primitives:

- `meta.actor.created` emitted by `Actor` constructor
- `meta.actor.task_associated` emitted by `Task` when task function carries actor binding metadata

Payload fields are shaped for downstream DB contract mapping.

## Extension Seams

Core is extended externally (not inside this repo) via meta tasks/signals:

- service distribution and transport (`cadenza-service`)
- persistence schema and metadata storage (`cadenza-db`)
- DB-native materialization (`cadenza-engine`, planned)

## Non-Goals (Core)

- network transport orchestration
- remote discovery/load balancing
- direct DB persistence
- distributed actor synchronization
