import { v4 as uuid } from "uuid";
import Task, { TaskResult } from "../definition/Task";
import GraphContext from "../context/GraphContext";
import Graph from "../../interfaces/Graph";
import GraphVisitor from "../../interfaces/GraphVisitor";
import GraphNodeIterator from "../iterators/GraphNodeIterator";
import SignalEmitter from "../../interfaces/SignalEmitter";
import GraphLayer from "../../interfaces/GraphLayer";
import { AnyObject } from "../../types/global";
import { sleep } from "../../utils/promise";
import { formatTimestamp } from "../../utils/tools";
import { EmitOptions } from "../../engine/SignalBroker";

/**
 * Represents a node in a graph structure used for executing tasks.
 * A Node is a container for a task and its associated context, providing
 * methods for executing the task and managing its lifecycle.
 *
 * It extends the SignalEmitter class to emit and handle signals related to
 * the node's lifecycle, such as "meta.node.started" and "meta.node.completed".
 *
 * It also implements the Graph interface, allowing it to be used as a part of
 * a graph structure, such as a GraphLayer or GraphRoutine.
 *
 * @extends SignalEmitter
 * @implements Graph
 */
export default class GraphNode extends SignalEmitter implements Graph {
  id: string;
  routineExecId: string;
  executionTraceId: string;
  task: Task;
  context: GraphContext;
  layer: GraphLayer | undefined;
  divided: boolean = false;
  splitGroupId: string = "";
  processing: boolean = false;
  subgraphComplete: boolean = false;
  graphComplete: boolean = false;
  result: TaskResult = false;
  retryCount: number = 0;
  retryDelay: number = 0;
  retries: number = 0;
  previousNodes: GraphNode[] = [];
  nextNodes: GraphNode[] = [];
  executionTime: number = 0;
  executionStart: number = 0;
  failed: boolean = false;
  errored: boolean = false;
  destroyed: boolean = false;
  debug: boolean = false;
  verbose: boolean = false;

  constructor(
    task: Task,
    context: GraphContext,
    routineExecId: string,
    prevNodes: GraphNode[] = [],
    debug: boolean = false,
    verbose: boolean = false,
  ) {
    super(
      (task.isMeta && !debug) ||
        task.isSubMeta ||
        context?.getMetadata()?.__isSubMeta,
    );
    this.id = uuid();
    this.task = task;
    this.context = context;
    this.retryCount = task.retryCount;
    this.retryDelay = task.retryDelay;
    this.previousNodes = prevNodes;
    this.routineExecId = routineExecId;
    this.splitGroupId = routineExecId;
    this.debug = debug;
    this.verbose = verbose;
    const ctx = context.getMetadata();
    this.executionTraceId =
      ctx.__executionTraceId ?? ctx.__metadata?.__executionTraceId;

    if (!this.task || !this.task.validateInput) {
      console.log("task not found", this.task, this.context);
    }
  }

  setDebug(value: boolean) {
    this.debug = value;
  }

  public isUnique() {
    return this.task.isUnique;
  }

  public isMeta() {
    return this.task.isMeta;
  }

  public isProcessed() {
    return this.divided;
  }

  public isProcessing() {
    return this.processing;
  }

  public subgraphDone() {
    return this.subgraphComplete;
  }

  public graphDone() {
    return this.graphComplete;
  }

  /**
   * Compares the current GraphNode instance with another GraphNode to determine if they are considered equal.
   *
   * @param {GraphNode} node - The GraphNode object to compare with the current instance.
   * @return {boolean} Returns true if the nodes share the same task, context, and belong to the same graph; otherwise, false.
   */
  public isEqualTo(node: GraphNode) {
    return (
      this.sharesTaskWith(node) &&
      this.sharesContextWith(node) &&
      this.isPartOfSameGraph(node)
    );
  }

  /**
   * Determines if the given node is part of the same graph as the current node.
   *
   * @param {GraphNode} node - The node to compare with the current node.
   * @return {boolean} Returns true if the provided node is part of the same graph
   *                   (i.e., has the same routineExecId), otherwise false.
   */
  public isPartOfSameGraph(node: GraphNode) {
    return this.routineExecId === node.routineExecId;
  }

