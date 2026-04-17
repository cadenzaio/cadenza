import { beforeEach, describe, expect, it } from "vitest";

import Cadenza from "../../src/Cadenza";
import { RuntimeHost } from "../../src/runtime/RuntimeHost";

function responseResult<T = unknown>(response: any): T {
  expect(response.ok).toBe(true);
  return response.result as T;
}

async function waitForRuntime(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
}

describe("RuntimeHost", () => {
  beforeEach(() => {
    Cadenza.reset();
    Cadenza.setMode("production");
  });

  it("exposes a stable handshake and rejects unsupported operations", async () => {
    const host = new RuntimeHost();

    expect(host.handshake()).toMatchObject({
      ready: true,
      protocol: "cadenza-runtime-jsonl",
      protocolVersion: "1",
      runtimeMode: "core",
      runtimeSharing: "isolated",
      runtimeName: null,
      sessionId: null,
      sessionRole: null,
    });
    expect(host.handshake().supportedOperations).toContain("task.upsert");
    expect(host.handshake().supportedOperations).toContain("runtime.info");

    const response = await host.handle({
      id: "bad-op",
      operation: "nope" as any,
    });

    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("unsupported_operation");
  });

  it("reports shared runtime info and enforces session roles", async () => {
    const observerHost = new RuntimeHost({
      runtimeSharing: "shared",
      runtimeName: "shared-spec",
      sessionId: "session-observer",
      sessionRole: "observer",
      activeSessionCountProvider: () => 3,
      daemonProcessId: 4242,
    });

    const infoResponse = await observerHost.handle({
      operation: "runtime.info",
    });

    expect(responseResult(infoResponse)).toMatchObject({
      runtimeSharing: "shared",
      runtimeName: "shared-spec",
      sessionId: "session-observer",
      sessionRole: "observer",
      activeSessionCount: 3,
      daemonProcessId: 4242,
    });

    const forbiddenAuthoring = await observerHost.handle({
      operation: "task.upsert",
      payload: {
        name: "ForbiddenObserverTask",
        language: "js",
        handlerSource: "() => true",
      },
    });

    expect(forbiddenAuthoring.ok).toBe(false);
    expect(forbiddenAuthoring.error?.code).toBe("forbidden");

    const writerHost = new RuntimeHost({
      runtimeSharing: "shared",
      runtimeName: "shared-spec",
      sessionId: "session-writer",
      sessionRole: "writer",
    });

    const forbiddenReset = await writerHost.handle({
      operation: "runtime.reset",
    });

    expect(forbiddenReset.ok).toBe(false);
    expect(forbiddenReset.error?.code).toBe("forbidden");

    const ownerHost = new RuntimeHost({
      runtimeSharing: "shared",
      runtimeName: "shared-spec",
      sessionId: "session-owner",
      sessionRole: "owner",
    });

    const detachResponse = await ownerHost.handle({
      operation: "runtime.detach",
    });

    expect(responseResult(detachResponse)).toMatchObject({
      detached: true,
      runtimeName: "shared-spec",
      sessionId: "session-owner",
    });
    expect(ownerHost.consumeControlAction()).toBe("detach");

    const shutdownResponse = await ownerHost.handle({
      operation: "runtime.shutdown",
    });

    expect(responseResult(shutdownResponse)).toMatchObject({
      shutdown: true,
      runtimeName: "shared-spec",
    });
    expect(ownerHost.consumeControlAction()).toBe("shutdown");
  });

  it("upserts JS and TS runtime tasks, binds intents, and snapshots source-backed tasks", async () => {
    const host = new RuntimeHost();

    await host.handle({
      operation: "intent.upsert",
      payload: {
        name: "runtime-js-echo",
        description: "Returns incremented numbers",
        input: { type: "object" },
        output: { type: "object" },
      },
    });

    const jsTaskResponse = await host.handle({
      operation: "task.upsert",
      payload: {
        name: "RuntimeJsResponder",
        description: "Responds with incremented values",
        language: "js",
        handlerSource: "(ctx) => ({ echoed: Number(ctx.value ?? 0) + 1 })",
      },
    });

    expect(responseResult(jsTaskResponse)).toMatchObject({
      task: {
        name: "RuntimeJsResponder",
        runtimeOwned: true,
        language: "js",
      },
    });

    await host.handle({
      operation: "task.respondToIntent",
      payload: {
        taskName: "RuntimeJsResponder",
        intentName: "runtime-js-echo",
      },
    });

    const jsInquiry = await host.handle({
      operation: "inquire",
      payload: {
        intent: "runtime-js-echo",
        context: { value: 4 },
      },
    });

    expect(responseResult<{ inquiry: string; response: { echoed: number } }>(jsInquiry))
      .toMatchObject({
        inquiry: "runtime-js-echo",
        response: { echoed: 5 },
      });

    await host.handle({
      operation: "intent.upsert",
      payload: {
        name: "runtime-ts-echo",
        description: "Returns incremented numbers from TS",
        input: { type: "object" },
        output: { type: "object" },
      },
    });

    await host.handle({
      operation: "task.upsert",
      payload: {
        name: "RuntimeTsResponder",
        description: "Responds with TypeScript-authored handlers",
        language: "ts",
        handlerSource:
          "(ctx: Record<string, unknown>) => ({ echoed: Number(ctx.value ?? 0) + 2 })",
      },
    });

    await host.handle({
      operation: "task.respondToIntent",
      payload: {
        taskName: "RuntimeTsResponder",
        intentName: "runtime-ts-echo",
      },
    });

    const tsInquiry = await host.handle({
      operation: "inquire",
      payload: {
        intent: "runtime-ts-echo",
        context: { value: 4 },
      },
    });

    expect(responseResult<{ response: { echoed: number } }>(tsInquiry)).toMatchObject({
      response: { echoed: 6 },
    });

    const snapshot = await host.handle({
      operation: "runtime.snapshot",
    });

    const tasks = responseResult<{ tasks: Array<{ name: string; language: string; handlerSource: string; runtimeOwned: boolean }> }>(snapshot).tasks;
    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "RuntimeJsResponder",
          language: "js",
          runtimeOwned: true,
          handlerSource: "(ctx) => ({ echoed: Number(ctx.value ?? 0) + 1 })",
        }),
        expect.objectContaining({
          name: "RuntimeTsResponder",
          language: "ts",
          runtimeOwned: true,
        }),
      ]),
    );
  });

  it("supports actor authoring, task links, routines, observed signals, and emitted signals", async () => {
    const host = new RuntimeHost();

    await host.handle({
      operation: "actor.upsert",
      payload: {
        name: "CounterActor",
        description: "Tracks counter state",
        defaultKey: "counter",
        loadPolicy: "eager",
        writeContract: "overwrite",
        state: {
          durable: {
            initState: {
              count: 0,
              signalCount: 0,
            },
          },
        },
      },
    });

    await host.handle({
      operation: "actorTask.upsert",
      payload: {
        actorName: "CounterActor",
        taskName: "CounterActor.Increment",
        description: "Increments count by input.step",
        mode: "write",
        language: "js",
        handlerSource:
          "({ state, input, setState }) => { setState({ ...state, count: state.count + Number(input.step ?? 1) }); return true; }",
      },
    });

    await host.handle({
      operation: "actorTask.upsert",
      payload: {
        actorName: "CounterActor",
        taskName: "CounterActor.Double",
        description: "Doubles count",
        mode: "write",
        language: "js",
        handlerSource:
          "({ state, setState }) => { setState({ ...state, count: state.count * 2 }); return true; }",
      },
    });

    await host.handle({
      operation: "task.link",
      payload: {
        predecessorTaskName: "CounterActor.Increment",
        successorTaskName: "CounterActor.Double",
      },
    });

    await host.handle({
      operation: "routine.upsert",
      payload: {
        name: "CounterFlow",
        description: "Runs increment then double",
        startTaskNames: ["CounterActor.Increment"],
      },
    });

    await host.handle({
      operation: "run",
      payload: {
        targetName: "CounterFlow",
        context: { step: 2 },
      },
    });

    const routineSnapshot = await host.handle({
      operation: "runtime.snapshot",
    });
    let actors = responseResult<{ actors: Array<{ name: string; actorKeys: Array<{ durableState: { count: number; signalCount: number } }> }> }>(routineSnapshot).actors;
    expect(actors.find((actor) => actor.name === "CounterActor")?.actorKeys[0]?.durableState)
      .toEqual({
        count: 4,
        signalCount: 0,
      });

    await host.handle({
      operation: "actorTask.upsert",
      payload: {
        actorName: "CounterActor",
        taskName: "CounterActor.SignalIncrement",
        description: "Increments signal count on observed signals",
        mode: "write",
        language: "js",
        handlerSource:
          "({ state, setState }) => { setState({ ...state, signalCount: state.signalCount + 1 }); return true; }",
      },
    });

    await host.handle({
      operation: "task.observeSignal",
      payload: {
        taskName: "CounterActor.SignalIncrement",
        signal: "runtime.counter.bumped",
      },
    });

    await host.handle({
      operation: "emit",
      payload: {
        signal: "runtime.counter.bumped",
        context: {},
      },
    });

    await waitForRuntime();

    let signalSnapshot = await host.handle({
      operation: "runtime.snapshot",
    });
    actors = responseResult<{ actors: Array<{ name: string; actorKeys: Array<{ durableState: { count: number; signalCount: number } }> }> }>(signalSnapshot).actors;
    expect(actors.find((actor) => actor.name === "CounterActor")?.actorKeys[0]?.durableState)
      .toEqual({
        count: 4,
        signalCount: 1,
      });

    await host.handle({
      operation: "task.upsert",
      payload: {
        name: "EmitCounterBump",
        description: "Emits a signal after execution",
        language: "js",
        handlerSource: "() => true",
      },
    });

    await host.handle({
      operation: "task.emitSignal",
      payload: {
        taskName: "EmitCounterBump",
        signal: "runtime.counter.bumped",
        mode: "after",
      },
    });

    await host.handle({
      operation: "run",
      payload: {
        targetName: "EmitCounterBump",
        context: {},
      },
    });

    await waitForRuntime();

    signalSnapshot = await host.handle({
      operation: "runtime.snapshot",
    });
    actors = responseResult<{ actors: Array<{ name: string; actorKeys: Array<{ durableState: { count: number; signalCount: number } }> }> }>(signalSnapshot).actors;
    expect(actors.find((actor) => actor.name === "CounterActor")?.actorKeys[0]?.durableState)
      .toEqual({
        count: 4,
        signalCount: 2,
      });
  });

  it("passes declared helpers and globals into runtime-authored actor tasks", async () => {
    const host = new RuntimeHost();

    await host.handle({
      operation: "actor.upsert",
      payload: {
        name: "RuntimeToolActor",
        description: "Tracks helper-driven writes",
        defaultKey: "runtime-tool-actor",
        loadPolicy: "eager",
        writeContract: "overwrite",
        state: {
          durable: {
            initState: {
              value: 0,
            },
          },
        },
      },
    });

    await host.handle({
      operation: "helper.upsert",
      payload: {
        name: "NormalizeRuntimeActorAmount",
        language: "js",
        handlerSource:
          "(ctx) => ({ ...ctx, normalizedValue: Number(ctx.value ?? 0) })",
      },
    });

    await host.handle({
      operation: "global.upsert",
      payload: {
        name: "RuntimeActorMultiplierConfig",
        value: {
          multiplier: 4,
        },
      },
    });

    await host.handle({
      operation: "actorTask.upsert",
      payload: {
        actorName: "RuntimeToolActor",
        taskName: "RuntimeToolActor.Apply",
        description: "Applies helper and global driven updates",
        mode: "write",
        language: "js",
        handlerSource:
          "({ input, setState }, _emit, _inquire, tools) => { const normalized = tools.helpers.normalize({ value: input.value }); const nextValue = normalized.normalizedValue * tools.globals.config.multiplier; setState({ value: nextValue }); return { nextValue }; }",
      },
    });

    await host.handle({
      operation: "task.useHelper",
      payload: {
        taskName: "RuntimeToolActor.Apply",
        alias: "normalize",
        helperName: "NormalizeRuntimeActorAmount",
      },
    });

    await host.handle({
      operation: "task.useGlobal",
      payload: {
        taskName: "RuntimeToolActor.Apply",
        alias: "config",
        globalName: "RuntimeActorMultiplierConfig",
      },
    });

    await host.handle({
      operation: "run",
      payload: {
        targetName: "RuntimeToolActor.Apply",
        context: {
          value: 3,
        },
      },
    });

    const snapshot = await host.handle({
      operation: "runtime.snapshot",
    });
    const actors = responseResult<{
      actors: Array<{
        name: string;
        actorKeys: Array<{ durableState: { value: number } }>;
      }>;
    }>(snapshot).actors;

    expect(
      actors.find((actor) => actor.name === "RuntimeToolActor")?.actorKeys[0]
        ?.durableState,
    ).toEqual({
      value: 12,
    });
  });

  it("resets runtime state and rejects forbidden sandbox access", async () => {
    const host = new RuntimeHost();

    const forbidden = await host.handle({
      operation: "task.upsert",
      payload: {
        name: "ForbiddenTask",
        description: "Attempts to read process",
        language: "js",
        handlerSource: "() => process.env",
      },
    });

    expect(forbidden.ok).toBe(false);
    expect(forbidden.error?.message).toContain("process");

    await host.handle({
      operation: "task.upsert",
      payload: {
        name: "RuntimeResetTask",
        language: "js",
        handlerSource: "() => ({ ok: true })",
      },
    });

    const reset = await host.handle({
      operation: "runtime.reset",
    });

    expect(responseResult(reset)).toMatchObject({
      reset: true,
      bootstrapped: false,
    });

    const snapshot = await host.handle({
      operation: "runtime.snapshot",
    });

    expect(responseResult<{ tasks: unknown[]; routines: unknown[]; actors: unknown[]; actorTasks: unknown[] }>(snapshot))
      .toMatchObject({
        tasks: [],
        routines: [],
        actors: [],
        actorTasks: [],
      });
  });

  it("supports queued subscriptions for meta and business signals", async () => {
    const host = new RuntimeHost();

    const subscriptionResponse = await host.handle({
      operation: "runtime.subscribe",
      payload: {
        signalPatterns: ["meta.task.created", "runtime.counter.bumped"],
        maxQueueSize: 10,
      },
    });

    const subscriptionId = responseResult<{
      subscription: { subscriptionId: string };
    }>(subscriptionResponse).subscription.subscriptionId;

    await host.handle({
      operation: "task.upsert",
      payload: {
        name: "RuntimeSignalProducer",
        description: "Produces a runtime signal",
        language: "js",
        handlerSource: "() => true",
      },
    });

    const metaEventResponse = await host.handle({
      operation: "runtime.nextEvent",
      payload: {
        subscriptionId,
        timeoutMs: 50,
      },
    });

    expect(
      responseResult<{
        event: { signalName: string; isMeta: boolean; type: string };
        timedOut: boolean;
      }>(metaEventResponse),
    ).toMatchObject({
      event: {
        signalName: "meta.task.created",
        isMeta: true,
        type: "signal",
      },
      timedOut: false,
    });

    await host.handle({
      operation: "task.emitSignal",
      payload: {
        taskName: "RuntimeSignalProducer",
        signal: "runtime.counter.bumped",
        mode: "after",
      },
    });

    await host.handle({
      operation: "run",
      payload: {
        targetName: "RuntimeSignalProducer",
        context: {},
      },
    });

    const businessEventResponse = await host.handle({
      operation: "runtime.nextEvent",
      payload: {
        subscriptionId,
        timeoutMs: 50,
      },
    });

    expect(
      responseResult<{
        event: {
          signalName: string;
          isMeta: boolean;
          source: { taskName: string | null };
        };
      }>(businessEventResponse),
    ).toMatchObject({
      event: {
        signalName: "runtime.counter.bumped",
        isMeta: false,
        source: {
          taskName: "RuntimeSignalProducer",
        },
      },
    });

    Cadenza.emit("runtime.counter.bumped", { value: 1 });
    Cadenza.emit("runtime.counter.bumped", { value: 2 });

    const polledEvents = await host.handle({
      operation: "runtime.pollEvents",
      payload: {
        subscriptionId,
        limit: 10,
      },
    });

    expect(
      responseResult<{
        events: Array<{ signalName: string; context: { value?: number } }>;
        pendingEvents: number;
      }>(polledEvents),
    ).toMatchObject({
      events: [
        {
          signalName: "runtime.counter.bumped",
          context: { value: 1 },
        },
        {
          signalName: "runtime.counter.bumped",
          context: { value: 2 },
        },
      ],
      pendingEvents: 0,
    });
  });

  it("supports waiting, timeouts, unsubscribe, and reset cleanup for subscriptions", async () => {
    const host = new RuntimeHost();

    const subscribeResponse = await host.handle({
      operation: "runtime.subscribe",
      payload: {
        signalPatterns: ["runtime.agent.wait"],
      },
    });

    const subscriptionId = responseResult<{
      subscription: { subscriptionId: string };
    }>(subscribeResponse).subscription.subscriptionId;

    const nextEventPromise = host.handle({
      operation: "runtime.nextEvent",
      payload: {
        subscriptionId,
        timeoutMs: 100,
      },
    });

    setTimeout(() => {
      Cadenza.emit("runtime.agent.wait", { ok: true });
    }, 10);

    const waitedEvent = await nextEventPromise;
    expect(
      responseResult<{
        event: { signalName: string; context: { ok: boolean } } | null;
        timedOut: boolean;
      }>(waitedEvent),
    ).toMatchObject({
      event: {
        signalName: "runtime.agent.wait",
        context: { ok: true },
      },
      timedOut: false,
    });

    const timeoutResponse = await host.handle({
      operation: "runtime.nextEvent",
      payload: {
        subscriptionId,
        timeoutMs: 5,
      },
    });

    expect(
      responseResult<{ event: null; timedOut: boolean }>(timeoutResponse),
    ).toMatchObject({
      event: null,
      timedOut: true,
    });

    const unsubscribeResponse = await host.handle({
      operation: "runtime.unsubscribe",
      payload: {
        subscriptionId,
      },
    });

    expect(responseResult<{ unsubscribed: boolean }>(unsubscribeResponse))
      .toMatchObject({
        unsubscribed: true,
      });

    const missingAfterUnsubscribe = await host.handle({
      operation: "runtime.pollEvents",
      payload: {
        subscriptionId,
        limit: 10,
      },
    });

    expect(missingAfterUnsubscribe.ok).toBe(false);
    expect(missingAfterUnsubscribe.error?.code).toBe("not_found");

    const resetSubscribeResponse = await host.handle({
      operation: "runtime.subscribe",
      payload: {
        signalPatterns: ["runtime.agent.reset"],
      },
    });
    const resetSubscriptionId = responseResult<{
      subscription: { subscriptionId: string };
    }>(resetSubscribeResponse).subscription.subscriptionId;

    await host.handle({
      operation: "runtime.reset",
    });

    const missingAfterReset = await host.handle({
      operation: "runtime.nextEvent",
      payload: {
        subscriptionId: resetSubscriptionId,
        timeoutMs: 0,
      },
    });

    expect(missingAfterReset.ok).toBe(false);
    expect(missingAfterReset.error?.code).toBe("not_found");
  });
});
