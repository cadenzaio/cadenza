import GraphContext from "../context/GraphContext";
import GraphVisitor from "../../interfaces/GraphVisitor";
import TaskIterator from "../iterators/TaskIterator";
import Graph from "../../interfaces/Graph";
import { AnyObject } from "../../types/global";
import { SchemaDefinition } from "../../types/schema";
import SignalEmitter from "../../interfaces/SignalEmitter";
import Cadenza from "../../Cadenza";

export type TaskFunction = (
  context: AnyObject,
  emit: (signal: string, context: AnyObject) => void,
  progressCallback: (progress: number) => void,
) => TaskResult;
export type TaskResult = boolean | AnyObject | Generator | Promise<any> | void;
export type ThrottleTagGetter = (context?: AnyObject, task?: Task) => string;

export default class Task extends SignalEmitter implements Graph {
  readonly name: string;
  readonly description: string;
  version: number = 1;
  concurrency: number;
  timeout: number;
  readonly isMeta: boolean = false;
  readonly isSubMeta: boolean = false;
  readonly isHidden: boolean = false;
  readonly isUnique: boolean = false;
  readonly throttled: boolean = false;

  readonly isSignal: boolean = false;
  readonly isDeputy: boolean = false;
  readonly isEphemeral: boolean = false;
  readonly isDebounce: boolean = false;

  inputContextSchema: SchemaDefinition | undefined = undefined;
  validateInputContext: boolean = false;
  outputContextSchema: SchemaDefinition | undefined = undefined;
  validateOutputContext: boolean = false;

  readonly retryCount: number = 0;
  readonly retryDelay: number = 0;
  readonly retryDelayMax: number = 0;
  readonly retryDelayFactor: number = 1;

  layerIndex: number = 0;
  progressWeight: number = 0;
  nextTasks: Set<Task> = new Set();
  onFailTasks: Set<Task> = new Set();
  predecessorTasks: Set<Task> = new Set();
  destroyed: boolean = false;

  emitsSignals: Set<string> = new Set();
  signalsToEmitAfter: Set<string> = new Set();
  signalsToEmitOnFail: Set<string> = new Set();
  observedSignals: Set<string> = new Set();

  readonly taskFunction: TaskFunction;

  /**
   * Constructs a Task (static definition).
   * @param name Name.
   * @param task Function.
   * @param description Description.
   * @param concurrency Limit.
   * @param timeout ms.
   * @param register Register via signal (default true).
   * @param isUnique
   * @param isMeta
   * @param isSubMeta
   * @param isHidden
   * @param getTagCallback
   * @param inputSchema
   * @param validateInputContext
   * @param outputSchema
   * @param validateOutputContext
   * @param retryCount
   * @param retryDelay
   * @param retryDelayMax
   * @param retryDelayFactor
   * @edge Emits 'meta.task.created' with { __task: this } for seed.
   */
  constructor(
    name: string,
    task: TaskFunction,
    description: string = "",
    concurrency: number = 0,
    timeout: number = 0,
    register: boolean = true,
    isUnique: boolean = false,
    isMeta: boolean = false,
    isSubMeta: boolean = false,
    isHidden: boolean = false,
    getTagCallback: ThrottleTagGetter | undefined = undefined,
    inputSchema: SchemaDefinition | undefined = undefined,
    validateInputContext: boolean = false,
    outputSchema: SchemaDefinition | undefined = undefined,
    validateOutputContext: boolean = false,
    retryCount: number = 0,
    retryDelay: number = 0,
    retryDelayMax: number = 0,
    retryDelayFactor: number = 1,
  ) {
    super(isSubMeta || isHidden);
    this.name = name;
    this.taskFunction = task.bind(this);
    this.description = description;
    this.concurrency = concurrency;
    this.timeout = timeout;
    this.isUnique = isUnique;
    this.isMeta = isMeta;
    this.isSubMeta = isSubMeta;
    this.isHidden = isHidden;
    this.inputContextSchema = inputSchema;
    this.validateInputContext = validateInputContext;
    this.outputContextSchema = outputSchema;
    this.validateOutputContext = validateOutputContext;
    this.retryCount = retryCount;
    this.retryDelay = retryDelay;
    this.retryDelayMax = retryDelayMax;
    this.retryDelayFactor = retryDelayFactor;

    if (getTagCallback) {
      this.getTag = (context?: AnyObject) => getTagCallback(context, this);
      this.throttled = true;
    }

    if (register && !this.isHidden && !this.isSubMeta) {
      const { __functionString, __getTagCallback } = this.export();
      this.emitWithMetadata("meta.task.created", {
        data: {
          name: this.name,
          version: this.version,
          description: this.description,
          functionString: __functionString,
          tagIdGetter: __getTagCallback,
          layerIndex: this.layerIndex,
          concurrency: this.concurrency,
          retryCount: this.retryCount,
          retryDelay: this.retryDelay,
          retryDelayMax: this.retryDelayMax,
          retryDelayFactor: this.retryDelayFactor,
          timeout: this.timeout,
          isUnique: this.isUnique,
          isSignal: this.isSignal,
          isThrottled: this.throttled,
          isDebounce: this.isDebounce,
          isEphemeral: this.isEphemeral,
          isMeta: this.isMeta,
          validateInputContext: this.validateInputContext,
          validateOutputContext: this.validateOutputContext,
          // inputContextSchemaId: this.inputContextSchema,
          // outputContextSchemaId: this.outputContextSchema,
        },
        __taskInstance: this,
      });
    }
  }