  /**
   * Determines whether the current instance shares a task with the provided node.
   *
   * @param {GraphNode} node - The graph node to compare with the current instance.
   * @return {boolean} Returns true if the task names of both nodes match, otherwise false.
   */
  public sharesTaskWith(node: GraphNode) {
    return this.task.name === node.task.name;
  }

  /**
   * Determines whether the current node shares the same context as the specified node.
   *
   * @param {GraphNode} node - The graph node to compare with the current node's context.
   * @return {boolean} True if both nodes share the same context; otherwise, false.
   */
  public sharesContextWith(node: GraphNode) {
    return this.context.id === node.context.id;
  }

  public getLayerIndex() {
    return this.task.layerIndex;
  }

  public getConcurrency() {
    return this.task.concurrency;
  }

  /**
   * Retrieves the tag associated with the current task and context.
   *
   * @return {string} The tag retrieved from the task within the given context.
   */
  public getTag() {
    return this.task.getTag(this.context);
  }

  /**
   * Schedules the current node/task on the specified graph layer if applicable.
   *
   * This method assesses whether the current node/task should be scheduled
   * on the given graph layer. It ensures that tasks are only scheduled
   * under certain conditions, such as checking if the task shares
   * execution contexts or dependencies with other nodes, and handles
   * various metadata emissions and context updates during the scheduling process.
   *
   * @param {GraphLayer} layer - The graph layer on which the current task should be scheduled.
   * @returns {void} Does not return a value.
   */
  public scheduleOn(layer: GraphLayer) {
    let shouldSchedule = true;
    const nodes = layer.getNodesByRoutineExecId(this.routineExecId);
    for (const node of nodes) {
      if (node.isEqualTo(this)) {
        shouldSchedule = false;
        break;
      }

      if (node.sharesTaskWith(this) && node.isUnique()) {
        node.consume(this);
        shouldSchedule = false;
        break;
      }
    }

    if (shouldSchedule) {
      this.layer = layer;
      layer.add(this);

      const context = this.context.getFullContext();

      let signalEmissionId = context.__signalEmissionId ?? null;
      delete context.__signalEmissionId;

      if (
        context.__signalEmission?.consumed === false &&
        (!this.isMeta() || this.debug)
      ) {
        signalEmissionId = context.__signalEmission.uuid;
        context.__signalEmission.consumed = true;
        context.__signalEmission.consumedBy = this.id;
      }

      const prevNodesIds = this.previousNodes.map((node) => node.id);

      if (context.__previousTaskExecutionId) {
        prevNodesIds.push(context.__previousTaskExecutionId);
        context.__previousTaskExecutionId = null;
      }

      const scheduledAt = Date.now();
      this.emitMetricsWithMetadata(
        "meta.node.scheduled",
        {
          data: {
            uuid: this.id,
            routineExecutionId: this.routineExecId,
            executionTraceId: this.executionTraceId,
            context: this.context.getContext(),
            metaContext: this.context.getMetadata(),
            taskName: this.task.name,
            taskVersion: this.task.version,
            isMeta: this.isMeta(),
            isScheduled: true,
            splitGroupId: this.splitGroupId,
            signalEmissionId,
            previousExecutionIds: {
              ids: prevNodesIds,
            },
            created: formatTimestamp(scheduledAt),
          },
        },
        { squash: true, squashId: this.id },
      );

      this.previousNodes.forEach((node) => {
        this.emitMetricsWithMetadata(
          "meta.node.mapped",
          {
            data: {
              taskExecutionId: this.id,
              previousTaskExecutionId: node.id,
            },
            filter: {
              taskName: this.task.name,
              taskVersion: this.task.version,
              predecessorTaskName: node.task.name,
              predecessorTaskVersion: node.task.version,
            },
          },
          { schedule: true, delayMs: 1000 },
        );
      });

      if (!this.silent && context.__previousTaskExecutionId) {
        this.emitMetricsWithMetadata(
          "meta.node.detected_previous_task_execution",
          {
            data: {
              taskExecutionId: this.id,
              previousTaskExecutionId: context.__previousTaskExecutionId,
            },
            filter: {
              taskName: this.task.name,
              taskVersion: this.task.version,
              predecessorTaskName: context.__localTaskName,
              predecessorTaskVersion: context.__localTaskVersion,
            },
          },
          { schedule: true, delayMs: 1000 },
        );
        context.__previousTaskExecutionId = null;
      }
    }
  }

