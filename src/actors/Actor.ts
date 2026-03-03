import { AnyObject } from "../types/global";
import { InquiryOptions } from "../engine/InquiryBroker";
import type { TaskFunction, TaskResult } from "../graph/definition/Task";

export type ActorLoadPolicy = "eager" | "lazy";
export type ActorWriteContract = "overwrite" | "patch" | "reducer";
export type ActorTaskMode = "read" | "write" | "meta";
export type ActorKind = "standard" | "meta";
export type ActorRuntimeReadGuard = "none" | "freeze-shallow";
export type ActorConsistencyProfileName =
  | "strict"
  | "balanced"
  | "cached"
  | "async";

export interface ActorInvocationOptions {
  actorKey?: string;
  idempotencyKey?: string;
}

export interface SessionPolicy {
  enabled?: boolean;
  idleTtlMs?: number;
  absoluteTtlMs?: number;
  extendIdleTtlOnRead?: boolean;
}

export interface RetryPolicy {
  attempts?: number;
  delayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

export interface IdempotencyPolicy {
  enabled?: boolean;
  mode?: "required" | "optional";
  rerunOnFailedDuplicate?: boolean;
  ttlMs?: number;
}

export type ActorKeyDefinition =
  | { source: "path"; path: string }
  | { source: "field"; field: string }
  | { source: "template"; template: string };

export interface ActorTaskBindingDefinition {
  taskName: string;
  mode?: ActorTaskMode;
  description?: string;
}

export interface ActorStateDefinition<
  D extends Record<string, any>,
  R = AnyObject,
> {
  durable?: {
    initState?: D | (() => D);
    schema?: AnyObject;
    description?: string;
  };
  runtime?: {
    schema?: AnyObject;
    description?: string;
  };
}

export interface ActorDefinition<
  D extends Record<string, any>,
  R = AnyObject,
> {
  name: string;
  description: string;
  defaultKey: string;
  kind?: ActorKind;
  loadPolicy?: ActorLoadPolicy;
  writeContract?: ActorWriteContract;
  consistencyProfile?: ActorConsistencyProfileName;
  retry?: RetryPolicy;
  idempotency?: IdempotencyPolicy;
  session?: SessionPolicy;
  runtimeReadGuard?: ActorRuntimeReadGuard;
  key?: ActorKeyDefinition;
  state?: ActorStateDefinition<D, R>;
  tasks?: ActorTaskBindingDefinition[];
}

export interface ActorSpec<
  D extends Record<string, any>,
  R = AnyObject,
> {
  name: string;
  description?: string;
  state?: ActorStateDefinition<D, R>;
  initState?: D | (() => D);
  defaultKey: string;
  key?: ActorKeyDefinition;
  keyResolver?: (input: Record<string, any>) => string | undefined;
  loadPolicy?: ActorLoadPolicy;
  writeContract?: ActorWriteContract;
  kind?: ActorKind;
  retry?: RetryPolicy;
  idempotency?: IdempotencyPolicy;
  session?: SessionPolicy;
  consistencyProfile?: ActorConsistencyProfileName;
  runtimeReadGuard?: ActorRuntimeReadGuard;
  taskBindings?: ActorTaskBindingDefinition[];
}

export interface ActorFactoryOptions<
  D extends Record<string, any> = Record<string, any>,
  R = AnyObject,
> {
  isMeta?: boolean;
  definitionSource?: ActorDefinition<D, R>;
}

export interface ActorTaskBindingOptions {
  mode?: ActorTaskMode;
  touchSession?: boolean;
}

export type ActorStateReducer<S> = (
  state: S,
  input: AnyObject,
) => S;

export interface ActorResolvedInvocationOptions {
  actorKey?: string;
  loadPolicy: ActorLoadPolicy;
  writeContract: ActorWriteContract;
  consistencyProfile?: ActorConsistencyProfileName;
  idempotencyKey?: string;
  touchSession: boolean;
}

export interface ActorStateMutators<
  D extends Record<string, any>,
  R = AnyObject,
> {
  setDurable: (next: D | ActorStateReducer<D>) => void;
  patchDurable: (partial: Partial<D>) => void;
  reduceDurable: (reducer: ActorStateReducer<D>) => void;
  setRuntime: (next: R | ActorStateReducer<R>) => void;
  patchRuntime: (partial: Partial<R>) => void;
  reduceRuntime: (reducer: ActorStateReducer<R>) => void;
}

export interface ActorStateStore<
  D extends Record<string, any>,
  R = AnyObject,
> extends ActorStateMutators<D, R> {
  durable: D;
  runtime: R;
  version: number;
  durableVersion: number;
  runtimeVersion: number;
}

export interface ActorTaskContext<
  D extends Record<string, any>,
  R = AnyObject,
> {
  state: D;
  durableState: D;
  runtimeState: R;
  store: ActorStateStore<D, R>;
  input: AnyObject;
  actor: {
    name: string;
    description?: string;
    key: string;
    version: number;
    durableVersion: number;
    runtimeVersion: number;
    kind: ActorKind;
  };
  options: ActorResolvedInvocationOptions;
  setState: (next: D | ActorStateReducer<D>) => void;
  patchState: (partial: Partial<D>) => void;
  reduceState: (reducer: ActorStateReducer<D>) => void;
  setDurableState: (next: D | ActorStateReducer<D>) => void;
  patchDurableState: (partial: Partial<D>) => void;
  reduceDurableState: (reducer: ActorStateReducer<D>) => void;
  setRuntimeState: (next: R | ActorStateReducer<R>) => void;
  patchRuntimeState: (partial: Partial<R>) => void;
  reduceRuntimeState: (reducer: ActorStateReducer<R>) => void;
  emit: (signal: string, payload?: AnyObject) => void;
  inquire: (
    inquiry: string,
    context?: AnyObject,
    options?: InquiryOptions,
  ) => Promise<AnyObject>;
}

export type ActorTaskHandler<
  D extends Record<string, any>,
  R = AnyObject,
> = (
  context: ActorTaskContext<D, R>,
) =>
  | TaskResult
  | ActorStateReducer<D>
  | Promise<TaskResult | ActorStateReducer<D>>;

interface ActorStateRecord<
  D extends Record<string, any>,
  R = AnyObject,
> {
  durableState: D;
  runtimeState: R;
  version: number;
  runtimeVersion: number;
  createdAt: number;
  lastReadAt: number;
  lastDurableWriteAt: number;
  lastRuntimeWriteAt: number;
}

interface ActorSessionState {
  lastTouchedAt: number;
  idleExpiresAt: number | null;
  absoluteExpiresAt: number | null;
}

type IdempotencyRecordStatus = "running" | "succeeded" | "failed";

interface IdempotencyRecord {
  status: IdempotencyRecordStatus;
  promise?: Promise<TaskResult>;
  resultPayload?: TaskResult;
  error?: unknown;
  expiresAt: number | null;
  updatedAt: number;
}

export interface ActorTaskRuntimeMetadata {
  actorName: string;
  actorDescription?: string;
  actorKind: ActorKind;
  mode: ActorTaskMode;
  forceMeta: boolean;
}

const ACTOR_TASK_METADATA = Symbol.for("@cadenza.io/core/actor-task-meta");
const ACTOR_INVOCATION_OPTIONS_KEY = "__actorOptions";

type ActorTaskFunction = TaskFunction & {
  [ACTOR_TASK_METADATA]?: ActorTaskRuntimeMetadata;
};

function deepClone<T>(value: T): T {
  if (
    value === undefined ||
    value === null ||
    typeof value !== "object" ||
    value instanceof Date
  ) {
    return value;
  }

  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneForDurableState<T>(value: T): T {
  return deepClone(value);
}

function cloneForIdempotency<T>(value: T): T {
  try {
    return deepClone(value);
  } catch {
    return value;
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object";
}

function normalizeActorKey(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  if (normalized <= 0) {
    return undefined;
  }

  return normalized;
}

function getValueByPath(input: AnyObject, path: string): unknown {
  return path
    .split(".")
    .filter((segment) => segment.length > 0)
    .reduce((acc: unknown, segment) => {
      if (!isObject(acc)) {
        return undefined;
      }
      return acc[segment];
    }, input);
}

function resolveTemplateKey(input: AnyObject, template: string): string | undefined {
  const resolved = template.replace(/\{([^}]+)\}/g, (_match, token: string) => {
    const value = normalizeActorKey(getValueByPath(input, token.trim()));
    return value ?? "";
  });

  const normalized = normalizeActorKey(resolved);
  return normalized;
}

function freezeForReadGuard<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze([...value]) as T;
  }

