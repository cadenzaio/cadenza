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

export default class GraphNode extends SignalEmitter implements Graph {
  id: string;
  routineExecId: string;
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

  public isEqualTo(node: GraphNode) {
    return (
      this.sharesTaskWith(node) &&
      this.sharesContextWith(node) &&
      this.isPartOfSameGraph(node)
    );
  }

  public isPartOfSameGraph(node: GraphNode) {
    return this.routineExecId === node.routineExecId;
  }

  public sharesTaskWith(node: GraphNode) {
    return this.task.name === node.task.name;
  }

  public sharesContextWith(node: GraphNode) {
    return this.context.id === node.context.id;
  }

  public getLayerIndex() {
    return this.task.layerIndex;
  }

  public getConcurrency() {
    return this.task.concurrency;
  }

  public getTag() {
    return this.task.getTag(this.context);
  }

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

      const scheduledAt = Date.now();
      this.emitMetricsWithMetadata("meta.node.scheduled", {
        data: {
          uuid: this.id,
          routineExecutionId: this.routineExecId,
          executionTraceId:
            context.__executionTraceId ??
            context.__metadata?.__executionTraceId,
          context:
            this.previousNodes.length === 0
              ? this.context.id
              : this.context.export(),
          taskName: this.task.name,
          taskVersion: this.task.version,
          isMeta: this.isMeta(),
          isScheduled: true,
          splitGroupId: this.splitGroupId,
          created: formatTimestamp(scheduledAt),
        },
      });

      this.previousNodes.forEach((node) => {
        this.emitMetricsWithMetadata("meta.node.mapped", {
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
        });
      });

