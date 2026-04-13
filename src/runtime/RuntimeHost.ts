import Cadenza, { type CadenzaMode } from "../Cadenza";
import type Task from "../graph/definition/Task";
import type GraphRoutine from "../graph/definition/GraphRoutine";
import type {
  ActorDefinition,
  ActorTaskMode,
} from "../actors/Actor";
import type { Intent, InquiryOptions } from "../engine/InquiryBroker";
import type { EmitOptions, SignalDefinitionInput } from "../engine/SignalBroker";
import type { AnyObject } from "../types/global";
import type { SchemaDefinition } from "../types/schema";
import {
  compileRuntimeActorTaskHandler,
  compileRuntimeHelperFunction,
  compileRuntimeTaskFunction,
} from "./sandbox";
import { sanitizeForJson } from "./sanitize";
import { runtimeDefinitionRegistry } from "./RuntimeDefinitionRegistry";
import {
  RuntimeSubscriptionManager,
  RuntimeSubscriptionManagerError,
} from "./RuntimeSubscriptionManager";
import type {
  RuntimeActorTaskDefinition,
  RuntimeGlobalDefinition,
  RuntimeHelperDefinition,
  RuntimeHelperGlobalBinding,
  RuntimeHelperHelperBinding,
  RuntimeInfo,
  RuntimeProtocolError,
  RuntimeProtocolHandshake,
  RuntimeProtocolOperation,
  RuntimeProtocolRequest,
  RuntimeProtocolResponse,
  RuntimeRoutineDefinition,
  RuntimeTaskGlobalBinding,
  RuntimeTaskHelperBinding,
  RuntimeTaskDefinition,
  RuntimeTaskLinkDefinition,
  RuntimeTaskSignalEmission,
  RuntimeTaskSignalObservation,
  RuntimeSessionRole,
  RuntimeSharingMode,
} from "./types";

const SUPPORTED_OPERATIONS: RuntimeProtocolOperation[] = [
  "runtime.bootstrap",
  "runtime.info",
  "runtime.detach",
  "runtime.shutdown",
  "runtime.reset",
  "runtime.snapshot",
  "runtime.subscribe",
  "runtime.unsubscribe",
  "runtime.nextEvent",
  "runtime.pollEvents",
  "task.upsert",
  "helper.upsert",
  "global.upsert",
  "task.link",
  "task.observeSignal",
  "task.emitSignal",
  "task.respondToIntent",
  "task.useHelper",
  "task.useGlobal",
  "helper.useHelper",
  "helper.useGlobal",
  "routine.upsert",
  "routine.observeSignal",
  "intent.upsert",
  "actor.upsert",
  "actorTask.upsert",
  "run",
  "emit",
  "inquire",
];

class RuntimeProtocolException extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: AnyObject,
  ) {
    super(message);
    this.name = "RuntimeProtocolException";
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertObject(
  value: unknown,
  message: string,
): asserts value is Record<string, any> {
  if (!isObject(value)) {
    throw new RuntimeProtocolException("invalid_payload", message);
  }
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RuntimeProtocolException(
      "invalid_payload",
      `${fieldName} must be a non-empty string`,
    );
  }
  return value;
}

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new RuntimeProtocolException(
      "invalid_payload",
      `${fieldName} must be an array of strings`,
    );
  }
  return value;
}

function normalizeSignalDefinition(signal: unknown): SignalDefinitionInput {
  if (typeof signal === "string") {
    return signal;
  }

  if (
    isObject(signal) &&
    typeof signal.name === "string" &&
    signal.name.trim().length > 0
  ) {
    return {
      name: signal.name,
      deliveryMode:
        signal.deliveryMode === "single" || signal.deliveryMode === "broadcast"
          ? signal.deliveryMode
          : undefined,
      broadcastFilter:
        signal.broadcastFilter && isObject(signal.broadcastFilter)
          ? signal.broadcastFilter
          : null,
    };
  }

  throw new RuntimeProtocolException(
    "invalid_payload",
    "signal must be a signal string or structured signal definition",
  );
}

type RuntimeControlAction = "detach" | "shutdown";

interface RuntimeHostOptions {
  runtimeSharing?: RuntimeSharingMode;
  runtimeName?: string | null;
  sessionId?: string | null;
  sessionRole?: RuntimeSessionRole | null;
  activeSessionCountProvider?: () => number;
  daemonProcessId?: number | null;
  onResetRuntime?: () => void;
}

