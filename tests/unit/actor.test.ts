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

async function nextTick() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
      initState: { count: 0 },
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
      initState: { touched: true },
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
      initState: { value: 1 },
    });
    const pathActor = Cadenza.createActor({
      name: "PathKeyActor",
      defaultKey: "fallback-path",
      key: { source: "path", path: "user.id" },
      initState: { value: 1 },
    });
    const templateActor = Cadenza.createActor({
      name: "TemplateKeyActor",
      defaultKey: "fallback-template",
      key: { source: "template", template: "tenant:{tenantId}:user:{user.id}" },
      initState: { value: 1 },
    });

    const fieldKeyTask = fieldActor.task(({ actor }) => actor.key);
    const pathKeyTask = pathActor.task(({ actor }) => actor.key);
    const templateKeyTask = templateActor.task(({ actor }) => actor.key);

    await expect(invokeTask(fieldKeyTask, { userId: "u1" })).resolves.toBe(
      "u1",
    );
    await expect(invokeTask(pathKeyTask, { user: { id: "u2" } })).resolves.toBe(
      "u2",
    );
    await expect(
      invokeTask(templateKeyTask, { tenantId: "t1", user: { id: "u3" } }),
    ).resolves.toBe("tenant:t1:user:u3");
  });

  it("creates actors from definitions with durable initState and task-driven runtime setup", async () => {
    const actor = Cadenza.createActorFromDefinition<
      { count: number; seeded: boolean },
      { runtimeToken: string } | undefined
    >({
      name: "DefinitionActor",
      description: "DB-native actor definition for tests",
      defaultKey: "def-default",
      loadPolicy: "lazy",
      key: { source: "field", field: "entityId" },
      state: {
        durable: {
          initState: { count: 0, seeded: true },
        },
        runtime: {
          description: "Runtime state is initialized by write tasks",
        },
      },
      tasks: [
        {
          taskName: "DefinitionActor.Read",
          mode: "read",
          description: "Reads actor durable and runtime state",
        },
      ],
    });

    const initRuntimeTask = actor.task(
      ({ input, setRuntimeState }) => {
        setRuntimeState({
          runtimeToken: String(input.runtimeToken ?? "runtime-default"),
        });
      },
      { mode: "write" },
    );

    const readTask = actor.task(
      ({ durableState, runtimeState, actor }) => ({
        key: actor.key,
        durableState,
        runtimeState,
      }),
      { mode: "read" },
    );

    await invokeTask(initRuntimeTask, {
      entityId: "e-1",
      runtimeToken: "runtime-1",
    });

    const result = await invokeTask(readTask, {
      entityId: "e-1",
    });

    expect(result).toEqual({
      key: "e-1",
      durableState: {
        count: 0,
        seeded: true,
      },
      runtimeState: {
        runtimeToken: "runtime-1",
      },
    });
  });

  it("keeps invocation policy overrides fixed to actor defaults", async () => {
    const actor = Cadenza.createActor({
      name: "InvocationPolicyActor",
      defaultKey: "invocation-default",
      writeContract: "overwrite",
      initState: { count: 0 },
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
          initState: {
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
      initState: {
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

  it("keeps durable and runtime state split, with runtime initialized by write tasks", async () => {
    const actor = Cadenza.createActor<
      { userId: string | null },
      { token: string; connected: boolean } | undefined
    >({
      name: "SessionActor",
      defaultKey: "primary",
      loadPolicy: "lazy",
      initState: { userId: null },
    });

    const initializeRuntimeTask = actor.task(
      ({ input, runtimeState, setRuntimeState }) => {
        if (runtimeState) {
          return;
        }

        setRuntimeState({
          token: String(input.token ?? "none"),
          connected: false,
        });
      },
      { mode: "write" },
    );

    const readTask = actor.task(
      ({ durableState, runtimeState }) => ({
        userId: durableState.userId,
        token: runtimeState?.token ?? "none",
      }),
      { mode: "read" },
    );

    await invokeTask(initializeRuntimeTask, { token: "abc" });
    const first = await invokeTask(readTask, { token: "abc" });
    const second = await invokeTask(readTask, { token: "zzz" });
    await invokeTask(initializeRuntimeTask, {
      token: "secondary-token",
      __actorOptions: {
        actorKey: "secondary",
      },
    });
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
      { client: RuntimeClient } | undefined
    >({
      name: "RuntimeObjectActor",
      defaultKey: "default",
      initState: { state: "ok" },
    });

    const initRuntimeTask = actor.task(
      ({ runtimeState, setRuntimeState }) => {
        if (!runtimeState) {
          setRuntimeState({ client: new RuntimeClient() });
        }
      },
      { mode: "write" },
    );

    const useClientTask = actor.task(
      ({ runtimeState }) => {
        if (!runtimeState) {
          throw new Error("Runtime state not initialized");
        }
        runtimeState.client.connect();
        return runtimeState.client.connected;
      },
      { mode: "read" },
    );

    await invokeTask(initRuntimeTask);
    const first = await invokeTask(useClientTask);
    const second = await invokeTask(useClientTask);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(actor.getRuntimeState()?.client.connected).toBe(true);
  });

  it("supports optional freeze-shallow runtime read guard", async () => {
    const actor = Cadenza.createActor<
      { value: number },
      { cacheHits: number } | undefined
    >({
      name: "RuntimeReadGuardActor",
      defaultKey: "runtime-read-guard",
      initState: { value: 1 },
      runtimeReadGuard: "freeze-shallow",
    });

    const initRuntimeTask = actor.task(
      ({ setRuntimeState }) => {
        setRuntimeState({ cacheHits: 0 });
      },
      { mode: "write" },
    );

    const illegalMutationTask = actor.task(
      ({ runtimeState }) => {
        if (!runtimeState) {
          throw new Error("Runtime state not initialized");
        }
        runtimeState.cacheHits += 1;
      },
      { mode: "read" },
    );

    await invokeTask(initRuntimeTask);
    await expect(invokeTask(illegalMutationTask)).rejects.toThrow();
    expect(actor.getRuntimeState()).toEqual({ cacheHits: 0 });
  });

  it("rejects state writes in read mode for durable and runtime compartments", async () => {
    const actor = Cadenza.createActor({
      name: "ReadModeActor",
      defaultKey: "default",
      initState: { count: 0 },
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
        initState: { status: "idle" },
      },
      { isMeta: true },
    );

    const standardActor = Cadenza.createActor({
      name: "StandardActor",
      defaultKey: "default",
      initState: { value: 1 },
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

  it("initializes runtime state per actor key via explicit write tasks", async () => {
    let runtimeInitCalls = 0;
    const actor = Cadenza.createActor({
      name: "SocketClientActor",
      defaultKey: "primary",
      loadPolicy: "lazy",
      initState: { clientId: "uninitialized" },
    });

    const initRuntimeTask = actor.task(
      async ({ input, setRuntimeState }) => {
        runtimeInitCalls += 1;
        await Promise.resolve();
        setRuntimeState({
          clientId: (input.clientId as string | undefined) ?? "default-client",
        });
      },
      { mode: "write" },
    );

    const readRuntimeTask = actor.task(({ runtimeState }) => runtimeState, {
      mode: "read",
    });

    await invokeTask(initRuntimeTask, { clientId: "client-a" });
    await invokeTask(initRuntimeTask, {
      clientId: "client-c",
      __actorOptions: {
        actorKey: "secondary",
      },
    });

    const first = await invokeTask(readRuntimeTask);
    const second = await invokeTask(readRuntimeTask);
    const third = await invokeTask(readRuntimeTask, {
      __actorOptions: {
        actorKey: "secondary",
      },
    });

    expect(first).toEqual({ clientId: "client-a" });
    expect(second).toEqual({ clientId: "client-a" });
    expect(third).toEqual({ clientId: "client-c" });
    expect(runtimeInitCalls).toBe(2);
  });

  it("does not auto-initialize runtime state without explicit writes", async () => {
    const actor = Cadenza.createActor({
      name: "FlakyInitActor",
      defaultKey: "primary",
      initState: { ready: false },
    });

    const readRuntimeTask = actor.task(({ runtimeState }) => runtimeState, {
      mode: "read",
    });

    await expect(invokeTask(readRuntimeTask)).resolves.toBeUndefined();
  });

  it("keeps idempotency disabled by default", async () => {
    let executions = 0;
    const actor = Cadenza.createActor({
      name: "DefaultIdempotencyActor",
      defaultKey: "idempotency",
      initState: { count: 0 },
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
      initState: { count: 0 },
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
      initState: { count: 0 },
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
      initState: { count: 0 },
      idempotency: {
        enabled: true,
        mode: "required",
      },
    });

    const task = actor.task(({ state }) => state, { mode: "read" });

    await expect(invokeTask(task)).rejects.toThrow("requires idempotencyKey");
  });

  it("registers actors in Cadenza actor cache and clears them on reset", () => {
    const actor = Cadenza.createActor({
      name: "CachedActor",
      description: "Actor cache test",
      defaultKey: "default",
      initState: { count: 0 },
    });

    expect(Cadenza.getActor("CachedActor")).toBe(actor);
    expect(
      Cadenza.getAllActors().some((registered) => registered.spec.name === "CachedActor"),
    ).toBe(true);

    Cadenza.reset();
    expect(Cadenza.getActor("CachedActor")).toBeUndefined();
    expect(Cadenza.getAllActors()).toHaveLength(0);
  });

  it("emits actor metadata and actor-task association metadata", async () => {
    let createdActorPayload: AnyObject | undefined;
    let actorTaskAssociationPayload: AnyObject | undefined;

    Cadenza.createMetaTask("Capture actor created payload", (ctx) => {
      createdActorPayload = ctx;
      return true;
    }).doOn("meta.actor.created");

    Cadenza.createMetaTask("Capture actor task association payload", (ctx) => {
      actorTaskAssociationPayload = ctx;
      return true;
    }).doOn("meta.actor.task_associated");

    const actor = Cadenza.createActor({
      name: "SignalActor",
      description: "Actor metadata emission test",
      defaultKey: "signal-default",
      state: {
        durable: {
          initState: () => ({ count: 1 }),
        },
      },
    });

    Cadenza.createTask(
      "Signal Actor Task",
      actor.task(({ state }) => state, { mode: "write" }),
      "Actor task association test",
    );

    await nextTick();

    expect(createdActorPayload?.data).toMatchObject({
      name: "SignalActor",
      description: "Actor metadata emission test",
      default_key: "signal-default",
      is_meta: false,
      version: 1,
    });
    expect(
      createdActorPayload?.data?.state_definition?.durable?.initState,
    ).toBeUndefined();

    expect(actorTaskAssociationPayload?.data).toMatchObject({
      actor_name: "SignalActor",
      task_name: "Signal Actor Task",
      task_version: 1,
      mode: "write",
      description: "Actor task association test",
      is_meta: false,
    });
  });
});
