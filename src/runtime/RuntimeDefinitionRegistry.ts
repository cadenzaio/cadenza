import type { ActorDefinition } from "../actors/Actor";
import type { Intent } from "../engine/InquiryBroker";
import type {
  RuntimeActorTaskDefinition,
  RuntimeGlobalDefinition,
  RuntimeHelperDefinition,
  RuntimeHelperGlobalBinding,
  RuntimeHelperHelperBinding,
  RuntimeRoutineDefinition,
  RuntimeRoutineSignalObservation,
  RuntimeTaskDefinition,
  RuntimeTaskGlobalBinding,
  RuntimeTaskHelperBinding,
  RuntimeTaskIntentBinding,
  RuntimeTaskLinkDefinition,
  RuntimeTaskSignalEmission,
  RuntimeTaskSignalObservation,
} from "./types";

function createLinkKey(
  predecessorTaskName: string,
  successorTaskName: string,
): string {
  return `${predecessorTaskName}=>${successorTaskName}`;
}

function createTaskSignalKey(taskName: string, signalName: string): string {
  return `${taskName}=>${signalName}`;
}

function createTaskIntentKey(taskName: string, intentName: string): string {
  return `${taskName}=>${intentName}`;
}

function createRoutineSignalKey(routineName: string, signalName: string): string {
  return `${routineName}=>${signalName}`;
}

export class RuntimeDefinitionRegistry {
  readonly taskDefinitions = new Map<string, RuntimeTaskDefinition>();
  readonly helperDefinitions = new Map<string, RuntimeHelperDefinition>();
  readonly globalDefinitions = new Map<string, RuntimeGlobalDefinition>();
  readonly routineDefinitions = new Map<string, RuntimeRoutineDefinition>();
  readonly intentDefinitions = new Map<string, Intent>();
  readonly actorDefinitions = new Map<
    string,
    ActorDefinition<Record<string, any>, Record<string, any>>
  >();
  readonly actorTaskDefinitions = new Map<string, RuntimeActorTaskDefinition>();

  readonly taskLinks = new Map<string, RuntimeTaskLinkDefinition>();
  readonly taskSignalObservations = new Map<string, RuntimeTaskSignalObservation>();
  readonly taskSignalEmissions = new Map<string, RuntimeTaskSignalEmission>();
  readonly taskIntentBindings = new Map<string, RuntimeTaskIntentBinding>();
  readonly taskHelperBindings = new Map<string, RuntimeTaskHelperBinding>();
  readonly taskGlobalBindings = new Map<string, RuntimeTaskGlobalBinding>();
  readonly helperHelperBindings = new Map<string, RuntimeHelperHelperBinding>();
  readonly helperGlobalBindings = new Map<string, RuntimeHelperGlobalBinding>();
  readonly routineSignalObservations = new Map<
    string,
    RuntimeRoutineSignalObservation
  >();

  reset(): void {
    this.taskDefinitions.clear();
    this.helperDefinitions.clear();
    this.globalDefinitions.clear();
    this.routineDefinitions.clear();
    this.intentDefinitions.clear();
    this.actorDefinitions.clear();
    this.actorTaskDefinitions.clear();
    this.taskLinks.clear();
    this.taskSignalObservations.clear();
    this.taskSignalEmissions.clear();
    this.taskIntentBindings.clear();
    this.taskHelperBindings.clear();
    this.taskGlobalBindings.clear();
    this.helperHelperBindings.clear();
    this.helperGlobalBindings.clear();
    this.routineSignalObservations.clear();
  }

  setTaskDefinition(definition: RuntimeTaskDefinition): void {
    this.taskDefinitions.set(definition.name, {
      ...definition,
      kind: definition.kind ?? "task",
      options: definition.options ? { ...definition.options } : undefined,
    });
  }

  setHelperDefinition(definition: RuntimeHelperDefinition): void {
    this.helperDefinitions.set(definition.name, {
      ...definition,
      kind: definition.kind ?? "helper",
    });
  }

  setGlobalDefinition(definition: RuntimeGlobalDefinition): void {
    this.globalDefinitions.set(definition.name, {
      ...definition,
      kind: definition.kind ?? "global",
      value: definition.value,
    });
  }

  setRoutineDefinition(definition: RuntimeRoutineDefinition): void {
    this.routineDefinitions.set(definition.name, {
      ...definition,
      startTaskNames: [...definition.startTaskNames],
      isMeta: definition.isMeta === true,
    });
  }

