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
import Cadenza from "../../Cadenza";

export default class GraphNode extends SignalEmitter implements Graph {
  id: string;
  routineExecId: string;
  private task: Task;
  private context: GraphContext;
  private layer: GraphLayer | undefined;
  private divided: boolean = false;
  private splitGroupId: string = "";
  private processing: boolean = false;
  private subgraphComplete: boolean = false;
  private graphComplete: boolean = false;
  private result: TaskResult = false;
  private retryCount: number = 0;
  private retryDelay: number = 0;
  private retries: number = 0;
  private previousNodes: GraphNode[] = [];
  private nextNodes: GraphNode[] = [];
  private executionTime: number = 0;
  private executionStart: number = 0;
  private failed: boolean = false;
  private errored: boolean = false;
  destroyed: boolean = false;
  protected debug: boolean = false;

  constructor(
    task: Task,
    context: GraphContext,
    routineExecId: string,
    prevNodes: GraphNode[] = [],
    debug: boolean = false,
  ) {
    super(task.isMeta);
    this.id = uuid();
    this.task = task;
    this.context = context;
    this.retryCount = task.retryCount;
    this.retryDelay = task.retryDelay;
    this.previousNodes = prevNodes;
    this.routineExecId = routineExecId;
    this.splitGroupId = routineExecId;
    this.debug = debug;
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
    return this.task.id === node.task.id;
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
      this.emit("meta.node.scheduled", {
        ...this.lightExport(),
        __scheduled: Date.now(),
      });

      const context = this.context.getFullContext();

      if (
        context.__signalName !== undefined &&
        !context.__signalName.includes("meta.")
      ) {
        this.emit("meta.node.consumed_signal", {
          __signal_log: {
            signal_name: context.__signalName,
            log_type: "consume",
            consumed_by_task_id: this.task.id,
            task_execution_id: this.id,
            relation_type: "listener",
            metadata: {},
            is_meta: false,
          },
        });
      }
    }
  }

  public start() {
    if (this.executionStart === 0) {
      this.executionStart = Date.now();
    }

    const memento = this.lightExport();
    if (this.previousNodes.length === 0) {
      this.emit("meta.node.started_routine_execution", memento);
    }

    if (this.debug) {
      this.log();
    }

    this.emit("meta.node.started", memento);

    return this.executionStart;
  }

  public end() {
    if (this.executionStart === 0) {
      return 0;
    }

    this.processing = false;
    const end = Date.now();
    this.executionTime = end - this.executionStart;

    const memento = this.lightExport();
    if (this.errored || this.failed) {
      this.emit("meta.node.errored", memento);
    }

    this.emit("meta.node.ended", memento);

    if (this.graphDone()) {
      // TODO Reminder, Service registry should be listening to this event, (updateSelf)
      this.emit(
        `meta.node.ended_routine_execution:${this.routineExecId}`,
        memento,
      );
    }

    return end;
  }

  public execute() {
    if (!this.divided && !this.processing) {
      this.processing = true;

      const inputValidation = this.task.validateInput(
        this.isMeta() ? this.context.getMetaData() : this.context.getContext(),
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

      this.postProcess();
    }

    return this.nextNodes;
  }

  private async workAsync() {
    try {
      this.result = await this.result;
    } catch (e: unknown) {
      const result = await this.retryAsync(e);
      if (result === e) {
        this.onError(e);
      }
    }
  }

  private async executeAsync() {
    await this.workAsync();
    this.postProcess();
    return this.nextNodes;
  }

  private work(): TaskResult | Promise<TaskResult> {
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

  protected emitWithMetadata(signal: string, context: AnyObject) {
    this.emit(signal, {
      ...context,
      __emittedSignal: signal,
      __emittedByNode: this.id,
    });

    if (!signal.includes(".meta")) {
      this.emit("meta.node.emitted_signal", {
        __signal_log: {
          signal_name: signal,
          log_type: "emit",
          emitted_by_task_id: this.task.id,
          task_execution_id: this.id,
          relation_type: "emitter",
          metadata: {},
          is_meta: false,
        },
      });
    }
  }

  private onProgress(progress: number) {
    progress = Math.min(Math.max(0, progress), 1);

    this.emit(`meta.node.progress:${this.routineExecId}`, {
      __nodeId: this.id,
      __routineExecId: this.routineExecId,
      __progress: progress,
      __weight:
        this.task.progressWeight /
        (this.layer?.getNodesByRoutineExecId(this.routineExecId)?.length ?? 1),
    });
  }

  private postProcess() {
    if (typeof this.result === "string") {
      this.onError(
        `Returning strings is not allowed. Returned: ${this.result}`,
      );
    }

    if (Array.isArray(this.result)) {
      this.onError(`Returning arrays is not allowed. Returned: ${this.result}`);
    }

    this.nextNodes = this.divide();

    if (this.nextNodes.length === 0) {
      this.completeSubgraph();
    }

    if (this.errored || this.failed) {
      this.task.mapOnFailSignals((signal: string) =>
        this.emitWithMetadata(signal, this.context),
      );
    } else {
      this.task.mapSignals((signal: string) =>
        this.emitWithMetadata(signal, this.context),
      );
    }

    this.end();
  }

  private onError(error: unknown, errorData: AnyObject = {}) {
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

  private async retry(prevResult?: any): Promise<TaskResult> {
    if (this.retryCount === 0) {
      return prevResult;
    }

    await this.delayRetry();
    return this.work();
  }

  private async retryAsync(prevResult?: any): Promise<TaskResult> {
    if (this.retryCount === 0) {
      return prevResult;
    }

    await this.delayRetry();
    this.result = this.work();
    return this.workAsync();
  }

  private async delayRetry() {
    this.retryCount--;
    this.retries++;
    await sleep(this.retryDelay);
    this.retryDelay *= this.task.retryDelayFactor;
    if (this.retryDelay > this.task.retryDelayMax) {
      this.retryDelay = this.task.retryDelayMax;
    }
  }

  private divide(): GraphNode[] {
    const newNodes: GraphNode[] = [];

    if (
      (this.result as Generator)?.next &&
      typeof (this.result as Generator).next === "function"
    ) {
      const generator = this.result as Generator;
      let current = generator.next();
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
          ...this.context.getMetaData(),
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

  private generateNewNodes(result: any) {
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
                ...this.context.getMetaData(),
              }
            : { ...result, ...this.context.getMetaData() };
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
                ...this.context.getMetaData(),
              });
            }

            return newNode;
          }) as GraphNode[]),
        );
      }
    }

    return newNodes;
  }

  private differentiate(task: Task): GraphNode {
    this.task = task;
    return this;
  }

  private migrate(ctx: any): GraphNode {
    this.context = new GraphContext(ctx);
    return this;
  }

  private split(id: string): GraphNode {
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
    );
  }

  public consume(node: GraphNode) {
    this.context = this.context.combine(node.context);
    this.previousNodes = this.previousNodes.concat(node.previousNodes);
    node.completeSubgraph();
    node.changeIdentity(this.id);
    node.destroy();
  }

  private changeIdentity(id: string) {
    this.id = id;
  }

  private completeSubgraph() {
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

  private completeGraph() {
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
        __id: this.task.id,
        __name: this.task.name,
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
      "Node execution:",
      this.task.name,
      this.context.getFullContext(),
      this.routineExecId,
    );
  }
}
