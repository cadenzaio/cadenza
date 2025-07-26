import { v4 as uuid } from "uuid";
import GraphContext from "../context/GraphContext";
import GraphVisitor from "../../interfaces/GraphVisitor";
import TaskIterator from "../iterators/TaskIterator";
import Graph from "../../interfaces/Graph";
import { AnyObject } from "../../../types/global";
import SignalParticipant from "../../interfaces/SignalParticipant";

export type TaskFunction = (
  context: AnyObject,
  progressCallback: (progress: number) => void,
) => TaskResult;
export type TaskResult = boolean | object | Generator | Promise<any> | void;

export default class Task extends SignalParticipant implements Graph {
  id: string;
  readonly name: string;
  readonly description: string;
  concurrency: number;
  timeout: number;
  readonly isUnique: boolean = false;
  readonly throttled: boolean = false;
  readonly isSignal: boolean = false;
  readonly isMeta: boolean = false;
  readonly isDeputy: boolean = false;
  readonly isEphemeral: boolean = false;

  layerIndex: number = 0;
  progressWeight: number = 0;
  private nextTasks: Set<Task> = new Set();
  private onFailTasks: Set<Task> = new Set();
  private predecessorTasks: Set<Task> = new Set();
  destroyed: boolean = false;

  protected readonly taskFunction: TaskFunction;

  /**
   * Constructs a Task (static definition).
   * @param name Name.
   * @param task Function.
   * @param description Description.
   * @param concurrency Limit.
   * @param timeout ms.
   * @param register Register via signal (default true).
   * @edge Emits 'meta.task.created' with { __task: this } for seed.
   */
  constructor(
    name: string,
    task: TaskFunction,
    description: string = "",
    concurrency: number = 0,
    timeout: number = 0,
    register: boolean = true,
  ) {
    super();
    this.id = uuid();
    this.name = name;
    this.taskFunction = task.bind(this);
    this.description = description;
    this.concurrency = concurrency;
    this.timeout = timeout;

    if (register) {
      this.emit("meta.task.created", { __task: this });
    }
  }

  public getTag(context?: AnyObject): string {
    return this.id;
  }

  public setGlobalId(id: string): void {
    const oldId = this.id;
    this.id = id;
    this.emit("meta.task.global_id_set", { __id: this.id, __oldId: oldId });
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

  public execute(
    context: GraphContext,
    progressCallback: (progress: number) => void,
  ): TaskResult {
    return this.taskFunction(context.getClonedContext(), progressCallback);
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

    this.updateLayerFromPredecessors();
  }

  public doOnFail(...tasks: Task[]): this {
    for (const task of tasks) {
      if (this.onFailTasks.has(task)) continue;

      this.onFailTasks.add(task);
      task.predecessorTasks.add(this);
      task.updateLayerFromPredecessors();

      if (task.hasCycle()) {
        this.decouple(task);
        throw new Error(`Cycle adding onFail ${task.name} to ${this.name}`);
      }
    }

    return this;
  }

  private updateProgressWeights(): void {
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

  private getSubgraphLayers(): Map<number, Set<Task>> {
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

  private updateLayerFromPredecessors(): void {
    let maxPred = 0;
    this.predecessorTasks.forEach(
      (pred) => (maxPred = Math.max(maxPred, pred.layerIndex)),
    );
    this.layerIndex = maxPred + 1;

    const queue = Array.from(this.nextTasks);
    while (queue.length) {
      const next = queue.shift()!;
      next.updateLayerFromPredecessors();
      next.nextTasks.forEach((n) => queue.push(n));
    }
  }

  private hasCycle(): boolean {
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

  public destroy(): void {
    super.destroy();

    this.predecessorTasks.forEach((pred) => pred.nextTasks.delete(this));
    this.nextTasks.forEach((next) => next.predecessorTasks.delete(this));
    this.onFailTasks.forEach((fail) => fail.predecessorTasks.delete(this));

    this.nextTasks.clear();
    this.predecessorTasks.clear();
    this.onFailTasks.clear();

    this.destroyed = true;

    this.emit("meta.task.destroyed", { __id: this.id });
  }

  public export(): AnyObject {
    return {
      __id: this.id,
      __name: this.name,
      __description: this.description,
      __layerIndex: this.layerIndex,
      __isUnique: this.isUnique,
      __isMeta: this.isMeta,
      __isSignal: this.isSignal,
      __eventTriggers: this.observedSignals,
      __attachedEvents: this.signalsToEmit,
      __isDeputy: this.isDeputy,
      __throttled: this.throttled,
      __isEphemeral: this.isEphemeral,
      __concurrency: this.concurrency,
      __timeout: this.timeout,
      __functionString: this.taskFunction.toString(),
      __nextTasks: Array.from(this.nextTasks).map((t) => t.id),
      __onFailTasks: Array.from(this.onFailTasks).map((t) => t.id),
      __previousTasks: Array.from(this.predecessorTasks).map((t) => t.id),
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