export class RuntimeHost {
  private readonly subscriptionManager: RuntimeSubscriptionManager;
  private readonly runtimeSharing: RuntimeSharingMode;
  private readonly runtimeName: string | null;
  private readonly sessionId: string | null;
  private readonly sessionRole: RuntimeSessionRole | null;
  private readonly activeSessionCountProvider: () => number;
  private readonly daemonProcessId: number | null;
  private readonly onResetRuntime: (() => void) | null;
  private pendingControlAction: RuntimeControlAction | null = null;

  constructor(options: RuntimeHostOptions = {}) {
    this.subscriptionManager = new RuntimeSubscriptionManager();
    this.runtimeSharing = options.runtimeSharing ?? "isolated";
    this.runtimeName = options.runtimeName ?? null;
    this.sessionId = options.sessionId ?? null;
    this.sessionRole = options.sessionRole ?? null;
    this.activeSessionCountProvider =
      options.activeSessionCountProvider ?? (() => 1);
    this.daemonProcessId = options.daemonProcessId ?? null;
    this.onResetRuntime = options.onResetRuntime ?? null;
  }

  dispose(): void {
    this.subscriptionManager.dispose();
  }

  resetSubscriptions(): void {
    this.subscriptionManager.reset();
  }

  consumeControlAction(): RuntimeControlAction | null {
    const action = this.pendingControlAction;
    this.pendingControlAction = null;
    return action;
  }

  handshake(): RuntimeProtocolHandshake {
    return {
      ready: true,
      protocol: "cadenza-runtime-jsonl",
      protocolVersion: "1",
      runtimeMode: "core",
      runtimeSharing: this.runtimeSharing,
      runtimeName: this.runtimeName,
      sessionId: this.sessionId,
      sessionRole: this.sessionRole,
      supportedOperations: [...SUPPORTED_OPERATIONS],
    };
  }

  async handle(
    request: RuntimeProtocolRequest,
  ): Promise<RuntimeProtocolResponse> {
    try {
      if (!request || typeof request !== "object") {
        throw new RuntimeProtocolException(
          "invalid_request",
          "Request must be an object",
        );
      }

      if (
        typeof request.operation !== "string" ||
        !SUPPORTED_OPERATIONS.includes(
          request.operation as RuntimeProtocolOperation,
        )
      ) {
        throw new RuntimeProtocolException(
          "unsupported_operation",
          `Unsupported operation: ${String(request.operation ?? "")}`,
        );
      }

      const operation = request.operation as RuntimeProtocolOperation;
      this.assertOperationAllowed(operation);
      const result = await this.dispatch(operation, request.payload);

      return {
        id: request.id,
        operation,
        ok: true,
        result: sanitizeForJson(result),
      };
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      return {
        id: request?.id,
        operation:
          typeof request?.operation === "string"
            ? (request.operation as RuntimeProtocolOperation)
            : "runtime.snapshot",
        ok: false,
        error: normalizedError,
      };
    }
  }

  private normalizeError(error: unknown): RuntimeProtocolError {
    if (error instanceof RuntimeSubscriptionManagerError) {
      return {
        code: error.code,
        message: error.message,
      };
    }

    if (error instanceof RuntimeProtocolException) {
      return {
        code: error.code,
        message: error.message,
        details: error.details ? sanitizeForJson(error.details) as AnyObject : undefined,
      };
    }

    if (error instanceof Error) {
      return {
        code: "runtime_error",
        message: error.message,
      };
    }

    return {
      code: "runtime_error",
      message: String(error),
    };
  }

  private async dispatch(
    operation: RuntimeProtocolOperation,
    payload: unknown,
  ): Promise<unknown> {
    switch (operation) {
      case "runtime.bootstrap":
        return this.bootstrapRuntime(payload);
      case "runtime.info":
        return this.runtimeInfo();
      case "runtime.detach":
        return this.detachRuntime();
      case "runtime.shutdown":
        return this.shutdownRuntime();
      case "runtime.reset":
        return this.resetRuntime();
      case "runtime.snapshot":
        return Cadenza.snapshotRuntime();
      case "runtime.subscribe":
        return this.subscribe(payload);
      case "runtime.unsubscribe":
        return this.unsubscribe(payload);
      case "runtime.nextEvent":
        return this.nextEvent(payload);
      case "runtime.pollEvents":
        return this.pollEvents(payload);
      case "task.upsert":
        return this.upsertTask(payload);
      case "helper.upsert":
        return this.upsertHelper(payload);
      case "global.upsert":
        return this.upsertGlobal(payload);
      case "task.link":
        return this.linkTasks(payload);
      case "task.observeSignal":
        return this.observeTaskSignal(payload);
      case "task.emitSignal":
        return this.emitTaskSignal(payload);
      case "task.respondToIntent":
        return this.bindTaskIntent(payload);
      case "task.useHelper":
        return this.bindTaskHelper(payload);
      case "task.useGlobal":
        return this.bindTaskGlobal(payload);
      case "helper.useHelper":
        return this.bindHelperHelper(payload);
      case "helper.useGlobal":
        return this.bindHelperGlobal(payload);
      case "routine.upsert":
        return this.upsertRoutine(payload);
      case "routine.observeSignal":
        return this.observeRoutineSignal(payload);
      case "intent.upsert":
        return this.upsertIntent(payload);
      case "actor.upsert":
        return this.upsertActor(payload);
      case "actorTask.upsert":
        return this.upsertActorTask(payload);
      case "run":
        return this.runTarget(payload);
      case "emit":
        return this.emitSignal(payload);
      case "inquire":
        return this.inquireIntent(payload);
    }
  }