      if (
        context.__signalEmission?.consumed === false &&
        (!this.isMeta() || this.debug)
      ) {
        this.emitMetricsWithMetadata("meta.node.consumed_signal", {
          data: {
            signalName: context.__signalEmission.signalName,
            taskName: this.task.name,
            taskVersion: this.task.version,
            taskExecutionId: this.id,
            consumedAt: formatTimestamp(scheduledAt),
          },
        });

        context.__signalEmission.consumed = true;
        context.__signalEmission.consumedBy = this.id;
      }
    }
  }

  public start() {
    if (this.executionStart === 0) {
      this.executionStart = Date.now();
    }

    if (this.previousNodes.length === 0) {
      this.emitMetricsWithMetadata("meta.node.started_routine_execution", {
        data: {
          isRunning: true,
          started: formatTimestamp(this.executionStart),
        },
        filter: { uuid: this.routineExecId },
      });
    }

    if (
      (this.debug &&
        !this.task.isSubMeta &&
        !this.context.getMetadata().__isSubMeta) ||
      this.verbose
    ) {
      this.log();
    }

    this.emitMetricsWithMetadata("meta.node.started", {
      data: {
        isRunning: true,
        started: formatTimestamp(this.executionStart),
      },
      filter: { uuid: this.id },
    });

    return this.executionStart;
  }

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
          isRunning: false,
          errored: this.errored,
          failed: this.failed,
          errorMessage: context.__error,
        },
        filter: { uuid: this.id },
      });
    }

    this.emitMetricsWithMetadata("meta.node.ended", {
      data: {
        isRunning: false,
        isComplete: true,
        resultContext: this.context.export(),
        errored: this.errored,
        failed: this.failed,
        errorMessage: context.__error,
        progress: 1.0,
        ended: formatTimestamp(end),
      },
      filter: { uuid: this.id },
    });

    if (this.graphDone()) {
      const context = this.context.export();
      if (context.context.__isDeputy)
        this.emitWithMetadata(
          `meta.node.graph_completed:${this.routineExecId}`,
          context.context,
        );

      // TODO Reminder, Service registry should be listening to this event, (updateSelf)
      this.emitMetricsWithMetadata("meta.node.ended_routine_execution", {
        data: {
          isRunning: false,
          isComplete: true,
          resultContext: this.context.id,
          progress: 1.0,
          ended: formatTimestamp(end),
        },
        filter: { uuid: this.routineExecId },
      });
    }

    return end;
  }

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

  async executeAsync() {
    await this.workAsync();
    const nextNodes = this.postProcess();
    if (nextNodes instanceof Promise) {
      return nextNodes;
    }
    this.nextNodes = nextNodes;
    return this.nextNodes;
  }

  work(): TaskResult | Promise<TaskResult> {
    try {
      const result = this.task.execute(
        this.context,
        this.emitWithMetadata.bind(this),
        this.onProgress.bind(this),
      );

      if ((result as any).errored || (result as any).failed) {
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

  emitWithMetadata(signal: string, ctx: AnyObject) {
    const data = { ...ctx };
    if (!this.task.isHidden) {
      data.__signalEmission = {
        taskName: this.task.name,
        taskVersion: this.task.version,
        taskExecutionId: this.id,
      };
      const context = this.context.getMetadata();
      data.__metadata = {
        ...data.__metadata,
        __routineExecId: this.routineExecId,
        __executionTraceId:
          context.__metadata?.__executionTraceId ?? context.__executionTraceId,
      };
    }

    this.emit(signal, data);
  }

  emitMetricsWithMetadata(signal: string, ctx: AnyObject) {
    const data = { ...ctx };
    if (!this.task.isHidden) {
      data.__signalEmission = {
        taskName: this.task.name,
        taskVersion: this.task.version,
        taskExecutionId: this.id,
        isMetric: true,
      };
      const context = this.context.getMetadata();
      data.__metadata = {
        ...data.__metadata,
        __routineExecId: this.routineExecId,
        __executionTraceId:
          context.__metadata?.__executionTraceId ?? context.__executionTraceId,
      };
    }

    this.emitMetrics(signal, data);
  }

  onProgress(progress: number) {
    progress = Math.min(Math.max(0, progress), 1);

    this.emitMetricsWithMetadata("meta.node.progress", {
      data: {
        progress,
      },
      filter: {
        uuid: this.id,
      },
    });

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
    );
  }

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

  async postProcessAsync(nextNodes: Promise<GraphNode[]>) {
    this.nextNodes = await nextNodes;
    this.finalize();
    return this.nextNodes;
  }

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

  onError(error: unknown, errorData: AnyObject = {}) {
    this.result = {
      ...this.context.getFullContext(),
      __error: `Node error: ${error}`,
      __retries: this.retries,
      error: `Node error: ${error}`,
      returnedValue: this.result,
      ...errorData,
    };
    this.migrate(this.result);
    this.errored = true;
  }

  async retry(prevResult?: any): Promise<TaskResult> {
    if (this.retryCount === 0) {
      return prevResult;
    }

    await this.delayRetry();
    return this.work();
  }

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
    if (this.retryDelay > this.task.retryDelayMax) {
      this.retryDelay = this.task.retryDelayMax;
    }
  }

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

    if (this.errored) {
      newNodes.push(
        ...this.task.mapNext(
          (t: Task) =>
            this.clone()
              .split(uuid())
              .differentiate(t)
              .migrate({ ...(this.result as any) }),
          true,
        ),
      );
    }

    this.divided = true;
    this.migrate({
      ...this.context.getFullContext(),
      __nextNodes: newNodes.map((n) => n.id),
      __retries: this.retries,
    });

    return newNodes;
  }

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

  generateNewNodes(result: any) {
    const groupId = uuid();
    const newNodes = [];
    if (typeof result !== "boolean") {
      const failed =
        (result.failed !== undefined && result.failed) ||
        result.error !== undefined;
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
          return this.clone().split(groupId).differentiate(t).migrate(context);
        }, failed) as GraphNode[]),
      );

      this.failed = failed;
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

  migrate(ctx: any): GraphNode {
    this.context = new GraphContext(ctx);
    return this;
  }

  split(id: string): GraphNode {
    this.splitGroupId = id;
    return this;
  }

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

  public consume(node: GraphNode) {
    this.context = this.context.combine(node.context);
    this.previousNodes = this.previousNodes.concat(node.previousNodes);
    node.completeSubgraph();
    node.changeIdentity(this.id);
    node.destroy();
  }

  changeIdentity(id: string) {
    this.id = id;
  }

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

  completeGraph() {
    this.graphComplete = true;
    this.nextNodes.forEach((n) => n.completeGraph());
  }

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

  public getIterator() {
    return new GraphNodeIterator(this);
  }

  public mapNext(callback: (node: GraphNode) => any) {
    return this.nextNodes.map(callback);
  }

  public accept(visitor: GraphVisitor) {
    visitor.visitNode(this);
  }

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
    console.log(
      "Node EXECUTION:",
      this.task.name,
      JSON.stringify(this.context.getFullContext()),
    );
  }
}
