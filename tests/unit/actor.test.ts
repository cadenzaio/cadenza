import { beforeEach, describe, expect, it } from "vitest";
import Cadenza from "../../src/Cadenza";
import type { AnyObject } from "../../src/types/global";
import type { InquiryOptions } from "../../src/engine/InquiryBroker";
import type { TaskFunction } from "../../src/graph/definition/Task";

const noopEmit = (_signal: string, _context: AnyObject) => {};
const noopProgress = (_progress: number) => {};
const noopInquire = async (
  _inquiry: string,
  _context: AnyObject,
  _options: InquiryOptions = {},
) => ({});

async function invokeTask(task: TaskFunction, context: AnyObject = {}) {
  return task(context, noopEmit, noopInquire, noopProgress);
}

describe("Actor runtime", () => {
  beforeEach(() => {
    Cadenza.reset();
    Cadenza.setMode("production");
  });

  it("persists actor durable state between task invocations with overwrite writes", async () => {
    const actor = Cadenza.createActor({
      name: "CounterActor",
      description: "Tracks durable counter values",
      defaultKey: "counter",
      initialState: { count: 0 },
      loadPolicy: "eager",
      writeContract: "overwrite",
    });

    const incrementTask = actor.task(
      ({ state, setState }) => {
        const next = { count: state.count + 1 };
        setState(next);
        return next;
      },
      { mode: "write" },
    );

    await invokeTask(incrementTask);
    await invokeTask(incrementTask);

    expect(actor.getState()).toEqual({ count: 2 });
    expect(actor.getDurableState()).toEqual({ count: 2 });
    expect(actor.getVersion()).toBe(2);
    expect(actor.getDurableVersion()).toBe(2);
  });

  it("resolves key using explicit actorKey, then keyResolver, then defaultKey", async () => {
    const actor = Cadenza.createActor({
      name: "IdentityActor",
      defaultKey: "default-identity",
      initialState: { touched: true },
      keyResolver: (input) => input.userId,
    });

    const readKeyTask = actor.task(
      ({ actor: actorContext }) => ({
        resolvedKey: actorContext.key,
      }),
      { mode: "read" },
    );

    const fromDefault = await invokeTask(readKeyTask, {});
    const fromResolver = await invokeTask(readKeyTask, { userId: "user-12" });
    const fromExplicit = await invokeTask(readKeyTask, {
      userId: "user-12",
      __actorOptions: {
        actorKey: "explicit-override",
      },
    });

    expect(fromDefault).toEqual({ resolvedKey: "default-identity" });
    expect(fromResolver).toEqual({ resolvedKey: "user-12" });
    expect(fromExplicit).toEqual({ resolvedKey: "explicit-override" });
  });

  it("resolves key from declarative field/path/template key definitions", async () => {
    const fieldActor = Cadenza.createActor({
      name: "FieldKeyActor",
      defaultKey: "fallback-field",
      key: { source: "field", field: "userId" },
      initialState: { value: 1 },
    });
    const pathActor = Cadenza.createActor({
      name: "PathKeyActor",
      defaultKey: "fallback-path",
      key: { source: "path", path: "user.id" },
      initialState: { value: 1 },
    });
    const templateActor = Cadenza.createActor({
      name: "TemplateKeyActor",
      defaultKey: "fallback-template",
      key: { source: "template", template: "tenant:{tenantId}:user:{user.id}" },
      initialState: { value: 1 },
    });

    const fieldKeyTask = fieldActor.task(({ actor }) => actor.key);
    const pathKeyTask = pathActor.task(({ actor }) => actor.key);
    const templateKeyTask = templateActor.task(({ actor }) => actor.key);

    await expect(invokeTask(fieldKeyTask, { userId: "u1" })).resolves.toBe("u1");
    await expect(invokeTask(pathKeyTask, { user: { id: "u2" } })).resolves.toBe(
      "u2",
    );
    await expect(
      invokeTask(templateKeyTask, { tenantId: "t1", user: { id: "u3" } }),
    ).resolves.toBe("tenant:t1:user:u3");
  });

  it("creates actors from definitions with runtime factories, init handlers, and init tasks", async () => {
    Cadenza.createTask(
      "Definition.InitTask",
      (ctx) => ({
        durableState: {
          ...(ctx.__actorInit?.durableBaseState ?? {}),
          seededByInitTask: true,
        },
      }),
      "Seeds actor durable state from init task",
    );
    expect(Cadenza.get("Definition.InitTask")).toBeDefined();

    const actor = Cadenza.createActorFromDefinition<
      { count: number; seededByHandler: boolean; seededByInitTask?: boolean },
      { runtimeToken: string; createdFrom: string }
    >(
      {
        name: "DefinitionActor",
        description: "DB-native actor definition for tests",
        defaultKey: "def-default",
        loadPolicy: "lazy",
        key: { source: "field", field: "entityId" },
        state: {
          durable: {
            initialState: { count: 0, seededByHandler: false },
          },
          runtime: {
            initialState: { runtimeToken: "initial", createdFrom: "initial" },
            factoryToken: "runtime_factory",
            factoryConfig: {
              mode: "test",
            },
          },
        },
        lifecycle: {
          initHandlerToken: "init_handler",
          initTaskName: "Definition.InitTask",
        },
      },
      {
        runtimeFactories: {
          runtime_factory: ({ input, config }) => ({
            runtimeToken: String(input.runtimeToken ?? "runtime-default"),
            createdFrom: String(config?.mode ?? "unknown"),
          }),
        },
        initHandlers: {
          init_handler: ({ setDurableState, durableBaseState }) => {
            setDurableState({
              ...durableBaseState,
              seededByHandler: true,
            });
          },
        },
      },
    );

    const readTask = actor.task(
      ({ durableState, runtimeState, actor }) => ({
        key: actor.key,
        durableState,
        runtimeState,
      }),
      { mode: "read" },
    );

    const result = await invokeTask(readTask, {
      entityId: "e-1",
      runtimeToken: "runtime-1",
    });

    expect(result).toEqual({
      key: "e-1",
      durableState: {
        count: 0,
        seededByHandler: false,
        seededByInitTask: true,
      },
      runtimeState: {
        runtimeToken: "runtime-1",
        createdFrom: "test",
      },
    });
  });

  it("keeps invocation policy overrides fixed to actor defaults", async () => {
    const actor = Cadenza.createActor({
      name: "InvocationPolicyActor",
      defaultKey: "invocation-default",
      writeContract: "overwrite",
      initialState: { count: 0 },
    });

    const writeTask = actor.task(
      ({ state, setState, options }) => {
        setState({ count: state.count + 1 });
        return options.writeContract;
      },
      { mode: "write" },
    );

    const result = await invokeTask(writeTask, {
      __actorOptions: {
        writeContract: "patch",
        loadPolicy: "lazy",
        consistencyProfile: "strict",
      },
    });

    expect(result).toBe("overwrite");
    expect(actor.getState()).toEqual({ count: 1 });
  });

  it("exports source definitions with toDefinition for DB round-tripping", () => {
    const definition = {
      name: "RoundtripActor",
      description: "Roundtrip actor definition",
      defaultKey: "roundtrip",
      state: {
        durable: {
          initialState: {
            value: 1,
          },
        },
      },
      key: {
        source: "field" as const,
        field: "entityId",
      },
      tasks: [
        {
          taskName: "RoundtripActor.Read",
          mode: "read" as const,
          description: "Reads actor state",
        },
      ],
    };

    const actor = Cadenza.createActorFromDefinition(definition);
    expect(actor.toDefinition()).toEqual(definition);
  });

  it("applies patch writes as shallow merge by default", async () => {
    const actor = Cadenza.createActor({
      name: "PatchActor",
      defaultKey: "patch",
      initialState: {
        profile: {
          name: "Alice",
          city: "Stockholm",
        },
        role: "admin",
      },
      writeContract: "patch",
    });

    const patchTask = actor.task(
      ({ patchState }) => {
        patchState({
          profile: {
            name: "Bob",
          } as { name: string; city?: string },
        });
      },
      { mode: "write" },
    );

    await invokeTask(patchTask);

    expect(actor.getState()).toEqual({
      profile: {
        name: "Bob",
      },
      role: "admin",
    });
  });

  it("keeps durable and runtime state split, with runtime set in init", async () => {
    const actor = Cadenza.createActor<
      { userId: string | null },
      { token: string; connected: boolean }
    >({
      name: "SessionActor",
      defaultKey: "primary",
      loadPolicy: "lazy",
      initialDurableState: { userId: null },
      initialRuntimeState: () => ({ token: "none", connected: false }),
      init: ({ input, setRuntimeState }) => {
        setRuntimeState((runtime) => ({
          ...runtime,
          token: String(input.token ?? "none"),
        }));
      },
    });

    const readTask = actor.task(
      ({ durableState, runtimeState }) => ({
        userId: durableState.userId,
        token: runtimeState.token,
      }),
      { mode: "read" },
    );

    const first = await invokeTask(readTask, { token: "abc" });
    const second = await invokeTask(readTask, { token: "zzz" });
    const third = await invokeTask(readTask, {
      token: "secondary-token",
      __actorOptions: {
        actorKey: "secondary",
      },
    });

    expect(first).toEqual({ userId: null, token: "abc" });
    expect(second).toEqual({ userId: null, token: "abc" });
    expect(third).toEqual({ userId: null, token: "secondary-token" });
    expect(actor.getRuntimeState("primary")).toEqual({
      token: "abc",
      connected: false,
    });
  });

  it("allows runtime objects in runtime state without cloning errors", async () => {
    class RuntimeClient {
      connected = false;

      connect() {
        this.connected = true;
      }
    }

    const actor = Cadenza.createActor<
      { state: string },
      { client: RuntimeClient }
    >({
      name: "RuntimeObjectActor",
      defaultKey: "default",
      initialState: { state: "ok" },
      initialRuntimeState: () => ({ client: new RuntimeClient() }),
    });

    const useClientTask = actor.task(
      ({ runtimeState }) => {
        runtimeState.client.connect();
        return runtimeState.client.connected;
      },
      { mode: "read" },
    );

    const first = await invokeTask(useClientTask);
    const second = await invokeTask(useClientTask);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(actor.getRuntimeState().client.connected).toBe(true);
  });

  it("supports optional freeze-shallow runtime read guard", async () => {
    const actor = Cadenza.createActor<{ value: number }, { cacheHits: number }>({
      name: "RuntimeReadGuardActor",
      defaultKey: "runtime-read-guard",
      initialState: { value: 1 },
      initialRuntimeState: { cacheHits: 0 },
      runtimeReadGuard: "freeze-shallow",
    });

    const illegalMutationTask = actor.task(
      ({ runtimeState }) => {
        runtimeState.cacheHits += 1;
      },
      { mode: "read" },
    );

    await expect(invokeTask(illegalMutationTask)).rejects.toThrow();
    expect(actor.getRuntimeState()).toEqual({ cacheHits: 0 });
  });

  it("rejects state writes in read mode for durable and runtime compartments", async () => {
    const actor = Cadenza.createActor({
      name: "ReadModeActor",
      defaultKey: "default",
      initialState: { count: 0 },
      initialRuntimeState: { cacheHits: 0 },
    });

    const illegalDurableWrite = actor.task(
      ({ setState }) => {
        setState({ count: 2 });
      },
      { mode: "read" },
    );

    const illegalRuntimeWrite = actor.task(
      ({ setRuntimeState }) => {
        setRuntimeState({ cacheHits: 10 });
      },
      { mode: "read" },
    );

    await expect(invokeTask(illegalDurableWrite)).rejects.toThrow(
      "does not allow durable state writes in read mode",
    );
    await expect(invokeTask(illegalRuntimeWrite)).rejects.toThrow(
      "does not allow runtime state writes in read mode",
    );
  });

  it("forces meta task creation for MetaActors and mode=meta actor tasks", () => {
    const metaActor = Cadenza.createActor(
      {
        name: "ActorSyncMeta",
        defaultKey: "runtime",
        initialState: { status: "idle" },
      },
      { isMeta: true },
    );

    const standardActor = Cadenza.createActor({
      name: "StandardActor",
      defaultKey: "default",
      initialState: { value: 1 },
    });

    const taskFromMetaActor = Cadenza.createTask(
      "Meta Actor Task",
      metaActor.task(({ state }) => state, { mode: "write" }),
    );
    const taskFromMetaMode = Cadenza.createTask(
      "Meta Mode Task",
      standardActor.task(({ state }) => state, { mode: "meta" }),
    );

    expect(taskFromMetaActor.isMeta).toBe(true);
    expect(taskFromMetaMode.isMeta).toBe(true);
  });

  it("supports async init and runs it once per actor key", async () => {
    let initCalls = 0;
    const actor = Cadenza.createActor({
      name: "SocketClientActor",
      defaultKey: "primary",
      loadPolicy: "lazy",
      initialState: { clientId: "uninitialized" },
      init: async ({ input }) => {
        initCalls += 1;
        await Promise.resolve();
        return {
          clientId: (input.clientId as string | undefined) ?? "default-client",
        };
      },
    });

    const readStateTask = actor.task(({ state }) => state, { mode: "read" });

    const first = await invokeTask(readStateTask, { clientId: "client-a" });
    const second = await invokeTask(readStateTask, { clientId: "client-b" });
    const third = await invokeTask(readStateTask, {
      clientId: "client-c",
      __actorOptions: {
        actorKey: "secondary",
      },
    });

    expect(first).toEqual({ clientId: "client-a" });
    expect(second).toEqual({ clientId: "client-a" });
    expect(third).toEqual({ clientId: "client-c" });
    expect(initCalls).toBe(2);
  });

  it("retries actor init on next invocation after init failure", async () => {
    let initAttempts = 0;
    const actor = Cadenza.createActor({
      name: "FlakyInitActor",
      defaultKey: "primary",
      initialState: { ready: false },
      init: ({ setState }) => {
        initAttempts += 1;
        if (initAttempts === 1) {
          throw new Error("init failed");
        }

        setState({ ready: true });
      },
    });

    const readStateTask = actor.task(({ state }) => state, { mode: "read" });

    await expect(invokeTask(readStateTask)).rejects.toThrow("init failed");
    const second = await invokeTask(readStateTask);

    expect(second).toEqual({ ready: true });
    expect(initAttempts).toBe(2);
  });

  it("keeps idempotency disabled by default", async () => {
    let executions = 0;
    const actor = Cadenza.createActor({
      name: "DefaultIdempotencyActor",
      defaultKey: "idempotency",
      initialState: { count: 0 },
    });

    const incrementTask = actor.task(
      ({ state, setState }) => {
        executions += 1;
        const next = { count: state.count + 1 };
        setState(next);
        return next;
      },
      { mode: "write" },
    );

    await invokeTask(incrementTask, {
      __actorOptions: { idempotencyKey: "same-key" },
    });
    await invokeTask(incrementTask, {
      __actorOptions: { idempotencyKey: "same-key" },
    });

    expect(executions).toBe(2);
    expect(actor.getState()).toEqual({ count: 2 });
  });

  it("deduplicates successful executions when idempotency is enabled", async () => {
    let executions = 0;
    const actor = Cadenza.createActor({
      name: "EnabledIdempotencyActor",
      defaultKey: "idempotency",
      initialState: { count: 0 },
      idempotency: {
        enabled: true,
        mode: "required",
      },
    });

    const incrementTask = actor.task(
      ({ state, setState }) => {
        executions += 1;
        const next = { count: state.count + 1 };
        setState(next);
        return next;
      },
      { mode: "write" },
    );

    const first = await invokeTask(incrementTask, {
      __actorOptions: { idempotencyKey: "dedupe-key" },
    });
    const second = await invokeTask(incrementTask, {
      __actorOptions: { idempotencyKey: "dedupe-key" },
    });

    expect(executions).toBe(1);
    expect(first).toEqual({ count: 1 });
    expect(second).toEqual({ count: 1 });
    expect(actor.getState()).toEqual({ count: 1 });
  });

  it("reruns failed duplicate idempotency keys by default", async () => {
    let executions = 0;
    const actor = Cadenza.createActor({
      name: "FailedDuplicateActor",
      defaultKey: "idempotency",
      initialState: { count: 0 },
      idempotency: {
        enabled: true,
      },
    });

    const flakyTask = actor.task(
      ({ state, setState }) => {
        executions += 1;
        if (executions === 1) {
          throw new Error("first attempt fails");
        }

        const next = { count: state.count + 1 };
        setState(next);
        return next;
      },
      { mode: "write" },
    );

    await expect(
      invokeTask(flakyTask, {
        __actorOptions: { idempotencyKey: "flaky-key" },
      }),
    ).rejects.toThrow("first attempt fails");

    const retry = await invokeTask(flakyTask, {
      __actorOptions: { idempotencyKey: "flaky-key" },
    });

    expect(executions).toBe(2);
    expect(retry).toEqual({ count: 1 });
    expect(actor.getState()).toEqual({ count: 1 });
  });

  it("requires idempotency key when configured as required", async () => {
    const actor = Cadenza.createActor({
      name: "RequiredIdempotencyActor",
      defaultKey: "idempotency",
      initialState: { count: 0 },
      idempotency: {
        enabled: true,
        mode: "required",
      },
    });

    const task = actor.task(({ state }) => state, { mode: "read" });

    await expect(invokeTask(task)).rejects.toThrow("requires idempotencyKey");
  });
});
