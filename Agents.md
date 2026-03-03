# Agents Notes: cadenza (core)

## What I have learned

- Core primitives are centered on graph-executable `Task` and `GraphRoutine`.
- Signals trigger tasks/routines through `Task.doOn(...)` and SignalBroker observation.
- Intents/inquiries are task invocations via `Task.respondsTo(...)` and `Cadenza.inquire(...)`.
- Task execution is ordered by runner/graph layering; uniqueness and throttling are task-level concerns.
- `Cadenza.createActor(...)` and `Cadenza.createActorFromDefinition(...)` provide actor creation at core level.
- Actor tasks are standard task functions created with `actor.task(handler, options)` and then registered with `createTask` / `createMetaTask`.
- Actor task metadata (`forceMeta`) is used so MetaActors or `mode: "meta"` actor tasks become meta tasks automatically when registered.
- Actor state model is split:
  - durable state (`state`/`durableState`) for serializable business data
  - runtime state (`runtimeState`) for live runtime objects
- Actor key resolution order is:
  - explicit `__actorOptions.actorKey`
  - `keyResolver`
  - declarative key definition (`field` / `path` / `template`)
  - `defaultKey`
- Actor lifecycle supports initialization via:
  - inline `spec.init`
  - definition `runtime.factoryToken`
  - definition `lifecycle.initHandlerToken`
  - definition `lifecycle.initTaskName` / `initRoutineName`
- Current defaults in core:
  - `loadPolicy: "eager"`
  - `writeContract: "overwrite"`
  - patch behavior is shallow merge
  - idempotency disabled unless explicitly enabled
  - rerun on failed duplicate idempotency key enabled by default when idempotency is on

## Important architecture alignment

- Actors are not first-class graph nodes.
- Actor-owned tasks are graph nodes like any other tasks.
- This matches Cadenza's primitive model: signals trigger tasks, tasks do work, intents query tasks, actors provide state + handlers.
- Runtime task generation is a first-class pattern (including creating tasks from tasks).
- Ephemeral tasks are intentionally used as promise resolvers and other transient orchestration primitives to keep logic inside the Cadenza ecosystem instead of external async glue.

## Long-term direction (recorded)

- The target model is DB-native business logic where primitives are authored/generated in a UI (with AI assistance), persisted in DB, and executed by generalized engines that materialize the graph at runtime.
- Repo-defined static code is an intermediate phase; the long-term engine is intended to stay continuously synced with DB definitions and push runtime metrics/state back for monitoring.

## What I will keep learning in this discussion

- Best-practice mapping from legacy meta setup tasks into actor init/task structure without bypassing graph semantics.
- Stable conventions for actor definition payloads to support future DB-native code generation.
- Clear separation rules between durable state, runtime state, and transient execution context.
