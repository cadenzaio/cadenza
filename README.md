# Cadenza Core

## Overview

Cadenza is an innovative framework that extends traditional orchestration with event-driven choreography, providing "structured freedom" for building distributed, self-evolving systems. 

The core package (@Cadenza.io/core) includes the foundational primitives for defining and executing graphs of tasks, managing contexts, handling signals, and bootstrapping executions. It's designed to be language-agnostic in model, with this TypeScript implementation serving as the reference.

Cadenza's design philosophy emphasizes:
- **Structured Freedom**: Explicit graphs for dependencies (orchestration) combined with signals for loose coupling (choreography).
- **Meta-Layer Extension**: A self-reflective layer for monitoring, optimization, and auto-generation, enabling AI-driven self-development. Essentially extending the core, using the core.
- **Introspectability**: Exportable graphs, traceable executions, and metadata separation for transparency and debugging.
- **Modularity**: Lightweight core with extensions (e.g., distribution, UI integration) as separate packages.

The core is suitable for local dynamic workflows using tasks and signals. But thanks to the meta layer, it also serves as the foundation for the distributed, agentic AI applications, and more, abstracting complexities like networking and security in extensions.

## Installation

Install the core package via npm:

```bash
npm install @cadenza.io/core
```

## Usage

### Creating Tasks
Tasks are the atomic units of work in Cadenza. They can be chained to form graphs.

```typescript
import Cadenza from '@cadenza.io/core';

const task1 = Cadenza.createTask('task1', (context) => {
  console.log(context.foo);
  return { bar: 'baz' };
}, 'First task');

const task2 = Cadenza.createTask('task2', (context) => {
  return {...context, qux: 'quux'};
}, 'Second task');

const task3 = Cadenza.createTask('task3', (context) => {
  return {...context, cadenza: 'is awesome'};
}, 'Third task');

task1.then(
  task2.then(
    task3
  ),
);

```

### Creating Routines
Routines are named entry points to graphs.

```typescript
const routine = Cadenza.createRoutine('myRoutine', [task1], 'Test routine');
```

### Running Graphs
Use a Runner to execute routines or tasks.

```typescript
const runner = Cadenza.runner;
await runner.run(routine, {foo: 'bar'});
```

### Signals
Signals provide event-driven coordination.

```typescript
task1.emits('my.signal');
task2.doOn('my.other.signal');

Cadenza.broker.emit('my.other.signal', {foo: 'bar'}); // This will trigger task2
```

### Using the Meta Layer

The meta layer serves as a tool for extending the core features. It follows the same rules and primitives as the user layer but runs on a separate meta runner. It consists of MetaTasks, MetaRoutines and meta signals. To trigger a meta flow you need to emit a meta signal (meta.[domain].[action]).

```typescript
Cadenza.createTask('My task', (ctx) => {
  console.log(ctx.foo);
  return ctx;
}).emits('meta.some.signal'); // Emits a on task execution

Cadenza.createMetaTask('My meta task', (ctx) => {
  console.log(ctx.__task.name);
  return true;
}).doOn('meta.some.signal');

Cadenza.broker.emit('meta.some.signal', {foo: 'bar'}); // Trigger from anywhere
```

For full examples, see the [docs folder](docs/examples.md) or the test suite.

## Features
- **Graph-Based Orchestration**: Define tasks and routines with chaining for dependencies, failovers, and layering.
- **Event-Driven Choreography**: Signals for loose coupling, with meta-signals for self-management.
- **Context Management**: Immutable contexts with metadata separation and schema validation.
- **Execution Engine**: Sync/async strategies, throttling, debouncing, and unique merging.
- **Bootstrapping**: Lazy initialization with seed tasks for registry and signal handling.

## Architecture Overview
Cadenza's core is divided into:
- **Definition Layer**: Task, Routine for static graphs.
- **Execution Layer**: Node, Layer, Builder, Run for runtime.
- **Signal Layer**: SignalBroker, SignalParticipant for coordination.
- **Context Layer**: GraphContext for data flow.
- **Registry Layer**: GraphRegistry for introspection.
- **Factory**: Cadenza for creation and bootstrap.

## Contributing
Contributions are welcome! Please fork the repo, create a branch, and submit a PR. Follow the code style and add tests for new features.

## License
MIT License. See [LICENSE](LICENSE) for details.