  private assertOperationAllowed(operation: RuntimeProtocolOperation): void {
    if (!this.sessionRole) {
      return;
    }

    if (this.sessionRole === "owner") {
      return;
    }

    if (this.sessionRole === "writer") {
      if (operation === "runtime.reset" || operation === "runtime.shutdown") {
        throw new RuntimeProtocolException(
          "forbidden",
          `Session role "${this.sessionRole}" cannot perform ${operation}`,
        );
      }
      return;
    }

    const observerOperations = new Set<RuntimeProtocolOperation>([
      "runtime.info",
      "runtime.detach",
      "runtime.snapshot",
      "runtime.subscribe",
      "runtime.unsubscribe",
      "runtime.nextEvent",
      "runtime.pollEvents",
      "inquire",
    ]);

    if (!observerOperations.has(operation)) {
      throw new RuntimeProtocolException(
        "forbidden",
        `Session role "${this.sessionRole}" cannot perform ${operation}`,
      );
    }
  }

  private bootstrapRuntime(payload: unknown): AnyObject {
    const mode =
      isObject(payload) && typeof payload.mode === "string"
        ? (payload.mode as CadenzaMode)
        : undefined;

    if (mode) {
      Cadenza.setMode(mode);
    } else {
      Cadenza.bootstrap();
    }

    return {
      bootstrapped: true,
      mode: Cadenza.mode,
    };
  }

  private runtimeInfo(): RuntimeInfo {
    return {
      runtimeMode: "core",
      runtimeSharing: this.runtimeSharing,
      runtimeName: this.runtimeName,
      sessionId: this.sessionId,
      sessionRole: this.sessionRole,
      activeSessionCount: this.activeSessionCountProvider(),
      daemonProcessId: this.daemonProcessId,
      bootstrapped: Cadenza.isBootstrapped,
      mode: Cadenza.mode,
    };
  }

  private detachRuntime(): AnyObject {
    this.pendingControlAction = "detach";
    return {
      detached: true,
      runtimeName: this.runtimeName,
      sessionId: this.sessionId,
    };
  }

  private shutdownRuntime(): AnyObject {
    this.pendingControlAction = "shutdown";
    return {
      shutdown: true,
      runtimeName: this.runtimeName,
    };
  }

  private resetRuntime(): AnyObject {
    if (this.onResetRuntime) {
      this.onResetRuntime();
    } else {
      Cadenza.reset();
      this.subscriptionManager.reset();
    }
    return {
      reset: true,
      bootstrapped: false,
    };
  }

  private subscribe(payload: unknown): AnyObject {
    assertObject(payload, "runtime.subscribe payload must be an object");
    const signalPatterns = this.parseSignalPatterns(payload.signalPatterns);
    const maxQueueSize = this.parsePositiveInteger(
      payload.maxQueueSize,
      "maxQueueSize",
      100,
    );

    return {
      subscription: this.subscriptionManager.subscribe(signalPatterns, maxQueueSize),
    };
  }

  private unsubscribe(payload: unknown): AnyObject {
    assertObject(payload, "runtime.unsubscribe payload must be an object");
    const subscriptionId = assertString(payload.subscriptionId, "subscriptionId");

    return {
      unsubscribed: true,
      subscription: this.subscriptionManager.unsubscribe(subscriptionId),
    };
  }

  private async nextEvent(payload: unknown): Promise<AnyObject> {
    assertObject(payload, "runtime.nextEvent payload must be an object");
    const subscriptionId = assertString(payload.subscriptionId, "subscriptionId");
    const timeoutMs = this.parseNonNegativeInteger(
      payload.timeoutMs,
      "timeoutMs",
      0,
    );

    return this.subscriptionManager.nextEvent(subscriptionId, timeoutMs);
  }

