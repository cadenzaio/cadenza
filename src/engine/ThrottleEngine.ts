import GraphNode from "../graph/execution/GraphNode";

type ProcessFunction = (node: GraphNode) => Promise<GraphNode[]> | GraphNode[];

export default class ThrottleEngine {
  private static instance_: ThrottleEngine;

  static get instance() {
    if (!this.instance_) {
      this.instance_ = new ThrottleEngine();
    }
    return this.instance_;
  }

  private queues: { [tag: string]: [ProcessFunction, GraphNode][] } = {};
  private runningCounts: { [tag: string]: number } = {};
  private maxConcurrencyPerTag: { [tag: string]: number } = {};

  private functionIdToPromiseResolve: {
    [functionInstanceId: string]: (value: GraphNode[]) => void;
  } = {};

  /**
   * Set a custom concurrency limit for a specific tag
   */
  setConcurrencyLimit(tag: string, limit: number) {
    console.log("setConcurrency", tag, limit);
    this.maxConcurrencyPerTag[tag] = limit;
  }

  throttle(
    fn: ProcessFunction,
    node: GraphNode,
    tag: string = "default",
  ): Promise<GraphNode[]> {
    const functionPromise = new Promise((resolve) => {
      this.functionIdToPromiseResolve[node.id] = resolve as (
        value: GraphNode[],
      ) => void;
    }) as Promise<GraphNode[]>;

    this.queues[tag] ??= [];
    this.queues[tag].push([fn, node]);

    console.log(node.lightExport().__task.__name, tag, this.queues[tag]);

    // Default to 1 if not set
    this.maxConcurrencyPerTag[tag] ??= 1;

    this.processQueue(tag);

    return functionPromise;
  }

  private processQueue(tag: string) {
    const maxAllowed = this.maxConcurrencyPerTag[tag];

    while (
      (this.queues[tag]?.length ?? 0) > 0 &&
      (this.runningCounts[tag] ?? 0) < maxAllowed
    ) {
      this.runningCounts[tag] = (this.runningCounts[tag] || 0) + 1;
      const item = this.queues[tag].shift()!;
      this.process(item).then(() => {
        this.runningCounts[tag]--;
        this.processQueue(tag); // Re-check queue
      });
    }

    // Clean up if done
    if (
      (this.queues[tag]?.length ?? 0) === 0 &&
      this.runningCounts[tag] === 0
    ) {
      delete this.queues[tag];
      delete this.runningCounts[tag];
    }
  }

  private async process(item: [ProcessFunction, GraphNode]) {
    const fn = item[0];
    const node = item[1];

    const context = await fn(node);

    this.functionIdToPromiseResolve[node.id](context);
    delete this.functionIdToPromiseResolve[node.id];
  }
}
