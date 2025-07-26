import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Cadenza from "../../Cadenza";
import GraphContext from "../../src/graph/context/GraphContext";
import GraphNode from "../../src/graph/execution/GraphNode";
import ThrottleEngine from "../../src/engine/ThrottleEngine";
import SignalBroker from "../../src/engine/SignalBroker";
import GraphRegistry from "../../src/controllers/GraphRegistry";
import AsyncGraphLayer from "../../src/graph/execution/AsyncGraphLayer";
import GraphAsyncQueueBuilder from "../../src/engine/builders/GraphAsyncQueueBuilder";
import GraphRun from "../../src/engine/GraphRun";
import GraphAsyncRun from "../../src/engine/strategy/GraphAsyncRun";

// Mock utilities
vi.mock("../../src/core/engine/SignalBroker", () => ({
  SignalBroker: {
    instance: {
      observe: vi.fn(),
      emit: vi.fn(),
      reset: vi.fn(),
    },
  },
}));
vi.mock("../../src/core/engine/ThrottleEngine", () => ({
  ThrottleEngine: {
    instance: {
      setConcurrencyLimit: vi.fn(),
      throttle: vi
        .fn()
        .mockImplementation((fn: any, node: any) => Promise.resolve(fn(node))),
    },
  },
}));

describe("Task", () => {
  beforeEach(() => {
    Cadenza.reset();
  });
  afterEach(() => {});

  it("detects cycle in doAfter", () => {
    const t1 = Cadenza.createTask("t1", () => true);
    const t2 = Cadenza.createTask("t2", () => true);
    t1.doAfter(t2);
    expect(() => t2.doAfter(t1)).toThrow("Cycle");
  });

  it("detects cycle in doOnFail", () => {
    const t1 = Cadenza.createTask("t1", () => true);
    const t2 = Cadenza.createTask("t2", () => true);
    t1.doOnFail(t2);
    expect(() => t2.doOnFail(t1)).toThrow("Cycle");
  });

  it("handles concurrency limit", () => {
    const t1 = Cadenza.createTask("t1", () => true, "", { concurrency: 1 });
    const ctx = new GraphContext({});
    const node1 = new GraphNode(t1, ctx, "g1");
    const node2 = new GraphNode(t1, ctx, "g1");
    // Mock ThrottleEngine to enforce limit
    ThrottleEngine.instance.throttle.mockImplementationOnce(() =>
      Promise.resolve([]),
    );
    node1.execute();
    expect(ThrottleEngine.instance.throttle).toHaveBeenCalled();
  });

  it("triggers signals on execute", () => {
    const spy = vi.fn();
    const t1 = Cadenza.createTask("t1", (ctx) => true)
      .doOn("test")
      .emits("test");
    SignalBroker.instance.observe("test", { run: spy } as any);
    const ctx = new GraphContext({});
    t1.execute(ctx, () => {});
    expect(spy).toHaveBeenCalled();
  });

  it("destroys cleanly", () => {
    const t1 = Cadenza.createTask("t1", () => true);
    const t2 = Cadenza.createTask("t2", () => true);
    t1.then(t2);
    t1.destroy();
    const t1Data = t1.export();
    const t2Data = t2.export();
    expect(t1Data.__nextTasks.length).toBe(0);
    expect(t2Data.__previousTasks.length).toBe(0);
    expect(GraphRegistry.instance.getAllTasks.export().__tasks.length).toBe(1); // Seed remains
  });
});

describe("GraphNode", () => {
  beforeEach(() => {
    Cadenza.reset();
  });

  it("processes async task", async () => {
    const t1 = Cadenza.createTask("t1", async () => true);
    const ctx = new GraphContext({});
    const node = new GraphNode(t1, ctx, "g1");
    const next = await node.execute();
    const nodeData = node.lightExport();
    expect(nodeData.__executionTime).toBeGreaterThan(0);
  });

  it("divides on generator", () => {
    const t1 = Cadenza.createTask("t1", function* () {
      yield { foo: 1 };
      yield { foo: 2 };
    });
    const ctx = new GraphContext({});
    const node = new GraphNode(t1, ctx, "g1");
    const next = node.execute() as GraphNode[];
    expect(next.length).toBe(2);
  });

  it("consumes duplicate unique node", () => {
    const t1 = Cadenza.createUniqueTask("t1", () => true);
    const ctx = new GraphContext({});
    const n1 = new GraphNode(t1, ctx, "g1");
    const n2 = new GraphNode(t1, ctx, "g1");
    n1.consume(n2);
    const n1Data = n1.lightExport();
    expect(n1Data.__context.__context.joinedContexts.length).toBe(1);
    expect(n2.destroyed).toBe(true); // Mock
  });

  it("propagates error to onFail", () => {
    const t1 = Cadenza.createTask("t1", () => {
      throw new Error("test");
    });
    const t2 = Cadenza.createTask("t2", () => true);
    t1.doOnFail(t2);
    const ctx = new GraphContext({});
    const node = new GraphNode(t1, ctx, "g1");
    const next = node.execute() as GraphNode[];
    const nodeData = node.lightExport();
    expect(nodeData.__errored).toBe(true);
    expect(next.length).toBe(1); // t2
  });

  it("completes subgraph iteratively", () => {
    const t1 = Cadenza.createTask("t1", () => true);
    const t2 = Cadenza.createTask("t2", () => true);
    t1.then(t2);
    const ctx = new GraphContext({});
    const n1 = new GraphNode(t1, ctx, "g1");
    n1.execute();
    expect(n1.subgraphDone()).toBe(true);
  });
});

