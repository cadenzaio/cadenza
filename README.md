# Cadenza Core

## Overview

Cadenza is an innovative framework that extends traditional orchestration with event-driven choreography, providing "structured freedom" for building distributed, self-evolving systems. 

The core package (@Cadenza.io/core) includes the foundational primitives for defining and executing graphs of tasks, managing contexts, handling signals, and bootstrapping executions. It's designed to be language-agnostic in model, with this TypeScript implementation serving as the reference.

Cadenza's design philosophy emphasizes:
- **Decentralized Adaptive Orchestration (DAO)**: Explicit graphs for dependencies (orchestration) combined with signals for loose coupling (choreography). This combination allows for flexible and dynamic workflows, while still maintaining the benefits of traditional orchestration.
- **Meta-Layer Extension**: A self-reflective layer for monitoring, optimization, and auto-generation, enabling AI-driven self-development. Essentially used for extending the core features by using the core features.
- **Introspectability**: Exportable graphs, traceable executions, and metadata separation for transparency and debugging.
- **Modularity**: Lightweight core with extensions (e.g., distribution, UI integration) as separate packages using the meta layer.

The core is suitable for local dynamic workflows using tasks and signals. But thanks to the meta layer, it also serves as the foundation for distributed applications, and more, abstracting complexities like networking and security in extensions.

## Installation

Install the core package via npm:

```bash
npm install @cadenza.io/core
```

## Usage

### Creating Tasks
Tasks are the atomic units of work in Cadenza. They can be chained to form complex graphs.

```typescript
import Cadenza from '@cadenza.io/core';

// Create functions for tasks
function validateContext(context) {
  if (!context.foo) {
    throw new Error('Missing foo');
  }
  return true;
}

function processContext(context) {
  return { bar: context.foo + '-bar' };
}

function logContext(context) {
  console.log(context);
}

// Wrap functions into tasks
const validateTask = Cadenza.createTask(
  'Validate context',
  validateContext
);

const processTask = Cadenza.createTask(
  'Process context',
  processContext,
);

const logTask = Cadenza.createTask(
  'Log context',
  logContext,
);

// Chain tasks together
validateTask.then(processTask).then(logTask);

// Equivalent to:
const validated = validateContext(context);
if (validated) {
  const validatedContext = context;
  const processedContext = processContext(validatedContext);
  logContext(processedContext);
}
```

### Creating Routines
Routines are named entry points to graphs.

```typescript
const processContextRoutine = Cadenza.createRoutine(
  'Process context', 
  [validateTask], 
  'Processes a context by first validating it, processing the string and logging it.',
);
```

### Running Graphs
Use a Runner to execute routines or tasks.

```typescript
Cadenza.run(processContextRoutine);
```

### Signals
Signals provide event-driven coordination. The signal syntax is `domain.event`.

```typescript
processContextRoutine.doOn('main.recived_context'); // Subscribe to a signal
processTask.doOn('main.context_updated'); // Works on tasks and routines
logTask.emits('process.done'); // Emits after successfull task execution

Cadenza.emit('main.recived_context', {foo: 'foo'}); // Emit from anywhere with a context
Cadenza.emit('main.context_updated', {foo: 'foo-bar'}); // This will trigger the processTask and subsequently logTask. Essentially, skipping the validationTask.

// Emit a signal from within a task
Candenza.createTask('Update context', (ctx, emit) => {
  if (ctx.bar === 'foo-bar') {
    ctx.foo = 'foo-baz';
    emit('main.context_updated', ctx); 
  }
});
```

### Using the Meta Layer

The meta layer serves as a tool for extending the core features. It follows the same rules and primitives as the user layer but runs on a separate meta runner. It consists of MetaTasks, MetaRoutines and meta signals. To trigger a meta flow you need to emit a meta signal (meta.domain.event).

```typescript
Cadenza.createTask('My task', (ctx) => {
  console.log(ctx.foo);
  return ctx;
}).emits('meta.some.event');

Cadenza.createMetaTask('My meta task', (ctx) => {
  console.log(ctx.task.name);
  return true;
})
  .doOn('meta.some.event')
  .emits('meta.some.other_event');

Cadenza.emit('meta.some.event', {foo: 'bar'}); // Emit from anywhere
```