  private pollEvents(payload: unknown): AnyObject {
    assertObject(payload, "runtime.pollEvents payload must be an object");
    const subscriptionId = assertString(payload.subscriptionId, "subscriptionId");
    const limit = this.parsePositiveInteger(payload.limit, "limit", 50);

    return this.subscriptionManager.pollEvents(subscriptionId, limit);
  }

  private upsertTask(payload: unknown): AnyObject {
    assertObject(payload, "task.upsert payload must be an object");
    const definition = payload as RuntimeTaskDefinition;
    definition.name = assertString(definition.name, "name");
    definition.handlerSource = assertString(
      definition.handlerSource,
      "handlerSource",
    );
    definition.language =
      definition.language === "js" || definition.language === "ts"
        ? definition.language
        : (() => {
            throw new RuntimeProtocolException(
              "invalid_payload",
              "language must be 'js' or 'ts'",
            );
          })();
    definition.kind =
      definition.kind === "metaTask" ? "metaTask" : "task";

    runtimeDefinitionRegistry.setTaskDefinition(definition);
    const task = Cadenza.createTaskFromDefinition(definition);
    this.applyTaskDecorations(definition.name);
    this.applyAllTaskLinks();
    this.rematerializeRoutinesStartingWith(definition.name);

    return {
      task: this.snapshotTask(task),
    };
  }

  private upsertHelper(payload: unknown): AnyObject {
    assertObject(payload, "helper.upsert payload must be an object");
    const definition = payload as RuntimeHelperDefinition;
    definition.name = assertString(definition.name, "name");
    definition.handlerSource = assertString(
      definition.handlerSource,
      "handlerSource",
    );
    definition.language =
      definition.language === "js" || definition.language === "ts"
        ? definition.language
        : (() => {
            throw new RuntimeProtocolException(
              "invalid_payload",
              "language must be 'js' or 'ts'",
            );
          })();
    definition.kind =
      definition.kind === "metaHelper" ? "metaHelper" : "helper";

    runtimeDefinitionRegistry.setHelperDefinition(definition);
    compileRuntimeHelperFunction(definition);
    Cadenza.createHelperFromDefinition(definition);
    this.applyHelperDecorations(definition.name);

    return {
      helper: this.snapshotHelper(definition.name),
    };
  }

  private upsertGlobal(payload: unknown): AnyObject {
    assertObject(payload, "global.upsert payload must be an object");
    const definition: RuntimeGlobalDefinition = {
      name: assertString(payload.name, "name"),
      description:
        typeof payload.description === "string" ? payload.description : "",
      kind: payload.kind === "metaGlobal" ? "metaGlobal" : "global",
      value: payload.value,
    };

    runtimeDefinitionRegistry.setGlobalDefinition(definition);
    Cadenza.createGlobalFromDefinition(definition);
    return {
      global: this.snapshotGlobal(definition.name),
    };
  }

  private linkTasks(payload: unknown): AnyObject {
    assertObject(payload, "task.link payload must be an object");
    const definition: RuntimeTaskLinkDefinition = {
      predecessorTaskName: assertString(
        payload.predecessorTaskName,
        "predecessorTaskName",
      ),
      successorTaskName: assertString(
        payload.successorTaskName,
        "successorTaskName",
      ),
    };

    runtimeDefinitionRegistry.setTaskLink(definition);
    this.applyAllTaskLinks();

    return {
      linked: true,
      ...definition,
    };
  }

  private observeTaskSignal(payload: unknown): AnyObject {
    assertObject(payload, "task.observeSignal payload must be an object");
    const definition: RuntimeTaskSignalObservation = {
      taskName: assertString(payload.taskName, "taskName"),
      signal: normalizeSignalDefinition(payload.signal),
    };

    runtimeDefinitionRegistry.setTaskSignalObservation(definition);
    this.requireTask(definition.taskName).doOn(definition.signal);

    return {
      observed: true,
      taskName: definition.taskName,
      signal:
        typeof definition.signal === "string"
          ? definition.signal
          : definition.signal.name,
    };
  }

  private emitTaskSignal(payload: unknown): AnyObject {
    assertObject(payload, "task.emitSignal payload must be an object");
    const mode =
      payload.mode === "attach" || payload.mode === "onFail"
        ? payload.mode
        : "after";
    const definition: RuntimeTaskSignalEmission = {
      taskName: assertString(payload.taskName, "taskName"),
      signal: normalizeSignalDefinition(payload.signal),
      mode,
    };

    runtimeDefinitionRegistry.setTaskSignalEmission(definition);
    const task = this.requireTask(definition.taskName);
    if (definition.mode === "attach") {
      task.attachSignal(definition.signal);
    } else if (definition.mode === "onFail") {
      task.emitsOnFail(definition.signal);
    } else {
      task.emits(definition.signal);
    }

    return {
      attached: true,
      taskName: definition.taskName,
      mode: definition.mode,
      signal:
        typeof definition.signal === "string"
          ? definition.signal
          : definition.signal.name,
    };
  }