  setIntentDefinition(definition: Intent): void {
    this.intentDefinitions.set(definition.name, {
      ...definition,
      input: definition.input ? { ...definition.input } : undefined,
      output: definition.output ? { ...definition.output } : undefined,
    });
  }

  setActorDefinition(
    definition: ActorDefinition<Record<string, any>, Record<string, any>>,
  ): void {
    this.actorDefinitions.set(definition.name, {
      ...definition,
      state: definition.state
        ? {
            ...definition.state,
            durable: definition.state.durable
              ? { ...definition.state.durable }
              : undefined,
            runtime: definition.state.runtime
              ? { ...definition.state.runtime }
              : undefined,
          }
        : undefined,
      tasks: definition.tasks
        ? definition.tasks.map((task) => ({ ...task }))
        : undefined,
    });
  }

  setActorTaskDefinition(definition: RuntimeActorTaskDefinition): void {
    this.actorTaskDefinitions.set(definition.taskName, {
      ...definition,
      mode: definition.mode ?? "read",
      options: definition.options ? { ...definition.options } : undefined,
    });
  }

  setTaskLink(definition: RuntimeTaskLinkDefinition): void {
    this.taskLinks.set(
      createLinkKey(
        definition.predecessorTaskName,
        definition.successorTaskName,
      ),
      { ...definition },
    );
  }

  setTaskSignalObservation(definition: RuntimeTaskSignalObservation): void {
    const signalName =
      typeof definition.signal === "string"
        ? definition.signal
        : definition.signal.name;
    this.taskSignalObservations.set(
      createTaskSignalKey(definition.taskName, signalName),
      {
        taskName: definition.taskName,
        signal:
          typeof definition.signal === "string"
            ? definition.signal
            : {
                name: definition.signal.name,
                deliveryMode: definition.signal.deliveryMode,
                broadcastFilter: definition.signal.broadcastFilter ?? null,
              },
      },
    );
  }

  setTaskSignalEmission(definition: RuntimeTaskSignalEmission): void {
    const signalName =
      typeof definition.signal === "string"
        ? definition.signal
        : definition.signal.name;
    this.taskSignalEmissions.set(
      `${definition.taskName}=>${definition.mode ?? "after"}=>${signalName}`,
      {
        taskName: definition.taskName,
        mode: definition.mode ?? "after",
        signal:
          typeof definition.signal === "string"
            ? definition.signal
            : {
                name: definition.signal.name,
                deliveryMode: definition.signal.deliveryMode,
                broadcastFilter: definition.signal.broadcastFilter ?? null,
              },
      },
    );
  }

  setTaskIntentBinding(definition: RuntimeTaskIntentBinding): void {
    this.taskIntentBindings.set(
      createTaskIntentKey(definition.taskName, definition.intentName),
      { ...definition },
    );
  }

  setTaskHelperBinding(definition: RuntimeTaskHelperBinding): void {
    this.taskHelperBindings.set(
      `${definition.taskName}=>${definition.alias}`,
      { ...definition },
    );
  }

  setTaskGlobalBinding(definition: RuntimeTaskGlobalBinding): void {
    this.taskGlobalBindings.set(
      `${definition.taskName}=>${definition.alias}`,
      { ...definition },
    );
  }

  setHelperHelperBinding(definition: RuntimeHelperHelperBinding): void {
    this.helperHelperBindings.set(
      `${definition.helperName}=>${definition.alias}`,
      { ...definition },
    );
  }

  setHelperGlobalBinding(definition: RuntimeHelperGlobalBinding): void {
    this.helperGlobalBindings.set(
      `${definition.helperName}=>${definition.alias}`,
      { ...definition },
    );
  }

  setRoutineSignalObservation(
    definition: RuntimeRoutineSignalObservation,
  ): void {
    this.routineSignalObservations.set(
      createRoutineSignalKey(definition.routineName, definition.signal),
      { ...definition },
    );
  }

  isRuntimeOwnedTask(taskName: string): boolean {
    return (
      this.taskDefinitions.has(taskName) || this.actorTaskDefinitions.has(taskName)
    );
  }

  isRuntimeOwnedHelper(helperName: string): boolean {
    return this.helperDefinitions.has(helperName);
  }

  isRuntimeOwnedGlobal(globalName: string): boolean {
    return this.globalDefinitions.has(globalName);
  }

  isRuntimeOwnedRoutine(routineName: string): boolean {
    return this.routineDefinitions.has(routineName);
  }

  isRuntimeOwnedActor(actorName: string): boolean {
    return this.actorDefinitions.has(actorName);
  }
}

export const runtimeDefinitionRegistry = new RuntimeDefinitionRegistry();