describe("AsyncGraphLayer", () => {
  it("throttles nodes", async () => {
    const t1 = Cadenza.createTask("t1", () => true, "", { concurrency: 1 });
    const ctx = new GraphContext({});
    const layer = new AsyncGraphLayer(0);
    const n1 = new GraphNode(t1, ctx, "g1");
    const n2 = new GraphNode(t1, ctx, "g1");
    layer.add(n1);
    layer.add(n2);
    const result = await layer.execute();
    expect(Object.keys(result).length).toBe(1);
    expect(result["g1"].length).toBe(2); // Sequential due to limit
  });

  it("handles async execution", async () => {
    const t1 = Cadenza.createTask("t1", async () => true);
    const ctx = new GraphContext({});
    const layer = new AsyncGraphLayer(0);
    layer.add(new GraphNode(t1, ctx, "g1"));
    const result = await layer.execute();
    expect(result["g1"].length).toBe(0); // No next for true
  });
});

describe("GraphAsyncQueueBuilder", () => {
  it("processes multi-layer graph", async () => {
    const t1 = Cadenza.createTask("t1", () => true);
    const t2 = Cadenza.createTask("t2", () => true);
    t1.then(t2);
    const ctx = new GraphContext({});
    const builder = new GraphAsyncQueueBuilder();
    builder.addNode(new GraphNode(t1, ctx, "g1"));
    await builder.compose();
    const graph = builder.getResult();
    expect(graph.getNumberOfNodes()).toBe(2);
  });
});

describe("GraphRun", () => {
  it("exports with exporter", () => {
    const t1 = Cadenza.createTask("t1", () => true);
    const ctx = new GraphContext({});
    const run = new GraphRun(new GraphAsyncRun());
    run.addNode(new GraphNode(t1, ctx, "g1"));
    run.run();
    const result = run.export();
    expect(result.__id).toBeDefined();
  });
});

describe("GraphRunner", () => {
  it("runs routine", async () => {
    const t1 = Cadenza.createTask("t1", () => true);
    const routine = Cadenza.createRoutine("r1", [t1]);
    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(routine, {});
    expect(run.export().__graph.numberOfNodes).toBe(1);
  });

  it("handles no task/routine", async () => {
    const runner = Cadenza.runner;
    // @ts-ignore
    const run = await runner.run({}, {});
    expect(run.export().__graph).toBeUndefined();
  });
});

describe("SignalBroker", () => {
  it("triggers wildcard listeners", () => {
    const spy = vi.fn();
    SignalBroker.instance.observe("a.b.c", { run: spy } as any);
    SignalBroker.instance.observe("a.b.*", { run: spy } as any);
    SignalBroker.instance.emit("a.b.c", {});
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("routes meta signals", () => {
    const spyMeta = vi.fn(),
      spyStd = vi.fn();
    SignalBroker.instance.observe("meta.x", { run: spyMeta } as any);
    SignalBroker.instance.observe("x", { run: spyStd } as any);
    SignalBroker.instance.emit("meta.x", {});
    SignalBroker.instance.emit("x", {});
    expect(spyMeta).toHaveBeenCalled();
    expect(spyStd).toHaveBeenCalled();
  });
});

describe("GraphContext", () => {
  it("separates metadata", () => {
    const ctx = new GraphContext({ foo: "bar", __meta: "data" });
    expect(ctx.getContext()).toEqual({ foo: "bar" });
    expect(ctx.getMetaData()).toEqual({ __meta: "data" });
  });

  it("combines contexts", () => {
    const ctx1 = new GraphContext({ foo: "bar" });
    const ctx2 = new GraphContext({ baz: "qux" });
    const combined = ctx1.combine(ctx2);
    expect(combined.getContext().joinedContexts.length).toBe(2);
  });
});

describe("GraphRegistry", () => {
  it("registers via seed", () => {
    const t1 = Cadenza.createTask("t1", () => true);
    expect(GraphRegistry.instance.getAllTasks.export().__tasks.length).toBe(2); // Seed + t1
  });

  it("deletes task", () => {
    const t1 = Cadenza.createTask("t1", () => true);
    GraphRegistry.instance.deleteTask.execute(
      new GraphContext({ __id: t1.id }),
      () => {},
    );
    expect(GraphRegistry.instance.getAllTasks.export().__tasks.length).toBe(1);
  });
});