  if (!isObject(value)) {
    return value;
  }

  const prototype = Object.getPrototypeOf(value);
  const clone =
    prototype === Object.prototype || prototype === null
      ? { ...(value as AnyObject) }
      : Object.assign(Object.create(prototype), value);
  return Object.freeze(clone) as T;
}

export function getActorTaskRuntimeMetadata(
  taskFunction: TaskFunction,
): ActorTaskRuntimeMetadata | undefined {
  return (taskFunction as ActorTaskFunction)[ACTOR_TASK_METADATA];
}

export default class Actor<
  D extends Record<string, any> = AnyObject,
  R = AnyObject,
> {
  readonly spec: ActorSpec<D, R>;
  readonly kind: ActorKind;

  private readonly sourceDefinition?: ActorDefinition<D, R>;
  private readonly stateByKey: Map<string, ActorStateRecord<D, R>> = new Map();
  private readonly sessionByKey: Map<string, ActorSessionState> = new Map();
  private readonly idempotencyByKey: Map<string, IdempotencyRecord> = new Map();
  private nextTaskBindingIndex = 0;

  constructor(spec: ActorSpec<D, R>, options: ActorFactoryOptions<D, R> = {}) {
    if (!spec.name || typeof spec.name !== "string") {
      throw new Error("Actor name must be a non-empty string");
    }

    const normalizedDefaultKey = normalizeActorKey(spec.defaultKey);
    if (!normalizedDefaultKey) {
      throw new Error("Actor defaultKey must be a non-empty string");
    }

    this.kind = options.isMeta || spec.kind === "meta" ? "meta" : "standard";
    this.sourceDefinition = options.definitionSource;
    this.spec = {
      ...spec,
      defaultKey: normalizedDefaultKey,
      kind: this.kind,
    };

    if ((this.spec.loadPolicy ?? "eager") === "eager") {
      this.ensureStateRecord(this.spec.defaultKey);
    }
  }

  public task(
    handler: ActorTaskHandler<D, R>,
    bindingOptions: ActorTaskBindingOptions = {},
  ): TaskFunction {
    const mode = bindingOptions.mode ?? "read";
    const taskBindingId = `${this.spec.name}:${++this.nextTaskBindingIndex}`;

    const wrapped: ActorTaskFunction = (
      context: AnyObject,
      emit: (signal: string, context: AnyObject) => void,
      inquire: (
        inquiry: string,
        inquiryContext: AnyObject,
        options: InquiryOptions,
      ) => Promise<AnyObject>,
      progressCallback: (progress: number) => void,
    ): TaskResult => {
      const normalizedInput = this.normalizeInputContext(context);
      const invocationOptions = this.resolveInvocationOptions(
        context,
        bindingOptions.touchSession,
      );
      const actorKey = this.resolveActorKey(normalizedInput, invocationOptions);
      this.touchSession(actorKey, invocationOptions.touchSession, Date.now());

      const runTask = async (): Promise<TaskResult> => {
        const stateRecord = this.ensureStateRecord(actorKey);
        stateRecord.lastReadAt = Date.now();

        let durableStateChanged = false;
        let runtimeStateChanged = false;
        let nextDurableState = cloneForDurableState(stateRecord.durableState);
        let nextRuntimeState = stateRecord.runtimeState;

        const assertWritable = (operationName: string) => {
          if (mode === "read") {
            throw new Error(
              `Actor "${this.spec.name}" does not allow ${operationName} in read mode`,
            );
          }
        };

        const reduceDurableState = (reducer: ActorStateReducer<D>) => {
          assertWritable("durable state writes");
          nextDurableState = cloneForDurableState(
            reducer(cloneForDurableState(nextDurableState), normalizedInput),
          );
          durableStateChanged = true;
        };

        const setDurableState = (next: D | ActorStateReducer<D>) => {
          assertWritable("durable state writes");
          if (typeof next === "function") {
            reduceDurableState(next as ActorStateReducer<D>);
            return;
          }

          nextDurableState = cloneForDurableState(next);
          durableStateChanged = true;
        };

        const patchDurableState = (partial: Partial<D>) => {
          assertWritable("durable state writes");
          if (!isObject(nextDurableState) || !isObject(partial)) {
            throw new Error(
              `Actor "${this.spec.name}" patchDurableState requires object state and partial patch`,
            );
          }

          nextDurableState = {
            ...(nextDurableState as AnyObject),
            ...(partial as AnyObject),
          } as D;
          durableStateChanged = true;
        };

        const reduceRuntimeState = (reducer: ActorStateReducer<R>) => {
          assertWritable("runtime state writes");
          nextRuntimeState = reducer(nextRuntimeState, normalizedInput);
          runtimeStateChanged = true;
        };

        const setRuntimeState = (next: R | ActorStateReducer<R>) => {
          assertWritable("runtime state writes");
          if (typeof next === "function") {
            reduceRuntimeState(next as ActorStateReducer<R>);
            return;
          }

          nextRuntimeState = next;
          runtimeStateChanged = true;
        };

        const patchRuntimeState = (partial: Partial<R>) => {
          assertWritable("runtime state writes");
          if (!isObject(nextRuntimeState) || !isObject(partial)) {
            throw new Error(
              `Actor "${this.spec.name}" patchRuntimeState requires object state and partial patch`,
            );
          }

          nextRuntimeState = {
            ...(nextRuntimeState as AnyObject),
            ...(partial as AnyObject),
          } as R;
          runtimeStateChanged = true;
        };

        const runtimeStateForRead =
          mode === "read"
            ? this.applyRuntimeReadGuard(stateRecord.runtimeState)
            : stateRecord.runtimeState;

        const store: ActorStateStore<D, R> = {
          durable: cloneForDurableState(stateRecord.durableState),
          runtime: runtimeStateForRead,
          version: stateRecord.version,
          durableVersion: stateRecord.version,
          runtimeVersion: stateRecord.runtimeVersion,
          setDurable: setDurableState,
          patchDurable: patchDurableState,
          reduceDurable: reduceDurableState,
          setRuntime: setRuntimeState,
          patchRuntime: patchRuntimeState,
          reduceRuntime: reduceRuntimeState,
        };

        const actorContext: ActorTaskContext<D, R> = {
          state: store.durable,
          durableState: store.durable,
          runtimeState: store.runtime,
          store,
          input: normalizedInput,
          actor: {
            name: this.spec.name,
            description: this.spec.description,
            key: actorKey,
            version: stateRecord.version,
            durableVersion: stateRecord.version,
            runtimeVersion: stateRecord.runtimeVersion,
            kind: this.kind,
          },
          options: invocationOptions,
          setState: setDurableState,
          patchState: patchDurableState,
          reduceState: reduceDurableState,
          setDurableState,
          patchDurableState,
          reduceDurableState,
          setRuntimeState,
          patchRuntimeState,
          reduceRuntimeState,
          emit: (signal: string, payload: AnyObject = {}) => emit(signal, payload),
          inquire: (
            inquiryName: string,
            inquiryContext: AnyObject = {},
            options: InquiryOptions = {},
          ) => inquire(inquiryName, inquiryContext, options),
        };

        const handlerResult = await handler(actorContext);

        if (
          invocationOptions.writeContract === "reducer" &&
          typeof handlerResult === "function"
        ) {
          reduceDurableState(handlerResult as ActorStateReducer<D>);
        }

        const writeTimestamp = Date.now();

        if (durableStateChanged) {
          stateRecord.durableState = cloneForDurableState(nextDurableState);
          stateRecord.version += 1;
          stateRecord.lastDurableWriteAt = writeTimestamp;
        }

        if (runtimeStateChanged) {
          stateRecord.runtimeState = nextRuntimeState;
          stateRecord.runtimeVersion += 1;
          stateRecord.lastRuntimeWriteAt = writeTimestamp;
        }

        this.touchSession(actorKey, invocationOptions.touchSession, Date.now());
        progressCallback(100);

        if (
          invocationOptions.writeContract === "reducer" &&
          typeof handlerResult === "function"
        ) {
          return cloneForDurableState(stateRecord.durableState);
        }

        return handlerResult as TaskResult;
      };

      return this.runWithOptionalIdempotency(
        taskBindingId,
        actorKey,
        invocationOptions,
        runTask,
      );
    };

    wrapped[ACTOR_TASK_METADATA] = {
      actorName: this.spec.name,
      actorDescription: this.spec.description,
      actorKind: this.kind,
      mode,
      forceMeta: this.kind === "meta" || mode === "meta",
    };

    return wrapped;
  }

  public getState(actorKey?: string): D {
    return this.getDurableState(actorKey);
  }

  public getDurableState(actorKey?: string): D {
    const key = normalizeActorKey(actorKey) ?? this.spec.defaultKey;
    return cloneForDurableState(this.ensureStateRecord(key).durableState);
  }

  public getRuntimeState(actorKey?: string): R {
    const key = normalizeActorKey(actorKey) ?? this.spec.defaultKey;
    return this.ensureStateRecord(key).runtimeState;
  }

  public getVersion(actorKey?: string): number {
    return this.getDurableVersion(actorKey);
  }

  public getDurableVersion(actorKey?: string): number {
    const key = normalizeActorKey(actorKey) ?? this.spec.defaultKey;
    return this.ensureStateRecord(key).version;
  }

  public getRuntimeVersion(actorKey?: string): number {
    const key = normalizeActorKey(actorKey) ?? this.spec.defaultKey;
    return this.ensureStateRecord(key).runtimeVersion;
  }

  public toDefinition(): ActorDefinition<D, R> {
    if (this.sourceDefinition) {
      return cloneForIdempotency(this.sourceDefinition) as ActorDefinition<D, R>;
    }

    const durableInitState =
      this.spec.state?.durable?.initState ??
      this.spec.initState ??
      ({} as D);

    return {
      name: this.spec.name,
      description: this.spec.description ?? "",
      defaultKey: this.spec.defaultKey,
      kind: this.kind,
      loadPolicy: this.spec.loadPolicy,
      writeContract: this.spec.writeContract,
      consistencyProfile: this.spec.consistencyProfile,
      retry: this.spec.retry,
      idempotency: this.spec.idempotency,
      session: this.spec.session,
      runtimeReadGuard: this.spec.runtimeReadGuard,
      key: this.spec.key,
      state: {
        ...(this.spec.state ?? {}),
        durable: {
          ...(this.spec.state?.durable ?? {}),
          initState: durableInitState,
        },
        runtime: this.spec.state?.runtime,
      },
      tasks: this.spec.taskBindings,
    };
  }

  public reset(actorKey?: string): void {
    if (actorKey === undefined) {
      this.stateByKey.clear();
      this.sessionByKey.clear();
      this.idempotencyByKey.clear();
      if ((this.spec.loadPolicy ?? "eager") === "eager") {
        this.ensureStateRecord(this.spec.defaultKey);
      }
      return;
    }

    const normalizedKey = normalizeActorKey(actorKey);
    if (!normalizedKey) {
      return;
    }

    this.stateByKey.delete(normalizedKey);
    this.sessionByKey.delete(normalizedKey);
    for (const key of this.idempotencyByKey.keys()) {
      if (key.startsWith(`${normalizedKey}:`)) {
        this.idempotencyByKey.delete(key);
      }
    }
  }

  private applyRuntimeReadGuard(runtimeState: R): R {
    const guard = this.spec.runtimeReadGuard ?? "none";
    if (guard === "freeze-shallow") {
      return freezeForReadGuard(runtimeState);
    }
    return runtimeState;
  }

  private normalizeInputContext(context: AnyObject): AnyObject {
    if (!isObject(context)) {
      return {};
    }

    const normalized = { ...context };
    delete normalized[ACTOR_INVOCATION_OPTIONS_KEY];
    return normalized;
  }

  private resolveInvocationOptions(
    context: AnyObject,
    bindingTouchSession?: boolean,
  ): ActorResolvedInvocationOptions {
    const rawOptionsCandidate = isObject(context)
      ? context[ACTOR_INVOCATION_OPTIONS_KEY]
      : undefined;
    const rawOptions = isObject(rawOptionsCandidate)
      ? (rawOptionsCandidate as ActorInvocationOptions)
      : {};

    return {
      actorKey: normalizeActorKey(rawOptions.actorKey),
      loadPolicy: this.spec.loadPolicy ?? "eager",
      writeContract: this.spec.writeContract ?? "overwrite",
      consistencyProfile: this.spec.consistencyProfile,
      idempotencyKey: rawOptions.idempotencyKey,
      touchSession:
        bindingTouchSession ?? this.spec.session?.extendIdleTtlOnRead ?? true,
    };
  }

  private resolveActorKey(
    input: AnyObject,
    options: ActorResolvedInvocationOptions,
  ): string {
    const explicitKey = normalizeActorKey(options.actorKey);
    if (explicitKey) {
      return explicitKey;
    }

    const resolvedFromResolver = normalizeActorKey(this.spec.keyResolver?.(input));
    if (resolvedFromResolver) {
      return resolvedFromResolver;
    }

    const resolvedFromDefinition = this.resolveActorKeyFromDefinition(input);
    if (resolvedFromDefinition) {
      return resolvedFromDefinition;
    }

    return this.spec.defaultKey;
  }

  private resolveActorKeyFromDefinition(input: AnyObject): string | undefined {
    if (!this.spec.key) {
      return undefined;
    }

    if (this.spec.key.source === "field") {
      return normalizeActorKey(input[this.spec.key.field]);
    }

    if (this.spec.key.source === "path") {
      return normalizeActorKey(getValueByPath(input, this.spec.key.path));
    }

    return resolveTemplateKey(input, this.spec.key.template);
  }

  private resolveInitialDurableState(): D {
    const legacyDefinitionInitialState = (
      this.spec.state?.durable as { initialState?: D | (() => D) } | undefined
    )?.initialState;
    const initialDurableState =
      this.spec.state?.durable?.initState ??
      legacyDefinitionInitialState ??
      this.spec.initState;

    if (initialDurableState === undefined) {
      return {} as D;
    }

    if (typeof initialDurableState === "function") {
      return cloneForDurableState((initialDurableState as () => D)());
    }

    return cloneForDurableState(initialDurableState);
  }

  private resolveInitialRuntimeState(): R {
    return undefined as R;
  }

  private ensureStateRecord(actorKey: string): ActorStateRecord<D, R> {
    const existing = this.stateByKey.get(actorKey);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const record: ActorStateRecord<D, R> = {
      durableState: this.resolveInitialDurableState(),
      runtimeState: this.resolveInitialRuntimeState(),
      version: 0,
      runtimeVersion: 0,
      createdAt: now,
      lastReadAt: now,
      lastDurableWriteAt: now,
      lastRuntimeWriteAt: now,
    };

    this.stateByKey.set(actorKey, record);
    this.touchSession(actorKey, true, now);
    return record;
  }

  private touchSession(
    actorKey: string,
    shouldTouch: boolean,
    touchedAt: number,
  ): void {
    if (!this.spec.session?.enabled || !shouldTouch) {
      return;
    }

    const idleTtlMs = normalizePositiveInteger(this.spec.session.idleTtlMs);
    const absoluteTtlMs = normalizePositiveInteger(
      this.spec.session.absoluteTtlMs,
    );
    const existing = this.sessionByKey.get(actorKey);

    if (!existing) {
      this.sessionByKey.set(actorKey, {
        lastTouchedAt: touchedAt,
        idleExpiresAt: idleTtlMs ? touchedAt + idleTtlMs : null,
        absoluteExpiresAt: absoluteTtlMs ? touchedAt + absoluteTtlMs : null,
      });
      return;
    }

    existing.lastTouchedAt = touchedAt;
    existing.idleExpiresAt = idleTtlMs ? touchedAt + idleTtlMs : null;
    if (existing.absoluteExpiresAt === null && absoluteTtlMs) {
      existing.absoluteExpiresAt = touchedAt + absoluteTtlMs;
    }
  }

  private runWithOptionalIdempotency(
    taskBindingId: string,
    actorKey: string,
    options: ActorResolvedInvocationOptions,
    runTask: () => Promise<TaskResult>,
  ): TaskResult {
    const idempotencyPolicy = this.spec.idempotency;
    const enabled = idempotencyPolicy?.enabled ?? false;
    if (!enabled) {
      return runTask();
    }

    const idempotencyMode = idempotencyPolicy?.mode ?? "optional";
    const idempotencyKey = options.idempotencyKey;
    if (!idempotencyKey) {
      if (idempotencyMode === "required") {
        throw new Error(
          `Actor "${this.spec.name}" requires idempotencyKey but none was provided`,
        );
      }

      return runTask();
    }

    const compositeKey = `${actorKey}:${taskBindingId}:${idempotencyKey}`;
    const existing = this.getActiveIdempotencyRecord(compositeKey);
    const rerunOnFailed = idempotencyPolicy?.rerunOnFailedDuplicate ?? true;

    if (existing) {
      if (existing.status === "running" && existing.promise) {
        return existing.promise;
      }

      if (existing.status === "succeeded") {
        return cloneForIdempotency(existing.resultPayload);
      }

      if (existing.status === "failed" && !rerunOnFailed) {
        throw existing.error ?? new Error("Duplicate idempotent execution failed");
      }
    }

    const now = Date.now();
    const ttlMs = normalizePositiveInteger(idempotencyPolicy?.ttlMs);
    const expiresAt = ttlMs ? now + ttlMs : null;

    const promise = runTask()
      .then((result) => {
        this.idempotencyByKey.set(compositeKey, {
          status: "succeeded",
          resultPayload: cloneForIdempotency(result),
          updatedAt: Date.now(),
          expiresAt,
        });
        return result;
      })
      .catch((error) => {
        this.idempotencyByKey.set(compositeKey, {
          status: "failed",
          error,
          updatedAt: Date.now(),
          expiresAt,
        });
        throw error;
      });

    this.idempotencyByKey.set(compositeKey, {
      status: "running",
      promise,
      updatedAt: now,
      expiresAt,
    });

    return promise;
  }

  private getActiveIdempotencyRecord(
    compositeKey: string,
  ): IdempotencyRecord | undefined {
    const record = this.idempotencyByKey.get(compositeKey);
    if (!record) {
      return undefined;
    }

    if (record.expiresAt !== null && Date.now() >= record.expiresAt) {
      this.idempotencyByKey.delete(compositeKey);
      return undefined;
    }

    return record;
  }
}