  public getTag(context?: AnyObject): string {
    return this.name;
  }

  public setVersion(version: number): void {
    this.version = version;
    this.emitWithMetadata("meta.task.version_set", {
      __version: this.version,
    });
  }

  public setTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  public setConcurrency(concurrency: number): void {
    this.concurrency = concurrency;
  }

  public setProgressWeight(weight: number): void {
    this.progressWeight = weight;
  }

  public setInputContextSchema(schema: SchemaDefinition): void {
    this.inputContextSchema = schema;
  }

  public setOutputContextSchema(schema: SchemaDefinition): void {
    this.outputContextSchema = schema;
  }

  public setValidateInputContext(value: boolean): void {
    this.validateInputContext = value;
  }

  public setValidateOutputContext(value: boolean): void {
    this.validateOutputContext = value;
  }

  emitWithMetadata(signal: string, ctx: AnyObject = {}) {
    const data = { ...ctx };
    if (!this.isHidden && !this.isSubMeta) {
      data.__signalEmission = {
        taskName: this.name,
        taskVersion: this.version,
      };
    }

    this.emit(signal, data);
  }

  emitMetricsWithMetadata(signal: string, ctx: AnyObject = {}) {
    const data = { ...ctx };
    if (!this.isHidden && !this.isSubMeta) {
      data.__signalEmission = {
        taskName: this.name,
        taskVersion: this.version,
        isMetric: true,
      };
    }

    this.emitMetrics(signal, data);
  }

