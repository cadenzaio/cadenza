import type { Intent } from "../engine/InquiryBroker";
import type {
  SignalDefinitionInput,
  SignalMetadata,
} from "../engine/SignalBroker";
import type { ActorDefinition, ActorTaskMode } from "../actors/Actor";
import type { AnyObject } from "../types/global";
import type { TaskOptions } from "../Cadenza";

export type RuntimeHandlerLanguage = "js" | "ts";
export type RuntimeTaskDefinitionKind = "task" | "metaTask";
export type RuntimeHelperDefinitionKind = "helper" | "metaHelper";
export type RuntimeGlobalDefinitionKind = "global" | "metaGlobal";
export type RuntimeSignalEmissionMode = "attach" | "after" | "onFail";
export type RuntimeSharingMode = "isolated" | "shared";
export type RuntimeSessionRole = "owner" | "writer" | "observer";

export type RuntimeTaskOptions = Omit<TaskOptions, "getTagCallback">;

export interface RuntimeTaskDefinition {
  name: string;
  description?: string;
  handlerSource: string;
  language: RuntimeHandlerLanguage;
  kind?: RuntimeTaskDefinitionKind;
  options?: RuntimeTaskOptions;
}

export interface RuntimeHelperDefinition {
  name: string;
  description?: string;
  handlerSource: string;
  language: RuntimeHandlerLanguage;
  kind?: RuntimeHelperDefinitionKind;
}

export interface RuntimeGlobalDefinition {
  name: string;
  description?: string;
  value: unknown;
  kind?: RuntimeGlobalDefinitionKind;
}

export interface RuntimeRoutineDefinition {
  name: string;
  description?: string;
  startTaskNames: string[];
  isMeta?: boolean;
}

export interface RuntimeActorTaskDefinition {
  actorName: string;
  taskName: string;
  description?: string;
  mode?: ActorTaskMode;
  handlerSource: string;
  language: RuntimeHandlerLanguage;
  options?: RuntimeTaskOptions;
}

export interface RuntimeTaskSignalEmission {
  taskName: string;
  signal: SignalDefinitionInput;
  mode?: RuntimeSignalEmissionMode;
}

export interface RuntimeTaskSignalObservation {
  taskName: string;
  signal: SignalDefinitionInput;
}

export interface RuntimeRoutineSignalObservation {
  routineName: string;
  signal: string;
}

export interface RuntimeTaskIntentBinding {
  taskName: string;
  intentName: string;
}

export interface RuntimeTaskLinkDefinition {
  predecessorTaskName: string;
  successorTaskName: string;
}

export interface RuntimeTaskHelperBinding {
  taskName: string;
  alias: string;
  helperName: string;
}

export interface RuntimeTaskGlobalBinding {
  taskName: string;
  alias: string;
  globalName: string;
}

export interface RuntimeHelperHelperBinding {
  helperName: string;
  alias: string;
  dependencyHelperName: string;
}

export interface RuntimeHelperGlobalBinding {
  helperName: string;
  alias: string;
  globalName: string;
}

export interface RuntimeSnapshotTask {
  name: string;
  version: number;
  description: string;
  kind: "task" | "metaTask" | "actorTask";
  runtimeOwned: boolean;
  language: RuntimeHandlerLanguage | null;
  handlerSource: string | null;
  concurrency: number;
  timeout: number;
  retryCount: number;
  retryDelay: number;
  retryDelayMax: number;
  retryDelayFactor: number;
  validateInputContext: boolean;
  validateOutputContext: boolean;
  inputContextSchema: Record<string, unknown>;
  outputContextSchema: Record<string, unknown>;
  nextTaskNames: string[];
  predecessorTaskNames: string[];
  signals: {
    emits: string[];
    emitsAfter: string[];
    emitsOnFail: string[];
    observed: string[];
  };
  intents: {
    handles: string[];
    inquires: string[];
  };
  tools: {
    helpers: Record<string, string>;
    globals: Record<string, string>;
  };
  actorName: string | null;
  actorMode: ActorTaskMode | null;
}

export interface RuntimeSnapshotHelper {
  name: string;
  version: number;
  description: string;
  kind: "helper" | "metaHelper";
  runtimeOwned: boolean;
  language: RuntimeHandlerLanguage | null;
  handlerSource: string | null;
  tools: {
    helpers: Record<string, string>;
    globals: Record<string, string>;
  };
}

export interface RuntimeSnapshotGlobal {
  name: string;
  version: number;
  description: string;
  kind: "global" | "metaGlobal";
  runtimeOwned: boolean;
  value: unknown;
}

export interface RuntimeSnapshotRoutine {
  name: string;
  version: number;
  description: string;
  isMeta: boolean;
  runtimeOwned: boolean;
  startTaskNames: string[];
  observedSignals: string[];
}