  /**
   * Starts the execution process by initializing the execution start timestamp,
   * emitting relevant metadata, and logging debug information if applicable.
   *
   * The method performs the following actions:
   * 1. Sets the execution start timestamp if it's not already initialized.
   * 2. Emits metrics with metadata about the routine execution starting, including additional data if there are no previous nodes.
   * 3. Optionally logs debug or verbose information based on the current settings.
   * 4. Emits additional metrics to indicate that the execution has started.
   *
   * @return {number} The timestamp indicating when the execution started.
   */
  public start() {
    if (this.executionStart === 0) {
      this.executionStart = Date.now();
    }

    if (this.previousNodes.length === 0) {
      this.emitMetricsWithMetadata(
        "meta.node.started_routine_execution",
        {
          data: {
            isRunning: true,
            started: formatTimestamp(this.executionStart),
          },
          filter: { uuid: this.routineExecId },
        },
        { squash: true, squashId: this.routineExecId },
      );
    }

    if (
      (this.debug &&
        !this.task.isSubMeta &&
        !this.context.getMetadata().__isSubMeta) ||
      this.verbose
    ) {
      this.log();
    }

    this.emitMetricsWithMetadata(
      "meta.node.started",
      {
        data: {
          isRunning: true,
          started: formatTimestamp(this.executionStart),
        },
        filter: { uuid: this.id },
      },
      { squash: true, squashId: this.id },
    );

    return this.executionStart;
  }

  /**
   * Marks the end of an execution process, performs necessary cleanup, emits
   * metrics with associated metadata, and signals the completion of execution.
   * Also handles specific cases when the graph completes.
   *
   * @return {number} The timestamp corresponding to the end of execution. If execution
   * was not started, it returns 0.
   */
  public end() {
    if (this.executionStart === 0) {
      return 0;
    }

    this.processing = false;
    const end = Date.now();
    this.executionTime = end - this.executionStart;

    const context = this.context.getFullContext();

    if (this.errored || this.failed) {
      this.emitMetricsWithMetadata("meta.node.errored", {
        data: {
          taskName: this.task.name,
          taskVersion: this.task.version,
          nodeId: this.id,
          errorMessage: context.__error,
        },
      });
    }

    this.emitMetricsWithMetadata(
      "meta.node.ended",
      {
        data: {
          isRunning: false,
          isComplete: true,
          resultContext: this.context.getContext(),
          metaResultContext: this.context.getMetadata(),
          errored: this.errored,
          failed: this.failed,
          errorMessage: context.__error,
          progress: 1.0,
          ended: formatTimestamp(end),
        },
        filter: { uuid: this.id },
      },
      { squash: true, squashId: this.id, delayMs: 0 },
    );

    if (this.graphDone()) {
      const context = this.context.getFullContext();
      if (context.__isDeputy)
        this.emitWithMetadata(
          `meta.node.graph_completed:${this.routineExecId}`,
          context,
        );

      // TODO Reminder, Service registry should be listening to this event, (updateSelf)
      this.emitMetricsWithMetadata(
        "meta.node.ended_routine_execution",
        {
          data: {
            isRunning: false,
            isComplete: true,
            resultContext: this.context.getContext(),
            metaResultContext: this.context.getMetadata(),
            progress: 1.0,
            ended: formatTimestamp(end),
          },
          filter: { uuid: this.routineExecId },
        },
        { squash: true, squashId: this.routineExecId, delayMs: 0 },
      );
    }

    return end;
  }

  /**
   * Executes the main logic of the task, including input validation, processing, and post-processing.
   * Handles both synchronous and asynchronous workflows.
   *
   * @return {Array|Promise|undefined} Returns the next nodes to process if available.
   * If asynchronous processing is required, it returns a Promise that resolves to the next nodes.
   * Returns undefined in case of an error during input validation or preconditions that prevent processing.
   */
  public execute() {
    if (!this.divided && !this.processing) {
      this.processing = true;

      const inputValidation = this.task.validateInput(
        this.isMeta() ? this.context.getMetadata() : this.context.getContext(),
      );
      if (inputValidation !== true) {
        this.onError(inputValidation.__validationErrors);
        this.postProcess();
        return this.nextNodes;
      }

      this.result = this.work();

      if (this.result instanceof Promise) {
        return this.executeAsync();
      }

      const nextNodes = this.postProcess();
      if (nextNodes instanceof Promise) {
        return nextNodes;
      }

      this.nextNodes = nextNodes;
    }

    return this.nextNodes;
  }