  private bindTaskIntent(payload: unknown): AnyObject {
    assertObject(payload, "task.respondToIntent payload must be an object");
    const taskName = assertString(payload.taskName, "taskName");
    const intentName = assertString(payload.intentName, "intentName");

    runtimeDefinitionRegistry.setTaskIntentBinding({
      taskName,
      intentName,
    });
    this.requireTask(taskName).respondsTo(intentName);

    return {
      bound: true,
      taskName,
      intentName,
    };
  }

  private bindTaskHelper(payload: unknown): AnyObject {
    assertObject(payload, "task.useHelper payload must be an object");
    const definition: RuntimeTaskHelperBinding = {
      taskName: assertString(payload.taskName, "taskName"),
      alias: assertString(payload.alias, "alias"),
      helperName: assertString(payload.helperName, "helperName"),
    };

    runtimeDefinitionRegistry.setTaskHelperBinding(definition);
    this.requireTask(definition.taskName).usesHelpers({
      [definition.alias]: Cadenza.getHelper(definition.helperName),
    });

    return {
      bound: true,
      ...definition,
    };
  }

  private bindTaskGlobal(payload: unknown): AnyObject {
    assertObject(payload, "task.useGlobal payload must be an object");
    const definition: RuntimeTaskGlobalBinding = {
      taskName: assertString(payload.taskName, "taskName"),
      alias: assertString(payload.alias, "alias"),
      globalName: assertString(payload.globalName, "globalName"),
    };

    runtimeDefinitionRegistry.setTaskGlobalBinding(definition);
    this.requireTask(definition.taskName).usesGlobals({
      [definition.alias]: Cadenza.getGlobal(definition.globalName),
    });

    return {
      bound: true,
      ...definition,
    };
  }

  private bindHelperHelper(payload: unknown): AnyObject {
    assertObject(payload, "helper.useHelper payload must be an object");
    const definition: RuntimeHelperHelperBinding = {
      helperName: assertString(payload.helperName, "helperName"),
      alias: assertString(payload.alias, "alias"),
      dependencyHelperName: assertString(
        payload.dependencyHelperName,
        "dependencyHelperName",
      ),
    };

    runtimeDefinitionRegistry.setHelperHelperBinding(definition);
    const helper = Cadenza.getHelper(definition.helperName);
    if (!helper) {
      throw new RuntimeProtocolException(
        "not_found",
        `No helper named "${definition.helperName}" exists`,
      );
    }
    helper.usesHelpers({
      [definition.alias]: Cadenza.getHelper(definition.dependencyHelperName),
    });

    return {
      bound: true,
      ...definition,
    };
  }

  private bindHelperGlobal(payload: unknown): AnyObject {
    assertObject(payload, "helper.useGlobal payload must be an object");
    const definition: RuntimeHelperGlobalBinding = {
      helperName: assertString(payload.helperName, "helperName"),
      alias: assertString(payload.alias, "alias"),
      globalName: assertString(payload.globalName, "globalName"),
    };

    runtimeDefinitionRegistry.setHelperGlobalBinding(definition);
    const helper = Cadenza.getHelper(definition.helperName);
    if (!helper) {
      throw new RuntimeProtocolException(
        "not_found",
        `No helper named "${definition.helperName}" exists`,
      );
    }
    helper.usesGlobals({
      [definition.alias]: Cadenza.getGlobal(definition.globalName),
    });

    return {
      bound: true,
      ...definition,
    };
  }

  private upsertRoutine(payload: unknown): AnyObject {
    assertObject(payload, "routine.upsert payload must be an object");
    const definition: RuntimeRoutineDefinition = {
      name: assertString(payload.name, "name"),
      description:
        typeof payload.description === "string" ? payload.description : "",
      startTaskNames: assertStringArray(payload.startTaskNames, "startTaskNames"),
      isMeta: payload.isMeta === true,
    };

    if (definition.startTaskNames.length === 0) {
      throw new RuntimeProtocolException(
        "invalid_payload",
        "startTaskNames must contain at least one task name",
      );
    }

    runtimeDefinitionRegistry.setRoutineDefinition(definition);
    const routine = Cadenza.createRoutineFromDefinition(definition);
    this.applyRoutineDecorations(definition.name);

    return {
      routine: this.snapshotRoutine(routine),
    };
  }

