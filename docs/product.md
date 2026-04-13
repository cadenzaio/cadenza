# Cadenza Core Product

## Product Definition

`@cadenza.io/core` is the foundational runtime for composing business logic with Cadenza primitives.

It provides:

- deterministic task graph execution
- signal-driven choreography
- inquiry/intent request-response
- in-memory actor state with task-based access
- layer-scoped helpers and immutable globals

## Target Users

- framework engineers building Cadenza extensions
- backend developers composing local workflows
- teams that want explicit orchestration plus event-driven triggering

## Primary Use Cases

1. Build local task graphs with explicit dependencies.
2. Trigger workflows through signals.
3. Query workflow results through intents/inquiries.
4. Model stateful logic using actors while keeping graph participation task-centric.
5. Reuse low-level logic and immutable configuration through declared helper/global aliases without widening graph-node scope.

## Actor Product Contract (Current)

- Actors are created through `Cadenza.createActor(...)` or `Cadenza.createActorFromDefinition(...)`.
- Actor tasks are discoverable via normal `GraphRegistry` task discovery.
- Durable and runtime state are split.
- Runtime state can hold non-serializable runtime objects.
- Runtime initialization is explicit and task-driven.
- Idempotency is optional.
- Durable session persistence is optional and per-actor (`session.persistDurableState`).
- When enabled, durable writes require strict write-through success contract (`__success` + `persisted`) before in-memory durable commit.
- No auto-hydration is performed by core.

## API Surface (Key)

- `Cadenza.createTask(...)`
- `Cadenza.createRoutine(...)`
- `Cadenza.emit(...)`
- `Cadenza.inquire(...)`
- `Cadenza.createActor(...)`
- `actor.task(...)`
- `Cadenza.createHelper(...)`
- `Cadenza.createMetaHelper(...)`
- `Cadenza.createGlobal(...)`
- `Cadenza.createMetaGlobal(...)`
- `task.usesHelpers(...)`
- `task.usesGlobals(...)`

## Product Boundaries

Core does not include:

- cross-service transport
- service registry / load balancing
- metadata persistence to database
- operational runtime dashboards

These are intentionally implemented by companion repos.

## Compatibility Role in Ecosystem

Core acts as the contract authority for primitive semantics consumed by:

- `@cadenza.io/service`
- `@cadenza.io/cadenza-db`
- future DB-native engine materializers

Changes to primitive contracts should remain additive when possible and propagate to downstream repos when contract shape changes.

## Layer-Scoped Tools Product Contract

- Helpers and globals are structural definition artifacts, not graph nodes.
- Runtime access is alias-scoped through `tools.helpers` and `tools.globals`.
- Only explicitly declared same-layer dependencies are injected.
- Globals must be JSON-serializable and are immutable at runtime.
- The task/helper function contract is `(context, emit, inquire, tools, progressCallback)`.
- Runtime-host snapshots and upsert APIs treat helpers/globals as first-class inspectable structures.
