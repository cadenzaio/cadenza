import { v4 as uuid } from "uuid";
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

/**
 * Represents a task with a specific behavior, configuration, and lifecycle management.
 * Tasks are used to define units of work that can be executed and orchestrated.
 * Tasks can specify input/output validation, concurrency, retry policies, and more.
 * This class extends SignalEmitter and implements Graph, allowing tasks to emit and observe signals.
 */
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
  predecessorTasks: Set<Task> = new Set();
  destroyed: boolean = false;
  register: boolean = true;
  registered: boolean = false;
  registeredSignals: Set<string> = new Set();
  taskMapRegistration: Set<string> = new Set();

  emitsSignals: Set<string> = new Set();
  signalsToEmitAfter: Set<string> = new Set();
  signalsToEmitOnFail: Set<string> = new Set();
  observedSignals: Set<string> = new Set();

  intents: Set<string> = new Set();

  readonly taskFunction: TaskFunction;

  /**
   * Constructs an instance of the task with the specified properties and configuration options.
   *
   * @param {string} name - The name of the task.
   * @param {TaskFunction} task - The function that represents the task logic.
   * @param {string} [description=""] - A description of the task.
   * @param {number} [concurrency=0] - The number of concurrent executions allowed for the task.
   * @param {number} [timeout=0] - The maximum execution time for the task in milliseconds.
   * @param {boolean} [register=true] - Indicates if the task should be registered or not.
   * @param {boolean} [isUnique=false] - Specifies if the task should only allow one instance to exist at any time.
   * @param {boolean} [isMeta=false] - Indicates if the task is a meta-task.
   * @param {boolean} [isSubMeta=false] - Indicates if the task is a sub-meta-task.
   * @param {boolean} [isHidden=false] - Determines if the task is hidden and not exposed publicly.
   * @param {ThrottleTagGetter} [getTagCallback=undefined] - A callback to generate a throttle tag for the task.
   * @param {SchemaDefinition} [inputSchema=undefined] - The input schema for validating the task's input context.
   * @param {boolean} [validateInputContext=false] - Specifies if the input context should be validated against the input schema.
   * @param {SchemaDefinition} [outputSchema=undefined] - The output schema for validating the task's output context.
   * @param {boolean} [validateOutputContext=false] - Specifies if the output context should be validated against the output schema.
   * @param {number} [retryCount=0] - The number of retry attempts allowed for the task in case of failure.
   * @param {number} [retryDelay=0] - The initial delay (in milliseconds) between retry attempts.
   * @param {number} [retryDelayMax=0] - The maximum delay (in milliseconds) allowed between retries.
   * @param {number} [retryDelayFactor=1] - The factor by which the retry delay increases after each attempt.
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
    this.taskFunction = task;
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
    this.register = register;

    if (getTagCallback) {
      this.getTag = (context?: AnyObject) => getTagCallback(context, this);
      this.throttled = true;
    }

    this.attachSignal(
      "meta.task.created",
      "meta.task.destroyed",
      "meta.task.output_validation_failed",
      "meta.task.input_validation_failed",
      "meta.task.relationship_added",
      "meta.task.relationship_removed",
      "meta.task.layer_index_changed",
      "meta.node.scheduled",
      "meta.node.mapped",
      "meta.node.errored",
      "meta.node.started",
      "meta.node.ended",
      "meta.node.mapped",
      "meta.node.progress",
      "meta.node.graph_completed",
      "meta.node.observed_signal",
      "meta.node.detected_previous_task_execution",
      "meta.node.started_routine_execution",
      "meta.node.ended_routine_execution",
      "meta.node.routine_execution_progress",
    );

    if (register && !this.isHidden) {
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
          isSubMeta: this.isSubMeta,
          validateInputContext: this.validateInputContext,
          validateOutputContext: this.validateOutputContext,
          // inputContextSchemaId: this.inputContextSchema,
          // outputContextSchemaId: this.outputContextSchema,
          signals: {
            emits: Array.from(this.emitsSignals),
            signalsToEmitAfter: Array.from(this.signalsToEmitAfter),
            signalsToEmitOnFail: Array.from(this.signalsToEmitOnFail),
            observed: Array.from(this.observedSignals),
          },
          intents: {
            handles: Array.from(this.intents),
          },
        },
        taskInstance: this,
        __isSubMeta: this.isSubMeta,
      });
    }
  }

  clone(traverse: boolean = false, includeSignals: boolean = false) {
    const clonedTask = new Task(
      `${this.name} (clone ${uuid().slice(0, 8)})`,
      this.taskFunction,
      this.description,
      this.concurrency,
      this.timeout,
      this.register,
      this.isUnique,
      this.isMeta,
      this.isSubMeta,
      this.isHidden,
      this.getTag,
      this.inputContextSchema,
      this.validateInputContext,
      this.outputContextSchema,
      this.validateOutputContext,
      this.retryCount,
      this.retryDelay,
      this.retryDelayMax,
      this.retryDelayFactor,
    );

    if (includeSignals) {
      clonedTask.doOn(...this.observedSignals);
      clonedTask.emits(...this.signalsToEmitAfter);
      clonedTask.emitsOnFail(...this.signalsToEmitOnFail);
      clonedTask.emitsSignals = new Set(Array.from(this.emitsSignals));
    }

    if (traverse) {
      this.mapNext((t: Task) => {
        clonedTask.then(t.clone(traverse, includeSignals));
      });
    }

    return clonedTask;
  }

  /**
   * Retrieves the tag associated with the instance.
   * Can be overridden by subclasses.
   *
   * @param {AnyObject} [context] - Optional context parameter that can be provided.
   * @return {string} The tag value of the instance.
   */
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

  /**
   * Emits a signal along with metadata if certain conditions are met.
   *
   * This method sends a signal with optional context data and adds metadata
   * to the emitted data if the instance is not hidden and not a subordinate metadata object.
   *
   * @param {string} signal - The name of the signal to emit.
   * @param {AnyObject} [ctx={}] - Additional context data to include with the emitted signal.
   * @return {void} Does not return a value.
   */
  emitWithMetadata(signal: string, ctx: AnyObject = {}) {
    const data = { ...ctx };
    if (!this.isHidden && !this.isSubMeta) {
      data.__signalEmission = {
        taskName: this.name,
        taskVersion: this.version,
        isMetric: false,
      };
    }

    this.emit(signal, data);
  }

  /**
   * Emits metrics with additional metadata enhancement based on the context and the state of the instance.
   * This is used to prevent loops on the meta layer in debug mode.
   *
   * @param {string} signal - The signal identifier for the metric being emitted.
   * @param {AnyObject} [ctx={}] - Optional context object to provide additional information with the metric.
   * @return {void} This method does not return any value.
   */
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
   * Validates a data object against a specified schema definition and returns validation results.
   *
   * @param {any} data - The target object to validate against the schema.
   * @param {SchemaDefinition | undefined} schema - The schema definition describing the expected structure and constraints of the data.
   * @param {string} [path="context"] - The base path or context for traversing the data, used in generating error messages.
   * @return {{ valid: boolean, errors: Record<string, string> }} - An object containing a validity flag (`valid`)
   * and a map (`errors`) of validation error messages keyed by property paths.
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

  /**
   * Validates the input context against the predefined schema and emits metadata if validation fails.
   *
   * @param {AnyObject} context - The input context to validate.
   * @return {true | AnyObject} - Returns `true` if validation succeeds, otherwise returns an error object containing details of the validation failure.
   */
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

  /**
   * Validates the output context using the provided schema and emits metadata if validation fails.
   *
   * @param {AnyObject} context - The output context to validate.
   * @return {true | AnyObject} Returns `true` if the output context is valid; otherwise, returns an object
   * containing error information when validation fails.
   */
  public validateOutput(context: AnyObject): true | AnyObject {
    if (this.validateOutputContext) {
      const validationResult = this.validateSchema(
        context,
        this.outputContextSchema,
      );
      if (!validationResult.valid) {
        this.emitWithMetadata("meta.task.output_validation_failed", {
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
   * Executes a task within a given context, optionally emitting signals and reporting progress.
   *
   * @param {GraphContext} context The execution context which provides data and functions necessary for the task.
   * @param {function(string, AnyObject): void} emit A function to emit signals and communicate intermediate results or states.
   * @param {function(number): void} progressCallback A callback function used to report task progress as a percentage (0 to 100).
   * @param {{ nodeId: string; routineExecId: string }} nodeData An object containing identifiers related to the node and execution routine.
   * @return {TaskResult} The result of the executed task.
   */
  public execute(
    context: GraphContext,
    emit: (signal: string, context: AnyObject) => void,
    progressCallback: (progress: number) => void,
    nodeData: { nodeId: string; routineExecId: string },
  ): TaskResult {
    return this.taskFunction(
      this.isMeta ? context.getClonedFullContext() : context.getClonedContext(),
      emit,
      progressCallback,
    );
  }

  /**
   * Adds tasks as predecessors to the current task and establishes dependencies between them.
   * Ensures that adding predecessors does not create cyclic dependencies.
   * Updates task relationships, progress weights, and emits relevant metrics after operations.
   *
   * @param {Task[]} tasks - An array of tasks to be added as predecessors to the current task.
   * @return {this} The current task instance for method chaining.
   * @throws {Error} Throws an error if adding a predecessor creates a cycle in the task structure.
   */
  public doAfter(...tasks: (Task | undefined)[]): this {
    for (const pred of tasks) {
      if (!pred) continue;
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

  /**
   * Adds a sequence of tasks as successors to the current task, ensuring no cyclic dependencies are introduced.
   * Metrics are emitted when a relationship is successfully added.
   *
   * @param {...Task} tasks - The tasks to be added as successors to the current task.
   * @return {this} Returns the current task instance for method chaining.
   * @throws {Error} Throws an error if adding a task causes a cyclic dependency.
   */
  public then(...tasks: (Task | undefined)[]): this {
    for (const next of tasks) {
      if (!next) continue;
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

  /**
   * Decouples the current task from the provided task by removing mutual references.
   *
   * @param {Task} task - The task to decouple from the current task.
   * @return {void} This method does not return a value.
   */
  public decouple(task: Task): void {
    if (task.nextTasks.has(this)) {
      task.nextTasks.delete(this);
      this.predecessorTasks.delete(task);
    }

    // this.emitMetricsWithMetadata("meta.task.relationship_removed", {
    //   data: {
    //     taskName: this.name,
    //     taskVersion: this.version,
    //     predecessorTaskName: pred.name,
    //     predecessorTaskVersion: pred.version,
    //   },
    // });

    this.updateLayerFromPredecessors();
  }

  /**
   * Updates the progress weights for tasks within each layer of the subgraph.
   * The progress weight for each task is calculated based on the inverse proportion
   * of the number of layers and the number of tasks in each layer. This ensures an
   * even distribution of progress weight across the tasks in the layers.
   *
   * @return {void} Does not return a value.
   */
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

  /**
   * Retrieves a mapping of layer indices to sets of tasks within each layer of a subgraph.
   * This method traverses the task dependencies and organizes tasks by their respective layer indices.
   *
   * @return {Map<number, Set<Task>>} A map where the key is the layer index (number) and the value is a set of tasks (Set<Task>) belonging to that layer.
   */
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

  /**
   * Updates the `layerIndex` of the current task based on the maximum layer index of its predecessors
   * and propagates the update recursively to all subsequent tasks. If the `layerIndex` changes,
   * emits a metric event with metadata about the change.
   *
   * @return {void} This method does not return a value.
   */
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

  /**
   * Determines whether there is a cycle in the tasks graph.
   * This method performs a depth-first search (DFS) to detect cycles.
   *
   * @return {boolean} - Returns true if a cycle is found in the graph, otherwise false.
   */
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

  /**
   * Maps over the next set of tasks or failed tasks if specified, applying the provided callback function.
   *
   * @param {Function} callback A function that will be called with each task, transforming the task as needed. It receives a single parameter of type Task.
   * @return {any[]} An array of transformed tasks resulting from applying the callback function.
   */
  public mapNext(callback: (task: Task) => any): any[] {
    const tasks = Array.from(this.nextTasks);
    return tasks.map(callback);
  }

  /**
   * Maps through each task in the set of predecessor tasks and applies the provided callback function.
   *
   * @param {function} callback - A function to execute on each task in the predecessor tasks. The function receives a `Task` object as its argument and returns any value.
   * @return {any[]} An array containing the results of applying the callback function to each predecessor task.
   */
  public mapPrevious(callback: (task: Task) => any): any[] {
    return Array.from(this.predecessorTasks).map(callback);
  }

  makeRoutine(name: string, description: string) {
    if (this.isMeta) {
      Cadenza.createMetaRoutine(name, [this], description);
    } else {
      Cadenza.createRoutine(name, [this], description);
    }

    return this;
  }

  /**
   * Adds the specified signals to the current instance, making it observe them.
   * If the instance is already observing a signal, it will be skipped.
   * The method also emits metadata information if the `register` property is set.
   *
   * @param {...string[]} signals - The array of signal names to observe.
   * @return {this} The current instance after adding the specified signals.
   */
  doOn(...signals: string[]): this {
    signals.forEach((signal) => {
      if (this.observedSignals.has(signal)) return;
      Cadenza.broker.observe(signal, this as any);
      this.observedSignals.add(signal);
      if (this.register) {
        this.emitWithMetadata("meta.task.observed_signal", {
          data: {
            signalName: signal.split(":")[0],
            taskName: this.name,
            taskVersion: this.version,
          },
        });
      }
    });
    return this;
  }

  /**
   * Registers the specified signals to be emitted after the Task executes successfully and attaches them for further processing.
   *
   * @param {...string} signals - The list of signals to be registered for emission.
   * @return {this} The current instance for method chaining.
   */
  emits(...signals: string[]): this {
    signals.forEach((signal) => {
      if (this.observedSignals.has(signal))
        throw new Error(
          `Detected signal loop for task ${this.name}. Signal name: ${signal}`,
        );
      this.signalsToEmitAfter.add(signal);
      this.attachSignal(signal);
    });
    return this;
  }

  /**
   * Configures the instance to emit specified signals when the task execution fails.
   * A failure is defined as anything that does not return a successful result.
   *
   * @param {...string} signals - The names of the signals to emit upon failure.
   * @return {this} Returns the current instance for chaining.
   */
  emitsOnFail(...signals: string[]): this {
    signals.forEach((signal) => {
      this.signalsToEmitOnFail.add(signal);
      this.attachSignal(signal);
    });
    return this;
  }

  /**
   * Attaches a signal to the current context and emits metadata if the register flag is set.
   *
   * @param {...string} signals - The names of the signals to attach.
   * @return {void} This method does not return a value.
   */
  attachSignal(...signals: string[]): Task {
    signals.forEach((signal) => {
      this.emitsSignals.add(signal);
      Cadenza.broker.registerEmittedSignal(signal);
      if (this.register) {
        const data: any = {
          signals: {
            emits: Array.from(this.emitsSignals),
            signalsToEmitAfter: Array.from(this.signalsToEmitAfter),
            signalsToEmitOnFail: Array.from(this.signalsToEmitOnFail),
            observed: Array.from(this.observedSignals),
          },
        };

        this.emitWithMetadata("meta.task.attached_signal", {
          data,
          filter: {
            name: this.name,
            version: this.version,
          },
        });
      }
    });

    return this;
  }

  /**
   * Unsubscribes the current instance from the specified signals.
   * This method removes the signals from the observedSignals set, unsubscribes
   * from the underlying broker, and emits metadata for the unsubscription if applicable.
   *
   * @param {string[]} signals - The list of signal names to unsubscribe from.
   * @return {this} Returns the current instance for method chaining.
   */
  unsubscribe(...signals: string[]): this {
    signals.forEach((signal) => {
      if (this.observedSignals.has(signal)) {
        Cadenza.broker.unsubscribe(signal, this as any);
        this.observedSignals.delete(signal);

        if (this.register) {
          signal = signal.split(":")[0];
          this.emitWithMetadata("meta.task.unsubscribed_signal", {
            filter: {
              signalName: signal,
              taskName: this.name,
              taskVersion: this.version,
            },
          });
        }
      }
    });
    return this;
  }

  /**
   * Unsubscribes from all currently observed signals and clears the list of observed signals.
   *
   * @return {this} The instance of the class to allow method chaining.
   */
  unsubscribeAll(): this {
    this.unsubscribe(...this.observedSignals);
    this.observedSignals.clear();
    return this;
  }

  /**
   * Detaches the specified signals from being emitted after execution and optionally emits metadata for each detached signal.
   *
   * @param {...string} signals - The list of signal names to be detached. Signals can be in the format "namespace:signalName".
   * @return {this} Returns the current instance of the object for method chaining.
   */
  detachSignals(...signals: string[]): this {
    signals.forEach((signal) => {
      this.signalsToEmitAfter.delete(signal);
      this.emitsSignals.delete(signal);
      if (this.register) {
        signal = signal.split(":")[0];
        this.emitWithMetadata("meta.task.detached_signal", {
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
   * Detaches all signals associated with the object by invoking the `detachSignals` method
   * and clearing the `signalsToEmitAfter` collection.
   *
   * @return {this} Returns the current instance to allow method chaining.
   */
  detachAllSignals(): this {
    this.detachSignals(...this.signalsToEmitAfter);
    this.signalsToEmitAfter.clear();
    return this;
  }

  handlesIntent(intent: string): this {
    this.intents.add(intent);
    return this;
  }

  /**
   * Maps over the signals in the `signalsToEmitAfter` set and applies a callback function to each signal.
   *
   * @param {function(string): void} callback - A function that is called with each signal
   *   in the `signalsToEmitAfter` set, providing the signal as an argument.
   * @return {Array<any>} An array containing the results of applying the callback
   *   function to each signal.
   */
  mapSignals(callback: (signal: string) => void) {
    return Array.from(this.signalsToEmitAfter).map(callback);
  }

  /**
   * Maps over the signals in `signalsToEmitOnFail` and applies the provided callback to each signal.
   *
   * @param {function(string): void} callback - A function that receives each signal as a string and performs an operation or transformation on it.
   * @return {Array} The array resulting from applying the callback to each signal in `signalsToEmitOnFail`.
   */
  mapOnFailSignals(callback: (signal: string) => void) {
    return Array.from(this.signalsToEmitOnFail).map(callback);
  }

  /**
   * Maps over the observed signals with the provided callback function.
   *
   * @param {function(string): void} callback - A function to execute on each signal in the observed signals array.
   * @return {Array} A new array containing the results of calling the callback function on each observed signal.
   */
  mapObservedSignals(callback: (signal: string) => void) {
    return Array.from(this.observedSignals).map(callback);
  }

  /**
   * Emits a collection of signals stored in the `signalsToEmitAfter` array.
   *
   * @param {GraphContext} context - The context object containing data or state to be passed to the emitted signals.
   * @return {void} This method does not return a value.
   */
  emitSignals(context: GraphContext): void {
    this.signalsToEmitAfter.forEach((signal) => {
      this.emit(signal, context.getFullContext());
    });
  }

  /**
   * Emits registered signals when an operation fails.
   *
   * @param {GraphContext} context - The context from which the full context is derived and passed to the signals being emitted.
   * @return {void} This method does not return any value.
   */
  emitOnFailSignals(context: GraphContext): void {
    this.signalsToEmitOnFail.forEach((signal) => {
      this.emit(signal, context.getFullContext());
    });
  }

  /**
   * Cleans up and destroys the task instance, detaching it from other tasks and
   * performing necessary cleanup operations.
   *
   * This method:
   * - Unsubscribes from all signals and events.
   * - Detaches all associated signal handlers.
   * - Removes the task from successor and predecessor task mappings.
   * - Clears all task relationships and marks the task as destroyed.
   * - Emits destruction metrics, if applicable.
   *
   * @return {void} No value is returned because the function performs clean-up operations.
   */
  public destroy(): void {
    this.unsubscribeAll();
    this.detachAllSignals();

    this.predecessorTasks.forEach((pred) => pred.nextTasks.delete(this));
    this.nextTasks.forEach((next) => next.predecessorTasks.delete(this));

    this.nextTasks.clear();
    this.predecessorTasks.clear();

    this.destroyed = true;

    if (this.register) {
      this.emitMetricsWithMetadata("meta.task.destroyed", {
        data: { deleted: true },
        filter: { name: this.name, version: this.version },
      });
    }

    // TODO: Delete task map instances
  }

  /**
   * Exports the current state of the object as a structured plain object.
   *
   * @return {AnyObject} An object containing the serialized properties of the current instance. The exported object includes various metadata, schema information, task attributes, and related tasks, such as:
   * - Name and description of the task.
   * - Layer index, uniqueness, meta, and signal-related flags.
   * - Event triggers and attached signals.
   * - Throttling, concurrency, timeout settings, and ephemeral flag.
   * - Task function as a string.
   * - Serialization of getter callbacks and schemas for input/output validation.
   * - Relationships such as next tasks, failure tasks, and predecessor tasks.
   */
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
      __previousTasks: Array.from(this.predecessorTasks).map((t) => t.name),
    };
  }

  /**
   * Returns an iterator for iterating over tasks associated with this instance.
   *
   * @return {TaskIterator} An iterator instance for tasks.
   */
  public getIterator(): TaskIterator {
    return new TaskIterator(this);
  }

  /**
   * Accepts a visitor object to perform operations on the current instance.
   *
   * @param {GraphVisitor} visitor - The visitor object implementing operations for this instance.
   * @return {void} This method does not return a value.
   */
  public accept(visitor: GraphVisitor): void {
    visitor.visitTask(this);
  }

  public log(): void {
    console.log(this.name);
  }
}