  private observeRoutineSignal(payload: unknown): AnyObject {
    assertObject(payload, "routine.observeSignal payload must be an object");
    const routineName = assertString(payload.routineName, "routineName");
    const signal = assertString(payload.signal, "signal");

    runtimeDefinitionRegistry.setRoutineSignalObservation({
      routineName,
      signal,
    });
    this.requireRoutine(routineName).doOn(signal);

    return {
      observed: true,
      routineName,
      signal,
    };
  }

  private upsertIntent(payload: unknown): AnyObject {
    assertObject(payload, "intent.upsert payload must be an object");
    const intent: Intent = {
      name: assertString(payload.name, "name"),
      description:
        typeof payload.description === "string" ? payload.description : "",
      input: (isObject(payload.input)
        ? payload.input
        : { type: "object" }) as SchemaDefinition,
      output: (isObject(payload.output)
        ? payload.output
        : { type: "object" }) as SchemaDefinition,
    };

    runtimeDefinitionRegistry.setIntentDefinition(intent);
    Cadenza.defineIntent(intent);

    return {
      intent: sanitizeForJson(intent),
    };
  }

  private upsertActor(payload: unknown): AnyObject {
    assertObject(payload, "actor.upsert payload must be an object");
    const definition = payload as ActorDefinition<Record<string, any>, Record<string, any>>;
    definition.name = assertString(definition.name, "name");
    definition.description = assertString(definition.description, "description");
    definition.defaultKey = assertString(definition.defaultKey, "defaultKey");

    runtimeDefinitionRegistry.setActorDefinition(definition);
    const actor = Cadenza.createActorFromDefinition(definition);
    this.rematerializeActorTasksFor(definition.name);

    return {
      actor: sanitizeForJson({
        name: actor.spec.name,
        description: actor.spec.description ?? "",
        defaultKey: actor.spec.defaultKey,
      }),
    };
  }

  private upsertActorTask(payload: unknown): AnyObject {
    assertObject(payload, "actorTask.upsert payload must be an object");
    const definition: RuntimeActorTaskDefinition = {
      actorName: assertString(payload.actorName, "actorName"),
      taskName: assertString(payload.taskName, "taskName"),
      description:
        typeof payload.description === "string" ? payload.description : "",
      mode:
        payload.mode === "write" || payload.mode === "meta"
          ? payload.mode
          : "read",
      handlerSource: assertString(payload.handlerSource, "handlerSource"),
      language:
        payload.language === "js" || payload.language === "ts"
          ? payload.language
          : (() => {
              throw new RuntimeProtocolException(
                "invalid_payload",
                "language must be 'js' or 'ts'",
              );
            })(),
      options: isObject(payload.options) ? { ...payload.options } : undefined,
    };

    runtimeDefinitionRegistry.setActorTaskDefinition(definition);
    const task = this.materializeActorTask(definition.taskName);
    this.applyTaskDecorations(definition.taskName);
    this.applyAllTaskLinks();
    this.rematerializeRoutinesStartingWith(definition.taskName);

    return {
      actorTask: this.snapshotTask(task),
    };
  }

  private async runTarget(payload: unknown): Promise<AnyObject> {
    assertObject(payload, "run payload must be an object");
    const targetName = assertString(payload.targetName, "targetName");
    const context = isObject(payload.context) ? payload.context : {};
    let target: Task | GraphRoutine | undefined = Cadenza.getRoutine(targetName);
    if (!target) {
      const routineDefinition =
        runtimeDefinitionRegistry.routineDefinitions.get(targetName);
      if (routineDefinition) {
        target = Cadenza.createRoutineFromDefinition(routineDefinition);
        this.applyRoutineDecorations(targetName);
      }
    }

    target = target ?? Cadenza.get(targetName);

    if (!target) {
      throw new RuntimeProtocolException(
        "not_found",
        `No task or routine named "${targetName}" exists`,
      );
    }

    const runner =
      "isMeta" in target && target.isMeta ? Cadenza.metaRunner : Cadenza.runner;
    const runResult = runner.run(target as Task | GraphRoutine, context);
    const completedRun = await Promise.resolve(runResult);

    return {
      targetName,
      run: completedRun.export(),
    };
  }

  private emitSignal(payload: unknown): AnyObject {
    assertObject(payload, "emit payload must be an object");
    const signal = assertString(payload.signal, "signal");
    const context = isObject(payload.context) ? payload.context : {};
    const options = isObject(payload.options)
      ? (payload.options as EmitOptions)
      : {};

    Cadenza.emit(signal, context, options);
    return {
      emitted: true,
      signal,
    };
  }