  /**
   * Validates a context deeply against a schema.
   * @param data - The data to validate (input context or output result).
   * @param schema - The schema definition.
   * @param path - The current path for error reporting (default: 'root').
   * @returns { { valid: boolean, errors: Record<string, string> } } - Validation result with detailed errors if invalid.
   * @description Recursively checks types, required fields, and constraints; allows extra properties not in schema.
   */
  validateSchema(
    data: any,
    schema: SchemaDefinition | undefined,
    path: string = "context",
  ): { valid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    if (!schema || typeof schema !== "object") return { valid: true, errors };

    // Check required fields
    const required = schema.required || [];
    for (const key of required) {
      if (!(key in data)) {
        errors[`${path}.${key}`] = `Required field '${key}' is missing`;
      }
    }

    // Validate defined properties (ignore extras)
    const properties = schema.properties || {};
    for (const [key, value] of Object.entries(data)) {
      if (key in properties) {
        const prop = properties[key];
        const propType = prop.type;

        if (propType === "any") {
          continue;
        }

        if ((value === undefined || value === null) && !prop.strict) {
          continue;
        }

        if (propType === "string" && typeof value !== "string") {
          errors[`${path}.${key}`] =
            `Expected 'string' for '${key}', got '${typeof value}'`;
        } else if (propType === "number" && typeof value !== "number") {
          errors[`${path}.${key}`] =
            `Expected 'number' for '${key}', got '${typeof value}'`;
        } else if (propType === "boolean" && typeof value !== "boolean") {
          errors[`${path}.${key}`] =
            `Expected 'boolean' for '${key}', got '${typeof value}'`;
        } else if (propType === "array" && !Array.isArray(value)) {
          errors[`${path}.${key}`] =
            `Expected 'array' for '${key}', got '${typeof value}'`;
        } else if (
          propType === "object" &&
          (typeof value !== "object" || value === null || Array.isArray(value))
        ) {
          errors[`${path}.${key}`] =
            `Expected 'object' for '${key}', got '${typeof value}'`;
        } else if (propType === "array" && prop.items) {
          if (Array.isArray(value)) {
            value.forEach((item, index) => {
              const subValidation = this.validateSchema(
                item,
                prop.items,
                `${path}.${key}[${index}]`,
              );
              if (!subValidation.valid) {
                Object.assign(errors, subValidation.errors);
              }
            });
          }
        } else if (
          propType === "object" &&
          !Array.isArray(value) &&
          value !== null
        ) {
          const subValidation = this.validateSchema(
            value,
            prop,
            `${path}.${key}`,
          );
          if (!subValidation.valid) {
            Object.assign(errors, subValidation.errors);
          }
        }

        // Check constraints (extended as discussed)
        const constraints = prop.constraints || {};
        if (typeof value === "string") {
          if (constraints.minLength && value.length < constraints.minLength) {
            errors[`${path}.${key}`] =
              `String '${key}' shorter than minLength ${constraints.minLength}`;
          }
          if (constraints.maxLength && value.length > constraints.maxLength) {
            errors[`${path}.${key}`] =
              `String '${key}' exceeds maxLength ${constraints.maxLength}`;
          }
          if (
            constraints.pattern &&
            !new RegExp(constraints.pattern).test(value)
          ) {
            errors[`${path}.${key}`] =
              `String '${key}' does not match pattern ${constraints.pattern}`;
          }
        } else if (typeof value === "number") {
          if (constraints.min && value < constraints.min) {
            errors[`${path}.${key}`] =
              `Number '${key}' below min ${constraints.min}`;
          }
          if (constraints.max && value > constraints.max) {
            errors[`${path}.${key}`] =
              `Number '${key}' exceeds max ${constraints.max}`;
          }
          if (constraints.multipleOf && value % constraints.multipleOf !== 0) {
            errors[`${path}.${key}`] =
              `Number '${key}' not multiple of ${constraints.multipleOf}`;
          }
        } else if (constraints.enum && !constraints.enum.includes(value)) {
          errors[`${path}.${key}`] =
            `Value '${value}' for '${key}' not in enum ${JSON.stringify(constraints.enum)}`;
        } else if (constraints.format) {
          const formats = {
            email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            url: /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/,
            "date-time":
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
            uuid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
            custom: /.*/, // Placeholder; override with prop.constraints.pattern if present
          } as any;
          const regex =
            formats[constraints.format] ||
            new RegExp(constraints.pattern || ".*");
          if (typeof value === "string" && !regex.test(value)) {
            errors[`${path}.${key}`] =
              `Value '${value}' for '${key}' does not match format '${constraints.format}'`;
          }
        } else if (constraints.oneOf && !constraints.oneOf.includes(value)) {
          errors[`${path}.${key}`] =
            `Value '${value}' for '${key}' not in oneOf ${JSON.stringify(constraints.oneOf)}`;
        }
      } else if (schema.strict) {
        errors[`${path}.${key}`] = `Key '${key}' is not allowed`;
      }
    }

    if (Object.keys(errors).length > 0) {
      return { valid: false, errors };
    }
    return { valid: true, errors: {} };
  }

  public validateInput(context: AnyObject): true | AnyObject {
    if (this.validateInputContext) {
      const validationResult = this.validateSchema(
        context,
        this.inputContextSchema,
      );
      if (!validationResult.valid) {
        this.emitWithMetadata("meta.task.input_validation_failed", {
          __taskName: this.name,
          __taskVersion: this.version,
          __context: context,
          __errors: validationResult.errors,
        });
        return {
          errored: true,
          __error: "Input context validation failed",
          __validationErrors: JSON.stringify(validationResult.errors),
        };
      }
    }
    return true;
  }

