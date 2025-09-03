import { v4 as uuid } from "uuid";
import Task from "../graph/definition/Task";
import GraphRun from "./GraphRun";
import GraphNode from "../graph/execution/GraphNode";
import GraphRunStrategy from "../interfaces/GraphRunStrategy";
import { AnyObject } from "../types/global";
import GraphRoutine from "../graph/definition/GraphRoutine";
import SignalEmitter from "../interfaces/SignalEmitter";
import Cadenza from "../Cadenza";
import GraphRegistry from "../registry/GraphRegistry";
import GraphContext from "../graph/context/GraphContext";
import { formatTimestamp } from "../utils/tools";

export default class GraphRunner extends SignalEmitter {
  readonly id: string;
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
    this.id = uuid();
    this.isMeta = isMeta;
    this.strategy = Cadenza.runStrategy.PARALLEL;
    this.currentRun = new GraphRun(this.strategy);
  }

  init() {
    if (this.isMeta) return;

    Cadenza.createMetaTask(
      "Start run",
      this.startRun.bind(this),
      "Starts a run",
    ).doAfter(
      GraphRegistry.instance.getTaskByName,
      GraphRegistry.instance.getRoutineByName,
    );
  }

  /**
   * Adds tasks/routines to current run.
   * @param tasks Tasks/routines.
   * @param context Context (defaults {}).
   * @edge Flattens routines to tasks; generates routineExecId if not in context.
   * @edge Emits 'meta.runner.added_tasks' with metadata.
   * @edge Empty tasks warns no-op.
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
    let isMeta = _tasks.every((t) => t.isMeta);
    let routineId = null;

    const allTasks = _tasks.flatMap((t) => {
      if (t instanceof GraphRoutine) {
        routineName = t.name;
        isMeta = t.isMeta;
        routineId = t.id;
        const routineTasks: Task[] = [];
        t.forEachTask((task: Task) => routineTasks.push(task));
        return routineTasks;
      }
      return t;
    });

    const isSubMeta =
      allTasks.some((t) => t.isSubMeta) || !!context.__isSubMeta;
    context.__isSubMeta = isSubMeta;

    const ctx = new GraphContext(context || {});

    const routineExecId = context.__routineExecId ?? uuid();
    context.__routineExecId = routineExecId;

    if (!isSubMeta) {
      this.emitMetrics("meta.runner.added_tasks", {
        data: {
          uuid: routineExecId,
          name: routineName,
          isMeta,
          routineId,
          contractId:
            context.__metadata?.__contractId ?? context.__contractId ?? null,
          context: ctx.export(),
          previousRoutineExecution: context.__metadata?.__routineExecId ?? null, // TODO: There is a chance this is not added to the database yet...
          created: formatTimestamp(Date.now()),
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
   * Runs tasks/routines.
   * @param tasks Optional tasks/routines.
   * @param context Optional context.
   * @returns Current/last run (Promise if async).
   * @edge If running, returns current; else runs and resets.
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

  async runAsync(run: Promise<void>): Promise<GraphRun> {
    await run;
    return this.reset();
  }

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

  public setStrategy(strategy: GraphRunStrategy): void {
    this.strategy = strategy;
    if (!this.isRunning) {
      this.currentRun = new GraphRun(this.strategy);
    }
  }

  startRun(context: AnyObject): boolean {
    if (context.__task || context.__routine) {
      const routine = context.__task ?? context.__routine;
      this.run(routine, context);
      return true;
    } else {
      context.errored = true;
      context.__error = "No routine or task defined.";
      return false;
    }
  }
}
