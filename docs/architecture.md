# Cadenza Core Architecture

## Scope

`@cadenza.io/core` is the local execution runtime for Cadenza primitives:

- `Task` (work unit)
- `GraphRoutine` (entry grouping of task roots)
- `Signal` flow (`SignalBroker`)
- `Intent/Inquire` flow (`InquiryBroker`)
- `Actor` (in-memory state primitive)
- layer-scoped helpers and immutable globals

This package is intentionally single-process and in-memory. It does not own network transport or DB persistence.

It now also exposes an official local runtime-host surface for machine integrations through the `cadenza runtime stdio` CLI and a shared local daemon mode through `cadenza runtime shared ...`. Both surfaces remain local and in-memory and do not change the authority boundary of core.

## Runtime Topology

1. `Cadenza.bootstrap()` wires brokers, runners, and registry.
2. Creation APIs (`createTask`, `createRoutine`, `createActor`, `createHelper`, `createGlobal`, etc.) produce primitives and emit meta signals.
3. `GraphRunner` executes task graphs through sync/async run strategies.
4. `SignalBroker` and `InquiryBroker` route event- and request-style interactions.
5. `GraphRegistry` tracks discoverable tasks/routines for introspection and sync.
6. `RuntimeHost` maps JSONL protocol operations to the existing core factory/singleton APIs for runtime-direct authoring.
7. `SharedRuntimeDaemon` can host one named runtime with multiple attached stdio bridge sessions for collaborative local authoring.

## Core Layers

- Definition layer: [`Task`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/graph/definition/Task.ts), [`GraphRoutine`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/graph/definition/GraphRoutine.ts), [`Actor`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/actors/Actor.ts)
- Tool layer: [`src/tools/definitions.ts`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/tools/definitions.ts) for helper/global definitions and alias-scoped runtime lookup
- Execution layer: graph nodes/layers + [`GraphRunner`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/engine/GraphRunner.ts)
- Coordination layer: [`SignalBroker`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/engine/SignalBroker.ts), [`InquiryBroker`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/engine/InquiryBroker.ts)
- Registry layer: [`GraphRegistry`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/registry/GraphRegistry.ts)
- Factory/API surface: [`Cadenza`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/Cadenza.ts)
- Runtime-host layer: [`RuntimeHost`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/runtime/RuntimeHost.ts), sandbox/compiler helpers, and the CLI entrypoint at [`src/cli.ts`](/Users/emilforsvall/WebstormProjects/cadenza-workspace/cadenza/src/cli.ts)

## Runtime-Direct Authoring Surface

The official core CLI exposes a local JSONL request/response protocol over stdio:

- `runtime.bootstrap`
- `runtime.info`
- `runtime.detach`
- `runtime.shutdown`
- `runtime.reset`
- `runtime.snapshot`
- `runtime.subscribe`
- `runtime.unsubscribe`
- `runtime.nextEvent`
- `runtime.pollEvents`
- `task.upsert`
- `task.link`
- `task.observeSignal`
- `task.emitSignal`
- `task.respondToIntent`
- `helper.upsert`
- `global.upsert`
- `task.useHelper`
- `task.useGlobal`
- `helper.useHelper`
- `helper.useGlobal`
- `routine.upsert`
- `routine.observeSignal`
- `intent.upsert`
- `actor.upsert`
- `actorTask.upsert`
- `run`
- `emit`
- `inquire`

This surface is additive. It wraps the existing `Cadenza` singleton rather than introducing multi-runtime tenancy in v1.

## Layer-Scoped Tools Contract

Helpers and globals are structural definition artifacts that live beside tasks and routines.

- `Cadenza.createHelper(...)` and `Cadenza.createMetaHelper(...)` define callable helper artifacts.
- `Cadenza.createGlobal(...)` and `Cadenza.createMetaGlobal(...)` define immutable JSON-serializable values.
- Tasks and helpers declare direct dependencies through `.usesHelpers({ alias: helper })` and `.usesGlobals({ alias: globalDef })`.
- Runtime code receives only declared same-layer dependencies through `tools.helpers` and `tools.globals`.

Execution rules:

- task and helper handlers use `(context, emit, inquire, tools, progressCallback)`
- helper aliases are the only runtime lookup shape
- globals are deep-frozen before runtime exposure
- helper execution may return a value or mutate the passed context
- helper execution may not create tasks, routines, actors, signals, intents, or graph links during runtime

Runtime-host snapshots now include helper/global definitions and direct task/helper tool bindings so runtime-authored structures stay inspectable.

### Shared Runtime Mode

- `cadenza runtime stdio` remains isolated mode: one runtime per subprocess.
- `cadenza runtime shared start --runtime <name>` ensures a named local daemon is running.
- `cadenza runtime shared stdio --runtime <name>` opens a stdio bridge session into that named runtime.
- `cadenza runtime shared list` reports currently reachable named runtimes.
- The first attached session becomes the `owner` by default. Later sessions default to `writer`. `observer` is explicit.
- `owner` can reset or shut down the shared runtime.
- `writer` can author and execute, but cannot reset or shut down.
- `observer` can inspect, subscribe, drain events, inquire, and detach.

### Handler Compilation Model

- Runtime-authored task and actor-task handlers are supplied as JS/TS source strings.
- TypeScript source is transpiled with the bundled TypeScript compiler.
- Handlers are evaluated in a restricted VM context with blocked access to `require`, `process`, timers, and common runtime globals.
- The current sandbox is intended for controlled local authoring workflows, not as a general-purpose untrusted code hosting boundary.

### Subscription Model

- Signal delivery to agents is queued and pull-based.
- The runtime host subscribes passively to emitted signals and buffers normalized event envelopes per subscription.
- `runtime.nextEvent` waits for one event up to an optional timeout.
- `runtime.pollEvents` drains buffered events in batches.
- No unsolicited stdout event streaming is used in v1.x, which keeps the transport compatible with agent tool runtimes that expect one request per response.

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