  public validateOutput(context: AnyObject): true | AnyObject {
    if (this.validateOutputContext) {
      const validationResult = this.validateSchema(
        context,
        this.outputContextSchema,
      );
      if (!validationResult.valid) {
        this.emitWithMetadata("meta.task.outputValidationFailed", {
          __taskName: this.name,
          __taskVersion: this.version,
          __result: context,
          __errors: validationResult.errors,
        });
        return {
          errored: true,
          __error: "Output context validation failed",
          __validationErrors: JSON.stringify(validationResult.errors),
        };
      }
    }
    return true;
  }

  /**
   * Executes the task function after optional input validation.
   * @param context - The GraphContext to validate and execute.
   * @param emit
   * @param progressCallback - Callback for progress updates.
   * @returns TaskResult from the taskFunction or error object on validation failure.
   * @edge If validateInputContext is true, validates context; on failure, emits 'meta.task.validationFailed' with detailed errors.
   * @edge If validateOutputContext is true, validates output; on failure, emits 'meta.task.outputValidationFailed' with detailed errors.
   */
  public execute(
    context: GraphContext,
    emit: (signal: string, context: AnyObject) => void,
    progressCallback: (progress: number) => void,
  ): TaskResult {
    return this.taskFunction(
      this.isMeta ? context.getClonedFullContext() : context.getClonedContext(),
      emit,
      progressCallback,
    );
  }

  public doAfter(...tasks: Task[]): this {
    for (const pred of tasks) {
      if (this.predecessorTasks.has(pred)) continue;

      pred.nextTasks.add(this);
      this.predecessorTasks.add(pred);
      this.updateLayerFromPredecessors();

      if (this.hasCycle()) {
        this.decouple(pred);
        throw new Error(`Cycle adding pred ${pred.name} to ${this.name}`);
      }

      this.emitMetricsWithMetadata("meta.task.relationship_added", {
        data: {
          taskName: this.name,
          taskVersion: this.version,
          predecessorTaskName: pred.name,
          predecessorTaskVersion: pred.version,
        },
      });
    }

    this.updateProgressWeights();
    return this;
  }

  public then(...tasks: Task[]): this {
    for (const next of tasks) {
      if (this.nextTasks.has(next)) continue;

      this.nextTasks.add(next);
      next.predecessorTasks.add(this);
      next.updateLayerFromPredecessors();

      if (next.hasCycle()) {
        this.decouple(next);
        throw new Error(`Cycle adding next ${next.name} to ${this.name}`);
      }

      this.emitMetricsWithMetadata("meta.task.relationship_added", {
        data: {
          taskName: next.name,
          taskVersion: next.version,
          predecessorTaskName: this.name,
          predecessorTaskVersion: this.version,
        },
      });
    }

    this.updateProgressWeights();
    return this;
  }

  public decouple(task: Task): void {
    if (task.nextTasks.has(this)) {
      task.nextTasks.delete(this);
      this.predecessorTasks.delete(task);
    }

    if (task.onFailTasks.has(this)) {
      task.onFailTasks.delete(this);
      this.predecessorTasks.delete(task);
    }

    // TODO: Delete task map instances

    this.updateLayerFromPredecessors();
  }

  updateProgressWeights(): void {
    const layers = this.getSubgraphLayers();
    const numLayers = layers.size;
    if (numLayers === 0) return;

    const weightPerLayer = 1 / numLayers;

    layers.forEach((tasksInLayer) => {
      const numTasks = tasksInLayer.size;
      if (numTasks === 0) return;
      tasksInLayer.forEach(
        (task) => (task.progressWeight = weightPerLayer / numTasks),
      );
    });
  }

