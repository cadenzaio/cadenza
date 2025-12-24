import { v4 as uuid } from "uuid";
import Task from "../graph/definition/Task";
import GraphRun from "./GraphRun";
import GraphNode from "../graph/execution/GraphNode";
import GraphRunStrategy from "../interfaces/GraphRunStrategy";
import { AnyObject } from "../types/global";
import GraphRoutine from "../graph/definition/GraphRoutine";
import SignalEmitter from "../interfaces/SignalEmitter";
import Cadenza from "../Cadenza";
import GraphContext from "../graph/context/GraphContext";
import { formatTimestamp } from "../utils/tools";

/**
 * Represents a runner for managing and executing tasks or routines within a graph.
 * The `GraphRunner` extends `SignalEmitter` to include signal-based event-driven mechanisms.
 */
export default class GraphRunner extends SignalEmitter {
  currentRun: GraphRun;
  debug: boolean = false;
  verbose: boolean = false;
  isRunning: boolean = false;
  readonly isMeta: boolean = false;

  strategy: GraphRunStrategy;

  /**
   * Constructs a runner.
   * @param isMeta Meta flag (default false).
   * @edge Creates 'Start run' meta-task chained to registry gets.
   */
  constructor(isMeta: boolean = false) {
    super(isMeta);
    this.isMeta = isMeta;
    this.strategy = Cadenza.runStrategy.PARALLEL;
    this.currentRun = new GraphRun(this.strategy);
  }

  /**
   * Adds tasks or routines to the current execution pipeline. Supports both individual tasks,
   * routines, or arrays of tasks and routines. Handles metadata and execution context management.
   *
   * @param {Task|GraphRoutine|(Task|GraphRoutine)[]} tasks - The task(s) or routine(s) to be added.
   * It can be a single task, a single routine, or an array of tasks and routines.
   * @param {AnyObject} [context={}] - Optional context object to provide execution trace and metadata.
   * Used to propagate information across task or routine executions.
   * @return {void} - This method does not return a value.
   */
  addTasks(
    tasks: Task | GraphRoutine | (Task | GraphRoutine)[],
    context: AnyObject = {},
  ): void {
    let _tasks = Array.isArray(tasks) ? tasks : [tasks];
    if (_tasks.length === 0) {
      console.warn("No tasks/routines to add.");
      return;
    }

    let routineName = _tasks.map((t) => t.name).join(" | ");
    let routineVersion = null;
    let isMeta = _tasks.every((t) => t.isMeta);

    const allTasks = _tasks.flatMap((t) => {
      if (t instanceof GraphRoutine) {
        routineName = t.name;
        routineVersion = t.version;
        isMeta = t.isMeta;
        const routineTasks: Task[] = [];
        t.forEachTask((task: Task) => routineTasks.push(task));
        return routineTasks;
      }
      return t;
    });

    const isSubMeta =
      allTasks.some((t) => t.isSubMeta) || !!context.__isSubMeta;
    context.__isSubMeta = isSubMeta;

    const isNewTrace =
      !context.__routineExecId &&
      !context.__metadata?.__executionTraceId &&
      !context.__executionTraceId;

    const executionTraceId =
      context.__metadata?.__executionTraceId ??
      context.__executionTraceId ??
      uuid();

    context.__executionTraceId = executionTraceId;

    const routineExecId = context.__routineExecId ?? uuid();
    context.__routineExecId = routineExecId;

    const ctx = new GraphContext(context || {});

    if (!isSubMeta) {
      if (isNewTrace) {
        this.emitMetrics("meta.runner.new_trace", {
          data: {
            uuid: executionTraceId,
            issuer_type: "service", // TODO: Add issuer type
            issuer_id:
              context.__metadata?.__issuerId ?? context.__issuerId ?? null,
            issued_at: formatTimestamp(Date.now()),
            intent: context.__metadata?.__intent ?? context.__intent ?? null,
            context: ctx.getContext(),
            metaContext: ctx.getMetadata(),
            is_meta: isMeta,
          },
          __metadata: {
            __executionTraceId: executionTraceId,
          },
        });
      }

      this.emitMetrics("meta.runner.added_tasks", {
        data: {
          uuid: routineExecId,
          name: routineName,
          routineVersion,
          isMeta,
          executionTraceId,
          context: ctx.getContext(),
          metaContext: ctx.getMetadata(),
          previousRoutineExecution:
            context.__localRoutineExecId ??
            context.__metadata?.__routineExecId ??
            null,
          created: formatTimestamp(Date.now()),
        },
        __metadata: {
          __executionTraceId: executionTraceId,
        },
      });
    }

    allTasks.forEach((task) =>
      this.currentRun.addNode(
        new GraphNode(task, ctx, routineExecId, [], this.debug, this.verbose),
      ),
    );
  }

  /**
   * Executes the provided tasks or routines. Maintains the execution state
   * and handles synchronous or asynchronous processing.
   *
   * @param {Task|GraphRoutine|(Task|GraphRoutine)[]} [tasks] - A single task, a single routine, or an array of tasks or routines to execute. Optional.
   * @param {AnyObject} [context] - An optional context object to be used during task execution.
   * @return {GraphRun|Promise<GraphRun>} - Returns a `GraphRun` instance if the execution is synchronous, or a `Promise` resolving to a `GraphRun` for asynchronous execution.
   */
  public run(
    tasks?: Task | GraphRoutine | (Task | GraphRoutine)[],
    context?: AnyObject,
  ): GraphRun | Promise<GraphRun> {
    if (tasks) {
      this.addTasks(tasks, context ?? {});
    }

    if (this.isRunning) {
      return this.currentRun;
    }

    if (this.currentRun) {
      this.isRunning = true;
      const runResult = this.currentRun.run();

      if (runResult instanceof Promise) {
        return this.runAsync(runResult);
      }
    }

    return this.reset();
  }

  /**
   * Executes the provided asynchronous operation and resets the state afterwards.
   *
   * @param {Promise<void>} run - A promise representing the asynchronous operation to execute.
   * @return {Promise<GraphRun>} A promise that resolves to the result of the reset operation after the asynchronous operation completes.
   */
  async runAsync(run: Promise<void>): Promise<GraphRun> {
    await run;
    return this.reset();
  }

  /**
   * Resets the current state of the graph, creating a new GraphRun instance
   * and returning the previous run instance.
   * If the debug mode is not enabled, it will destroy the existing resources.
   *
   * @return {GraphRun} The last GraphRun instance before the reset.
   */
  reset(): GraphRun {
    this.isRunning = false;

    const lastRun = this.currentRun;

    if (!this.debug) {
      this.destroy();
    }

    this.currentRun = new GraphRun(this.strategy);

    return lastRun;
  }

  public setDebug(value: boolean): void {
    this.debug = value;
  }

  public setVerbose(value: boolean): void {
    this.verbose = value;
  }

  public destroy(): void {
    this.currentRun.destroy();
  }

  /**
   * Sets the strategy to be used for running the graph and initializes
   * the current run with the provided strategy if no process is currently running.
   *
   * @param {GraphRunStrategy} strategy - The strategy to use for running the graph.
   * @return {void}
   */
  public setStrategy(strategy: GraphRunStrategy): void {
    this.strategy = strategy;
    if (!this.isRunning) {
      this.currentRun = new GraphRun(this.strategy);
    }
  }
}