For full examples, see the cadenza-service package (https://github.com/cadenzaio/cadenza-service) or the test suite.

### Layer-Scoped Tools

Tasks and helpers can now declare helper and global dependencies and consume them through a dedicated `tools` argument.

```typescript
import Cadenza from "@cadenza.io/core";

const currency = Cadenza.createGlobal("Currency config", {
  code: "EUR",
  locale: "sv-SE",
});

const normalizeAmount = Cadenza.createHelper(
  "Normalize amount",
  (context, emit, inquire, tools) => ({
    ...context,
    normalizedAmount: Number(context.amount).toFixed(2),
    currencyCode: tools.globals.currency.code,
  }),
).usesGlobals({
  currency,
});

const formatAmount = Cadenza.createTask(
  "Format amount",
  (context, emit, inquire, tools) => {
    const normalized = tools.helpers.normalize({
      amount: context.amount,
    });
    return {
      ...context,
      label: `${normalized.normalizedAmount} ${tools.globals.currency.code}`,
    };
  },
).usesHelpers({
  normalize: normalizeAmount,
}).usesGlobals({
  currency,
});
```

Contract rules:

- task and helper handlers use `(context, emit, inquire, tools, progressCallback)`
- only explicitly declared same-layer dependencies appear in `tools`
- `tools.helpers.<alias>` is the callable helper entrypoint
- `tools.globals.<alias>` is a deep-frozen JSON-serializable value
- helpers are definition artifacts, not graph nodes
- helpers may call declared helpers and read declared globals, but may not mutate graph structure

### Runtime-Direct CLI

`@cadenza.io/core` now ships an official machine-facing CLI for local runtime authoring.

Start the stdio host:

```bash
cadenza runtime stdio
```

Start or attach to a named shared local runtime:

```bash
cadenza runtime shared start --runtime multi-agent-demo
cadenza runtime shared stdio --runtime multi-agent-demo
```

The host speaks JSON lines over stdio and is intended for agent/tool integrations. It supports:

- runtime bootstrap, reset, and snapshot inspection
- runtime subscriptions for queued signal delivery (`runtime.subscribe`, `runtime.unsubscribe`, `runtime.nextEvent`, `runtime.pollEvents`)
- task, routine, intent, actor, actor-task, helper, and global upserts
- task links, observed signals, emitted signals, intent bindings, and helper/global dependency bindings
- direct `run`, `emit`, and `inquire` operations against the live in-process runtime

Example handshake:

```json
{"ready":true,"protocol":"cadenza-runtime-jsonl","protocolVersion":"1","runtimeMode":"core","runtimeSharing":"isolated","runtimeName":null,"sessionId":null,"sessionRole":null,"supportedOperations":["runtime.bootstrap","runtime.info","runtime.detach","runtime.shutdown","runtime.reset","runtime.snapshot","runtime.subscribe","runtime.unsubscribe","runtime.nextEvent","runtime.pollEvents","task.upsert","task.link","task.observeSignal","task.emitSignal","task.respondToIntent","helper.upsert","global.upsert","task.useHelper","task.useGlobal","helper.useHelper","helper.useGlobal","routine.upsert","routine.observeSignal","intent.upsert","actor.upsert","actorTask.upsert","run","emit","inquire"]}
```

Runtime-authored handlers are supplied as JS/TS source strings and compiled inside a restricted local sandbox. They are session-local and inspectable through `runtime.snapshot`, but v1 does not persist them to disk.

Runtime snapshots now also include helper/global definitions and direct task/helper tool bindings.

Signal subscriptions are pull-based rather than push-streamed. Agents subscribe to signal patterns, then drain queued events with `runtime.nextEvent` or `runtime.pollEvents`. This keeps the stdio transport request/response only while still allowing reactive agent behavior for both business and runtime meta signals.

Shared mode adds a local daemon-backed collaboration path for multiple agents:

- `runtime.info` reports whether the session is isolated or shared and which role it has
- `runtime.detach` disconnects the current attached shared session without stopping the runtime
- `runtime.shutdown` shuts down the current runtime process or shared daemon
- shared sessions use one named in-memory runtime per daemon process
- roles are `owner`, `writer`, and `observer`

Shared mode keeps Cadenza semantics intact:

- prefer `emit` to trigger system flows
- prefer `inquire` to retrieve values from the system
- treat `run` as a manual debugging or direct execution tool

## Features
- **Graph-Based Orchestration**: Define tasks and routines with chaining for dependencies and layering.
- **Event-Driven Choreography**: Signals for loose coupling with meta-signals for self-management.
- **Context Management**: Immutable contexts with metadata separation and schema validation.
- **Execution Engine**: Sync/async strategies, throttling, debouncing, fan-in/fan-out merging, dynamic task creation/chaining/deletion.
- **Layer-Scoped Tools**: Explicit helper/global definitions, alias-scoped runtime injection, and immutable global values.
- **Runtime-Direct Authoring**: Agent/tool-friendly stdio host for defining and executing local primitives without file writes.

## Architecture Overview
Cadenza's core is divided into:
- **Definition Layer**: Task, Routine for static graphs.
- **Execution Layer**: Node, Layer, Builder, Runner for runtime.
- **Signal Layer**: SignalBroker, SignalParticipant for coordination.
- **Context Layer**: GraphContext for data flow.
- **Registry Layer**: GraphRegistry for introspection.
- **Factory**: Cadenza for creation and bootstrap.
- **Tool Layer**: Helper/global definitions, alias maps, and runtime tool resolution for tasks and helpers.
- **Runtime Host Layer**: JSONL stdio protocol + runtime-definition helpers for agent-driven local authoring.

## Contributing
Contributions are welcome! Please fork the repo, create a branch, and submit a PR. Follow the code style and add tests for new features.

## License
MIT License

Copyright (c) 2025 Cadenza.io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