  getSubgraphLayers(): Map<number, Set<Task>> {
    const layers = new Map<number, Set<Task>>();
    const queue = [this as Task];
    const visited = new Set<Task>();

    while (queue.length) {
      const task = queue.shift()!;
      if (visited.has(task)) continue;
      visited.add(task);

      if (!layers.has(task.layerIndex)) layers.set(task.layerIndex, new Set());
      layers.get(task.layerIndex)!.add(task);

      task.nextTasks.forEach((next) => queue.push(next));
    }

    return layers;
  }

  updateLayerFromPredecessors(): void {
    const prevLayerIndex = this.layerIndex;
    let maxPred = 0;
    this.predecessorTasks.forEach(
      (pred) => (maxPred = Math.max(maxPred, pred.layerIndex)),
    );
    this.layerIndex = maxPred + 1;

    if (prevLayerIndex !== this.layerIndex) {
      this.emitMetricsWithMetadata("meta.task.layer_index_changed", {
        data: {
          layerIndex: this.layerIndex,
        },
        filter: { name: this.name, version: this.version },
      });
    }

    const queue = Array.from(this.nextTasks);
    while (queue.length) {
      const next = queue.shift()!;
      next.updateLayerFromPredecessors();
      next.nextTasks.forEach((n) => queue.push(n));
    }
  }

  hasCycle(): boolean {
    const visited = new Set<Task>();
    const recStack = new Set<Task>();

    const dfs = (task: Task): boolean => {
      if (recStack.has(task)) return true;
      if (visited.has(task)) return false;

      visited.add(task);
      recStack.add(task);

      for (const next of task.nextTasks) {
        if (dfs(next)) return true;
      }

      recStack.delete(task);
      return false;
    };

    return dfs(this);
  }

  public mapNext(
    callback: (task: Task) => any,
    failed: boolean = false,
  ): any[] {
    const tasks = failed
      ? Array.from(this.onFailTasks)
      : Array.from(this.nextTasks);
    return tasks.map(callback);
  }

  public mapPrevious(callback: (task: Task) => any): any[] {
    return Array.from(this.predecessorTasks).map(callback);
  }

  /**
   * Subscribes to signals (chainable).
   * @param signals The signal names.
   * @returns This for chaining.
   * @edge Duplicates ignored; assumes broker.observe binds this as handler.
   */
  doOn(...signals: string[]): this {
    signals.forEach((signal) => {
      if (this.observedSignals.has(signal)) return;
      Cadenza.broker.observe(signal, this as any);
      this.observedSignals.add(signal);
      this.emitWithMetadata("meta.task.observed_signal", {
        data: {
          signalName: signal.split(":")[0],
          taskName: this.name,
          taskVersion: this.version,
        },
      });
    });
    return this;
  }

  /**
   * Sets signals to emit post-execution (chainable).
   * @param signals The signal names.
   * @returns This for chaining.
   */
  emits(...signals: string[]): this {
    signals.forEach((signal) => {
      this.signalsToEmitAfter.add(signal);
      this.emitsSignals.add(signal);
      this.emitWithMetadata("meta.task.attached_signal", {
        data: {
          signalName: signal.split(":")[0],
          taskName: this.name,
          taskVersion: this.version,
        },
      });
    });
    return this;
  }

  emitsOnFail(...signals: string[]): this {
    signals.forEach((signal) => {
      this.signalsToEmitOnFail.add(signal);
      this.emitsSignals.add(signal);
      this.emitWithMetadata("meta.task.attached_signal", {
        data: {
          signalName: signal,
          taskName: this.name,
          taskVersion: this.version,
          isOnFail: true,
        },
      });
    });
    return this;
  }

  /**
   * Unsubscribes from all observed signals.
   * @returns This for chaining.
   */
  unsubscribeAll(): this {
    this.observedSignals.forEach((signal) => {
      Cadenza.broker.unsubscribe(signal, this as any);
      this.emitWithMetadata("meta.task.unsubscribed_signal", {
        filter: {
          signalName: signal,
          taskName: this.name,
          taskVersion: this.version,
        },
      });
    });
    this.observedSignals.clear();
    return this;
  }