  /**
   * Executes an asynchronous workflow that processes a result and retries on errors.
   * The method handles different result states, checks for error properties, and invokes
   * error handling when necessary.
   *
   * @return {Promise<void>} A promise that resolves when the operation completes successfully,
   * or rejects if an unhandled error occurs.
   */
  async workAsync() {
    try {
      this.result = await this.result;
      if (
        typeof this.result === "object" &&
        (this.result.hasOwnProperty("errored") ||
          this.result.hasOwnProperty("failed"))
      ) {
        const result = await this.retryAsync((this.result as any).__error);
        if (
          typeof result === "object" &&
          (result.hasOwnProperty("errored") || result.hasOwnProperty("failed"))
        ) {
          this.onError(result.__error);
        }
      }
    } catch (e: unknown) {
      const result = await this.retryAsync(e);
      if (result === e) {
        this.onError(e);
      }
    }
  }

  /**
   * Executes an asynchronous operation, processes the result, and determines the next nodes to execute.
   * This method will manage asynchronous work, handle post-processing of results, and ensure proper handling of both synchronous and asynchronous next node configurations.
   *
   * @return {Promise<any>} A promise resolving to the next nodes to be executed. Can be the result of post-processing or a directly resolved next nodes object.
   */
  async executeAsync() {
    await this.workAsync();
    const nextNodes = this.postProcess();
    if (nextNodes instanceof Promise) {
      return nextNodes;
    }
    this.nextNodes = nextNodes;
    return this.nextNodes;
  }

  /**
   * Executes the task associated with the current instance, using the given context,
   * progress callback, and metadata. If the task fails or an error occurs, it attempts
   * to retry the execution. If the retry is not successful, it propagates the error and
   * returns the result.
   *
   * @return {TaskResult | Promise<TaskResult>} The result of the task execution, or a
   * promise that resolves to the task result. This includes handling for retries on
   * failure and error propagation.
   */
  work(): TaskResult | Promise<TaskResult> {
    try {
      const result = this.task.execute(
        this.context,
        this.emitWithMetadata.bind(this),
        this.onProgress.bind(this),
        { nodeId: this.id, routineExecId: this.routineExecId },
      );

      if ((result as any)?.errored || (result as any)?.failed) {
        return this.retry(result);
      }

      return result;
    } catch (e: unknown) {
      const result = this.retry(e);
      return result.then((result) => {
        if (result !== e) {
          return result;
        }

        this.onError(e);
        return this.result;
      });
    }
  }

  /**
   * Emits a signal along with its associated metadata. The metadata includes
   * task-specific information such as task name, version, execution ID, and
   * additional context metadata like routine execution ID and execution trace ID.
   * This method is designed to enrich emitted signals with relevant details
   * before broadcasting them.
   *
   * @param {string} signal - The name of the signal to be emitted.
   * @param {AnyObject} data - The data object to be sent along with the signal. Metadata
   * will be injected into this object before being emitted.
   * @param options
   * @return {void} No return value.
   */
  emitWithMetadata(
    signal: string,
    data: AnyObject,
    options: EmitOptions = {},
  ): void {
    if (!this.task?.isHidden) {
      data.__signalEmission = {
        fullSignalName: signal,
        taskName: this.task.name,
        taskVersion: this.task.version,
        taskExecutionId: this.id,
        routineExecutionId: this.routineExecId,
        executionTraceId: this.executionTraceId,
        isMetric: false,
      };
      data.__metadata = {
        ...data.__metadata,
        __routineExecId: this.routineExecId,
        __executionTraceId: this.executionTraceId,
      };
    }

    this.emit(signal, data, options);

    if (!this.task.emitsSignals.has(signal)) {
      this.task.emitsSignals.add(signal);
    }
  }