  private async inquireIntent(payload: unknown): Promise<AnyObject> {
    assertObject(payload, "inquire payload must be an object");
    const inquiry = assertString(payload.intent, "intent");
    const context = isObject(payload.context) ? payload.context : {};
    const options = isObject(payload.options)
      ? (payload.options as InquiryOptions)
      : {};

    const response = await Cadenza.inquire(inquiry, context, options);
    return {
      inquiry,
      response,
    };
  }

  private requireTask(taskName: string): Task {
    const task = Cadenza.get(taskName);
    if (!task) {
      throw new RuntimeProtocolException(
        "not_found",
        `No task named "${taskName}" exists`,
      );
    }
    return task;
  }

  private requireRoutine(routineName: string): GraphRoutine {
    const routine = Cadenza.getRoutine(routineName);
    if (!routine) {
      throw new RuntimeProtocolException(
        "not_found",
        `No routine named "${routineName}" exists`,
      );
    }
    return routine;
  }

  private applyTaskDecorations(taskName: string): void {
    const task = this.requireTask(taskName);

    for (const observation of runtimeDefinitionRegistry.taskSignalObservations.values()) {
      if (observation.taskName !== taskName) {
        continue;
      }
      task.doOn(observation.signal);
    }

    for (const emission of runtimeDefinitionRegistry.taskSignalEmissions.values()) {
      if (emission.taskName !== taskName) {
        continue;
      }

      if (emission.mode === "attach") {
        task.attachSignal(emission.signal);
      } else if (emission.mode === "onFail") {
        task.emitsOnFail(emission.signal);
      } else {
        task.emits(emission.signal);
      }
    }

    for (const binding of runtimeDefinitionRegistry.taskIntentBindings.values()) {
      if (binding.taskName !== taskName) {
        continue;
      }
      task.respondsTo(binding.intentName);
    }

    for (const binding of runtimeDefinitionRegistry.taskHelperBindings.values()) {
      if (binding.taskName !== taskName) {
        continue;
      }
      task.usesHelpers({
        [binding.alias]: Cadenza.getHelper(binding.helperName),
      });
    }

    for (const binding of runtimeDefinitionRegistry.taskGlobalBindings.values()) {
      if (binding.taskName !== taskName) {
        continue;
      }
      task.usesGlobals({
        [binding.alias]: Cadenza.getGlobal(binding.globalName),
      });
    }
  }

  private applyHelperDecorations(helperName: string): void {
    const helper = Cadenza.getHelper(helperName);
    if (!helper) {
      throw new RuntimeProtocolException(
        "not_found",
        `No helper named "${helperName}" exists`,
      );
    }

    for (const binding of runtimeDefinitionRegistry.helperHelperBindings.values()) {
      if (binding.helperName !== helperName) {
        continue;
      }
      helper.usesHelpers({
        [binding.alias]: Cadenza.getHelper(binding.dependencyHelperName),
      });
    }

    for (const binding of runtimeDefinitionRegistry.helperGlobalBindings.values()) {
      if (binding.helperName !== helperName) {
        continue;
      }
      helper.usesGlobals({
        [binding.alias]: Cadenza.getGlobal(binding.globalName),
      });
    }
  }

  private applyAllTaskLinks(): void {
    for (const link of runtimeDefinitionRegistry.taskLinks.values()) {
      const predecessor = Cadenza.get(link.predecessorTaskName);
      const successor = Cadenza.get(link.successorTaskName);
      if (!predecessor || !successor) {
        continue;
      }
      predecessor.then(successor);
    }
  }

  private applyRoutineDecorations(routineName: string): void {
    const routine = this.requireRoutine(routineName);
    for (const observation of runtimeDefinitionRegistry.routineSignalObservations.values()) {
      if (observation.routineName !== routineName) {
        continue;
      }
      routine.doOn(observation.signal);
    }
  }

  private rematerializeRoutinesStartingWith(taskName: string): void {
    for (const definition of runtimeDefinitionRegistry.routineDefinitions.values()) {
      if (!definition.startTaskNames.includes(taskName)) {
        continue;
      }

      const recreated = Cadenza.createRoutineFromDefinition(definition);
      this.applyRoutineDecorations(recreated.name);
    }
  }

  private rematerializeActorTasksFor(actorName: string): void {
    for (const definition of runtimeDefinitionRegistry.actorTaskDefinitions.values()) {
      if (definition.actorName !== actorName) {
        continue;
      }

      this.materializeActorTask(definition.taskName);
      this.applyTaskDecorations(definition.taskName);
      this.applyAllTaskLinks();
      this.rematerializeRoutinesStartingWith(definition.taskName);
    }
  }