  /**
   * Unsubscribes from specific signals.
   * @param signals The signals.
   * @returns This for chaining.
   * @edge No-op if not subscribed.
   */
  unsubscribe(...signals: string[]): this {
    signals.forEach((signal) => {
      if (this.observedSignals.has(signal)) {
        Cadenza.broker.unsubscribe(signal, this as any);
        this.observedSignals.delete(signal);
        this.emitWithMetadata("meta.task.unsubscribed_signal", {
          filter: {
            signalName: signal,
            taskName: this.name,
            taskVersion: this.version,
          },
        });
      }
    });
    return this;
  }

  /**
   * Detaches specific emitted signals.
   * @param signals The signals.
   * @returns This for chaining.
   */
  detachSignals(...signals: string[]): this {
    signals.forEach((signal) => {
      this.signalsToEmitAfter.delete(signal);
      this.emitWithMetadata("meta.task.detached_signal", {
        filter: {
          signalName: signal,
          taskName: this.name,
          taskVersion: this.version,
        },
      });
    });
    return this;
  }

  /**
   * Detaches all emitted signals.
   * @returns This for chaining.
   */
  detachAllSignals(): this {
    this.signalsToEmitAfter.forEach((signal) => {
      this.emitWithMetadata("meta.task.detached_signal", {
        filter: {
          signalName: signal,
          taskName: this.name,
          taskVersion: this.version,
        },
      });
    });
    this.signalsToEmitAfter.clear();
    return this;
  }

  mapSignals(callback: (signal: string) => void) {
    return Array.from(this.signalsToEmitAfter).map(callback);
  }

  mapOnFailSignals(callback: (signal: string) => void) {
    return Array.from(this.signalsToEmitOnFail).map(callback);
  }

  /**
   * Emits attached signals.
   * @param context The context for emission.
   * @edge If isMeta (from Task), suppresses further "meta.*" to prevent loops.
   */
  emitSignals(context: GraphContext): void {
    this.signalsToEmitAfter.forEach((signal) => {
      this.emit(signal, context.getFullContext());
    });
  }

  /**
   * Emits attached fail signals.
   * @param context The context for emission.
   * @edge If isMeta (from Task), suppresses further "meta.*" to prevent loops.
   */
  emitOnFailSignals(context: GraphContext): void {
    this.signalsToEmitOnFail.forEach((signal) => {
      this.emit(signal, context.getFullContext());
    });
  }

  public destroy(): void {
    this.unsubscribeAll();
    this.detachAllSignals();

    this.predecessorTasks.forEach((pred) => pred.nextTasks.delete(this));
    this.nextTasks.forEach((next) => next.predecessorTasks.delete(this));
    this.onFailTasks.forEach((fail) => fail.predecessorTasks.delete(this));

    this.nextTasks.clear();
    this.predecessorTasks.clear();
    this.onFailTasks.clear();

    this.destroyed = true;

    this.emitMetricsWithMetadata("meta.task.destroyed", {
      data: { deleted: true },
      filter: { name: this.name, version: this.version },
    });

    // TODO: Delete task map instances
  }

  public export(): AnyObject {
    return {
      __name: this.name,
      __description: this.description,
      __layerIndex: this.layerIndex,
      __isUnique: this.isUnique,
      __isMeta: this.isMeta,
      __isSignal: this.isSignal,
      __eventTriggers: this.observedSignals,
      __attachedEvents: this.signalsToEmitAfter,
      __isDeputy: this.isDeputy,
      __throttled: this.throttled,
      __isEphemeral: this.isEphemeral,
      __concurrency: this.concurrency,
      __timeout: this.timeout,
      __functionString: this.taskFunction.toString(),
      __getTagCallback: this.getTag.toString(),
      __inputSchema: this.inputContextSchema,
      __validateInputContext: this.validateInputContext,
      __outputSchema: this.outputContextSchema,
      __validateOutputContext: this.validateOutputContext,
      __nextTasks: Array.from(this.nextTasks).map((t) => t.name),
      __onFailTasks: Array.from(this.onFailTasks).map((t) => t.name),
      __previousTasks: Array.from(this.predecessorTasks).map((t) => t.name),
    };
  }

  public getIterator(): TaskIterator {
    return new TaskIterator(this);
  }

  public accept(visitor: GraphVisitor): void {
    visitor.visitTask(this);
  }

  public log(): void {
    console.log(this.name);
  }
}