  /**
   * Emits metrics with additional metadata describing the task execution and context.
   *
   * @param {string} signal - The signal name being emitted.
   * @param {AnyObject} data - The data associated with the signal emission, enriched with metadata.
   * @param options
   * @return {void} Emits the signal with enriched data and does not return a value.
   */
  emitMetricsWithMetadata(
    signal: string,
    data: AnyObject,
    options: EmitOptions = {},
  ): void {
    if (!this.task?.isHidden) {
      data.__signalEmission = {
        taskName: this.task.name,
        taskVersion: this.task.version,
        taskExecutionId: this.id,
        routineExecutionId: this.routineExecId,
        executionTraceId: this.executionTraceId,
        isMetric: true,
      };
      data.__metadata = {
        ...data.__metadata,
        __routineExecId: this.routineExecId,
        __executionTraceId: this.executionTraceId,
      };
    }

    this.emitMetrics(signal, data, options);

    if (!this.task.emitsSignals.has(signal)) {
      this.task.emitsSignals.add(signal);
    }
  }

  /**
   * Updates the progress of a task and emits metrics with associated metadata.
   *
   * @param {number} progress - A number representing the progress value, which will be clamped between 0 and 1.
   * @return {void} This method does not return a value.
   */
  onProgress(progress: number) {
    progress = Math.min(Math.max(0, progress), 1);

    this.emitMetricsWithMetadata(
      "meta.node.progress",
      {
        data: {
          progress,
        },
        filter: {
          uuid: this.id,
        },
      },
      { debounce: true },
    );

    this.emitMetricsWithMetadata(
      `meta.node.routine_execution_progress:${this.routineExecId}`,
      {
        data: {
          progress:
            (progress * this.task.progressWeight) /
            (this.layer?.getIdenticalNodes(this).length ?? 1),
        },
        filter: {
          uuid: this.routineExecId,
        },
      },
      { debounce: true },
    );
  }

  /**
   * Processes the result of the current operation, validates it, and determines the next set of nodes.
   *
   * This method ensures that results of certain types such as strings or arrays
   * are flagged as errors. It divides the current context into subsequent nodes
   * for further processing. If the division returns a promise, it delegates the
   * processing to `postProcessAsync`. For synchronous division, it sets the
   * `nextNodes` and finalizes the operation.
   *
   * @return {(Array|undefined)} Returns an array of next nodes for further processing,
   * or undefined if no further processing is required.
   */
  postProcess() {
    if (typeof this.result === "string") {
      this.onError(
        `Returning strings is not allowed. Returned: ${this.result}`,
      );
    }

    if (Array.isArray(this.result)) {
      this.onError(`Returning arrays is not allowed. Returned: ${this.result}`);
    }

    const nextNodes = this.divide();

    if (nextNodes instanceof Promise) {
      return this.postProcessAsync(nextNodes);
    }

    this.nextNodes = nextNodes;
    this.finalize();
    return this.nextNodes;
  }

  /**
   * Asynchronously processes and finalizes the provided graph nodes.
   *
   * @param {Promise<GraphNode[]>} nextNodes A promise that resolves to an array of graph nodes to be processed.
   * @return {Promise<GraphNode[]>} A promise that resolves to the processed array of graph nodes.
   */
  async postProcessAsync(nextNodes: Promise<GraphNode[]>) {
    this.nextNodes = await nextNodes;
    this.finalize();
    return this.nextNodes;
  }

  /**
   * Finalizes the current task execution by determining if the task is complete, handles any errors or failures,
   * emits relevant signals based on the task outcomes, and ensures proper end of the task lifecycle.
   *
   * @return {void} Does not return a value.
   */
  finalize() {
    if (this.nextNodes.length === 0) {
      this.completeSubgraph();
    }

    if (this.errored || this.failed) {
      this.task.mapOnFailSignals((signal: string) =>
        this.emitWithMetadata(signal, this.context.getFullContext()),
      );
    } else if (this.result !== undefined && this.result !== false) {
      this.task.mapSignals((signal: string) =>
        this.emitWithMetadata(signal, this.context.getFullContext()),
      );
    }

    this.end();
  }

  /**
   * Handles an error event, processes the error, and updates the state accordingly.
   *
   * @param {unknown} error - The error object or message that occurred.
   * @param {AnyObject} [errorData={}] - Additional error data to include in the result.
   * @return {void} This method does not return any value.
   */
  onError(error: unknown, errorData: AnyObject = {}) {
    this.result = {
      ...this.context.getFullContext(),
      __error: `Node error: ${error}`,
      __retries: this.retries,
      error: `Node error: ${error}`,
      errored: true,
      returnedValue: this.result,
      ...errorData,
    };
    this.migrate(this.result);
    this.errored = true;
  }