  private materializeActorTask(taskName: string): Task {
    const definition = runtimeDefinitionRegistry.actorTaskDefinitions.get(taskName);
    if (!definition) {
      throw new RuntimeProtocolException(
        "not_found",
        `No actor task definition named "${taskName}" exists`,
      );
    }

    const actor = Cadenza.getActor(definition.actorName);
    if (!actor) {
      throw new RuntimeProtocolException(
        "not_found",
        `No actor named "${definition.actorName}" exists`,
      );
    }

    const existingTask = Cadenza.get(definition.taskName);
    if (existingTask && !runtimeDefinitionRegistry.isRuntimeOwnedTask(existingTask.name)) {
      throw new RuntimeProtocolException(
        "conflict",
        `Task "${definition.taskName}" already exists and is not runtime-owned`,
      );
    }

    existingTask?.destroy();

    const handler = compileRuntimeActorTaskHandler(definition);
    return Cadenza.createTask(
      definition.taskName,
      actor.task(handler, { mode: definition.mode as ActorTaskMode }),
      definition.description ?? "",
      definition.options ?? {},
    );
  }

  private snapshotTask(task: Task): AnyObject {
    const snapshot = Cadenza.snapshotRuntime();
    const existing = snapshot.tasks.find((entry) => entry.name === task.name);
    if (existing) {
      return existing;
    }

    const runtimeTaskDefinition = runtimeDefinitionRegistry.taskDefinitions.get(
      task.name,
    );
    const runtimeActorTaskDefinition =
      runtimeDefinitionRegistry.actorTaskDefinitions.get(task.name);

    return {
      name: task.name,
      version: task.version,
      description: task.description,
      kind: runtimeActorTaskDefinition
        ? "actorTask"
        : task.isMeta
          ? "metaTask"
          : "task",
      runtimeOwned: runtimeDefinitionRegistry.isRuntimeOwnedTask(task.name),
      language:
        runtimeTaskDefinition?.language ??
        runtimeActorTaskDefinition?.language ??
        null,
      handlerSource:
        runtimeTaskDefinition?.handlerSource ??
        runtimeActorTaskDefinition?.handlerSource ??
        null,
      tools: {
        helpers: Object.fromEntries(task.helperAliases),
        globals: Object.fromEntries(task.globalAliases),
      },
    };
  }

  private snapshotHelper(helperName: string): AnyObject {
    const snapshot = Cadenza.snapshotRuntime();
    return (
      snapshot.helpers.find((entry) => entry.name === helperName) ?? {
        name: helperName,
      }
    );
  }

  private snapshotGlobal(globalName: string): AnyObject {
    const snapshot = Cadenza.snapshotRuntime();
    return (
      snapshot.globals.find((entry) => entry.name === globalName) ?? {
        name: globalName,
      }
    );
  }

  private snapshotRoutine(routine: GraphRoutine): AnyObject {
    const snapshot = Cadenza.snapshotRuntime();
    return (
      snapshot.routines.find((entry) => entry.name === routine.name) ?? {
        name: routine.name,
        version: routine.version,
        description: routine.description,
        isMeta: routine.isMeta,
        runtimeOwned: runtimeDefinitionRegistry.isRuntimeOwnedRoutine(
          routine.name,
        ),
        startTaskNames: Array.from(routine.tasks).map((task) => task.name),
        observedSignals: Array.from(routine.observedSignals),
      }
    );
  }

  private parseSignalPatterns(value: unknown): string[] {
    if (value === undefined) {
      return ["*"];
    }

    if (
      !Array.isArray(value) ||
      value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
    ) {
      throw new RuntimeProtocolException(
        "invalid_payload",
        "signalPatterns must be an array of non-empty strings",
      );
    }

    return Array.from(new Set(value.map((entry) => entry.trim())));
  }

  private parsePositiveInteger(
    value: unknown,
    fieldName: string,
    fallback: number,
  ): number {
    if (value === undefined) {
      return fallback;
    }

    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value <= 0
    ) {
      throw new RuntimeProtocolException(
        "invalid_payload",
        `${fieldName} must be a positive integer`,
      );
    }

    return value;
  }

  private parseNonNegativeInteger(
    value: unknown,
    fieldName: string,
    fallback: number,
  ): number {
    if (value === undefined) {
      return fallback;
    }

    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0
    ) {
      throw new RuntimeProtocolException(
        "invalid_payload",
        `${fieldName} must be a non-negative integer`,
      );
    }

    return value;
  }
}