export interface RuntimeSnapshotIntent extends Intent {
  runtimeOwned: boolean;
}

export interface RuntimeSnapshotSignal {
  name: string;
  metadata: SignalMetadata | null;
}

export interface RuntimeSnapshotActorKeyState {
  actorKey: string;
  durableState: unknown;
  runtimeState: unknown;
  durableVersion: number;
  runtimeVersion: number;
}

export interface RuntimeSnapshotActor {
  name: string;
  description: string;
  runtimeOwned: boolean;
  definition: ActorDefinition<Record<string, any>, AnyObject>;
  actorKeys: RuntimeSnapshotActorKeyState[];
}

export interface RuntimeSnapshotActorTask {
  actorName: string;
  taskName: string;
  description: string;
  mode: ActorTaskMode;
  language: RuntimeHandlerLanguage;
  handlerSource: string;
  runtimeOwned: boolean;
}

export interface RuntimeSnapshot {
  runtimeMode: "core";
  bootstrapped: boolean;
  mode: string;
  tasks: RuntimeSnapshotTask[];
  helpers: RuntimeSnapshotHelper[];
  globals: RuntimeSnapshotGlobal[];
  routines: RuntimeSnapshotRoutine[];
  intents: RuntimeSnapshotIntent[];
  signals: RuntimeSnapshotSignal[];
  actors: RuntimeSnapshotActor[];
  actorTasks: RuntimeSnapshotActorTask[];
  links: RuntimeTaskLinkDefinition[];
}

export interface RuntimeSubscription {
  subscriptionId: string;
  signalPatterns: string[];
  maxQueueSize: number;
  createdAt: string;
  pendingEvents: number;
}

export interface RuntimeSignalEventSource {
  taskName: string | null;
  taskVersion: number | null;
  taskExecutionId: string | null;
  routineName: string | null;
  routineVersion: number | null;
  routineExecutionId: string | null;
  executionTraceId: string | null;
  consumed: boolean;
  consumedBy: string | null;
}

export interface RuntimeSignalEvent {
  id: string;
  subscriptionId: string;
  sequence: number;
  type: "signal";
  signal: string;
  signalName: string;
  signalTag: string | null;
  emittedAt: string | null;
  isMeta: boolean;
  isSubMeta: boolean;
  metadata: SignalMetadata | null;
  source: RuntimeSignalEventSource;
  context: Record<string, unknown>;
}

export interface RuntimeNextEventResult {
  subscriptionId: string;
  event: RuntimeSignalEvent | null;
  timedOut: boolean;
  pendingEvents: number;
}

export interface RuntimePollEventsResult {
  subscriptionId: string;
  events: RuntimeSignalEvent[];
  pendingEvents: number;
}

export interface RuntimeInfo {
  runtimeMode: "core";
  runtimeSharing: RuntimeSharingMode;
  runtimeName: string | null;
  sessionId: string | null;
  sessionRole: RuntimeSessionRole | null;
  activeSessionCount: number;
  daemonProcessId: number | null;
  bootstrapped: boolean;
  mode: string;
}

export type RuntimeProtocolOperation =
  | "runtime.bootstrap"
  | "runtime.info"
  | "runtime.detach"
  | "runtime.shutdown"
  | "runtime.reset"
  | "runtime.snapshot"
  | "runtime.subscribe"
  | "runtime.unsubscribe"
  | "runtime.nextEvent"
  | "runtime.pollEvents"
  | "task.upsert"
  | "helper.upsert"
  | "global.upsert"
  | "task.link"
  | "task.observeSignal"
  | "task.emitSignal"
  | "task.respondToIntent"
  | "task.useHelper"
  | "task.useGlobal"
  | "helper.useHelper"
  | "helper.useGlobal"
  | "routine.upsert"
  | "routine.observeSignal"
  | "intent.upsert"
  | "actor.upsert"
  | "actorTask.upsert"
  | "run"
  | "emit"
  | "inquire";

export interface RuntimeProtocolRequest<TPayload = AnyObject> {
  id?: string | number;
  operation: RuntimeProtocolOperation;
  payload?: TPayload;
}

export interface RuntimeProtocolError {
  code: string;
  message: string;
  details?: AnyObject;
}

export interface RuntimeProtocolResponse<TResult = unknown> {
  id?: string | number;
  operation: RuntimeProtocolOperation;
  ok: boolean;
  result?: TResult;
  error?: RuntimeProtocolError;
}

export interface RuntimeProtocolHandshake {
  ready: true;
  protocol: "cadenza-runtime-jsonl";
  protocolVersion: "1";
  runtimeMode: "core";
  runtimeSharing: RuntimeSharingMode;
  runtimeName: string | null;
  sessionId: string | null;
  sessionRole: RuntimeSessionRole | null;
  supportedOperations: RuntimeProtocolOperation[];
}