  /**
   * Retries a task based on the defined retry count and delay time. If the retry count is 0, it immediately resolves with the provided previous result.
   *
   * @param {any} [prevResult] - The result from a previous attempt, if any, to return when no retries are performed.
   * @return {Promise<TaskResult>} - A promise that resolves with the result of the retried task or the previous result if no retries occur.
   */
  async retry(prevResult?: any): Promise<TaskResult> {
    if (this.retryCount === 0) {
      return prevResult;
    }

    await this.delayRetry();
    return this.work();
  }

  /**
   * Retries an asynchronous operation and returns its result.
   * If the retry count is zero, the method immediately returns the provided previous result.
   *
   * @param {any} [prevResult] - The optional result from a previous operation attempt, if applicable.
   * @return {Promise<TaskResult>} A promise that resolves to the result of the retried operation.
   */
  async retryAsync(prevResult?: any): Promise<TaskResult> {
    if (this.retryCount === 0) {
      return prevResult;
    }

    await this.delayRetry();
    this.result = this.work();
    return this.workAsync();
  }

  async delayRetry() {
    this.retryCount--;
    this.retries++;
    await sleep(this.retryDelay);
    this.retryDelay *= this.task.retryDelayFactor;
    if (
      this.task.retryDelayMax > 0 &&
      this.retryDelay > this.task.retryDelayMax
    ) {
      this.retryDelay = this.task.retryDelayMax;
    }
  }

  /**
   * Processes the result of a task by generating new nodes based on the task output.
   * The method handles synchronous and asynchronous generators, validates task output,
   * and creates new nodes accordingly. If errors occur, the method attempts to handle them
   * by generating alternative task nodes.
   *
   * @return {GraphNode[] | Promise<GraphNode[]>} Returns an array of generated GraphNode objects
   * (synchronously or wrapped in a Promise) based on the task result, or propagates errors if validation fails.
   */
  divide(): GraphNode[] | Promise<GraphNode[]> {
    const newNodes: GraphNode[] = [];

    if (
      (this.result as Generator)?.next &&
      typeof (this.result as Generator).next === "function"
    ) {
      const generator = this.result as Generator;
      let current = generator.next();
      if (current instanceof Promise) {
        return this.divideAsync(current);
      }

      while (!current.done && current.value !== undefined) {
        const outputValidation = this.task.validateOutput(current.value as any);
        if (outputValidation !== true) {
          this.onError(outputValidation.__validationErrors);
          break;
        } else {
          newNodes.push(...this.generateNewNodes(current.value));
          current = generator.next();
        }
      }
    } else if (this.result !== undefined && !this.errored) {
      newNodes.push(...this.generateNewNodes(this.result));

      if (typeof this.result !== "boolean") {
        const outputValidation = this.task.validateOutput(this.result as any);
        if (outputValidation !== true) {
          this.onError(outputValidation.__validationErrors);
        }

        this.divided = true;
        this.migrate({
          ...this.result,
          ...this.context.getMetadata(),
          __nextNodes: newNodes.map((n) => n.id),
          __retries: this.retries,
        });

        return newNodes;
      }
    }

    this.divided = true;
    this.migrate({
      ...this.context.getFullContext(),
      __nextNodes: newNodes.map((n) => n.id),
      __retries: this.retries,
    });

    return newNodes;
  }

  /**
   * Processes an asynchronous iterator result, validates its output, and generates new graph nodes accordingly.
   * Additionally, continues to process and validate results from an asynchronous generator.
   *
   * @param {Promise<IteratorResult<any>>} current - A promise resolving to the current step result from an asynchronous iterator.
   * @return {Promise<GraphNode[]>} A promise resolving to an array of generated GraphNode objects based on validated outputs.
   */
  async divideAsync(
    current: Promise<IteratorResult<any>>,
  ): Promise<GraphNode[]> {
    const nextNodes: GraphNode[] = [];
    const _current = await current;

    const outputValidation = this.task.validateOutput(_current.value as any);
    if (outputValidation !== true) {
      this.onError(outputValidation.__validationErrors);
      return nextNodes;
    } else {
      nextNodes.push(...this.generateNewNodes(_current.value));
    }

    for await (const result of this.result as AsyncGenerator<any>) {
      const outputValidation = this.task.validateOutput(result);
      if (outputValidation !== true) {
        this.onError(outputValidation.__validationErrors);
        return [];
      } else {
        nextNodes.push(...this.generateNewNodes(result));
      }
    }

    this.divided = true;

    return nextNodes;
  }

  /**
   * Generates new nodes based on the provided result and task configuration.
   *
   * @param {any} result - The result of the previous operation, which determines the configuration and context for new nodes. It can be a boolean or an object containing details like failure, errors, or metadata.
   * @return {GraphNode[]} An array of newly generated graph nodes configured based on the task and context.
   */
  generateNewNodes(result: any) {
    const groupId = uuid();
    const newNodes = [];
    if (result && typeof result !== "boolean") {
      this.failed =
        (result.failed !== undefined && result.failed) ||
        result.error !== undefined;

      if (!this.failed) {
        newNodes.push(
          ...(this.task.mapNext((t: Task) => {
            const context = t.isUnique
              ? {
                  joinedContexts: [
                    { ...result, taskName: this.task.name, __nodeId: this.id },
                  ],
                  ...this.context.getMetadata(),
                }
              : { ...result, ...this.context.getMetadata() };
            return this.clone()
              .split(groupId)
              .differentiate(t)
              .migrate(context);
          }) as GraphNode[]),
        );
      }
    } else {
      const shouldContinue = result;
      if (shouldContinue) {
        newNodes.push(
          ...(this.task.mapNext((t: Task) => {
            const newNode = this.clone().split(groupId).differentiate(t);
            if (t.isUnique) {
              newNode.migrate({
                joinedContexts: [
                  {
                    ...this.context.getContext(),
                    taskName: this.task.name,
                    __nodeId: this.id,
                  },
                ],
                ...this.context.getMetadata(),
              });
            }

            return newNode;
          }) as GraphNode[]),
        );
      }
    }

    return newNodes;
  }

  /**
   * Executes the differentiation process based on a given task and updates the instance properties accordingly.
   *
   * @param {Task} task - The task object containing information such as retry count, retry delay, and metadata status.
   * @return {GraphNode} The updated instance after processing the task.
   */
  differentiate(task: Task): GraphNode {
    this.task = task;
    this.retryCount = task.retryCount;
    this.retryDelay = task.retryDelay;
    this.silent =
      (task.isMeta && !this.debug) ||
      task.isSubMeta ||
      this.context?.getMetadata()?.__isSubMeta;
    return this;
  }

  /**
   * Migrates the current instance to a new context and returns the updated instance.
   *
   * @param {any} ctx - The context data to be used for migration.
   * @return {GraphNode} The updated instance after migration.
   */
  migrate(ctx: any): GraphNode {
    this.context = new GraphContext(ctx);
    return this;
  }

  /**
   * Splits the current node into a new group identified by the provided ID.
   *
   * @param {string} id - The unique identifier for the new split group.
   * @return {GraphNode} The current instance of the GraphNode with the updated split group ID.
   */
  split(id: string): GraphNode {
    this.splitGroupId = id;
    return this;
  }

  /**
   * Creates a new instance of the GraphNode with the current node's properties.
   * This method allows for duplicating the existing graph node.
   *
   * @return {GraphNode} A new instance of GraphNode that is a copy of the current node.
   */
  public clone(): GraphNode {
    return new GraphNode(
      this.task,
      this.context,
      this.routineExecId,
      [this],
      this.debug,
      this.verbose,
    );
  }

  /**
   * Consumes the given graph node by combining contexts, merging previous nodes,
   * and performing associated operations on the provided node.
   *
   * @param {GraphNode} node - The graph node to be consumed.
   * @return {void} This method does not return a value.
   */
  public consume(node: GraphNode) {
    this.context = this.context.combine(node.context);
    this.previousNodes = this.previousNodes.concat(node.previousNodes);
    node.completeSubgraph();
    node.changeIdentity(this.id);
    node.destroy();
  }

  /**
   * Changes the identity of the current instance by updating the `id` property.
   *
   * @param {string} id - The new identity value to be assigned.
   * @return {void} Does not return a value.
   */
  changeIdentity(id: string) {
    this.id = id;
  }

  /**
   * Completes the subgraph for the current node and recursively for its previous nodes
   * once all next nodes have their subgraphs marked as done. If there are no previous nodes,
   * it completes the entire graph.
   *
   * @return {void} Does not return a value.
   */
  completeSubgraph() {
    for (const node of this.nextNodes) {
      if (!node.subgraphDone()) {
        return;
      }
    }

    this.subgraphComplete = true;

    if (this.previousNodes.length === 0) {
      this.completeGraph();
      return;
    }

    this.previousNodes.forEach((n) => n.completeSubgraph());
  }

  /**
   * Completes the current graph by setting a flag indicating the graph has been completed
   * and recursively completes all subsequent nodes in the graph.
   *
   * @return {void} Does not return a value.
   */
  completeGraph() {
    this.graphComplete = true;
    this.nextNodes.forEach((n) => n.completeGraph());
  }

  /**
   * Destroys the current instance by releasing resources, breaking references,
   * and resetting properties to ensure proper cleanup.
   *
   * @return {void} No return value.
   */
  public destroy() {
    // @ts-ignore
    this.context = null;
    // @ts-ignore
    this.task = null;
    this.nextNodes = [];
    this.previousNodes.forEach((n) =>
      n.nextNodes.splice(n.nextNodes.indexOf(this), 1),
    );
    this.previousNodes = [];
    this.result = undefined;
    this.layer = undefined;
    this.destroyed = true;
  }

  /**
   * Retrieves an iterator for traversing through the graph nodes.
   *
   * @return {GraphNodeIterator} An iterator instance specific to this graph node.
   */
  public getIterator() {
    return new GraphNodeIterator(this);
  }

  /**
   * Applies a callback function to each node in the `nextNodes` array and returns
   * the resulting array from the map operation.
   *
   * @param {function} callback - A function to execute on each `GraphNode` in the `nextNodes` array.
   * The function receives a `GraphNode` as its argument.
   * @return {Array} The resulting array after applying the callback function to each node in `nextNodes`.
   */
  public mapNext(callback: (node: GraphNode) => any) {
    return this.nextNodes.map(callback);
  }

  /**
   * Accepts a visitor object and calls its visitNode method with the current instance.
   *
   * @param {GraphVisitor} visitor - The visitor instance implementing the GraphVisitor interface.
   * @return {void} This method does not return a value.
   */
  public accept(visitor: GraphVisitor) {
    visitor.visitNode(this);
  }

  /**
   * Exports the current object's state and returns it in a serialized format.
   * The exported object contains metadata, task details, context information, execution times, node relationships, routine execution status, and other state information.
   *
   * @return {Object} An object representing the current state.
   */
  public export() {
    return {
      __id: this.id,
      __task: this.task.export(),
      __context: this.context.export(),
      __result: this.result,
      __executionTime: this.executionTime,
      __executionStart: this.executionStart,
      __executionEnd: this.executionStart + this.executionTime,
      __nextNodes: this.nextNodes.map((node) => node.id),
      __previousNodes: this.previousNodes.map((node) => node.id),
      __routineExecId: this.routineExecId,
      __isProcessing: this.processing,
      __isMeta: this.isMeta(),
      __graphComplete: this.graphComplete,
      __failed: this.failed,
      __errored: this.errored,
      __isUnique: this.isUnique(),
      __splitGroupId: this.splitGroupId,
      __tag: this.getTag(),
    };
  }

  lightExport() {
    return {
      __id: this.id,
      __task: {
        __name: this.task.name,
        __version: this.task.version,
      },
      __context: this.context.export(),
      __executionTime: this.executionTime,
      __executionStart: this.executionStart,
      __nextNodes: this.nextNodes.map((node) => node.id),
      __previousNodes: this.previousNodes.map((node) => node.id),
      __routineExecId: this.routineExecId,
      __isProcessing: this.processing,
      __graphComplete: this.graphComplete,
      __isMeta: this.isMeta(),
      __failed: this.failed,
      __errored: this.errored,
      __isUnique: this.isUnique(),
      __splitGroupId: this.splitGroupId,
      __tag: this.getTag(),
    };
  }

  public log() {
    try {
      console.log(
        "Node EXECUTION:",
        this.task.name,
        JSON.stringify(this.context.getFullContext()),
      );
    } catch (e) {
      console.log("Node EXECUTION:", this.task.name, "[circular context]");
    }
  }
}
